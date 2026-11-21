import { beforeAll, describe, expect, it } from "vitest";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoPlannerStore } from "./dynamo-store.js";
import type { Design } from "./store.js";

// Runs against DynamoDB Local (npm run db:start) and is skipped everywhere else:
//   AWS_ENDPOINT_URL=http://localhost:8000 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-north-1 npm test
const local = !!process.env.AWS_ENDPOINT_URL;
const TABLE = "test-planner";
const USERS = "test-planner-users";

const design = (designId: string, ownerId: string, updatedAt: string): Design => ({
  designId,
  title: `Design ${designId}`,
  ownerId,
  ownerName: "Anna",
  createdAt: updatedAt,
  updatedAt,
  likeCount: 0,
  commentCount: 0,
  state: JSON.stringify({ v: 1, items: [] }),
  thumb: "data:image/webp;base64,AAAA",
});

describe.skipIf(!local)("DynamoPlannerStore against DynamoDB Local", () => {
  let store: DynamoPlannerStore;

  beforeAll(async () => {
    const client = new DynamoDBClient({});
    for (const name of [TABLE, USERS]) await client.send(new DeleteTableCommand({ TableName: name })).catch(() => undefined);
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: ["pk", "sk", "gsi1pk", "gsi1sk"].map((n) => ({ AttributeName: n, AttributeType: "S" as const })),
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "gsi1",
            KeySchema: [{ AttributeName: "gsi1pk", KeyType: "HASH" }, { AttributeName: "gsi1sk", KeyType: "RANGE" }],
            Projection: {
              ProjectionType: "INCLUDE",
              NonKeyAttributes: ["designId", "title", "ownerId", "ownerName", "createdAt", "updatedAt", "likeCount", "commentCount", "thumb", "basedOn"],
            },
          },
        ],
      }),
    );
    await client.send(
      new CreateTableCommand({
        TableName: USERS,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      }),
    );
    await DynamoDBDocumentClient.from(client).send(new PutCommand({ TableName: USERS, Item: { userId: "anna", name: " Anna ", email: "a@example.com" } }));
    store = new DynamoPlannerStore(TABLE, USERS);
  });

  it("creates, lists newest first, reads and updates", async () => {
    await store.createDesign(design("aaaaaa", "anna", "2026-01-01T10:00:00.000Z"));
    await store.createDesign(design("bbbbbb", "bertil", "2026-01-02T10:00:00.000Z"));
    await expect(store.createDesign(design("aaaaaa", "anna", "2026-01-03T10:00:00.000Z"))).rejects.toThrow();

    let list = await store.listDesigns(10);
    expect(list.map((d) => d.designId)).toEqual(["bbbbbb", "aaaaaa"]);
    expect(list[0]).toMatchObject({ title: "Design bbbbbb", ownerId: "bertil", likeCount: 0, thumb: "data:image/webp;base64,AAAA" });
    expect((list[0] as unknown as { state?: string }).state).toBeUndefined();

    expect(await store.countByOwner("anna")).toBe(1);
    expect(await store.getDesign("zzzzzz")).toBeNull();
    expect((await store.getDesign("aaaaaa"))?.state).toBe(JSON.stringify({ v: 1, items: [] }));

    // someone else cannot update; the owner can, and the design moves to the top
    expect(await store.updateDesign("aaaaaa", "bertil", { title: "Kapat", updatedAt: "2026-01-05T10:00:00.000Z" })).toBeNull();
    const upd = await store.updateDesign("aaaaaa", "anna", { title: "Nytt", state: '{"v":1,"items":[1]}', updatedAt: "2026-01-05T10:00:00.000Z" });
    expect(upd).toMatchObject({ title: "Nytt", updatedAt: "2026-01-05T10:00:00.000Z" });
    list = await store.listDesigns(10);
    expect(list.map((d) => d.designId)).toEqual(["aaaaaa", "bbbbbb"]);
    expect((await store.getDesign("aaaaaa"))?.state).toBe('{"v":1,"items":[1]}');
    expect(await store.updateDesign("zzzzzz", "anna", { title: "x", updatedAt: "2026-01-06T10:00:00.000Z" })).toBeNull();
  });

  it("keeps the like counter in step with the likes", async () => {
    const now = "2026-01-06T10:00:00.000Z";
    expect(await store.setLike("aaaaaa", "bertil", true, now)).toBe(true);
    expect(await store.setLike("aaaaaa", "bertil", true, now)).toBe(false);
    expect(await store.setLike("aaaaaa", "cecilia", true, now)).toBe(true);
    expect(await store.hasLiked("aaaaaa", "bertil")).toBe(true);
    expect(await store.hasLiked("aaaaaa", "david")).toBe(false);
    expect((await store.getDesign("aaaaaa"))?.likeCount).toBe(2);
    expect(await store.setLike("aaaaaa", "bertil", false, now)).toBe(true);
    expect(await store.setLike("aaaaaa", "bertil", false, now)).toBe(false);
    expect((await store.getDesign("aaaaaa"))?.likeCount).toBe(1);
    expect((await store.listDesigns(10)).find((d) => d.designId === "aaaaaa")?.likeCount).toBe(1);
    // liking a design that does not exist changes nothing
    expect(await store.setLike("zzzzzz", "bertil", true, now)).toBe(false);
    expect(await store.hasLiked("zzzzzz", "bertil")).toBe(false);
  });

  it("stores comments in time order and counts them", async () => {
    const c = (commentId: string, text: string) => ({ commentId, userId: "bertil", userName: "Bertil", text, createdAt: "2026-01-07T10:00:00.000Z" });
    await store.addComment("aaaaaa", c("000000001-aaaa", "först"));
    await store.addComment("aaaaaa", c("000000002-bbbb", "sedan"));
    expect((await store.listComments("aaaaaa")).map((x) => x.text)).toEqual(["först", "sedan"]);
    expect((await store.getDesign("aaaaaa"))?.commentCount).toBe(2);
    expect(await store.getComment("aaaaaa", "000000002-bbbb")).toMatchObject({ text: "sedan", userName: "Bertil" });
    expect(await store.getComment("aaaaaa", "nope")).toBeNull();
    expect(await store.deleteComment("aaaaaa", "000000001-aaaa")).toBe(true);
    expect(await store.deleteComment("aaaaaa", "000000001-aaaa")).toBe(false);
    expect((await store.getDesign("aaaaaa"))?.commentCount).toBe(1);
    await expect(store.addComment("zzzzzz", c("000000003-cccc", "x"))).rejects.toThrow();
    expect(await store.listComments("zzzzzz")).toEqual([]);
  });

  it("reads display names and deletes a design with everything attached", async () => {
    expect(await store.getUserName("anna")).toBe("Anna");
    expect(await store.getUserName("nobody")).toBeNull();
    await store.deleteDesign("aaaaaa");
    expect(await store.getDesign("aaaaaa")).toBeNull();
    expect(await store.listComments("aaaaaa")).toEqual([]);
    expect(await store.hasLiked("aaaaaa", "cecilia")).toBe(false);
    expect((await store.listDesigns(10)).map((d) => d.designId)).toEqual(["bbbbbb"]);
  });
});
