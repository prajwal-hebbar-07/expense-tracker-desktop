---
id: persistence-sqlite
type: decision
status: active
updated: 2026-07-31
links: [stack, repo-layout]
---

# Persistence: SQLite via tauri-plugin-sql

Expenses are stored in a single SQLite file inside the macOS application data directory, reached through `tauri-plugin-sql` with the `sqlite` feature. The requirement it satisfies: data must survive app restarts, app updates, and machine reboots without the user running or backing up anything. SQLite is one file, needs no process, and is already the storage engine the OS itself uses everywhere.

⚠ **Decided, not implemented.** The plugin is not in `Cargo.toml` yet and no schema exists. Every code shape below is recalled and must be checked against the plugin's docs on first use — in particular the exact database URL resolution and the migration builder signature.

## Rules for an agent working here

1. **Never hardcode a database path.** Pass the URL as `sqlite:expenses.db` and let the plugin resolve it under the app's data directory, because a literal `~/…` path breaks the moment the app is sandboxed or the identifier changes.
2. **Change the schema only by appending a new `Migration` with the next `version`**, never by editing an existing one, because migrations already applied are recorded and will not re-run — an edited migration silently diverges from every installed copy.
3. **Store money as integer minor units** (paise/cents) in an `INTEGER` column, never `REAL`, because binary floating point cannot represent `0.10` and totals drift visibly on a page of expenses.
4. **Store timestamps as `TEXT` in ISO-8601 UTC** (`2026-07-31T09:25:00Z`), because SQLite has no date type and ISO-8601 strings sort correctly as text.
5. **Use bound parameters (`$1`, `$2`) for every value.** Never build SQL with template literals — the values are user-entered expense descriptions, a text field an agent must treat as untrusted input.
6. **Declare `NOT NULL` and `CHECK` constraints in the schema rather than validating only in TypeScript**, because the database is the one layer every code path passes through.
7. **Keep queries in Rust commands as the app grows.** The plugin's JS API is fine for early CRUD, but the moment a query has business logic in it, move it behind a `#[tauri::command]` — see rule 2 of [[stack]].

## Contract

Installation ⚠:

```
pnpm --filter desktop add @tauri-apps/plugin-sql
```

`apps/desktop/src-tauri/Cargo.toml`:

```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

`apps/desktop/src-tauri/src/lib.rs` — registered alongside the existing opener plugin:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_opener::init())
```

`apps/desktop/src-tauri/capabilities/default.json` — add to `permissions`:

```json
"sql:default"
```

⚠ Verify whether write access needs an explicit `sql:allow-execute` entry in addition to `sql:default`; the default set may be read-only.

### Database identity

| Item | Value |
|---|---|
| Connection URL | `sqlite:expenses.db` |
| Resolved location ⚠ | `~/Library/Application Support/com.hebbar.desktop/expenses.db` |
| Identifier it derives from | `identifier` in `tauri.conf.json` — see [[stack]] rule 7 |

### Schema, migration version 1

```sql
CREATE TABLE expense (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  amount      INTEGER NOT NULL CHECK (amount > 0),  -- minor units
  currency    TEXT    NOT NULL DEFAULT 'INR',
  description TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  spent_at    TEXT    NOT NULL,                     -- ISO-8601 UTC
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_expense_spent_at ON expense (spent_at);
```

`settings` is a separate key/value table (`key TEXT PRIMARY KEY`, `value TEXT NOT NULL`) holding only `base_url` and `model`. The Ollama API key is **not** a settings row — it lives in the macOS Keychain; see [[ollama-flow]].

### Frontend usage ⚠

```ts
import Database from "@tauri-apps/plugin-sql";

const db = await Database.load("sqlite:expenses.db");
await db.execute(
  "INSERT INTO expense (amount, currency, description, category, spent_at) VALUES ($1, $2, $3, $4, $5)",
  [amountMinor, "INR", description, category, spentAtIso],
);
const rows = await db.select<Expense[]>(
  "SELECT * FROM expense ORDER BY spent_at DESC LIMIT $1",
  [50],
);
```

`Database.load` on an already-loaded URL returns the existing connection, so calling it per component is safe but pointless — load once at app start.

## Anti-patterns

- **`REAL`/JS `number` for money.** In review this looks like `amount REAL` or `parseFloat(input)`. Totals will be off by cents and the bug surfaces weeks later.
- **Editing an existing migration to "fix" the schema.** Add version N+1 instead. A changed version-1 migration produces a schema that exists on no installed machine.
- **String-interpolated SQL:** `` db.select(`SELECT * FROM expense WHERE category = '${cat}'`) ``. Use `$1`.
- **Adding an ORM (Prisma, Drizzle, Diesel, SeaORM)** for a handful of tables. The plugin's `execute`/`select` is the whole API surface needed; an ORM here is a build step and a migration system competing with the one already in place.
- **A "just for now" JSON file or `localStorage` fallback.** WebView storage is wiped by cache clears and is not a database; there is no scenario where the user's expense history should live there.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `Database.load` rejects with a permission or "not allowed" error | `sql:default` missing from `capabilities/default.json` | Add the permission and restart `pnpm tauri dev` — capabilities are compiled in, not hot-reloaded |
| Schema changes have no effect after editing a migration | That version was already applied and recorded | Add a new migration with the next version; during early dev, deleting the `.db` file is acceptable — never after real data exists |
| Data missing after reinstall | Bundle `identifier` changed, moving the data directory | Restore the identifier; the old file is still on disk under the previous identifier |
| `UNIQUE constraint failed` on insert | Reusing an explicit `id` instead of letting `AUTOINCREMENT` assign it | Omit `id` from the `INSERT` column list |
| `database is locked` | Two connections writing concurrently | Load the database once and share the handle; do not open a connection per call |
| Totals off by a cent | Amount stored as `REAL` | Migrate to `INTEGER` minor units — rule 3 |
