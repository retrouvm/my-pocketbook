/**
 * One-shot backfill from Google Sheets Excel exports.
 *
 * Usage:
 *   LOCAL_MODE=true npx tsx src/import-excel.ts --dir "C:/Users/.../2025-finances/2025"
 *
 * Posts to the local API by default (http://localhost:3001).
 * Ensure `npm run seed` / POST /seed has run first (or this script will seed).
 */
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import { ulid } from "ulid";
import {
  DEFAULT_CREDIT_CATEGORIES,
  DEFAULT_CASH_CATEGORIES,
} from "@pocketbook/shared";

const API = process.env.API_URL ?? "http://localhost:3001";
const DIR = process.argv.includes("--dir")
  ? process.argv[process.argv.indexOf("--dir") + 1]
  : process.env.FINANCES_DIR;

if (!DIR || !existsSync(DIR)) {
  console.error("Pass --dir path to the year folder containing month subfolders");
  process.exit(1);
}

const categoryMap = new Map<string, string>();
for (const c of [...DEFAULT_CREDIT_CATEGORIES, ...DEFAULT_CASH_CATEGORIES]) {
  categoryMap.set(c.subcategory.toLowerCase(), c.category);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function sheetToRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function excelDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log("Seeding defaults…");
  await api("/seed", { method: "POST" });

  const accounts = await api<{ id: string; name: string; type: string }[]>("/accounts");
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const checking = accounts.find((a) => a.type === "checking");

  const monthDirs = readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let imported = 0;

  for (const monthDir of monthDirs) {
    const folder = join(DIR, monthDir);
    const files = readdirSync(folder).filter((f) => f.endsWith(".xlsx"));
    const creditFile = files.find((f) => /credit spending/i.test(f));
    const budgetFile = files.find((f) => /running budget/i.test(f));

    if (creditFile) {
      const wb = XLSX.readFile(join(folder, creditFile));
      // Prefer Transactions sheet if present
      const txnSheet =
        wb.SheetNames.find((n) => /transactions/i.test(n)) ??
        wb.SheetNames.find((n) => !/lookup|dashboard|copy/i.test(n));

      if (txnSheet && /transactions/i.test(txnSheet)) {
        const rows = sheetToRows(wb, txnSheet);
        for (const row of rows) {
          const date = excelDate(row["Date"] ?? row["date"]);
          const description = String(row["Description"] ?? row["description"] ?? "").trim();
          const amount = num(row["Amount"] ?? row["amount"]);
          const sub = String(row["Category"] ?? row["Subcategory"] ?? "").trim();
          const card = String(row["Credit Card"] ?? row["Card"] ?? "").trim();
          const notes = String(row["Notes"] ?? "").trim();
          if (!date || !description || amount == null) continue;
          const account =
            byName.get(card.toLowerCase()) ??
            accounts.find((a) => a.type === "credit");
          if (!account) continue;
          const subcategory = sub || (amount < 0 ? "Payment" : "Personal Spending");
          const category =
            categoryMap.get(subcategory.toLowerCase()) ??
            String(row["Parent Category"] ?? row["category"] ?? subcategory);
          const paymentBatch = /payment/i.test(notes) ? notes : undefined;
          await api("/transactions", {
            method: "POST",
            body: JSON.stringify({
              id: ulid(),
              accountId: account.id,
              date,
              description,
              amount,
              subcategory,
              category,
              notes: notes || undefined,
              paymentBatch,
              source: "manual",
            }),
          });
          imported++;
        }
      } else {
        // Per-card sheets
        for (const sheetName of wb.SheetNames) {
          if (/lookup|dashboard|transactions|refund/i.test(sheetName)) continue;
          const account = byName.get(sheetName.toLowerCase());
          if (!account) continue;
          const rows = sheetToRows(wb, sheetName);
          for (const row of rows) {
            const date = excelDate(row["Date"] ?? row["date"]);
            const description = String(row["Description"] ?? "").trim();
            const amount = num(row["Amount"]);
            const sub = String(row["Category"] ?? "").trim();
            const notes = String(row["Notes"] ?? "").trim();
            if (!date || !description || amount == null) continue;
            const subcategory = sub || (amount < 0 ? "Payment" : "Personal Spending");
            await api("/transactions", {
              method: "POST",
              body: JSON.stringify({
                id: ulid(),
                accountId: account.id,
                date,
                description,
                amount,
                subcategory,
                category: categoryMap.get(subcategory.toLowerCase()) ?? subcategory,
                notes: notes || undefined,
                paymentBatch: /payment/i.test(notes) ? notes : undefined,
                source: "manual",
              }),
            });
            imported++;
          }
        }
      }
    }

    if (budgetFile && checking) {
      const wb = XLSX.readFile(join(folder, budgetFile));
      const sheetName =
        wb.SheetNames.find((n) => /running balance/i.test(n)) ?? "Running Balance";
      const rows = sheetToRows(wb, sheetName);
      for (const row of rows) {
        const date = excelDate(row["Date"] ?? row["date"]);
        const description = String(row["Description"] ?? "").trim();
        const amount = num(row["Amount"]);
        const category = String(row["Category"] ?? "").trim();
        if (!date || !description || amount == null || !category) continue;
        // Skip formula-looking empties
        if (description.startsWith("=")) continue;
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify({
            id: ulid(),
            accountId: checking.id,
            date,
            description,
            amount,
            subcategory: category,
            category,
            source: "manual",
          }),
        });
        imported++;
      }
    }

    console.log(`Imported through ${monthDir} (running total ${imported})`);
  }

  console.log(`Done. Imported ${imported} transactions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
