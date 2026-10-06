import { FormEvent, useEffect, useState } from "react";
import type { Account, Category, Transaction } from "@pocketbook/shared";
import { api, money } from "../api";

export function TransactionsPage({ month }: { month: string }) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    accountId: "",
    date: `${month}-01`,
    description: "",
    amount: "",
    subcategory: "Groceries - General Store",
    notes: "",
    paymentBatch: "",
  });

  async function reload() {
    const [t, a, c] = await Promise.all([
      api.transactions.list({ month }),
      api.accounts.list(),
      api.categories.list(),
    ]);
    setTxns(t);
    setAccounts(a);
    setCategories(c);
    if (!form.accountId && a[0]) setForm((f) => ({ ...f, accountId: a[0].id }));
  }

  useEffect(() => {
    setForm((f) => ({ ...f, date: `${month}-01` }));
    reload().catch((e) => setError(e.message));
  }, [month]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.transactions.create({
        accountId: form.accountId,
        date: form.date,
        description: form.description,
        amount: Number(form.amount),
        subcategory: form.subcategory,
        category: categories.find((c) => c.subcategory === form.subcategory)?.category ?? form.subcategory,
        notes: form.notes || undefined,
        paymentBatch: form.paymentBatch || undefined,
        source: "manual",
      });
      setForm((f) => ({ ...f, description: "", amount: "", notes: "", paymentBatch: "" }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function remove(t: Transaction) {
    await api.transactions.remove(t.id, t.accountId, t.date);
    await reload();
  }

  const creditSubs = categories.filter((c) => c.kind === "credit");
  const cashSubs = categories.filter((c) => c.kind === "cash");
  const account = accounts.find((a) => a.id === form.accountId);
  const subs = account?.type === "checking" ? cashSubs : creditSubs;

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Transactions</h1>
        <p className="muted">Manual entry with subcategory → parent category mapping.</p>
      </div>
      {error && <p className="error">{error}</p>}

      <form className="panel" onSubmit={onSubmit}>
        <h2>Quick add</h2>
        <div className="form-row">
          <div className="field">
            <label>Account</label>
            <select
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Amount</label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Subcategory</label>
            <select
              value={form.subcategory}
              onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
            >
              {subs.map((c) => (
                <option key={c.subcategory} value={c.subcategory}>
                  {c.subcategory} → {c.category}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="field">
            <label>Payment batch</label>
            <input
              placeholder="e.g. 1/10 payment"
              value={form.paymentBatch}
              onChange={(e) => setForm({ ...form, paymentBatch: e.target.value })}
            />
          </div>
        </div>
        <button className="btn" type="submit">
          Add transaction
        </button>
      </form>

      <div className="panel">
        <h2>{month} ledger</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{accounts.find((a) => a.id === t.accountId)?.name ?? t.accountId}</td>
                  <td>
                    {t.description}
                    {t.paymentBatch && (
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {t.paymentBatch}
                      </div>
                    )}
                  </td>
                  <td>
                    {t.subcategory}
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {t.category}
                    </div>
                  </td>
                  <td className={t.amount < 0 ? "pos" : undefined}>{money(t.amount)}</td>
                  <td>{t.source}</td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => remove(t)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
