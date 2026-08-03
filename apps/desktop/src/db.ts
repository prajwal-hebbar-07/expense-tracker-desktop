import Database from "@tauri-apps/plugin-sql";

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
