---
id: transaction-ledger
type: decision
status: active
updated: 2026-07-31
links: [persistence-sqlite, settings-schema, derived-balances]
---

# Recording a transaction

Money in and money out are the same row. Migration 3 extends `expense` with `direction`, `account_id`, and `card_id` rather than adding a second table, because a credit and a debit differ by one word and every query — totals, balances, the recent list — would otherwise be written twice and `UNION`ed.

The table keeps the name `expense` even though it now holds credits too. Renaming it means a full table rebuild for a word; the column that matters is `direction`.

Entry and history are **two separate tabs**, not two sections of one screen: `apps/desktop/src/AddTransaction.tsx` (the default — form plus the four stat tiles) and `apps/desktop/src/Transactions.tsx` (the list, grouped by day). The SQL for both is in `apps/desktop/src/queries.ts` so `apps/desktop/balances.check.ts` can run it against a real database.

The form's text fields are **`title` (mandatory) and `note` (optional, the "why")**, added by migration 4. There is no category field: how a transaction gets categorised is undecided, so the form does not guess at it.

Rows are **edited in place on the list and deleted behind the same two-step guard as Settings**. Both screens drive the same six fields through `apps/desktop/src/transactionForm.tsx`, which owns the `Draft` type, the `Fields` component and `toParams` — the single validator. A second copy of that validation is how an edit ends up accepting an amount the insert would have rejected.

`App.tsx` swaps components rather than keeping both mounted, so the list refetches on every visit and needs no shared state or cache invalidation. The tradeoff is that the Add screen has no list to confirm against, which is why it shows a "Saved …" line after an insert.

## Rules for an agent working here

1. **Never store a negative `amount`.** Migration 1 froze `CHECK (amount > 0)` onto the column and it cannot be dropped without a table rebuild. Direction is a word, not a sign — a `-500` insert fails at SQL, not review.
2. **Set exactly one of `account_id` and `card_id`, never both and never neither**, because a transaction has one source and the joins in `TRANSACTIONS` `COALESCE` across the two. This is **not** enforced by a `CHECK` — see the contract below for why — so the form is the only guard.
3. **A card transaction never touches an account balance**, because paying the card bill is itself a transaction (a debit on the account, a credit on the card). Applying it at spend time double-counts.
4. **Write `spent_at` as `${date}T00:00:00Z`** from the `<input type="date">` value, because `MONTH_TOTALS` filters on `substr(spent_at, 1, 7)` and a bare `YYYY-MM-DD` would still match but a locale-formatted date would not.
5. **Convert with `toMinor()` and reject `null` *and* `<= 0`** before inserting — see rule 4 of [[settings-schema]].
6. **Route every write through `toParams` in `transactionForm.tsx`**, because `INSERT_TRANSACTION` and `UPDATE_TRANSACTION` deliberately take the same eight parameters in the same order. Building either param list by hand is what lets the two drift.
7. **Never soft-delete.** `DELETE_TRANSACTION` really removes the row, because balances are derived ([[derived-balances]]) — a `deleted_at` flag would have to be filtered out of every aggregate, and the one that gets missed is silently wrong.
8. **Use `ConfirmDelete` from `apps/desktop/src/ConfirmDelete.tsx`, never `window.confirm()`** — that component's docblock explains why the native dialog silently returns `false` under wry.

## Contract

Migration 3, `add_direction_and_source_to_expense`, in `apps/desktop/src-tauri/src/lib.rs`:

```sql
ALTER TABLE expense ADD COLUMN direction TEXT NOT NULL DEFAULT 'debit'
  CHECK (direction IN ('debit','credit'));
ALTER TABLE expense ADD COLUMN account_id INTEGER REFERENCES account(id);
ALTER TABLE expense ADD COLUMN card_id    INTEGER REFERENCES card(id);
```

⚠ **There is deliberately no `CHECK ((account_id IS NULL) <> (card_id IS NULL))`.** Verified against SQLite 3.51.0: a `CHECK` added by `ALTER TABLE … ADD COLUMN` **is** validated against existing rows, and it fails with `stepping, CHECK constraint failed`. Any `expense` row written before migration 3 has both columns `NULL`, so adding that constraint makes migration 3 fail permanently on that install — an unrecoverable state, since the migration cannot then be edited either. Do not "tighten" this later without a table rebuild.

