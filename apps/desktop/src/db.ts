import Database from "@tauri-apps/plugin-sql";
import { ANALYTICS_FEED, LOAD_ANALYSIS, SAVE_ANALYSIS } from "./queries";
import type { Txn } from "./analyticsFeed";
import type { Insight } from "./insights";

// One connection for the whole app, opened once at import. Loading the same URL
// again returns the existing handle, but two live connections writing at once
// means "database is locked". Opening it is also what runs pending migrations.
export const db = Database.load("sqlite:expenses.db");

// The `settings` key/value table from migration 1. One row per key, never a
// JSON blob in a `value` — see docs/persistence-sqlite.md. Accounts and cards
// are entity lists with their own tables and do not belong in here.
//
// These live in db.ts rather than a settings.ts because that filename collides
// with Settings.tsx on a case-insensitive filesystem, which tsc rejects.

/** The default `base_url`: ollama.com. A local daemon is `http://localhost:11434`
 *  and needs no key. Lives here rather than in OllamaSettings.tsx because every
 *  screen that calls a model has to fall back to the same value. */
export const CLOUD_URL = "https://ollama.com";

/** Every row, as an object. There are three keys; paging this is not a concern. */
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await (await db).select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
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

export async function loadAnalysis(from: string, to: string): Promise<StoredAnalysis | null> {
  const rows = await (await db).select<(Omit<StoredAnalysis, "insights"> & { insights: string })[]>(
    LOAD_ANALYSIS,
    [from, to],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  // A row this app wrote, so the parse should not fail — but a corrupted or
  // hand-edited value must not take the whole page down with it.
  let insights: Insight[] = [];
  try {
    const parsed: unknown = JSON.parse(row.insights);
    if (Array.isArray(parsed)) insights = parsed as Insight[];
  } catch {
    insights = [];
  }
  return { ...row, insights };
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
