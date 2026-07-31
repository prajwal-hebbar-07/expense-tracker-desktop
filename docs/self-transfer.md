---
id: self-transfer
type: decision
status: active
updated: 2026-07-31
links: [transaction-ledger, derived-balances, persistence-sqlite]
---

# Moving money between your own accounts

A self-transfer is **one `expense` row**, not two. `account_id` is the source, the new `to_account_id` (migration 5) is the destination, and `direction` stays `'debit'` because money does leave the source. `ACCOUNT_BALANCES` reaches the row through either column, so the source is debited and the destination credited by the same row, and the two can never disagree.

The obvious design — a debit row on the source plus a credit row on the destination — was rejected for the reason in [[derived-balances]]: `tauri-plugin-sql` exposes no transaction, so the two inserts are two independent writes. A crash between them leaves half a transfer, which is money that has left one account and arrived nowhere, and nothing in the schema would ever flag it.

`direction` could not simply gain a `'transfer'` value: migration 3 froze `CHECK (direction IN ('debit','credit'))` onto the column, and changing a CHECK means a table rebuild. **`to_account_id IS NOT NULL` is the only thing that makes a row a transfer** — every reader tests that, not `direction`.

## Rules for an agent working here

1. **Never book a transfer as two rows.** One row, `account_id` → `to_account_id`. Two rows is the bug this node exists to prevent.
2. **Test `to_account_id IS NOT NULL` to detect a transfer**, never `direction`, which reads `'debit'` on every transfer ever stored.
3. **Exclude transfers from any spending or income figure.** `MONTH_TOTALS` carries `AND to_account_id IS NULL`; a new aggregate over `expense` must decide the same question explicitly. Counting a transfer as spend inflates the month by the amount the user moved.
4. **Keep the destination arm first in the `ACCOUNT_BALANCES` CASE.** For the destination account the row is money *in* regardless of `direction`; put the `direction = 'credit'` arm first and every transfer subtracts from both accounts.
5. **Reject a transfer whose two sides are the same account** (`toParams` does). One row joined to one account group adds and subtracts within the same `SUM` and books nothing, silently.
6. **Both sides must be bank accounts.** A card holds no money — paying a card bill is a separate, still-unbuilt feature, not a transfer.
7. **Show a transfer without a `+`/`−` sign**, because the user has not gained or lost anything; the list renders it as `HDFC → ICICI` in muted type.

## Contract

Migration 5, `add_transfer_destination_to_expense`:

```sql
ALTER TABLE expense ADD COLUMN to_account_id INTEGER REFERENCES account(id);
```

Balance derivation (`ACCOUNT_BALANCES` in `apps/desktop/src/queries.ts`):

```sql
a.balance + COALESCE(SUM(CASE WHEN e.to_account_id = a.id THEN e.amount
                              WHEN e.direction = 'credit' THEN e.amount
                              ELSE -e.amount END), 0) AS balance
FROM account a
LEFT JOIN expense e ON e.account_id = a.id OR e.to_account_id = a.id
```

A transfer matches the join twice, but as two different `a` rows, so each group counts it once.

`INSERT_TRANSACTION` and `UPDATE_TRANSACTION` now take **nine** parameters; `to_account_id` is `$9` and `UPDATE` appends the id as `$10`. In the UI (`apps/desktop/src/transactionForm.tsx`) `Draft.direction` has a third value, `"transfer"`, which exists only in the form — `toParams` maps it to `direction: "debit"` plus `to_account_id`. `Draft.to` holds the destination account id as a string.

| Figure | Effect of a transfer |
|---|---|
| Source account balance | − amount |
| Destination account balance | + amount |
| In accounts | unchanged |
| Net | unchanged |
| This month (spent / in) | unchanged — excluded by `MONTH_TOTALS` |
| Card outstanding | unchanged — transfers never touch a card |

## Anti-patterns

- **A `kind` or `is_transfer` column.** `to_account_id` already answers it, and two sources of truth drift.
- **Reading `direction` to decide how to display a row.** Every transfer says `'debit'`.
- **A `SUM(amount) WHERE direction = 'debit'` written fresh anywhere.** That is the month-total bug again, in a new place.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Both accounts drop when money is moved | The `direction = 'credit'` arm is ahead of the `to_account_id` arm in the CASE | Reorder; rule 4 |
| Monthly spend jumps by the transferred amount | An aggregate missing `AND to_account_id IS NULL` | Add the filter; rule 3 |
| A transfer books nothing at all | Source and destination are the same account | Blocked by `toParams`; if it reached the table, delete the row |
| Destination shows no movement | Join written as `ON e.account_id = a.id` only | Restore the `OR e.to_account_id = a.id` arm |
| `variable number must be between ?1 and ?32766` in the checks | A `$10` placeholder rewritten by a single-digit regex (`/\$\d/g`) | Use `/\$\d+/g` — `balances.check.ts` does |
