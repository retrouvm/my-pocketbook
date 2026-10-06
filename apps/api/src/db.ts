import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const TABLE_NAME = process.env.TABLE_NAME ?? "pocketbook-dev";
const LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR ?? ".data";

export type Item = Record<string, unknown>;

interface Store {
  get(pk: string, sk: string): Promise<Item | undefined>;
  put(item: Item): Promise<void>;
  delete(pk: string, sk: string): Promise<void>;
  queryPk(pk: string, skPrefix?: string): Promise<Item[]>;
  queryGsi1(gsi1pk: string, skPrefix?: string): Promise<Item[]>;
  batchPut(items: Item[]): Promise<void>;
}

class DynamoStore implements Store {
  private doc: DynamoDBDocumentClient;

  constructor() {
    const client = new DynamoDBClient({});
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async get(pk: string, sk: string) {
    const res = await this.doc.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }),
    );
    return res.Item as Item | undefined;
  }

  async put(item: Item) {
    await this.doc.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  async delete(pk: string, sk: string) {
    await this.doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }));
  }

  async queryPk(pk: string, skPrefix?: string) {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: skPrefix
          ? "PK = :pk AND begins_with(SK, :sk)"
          : "PK = :pk",
        ExpressionAttributeValues: skPrefix
          ? { ":pk": pk, ":sk": skPrefix }
          : { ":pk": pk },
      }),
    );
    return (res.Items ?? []) as Item[];
  }

  async queryGsi1(gsi1pk: string, skPrefix?: string) {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: skPrefix
          ? "GSI1PK = :pk AND begins_with(GSI1SK, :sk)"
          : "GSI1PK = :pk",
        ExpressionAttributeValues: skPrefix
          ? { ":pk": gsi1pk, ":sk": skPrefix }
          : { ":pk": gsi1pk },
      }),
    );
    return (res.Items ?? []) as Item[];
  }

  async batchPut(items: Item[]) {
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: chunk.map((Item) => ({ PutRequest: { Item } })),
          },
        }),
      );
    }
  }
}

class LocalFileStore implements Store {
  private file: string;
  private data: Item[];

  constructor() {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    this.file = join(LOCAL_DATA_DIR, "db.json");
    this.data = existsSync(this.file)
      ? (JSON.parse(readFileSync(this.file, "utf8")) as Item[])
      : [];
  }

  private save() {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  async get(pk: string, sk: string) {
    return this.data.find((i) => i.PK === pk && i.SK === sk);
  }

  async put(item: Item) {
    const idx = this.data.findIndex((i) => i.PK === item.PK && i.SK === item.SK);
    if (idx >= 0) this.data[idx] = item;
    else this.data.push(item);
    this.save();
  }

  async delete(pk: string, sk: string) {
    this.data = this.data.filter((i) => !(i.PK === pk && i.SK === sk));
    this.save();
  }

  async queryPk(pk: string, skPrefix?: string) {
    return this.data
      .filter((i) => i.PK === pk && (!skPrefix || String(i.SK).startsWith(skPrefix)))
      .sort((a, b) => String(a.SK).localeCompare(String(b.SK)));
  }

  async queryGsi1(gsi1pk: string, skPrefix?: string) {
    return this.data
      .filter(
        (i) =>
          i.GSI1PK === gsi1pk &&
          (!skPrefix || String(i.GSI1SK ?? "").startsWith(skPrefix)),
      )
      .sort((a, b) => String(a.GSI1SK).localeCompare(String(b.GSI1SK)));
  }

  async batchPut(items: Item[]) {
    for (const item of items) await this.put(item);
  }
}

export const store: Store = LOCAL_MODE ? new LocalFileStore() : new DynamoStore();

export function userPk(userId = process.env.USER_ID ?? "me") {
  return `USER#${userId}`;
}
