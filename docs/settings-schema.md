---
id: settings-schema
type: decision
status: active
updated: 2026-08-03
links: [persistence-sqlite, stack, derived-balances, transaction-ledger, ollama-flow]
---

# Accounts and cards schema

The Settings screen records which bank each account is in and its current balance, plus which credit cards the user holds. These are **entity lists, not settings rows** — they live in their own `account` and `card` tables, added by migration 2. The `settings` key/value table stays reserved for the two Ollama rows described in [[persistence-sqlite]]; putting an account in it would mean encoding a list into a single `value` string.

The screen also renders `OllamaSettings`, which configures the AI backend. That section owns none of the tables here — see [[ollama-flow]].

⚠ Since migration 3, `account.balance` is the **opening** balance, not the current one — transactions are not written back into it. Every rule below still applies to it; see [[derived-balances]] before reading or editing that column.

There is no authentication and no `user_id` column anywhere: one person uses this app on one machine, and a foreign key to a users table that will never have a second row is pure ceremony.

## Rules for an agent working here

1. **Never add `CHECK (balance > 0)` to `account`**, because an account can legitimately sit at zero or be overdrawn. `expense.amount` has that check for the opposite reason — a negative expense is nonsense. Copying the constraint across makes an overdraft unrecordable.
2. **Keep `last4` as `TEXT`**, because a card ending `0421` stored as `INTEGER` becomes `421`. The `GLOB '[0-9][0-9][0-9][0-9]'` check enforces exactly four digits and rejects `12x4` and `421` alike.
3. **Set `updated_at` explicitly in every `UPDATE`**, because a column `DEFAULT` only fires on `INSERT`. An edit that omits it silently leaves the old timestamp, which reads as "this balance is current" when it is not.
4. **Convert amounts with `toMinor()` from `apps/desktop/src/money.ts`, never `parseFloat`**, because `parseFloat("8.20") * 100` is `819.9999999999999`. `toMinor` returns `null` on bad input so the caller must handle it — do not coerce a typo into a number.
5. **Timestamp new columns with `strftime('%Y-%m-%dT%H:%M:%SZ','now')`, not `datetime('now')`** — see the format wart below.
6. **Bank and card names are free text and must always be bound as `$1`/`$2`.** They are the highest-risk untrusted input on this screen.

## Contract

Migration 2, `create_account_and_card_tables`, in `apps/desktop/src-tauri/src/lib.rs`:

```sql
CREATE TABLE account (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bank       TEXT    NOT NULL CHECK (length(trim(bank)) > 0),
  balance    INTEGER NOT NULL,                    -- minor units; may be negative
  currency   TEXT    NOT NULL DEFAULT 'INR',
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE card (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bank       TEXT    NOT NULL CHECK (length(trim(bank)) > 0),
  name       TEXT,                                -- e.g. "Regalia Gold"; NULL = bank only
  last4      TEXT    CHECK (last4 IS NULL OR last4 GLOB '[0-9][0-9][0-9][0-9]'),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

`name` and `last4` are nullable because the user may only know the issuing bank. `bank` never is.

### Money helpers — `apps/desktop/src/money.ts`

| Function | Contract |
|---|---|
| `toMinor(input: string)` | `"1245.50" → 124550`, `"1245.5" → 124550`, `"-300.25" → -30025`. Returns `null` for `""`, `"abc"`, `"1.234"`, `"1,245"`, `"1e3"`, `".5"`, `"12."` |
| `fromMinor(paise: number)` | `124550 → "1245.50"`. Inverse of `toMinor`; used to populate the edit field |
| `formatAmount(paise, currency)` | Display only — `124550 → "₹1,245.50"`. Never feed its output back into `toMinor` |

Checked by `apps/desktop/money.check.ts`, run with `pnpm --filter desktop test`. It lives outside `src/` because `tsconfig.json` has `include: ["src"]` and no `@types/node`, so a `node:test` import inside `src/` would fail `tsc --noEmit`. Node 24 runs it with no flags.

### ⚠ Timestamp format wart

Migration 1 used `datetime('now')`, which produces `2026-07-31 09:25:00` — no `T`, no `Z`, contradicting rule 4 of [[persistence-sqlite]]. Migration 1 has shipped and cannot be edited, so:

| Column | Format |
|---|---|
| `expense.created_at` | `2026-07-31 09:25:00` (wrong, frozen) |
| `account.updated_at`, `card.created_at` | `2026-07-31T13:56:35Z` (correct) |

Both still sort correctly as text within their own column. Do not compare across the two, and do not "fix" migration 1. If uniformity is ever needed, a future migration rewrites `expense.created_at` in place.

## Anti-patterns

- **Storing an account or card in the `settings` table.** In review this looks like `INSERT INTO settings (key, value) VALUES ('accounts', '[...]')` — a JSON blob in a key/value row, which no query can filter or total.
- **`CHECK (balance > 0)` on `account`**, copied from `expense.amount`. Rule 1.
- **`last4 INTEGER`.** Rule 2. The bug only shows up for cards whose last four digits start with `0`.
- **Updating a balance without touching `updated_at`.** Rule 3.
- **A `user_id` column or any auth table.** Explicitly out of scope; one local user.
- **Adding credit limit, statement day, or utilisation fields speculatively.** Nothing consumes them; add them with the feature that reads them.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `CHECK constraint failed: length(trim(bank)) > 0` | Bank submitted blank or whitespace-only | The form guards this; if it reached SQL, a caller bypassed the guard |
| `CHECK constraint failed: last4 ... GLOB ...` | `last4` is not exactly four digits | Pass `null` when unknown, never `""` — an empty string fails the check |
| Balance shows as off by a paisa | An amount went through `parseFloat` instead of `toMinor` | Rule 4; `typeof(balance)` in SQLite must be `integer` for every row |
| A card ending `0421` displays as `421` | `last4` stored as a number somewhere in the chain | Rule 2 |
| Edited balance keeps its old `updated_at` | The `UPDATE` relied on the column default | Rule 3 |
| Settings screen is empty but rows exist in SQLite | The query ran before migrations finished, or against a second connection | One shared handle from `apps/desktop/src/db.ts`; never call `Database.load` in a component |
