import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OverviewReport } from "@pocketbook/shared";
import { api, money, pct } from "../api";

export function OverviewPage({ month }: { month: string }) {
  const [data, setData] = useState<OverviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.reports
      .overview(month)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [month]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading overview…</p>;

  const utilClass =
    data.portfolioUtilization > 0.15 ? "bad" : data.portfolioUtilization > 0.12 ? "warn" : "good";

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Overview</h1>
        <p className="muted">Cash position, credit utilization (15% target), and category variance.</p>
      </div>

      <div className="grid stats">
        <div className="panel">
          <div className="stat-label">Cash start</div>
          <div className="stat-value">{money(data.cashStartBalance)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Cash end</div>
          <div className="stat-value">{money(data.cashEndBalance)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Income actual</div>
          <div className="stat-value good">{money(data.incomeActual)}</div>
          <div className="muted">planned {money(data.incomePlanned)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Expenses actual</div>
          <div className="stat-value">{money(data.expensesActual)}</div>
          <div className="muted">planned {money(data.expensesPlanned)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Savings actual</div>
          <div className="stat-value">{money(data.savingsActual)}</div>
          <div className="muted">planned {money(data.savingsPlanned)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Portfolio utilization</div>
          <div className={`stat-value ${utilClass}`}>{pct(data.portfolioUtilization)}</div>
          <div className="muted">
            {money(data.portfolioBalance)} / {money(data.portfolioLimit)} · pay{" "}
            {money(data.paymentsTo15Total)} to 15%
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <h2>Credit utilization by card</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart
                data={data.creditUtilization.map((c) => ({
                  name: c.name,
                  utilization: Number((c.utilization * 100).toFixed(1)),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(232,242,236,0.1)" />
                <XAxis dataKey="name" tick={{ fill: "#9bb5a8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9bb5a8", fontSize: 11 }} unit="%" />
                <Tooltip />
                <Bar dataKey="utilization" fill="#3ecf8e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h2>Spend by card</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data.spendByCard}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(232,242,236,0.1)" />
                <XAxis dataKey="name" tick={{ fill: "#9bb5a8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9bb5a8", fontSize: 11 }} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="spend" fill="#e8b84a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <h2>CC category variance</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {data.creditBudgetVariance.map((r) => (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td>{money(r.planned)}</td>
                    <td>{money(r.actual)}</td>
                    <td className={r.diff < 0 ? "neg" : "pos"}>{money(r.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>Cash / envelope variance</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {data.cashBudgetVariance.map((r) => (
                  <tr key={r.category}>
                    <td>
                      {r.category}
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {r.kind}
                      </div>
                    </td>
                    <td>{money(r.planned)}</td>
                    <td>{money(r.actual)}</td>
                    <td className={r.diff < 0 ? "neg" : "pos"}>{money(r.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Payments to 15%</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Card</th>
                <th>Balance</th>
                <th>Limit</th>
                <th>Util</th>
                <th>Pay to 15%</th>
                <th>Spend room</th>
              </tr>
            </thead>
            <tbody>
              {data.creditUtilization.map((c) => (
                <tr key={c.accountId}>
                  <td>{c.name}</td>
                  <td>{money(c.currentBalance)}</td>
                  <td>{money(c.creditLimit)}</td>
                  <td className={c.utilization > 0.15 ? "neg" : "pos"}>{pct(c.utilization)}</td>
                  <td>{money(c.paymentsTo15)}</td>
                  <td>
                    {c.spendingAllowance <= 0 ? (
                      <span className="neg">No spending allowed</span>
                    ) : (
                      money(c.spendingAllowance)
                    )}
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
