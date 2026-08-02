---
id: card-movement
type: decision
status: active
updated: 2026-08-02
links: [debit-red, ledger-row-debit-red, card-due-day, transaction-ledger, design-tokens, accent-green]
---

# Card movement is not cash movement

A transaction row carries two facts on two carriers. **Angle carries direction** — out, in, both ways. **Hue says what the money did** — and a card is one of its answers, not a competing axis. A violet row never moved an account balance; it moved what you owe. Because a card row is a liability and not an error, the sign follows the debt: `−` raises outstanding, signless lowers it. `+` and `--credit` are reserved for money that actually arrived in an account.

No new hue and no new token for the card states. `--violet` already existed as "an icon tint"; this widens its role to card glyph, card amount and the Card outstanding tile. The bank-debit row's `--debit` red arrived separately the same day — see [[debit-red]], which supplies the rest of the hue scheme this node's card states sit inside.

## Rules for an agent working here

1. Derive the row kind through `kindOf` in `apps/desktop/src/Transactions.tsx`, never by re-testing `card_id` at a call site — five states written inline in three places drift apart on the fourth edit.
2. A card credit is **signless**, because nothing arrived in an account. It also takes a `--violet-weak` pill, because signless violet and `−` violet are one character apart otherwise.
3. Never paint a card row `--credit` or `--debit`. Green means money landed in an account and red means it left one; a card row did neither, which is the whole reason it has its own hue. Keep `cardDebit` and `cardCredit` as separate kinds from `debit` and `credit` in `kindOf`, or they collapse into the direction hues.
4. Never paint a card row `--danger`. Debt is not an error; `--danger` stays destructive-only (delete button, confirm band).
5. The card name on the meta line takes `--ink` at 500 while the rest of the line stays `--muted`. Do not promote it to a chip, a second line or a fourth column — row height is the thing being protected.
6. Print the outstanding sentence on a card credit only, from `outstandingAround` in `apps/desktop/src/cardBill.ts`. Place it **before** the note so it survives truncation.
7. `outstandingAround` must keep summing exactly what `CARD_OUTSTANDING` sums — every row carrying a `card_id`, transfers included. A walk that disagreed with the query drifts one row at a time and looks plausible the whole way down.
8. Colour is the third signal, never the first. Glyph, sign and pill all separate the states before hue is considered; the `--credit`/`--violet` pair separates on lightness and on blue under protanopia and deuteranopia, but nothing in the list depends on that.

## Contract

Row kinds, from `kindOf(r)`:

| Kind | Condition | Glyph | Sign | Amount |
|---|---|---|---|---|
| `transfer` | `to_account_id` set | `ArrowsLeftRight` `--muted` | none | `text-muted` |
| `cardCredit` | `card_id` + `direction='credit'` | `CardIn` `--violet` | none | `--violet` on a `--violet-weak` pill |
| `cardDebit` | `card_id` + `direction='debit'` | `CardOut` `--violet` | `−` | `--violet` |
| `credit` | `account_id` + `direction='credit'` | `ArrowIn` `--credit` | `+` | `text-credit` |
| `debit` | `account_id` + `direction='debit'` | `ArrowOut` `--debit` | `−` | `--debit` — see [[debit-red]] |

The order of the ternary chain matters: `to_account_id` is tested first, so a transfer never falls through to a card state.

`outstandingAround(rows, cards) -> Map<rowId, { before, after }>`. `rows` must be in `TRANSACTIONS` order (newest first); `cards` must carry the live `outstanding` from `CARD_OUTSTANDING`. Prints as `outstanding 46,652 → 44,853` — minor units, grouped en-IN, no `₹` and no paise, because it runs as prose in a 12.5px line and not as a money column.

Tiles on Overview (`apps/desktop/src/AddTransaction.tsx`), each with one 11px sub-line:

| Tile | Sub-line | Tint |
|---|---|---|
| In accounts | `N accounts` | `--muted` |
| Card outstanding | [[card-due-day]] | `--violet` |
| Net | `accounts − outstanding` | `--muted` |
| Spent this month | `incl. ₹9,689 on card`, omitted at zero | `--violet` |

`MONTH_TOTALS` gained `on_card` — the borrowed slice of `total`, not a separate figure. A card charge counts as spent **when you commit, not when the bill clears**; a tile that waited for the statement would report a quiet month you did not have.

## Deliberately not built

- **The bracketed bill-payment pair** (design §4, option 2a). A bill payment is two rows — an account debit and a card credit — and nothing in the schema links them. Needs `expense.to_card_id` or an equivalent relation before the bracket, the shared hover, or the `--violet-line` rail can exist. Marked `ponytail:` on `Kind`.
- **`--violet-line`.** Its only consumer is that bracket. Adding the token now is dead CSS; its values are recorded here so nobody re-derives them — light `rgba(106,75,196,.28)`, dark `rgba(155,138,242,.30)`, an alpha of `--violet` so it composes on `--surface` and `--overlay` alike.
- **The overdue tile state and its "Log payment" action.** See [[card-due-day]]: the app cannot tell an unpaid bill from a paid one without the bill payment above.
- **Design §4 option 2b, the collapsed pair.** Rejected by the design itself — it stops the ledger mirroring the file, so a row you can see is not a row you can delete.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Outstanding sentence drifts further down the list | `outstandingAround` and `CARD_OUTSTANDING` disagree about which rows count | Re-check the `card_id`-only filter in both; run `cardBill.check.ts`, whose unwind test lands on zero |
| Outstanding sentence missing on every card credit | `cards` passed without `outstanding` (the `Card` type in `Transactions.tsx` omitted it) | `CARD_OUTSTANDING` returns it; widen the type |
| A transfer renders with a card glyph | `card_id` tested before `to_account_id` in `kindOf` | Restore the order in the contract table |
| Card credit reads as a charge | Pill class dropped from `AMOUNT.cardCredit` | It is load-bearing, not decoration — signless violet alone is ambiguous |
| Row height jumped past 37px + padding | Card name promoted off the 12.5px meta line | Rule 5 |
