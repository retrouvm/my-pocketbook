import { FormEvent, useEffect, useState } from "react";
import type { RunningBalanceRow } from "@pocketbook/shared";
import { api, money } from "../api";

export function RunningBalancePage({ month }: { month: string }) {
  const [rows, setRows] = useState<RunningBalanceRow[]>([]);
  const [start, setStart] = useState("0");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [rb, snap] = await Promise.all([
      api.reports.runningBalance(month),
      api.months.getSnapshot(month),
    ]);
    setRows(rb);
    if (snap) setStart(String(snap.cashStartBalance));
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [month]);

  async function saveStart(e: FormEvent) {
    e.preventDefault();
    await api.months.putSnapshot({ month, cashStartBalance: Number(start) });
    await reload();
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Running balance</h1>
        <p className="muted">Checking cashflow ledger — mirrors your Running Budget sheet.</p>
      </div>
      {error && <p className="error">{error}</p>}

      <form className="panel form-row" onSubmit={saveStart}>
        <div className="field">
          <label>Month start balance</label>
          <input value={start} onChange={(e) => setStart(e.target.value)} type="number" step="0.01" />
        </div>
        <div className="field" style={{ alignSelf: "end" }}>
          <button className="btn" type="submit">
            Save start balance
          </button>
        </div>
      </form>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Running balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.description}</td>
                  <td>{r.category}</td>
                  <td className={r.amount >= 0 ? "pos" : "neg"}>{money(r.amount)}</td>
                  <td>{money(r.runningBalance)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No checking transactions this month
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
