---
id: card-due-day
type: decision
status: active
updated: 2026-08-02
links: [card-movement, persistence-sqlite, transaction-ledger]
---

# When a card statement is due

`card.due_day` is a **day of the month**, not a date. A statement falls on the same day every cycle, so storing the next date would need something to roll it over and would be wrong the moment nothing ran. The next actual date is derived at render time by `nextDue` in `apps/desktop/src/cardBill.ts`.

The column is nullable on purpose: a card whose cycle you have not typed in shows **no** due line, which beats showing a made-up one.

## Rules for an agent working here

1. Never say *overdue*. The app cannot distinguish an unpaid bill from a paid one — a bill payment is not modelled, see [[card-movement]] — so a passed date means "the cycle rolled", not "you missed it". `nextDue` therefore always returns a date in the future or today.
2. Clamp the day before rolling the month, because a card due on the 31st is due on the 30th in November, not the 1st of December. `shiftMonths` in `apps/desktop/src/day.ts` already clamps; do not hand-roll the arithmetic.
3. Compare and build dates as `YYYY-MM-DD` strings and parse them at noon via `at`. String order is date order in this format, and noon is what stops a DST shift rounding `days` either way.
4. Validate `due_day` in the form as well as in the column CHECK, because a violated CHECK surfaces in the page-level error box as a raw SQLite string, which is not a sentence.
5. Show the countdown only inside 7 days. A bill 30 days out is just a date; printing `· 30 days` on it makes every month feel urgent, which is the glare the sub-line exists to avoid.
6. Keep the sub-line `--violet`, never `--danger`. Debt is not an error.

## Contract

Migration 6, `add_statement_due_day_to_card`:

```sql
ALTER TABLE card ADD COLUMN due_day INTEGER
  CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);
```

The CHECK is safe to add by `ALTER TABLE` here — unlike migration 3's, which is why that one has none — precisely because it admits NULL, so every existing card row already satisfies it. SQLite validates an added CHECK against existing rows and fails the migration permanently on that install otherwise.

`nextDue(dueDay: number, today = todayIso()) -> { due: string, days: number }` — `due` is `YYYY-MM-DD`, `days` is whole days from `today`, zero on the day itself.

`dueLine(cards)` in `apps/desktop/src/AddTransaction.tsx` renders the tile sub-line from the **soonest** due among cards that have a `due_day` **and** a positive outstanding:

- `2 cards` — no cycle on file anywhere
- `2 cards · due 5 Sep` — more than 7 days out
- `2 cards · due 5 Aug · 3 days` — inside 7 days
- `2 cards · due 5 Aug · today` — `days === 0`

`CARD_OUTSTANDING` selects `c.due_day`; the `Outstanding` and `Card` types in `AddTransaction.tsx` and `Settings.tsx` carry it as `due_day: number | null`.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Due line one day early or late | Date parsed at UTC midnight instead of noon | Use `at` from `day.ts`; rule 3 |
| Due date lands on the 1st for a 31st card | Month shifted before the day was clamped | `shiftMonths` clamps; rule 2 |
| Raw `SQLITE_CONSTRAINT` string in the error box | `due_day` reached the INSERT unvalidated | Rule 4 — the regex in `addCard` |
| Tile shows a due date for a settled card | Filter dropped the `outstanding > 0` test | Restore it in `dueLine` |
| `balances.check.ts` fails on migration count | A migration was added without bumping the count assertion | It pins the number on purpose, so an edited-in-place migration is caught |
