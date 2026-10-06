import {
  BudgetVarianceRow,
  OverviewReport,
  RunningBalanceRow,
  UTILIZATION_TARGET,
  monthKey,
  paymentsToTarget,
  roundMoney,
  spendingAllowance,
  utilization,
} from "@pocketbook/shared";
import * as repo from "./repo.js";

const SAVINGS = new Set([
  "Emergency Fund",
  "Car Maintenance+",
  "Health + Fitness",
  "Travel & Fun",
  "Home Upgrades+",
  "Family Fund",
]);

const INCOME = new Set(["Paycheck", "Bonus"]);

export async function buildOverview(month: string, userId = "me"): Promise<OverviewReport> {
  await repo.ensureMonthBudgets(month, userId);
  const [accounts, budgets, txns, snap] = await Promise.all([
    repo.listAccounts(userId),
    repo.listBudgets(month, userId),
    repo.listTransactions({ userId, month }),
    repo.getMonthSnapshot(month, userId),
  ]);

  const checking = accounts.find((a) => a.type === "checking");
  const creditAccounts = accounts.filter((a) => a.type === "credit" && a.status === "active");
  const cashTxns = checking
    ? txns.filter((t) => t.accountId === checking.id)
    : txns.filter((t) => {
        const acc = accounts.find((a) => a.id === t.accountId);
        return acc?.type === "checking";
      });

  // Prefer all checking txns for running balance if month filter missed account-scoped path
  const allCash =
    checking != null
      ? (await repo.listTransactions({ userId, accountId: checking.id })).filter(
          (t) => monthKey(t.date) === month,
        )
      : cashTxns;

  const cashStartBalance = snap?.cashStartBalance ?? checking?.currentBalance ?? 0;
  let running = cashStartBalance;
  for (const t of allCash) running = roundMoney(running + t.amount);
  const cashEndBalance = running;

  const sumActual = (cats: Set<string> | string, creditOnly = false) => {
    const list = creditOnly
      ? txns.filter((t) => {
          const acc = accounts.find((a) => a.id === t.accountId);
          return acc?.type === "credit";
        })
      : allCash;
    if (typeof cats === "string") {
      return roundMoney(
        list
          .filter((t) => t.category === cats && (creditOnly ? t.amount > 0 : true))
          .reduce((s, t) => s + (creditOnly ? t.amount : Math.abs(t.amount)), 0),
      );
    }
    return roundMoney(
      list
        .filter((t) => cats.has(t.category))
        .reduce((s, t) => s + (INCOME.has(t.category) ? t.amount : Math.abs(t.amount)), 0),
    );
  };

  const incomeBudgets = budgets.filter((b) => b.kind === "income");
  const expenseBudgets = budgets.filter((b) => b.kind === "cash_expense");
  const savingsBudgets = budgets.filter((b) => b.kind === "savings");
  const creditBudgets = budgets.filter((b) => b.kind === "credit");

  const incomeActual = roundMoney(
    allCash.filter((t) => INCOME.has(t.category)).reduce((s, t) => s + t.amount, 0),
  );
  const expensesActual = roundMoney(
    allCash
      .filter((t) => !INCOME.has(t.category) && !SAVINGS.has(t.category) && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0),
  );
  const savingsActual = roundMoney(
    allCash
      .filter((t) => SAVINGS.has(t.category))
      .reduce((s, t) => s + Math.abs(t.amount), 0),
  );

  const creditUtilization = creditAccounts.map((a) => {
    const limit = a.creditLimit ?? 0;
    const balance = a.currentBalance;
    return {
      accountId: a.id,
      name: a.name,
      creditLimit: limit,
      currentBalance: balance,
      utilization: utilization(balance, limit),
      paymentsTo15: roundMoney(paymentsToTarget(balance, limit, UTILIZATION_TARGET)),
      spendingAllowance: roundMoney(spendingAllowance(balance, limit)),
      previousStatementBalance: a.previousStatementBalance ?? 0,
    };
  });

  const portfolioBalance = roundMoney(creditUtilization.reduce((s, r) => s + r.currentBalance, 0));
  const portfolioLimit = roundMoney(creditUtilization.reduce((s, r) => s + r.creditLimit, 0));

  const creditBudgetVariance: BudgetVarianceRow[] = creditBudgets.map((b) => {
    const actual = roundMoney(
      txns
        .filter((t) => {
          const acc = accounts.find((a) => a.id === t.accountId);
          return acc?.type === "credit" && t.category === b.category && t.amount > 0;
        })
        .reduce((s, t) => s + t.amount, 0),
    );
    return {
      category: b.category,
      planned: b.planned,
      actual,
      diff: roundMoney(b.planned - actual),
      kind: b.kind,
    };
  });

  const cashBudgetVariance: BudgetVarianceRow[] = [
    ...expenseBudgets,
    ...incomeBudgets,
    ...savingsBudgets,
  ].map((b) => {
    let actual = 0;
    if (b.kind === "income") {
      actual = roundMoney(
        allCash.filter((t) => t.category === b.category).reduce((s, t) => s + t.amount, 0),
      );
    } else {
      actual = roundMoney(
        allCash
          .filter((t) => t.category === b.category)
          .reduce((s, t) => s + Math.abs(t.amount), 0),
      );
    }
    return {
      category: b.category,
      planned: b.planned,
      actual,
      diff: roundMoney(b.planned - actual),
      kind: b.kind,
    };
  });

  const spendByCard = creditAccounts
    .map((a) => ({
      accountId: a.id,
      name: a.name,
      spend: roundMoney(
        txns
          .filter((t) => t.accountId === a.id && t.amount > 0)
          .reduce((s, t) => s + t.amount, 0),
      ),
    }))
    .sort((a, b) => b.spend - a.spend);

  return {
    month,
    cashStartBalance,
    cashEndBalance,
    incomePlanned: roundMoney(incomeBudgets.reduce((s, b) => s + b.planned, 0)),
    incomeActual,
    expensesPlanned: roundMoney(expenseBudgets.reduce((s, b) => s + b.planned, 0)),
    expensesActual,
    savingsPlanned: roundMoney(savingsBudgets.reduce((s, b) => s + b.planned, 0)),
    savingsActual,
    creditUtilization,
    portfolioUtilization: utilization(portfolioBalance, portfolioLimit),
    portfolioBalance,
    portfolioLimit,
    paymentsTo15Total: roundMoney(creditUtilization.reduce((s, r) => s + r.paymentsTo15, 0)),
    creditBudgetVariance,
    cashBudgetVariance,
    spendByCard,
  };
}

