import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildServer } from "../app.js";
import type { AuthHooks } from "../auth.js";
import { MAX_DESIGNS_PER_USER } from "./schema.js";
import { MemoryPlannerStore } from "./store.js";

// Test double for Cognito: the "x-user" header says who is signed in; "admin" is the moderator.
const fakeAuth: AuthHooks = {
  requireAuth: async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.headers["x-user"];
    if (typeof user !== "string") return reply.code(401).send({ error: "Missing Bearer token" });
    req.userId = user;
    req.isAdmin = user === "admin";
  },
  optionalAuth: async (req: FastifyRequest) => {
    const user = req.headers["x-user"];
    if (typeof user === "string") {
      req.userId = user;
      req.isAdmin = user === "admin";
    }
  },
};

const plan = () => ({
  v: 1,
  boa: 94,
  wallHeight: 320,
  wallColor: "#f4f2ec",
  walls: [
    { id: 1, ax: 0, ay: 0, bx: 500, by: 0, t: 20, kind: "outer" },
    { id: 2, ax: 500, ay: 0, bx: 500, by: 400, t: 20, kind: "outer" },
  ],
  openings: [{ id: 3, wall: 1, type: "window", pos: 200, w: 120, sill: 85, top: 235 }],
  items: [
    { id: 4, type: "sofa3", name: "Soffa 3-sits", x: 250, y: 200, rot: 0, w: 220, d: 95, h: 82, color: "#8d9a8a", price: "", link: "" },
  ],
  rooms: [{ id: 5, name: "Vardagsrum", x: 250, y: 200, floor: "fiskben" }],
  nextId: 6,
});

let app: FastifyInstance;
let store: MemoryPlannerStore;

beforeEach(async () => {
  process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  store = new MemoryPlannerStore();
  store.names.set("anna", "Anna");
  app = await buildServer({ planner: { store, auth: fakeAuth } });
});

afterEach(async () => {
  await app.close();
});

const call = (method: "GET" | "POST" | "DELETE", url: string, user?: string, payload?: unknown) =>
  app.inject({ method, url, headers: user ? { "x-user": user } : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });

async function create(user = "anna", title = "Mitt förslag") {
  const res = await call("POST", "/planner/designs", user, { title, state: plan() });
  expect(res.statusCode).toBe(201);
  return res.json().design.designId as string;
}

