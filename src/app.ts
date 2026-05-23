import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerHealth } from "./health.js";
import { registerItems } from "./items.js";
import { registerUsers } from "./users.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });

  await app.register(registerHealth);
  await app.register(registerItems);
  await app.register(registerUsers);

  return app;
}
