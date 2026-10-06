import { FormEvent, useEffect, useState } from "react";
import type { Account, ProposedTransaction, StatementUpload } from "@pocketbook/shared";
import { api, money } from "../api";

export function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [uploads, setUploads] = useState<StatementUpload[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proposed, setProposed] = useState<ProposedTransaction[]>([]);
  const [activeUpload, setActiveUpload] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [a, u] = await Promise.all([api.accounts.list(), api.imports.list()]);
    setAccounts(a);
    setUploads(u);
    if (!accountId && a[0]) setAccountId(a[0].id);
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const { upload, uploadUrl, local } = await api.imports.presign({
        accountId,
        filename: file.name,
        contentType: file.type || "text/csv",
      });
      if (local) {
        await api.imports.localUpload(upload.id, file);
      } else {
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "text/csv" },
          body: file,
        });
        await api.imports.parse(upload.id);
      }
      setActiveUpload(upload.id);
      const rows = await api.imports.proposed(upload.id);
      setProposed(rows);
      await reload();
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadProposed(id: string) {
    setActiveUpload(id);
    setProposed(await api.imports.proposed(id));
  }

  async function accept(p: ProposedTransaction) {
    await api.imports.accept(p.id, p.uploadId);
    setProposed(await api.imports.proposed(p.uploadId));
  }

  async function reject(p: ProposedTransaction) {
    await api.imports.reject(p.id, p.uploadId);
    setProposed(await api.imports.proposed(p.uploadId));
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h1>Import statements</h1>
        <p className="muted">Upload CSV or OFX for accuracy checks. Review before committing.</p>
      </div>
      {error && <p className="error">{error}</p>}

      <form className="panel stack" onSubmit={onUpload}>
        <div className="form-row">
          <div className="field">
            <label>Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>File (.csv / .ofx)</label>
            <input
              type="file"
              accept=".csv,.ofx,.qfx,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload & parse"}
        </button>
      </form>

      <div className="panel">
        <h2>Recent uploads</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>Status</th>
                <th>Proposed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td>{new Date(u.createdAt).toLocaleString()}</td>
                  <td>{u.filename}</td>
                  <td>{u.status}</td>
                  <td>{u.proposedCount ?? "—"}</td>
                  <td>
                    <button className="btn ghost" type="button" onClick={() => loadProposed(u.id)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeUpload && (
        <div className="panel">
          <h2>Review queue</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {proposed.map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>
                      {p.description}
                      {p.duplicateOf && (
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          duplicate of {p.duplicateOf}
                        </div>
                      )}
                    </td>
                    <td>{money(p.amount)}</td>
                    <td>{p.status}</td>
                    <td className="row-actions">
                      {p.status === "pending" && (
                        <>
                          <button className="btn" type="button" onClick={() => accept(p)}>
                            Accept
                          </button>
                          <button className="btn danger" type="button" onClick={() => reject(p)}>
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
