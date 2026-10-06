import { FormEvent, useEffect, useState } from "react";
import type { Account } from "@pocketbook/shared";
import { api } from "../api";

/**
 * Plaid Link UI: when PLAID is configured on the API, create a link token.
 * Full Link JS embed requires react-plaid-link; here we expose token + exchange
 * for sandbox/manual public_token testing, plus sync controls.
 */
export function PlaidPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [items, setItems] = useState<{ itemId: string; institutionName?: string; accountIds: string[] }[]>(
    [],
  );
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [a, i] = await Promise.all([api.accounts.list(), api.plaid.items()]);
    setAccounts(a);
    setItems(i);
    if (!accountId && a[0]) setAccountId(a[0].id);
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);

  async function createLinkToken() {
    setError(null);
    setMessage(null);
    try {
      const res = await api.plaid.linkToken();
      setLinkToken(res.linkToken);
      setMessage("Link token created. Use Plaid Link (or sandbox public_token) to connect.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function exchange(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.plaid.exchange(publicToken, accountId || undefined);
      setMessage(`Linked item ${res.itemId}`);
      setPublicToken("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exchange failed");
    }
  }

  async function sync(itemId?: string) {
    setError(null);
    try {
      const res = await api.plaid.sync(itemId);
      setMessage(`Sync complete: ${JSON.stringify(res.results)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    }
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Plaid</h1>
        <p className="muted">
          Phase 3: connect institutions when ready. Configure PLAID_CLIENT_ID / PLAID_SECRET on the
          API. Until then, use manual entry and statement import.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="pos">{message}</p>}

      <div className="panel stack">
        <h2>Connect</h2>
        <div className="field">
          <label>Map new item to account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="button" onClick={createLinkToken}>
          Create link token
        </button>
        {linkToken && (
          <p className="muted" style={{ wordBreak: "break-all" }}>
            link_token: {linkToken}
          </p>
        )}
        <form className="stack" onSubmit={exchange}>
          <div className="field">
            <label>Public token (sandbox / Link onSuccess)</label>
            <input value={publicToken} onChange={(e) => setPublicToken(e.target.value)} required />
          </div>
          <button className="btn" type="submit">
            Exchange token
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Linked items</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item ID</th>
                <th>Institution</th>
                <th>Accounts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.itemId}>
                  <td>{i.itemId}</td>
                  <td>{i.institutionName ?? "—"}</td>
                  <td>{i.accountIds.join(", ") || "—"}</td>
                  <td>
                    <button className="btn ghost" type="button" onClick={() => sync(i.itemId)}>
                      Sync now
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No Plaid items yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" type="button" onClick={() => sync()} style={{ marginTop: "0.75rem" }}>
          Sync all
        </button>
      </div>
    </div>
  );
}
