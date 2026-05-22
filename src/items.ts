import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { requireAuth } from "./auth.js";

const tableName = process.env.ITEMS_TABLE_NAME ?? "portfolio-items";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CreateItemBody = z.object({
  content: z.string().trim().min(1).max(500),
});

export async function registerItems(app: FastifyInstance) {
  app.get("/items", { preHandler: requireAuth }, async (req) => {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": req.userId },
        ScanIndexForward: false,
      }),
    );
    return { items: result.Items ?? [] };
  });

  app.post("/items", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CreateItemBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const item = {
      userId: req.userId!,
      itemId: randomUUID(),
      content: parsed.data.content,
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
    return reply.code(201).send(item);
  });

  app.delete<{ Params: { id: string } }>(
    "/items/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      await ddb.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { userId: req.userId!, itemId: req.params.id },
        }),
      );
      return reply.code(204).send();
    },
  );
}
