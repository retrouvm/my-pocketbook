export interface ParsedRow {
  date: string;
  description: string;
  amount: number;
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    let yyyy = mdy[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[",$\s]/g, "").replace(/\((.*)\)/, "-$1");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const split = (line: string) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cols.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = header.findIndex((h) => /date|posted|trans/.test(h));
  const descIdx = header.findIndex((h) => /desc|merchant|name|payee/.test(h));
  const amountIdx = header.findIndex((h) => /amount|debit|credit/.test(h));
  const debitIdx = header.findIndex((h) => h === "debit");
  const creditIdx = header.findIndex((h) => h === "credit");

  const rows: ParsedRow[] = [];
  const start = dateIdx >= 0 ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const cols = split(lines[i]);
    let date: string | null = null;
    let description = "";
    let amount: number | null = null;

    if (dateIdx >= 0) {
      date = normalizeDate(cols[dateIdx] ?? "");
      description = cols[descIdx >= 0 ? descIdx : 1] ?? "";
      if (amountIdx >= 0) amount = parseAmount(cols[amountIdx] ?? "");
      else if (debitIdx >= 0 || creditIdx >= 0) {
        const debit = parseAmount(cols[debitIdx] ?? "") ?? 0;
        const credit = parseAmount(cols[creditIdx] ?? "") ?? 0;
        amount = debit ? Math.abs(debit) : credit ? -Math.abs(credit) : null;
      }
    } else if (cols.length >= 3) {
      date = normalizeDate(cols[0] ?? "");
      description = cols[1] ?? "";
      amount = parseAmount(cols[2] ?? "");
    }

    if (date && description && amount != null) {
      rows.push({ date, description, amount });
    }
  }
  return rows;
}

function parseOfx(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const dateRaw =
      block.match(/<DTPOSTED>([^<\s]+)/i)?.[1] ??
      block.match(/<DTUSER>([^<\s]+)/i)?.[1] ??
      "";
    const amountRaw = block.match(/<TRNAMT>([^<\s]+)/i)?.[1] ?? "";
    const name =
      block.match(/<NAME>([^<]+)/i)?.[1]?.trim() ??
      block.match(/<MEMO>([^<]+)/i)?.[1]?.trim() ??
      "OFX transaction";
    const y = dateRaw.slice(0, 4);
    const m = dateRaw.slice(4, 6);
    const d = dateRaw.slice(6, 8);
    const date = normalizeDate(`${y}-${m}-${d}`);
    // OFX: expenses often negative; convert to pocketbook credit convention (charges > 0)
    let amount = parseAmount(amountRaw);
    if (date && amount != null) {
      amount = -amount;
      rows.push({ date, description: name, amount });
    }
  }
  return rows;
}

export function parseStatementText(text: string, filename = ""): ParsedRow[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".ofx") || lower.endsWith(".qfx") || text.includes("<OFX>") || text.includes("<STMTTRN>")) {
    return parseOfx(text);
  }
  return parseCsv(text);
}
