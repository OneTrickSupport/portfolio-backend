// Storage for the planner. Routes talk to this interface, so tests can run against
// an in-memory store and production against DynamoDB.

export type DesignSummary = {
  designId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  thumb?: string;
  basedOn?: string;
};

/** A stored design. `state` is the plan as a JSON string (validated before it is stored). */
export type Design = DesignSummary & { state: string };

export type Comment = {
  commentId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
};

export interface PlannerStore {
  /** Newest first, without the plan itself. */
  listDesigns(limit: number): Promise<DesignSummary[]>;
  countByOwner(ownerId: string): Promise<number>;
  getDesign(designId: string): Promise<Design | null>;
  createDesign(design: Design): Promise<void>;
  /** Changes title/state/thumb. Returns the updated summary, or null if the design is gone or not owned by `ownerId`. */
  updateDesign(
    designId: string,
    ownerId: string,
    patch: { title?: string; state?: string; thumb?: string; updatedAt: string },
  ): Promise<DesignSummary | null>;
  /** Removes the design with its likes and comments. */
  deleteDesign(designId: string): Promise<void>;

  hasLiked(designId: string, userId: string): Promise<boolean>;
  /** Turns a like on or off. Returns false if nothing changed (already liked / not liked). */
  setLike(designId: string, userId: string, on: boolean, now: string): Promise<boolean>;

  listComments(designId: string): Promise<Comment[]>;
  addComment(designId: string, comment: Comment): Promise<void>;
  getComment(designId: string, commentId: string): Promise<Comment | null>;
  deleteComment(designId: string, commentId: string): Promise<boolean>;

  /** Display name saved when the user signed in, if any. */
  getUserName(userId: string): Promise<string | null>;
}

/** Simple store used by tests. */
export class MemoryPlannerStore implements PlannerStore {
  designs = new Map<string, Design>();
  likes = new Map<string, Set<string>>();
  comments = new Map<string, Comment[]>();
  names = new Map<string, string>();

  private summary({ state: _state, ...rest }: Design): DesignSummary {
    return rest;
  }
  async listDesigns(limit: number) {
    return [...this.designs.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((d) => this.summary(d));
  }
  async countByOwner(ownerId: string) {
    return [...this.designs.values()].filter((d) => d.ownerId === ownerId).length;
  }
  async getDesign(designId: string) {
    const d = this.designs.get(designId);
    return d ? { ...d } : null;
  }
  async createDesign(design: Design) {
    this.designs.set(design.designId, { ...design });
  }
  async updateDesign(
    designId: string,
    ownerId: string,
    patch: { title?: string; state?: string; thumb?: string; updatedAt: string },
  ) {
    const d = this.designs.get(designId);
    if (!d || d.ownerId !== ownerId) return null;
    if (patch.title !== undefined) d.title = patch.title;
    if (patch.state !== undefined) d.state = patch.state;
    if (patch.thumb !== undefined) d.thumb = patch.thumb;
    d.updatedAt = patch.updatedAt;
    return this.summary(d);
  }
  async deleteDesign(designId: string) {
    this.designs.delete(designId);
    this.likes.delete(designId);
    this.comments.delete(designId);
  }
  async hasLiked(designId: string, userId: string) {
    return this.likes.get(designId)?.has(userId) ?? false;
  }
  async setLike(designId: string, userId: string, on: boolean) {
    const d = this.designs.get(designId);
    if (!d) return false;
    const set = this.likes.get(designId) ?? new Set<string>();
    this.likes.set(designId, set);
    if (on === set.has(userId)) return false;
    if (on) set.add(userId);
    else set.delete(userId);
    d.likeCount = set.size;
    return true;
  }
  async listComments(designId: string) {
    return [...(this.comments.get(designId) ?? [])];
  }
  async addComment(designId: string, comment: Comment) {
    const list = this.comments.get(designId) ?? [];
    list.push(comment);
    this.comments.set(designId, list);
    const d = this.designs.get(designId);
    if (d) d.commentCount = list.length;
  }
  async getComment(designId: string, commentId: string) {
    return this.comments.get(designId)?.find((c) => c.commentId === commentId) ?? null;
  }
  async deleteComment(designId: string, commentId: string) {
    const list = this.comments.get(designId) ?? [];
    const next = list.filter((c) => c.commentId !== commentId);
    if (next.length === list.length) return false;
    this.comments.set(designId, next);
    const d = this.designs.get(designId);
    if (d) d.commentCount = next.length;
    return true;
  }
  async getUserName(userId: string) {
    return this.names.get(userId) ?? null;
  }
}
