---
id: analytics-real-feed
type: decision
status: active
updated: 2026-08-05
links: [analytics-page, analytics-mock-feed, transaction-ledger, expense-categories, analysis-persistence]
---

# Analytics and Report read the ledger

[[analytics-page]] and [[report-page]] stopped reading a seeded generator on 2026-08-05 and now read the user's own rows. The feed is one `SELECT` — `ANALYTICS_FEED` in `apps/desktop/src/queries.ts` — shaped in SQL into exactly the `Txn` the aggregations already took, so the swap was a change to one import and not to either screen. The generator and everything it bought are kept in [[analytics-mock-feed]]; it was retired because the ledger finally has the two things the charts need, a `category` (via [[expense-categories]]) and a source label.

`apps/desktop/src/analyticsFeed.ts` is now pure maths over a `Txn[]`: window derivation, `within`, `totals`, `rank`, `buckets`, `biggest`, `splitFixed`. It has no data of its own and no database import. The load lives in `usePeriod` (`apps/desktop/src/PeriodPicker.tsx`), which both screens already used for the window, so the feed and the window are resolved in the same place and the two screens cannot disagree about either.

## Rules for an agent working here

1. **Never reintroduce mock or sample data into `apps/desktop/src/`.** A module-level array of plausible transactions is indistinguishable from real data on screen, and the day it stops being obviously fake is the day someone reads a number off it. Deterministic rows for a check belong in `apps/desktop/feed.fixture.ts`, outside `src/`, imported only by `*.check.ts`.
2. **Never let a screen query the ledger itself.** `Analytics.tsx` and `Reports.tsx` take `rows` from `usePeriod` and slice it with `within(rows, win)` / `within(rows, prev)`. A second `db.select` in a component is a second window definition, a second loading state, and the two screens quietly reporting different totals for "this month" — which is exactly what rule 7 of [[report-page]] exists to prevent.
3. **Load one range, `prev.from` … `win.to`, and slice it in memory.** The comparison window is always adjacent to the period, so one query serves both; two queries double the round trips and can straddle a write. `within` is a string comparison over a few thousand rows — cheaper than the second `SELECT`.
4. **Keep every window derivation in `analyticsFeed.ts`**, never in a component or in SQL, because `analytics.check.ts` asserts it and month/year boundaries are where off-by-one errors hide. This is rule 8 of [[analytics-page]] and it survives the swap unchanged.
5. **Every category string in the app comes from the closed list in `apps/desktop/src/categorize.ts`.** A label typed into a chart, a report rule, or a `FIXED`/`ESSENTIAL` set that is not in that list matches nothing and the feature silently does nothing — no error, just a rule that never fires. See the vocabulary table below.
6. **Exclude transfers in the query, not in the component.** `to_account_id IS NULL` is in `ANALYTICS_FEED` because moving your own money between your own accounts is neither spending nor income ([[self-transfer]]), and a filter that lives in one of two screens is a filter one screen forgets.
7. **Shape the row in SQL, not in TypeScript.** `date`, `kind`, `category` and `source` are all derived by the query, so `loadFeed` casts and returns — no mapping layer to keep in step with the column list.
8. **Treat an empty window as a real answer, not an error.** A user with no rows in June should see "No transactions in this period", not a spinner that never resolves or a page of zeros and `NaN`.

## Contract

### `ANALYTICS_FEED` — `apps/desktop/src/queries.ts`

```sql
SELECT substr(e.spent_at, 1, 10) AS date,
       e.amount, e.direction, e.title,
       CASE WHEN e.category = '' THEN 'Uncategorised' ELSE e.category END AS category,
       CASE WHEN e.card_id IS NOT NULL THEN 'card' ELSE 'account' END AS kind,
       COALESCE(a.bank, c.bank || COALESCE(' ' || c.name, ''), 'Unassigned') AS source
FROM expense e
LEFT JOIN account a ON a.id = e.account_id
LEFT JOIN card c ON c.id = e.card_id
WHERE e.to_account_id IS NULL
  AND substr(e.spent_at, 1, 10) BETWEEN $1 AND $2
ORDER BY date
```

`$1` and `$2` are local `YYYY-MM-DD` bounds, inclusive.

### Ledger row → `Txn`, field by field

