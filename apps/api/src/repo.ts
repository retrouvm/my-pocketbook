import { ulid } from "ulid";
import {
  Account,
  Budget,
  Category,
  DEFAULT_ACCOUNTS,
  DEFAULT_CASH_BUDGETS,
  DEFAULT_CASH_CATEGORIES,
  DEFAULT_CREDIT_BUDGETS,
  DEFAULT_CREDIT_CATEGORIES,
  MonthSnapshot,
  ProposedTransaction,
  StatementUpload,
  Transaction,
  PlaidItem,
} from "@pocketbook/shared";
import { store, userPk, Item } from "./db.js";

const now = () => new Date().toISOString();

function asAccount(item: Item): Account {
  return {
    id: item.id as string,
    name: item.name as string,
    type: item.type as Account["type"],
    creditLimit: item.creditLimit as number | undefined,
    dueDay: item.dueDay as number | undefined,
    statementOpenDay: item.statementOpenDay as number | undefined,
    statementCloseDay: item.statementCloseDay as number | undefined,
    bestFor: item.bestFor as string | undefined,
    currentBalance: (item.currentBalance as number) ?? 0,
    previousStatementBalance: item.previousStatementBalance as number | undefined,
    status: item.status as Account["status"],
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

function asTxn(item: Item): Transaction {
  return {
    id: item.id as string,
    accountId: item.accountId as string,
    date: item.date as string,
    description: item.description as string,
    amount: item.amount as number,
    subcategory: item.subcategory as string,
    category: item.category as string,
    notes: item.notes as string | undefined,
    paymentBatch: item.paymentBatch as string | undefined,
    source: item.source as Transaction["source"],
    externalId: item.externalId as string | undefined,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

export async function seedDefaults(userId = "me") {
  const pk = userPk(userId);
  const existing = await store.queryPk(pk, "ACCOUNT#");
  if (existing.length > 0) return { seeded: false };

  const ts = now();
  const items: Item[] = [];

  for (const a of DEFAULT_ACCOUNTS) {
    const id = ulid();
    items.push({
      PK: pk,
      SK: `ACCOUNT#${id}`,
      entityType: "Account",
      id,
      ...a,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  for (const c of [...DEFAULT_CREDIT_CATEGORIES, ...DEFAULT_CASH_CATEGORIES]) {
    items.push({
      PK: pk,
      SK: `CAT#${c.kind}#${c.subcategory}`,
      entityType: "Category",
      ...c,
    });
  }

  const month = ts.slice(0, 7);
  for (const b of [...DEFAULT_CREDIT_BUDGETS, ...DEFAULT_CASH_BUDGETS]) {
    items.push({
      PK: pk,
      SK: `BUDGET#${month}#${b.category}`,
      entityType: "Budget",
      month,
      ...b,
    });
  }

  await store.batchPut(items);
  return { seeded: true, count: items.length };
}

export async function listAccounts(userId = "me"): Promise<Account[]> {
  const items = await store.queryPk(userPk(userId), "ACCOUNT#");
  return items.map(asAccount).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAccount(id: string, userId = "me"): Promise<Account | undefined> {
  const item = await store.get(userPk(userId), `ACCOUNT#${id}`);
  return item ? asAccount(item) : undefined;
}

export async function upsertAccount(
  input: Partial<Account> & { name: string; type: Account["type"] },
  userId = "me",
): Promise<Account> {
  const ts = now();
  const id = input.id ?? ulid();
  const existing = input.id ? await getAccount(id, userId) : undefined;
  const account: Account = {
    id,
    name: input.name,
    type: input.type,
    creditLimit: input.creditLimit,
    dueDay: input.dueDay,
    statementOpenDay: input.statementOpenDay,
    statementCloseDay: input.statementCloseDay,
    bestFor: input.bestFor,
    currentBalance: input.currentBalance ?? existing?.currentBalance ?? 0,
    previousStatementBalance:
      input.previousStatementBalance ?? existing?.previousStatementBalance,
    status: input.status ?? existing?.status ?? "active",
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };
  await store.put({
    PK: userPk(userId),
    SK: `ACCOUNT#${id}`,
    entityType: "Account",
    ...account,
  });
  return account;
}

export async function deleteAccount(id: string, userId = "me") {
  await store.delete(userPk(userId), `ACCOUNT#${id}`);
}

export async function listCategories(userId = "me"): Promise<Category[]> {
  const items = await store.queryPk(userPk(userId), "CAT#");
  return items.map((i) => ({
    subcategory: i.subcategory as string,
    category: i.category as string,
    kind: i.kind as Category["kind"],
  }));
}

export async function upsertCategory(cat: Category, userId = "me") {
  await store.put({
    PK: userPk(userId),
    SK: `CAT#${cat.kind}#${cat.subcategory}`,
    entityType: "Category",
    ...cat,
  });
  return cat;
}

export async function listBudgets(month: string, userId = "me"): Promise<Budget[]> {
  const items = await store.queryPk(userPk(userId), `BUDGET#${month}#`);
  return items.map((i) => ({
    month: i.month as string,
    category: i.category as string,
    planned: i.planned as number,
    kind: i.kind as Budget["kind"],
  }));
}

export async function upsertBudget(budget: Budget, userId = "me") {
  await store.put({
    PK: userPk(userId),
    SK: `BUDGET#${budget.month}#${budget.category}`,
    entityType: "Budget",
    ...budget,
  });
  return budget;
}

export async function ensureMonthBudgets(month: string, userId = "me") {
  const existing = await listBudgets(month, userId);
  if (existing.length > 0) return existing;
  const items: Item[] = [];
  for (const b of [...DEFAULT_CREDIT_BUDGETS, ...DEFAULT_CASH_BUDGETS]) {
    items.push({
      PK: userPk(userId),
      SK: `BUDGET#${month}#${b.category}`,
      entityType: "Budget",
      month,
      ...b,
    });
  }
  await store.batchPut(items);
  return listBudgets(month, userId);
}

export async function listTransactions(opts: {
  userId?: string;
  month?: string;
  accountId?: string;
}): Promise<Transaction[]> {
  const userId = opts.userId ?? "me";
  let items: Item[];
  if (opts.accountId) {
    items = await store.queryPk(`ACCOUNT#${opts.accountId}`, "TXN#");
  } else if (opts.month) {
    items = await store.queryGsi1(userPk(userId), `DATE#${opts.month}`);
  } else {
    items = await store.queryGsi1(userPk(userId), "DATE#");
  }
  return items.map(asTxn).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function getTransaction(
  accountId: string,
  id: string,
  date: string,
): Promise<Transaction | undefined> {
  const item = await store.get(`ACCOUNT#${accountId}`, `TXN#${date}#${id}`);
  return item ? asTxn(item) : undefined;
}

export async function upsertTransaction(
  input: Omit<Transaction, "createdAt" | "updatedAt"> & { createdAt?: string },
  userId = "me",
): Promise<Transaction> {
  const ts = now();
  const id = input.id || ulid();
  const txn: Transaction = {
    ...input,
    id,
    createdAt: input.createdAt ?? ts,
    updatedAt: ts,
  };
  const item: Item = {
    PK: `ACCOUNT#${txn.accountId}`,
    SK: `TXN#${txn.date}#${txn.id}`,
    GSI1PK: userPk(userId),
    GSI1SK: `DATE#${txn.date}#${txn.id}`,
    entityType: "Transaction",
    ...txn,
  };
  await store.put(item);
  // Mirror under user for simple listing without GSI in local mode edge cases
  await store.put({
    ...item,
    PK: userPk(userId),
    SK: `TXN#${txn.date}#${txn.id}`,
  });
  return txn;
}

export async function deleteTransaction(accountId: string, date: string, id: string, userId = "me") {
  await store.delete(`ACCOUNT#${accountId}`, `TXN#${date}#${id}`);
  await store.delete(userPk(userId), `TXN#${date}#${id}`);
}

export async function getMonthSnapshot(month: string, userId = "me"): Promise<MonthSnapshot | undefined> {
  const item = await store.get(userPk(userId), `MONTH#${month}`);
  if (!item) return undefined;
  return {
    month: item.month as string,
    cashStartBalance: item.cashStartBalance as number,
    cashEndBalance: item.cashEndBalance as number | undefined,
    notes: item.notes as string | undefined,
  };
}

export async function upsertMonthSnapshot(snap: MonthSnapshot, userId = "me") {
  await store.put({
    PK: userPk(userId),
    SK: `MONTH#${snap.month}`,
    entityType: "MonthSnapshot",
    ...snap,
  });
  return snap;
}

export async function createUpload(
  input: Omit<StatementUpload, "createdAt" | "status"> & { status?: StatementUpload["status"] },
  userId = "me",
): Promise<StatementUpload> {
  const upload: StatementUpload = {
    ...input,
    status: input.status ?? "uploaded",
    createdAt: now(),
  };
  await store.put({
    PK: userPk(userId),
    SK: `UPLOAD#${upload.id}`,
    entityType: "StatementUpload",
    ...upload,
  });
  return upload;
}

export async function getUpload(id: string, userId = "me"): Promise<StatementUpload | undefined> {
  const item = await store.get(userPk(userId), `UPLOAD#${id}`);
  if (!item) return undefined;
  return {
    id: item.id as string,
    accountId: item.accountId as string,
    filename: item.filename as string,
    s3Key: item.s3Key as string,
    status: item.status as StatementUpload["status"],
    error: item.error as string | undefined,
    proposedCount: item.proposedCount as number | undefined,
    createdAt: item.createdAt as string,
  };
}

export async function updateUpload(upload: StatementUpload, userId = "me") {
  await store.put({
    PK: userPk(userId),
    SK: `UPLOAD#${upload.id}`,
    entityType: "StatementUpload",
    ...upload,
  });
  return upload;
}

export async function listUploads(userId = "me"): Promise<StatementUpload[]> {
  const items = await store.queryPk(userPk(userId), "UPLOAD#");
  return items
    .map((item) => ({
      id: item.id as string,
      accountId: item.accountId as string,
      filename: item.filename as string,
      s3Key: item.s3Key as string,
      status: item.status as StatementUpload["status"],
      error: item.error as string | undefined,
      proposedCount: item.proposedCount as number | undefined,
      createdAt: item.createdAt as string,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function putProposed(txn: ProposedTransaction, userId = "me") {
  await store.put({
    PK: userPk(userId),
    SK: `PROPOSED#${txn.uploadId}#${txn.id}`,
    entityType: "ProposedTransaction",
    ...txn,
  });
  return txn;
}

export async function listProposed(uploadId: string, userId = "me"): Promise<ProposedTransaction[]> {
  const items = await store.queryPk(userPk(userId), `PROPOSED#${uploadId}#`);
  return items.map((i) => ({
    id: i.id as string,
    uploadId: i.uploadId as string,
    accountId: i.accountId as string,
    date: i.date as string,
    description: i.description as string,
    amount: i.amount as number,
    subcategory: i.subcategory as string | undefined,
    category: i.category as string | undefined,
    status: i.status as ProposedTransaction["status"],
    duplicateOf: i.duplicateOf as string | undefined,
    createdAt: i.createdAt as string,
  }));
}

export async function updateProposed(txn: ProposedTransaction, userId = "me") {
  return putProposed(txn, userId);
}

export async function findDuplicate(
  accountId: string,
  date: string,
  amount: number,
  description: string,
  userId = "me",
): Promise<Transaction | undefined> {
  const txns = await listTransactions({ userId, accountId });
  const desc = description.toLowerCase().slice(0, 24);
  return txns.find(
    (t) =>
      t.date === date &&
      Math.abs(t.amount - amount) < 0.005 &&
      t.description.toLowerCase().slice(0, 24) === desc,
  );
}

export async function upsertPlaidItem(item: PlaidItem, userId = "me") {
  await store.put({
    PK: userPk(userId),
    SK: `PLAID#${item.itemId}`,
    entityType: "PlaidItem",
    ...item,
  });
  return item;
}

export async function listPlaidItems(userId = "me"): Promise<PlaidItem[]> {
  const items = await store.queryPk(userPk(userId), "PLAID#");
  return items.map((i) => ({
    itemId: i.itemId as string,
    accessTokenSecretArn: i.accessTokenSecretArn as string,
    institutionName: i.institutionName as string | undefined,
    accountIds: (i.accountIds as string[]) ?? [],
    cursor: i.cursor as string | undefined,
    createdAt: i.createdAt as string,
    updatedAt: i.updatedAt as string,
  }));
}

export async function getPlaidItem(itemId: string, userId = "me"): Promise<PlaidItem | undefined> {
  const item = await store.get(userPk(userId), `PLAID#${itemId}`);
  if (!item) return undefined;
  return {
    itemId: item.itemId as string,
    accessTokenSecretArn: item.accessTokenSecretArn as string,
    institutionName: item.institutionName as string | undefined,
    accountIds: (item.accountIds as string[]) ?? [],
    cursor: item.cursor as string | undefined,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}
