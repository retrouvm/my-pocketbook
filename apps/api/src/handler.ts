import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { json, parseBody, userIdFromEvent, query } from "./http.js";
import * as repo from "./repo.js";
import * as reports from "./reports.js";
import { parseStatementText } from "./parse-statement.js";

const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const STATEMENTS_BUCKET = process.env.STATEMENTS_BUCKET ?? "";
const AWS_REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

const s3 = LOCAL_MODE ? null : new S3Client({ region: AWS_REGION });
const secrets = LOCAL_MODE ? null : new SecretsManagerClient({ region: AWS_REGION });

function plaidClient() {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
      },
    },
  });
  return new PlaidApi(configuration);
}

async function route(event: APIGatewayProxyEventV2) {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, "") || "/";
  const userId = userIdFromEvent(event);

  if (method === "OPTIONS") return json(204, {});

  if (method === "GET" && path === "/health") {
    return json(200, { ok: true, local: LOCAL_MODE });
  }

  if (method === "POST" && path === "/seed") {
    const result = await repo.seedDefaults(userId);
    return json(200, result);
  }

  // Accounts
  if (method === "GET" && path === "/accounts") {
    return json(200, await repo.listAccounts(userId));
  }
  if (method === "POST" && path === "/accounts") {
    const body = parseBody<Parameters<typeof repo.upsertAccount>[0]>(event);
    return json(201, await repo.upsertAccount(body, userId));
  }
  if (method === "PUT" && path.startsWith("/accounts/")) {
    const id = path.split("/")[2];
    const body = parseBody<Parameters<typeof repo.upsertAccount>[0]>(event);
    return json(200, await repo.upsertAccount({ ...body, id }, userId));
  }
  if (method === "DELETE" && path.startsWith("/accounts/")) {
    const id = path.split("/")[2];
    await repo.deleteAccount(id, userId);
    return json(204, {});
  }

  // Categories
  if (method === "GET" && path === "/categories") {
    return json(200, await repo.listCategories(userId));
  }
  if (method === "PUT" && path === "/categories") {
    const body = parseBody<Parameters<typeof repo.upsertCategory>[0]>(event);
    return json(200, await repo.upsertCategory(body, userId));
  }

  // Budgets
  if (method === "GET" && path === "/budgets") {
    const month = query(event).month ?? new Date().toISOString().slice(0, 7);
    return json(200, await repo.ensureMonthBudgets(month, userId));
  }
  if (method === "PUT" && path === "/budgets") {
    const body = parseBody<Parameters<typeof repo.upsertBudget>[0]>(event);
    return json(200, await repo.upsertBudget(body, userId));
  }

  // Transactions
  if (method === "GET" && path === "/transactions") {
    const q = query(event);
    return json(
      200,
      await repo.listTransactions({
        userId,
        month: q.month,
        accountId: q.accountId,
      }),
    );
  }
  if (method === "POST" && path === "/transactions") {
    const body = parseBody<Parameters<typeof repo.upsertTransaction>[0]>(event);
    const cats = await repo.listCategories(userId);
    const match = cats.find((c) => c.subcategory === body.subcategory);
    const txn = await repo.upsertTransaction(
      {
        ...body,
        id: body.id || ulid(),
        category: body.category || match?.category || body.subcategory,
        source: body.source ?? "manual",
      },
      userId,
    );
    return json(201, txn);
  }
  if (method === "PUT" && path.startsWith("/transactions/")) {
    const id = path.split("/")[2];
    const body = parseBody<Parameters<typeof repo.upsertTransaction>[0]>(event);
    const txn = await repo.upsertTransaction({ ...body, id }, userId);
    return json(200, txn);
  }
  if (method === "DELETE" && path.startsWith("/transactions/")) {
    const id = path.split("/")[2];
    const q = query(event);
    if (!q.accountId || !q.date) return json(400, { error: "accountId and date required" });
    await repo.deleteTransaction(q.accountId, q.date, id, userId);
    return json(204, {});
  }

  // Month snapshots
  if (method === "GET" && path === "/months/snapshot") {
    const month = query(event).month;
    if (!month) return json(400, { error: "month required" });
    return json(200, (await repo.getMonthSnapshot(month, userId)) ?? null);
  }
  if (method === "PUT" && path === "/months/snapshot") {
    const body = parseBody<Parameters<typeof repo.upsertMonthSnapshot>[0]>(event);
    return json(200, await repo.upsertMonthSnapshot(body, userId));
  }

  // Reports
  if (method === "GET" && path === "/reports/overview") {
    const month = query(event).month ?? new Date().toISOString().slice(0, 7);
    return json(200, await reports.buildOverview(month, userId));
  }
  if (method === "GET" && path === "/reports/running-balance") {
    const month = query(event).month ?? new Date().toISOString().slice(0, 7);
    return json(200, await reports.buildRunningBalance(month, userId));
  }
  if (method === "GET" && path === "/reports/payment-batches") {
    const month = query(event).month ?? new Date().toISOString().slice(0, 7);
    return json(200, await reports.buildPaymentBatches(month, userId));
  }
  if (method === "GET" && path.startsWith("/reports/weekly-ladder/")) {
    const accountId = path.split("/")[3];
    const month = query(event).month ?? new Date().toISOString().slice(0, 7);
    const data = await reports.buildWeeklyLadder(accountId, month, userId);
    if (!data) return json(404, { error: "account not found" });
    return json(200, data);
  }

  // Statement uploads
  if (method === "POST" && path === "/imports/presign") {
    const body = parseBody<{ accountId: string; filename: string; contentType?: string }>(event);
    if (!body.accountId || !body.filename) return json(400, { error: "accountId and filename required" });
    const id = ulid();
    const key = `uploads/${userId}/${id}/${body.filename}`;

    if (LOCAL_MODE) {
      const upload = await repo.createUpload(
        { id, accountId: body.accountId, filename: body.filename, s3Key: key, status: "uploaded" },
        userId,
      );
      return json(200, {
        upload,
        uploadUrl: `http://localhost:3001/imports/local-upload/${id}`,
        local: true,
      });
    }

    if (!s3 || !STATEMENTS_BUCKET) return json(500, { error: "S3 not configured" });
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: STATEMENTS_BUCKET,
        Key: key,
        ContentType: body.contentType ?? "text/csv",
      }),
      { expiresIn: 900 },
    );
    const upload = await repo.createUpload(
      { id, accountId: body.accountId, filename: body.filename, s3Key: key, status: "uploaded" },
      userId,
    );
    return json(200, { upload, uploadUrl });
  }

  if (method === "PUT" && path.startsWith("/imports/local-upload/")) {
    const id = path.split("/")[3];
    const upload = await repo.getUpload(id, userId);
    if (!upload) return json(404, { error: "upload not found" });
    const text = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    return await finalizeParse(upload.id, upload.accountId, text, userId);
  }

  if (method === "POST" && path.startsWith("/imports/") && path.endsWith("/parse")) {
    const id = path.split("/")[2];
    const upload = await repo.getUpload(id, userId);
    if (!upload) return json(404, { error: "upload not found" });

    let text = "";
    if (LOCAL_MODE) {
      return json(400, { error: "Use local-upload endpoint in LOCAL_MODE" });
    }
    if (!s3 || !STATEMENTS_BUCKET) return json(500, { error: "S3 not configured" });
    const obj = await s3.send(new GetObjectCommand({ Bucket: STATEMENTS_BUCKET, Key: upload.s3Key }));
    text = (await obj.Body?.transformToString()) ?? "";
    return await finalizeParse(upload.id, upload.accountId, text, userId);
  }

  if (method === "GET" && path === "/imports") {
    return json(200, await repo.listUploads(userId));
  }

  if (method === "GET" && path.startsWith("/imports/") && path.endsWith("/proposed")) {
    const id = path.split("/")[2];
    return json(200, await repo.listProposed(id, userId));
  }

  if (method === "POST" && path.startsWith("/imports/proposed/") && path.endsWith("/accept")) {
    const id = path.split("/")[3];
    const body = parseBody<{ uploadId: string; subcategory?: string; category?: string }>(event);
    const proposed = (await repo.listProposed(body.uploadId, userId)).find((p) => p.id === id);
    if (!proposed) return json(404, { error: "proposed not found" });
    if (proposed.status !== "pending") return json(400, { error: "already reviewed" });

    const cats = await repo.listCategories(userId);
    const subcategory = body.subcategory ?? proposed.subcategory ?? "Personal Spending";
    const match = cats.find((c) => c.subcategory === subcategory);
    const txn = await repo.upsertTransaction(
      {
        id: ulid(),
        accountId: proposed.accountId,
        date: proposed.date,
        description: proposed.description,
        amount: proposed.amount,
        subcategory,
        category: body.category ?? proposed.category ?? match?.category ?? subcategory,
        source: "statement",
        externalId: `statement:${proposed.id}`,
      },
      userId,
    );
    proposed.status = "accepted";
    await repo.updateProposed(proposed, userId);
    return json(200, { proposed, transaction: txn });
  }

  if (method === "POST" && path.startsWith("/imports/proposed/") && path.endsWith("/reject")) {
    const id = path.split("/")[3];
    const body = parseBody<{ uploadId: string }>(event);
    const proposed = (await repo.listProposed(body.uploadId, userId)).find((p) => p.id === id);
    if (!proposed) return json(404, { error: "proposed not found" });
    proposed.status = "rejected";
    await repo.updateProposed(proposed, userId);
    return json(200, proposed);
  }

  // Plaid
  if (method === "POST" && path === "/plaid/link-token") {
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
      return json(503, {
        error: "Plaid not configured",
        hint: "Set PLAID_CLIENT_ID and PLAID_SECRET (sandbox) to enable Link",
      });
    }
    const client = plaidClient();
    const products = (process.env.PLAID_PRODUCTS ?? "transactions")
      .split(",")
      .map((p) => p.trim() as Products);
    const countryCodes = (process.env.PLAID_COUNTRY_CODES ?? "US")
      .split(",")
      .map((c) => c.trim() as CountryCode);
    const res = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "My Pocketbook",
      products,
      country_codes: countryCodes,
      language: "en",
    });
    return json(200, { linkToken: res.data.link_token });
  }

  if (method === "POST" && path === "/plaid/exchange") {
    const body = parseBody<{ publicToken: string; accountId?: string }>(event);
    if (!body.publicToken) return json(400, { error: "publicToken required" });
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
      return json(503, { error: "Plaid not configured" });
    }
    const client = plaidClient();
    const exchange = await client.itemPublicTokenExchange({ public_token: body.publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const ts = new Date().toISOString();

    let secretArn = `local/plaid/${itemId}`;
    if (!LOCAL_MODE && secrets) {
      const name = `pocketbook/plaid/${itemId}`;
      try {
        const created = await secrets.send(
          new CreateSecretCommand({
            Name: name,
            SecretString: accessToken,
          }),
        );
        secretArn = created.ARN ?? name;
      } catch {
        await secrets.send(
          new PutSecretValueCommand({ SecretId: name, SecretString: accessToken }),
        );
        secretArn = name;
      }
    } else {
      // store token inline in local mode via secret arn field
      secretArn = `local:${accessToken}`;
    }

    const item = await repo.upsertPlaidItem(
      {
        itemId,
        accessTokenSecretArn: secretArn,
        accountIds: body.accountId ? [body.accountId] : [],
        createdAt: ts,
        updatedAt: ts,
      },
      userId,
    );
    return json(200, { itemId: item.itemId });
  }

  if (method === "GET" && path === "/plaid/items") {
    return json(200, await repo.listPlaidItems(userId));
  }

  if (method === "POST" && path === "/plaid/sync") {
    const body = parseBody<{ itemId?: string }>(event);
    const { syncPlaidItem } = await import("./plaid-sync.js");
    const items = body.itemId
      ? [await repo.getPlaidItem(body.itemId, userId)].filter(Boolean)
      : await repo.listPlaidItems(userId);
    const results = [];
    for (const item of items) {
      if (!item) continue;
      results.push(await syncPlaidItem(item, userId));
    }
    return json(200, { results });
  }

  if (method === "POST" && path === "/plaid/webhook") {
    // Acknowledge; production would verify and enqueue sync
    return json(200, { received: true });
  }

  return json(404, { error: "not found", path, method });
}

async function finalizeParse(uploadId: string, accountId: string, text: string, userId: string) {
  const upload = await repo.getUpload(uploadId, userId);
  if (!upload) return json(404, { error: "upload not found" });
  try {
    upload.status = "parsing";
    await repo.updateUpload(upload, userId);
    const rows = parseStatementText(text, upload.filename);
    let count = 0;
    for (const row of rows) {
      const dup = await repo.findDuplicate(accountId, row.date, row.amount, row.description, userId);
      await repo.putProposed(
        {
          id: ulid(),
          uploadId,
          accountId,
          date: row.date,
          description: row.description,
          amount: row.amount,
          status: dup ? "merged" : "pending",
          duplicateOf: dup?.id,
          createdAt: new Date().toISOString(),
        },
        userId,
      );
      count++;
    }
    upload.status = "ready";
    upload.proposedCount = count;
    await repo.updateUpload(upload, userId);
    return json(200, { upload, proposedCount: count });
  } catch (err) {
    upload.status = "failed";
    upload.error = err instanceof Error ? err.message : String(err);
    await repo.updateUpload(upload, userId);
    return json(500, { error: upload.error });
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error(err);
    return json(500, { error: err instanceof Error ? err.message : "internal error" });
  }
};