export async function buildRunningBalance(month: string, userId = "me"): Promise<RunningBalanceRow[]> {
  const accounts = await repo.listAccounts(userId);
  const checking = accounts.find((a) => a.type === "checking");
  if (!checking) return [];

  const snap = await repo.getMonthSnapshot(month, userId);
  const all = await repo.listTransactions({ userId, accountId: checking.id });
  const monthTxns = all.filter((t) => monthKey(t.date) === month);
  let running = snap?.cashStartBalance ?? 0;
  return monthTxns.map((t) => {
    running = roundMoney(running + t.amount);
    return {
      id: t.id,
      date: t.date,
      description: t.description,
      category: t.category,
      amount: t.amount,
      runningBalance: running,
    };
  });
}

export async function buildPaymentBatches(month: string, userId = "me") {
  const accounts = await repo.listAccounts(userId);
  const creditIds = new Set(accounts.filter((a) => a.type === "credit").map((a) => a.id));
  const txns = (await repo.listTransactions({ userId, month })).filter(
    (t) => creditIds.has(t.accountId) && (t.paymentBatch || t.category === "Payment") && t.amount < 0,
  );
  const groups = new Map<string, typeof txns>();
  for (const t of txns) {
    const key = t.paymentBatch || t.notes || "untagged";
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([batch, items]) => ({
    batch,
    total: roundMoney(items.reduce((s, t) => s + t.amount, 0)),
    items: items.map((t) => ({
      ...t,
      accountName: accounts.find((a) => a.id === t.accountId)?.name ?? t.accountId,
    })),
  }));
}

export async function buildWeeklyLadder(accountId: string, month: string, userId = "me") {
  const account = await repo.getAccount(accountId, userId);
  if (!account) return null;
  const txns = (await repo.listTransactions({ userId, accountId })).filter(
    (t) => monthKey(t.date) === month,
  );
  const start = account.previousStatementBalance ?? 0;
  // Group by ISO week start (Monday)
  const byWeek = new Map<string, { payments: number; spending: number }>();
  for (const t of txns) {
    const d = new Date(t.date + "T00:00:00");
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const key = monday.toISOString().slice(0, 10);
    const row = byWeek.get(key) ?? { payments: 0, spending: 0 };
    if (t.amount < 0) row.payments += t.amount;
    else row.spending += t.amount;
    byWeek.set(key, row);
  }
  let balance = start;
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => {
      balance = roundMoney(balance + v.spending + v.payments);
      return {
        weekStart,
        payments: roundMoney(v.payments),
        spending: roundMoney(v.spending),
        balance,
      };
    });
  return { account, weeks };
}
