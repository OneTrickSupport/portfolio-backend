import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";

beforeEach(() => {
  process.env.ITEMS_TABLE_NAME = "test-items";
  process.env.COGNITO_USER_POOL_ID = "eu-north-1_test";
  process.env.COGNITO_CLIENT_ID = "test-client";
  process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  process.env.AWS_REGION = "eu-north-1";
});

describe("API", () => {
  it("GET /health returns ok", async () => {
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
    await app.close();
  });

  it("GET /items without auth returns 401", async () => {
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/items" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("POST /items without auth returns 401", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/items",
      payload: { content: "hi" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("DELETE /items/:id without auth returns 401", async () => {
    const app = await buildServer();
    const res = await app.inject({ method: "DELETE", url: "/items/abc" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
