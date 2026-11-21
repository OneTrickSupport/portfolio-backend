import { z } from "zod";

// Validation for the apartment planner ("Möblera").
//
// A saved plan is rendered by other visitors' browsers, so every field is checked
// strictly here: numbers must be numbers, colours must be hex colours and links must
// be http(s). Unknown keys are dropped. The frontend sanitises again when it loads a plan.

const num = z.number().finite();
const coord = num.min(-100_000).max(100_000);
const id = z.number().int().min(0).max(1_000_000_000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Wall = z.object({
  id,
  ax: coord,
  ay: coord,
  bx: coord,
  by: coord,
  t: num.min(0).max(300),
  kind: z.enum(["outer", "inner", "virtual"]),
});

const Opening = z.object({
  id,
  wall: id,
  type: z.enum(["window", "door", "opening"]),
  pos: coord,
  w: num.min(1).max(3000),
  sill: num.min(0).max(1000).optional(),
  top: num.min(0).max(1000).optional(),
  hinge: z.union([z.literal(0), z.literal(1)]).optional(),
  side: z.union([z.literal(1), z.literal(-1)]).optional(),
});

const Item = z.object({
  id,
  type: z.string().regex(/^[A-Za-z0-9_]{1,40}$/),
  name: z.string().max(80),
  x: coord,
  y: coord,
  rot: num.min(-3600).max(3600),
  w: num.min(0.1).max(3000),
  d: num.min(0.1).max(3000),
  h: num.min(0.1).max(3000),
  color,
  price: z
    .union([z.number().finite().min(0).max(100_000_000), z.string().regex(/^[0-9 .,]{0,14}$/)])
    .optional(),
  link: z
    .string()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/[^\s"'<>]+$/i.test(v), "link must be http(s)")
    .optional(),
  elev: num.min(0).max(1000).optional(),
  inch: num.min(10).max(200).optional(),
  mirror: z.boolean().optional(),
  locked: z.boolean().optional(),
  corner: z.boolean().optional(),
});

const Room = z.object({
  id,
  name: z.string().max(60),
  x: coord,
  y: coord,
  floor: z.string().regex(/^[a-z]{1,20}$/),
});

export const PlanState = z.object({
  v: z.literal(1),
  boa: num.min(0).max(100_000).optional(),
  wallHeight: num.min(150).max(600),
  wallColor: color,
  walls: z.array(Wall).max(400),
  openings: z.array(Opening).max(300),
  items: z.array(Item).max(800),
  rooms: z.array(Room).max(80),
  image: z.object({ x: coord, y: coord, w: coord, h: coord }).optional(),
  nextId: id,
  islandKitchen: z.boolean().optional(),
  cornerRoom: z.boolean().optional(),
  ceil320: z.boolean().optional(),
});
export type PlanState = z.infer<typeof PlanState>;

export const MAX_STATE_BYTES = 300_000;
export const MAX_THUMB_CHARS = 90_000;
export const MAX_DESIGNS_PER_USER = 40;

const title = z.string().trim().min(1).max(80);
// A small preview image drawn by the planner itself; only plain base64 image data is accepted.
const thumb = z
  .string()
  .max(MAX_THUMB_CHARS)
  .regex(/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/);

export const CreateDesignBody = z.object({
  title,
  state: PlanState,
  thumb: thumb.optional(),
  basedOn: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/).optional(),
});

export const UpdateDesignBody = z.object({
  title: title.optional(),
  state: PlanState.optional(),
  thumb: thumb.optional(),
});

export const CommentBody = z.object({
  text: z.string().trim().min(1).max(500),
});
