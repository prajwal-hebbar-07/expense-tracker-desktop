---
id: chart-outlier
type: decision
status: active
updated: 2026-08-01
links: [analytics-page, summary-tile-delta, floating-layer]
---

# The outlier: fixed charges leave the daily series

A month with rent in it is one wall and thirty slivers. `Bars` in `apps/desktop/src/Analytics.tsx` holds fixed charges out of the daily series and states them in a strip above the chart instead.

## Why this and not a capped axis

The rejected alternative was capping the axis at the 95th percentile and drawing the outlier to the cap with a notched top and its true figure.

**A capped bar is still a bar, and its height is false.** The notch asks the reader to learn a symbol before they can trust the picture, and once one bar is exempt from the axis the other thirty stop being comparable to anything. It fails silently in the case that matters most — two outliers, where the reader cannot tell which is bigger.

Removing rent is not hiding. Rent is one decision a year and the same figure every month; a daily chart exists to show the days you can still change, and rent answers none of its questions. The strip states the figure **before** the chart does, a violet tick keeps its day honest, and "Show in chart" puts it back in one click.

⚠ The capped-axis treatment remains the right fallback for a period with no fixed charges tagged, where there is nothing to split out. That case currently just plots everything, which is the same picture without the notch.

## Rules for an agent working here

1. **`FIXED` in `analyticsFeed.ts` is the tag.** It holds category names, currently `{"Rent"}`. Widening it is a data decision, not a chart one.
2. **The split must lose nothing.** `variable + fixed.total` is the window's whole spending and `variable.length + fixed.count` its whole row count. `analytics.check.ts` asserts both — a split that loses money is the "hiding" this treatment was chosen to avoid.
3. **Never let a held-out day render as empty.** A 3px `--violet` tick under the bucket containing it is what makes the removal visible rather than silent.
4. **Nothing tagged fixed is a valid state, not a special case.** `splitFixed` returns `count: 0` and the chart plots everything.
5. **Held-out by default.** The figure is stated above either way, so putting it back is the escape hatch, not the starting point.

## Contract

```ts
splitFixed(rows: Txn[]): { variable: Txn[]; fixed: { total, count, days: Set<string>, labels: string[] } }
```

`labels` is deduplicated — "rent, rent, rent" for a quarter is one fact stated once.

The chart title changes with the state: `Variable spend over time` when held out, `Spend over time` when not.

## The tooltip

Anchored to the bar, not the cursor. A cursor-tracked box makes the reader chase the number they are trying to read, and along a 31-bar axis it never settles.

1. **The hover target is the full-height column, not the bar**, so a ₹0 day is still reachable.
2. **Width is a constant (`TIP_W` 168).** Fixed rather than fitted because a constant makes the clamp arithmetic exact instead of a measure-then-reposition.
3. **The box clamps to the plot; the caret keeps tracking the bar** and stops `CARET_INSET` (10) from either end, so it never points out of a rounded corner.
4. **Flip below when the bar top is within `FLIP_AT` (56) of the chart top.**
5. **Position in pixels off the plot box, never in percent.** The container is the 176px bar area *plus* a 20px label gutter, so a percentage is off by that gutter's share and drifts as the bar grows.
6. **Three lines, never four**: date (11/500 mono caps `--muted`), amount (15/600 tabular `--ink`), count (12/400 `--muted`).
7. **The date line is the full date, not the axis label.** A day bucket's label is a bare "15" — enough on an axis where neighbours give it context, not enough in a box floating free of it.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Spent tile and chart total disagree | The split dropped rows | Rule 2; `analytics.check.ts` |
| A day with rent on it shows no bar and no mark | Tick not rendered | Rule 3 |
| Tooltip drifts off its bar as the bar gets taller | Position expressed in percent | Rule 5 |
| Tooltip clipped at the chart's left or right edge | Box clamp removed | Rule 3 |
| Chart is one wall and thirty slivers again | `held` forced false, or `FIXED` emptied | Rules 1 and 5 |