| `Txn` field | Comes from | Why it is not the raw column |
|---|---|---|
| `date` | `substr(e.spent_at, 1, 10)` | `spent_at` is `YYYY-MM-DDT00:00:00Z` ([[transaction-ledger]] rule 4). `BETWEEN` on the raw column drops the last day of every window, because `2026-07-31T00:00:00Z` sorts after `2026-07-31`. Comparing the truncated day fixes both the filter and the bucket key |
| `amount` | `e.amount` | Already minor units, already positive — `CHECK (amount > 0)` |
| `direction` | `e.direction` | `'debit'` \| `'credit'`, the word that carries the sign |
| `category` | `CASE WHEN e.category = '' THEN 'Uncategorised' …` | `''` is the uncategorised bucket in storage and stays that way. `''` as a bar label is a blank row; `Uncategorised` is a label a reader can act on |
| `kind` | `CASE WHEN e.card_id IS NOT NULL THEN 'card' ELSE 'account'` | Exactly one of `account_id`/`card_id` is set ([[transaction-ledger]] rule 2), so the card column alone decides it. Drives "Accounts vs cards" and the card finding in [[report-page]] |
| `source` | `COALESCE(a.bank, c.bank \|\| COALESCE(' ' \|\| c.name, ''), 'Unassigned')` | The account's bank, else the card's bank plus its name (`HDFC Regalia`), else the fallback for a row with neither. The inner `COALESCE` is there because `c.name` is nullable and `'HDFC ' \|\| NULL` is `NULL` in SQLite — a card with no name would otherwise disappear into `Unassigned` |
| `title` | `e.title` | Rendered by "Biggest spends" only |

**`Uncategorised` is a display label, never a stored value.** Nothing writes it: `SET_CATEGORY` only ever writes a member of `CATEGORIES` ([[expense-categories]] rule 2), and `INSERT_TRANSACTION` hardcodes `''`.

### Category vocabulary

One closed list, in `apps/desktop/src/categorize.ts`, plus the one SQL-side label:

```
Food & Dining, Groceries, Transport, Shopping, Bills & Utilities,
Rent, Health, Entertainment, Travel, Education, Subscriptions,
Income, Other                      (+ 'Uncategorised', from the query only)
```

`Subscriptions` was added to `CATEGORIES` by this change. The mock's own names are gone and must not reappear: `Eating out` → `Food & Dining`, `Utilities` → `Bills & Utilities`, `Salary` → `Income`. Anything still matching on the old strings matches nothing — which is why `report.ts` now types its category constants as `(typeof CATEGORIES)[number]`, so a rename over there fails the build here instead of silently switching a finding off.

### Window loaded

`usePeriod` resolves `win` and `prev` first, then loads **`prev.from` … `win.to`** — one contiguous range covering the period and its comparison. It returns `rows`, `loading` and `feedError` alongside the existing `win`, `prev`, `invalid`, `period` and `controls`; the screens call `within(rows, win)` and `within(rows, prev)` where they used to call `within(FEED, …)`.

The load is keyed on the string `` `${prev.from}|${win.to}` `` and guarded by a `live` flag cleared on cleanup, so a slow read that lands after the user has stepped on is discarded rather than painted over the newer window.

`apps/desktop/src/db.ts` holds `loadFeed(from, to): Promise<Txn[]>`, `loadAnalysis(from, to)` and `saveAnalysis(from, to, {...})` — the last two belong to [[analysis-persistence]].

### The clock

`windowFor(period, offset, today = todayIso())` and `previous(period, w, offset, today = todayIso())` default to the real clock (`todayIso` in `apps/desktop/src/day.ts`, which formats via `en-CA` so it is the *local* day, not UTC). The mock's `TODAY` export — `"2026-07-31"`, the newest generated day — is gone.

The consequence is the point: a period in progress is genuinely in progress. Under the mock, "this month" was always a whole month because the feed ended on the last day of one, and the clamping in rule 1 of [[analytics-page]] was effectively dead code. It is now load-bearing every day of the month.

### States

