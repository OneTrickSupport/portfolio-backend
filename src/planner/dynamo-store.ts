import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Comment, Design, DesignSummary, PlannerStore } from "./store.js";

// One table holds everything for a design under the same partition key:
//   pk = D#<designId>, sk = META          the design (title, owner, plan, counters)
//   pk = D#<designId>, sk = L#<userId>    one like
//   pk = D#<designId>, sk = C#<commentId> one comment (ids sort by time)
// The index gsi1 (gsi1pk = "DESIGNS", gsi1sk = updatedAt) lists all designs, newest first,
// without loading the plans.

const ALL = "DESIGNS";
const pk = (designId: string) => `D#${designId}`;
const isCancelled = (err: unknown) =>
  err instanceof Error &&
  (err.name === "TransactionCanceledException" || err.name === "ConditionalCheckFailedException");

function toSummary(item: Record<string, unknown>): DesignSummary {
  return {
    designId: item.designId as string,
    title: item.title as string,
    ownerId: item.ownerId as string,
    ownerName: item.ownerName as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    likeCount: Math.max(0, Number(item.likeCount ?? 0)),
    commentCount: Math.max(0, Number(item.commentCount ?? 0)),
    ...(item.thumb ? { thumb: item.thumb as string } : {}),
    ...(item.basedOn ? { basedOn: item.basedOn as string } : {}),
  };
}

export class DynamoPlannerStore implements PlannerStore {
  private ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  constructor(
    private table = process.env.PLANNER_TABLE_NAME ?? "portfolio-planner",
    private usersTable = process.env.USERS_TABLE_NAME ?? "portfolio-users",
  ) {}

  async listDesigns(limit: number) {
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :all",
        ExpressionAttributeValues: { ":all": ALL },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map(toSummary);
  }

  async countByOwner(ownerId: string) {
    let count = 0;
    let start: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :all",
          FilterExpression: "ownerId = :o",
          ExpressionAttributeValues: { ":all": ALL, ":o": ownerId },
          Select: "COUNT",
          ExclusiveStartKey: start,
        }),
      );
      count += res.Count ?? 0;
      start = res.LastEvaluatedKey;
    } while (start);
    return count;
  }

  async getDesign(designId: string) {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.table, Key: { pk: pk(designId), sk: "META" } }),
    );
    if (!res.Item) return null;
    return { ...toSummary(res.Item), state: res.Item.state as string } satisfies Design;
  }

  async createDesign(design: Design) {
    await this.ddb.send(
      new PutCommand({
        TableName: this.table,
        Item: { pk: pk(design.designId), sk: "META", gsi1pk: ALL, gsi1sk: design.updatedAt, ...design },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  async updateDesign(
    designId: string,
    ownerId: string,
    patch: { title?: string; state?: string; thumb?: string; updatedAt: string },
  ) {
    const sets = ["updatedAt = :u", "gsi1sk = :u"];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ":u": patch.updatedAt, ":o": ownerId };
    if (patch.title !== undefined) { sets.push("title = :t"); values[":t"] = patch.title; }
    if (patch.state !== undefined) { sets.push("#s = :s"); names["#s"] = "state"; values[":s"] = patch.state; }
    if (patch.thumb !== undefined) { sets.push("thumb = :th"); values[":th"] = patch.thumb; }
    try {
      const res = await this.ddb.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: pk(designId), sk: "META" },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ConditionExpression: "ownerId = :o",
          ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
          ExpressionAttributeValues: values,
          ReturnValues: "ALL_NEW",
        }),
      );
      return res.Attributes ? toSummary(res.Attributes) : null;
    } catch (err) {
      if (isCancelled(err)) return null;
      throw err;
    }
  }

  async deleteDesign(designId: string) {
    let start: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "pk = :p",
          ExpressionAttributeValues: { ":p": pk(designId) },
          ProjectionExpression: "pk, sk",
          ExclusiveStartKey: start,
        }),
      );
      for (const item of res.Items ?? []) {
        await this.ddb.send(new DeleteCommand({ TableName: this.table, Key: { pk: item.pk, sk: item.sk } }));
      }
      start = res.LastEvaluatedKey;
    } while (start);
  }

  async hasLiked(designId: string, userId: string) {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.table, Key: { pk: pk(designId), sk: `L#${userId}` }, ProjectionExpression: "pk" }),
    );
    return !!res.Item;
  }

  /** The like row and the counter change together, so the count cannot drift. */
  async setLike(designId: string, userId: string, on: boolean, now: string) {
    const key = { pk: pk(designId), sk: `L#${userId}` };
    const counter = {
      Update: {
        TableName: this.table,
        Key: { pk: pk(designId), sk: "META" },
        UpdateExpression: "ADD likeCount :d",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeValues: { ":d": on ? 1 : -1 },
      },
    };
    try {
      await this.ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            on
              ? { Put: { TableName: this.table, Item: { ...key, userId, createdAt: now }, ConditionExpression: "attribute_not_exists(pk)" } }
              : { Delete: { TableName: this.table, Key: key, ConditionExpression: "attribute_exists(pk)" } },
            counter,
          ],
        }),
      );
      return true;
    } catch (err) {
      if (isCancelled(err)) return false;
      throw err;
    }
  }

  async listComments(designId: string) {
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "pk = :p AND begins_with(sk, :c)",
        ExpressionAttributeValues: { ":p": pk(designId), ":c": "C#" },
        Limit: 300,
      }),
    );
    return (res.Items ?? []).map((i) => ({
      commentId: i.commentId as string,
      userId: i.userId as string,
      userName: i.userName as string,
      text: i.text as string,
      createdAt: i.createdAt as string,
    }));
  }

  async addComment(designId: string, comment: Comment) {
    await this.ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.table, Item: { pk: pk(designId), sk: `C#${comment.commentId}`, ...comment } } },
          {
            Update: {
              TableName: this.table,
              Key: { pk: pk(designId), sk: "META" },
              UpdateExpression: "ADD commentCount :d",
              ConditionExpression: "attribute_exists(pk)",
              ExpressionAttributeValues: { ":d": 1 },
            },
          },
        ],
      }),
    );
  }

  async getComment(designId: string, commentId: string) {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.table, Key: { pk: pk(designId), sk: `C#${commentId}` } }),
    );
    const i = res.Item;
    if (!i) return null;
    return {
      commentId: i.commentId as string,
      userId: i.userId as string,
      userName: i.userName as string,
      text: i.text as string,
      createdAt: i.createdAt as string,
    };
  }

  async deleteComment(designId: string, commentId: string) {
    try {
      await this.ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            { Delete: { TableName: this.table, Key: { pk: pk(designId), sk: `C#${commentId}` }, ConditionExpression: "attribute_exists(pk)" } },
            {
              Update: {
                TableName: this.table,
                Key: { pk: pk(designId), sk: "META" },
                UpdateExpression: "ADD commentCount :d",
                ConditionExpression: "attribute_exists(pk)",
                ExpressionAttributeValues: { ":d": -1 },
              },
            },
          ],
        }),
      );
      return true;
    } catch (err) {
      if (isCancelled(err)) return false;
      throw err;
    }
  }

  async getUserName(userId: string) {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.usersTable, Key: { userId }, ProjectionExpression: "#n", ExpressionAttributeNames: { "#n": "name" } }),
    );
    const name = res.Item?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }
}