`direction` is `NOT NULL DEFAULT 'debit'` because `ADD COLUMN … NOT NULL` requires a constant default. Pre-existing rows are expenses, so `debit` is the right backfill.

Migration 4, `split_expense_description_into_title_and_note`:

```sql
ALTER TABLE expense RENAME COLUMN description TO title;
ALTER TABLE expense ADD COLUMN note TEXT;
```

`RENAME COLUMN` (SQLite ≥ 3.25, verified on 3.51.0 to preserve existing rows) rather than adding a `title` column and abandoning `description`, which would leave a `NOT NULL` column every future `INSERT` still has to fill with a dummy value.

⚠ **`category` is still `NOT NULL` with no default and the form no longer collects one, so `INSERT_TRANSACTION` hardcodes `''`.** Migration 1 froze both the `NOT NULL` and the missing default, and SQLite cannot alter either without a table rebuild. Treat `''` as "uncategorised"; the categorisation feature backfills it. Do not read `category` expecting a value.

An omitted note is stored as `NULL`, never `''` — the form maps `note.trim() || null`, because `''` reads as "there is a note and it is empty".

### Source encoding in the form

One `<select>` with two `<optgroup>`s, values `a:<id>` / `c:<id>`. Two coupled selects would need a "clear the other one" rule; one select makes "exactly one source" unrepresentable-otherwise.

### Queries — `apps/desktop/src/queries.ts`

| Export | Returns |
|---|---|
| `ACCOUNT_BALANCES` | `id, bank, currency, balance` — live, see [[derived-balances]] |
| `CARD_OUTSTANDING` | `id, bank, name, last4, outstanding` — debits minus credits; negative means in credit |
| `MONTH_TOTALS` | `direction, total` for `$1` = local `YYYY-MM` |
| `TRANSACTIONS` | last 200, newest first, with `account_id`/`card_id` for the editor and a `source` label `COALESCE`d across the two |
| `INSERT_TRANSACTION` | 8 bound params — amount, currency, title, note, spent_at, direction, account_id, card_id. `category` is the literal `''` in the SQL, not a param |
| `UPDATE_TRANSACTION` | the same 8, same order, plus the id as `$9` |
| `DELETE_TRANSACTION` | id as `$1`; a hard delete |

Checked by `apps/desktop/balances.check.ts` (`pnpm --filter desktop test`), which extracts the migration SQL out of `lib.rs` by regex and runs it in `node:sqlite`, so the schema in the test cannot drift from the shipped one.

## Anti-patterns

- **A separate `income` table.** Every aggregate doubles and the two drift.
- **Signed amounts to mean direction.** Rule 1; SQLite rejects it outright.
- **Deducting a card spend from the linked bank account at spend time.** Rule 3.
- **Adding the XOR `CHECK` in a later migration** without rebuilding the table. It bricks any install with pre-migration-3 rows.
- **Storing `spent_at` from `toISOString()` on a `Date` built from the date input.** That shifts the day backwards for anyone east of UTC — the form composes the string from the local `YYYY-MM-DD` instead.
- **A second validator for the edit path**, or a hand-built `UPDATE` param list. Rule 6.
- **A `deleted_at` soft-delete column.** Rule 7.
- **Adjusting `account.balance` when a transaction is edited or deleted.** Nothing to adjust — see [[derived-balances]].

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `CHECK constraint failed: amount > 0` | A negative amount was passed for a debit | Rule 1 — pass the magnitude and set `direction` |
| `CHECK constraint failed: direction IN (...)` | A value other than `debit`/`credit` | The `<select>` only offers two; a caller bypassed it |
| A transaction shows `unassigned` in the list | Both `account_id` and `card_id` were `NULL` | Rule 2; no `CHECK` catches this |
| A spend lands in the wrong month | `spent_at` written without the `T00:00:00Z` suffix, or via `toISOString()` | Rule 4 |
| Migration 3 fails on one machine only | That install has `expense` rows and a `CHECK` was added to `ADD COLUMN` | Do not add it; see the contract warning |
| An edit saves but a field is unchanged, or lands in the wrong column | `UPDATE_TRANSACTION`'s `SET` order no longer matches `toParams` | Rule 6; `balances.check.ts` asserts every field after an update |
| Delete appears to do nothing | The confirm step was never reached, or `window.confirm()` crept back in | Rule 8 |
