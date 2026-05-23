import type { FastifyInstance } from "fastify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { requireAuth } from "./auth.js";

const tableName = process.env.USERS_TABLE_NAME ?? "portfolio-users";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SyncUserBody = z.object({
  email: z.string().email(),
  name: z.string().trim().max(200).optional(),
});

export async function registerUsers(app: FastifyInstance) {
  app.post("/me", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = SyncUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const now = new Date().toISOString();
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { userId: req.userId! },
        UpdateExpression:
          "SET email = :e, #n = :n, updatedAt = :ua, createdAt = if_not_exists(createdAt, :ca)",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: {
          ":e": parsed.data.email,
          ":n": parsed.data.name ?? null,
          ":ua": now,
          ":ca": now,
        },
      }),
    );
    return reply.code(204).send();
  });
}
