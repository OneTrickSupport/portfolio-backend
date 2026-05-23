import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";

vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: vi.fn().mockResolvedValue({ sub: "test-user-id" }),
    }),
  },
}));

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>();
  return {
    ...mod,
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  };
});

beforeEach(() => {
  process.env.USERS_TABLE_NAME = "test-users";
  process.env.COGNITO_USER_POOL_ID = "eu-north-1_test";
  process.env.COGNITO_CLIENT_ID = "test-client";
  process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  process.env.AWS_REGION = "eu-north-1";
  mockSend.mockClear();
});

describe("POST /me", () => {
  it("without auth returns 401", async () => {
    const app = await buildServer();
    const res = await app.inject({ method: "POST", url: "/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("with invalid email returns 400", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/me",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("with missing email returns 400", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/me",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("with valid body returns 204 and upserts user", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/me",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "user@example.com", name: "Test User" },
    });
    expect(res.statusCode).toBe(204);
    expect(mockSend).toHaveBeenCalledOnce();
    const [command] = mockSend.mock.calls[0];
    expect(command.input.Key).toEqual({ userId: "test-user-id" });
    expect(command.input.ExpressionAttributeValues[":e"]).toBe(
      "user@example.com",
    );
    expect(command.input.ExpressionAttributeValues[":n"]).toBe("Test User");
    await app.close();
  });

  it("with valid email and no name returns 204", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/me",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "user@example.com" },
    });
    expect(res.statusCode).toBe(204);
    expect(mockSend).toHaveBeenCalledOnce();
    await app.close();
  });
});
