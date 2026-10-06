import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { ulid } from "ulid";
import type { PlaidItem } from "@pocketbook/shared";
import * as repo from "./repo.js";

const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const secrets = LOCAL_MODE ? null : new SecretsManagerClient({});

function plaidClient() {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
          "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
        },
      },
    }),
  );
}

async function resolveAccessToken(item: PlaidItem): Promise<string> {
  if (item.accessTokenSecretArn.startsWith("local:")) {
    return item.accessTokenSecretArn.slice("local:".length);
  }
  if (!secrets) throw new Error("Secrets Manager unavailable");
  const res = await secrets.send(
    new GetSecretValueCommand({ SecretId: item.accessTokenSecretArn }),
  );
  return res.SecretString ?? "";
}

export async function syncPlaidItem(item: PlaidItem, userId = "me") {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return { itemId: item.itemId, error: "Plaid not configured", added: 0 };
  }

  const accessToken = await resolveAccessToken(item);
  const client = plaidClient();
  let cursor = item.cursor;
  let added = 0;
  let hasMore = true;
  const accountId = item.accountIds[0];

  while (hasMore) {
    const res = await client.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    const data = res.data;
    cursor = data.next_cursor;
    hasMore = data.has_more;

    if (!accountId) {
      // No mapped pocketbook account — skip writes but advance cursor
      continue;
    }

    for (const t of data.added) {
      // Plaid: positive = money out for depository; invert for credit convention charges > 0
      const amount = t.amount;
      const date = t.date;
      const description = t.name || t.merchant_name || "Plaid transaction";
      const externalId = `plaid:${t.transaction_id}`;
      const existing = (await repo.listTransactions({ userId, accountId })).find(
        (x) => x.externalId === externalId,
      );
      if (existing) continue;

      await repo.upsertTransaction(
        {
          id: ulid(),
          accountId,
          date,
          description,
          amount,
          subcategory: t.personal_finance_category?.primary ?? "Personal Spending",
          category: t.personal_finance_category?.primary ?? "Personal Spending",
          source: "plaid",
          externalId,
          notes: t.pending ? "pending" : undefined,
        },
        userId,
      );
      added++;
    }
  }

  const updated = {
    ...item,
    cursor,
    updatedAt: new Date().toISOString(),
  };
  await repo.upsertPlaidItem(updated, userId);
  return { itemId: item.itemId, added, cursor };
}

/** EventBridge / direct invoke entry */
export async function handler(event: { itemId?: string; userId?: string } = {}) {
  const userId = event.userId ?? process.env.USER_ID ?? "me";
  const items = event.itemId
    ? [await repo.getPlaidItem(event.itemId, userId)].filter(Boolean)
    : await repo.listPlaidItems(userId);
  const results = [];
  for (const item of items) {
    if (!item) continue;
    results.push(await syncPlaidItem(item, userId));
  }
  return { results };
}
