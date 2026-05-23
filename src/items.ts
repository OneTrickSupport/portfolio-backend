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
    let result;
    try {
      result = await ddb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "userId = :u",
          ExpressionAttributeValues: { ":u": req.userId },
          ScanIndexForward: false,
        }),
      );
    } catch (err) {
      req.log.error({ err, userId: req.userId }, "DynamoDB error listing items");
      throw err;
    }
    const items = result.Items ?? [];
    req.log.info({ userId: req.userId, count: items.length }, "items listed");
    return { items };
  });

  app.post("/items", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CreateItemBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ userId: req.userId, errors: parsed.error.flatten() }, "invalid create item body");
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
    try {
      await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
    } catch (err) {
      req.log.error({ err, userId: req.userId }, "DynamoDB error creating item");
      throw err;
    }
    req.log.info({ userId: req.userId, itemId: item.itemId }, "item created");
    return reply.code(201).send(item);
  });

  app.delete<{ Params: { id: string } }>(
    "/items/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        await ddb.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { userId: req.userId!, itemId: req.params.id },
          }),
        );
      } catch (err) {
        req.log.error({ err, userId: req.userId, itemId: req.params.id }, "DynamoDB error deleting item");
        throw err;
      }
      req.log.info({ userId: req.userId, itemId: req.params.id }, "item deleted");
      return reply.code(204).send();
    },
  );
}
