import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { cognitoAuth, type AuthHooks } from "../auth.js";
import { DynamoPlannerStore } from "./dynamo-store.js";
import {
  CommentBody,
  CreateDesignBody,
  MAX_DESIGNS_PER_USER,
  MAX_STATE_BYTES,
  UpdateDesignBody,
} from "./schema.js";
import type { Comment, Design, PlannerStore } from "./store.js";

// Apartment planner API.
//   Anyone can list designs, open one and read its comments.
//   Signed-in users can save designs (their own), like and comment.
//   Moderators (Cognito group "admin") can also delete any design or comment.

export type PlannerOptions = {
  store?: PlannerStore;
  auth?: AuthHooks;
};

const ID = /^[A-Za-z0-9_-]{6,40}$/;
const newId = (bytes = 9) => randomBytes(bytes).toString("base64url");
// Sorts by time: fixed-width base36 timestamp, then a random tail.
const newCommentId = () => `${Date.now().toString(36).padStart(9, "0")}-${newId(4)}`;

type IdParams = { Params: { id: string } };

export async function registerPlanner(app: FastifyInstance, opts: PlannerOptions) {
  const store = opts.store ?? new DynamoPlannerStore();
  const { requireAuth, optionalAuth } = opts.auth ?? cognitoAuth;

  const invalid = (req: FastifyRequest, reply: FastifyReply, details: unknown) => {
    req.log.warn({ userId: req.userId, details }, "invalid planner request");
    return reply.code(400).send({ error: "Invalid body", details });
  };
  /** Loads the design in the URL, or answers 404 and returns null. */
  const load = async (req: FastifyRequest<IdParams>, reply: FastifyReply): Promise<Design | null> => {
    const design = ID.test(req.params.id) ? await store.getDesign(req.params.id) : null;
    if (!design) await reply.code(404).send({ error: "Design not found" });
    return design;
  };
  const displayName = async (userId: string) => (await store.getUserName(userId)) ?? "Gäst";

  // ---- designs ----
  app.get("/planner/designs", async (req) => {
    const designs = await store.listDesigns(60);
    req.log.info({ count: designs.length }, "planner designs listed");
    return { designs };
  });

  app.get<IdParams>("/planner/designs/:id", { preHandler: optionalAuth }, async (req, reply) => {
    const design = await load(req, reply);
    if (!design) return;
    const { state, ...summary } = design;
    return {
      design: {
        ...summary,
        state: JSON.parse(state) as unknown,
        mine: !!req.userId && req.userId === design.ownerId,
        canModerate: !!req.isAdmin,
        likedByMe: req.userId ? await store.hasLiked(design.designId, req.userId) : false,
      },
    };
  });

  app.post("/planner/designs", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CreateDesignBody.safeParse(req.body);
    if (!parsed.success) return invalid(req, reply, parsed.error.flatten());
    const state = JSON.stringify(parsed.data.state);
    if (state.length > MAX_STATE_BYTES) return reply.code(413).send({ error: "Plan is too large" });
    const userId = req.userId!;
    if ((await store.countByOwner(userId)) >= MAX_DESIGNS_PER_USER) {
      return reply.code(409).send({ error: `You can save at most ${MAX_DESIGNS_PER_USER} designs` });
    }
    const now = new Date().toISOString();
    const design: Design = {
      designId: newId(),
      title: parsed.data.title,
      ownerId: userId,
      ownerName: await displayName(userId),
      createdAt: now,
      updatedAt: now,
      likeCount: 0,
      commentCount: 0,
      state,
      ...(parsed.data.thumb ? { thumb: parsed.data.thumb } : {}),
      ...(parsed.data.basedOn ? { basedOn: parsed.data.basedOn } : {}),
    };
    await store.createDesign(design);
    req.log.info({ userId, designId: design.designId }, "planner design created");
    const { state: _state, ...summary } = design;
    return reply.code(201).send({ design: summary });
  });

  // POST rather than PUT: the API gateway's CORS rules only allow GET, POST and DELETE.
  app.post<IdParams>("/planner/designs/:id", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = UpdateDesignBody.safeParse(req.body);
    if (!parsed.success) return invalid(req, reply, parsed.error.flatten());
    const design = await load(req, reply);
    if (!design) return;
    if (design.ownerId !== req.userId) return reply.code(403).send({ error: "Only the owner can change this design" });
    const state = parsed.data.state ? JSON.stringify(parsed.data.state) : undefined;
    if (state && state.length > MAX_STATE_BYTES) return reply.code(413).send({ error: "Plan is too large" });
    const updated = await store.updateDesign(design.designId, req.userId!, {
      title: parsed.data.title,
      state,
      thumb: parsed.data.thumb,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) return reply.code(404).send({ error: "Design not found" });
    req.log.info({ userId: req.userId, designId: design.designId }, "planner design updated");
    return { design: updated };
  });

  app.delete<IdParams>("/planner/designs/:id", { preHandler: requireAuth }, async (req, reply) => {
    const design = await load(req, reply);
    if (!design) return;
    if (design.ownerId !== req.userId && !req.isAdmin) {
      return reply.code(403).send({ error: "Only the owner can delete this design" });
    }
    await store.deleteDesign(design.designId);
    req.log.info(
      { userId: req.userId, designId: design.designId, ownerId: design.ownerId, asModerator: design.ownerId !== req.userId },
      "planner design deleted",
    );
    return reply.code(204).send();
  });

  // ---- likes ----
  const like = (on: boolean) => async (req: FastifyRequest<IdParams>, reply: FastifyReply) => {
    const design = await load(req, reply);
    if (!design) return;
    const changed = await store.setLike(design.designId, req.userId!, on, new Date().toISOString());
    req.log.info({ userId: req.userId, designId: design.designId, on, changed }, "planner like set");
    const likeCount = Math.max(0, design.likeCount + (changed ? (on ? 1 : -1) : 0));
    return { liked: on, likeCount };
  };
  app.post<IdParams>("/planner/designs/:id/like", { preHandler: requireAuth }, like(true));
  app.delete<IdParams>("/planner/designs/:id/like", { preHandler: requireAuth }, like(false));

  // ---- comments ----
  app.get<IdParams>("/planner/designs/:id/comments", async (req, reply) => {
    const design = await load(req, reply);
    if (!design) return;
    return { comments: await store.listComments(design.designId) };
  });

  app.post<IdParams>("/planner/designs/:id/comments", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CommentBody.safeParse(req.body);
    if (!parsed.success) return invalid(req, reply, parsed.error.flatten());
    const design = await load(req, reply);
    if (!design) return;
    if (design.commentCount >= 300) return reply.code(409).send({ error: "This design has too many comments" });
    const comment: Comment = {
      commentId: newCommentId(),
      userId: req.userId!,
      userName: await displayName(req.userId!),
      text: parsed.data.text,
      createdAt: new Date().toISOString(),
    };
    await store.addComment(design.designId, comment);
    req.log.info({ userId: req.userId, designId: design.designId }, "planner comment added");
    return reply.code(201).send({ comment });
  });

  app.delete<{ Params: { id: string; commentId: string } }>(
    "/planner/designs/:id/comments/:commentId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const design = await load(req, reply);
      if (!design) return;
      const comment = /^[a-z0-9]{9}-[A-Za-z0-9_-]{4,12}$/.test(req.params.commentId)
        ? await store.getComment(design.designId, req.params.commentId)
        : null;
      if (!comment) return reply.code(404).send({ error: "Comment not found" });
      // The author can remove their own comment; the design's owner can remove any on their design;
      // a moderator can remove any comment.
      if (comment.userId !== req.userId && design.ownerId !== req.userId && !req.isAdmin) {
        return reply.code(403).send({ error: "You cannot delete this comment" });
      }
      await store.deleteComment(design.designId, comment.commentId);
      req.log.info(
        { userId: req.userId, designId: design.designId, authorId: comment.userId, asModerator: !!req.isAdmin && comment.userId !== req.userId && design.ownerId !== req.userId },
        "planner comment deleted",
      );
      return reply.code(204).send();
    },
  );
}
