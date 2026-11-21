import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerHealth } from "./health.js";
import { registerItems } from "./items.js";
import { registerUsers } from "./users.js";
import { registerGithub } from "./github.js";
import { registerPlanner, type PlannerOptions } from "./planner/routes.js";

export async function buildServer(opts: { planner?: PlannerOptions } = {}) {
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
    // Same methods as the API gateway's CORS rules (infra/terraform/modules/backend). Without
    // this the local server only allows GET/HEAD/POST and the browser blocks DELETE requests.
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  await app.register(registerHealth);
  await app.register(registerItems);
  await app.register(registerUsers);
  await app.register(registerGithub);
  await app.register(registerPlanner, opts.planner ?? {});

  return app;
}
