import { useEffect, useState } from "react";
import type { Account } from "@pocketbook/shared";
import { api, money, pct } from "../api";

export function CardsPage({ month }: { month: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [ladder, setLadder] = useState<
    { weekStart: string; payments: number; spending: number; balance: number }[]
  >([]);
  const [batches, setBatches] = useState<
    { batch: string; total: number; items: { accountName: string; amount: number; description: string }[] }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts
      .list()
      .then((list) => {
        const cards = list.filter((a) => a.type === "credit");
        setAccounts(cards);
        if (!selected && cards[0]) setSelected(cards[0].id);
      })
      .catch((e) => setError(e.message));
    api.reports
      .paymentBatches(month)
      .then(setBatches)
      .catch((e) => setError(e.message));
  }, [month]);

  useEffect(() => {
    if (!selected) return;
    api.reports
      .weeklyLadder(selected, month)
      .then((d) => setLadder(d.weeks))
      .catch((e) => setError(e.message));
  }, [selected, month]);

  const card = accounts.find((a) => a.id === selected);

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Credit cards</h1>
        <p className="muted">Per-card balances, weekly ladder, and payment batches.</p>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <div className="form-row">
          <div className="field">
            <label htmlFor="card">Card</label>
            <select id="card" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {card && (
          <div className="grid stats">
            <div>
              <div className="stat-label">Current balance</div>
              <div className="stat-value">{money(card.currentBalance)}</div>
            </div>
            <div>
              <div className="stat-label">Limit</div>
              <div className="stat-value">{money(card.creditLimit ?? 0)}</div>
            </div>
            <div>
              <div className="stat-label">Utilization</div>
              <div className="stat-value">
                {pct((card.currentBalance || 0) / (card.creditLimit || 1))}
              </div>
            </div>
            <div>
              <div className="stat-label">Best for</div>
              <div>{card.bestFor || "—"}</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Weekly balance ladder</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week start</th>
                <th>Payments</th>
                <th>Added spending</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((w) => (
                <tr key={w.weekStart}>
                  <td>{w.weekStart}</td>
                  <td className="pos">{money(w.payments)}</td>
                  <td className="neg">{money(w.spending)}</td>
                  <td>{money(w.balance)}</td>
                </tr>
              ))}
              {ladder.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No activity this month
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Payment planner</h2>
        {batches.length === 0 && <p className="muted">No payment batches tagged this month.</p>}
        {batches.map((b) => (
          <div key={b.batch} style={{ marginBottom: "1rem" }}>
            <strong>{b.batch}</strong>{" "}
            <span className="muted">{money(b.total)}</span>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Card</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {b.items.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.accountName}</td>
                      <td>{i.description}</td>
                      <td>{money(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
