---
id: db-reset-in-app
type: decision
status: active
updated: 2026-08-08
links: [persistence-sqlite, reset-db, settings-schema, derived-balances]
---

# Resetting the database from Settings

The Settings screen ends in a **Danger zone** whose one button clears the database completely — every transaction, account, card, stored analysis and report, and every Ollama account and API key — then reloads the app. It exists so a reset does not require a terminal, which [[reset-db]] does.

It **clears rows; it does not delete the file.** The app holds the connection open (`db.ts` opens it once at import), so unlinking the file underneath itself would leave the WebView writing to an inode nothing can reach. That single constraint is what makes this a different mechanism from the dev script rather than a button wired to the same code.

**Implemented and verified 2026-08-08.** The algorithm was exercised against a copy of a real 16-expense database with `PRAGMA foreign_keys = ON`: `DELETE FROM account` alone fails with `FOREIGN KEY constraint failed`, the loop clears all seven tables in one pass in `sqlite_master` order and in two passes when fed the adverse order, `_sqlx_migrations` keeps its 9 rows and `sqlite_sequence` ends empty. The button itself was then run in `pnpm tauri dev` against the live database, which ended with all tables empty, the schema intact and migrations preserved.

## Rules for an agent working here

1. **Take the table list from `sqlite_master`, never a literal array.** A written-down list stops meaning "everything" the first time a migration adds a table, and the failure is silent — the new table simply survives a wipe the user was told was total.
2. **Never clear `_sqlx_migrations`.** It is bookkeeping, not user data. Emptied, the plugin re-runs all nine migrations against tables that still exist, fails on the first `CREATE TABLE`, and the app can no longer open its own database. This is the one exclusion that turns a reset into a brick.
3. **Do not try to wrap it in a transaction.** `execute` runs against a pool ([[persistence-sqlite]]; `tauri-plugin-sql` `wrapper.rs` calls `sqlx::query` on the pool), so consecutive calls may take different connections and `BEGIN`/`COMMIT` would not span them — the same constraint that makes a self-transfer one row rather than two, see [[derived-balances]]. The operation is idempotent instead: a partial reset is fixed by running it again.
4. **Delete children before parents, or retry until a pass makes no progress.** sqlx enables `PRAGMA foreign_keys = ON` by default (verified in `sqlx-sqlite` 0.8.6 `src/options/mod.rs:185`), so `account` cannot be emptied while an `expense` row references it. The retry loop is there so a deeper FK chain added later still resets without anyone remembering to re-sort.
5. **Reload the window afterwards; do not refresh in place.** Screens hold their own state read from the database — `OllamaSettings` its account list, Reports its stored prose — and Settings can only refresh its own two lists. `window.location.reload()` is the one call that makes every screen re-read an empty database.
6. **Keep the two-step confirmation.** Reuse `ConfirmDelete`, which exists because `window.confirm()` silently returns `false` in wry — see [[webview-dialogs]]. A one-click irreversible wipe of a financial ledger is not acceptable, and a bespoke modal here would fork the app's one destructive-action pattern.

## Contract

`resetDatabase()` in `apps/desktop/src/db.ts`:

```sql
SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations'
```

then `DELETE FROM <name>` per table, failures retried until a pass clears nothing (at which point the last error is thrown), then `DELETE FROM sqlite_sequence` with its failure tolerated — that table only exists once an `AUTOINCREMENT` table has been written to.

| Concern | Resolution |
|---|---|
| What survives | The schema, and `_sqlx_migrations` — rule 2 |
| What is cleared | Every other table, including `settings` and `ollama_account` (API keys) |
| `AUTOINCREMENT` | Restarts at 1, because `sqlite_sequence` is emptied |
| Atomicity | None available — rule 3. Re-run to finish a partial reset |
| Injection | Table names come back out of `sqlite_master`, never from user input |

`apps/desktop/src/Settings.tsx` owns the UI: `resetting` boolean state, separate from `pending` because `pending` identifies one row by table and id while this belongs to no row. Escape backs out of both. On confirm, `run()` surfaces any rejection in the page-level error box, then `window.location.reload()`.

## Anti-patterns

- **A literal table list** — `["expense", "account", …]`. It reads as more explicit and is strictly worse: it is wrong the moment migration 10 lands, and nothing fails to tell you.
- **Clearing `_sqlx_migrations` to "start completely fresh".** It bricks the app; rule 2.
- **`DROP TABLE` instead of `DELETE FROM`.** Same outcome as clearing the migration table, reached from the other direction: the schema is gone and migrations will not rebuild it.
- **Calling `refresh()` instead of reloading.** Settings looks correct while Reports still shows prose about a ledger that no longer exists.
- **Skipping the confirmation because the dev script has one.** They are different surfaces with different users; the terminal one is not reachable from the app.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Error box reads `FOREIGN KEY constraint failed` | A pass cleared nothing, so the loop rethrew — an FK cycle, or a genuine constraint problem the ordering cannot resolve | Inspect `PRAGMA foreign_key_list` for the blocked table; a true cycle needs `PRAGMA defer_foreign_keys` inside a real transaction, which means moving this behind a `#[tauri::command]` |
| Some tables cleared, others not, no error | A pass failed and the reset was abandoned midway | Run it again — it is idempotent |
| App will not start after a reset, complains a table already exists | `_sqlx_migrations` was cleared, so migrations re-ran | Restore a backup, or delete the file with [[reset-db]] and let migrations rebuild from nothing |
| New table added by a migration still has rows after a reset | The table list was hardcoded instead of read from `sqlite_master` | Rule 1 |
| Settings looks empty but another screen still shows old data | The reload did not happen | Rule 5 |
| Ollama stops working after a reset | Expected: `ollama_account` and `settings` are cleared, so the API key and model are gone | Re-add the account in Settings |
