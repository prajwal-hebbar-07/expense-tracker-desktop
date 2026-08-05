import Database from "@tauri-apps/plugin-sql";
import {
  ANALYTICS_FEED,
  LOAD_ANALYSIS,
  LOAD_REPORT,
  SAVE_ANALYSIS,
  SAVE_REPORT,
} from "./queries";
import type { Txn } from "./analyticsFeed";
import type { Insight } from "./insights";
import type { Written } from "./reportAi";

// One connection for the whole app, opened once at import. Loading the same URL
// again returns the existing handle, but two live connections writing at once
// means "database is locked". Opening it is also what runs pending migrations.
export const db = Database.load("sqlite:expenses.db");

// Scalar AI configuration stays in `settings`. API credentials are a list, so
// migration 9 moved them into `ollama_account` instead of encoding JSON here.
// These live in db.ts rather than a settings.ts because that filename collides
// with Settings.tsx on a case-insensitive filesystem, which tsc rejects.

/** The default `base_url`: ollama.com. A local daemon is `http://localhost:11434`
 *  and needs no key. Every caller falls back to the same value here. */
export const CLOUD_URL = "https://ollama.com";

export type OllamaAccount = {
  id: number;
  name: string;
  api_key: string;
  active: 0 | 1;
};

export type OllamaConfig = {
  base_url: string;
  model: string;
  api_key: string;
};

/** The exact configuration every model call should use. No active account is a
 *  valid no-key configuration for a local daemon. */
export async function getOllamaConfig(): Promise<OllamaConfig> {
  const rows = await (await db).select<OllamaConfig[]>(`
    SELECT
      COALESCE((SELECT value FROM settings WHERE key = 'base_url'), '${CLOUD_URL}') AS base_url,
      COALESCE((SELECT value FROM settings WHERE key = 'model'), '') AS model,
      COALESCE((SELECT api_key FROM ollama_account WHERE active = 1), '') AS api_key
  `);
  return rows[0];
}

export async function getOllamaAccounts(): Promise<OllamaAccount[]> {
  return (await db).select<OllamaAccount[]>(
    "SELECT id, name, api_key, active FROM ollama_account ORDER BY active DESC, name COLLATE NOCASE",
  );
}

/** Clear first so the partial unique index is never transiently violated when
 *  switching from a newer row to an older one. `null` deliberately selects no
 *  key for a local daemon. */
export async function setActiveOllamaAccount(id: number | null) {
  const conn = await db;
  await conn.execute("UPDATE ollama_account SET active = 0 WHERE active = 1");
  if (id !== null) await conn.execute("UPDATE ollama_account SET active = 1 WHERE id = $1", [id]);
}

export async function addOllamaAccount(name: string, apiKey: string): Promise<OllamaAccount> {
  const result = await (await db).execute(
    "INSERT INTO ollama_account (name, api_key) VALUES ($1, $2)",
    [name, apiKey],
  );
  if (result.lastInsertId === undefined) throw new Error("The API key was saved without an id.");
  await setActiveOllamaAccount(result.lastInsertId);
  return { id: result.lastInsertId, name, api_key: apiKey, active: 1 };
}

export async function updateOllamaAccountKey(id: number, apiKey: string) {
  await (await db).execute("UPDATE ollama_account SET api_key = $1 WHERE id = $2", [apiKey, id]);
}

export async function deleteOllamaAccount(id: number) {
  await (await db).execute("DELETE FROM ollama_account WHERE id = $1", [id]);
}

/** Insert or overwrite. `key` is a literal from the caller, `value` is bound. */
export async function setSetting(key: string, value: string) {
  await (await db).execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

/** One window of the ledger, shaped as the feed the charts read. Both the
 *  period and its comparison come out of a single call — `usePeriod` asks for
 *  `prev.from … win.to`, which spans both — see docs/analytics-real-feed.md. */
export const loadFeed = async (from: string, to: string) =>
  (await (await db).select<Txn[]>(ANALYTICS_FEED, [from, to]));

/** What the model wrote about one window, and what the figures looked like at
 *  the time. `insights` is stored as JSON: it is a document read back whole,
 *  never queried by field — see docs/analysis-persistence.md. */
export type StoredAnalysis = {
  model: string;
  summary: string;
  insights: Insight[];
  fingerprint: string;
  created_at: string;
};

/** A JSON array column, back as a list. A row this app wrote, so the parse
 *  should not fail — but a corrupted or hand-edited value must cost the
 *  section it feeds, never the page. */
function list<T>(json: string): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function loadAnalysis(from: string, to: string): Promise<StoredAnalysis | null> {
  const rows = await (await db).select<(Omit<StoredAnalysis, "insights"> & { insights: string })[]>(
    LOAD_ANALYSIS,
    [from, to],
  );
  if (rows.length === 0) return null;
  return { ...rows[0], insights: list<Insight>(rows[0].insights) };
}

export async function saveAnalysis(
  from: string,
  to: string,
  a: Omit<StoredAnalysis, "created_at">,
) {
  await (await db).execute(SAVE_ANALYSIS, [
    from,
    to,
    a.model,
    a.summary,
    JSON.stringify(a.insights),
    a.fingerprint,
  ]);
}

/** What the model wrote about one Report window. The figures on the page are
 *  still computed from the ledger on every render — only the prose is stored,
 *  so a report read back from here can never contradict the split bar above
 *  it. See docs/report-ai.md. */
export type StoredReport = Written & {
  model: string;
  fingerprint: string;
  created_at: string;
};

/** The three JSON columns, as they come out of SQLite. */
type ReportRow = Omit<StoredReport, "findings" | "habits" | "reframes"> & {
  findings: string;
  habits: string;
  reframes: string;
};

export async function loadReport(from: string, to: string): Promise<StoredReport | null> {
  const rows = await (await db).select<ReportRow[]>(LOAD_REPORT, [from, to]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    findings: list<StoredReport["findings"][number]>(row.findings),
    habits: list<StoredReport["habits"][number]>(row.habits),
    reframes: list<StoredReport["reframes"][number]>(row.reframes),
  };
}

export async function saveReport(from: string, to: string, r: Omit<StoredReport, "created_at">) {
  await (await db).execute(SAVE_REPORT, [
    from,
    to,
    r.model,
    r.headline,
    JSON.stringify(r.findings),
    JSON.stringify(r.habits),
    JSON.stringify(r.reframes),
    r.fingerprint,
  ]);
}