| State | Condition | Renders |
|---|---|---|
| Loading | the load for the current range is in flight | "Reading the ledger…" in place of the tiles and charts. Not stale figures under a spinner: the period label above it already says which window is being read, and a tile showing July's total under an August heading is worse than showing nothing |
| Error | `db.select` rejected | "Could not read the ledger: …" in the page error box; the period controls stay usable so the user can step away from it |
| Empty | resolved, `rows.length === 0` | "Nothing recorded in `<window>`." and a pointer to the Transactions page — not zeros in four tiles, which read as "you spent nothing" rather than "there is nothing here". **Explain with AI** is disabled here: there is nothing to analyse |
| Invalid | `invalid` — a custom range whose start is after its end | no load is issued at all; the range fields carry the message |

### Fixture

`apps/desktop/feed.fixture.ts` — deliberately **outside `src/`**, so it cannot be imported by application code:

| Export | Is |
|---|---|
| `FEED: Txn[]` | seeded LCG, seed `20260801`, daily rows over `2025-01-01` … `2026-07-31` |
| `FIXTURE_TODAY` | `"2026-07-31"` — passed as the `today` argument so window maths stays pinned while the real clock moves |

It imports `type Txn` from `./src/analyticsFeed.ts` and nothing else; only `analytics.check.ts` and `report.check.ts` import it. Categories emitted: `Rent`, `Groceries`, `Food & Dining`, `Transport`, `Shopping`, `Bills & Utilities`, `Health`, `Subscriptions`, and `Income` for the monthly credit. `Rent` (₹42,000) and `Income` are booked on the 1st of every month, which is what makes the `FIXED` split and the month buckets assertable.

The fixture emits **no `Uncategorised` rows** (confirmed by reading it on 2026-08-05), so that path is exercised by the query, not by the aggregation checks — a check that needs one must add the row itself.

## Anti-patterns

- **`import { FEED } from "./analyticsFeed"`.** The export is gone; this is the line to reject in review, along with any new module-level `Txn[]` inside `src/`.
- **A `db.select(ANALYTICS_FEED, …)` in `Analytics.tsx` or `Reports.tsx`.** Rule 2. It always starts as "just for this one chart".
- **Two loads, one per window.** Rule 3.
- **Filtering transfers in the component** with `rows.filter(t => !t.transfer)`. `Txn` has no such field on purpose; the exclusion is in the `WHERE`.
- **`BETWEEN $1 AND $2` on the raw `spent_at`.** Silently drops the last day of every window — a whole-month figure that is one day short and looks merely low.
- **Mapping rows in TypeScript** into a `Txn` after the query already shaped one. Two places to update when a column moves.
- **Hardcoding a date as "today"** to make a chart look full. Rule 1 of [[analytics-page]] exists so a partial period reads as partial.
- **Writing `'Uncategorised'` into `expense.category`** to "fix" the blank label. It is a label, not a category; `''` is the bucket, and a stored `Uncategorised` is a row no categorisation run will ever pick up.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Every chart is empty but the ledger has rows | The window is outside the data, or every row is a transfer | Step the period; transfers are excluded by design — rule 6 |
| The last day of a month is always missing | `BETWEEN` applied to raw `spent_at` instead of `substr(...,1,10)` | Restore the `substr` on both sides of the comparison |
| "Where it went" is one giant `Uncategorised` bar | Nothing has been categorised yet | Transactions → **Categorise** ([[expense-categories]]); it is not a feed bug |
| A category bar exists that is not in `CATEGORIES` | A pre-existing row filed under an old vocabulary (`Eating out`, `Utilities`, `Salary`) | Re-categorise the row; the label is stored data, and adding a category never rewrites history |
| Fixed charges show ₹0 with rent clearly in the list | `FIXED` still holds a retired label | Rule 5 — the set must contain `Rent` exactly as spelled in `CATEGORIES` |
| A row shows `Unassigned` as its source | Both `account_id` and `card_id` are `NULL` — [[transaction-ledger]] rule 2, unenforced by any `CHECK` | Edit the row and pick a source |
| A card's source reads as just the bank | `c.name` is `NULL`; the inner `COALESCE` collapses to `''` | Working as intended — name the card in Settings |
| Analytics and Report disagree about "this month" | One of them stopped taking `win`/`rows` from `usePeriod` | Rules 2 and 4 |
| The page shows yesterday's day as today just after midnight | ⚠ `todayIso()` reads the local clock on render; a mounted page does not re-render at midnight | Expected; a period change or a remount refreshes it |
| Charts reshuffle between renders | A generator crept back in, or the load is not keyed to the window | Rule 1; the ledger is stable by construction — nothing derived from it should move on a re-render |
