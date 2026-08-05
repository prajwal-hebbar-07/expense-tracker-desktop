---
id: analytics-page
type: decision
status: active
updated: 2026-08-05
links: [summary-tile-delta, filter-row, chart-outlier, design-tokens, derived-balances, transaction-ledger, analytics-insights, analytics-real-feed, analytics-mock-feed]
---

# The Analytics screen

A fourth tab (`apps/desktop/src/Analytics.tsx`) that answers "where did the money go" over four windows: **week, month, year, and a custom range**. It reads **the user's own ledger**: `usePeriod` loads the rows and the page slices them with `within(rows, win)` — see [[analytics-real-feed]] for the query, the row mapping and the loading, empty and error states. The aggregation functions in `apps/desktop/src/analyticsFeed.ts` take a `Txn[]` and know nothing about its origin, which is why replacing the seeded mock feed it read until 2026-08-05 ([[analytics-mock-feed]]) was a change to one import rather than to this page.

Charts are **CSS boxes, not SVG and not a charting library**: a bar is a `div` with a percentage height. Recharts or Chart.js would be the largest dependency in the app, for shapes that are four rules of CSS ([[stack]] rule 5 forbids a JS dependency for what a few lines can do).

## Rules for an agent working here

1. **Never let a chart average or compare across days that have not happened.** A window whose `to` is past today (`todayIso()` in `apps/desktop/src/day.ts`) is clamped, and its comparison window becomes the same *elapsed* length rather than the previous whole calendar period. Without this a year in progress divides by 365 and reports a saving nobody made. This fires every day now that "today" is the real clock rather than the last day of a fixed feed.
2. **Colour a delta by whether it is favourable, never by its sign.** Each tile declares a `goal` (`lower` for Spent and Per day, `higher` for Received and Net) and `tone()` in `apps/desktop/src/delta.ts` derives good/bad from it. `−9%` is good news on Spent and bad news on Received; painting both red is how a dashboard teaches people to ignore it. A filled 9px mark carries the direction so the verdict is never colour alone, and moves under `NOISE_PCT` (5%) render muted as `flat · 2%` rather than as news. The tile itself, its marks and the no-prior-period case are [[summary-tile-delta]].
3. **State a percentage only when the base is positive.** `change()` returns `null` for a zero base (Infinity) and for a negative one (the sign flips, so a Net improving from −₹1,000 to +₹500 would report "−150%", a fall for an outcome that got better).
4. **Two series means a legend.** "Accounts vs cards" ships one; the single-series charts deliberately do not, because their card title names the series.
5. **Never add a second y-axis.** Two measures of different scale are two charts.
6. **Round money on summary tiles** (`formatAmountRound`), never on a table or a ranked row. Paise on a headline is noise, and the exact string overflows a tile.
7. **Fold a long tail into "Other" via `rank(..., keep)`**, because a ranked chart with fourteen rows is a table nobody reads.
8. **Keep every window derivation in `analyticsFeed.ts`**, not in the component, so `analytics.check.ts` can assert it. Month and year boundaries are where off-by-one errors hide.
9. **Keep the colour count at one wherever labels carry identity.** "Where it went" and "Top sources" are ranked bars with the name on every row — a hue per category encodes nothing that the text does not.
10. **Only `--accent` and `--series-b` may encode a series, and only together.** That pair was validated for lightness band, chroma, colour-vision separation and 3:1 contrast on both surfaces. **Blue and violet fail** (ΔE 5.7 under protanopia) — never use `--violet` as a second series colour; it is an icon tint only.
11. **Anything a model writes about this page is a separate card, on a button, and never a figure.** The tiles and charts stay derived from the feed — see [[analytics-insights]].
## Contract

`apps/desktop/src/analyticsFeed.ts`:

| Export | Purpose |
|---|---|
| `Txn` | `{ date, amount, direction, category, source, kind, title }`; `amount` is paise, always positive |
| `windowFor(period, offset, today = todayIso())` | resolves `week` \| `month` \| `year` to `{ from, to, label }`; weeks start **Monday** |
| `previous(period, w, offset, today = todayIso())` | the comparison window; `range` means "same length, ending the day before" |
| `within` / `totals` / `rank` / `buckets` / `biggest` | aggregation over a `Txn[]` |

Bucket widths in `buckets()`: **≤ 31 days → one bar per day; ≤ 186 days → one per week; longer → one per calendar month.** A bar is never one pixel wide.

`--series-b` is `#d97706` in both themes (`apps/desktop/src/App.css`, see [[design-tokens]]).

## Where the rows come from

`usePeriod` (`apps/desktop/src/PeriodPicker.tsx`) resolves the window *and* loads the ledger rows for `prev.from` … `win.to`, so this page and [[report-page]] can never disagree about either. The query, the row mapping, the category vocabulary and the loading/empty/error states are [[analytics-real-feed]]. This page never queries the database itself.

Done as of 2026-08-05. The section that used to stand here said the swap was blocked on categorisation — it shipped ([[expense-categories]]), and the reasoning that belonged to the mock is kept in [[analytics-mock-feed]].

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A green "you spent 40% more" | `goal` on that tile is wrong, or `tone()` was inverted | Rule 2; `delta.check.ts` pins all four sign/goal combinations |
| Per-day figure looks far too low | Window not clamped to today; dividing by a whole period | Rule 1 |
| "−46% vs prev" on the current year | Comparing a partial period against a whole one | Rule 1 |
| The page reshuffles its numbers on every render | The feed is being loaded inside the component instead of by `usePeriod`, so every render refetches | [[analytics-real-feed]] rule 2 |
| One bar dwarfs the rest | Real — rent is a third of a month; the gridlines exist so the small bars stay measurable | Do not rescale the data |
| Two series look identical to a colourblind reader | A hue pair that was never run through the validator | Rule 10 |