describe("planner: reading is public", () => {
  it("lists designs and opens one without signing in", async () => {
    const id = await create();
    const list = await call("GET", "/planner/designs");
    expect(list.statusCode).toBe(200);
    expect(list.json().designs).toHaveLength(1);
    expect(list.json().designs[0]).toMatchObject({ designId: id, title: "Mitt förslag", ownerName: "Anna", likeCount: 0 });
    expect(list.json().designs[0].state).toBeUndefined();

    const one = await call("GET", `/planner/designs/${id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json().design).toMatchObject({ designId: id, mine: false, likedByMe: false });
    expect(one.json().design.state.items[0].type).toBe("sofa3");

    expect((await call("GET", `/planner/designs/${id}/comments`)).json()).toEqual({ comments: [] });
  });

  it("answers 404 for unknown or malformed ids", async () => {
    expect((await call("GET", "/planner/designs/doesnotexist")).statusCode).toBe(404);
    expect((await call("GET", "/planner/designs/%3Cscript%3E")).statusCode).toBe(404);
  });
});

describe("planner: writing needs a signed-in user", () => {
  it("rejects anonymous save, like and comment", async () => {
    const id = await create();
    expect((await call("POST", "/planner/designs", undefined, { title: "x", state: plan() })).statusCode).toBe(401);
    expect((await call("POST", `/planner/designs/${id}`, undefined, { title: "x" })).statusCode).toBe(401);
    expect((await call("DELETE", `/planner/designs/${id}`)).statusCode).toBe(401);
    expect((await call("POST", `/planner/designs/${id}/like`)).statusCode).toBe(401);
    expect((await call("POST", `/planner/designs/${id}/comments`, undefined, { text: "hej" })).statusCode).toBe(401);
  });

  it("uses a neutral name when the user has none", async () => {
    const id = await create("nameless");
    expect((await call("GET", `/planner/designs/${id}`)).json().design.ownerName).toBe("Gäst");
  });

  it("lets only the owner change or delete a design", async () => {
    const id = await create("anna");
    expect((await call("POST", `/planner/designs/${id}`, "bertil", { title: "Kapat" })).statusCode).toBe(403);
    expect((await call("DELETE", `/planner/designs/${id}`, "bertil")).statusCode).toBe(403);

    const next = plan();
    next.items[0].x = 300;
    const upd = await call("POST", `/planner/designs/${id}`, "anna", { title: "Nytt namn", state: next });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().design.title).toBe("Nytt namn");
    const got = (await call("GET", `/planner/designs/${id}`, "anna")).json().design;
    expect(got.mine).toBe(true);
    expect(got.state.items[0].x).toBe(300);

    expect((await call("DELETE", `/planner/designs/${id}`, "anna")).statusCode).toBe(204);
    expect((await call("GET", `/planner/designs/${id}`)).statusCode).toBe(404);
  });

  it("caps how many designs one user can save", async () => {
    for (let i = 0; i < MAX_DESIGNS_PER_USER; i++) await create("anna", `Design ${i}`);
    expect((await call("POST", "/planner/designs", "anna", { title: "En till", state: plan() })).statusCode).toBe(409);
    expect((await call("POST", "/planner/designs", "bertil", { title: "Min", state: plan() })).statusCode).toBe(201);
  });
});

describe("planner: plans are validated before they are stored", () => {
  const bad = async (mutate: (p: ReturnType<typeof plan>) => void) => {
    const p = plan();
    mutate(p);
    return (await call("POST", "/planner/designs", "anna", { title: "x", state: p })).statusCode;
  };

  it("rejects markup in colours, types and ids", async () => {
    expect(await bad((p) => { p.items[0].color = '"><script>alert(1)</script>'; })).toBe(400);
    expect(await bad((p) => { p.wallColor = "red; background:url(x)"; })).toBe(400);
    expect(await bad((p) => { p.items[0].type = '<img src=x onerror=alert(1)>'; })).toBe(400);
    expect(await bad((p) => { (p.rooms[0] as { id: unknown }).id = '1" onload="alert(1)'; })).toBe(400);
    expect(await bad((p) => { (p.items[0] as { rot: unknown }).rot = "0) scale(99"; })).toBe(400);
    expect(await bad((p) => { p.items[0].price = '"><svg onload=alert(1)>'; })).toBe(400);
  });

  it("rejects links that are not http(s)", async () => {
    expect(await bad((p) => { p.items[0].link = "javascript:alert(1)"; })).toBe(400);
    expect(await bad((p) => { p.items[0].link = "https://example.com/soffa"; })).toBe(201);
  });

  it("drops unknown keys and rejects a missing title or oversized plan", async () => {
    const p = plan() as ReturnType<typeof plan> & { evil?: string };
    p.evil = "<script>";
    const res = await call("POST", "/planner/designs", "anna", { title: "ok", state: p });
    expect(res.statusCode).toBe(201);
    const stored = (await call("GET", `/planner/designs/${res.json().design.designId}`)).json().design.state;
    expect(stored.evil).toBeUndefined();

    expect((await call("POST", "/planner/designs", "anna", { title: "  ", state: plan() })).statusCode).toBe(400);
    expect(await bad((p2) => { p2.items = Array.from({ length: 801 }, (_, i) => ({ ...p2.items[0], id: 100 + i })); })).toBe(400);
  });

  it("accepts only plain image data as a preview", async () => {
    const send = (thumb: string) => call("POST", "/planner/designs", "anna", { title: "x", state: plan(), thumb });
    expect((await send("data:image/webp;base64,UklGRg==")).statusCode).toBe(201);
    expect((await send("data:image/svg+xml;base64,PHN2Zz4=")).statusCode).toBe(400);
    expect((await send("https://example.com/x.png")).statusCode).toBe(400);
  });
});

describe("planner: likes", () => {
  it("counts each user once and can be undone", async () => {
    const id = await create("anna");
    expect((await call("POST", `/planner/designs/${id}/like`, "bertil")).json()).toEqual({ liked: true, likeCount: 1 });
    expect((await call("POST", `/planner/designs/${id}/like`, "bertil")).json()).toEqual({ liked: true, likeCount: 1 });
    expect((await call("POST", `/planner/designs/${id}/like`, "cecilia")).json()).toEqual({ liked: true, likeCount: 2 });

    const asBertil = (await call("GET", `/planner/designs/${id}`, "bertil")).json().design;
    expect(asBertil).toMatchObject({ likedByMe: true, likeCount: 2 });
    expect((await call("GET", `/planner/designs/${id}`)).json().design.likedByMe).toBe(false);

    expect((await call("DELETE", `/planner/designs/${id}/like`, "bertil")).json()).toEqual({ liked: false, likeCount: 1 });
    expect((await call("DELETE", `/planner/designs/${id}/like`, "bertil")).json()).toEqual({ liked: false, likeCount: 1 });
    expect((await call("GET", "/planner/designs")).json().designs[0].likeCount).toBe(1);
  });
});

describe("planner: comments", () => {
  it("adds, lists and deletes with the right permissions", async () => {
    const id = await create("anna");
    const c1 = await call("POST", `/planner/designs/${id}/comments`, "bertil", { text: "  Snygg soffa!  " });
    expect(c1.statusCode).toBe(201);
    expect(c1.json().comment).toMatchObject({ userId: "bertil", userName: "Gäst", text: "Snygg soffa!" });
    const c2 = (await call("POST", `/planner/designs/${id}/comments`, "anna", { text: "Tack" })).json().comment;

    const list = (await call("GET", `/planner/designs/${id}/comments`)).json().comments;
    expect(list.map((c: { text: string }) => c.text)).toEqual(["Snygg soffa!", "Tack"]);
    expect((await call("GET", "/planner/designs")).json().designs[0].commentCount).toBe(2);

    expect((await call("POST", `/planner/designs/${id}/comments`, "bertil", { text: "" })).statusCode).toBe(400);
    expect((await call("POST", `/planner/designs/${id}/comments`, "bertil", { text: "x".repeat(501) })).statusCode).toBe(400);

    // cecilia wrote neither comment and does not own the design
    expect((await call("DELETE", `/planner/designs/${id}/comments/${c2.commentId}`, "cecilia")).statusCode).toBe(403);
    // the author removes their own; the design owner may remove someone else's
    expect((await call("DELETE", `/planner/designs/${id}/comments/${c2.commentId}`, "anna")).statusCode).toBe(204);
    expect((await call("DELETE", `/planner/designs/${id}/comments/${c1.json().comment.commentId}`, "anna")).statusCode).toBe(204);
    expect((await call("GET", `/planner/designs/${id}/comments`)).json().comments).toEqual([]);
    expect((await call("DELETE", `/planner/designs/${id}/comments/${c2.commentId}`, "anna")).statusCode).toBe(404);
  });
});

describe("planner: moderators", () => {
  it("tells the page who may moderate", async () => {
    const id = await create("anna");
    expect((await call("GET", `/planner/designs/${id}`, "admin")).json().design).toMatchObject({ canModerate: true, mine: false });
    expect((await call("GET", `/planner/designs/${id}`, "anna")).json().design).toMatchObject({ canModerate: false, mine: true });
    expect((await call("GET", `/planner/designs/${id}`)).json().design.canModerate).toBe(false);
  });

  it("can delete anyone's comment and design, but not edit them", async () => {
    const id = await create("anna");
    const c = (await call("POST", `/planner/designs/${id}/comments`, "bertil", { text: "Olämpligt" })).json().comment;

    // an ordinary third user can do neither
    expect((await call("DELETE", `/planner/designs/${id}/comments/${c.commentId}`, "cecilia")).statusCode).toBe(403);
    expect((await call("DELETE", `/planner/designs/${id}`, "cecilia")).statusCode).toBe(403);

    expect((await call("DELETE", `/planner/designs/${id}/comments/${c.commentId}`, "admin")).statusCode).toBe(204);
    expect((await call("GET", `/planner/designs/${id}/comments`)).json().comments).toEqual([]);

    // moderating is deleting only: the plan and title still belong to the owner
    expect((await call("POST", `/planner/designs/${id}`, "admin", { title: "Ändrad av admin" })).statusCode).toBe(403);

    expect((await call("DELETE", `/planner/designs/${id}`, "admin")).statusCode).toBe(204);
    expect((await call("GET", `/planner/designs/${id}`)).statusCode).toBe(404);
  });
});
