import { useEffect, useState } from "react";
import type { Budget } from "@pocketbook/shared";
import { api, money } from "../api";

export function BudgetsPage({ month }: { month: string }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.budgets
      .list(month)
      .then(setBudgets)
      .catch((e) => setError(e.message));
  }, [month]);

  async function update(b: Budget, planned: number) {
    const next = { ...b, planned };
    await api.budgets.upsert(next);
    setBudgets((list) => list.map((x) => (x.category === b.category ? next : x)));
  }

  const groups: Budget["kind"][] = ["credit", "cash_expense", "income", "savings"];

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Budgets</h1>
        <p className="muted">Planned amounts for CC parents, fixed cash, income, and envelopes.</p>
      </div>
      {error && <p className="error">{error}</p>}

      {groups.map((kind) => {
        const rows = budgets.filter((b) => b.kind === kind);
        if (!rows.length) return null;
        return (
          <div className="panel" key={kind}>
            <h2>{kind.replace("_", " ")}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Planned</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.category}>
                      <td>{b.category}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={b.planned}
                          onBlur={(e) => update(b, Number(e.target.value))}
                          style={{ width: 120 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Total {money(rows.reduce((s, r) => s + r.planned, 0))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
