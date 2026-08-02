---
id: analytics-page
type: decision
status: active
updated: 2026-08-01
links: [summary-tile-delta, filter-row, chart-outlier, design-tokens, derived-balances, transaction-ledger]
---

# The Analytics screen

A fourth tab (`apps/desktop/src/Analytics.tsx`) that answers "where did the money go" over four windows: **week, month, year, and a custom range**. It reads `FEED` from `apps/desktop/src/analyticsFeed.ts` — **mock data today**, generated once at import from a fixed seed. The aggregation functions in that module take a `Txn[]` and know nothing about its origin, so swapping in the real ledger is a change to one export, not to the page.

Charts are **CSS boxes, not SVG and not a charting library**: a bar is a `div` with a percentage height. Recharts or Chart.js would be the largest dependency in the app, for shapes that are four rules of CSS ([[stack]] rule 5 forbids a JS dependency for what a few lines can do).

## Rules for an agent working here

1. **Never let a chart average or compare across days that have not happened.** A window whose `to` is past `TODAY` is clamped, and its comparison window becomes the same *elapsed* length rather than the previous whole calendar period. Without this a year in progress divides by 365 and reports a saving nobody made.
2. **Colour a delta by whether it is favourable, never by its sign.** Each tile declares a `goal` (`lower` for Spent and Per day, `higher` for Received and Net) and `tone()` in `apps/desktop/src/delta.ts` derives good/bad from it. `−9%` is good news on Spent and bad news on Received; painting both red is how a dashboard teaches people to ignore it. A filled 9px mark carries the direction so the verdict is never colour alone, and moves under `NOISE_PCT` (5%) render muted as `flat · 2%` rather than as news. The tile itself, its marks and the no-prior-period case are [[summary-tile-delta]].
3. **State a percentage only when the base is positive.** `change()` returns `null` for a zero base (Infinity) and for a negative one (the sign flips, so a Net improving from −₹1,000 to +₹500 would report "−150%", a fall for an outcome that got better).
4. **Two series means a legend.** "Accounts vs cards" ships one; the single-series charts deliberately do not, because their card title names the series.
5. **Never add a second y-axis.** Two measures of different scale are two charts.
6. **Round money on summary tiles** (`formatAmountRound`), never on a table or a ranked row. Paise on a headline is noise, and the exact string overflows a tile.
7. **Fold a long tail into "Other" via `rank(..., keep)`**, because a ranked chart with fourteen rows is a table nobody reads.
8. **Keep every window derivation in `analyticsFeed.ts`**, not in the component, so `analytics.check.ts` can assert it. Month and year boundaries are where off-by-one errors hide.
9. **Keep the colour count at one wherever labels carry identity.** "Where it went" and "Top sources" are ranked bars with the name on every row — a hue per category encodes nothing that the text does not.
10. **Only `--accent` and `--series-b` may encode a series, and only together.** That pair was validated for lightness band, chroma, colour-vision separation and 3:1 contrast on both surfaces. **Blue and violet fail** (ΔE 5.7 under protanopia) — never use `--violet` as a second series colour; it is an icon tint only.
## Contract

`apps/desktop/src/analyticsFeed.ts`:

| Export | Purpose |
|---|---|
| `Txn` | `{ date, amount, direction, category, source, kind, title }`; `amount` is paise, always positive |
| `FEED` | the mock consolidated feed, `2025-01-01` … `2026-07-31` |
| `TODAY` | `"2026-07-31"` — the newest day in the feed; every window is relative to this, not the clock |
| `windowFor(period, offset, today?)` | resolves `week` \| `month` \| `year` to `{ from, to, label }`; weeks start **Monday** |
| `previous(period, w, offset, today?)` | the comparison window; `range` means "same length, ending the day before" |
| `within` / `totals` / `rank` / `buckets` / `biggest` | aggregation over a `Txn[]` |

Bucket widths in `buckets()`: **≤ 31 days → one bar per day; ≤ 186 days → one per week; longer → one per calendar month.** A bar is never one pixel wide.

`--series-b` is `#d97706` in both themes (`apps/desktop/src/App.css`, see [[design-tokens]]).

## Swapping in real data

Replace `FEED` with a query and keep everything else. The ledger has no `category` column ([[transaction-ledger]] — the form deliberately does not collect one), so "Where it went" needs categorisation to exist first; `rank(rows, "source")` works against real data today.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A green "you spent 40% more" | `goal` on that tile is wrong, or `tone()` was inverted | Rule 2; `delta.check.ts` pins all four sign/goal combinations |
| Per-day figure looks far too low | Window not clamped to `TODAY`; dividing by a whole period | Rule 1 |
| "−46% vs prev" on the current year | Comparing a partial period against a whole one | Rule 1 |
| The page reshuffles its numbers on every render | The generator's seed was removed, or `FEED` moved inside the component | Keep it module-level and seeded |
| One bar dwarfs the rest | Real — rent is a third of a month; the gridlines exist so the small bars stay measurable | Do not rescale the data |
| Two series look identical to a colourblind reader | A hue pair that was never run through the validator | Rule 10 |
