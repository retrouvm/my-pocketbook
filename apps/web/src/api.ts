import type {
  Account,
  Budget,
  Category,
  OverviewReport,
  ProposedTransaction,
  RunningBalanceRow,
  StatementUpload,
  Transaction,
} from "@pocketbook/shared";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

let tokenGetter: (() => string | null) | null = null;

export function setTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  const token = tokenGetter?.();
  if (token && token !== "local") headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  seed: () => request<{ seeded: boolean }>("/seed", { method: "POST" }),
  accounts: {
    list: () => request<Account[]>("/accounts"),
    create: (body: Partial<Account> & { name: string; type: Account["type"] }) =>
      request<Account>("/accounts", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Account> & { name: string; type: Account["type"] }) =>
      request<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/accounts/${id}`, { method: "DELETE" }),
  },
  categories: {
    list: () => request<Category[]>("/categories"),
    upsert: (body: Category) =>
      request<Category>("/categories", { method: "PUT", body: JSON.stringify(body) }),
  },
  budgets: {
    list: (month: string) => request<Budget[]>(`/budgets?month=${month}`),
    upsert: (body: Budget) =>
      request<Budget>("/budgets", { method: "PUT", body: JSON.stringify(body) }),
  },
  transactions: {
    list: (params: { month?: string; accountId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.month) q.set("month", params.month);
      if (params.accountId) q.set("accountId", params.accountId);
      const qs = q.toString();
      return request<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
    },
    create: (body: Omit<Transaction, "createdAt" | "updatedAt" | "id"> & { id?: string }) =>
      request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Omit<Transaction, "createdAt" | "updatedAt">) =>
      request<Transaction>(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    remove: (id: string, accountId: string, date: string) =>
      request<void>(`/transactions/${id}?accountId=${accountId}&date=${date}`, {
        method: "DELETE",
      }),
  },
  months: {
    getSnapshot: (month: string) =>
      request<{ month: string; cashStartBalance: number } | null>(
        `/months/snapshot?month=${month}`,
      ),
    putSnapshot: (body: { month: string; cashStartBalance: number; cashEndBalance?: number }) =>
      request("/months/snapshot", { method: "PUT", body: JSON.stringify(body) }),
  },
  reports: {
    overview: (month: string) => request<OverviewReport>(`/reports/overview?month=${month}`),
    runningBalance: (month: string) =>
      request<RunningBalanceRow[]>(`/reports/running-balance?month=${month}`),
    paymentBatches: (month: string) =>
      request<
        {
          batch: string;
          total: number;
          items: (Transaction & { accountName: string })[];
        }[]
      >(`/reports/payment-batches?month=${month}`),
    weeklyLadder: (accountId: string, month: string) =>
      request<{
        account: Account;
        weeks: { weekStart: string; payments: number; spending: number; balance: number }[];
      }>(`/reports/weekly-ladder/${accountId}?month=${month}`),
  },
  imports: {
    list: () => request<StatementUpload[]>("/imports"),
    presign: (body: { accountId: string; filename: string; contentType?: string }) =>
      request<{ upload: StatementUpload; uploadUrl: string; local?: boolean }>("/imports/presign", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    parse: (id: string) =>
      request<{ upload: StatementUpload; proposedCount: number }>(`/imports/${id}/parse`, {
        method: "POST",
      }),
    proposed: (id: string) => request<ProposedTransaction[]>(`/imports/${id}/proposed`),
    accept: (id: string, uploadId: string, subcategory?: string) =>
      request(`/imports/proposed/${id}/accept`, {
        method: "POST",
        body: JSON.stringify({ uploadId, subcategory }),
      }),
    reject: (id: string, uploadId: string) =>
      request(`/imports/proposed/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ uploadId }),
      }),
    localUpload: async (id: string, file: File) => {
      const text = await file.text();
      return request<{ upload: StatementUpload; proposedCount: number }>(
        `/imports/local-upload/${id}`,
        {
          method: "PUT",
          headers: { "content-type": file.type || "text/csv" },
          body: text,
        },
      );
    },
  },
  plaid: {
    linkToken: () => request<{ linkToken: string }>("/plaid/link-token", { method: "POST" }),
    exchange: (publicToken: string, accountId?: string) =>
      request<{ itemId: string }>("/plaid/exchange", {
        method: "POST",
        body: JSON.stringify({ publicToken, accountId }),
      }),
    items: () =>
      request<{ itemId: string; institutionName?: string; accountIds: string[] }[]>("/plaid/items"),
    sync: (itemId?: string) =>
      request<{ results: unknown[] }>("/plaid/sync", {
        method: "POST",
        body: JSON.stringify({ itemId }),
      }),
  },
};

export function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
