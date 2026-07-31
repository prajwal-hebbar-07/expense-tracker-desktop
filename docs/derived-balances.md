---
id: derived-balances
type: decision
status: active
updated: 2026-07-31
links: [transaction-ledger, settings-schema, persistence-sqlite]
---

# Balances are derived, never stored

`account.balance` is the **opening balance** — what the user typed in Settings. The live balance is that plus every credit minus every debit booked against the account, computed in SQL at read time by `ACCOUNT_BALANCES`. Nothing writes a running balance back.

The alternative was to `UPDATE account SET balance = balance ± ?` alongside each insert. It was rejected because `tauri-plugin-sql` exposes no transaction: `execute` prepares a single statement, and the plugin holds a `SqlitePool`, so a `BEGIN` issued as its own `execute` may land on a different pooled connection than the writes that follow. Two unprotected writes to a money column means a crash between them leaves a balance that is silently wrong forever, with no record to reconstruct it from. Deriving makes booking a transaction one `INSERT` — atomic by definition — and makes deleting one self-correcting.

## Rules for an agent working here

1. **Never `UPDATE account.balance` to reflect a transaction.** Insert the transaction; the balance follows. An `UPDATE` here is the bug this node exists to prevent.
2. **`UPDATE account.balance` only when the user is correcting the opening figure**, from Settings, and set `updated_at` with it — rule 3 of [[settings-schema]].
3. **Label the Settings figure "opening"** wherever it appears, because two screens showing different numbers under the same word "balance" reads as a bug.
4. **Add a materialised balance only when a measurement demands it**, not before. This is a single-user local SQLite file; the aggregate is over one person's transactions.

## Contract

```sql
a.balance + COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount
                              ELSE -e.amount END), 0) AS balance
```

`LEFT JOIN` and `COALESCE` are both load-bearing: an account with no transactions must return its opening balance, not disappear and not return `NULL`.

Cards have no opening figure — a card holds no money. `CARD_OUTSTANDING` sums debits minus credits from zero; a negative result means the card is in credit.

| Stat on the Transactions screen | Derivation |
|---|---|
| In accounts | `SUM` of live account balances |
| Card outstanding | `SUM` of card outstandings |
| Net | in accounts − card outstanding |
| This month | `MONTH_TOTALS` on the local `YYYY-MM` |

## Anti-patterns

- **A `balance` column updated by a trigger.** Same double-write, now invisible to anyone reading the TypeScript.
- **Recomputing balances in JavaScript** by fetching every transaction. The aggregate belongs in the query that already joins the tables.
- **Treating `account.balance` as current anywhere.** Grep for it: `Settings.tsx` (edit) and `ACCOUNT_BALANCES` (opening term) are the only legitimate readers.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Settings and Transactions show different balances for one account | Working as designed — opening vs live | Rule 3; check the labels are present |
| An account vanishes from the Transactions list | `LEFT JOIN` turned into `JOIN` | Restore the `LEFT` |
| A fresh account shows a blank balance | `COALESCE` dropped from the `SUM` | Restore it |
| Balance drifts after deleting a transaction | Something is also mutating `account.balance` | Rule 1 |
