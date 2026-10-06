export type AccountType = "credit" | "checking";

export type TransactionSource = "manual" | "statement" | "plaid";

export type ImportReviewStatus = "pending" | "accepted" | "rejected" | "merged";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  creditLimit?: number;
  dueDay?: number;
  statementOpenDay?: number;
  statementCloseDay?: number;
  bestFor?: string;
  currentBalance: number;
  previousStatementBalance?: number;
  status: "active" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  subcategory: string;
  category: string;
  kind: "credit" | "cash";
}

export interface Budget {
  month: string; // YYYY-MM
  category: string;
  planned: number;
  kind: "credit" | "cash_expense" | "income" | "savings";
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  subcategory: string;
  category: string;
  notes?: string;
  paymentBatch?: string;
  source: TransactionSource;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthSnapshot {
  month: string;
  cashStartBalance: number;
  cashEndBalance?: number;
  notes?: string;
}

export interface ProposedTransaction {
  id: string;
  uploadId: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  subcategory?: string;
  category?: string;
  status: ImportReviewStatus;
  duplicateOf?: string;
  createdAt: string;
}

export interface StatementUpload {
  id: string;
  accountId: string;
  filename: string;
  s3Key: string;
  status: "uploaded" | "parsing" | "ready" | "failed";
  error?: string;
  proposedCount?: number;
  createdAt: string;
}

export interface PlaidItem {
  itemId: string;
  accessTokenSecretArn: string;
  institutionName?: string;
  accountIds: string[];
  cursor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilizationCardRow {
  accountId: string;
  name: string;
  creditLimit: number;
  currentBalance: number;
  utilization: number;
  paymentsTo15: number;
  spendingAllowance: number;
  previousStatementBalance: number;
}

export interface BudgetVarianceRow {
  category: string;
  planned: number;
  actual: number;
  diff: number;
  kind: Budget["kind"];
}

export interface OverviewReport {
  month: string;
  cashStartBalance: number;
  cashEndBalance: number;
  incomePlanned: number;
  incomeActual: number;
  expensesPlanned: number;
  expensesActual: number;
  savingsPlanned: number;
  savingsActual: number;
  creditUtilization: UtilizationCardRow[];
  portfolioUtilization: number;
  portfolioBalance: number;
  portfolioLimit: number;
  paymentsTo15Total: number;
  creditBudgetVariance: BudgetVarianceRow[];
  cashBudgetVariance: BudgetVarianceRow[];
  spendByCard: { accountId: string; name: string; spend: number }[];
}

export interface RunningBalanceRow {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  runningBalance: number;
}

export const UTILIZATION_TARGET = 0.15;

export const DEFAULT_CREDIT_CATEGORIES: Category[] = [
  { subcategory: "Coffee", category: "Dining", kind: "credit" },
  { subcategory: "Takeout", category: "Dining", kind: "credit" },
  { subcategory: "Alcohol", category: "Dining", kind: "credit" },
  { subcategory: "Sit-Down Restaurant", category: "Dining", kind: "credit" },
  { subcategory: "Groceries - Sams", category: "Groceries", kind: "credit" },
  { subcategory: "Groceries - Costco", category: "Groceries", kind: "credit" },
  { subcategory: "Groceries - General Store", category: "Groceries", kind: "credit" },
  { subcategory: "Movies", category: "Entertainment", kind: "credit" },
  { subcategory: "Events/Concerts", category: "Entertainment", kind: "credit" },
  { subcategory: "Hobbies", category: "Entertainment", kind: "credit" },
  { subcategory: "Books/Magazines", category: "Entertainment", kind: "credit" },
  { subcategory: "Games", category: "Entertainment", kind: "credit" },
  { subcategory: "Cleaning Supplies", category: "Non-Food Items", kind: "credit" },
  { subcategory: "Toiletries", category: "Non-Food Items", kind: "credit" },
  { subcategory: "Home Essentials", category: "Non-Food Items", kind: "credit" },
  { subcategory: "Office Supplies", category: "Non-Food Items", kind: "credit" },
  { subcategory: "Furniture/Decor", category: "Non-Food Items", kind: "credit" },
  { subcategory: "Fuel – Costco", category: "Car Expenses", kind: "credit" },
  { subcategory: "Fuel – Sams", category: "Car Expenses", kind: "credit" },
  { subcategory: "Fuel - Gas Station", category: "Car Expenses", kind: "credit" },
  { subcategory: "Car Maintenance", category: "Car Expenses", kind: "credit" },
  { subcategory: "Car Repairs", category: "Car Expenses", kind: "credit" },
  { subcategory: "Car Accessories/Decor", category: "Car Expenses", kind: "credit" },
  { subcategory: "Music Streaming", category: "Streaming", kind: "credit" },
  { subcategory: "Video Streaming", category: "Streaming", kind: "credit" },
  { subcategory: "Gym Membership", category: "Subscriptions", kind: "credit" },
  { subcategory: "Storage", category: "Subscriptions", kind: "credit" },
  { subcategory: "Memberships", category: "Subscriptions", kind: "credit" },
  { subcategory: "Productivity Tools", category: "Subscriptions", kind: "credit" },
  { subcategory: "Softwares", category: "Subscriptions", kind: "credit" },
  { subcategory: "Phone/Internet", category: "Subscriptions", kind: "credit" },
  { subcategory: "Clothing/Shoes", category: "Personal Spending", kind: "credit" },
  { subcategory: "Accessories", category: "Personal Spending", kind: "credit" },
  { subcategory: "Hair Styling", category: "Personal Spending", kind: "credit" },
  { subcategory: "Wellness/Therapy", category: "Personal Spending", kind: "credit" },
  { subcategory: "Payment", category: "Payment", kind: "credit" },
  { subcategory: "Credit", category: "Payment", kind: "credit" },
];

export const DEFAULT_CASH_CATEGORIES: Category[] = [
  { subcategory: "Rent", category: "Rent", kind: "cash" },
  { subcategory: "Debt (Loans)", category: "Debt (Loans)", kind: "cash" },
  { subcategory: "Debt (Credit Cards)", category: "Debt (Credit Cards)", kind: "cash" },
  { subcategory: "Utilities", category: "Utilities", kind: "cash" },
  { subcategory: "Paycheck", category: "Paycheck", kind: "cash" },
  { subcategory: "Bonus", category: "Bonus", kind: "cash" },
  { subcategory: "Emergency Fund", category: "Emergency Fund", kind: "cash" },
  { subcategory: "Car Maintenance+", category: "Car Maintenance+", kind: "cash" },
  { subcategory: "Health + Fitness", category: "Health + Fitness", kind: "cash" },
  { subcategory: "Travel & Fun", category: "Travel & Fun", kind: "cash" },
  { subcategory: "Home Upgrades+", category: "Home Upgrades+", kind: "cash" },
  { subcategory: "Family Fund", category: "Family Fund", kind: "cash" },
];

/** Demo planned amounts only — replace with your own after seed. */
export const DEFAULT_CREDIT_BUDGETS: Omit<Budget, "month">[] = [
  { category: "Dining", planned: 200, kind: "credit" },
  { category: "Groceries", planned: 400, kind: "credit" },
  { category: "Entertainment", planned: 50, kind: "credit" },
  { category: "Non-Food Items", planned: 100, kind: "credit" },
  { category: "Car Expenses", planned: 200, kind: "credit" },
  { category: "Streaming", planned: 40, kind: "credit" },
  { category: "Subscriptions", planned: 100, kind: "credit" },
  { category: "Personal Spending", planned: 200, kind: "credit" },
];

/** Demo planned amounts only — replace with your own after seed. */
export const DEFAULT_CASH_BUDGETS: Omit<Budget, "month">[] = [
  { category: "Rent", planned: 1500, kind: "cash_expense" },
  { category: "Debt (Loans)", planned: 500, kind: "cash_expense" },
  { category: "Debt (Credit Cards)", planned: 500, kind: "cash_expense" },
  { category: "Utilities", planned: 200, kind: "cash_expense" },
  { category: "Paycheck", planned: 4000, kind: "income" },
  { category: "Bonus", planned: 0, kind: "income" },
  { category: "Emergency Fund", planned: 200, kind: "savings" },
  { category: "Car Maintenance+", planned: 50, kind: "savings" },
  { category: "Health + Fitness", planned: 50, kind: "savings" },
  { category: "Travel & Fun", planned: 100, kind: "savings" },
  { category: "Home Upgrades+", planned: 100, kind: "savings" },
  { category: "Family Fund", planned: 100, kind: "savings" },
];

/** Generic demo accounts — not real card inventory. */
export const DEFAULT_ACCOUNTS: Omit<Account, "id" | "createdAt" | "updatedAt">[] = [
  { name: "Rewards Card", type: "credit", creditLimit: 2000, currentBalance: 0, status: "active", bestFor: "Dining & groceries" },
  { name: "Everyday Card", type: "credit", creditLimit: 1000, currentBalance: 0, status: "active" },
  { name: "Backup Card", type: "credit", creditLimit: 500, currentBalance: 0, status: "active" },
  { name: "Checking", type: "checking", currentBalance: 0, status: "active" },
];

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function utilization(balance: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return balance / limit;
}

export function paymentsToTarget(balance: number, limit: number, target = UTILIZATION_TARGET): number {
  if (!limit || limit <= 0) return 0;
  const targetBalance = limit * target;
  return Math.max(0, balance - targetBalance);
}

export function spendingAllowance(balance: number, limit: number, target = 0.1599): number {
  if (!limit || limit <= 0) return 0;
  const room = limit * target - balance;
  return Math.max(0, room);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
