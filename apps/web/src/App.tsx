import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { api, setTokenGetter } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { CardsPage } from "./pages/CardsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { RunningBalancePage } from "./pages/RunningBalancePage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PlaidPage } from "./pages/PlaidPage";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function App() {
  const auth = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    setTokenGetter(() => auth.idToken);
  }, [auth.idToken]);

  useEffect(() => {
    if (!auth.idToken || seeded) return;
    api
      .seed()
      .then(() => setSeeded(true))
      .catch(console.error);
  }, [auth.idToken, seeded]);

  if (!auth.ready) {
    return (
      <div className="login-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!auth.idToken) return <LoginPage />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          My <span>Pocketbook</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/cards">Credit cards</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/running-balance">Running balance</NavLink>
          <NavLink to="/budgets">Budgets</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/plaid">Plaid</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="stack" style={{ marginTop: "auto" }}>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {auth.email}
            {auth.localMode ? " · local" : ""}
          </span>
          <button className="btn ghost" type="button" onClick={auth.signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="month-picker">
            <label className="muted" htmlFor="month">
              Month
            </label>
            <input
              id="month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
        <Routes>
          <Route path="/" element={<OverviewPage month={month} />} />
          <Route path="/cards" element={<CardsPage month={month} />} />
          <Route path="/transactions" element={<TransactionsPage month={month} />} />
          <Route path="/running-balance" element={<RunningBalancePage month={month} />} />
          <Route path="/budgets" element={<BudgetsPage month={month} />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/plaid" element={<PlaidPage />} />
          <Route path="/settings" element={<SettingsPage month={month} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
