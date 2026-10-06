import { FormEvent, useEffect, useState } from "react";
import type { Account, Category } from "@pocketbook/shared";
import { api, money } from "../api";

export function SettingsPage({ month }: { month: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({
    name: "",
    type: "credit" as Account["type"],
    creditLimit: "",
    currentBalance: "0",
    bestFor: "",
  });

  async function reload() {
    const [a, c] = await Promise.all([api.accounts.list(), api.categories.list()]);
    setAccounts(a);
    setCategories(c);
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);

  async function saveAccount(a: Account) {
    await api.accounts.update(a.id, a);
    await reload();
  }

  async function addAccount(e: FormEvent) {
    e.preventDefault();
    await api.accounts.create({
      name: newAccount.name,
      type: newAccount.type,
      creditLimit: newAccount.creditLimit ? Number(newAccount.creditLimit) : undefined,
      currentBalance: Number(newAccount.currentBalance || 0),
      bestFor: newAccount.bestFor || undefined,
      status: "active",
    });
    setNewAccount({ name: "", type: "credit", creditLimit: "", currentBalance: "0", bestFor: "" });
    await reload();
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Settings</h1>
        <p className="muted">
          Accounts, limits, and category taxonomy. Budgets for {month} live under Budgets.
        </p>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>Accounts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Limit</th>
                <th>Balance</th>
                <th>Best for</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input
                      defaultValue={a.name}
                      onBlur={(e) => saveAccount({ ...a, name: e.target.value })}
                    />
                  </td>
                  <td>{a.type}</td>
                  <td>
                    {a.type === "credit" ? (
                      <input
                        type="number"
                        defaultValue={a.creditLimit ?? 0}
                        onBlur={(e) =>
                          saveAccount({ ...a, creditLimit: Number(e.target.value) })
                        }
                        style={{ width: 100 }}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={a.currentBalance}
                      onBlur={(e) =>
                        saveAccount({ ...a, currentBalance: Number(e.target.value) })
                      }
                      style={{ width: 110 }}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={a.bestFor ?? ""}
                      onBlur={(e) => saveAccount({ ...a, bestFor: e.target.value })}
                    />
                  </td>
                  <td>{money(a.currentBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="form-row" style={{ marginTop: "1rem" }} onSubmit={addAccount}>
          <div className="field">
            <label>Name</label>
            <input
              value={newAccount.name}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={newAccount.type}
              onChange={(e) =>
                setNewAccount({ ...newAccount, type: e.target.value as Account["type"] })
              }
            >
              <option value="credit">credit</option>
              <option value="checking">checking</option>
            </select>
          </div>
          <div className="field">
            <label>Limit</label>
            <input
              value={newAccount.creditLimit}
              onChange={(e) => setNewAccount({ ...newAccount, creditLimit: e.target.value })}
            />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="btn" type="submit">
              Add account
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Category lookup</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Subcategory</th>
                <th>Parent category</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={`${c.kind}-${c.subcategory}`}>
                  <td>{c.kind}</td>
                  <td>{c.subcategory}</td>
                  <td>{c.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
