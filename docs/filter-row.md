---
id: filter-row
type: decision
status: active
updated: 2026-08-01
links: [analytics-page, report-page, date-picker, summary-tile-delta]
---

# The filter row

`apps/desktop/src/PeriodPicker.tsx` — one 52px surface holding a segmented period switch and either a period stepper or two date fields. Shared by Analytics and Report so the two screens can never disagree about what "this month" means.

## Rules for an agent working here

1. **Both arrangements keep the same 52px height.** The Range date fields are 34 and the stepper is 28; a row that grows when you pick "Range" shoves the whole page down for a control you were already looking at.
2. **The disabled next arrow uses `aria-disabled`, not `disabled`.** It stays focusable so a screen reader can reach it and say why it does nothing. Visually it is `--muted` at 38% opacity with no hover.
3. **Changing the period resets `offset` to 0.** "3 weeks ago" and "3 years ago" are not the same place.
4. **The segmented control is `role=tablist` with a roving tabindex** — one Tab stop for the group, then `←`/`→` inside it. Four separate tab stops for four mutually exclusive options is four presses to reach the stepper.
5. **The stepper label has `min-w-24` and `tabular-nums`**, so "Jul" and "September" do not shift the arrows.
6. **The count text drops below `md`.** It is the first thing worth losing.
7. **Never let the window run past the newest day in the feed.** `usePeriod` truncates an in-progress window to `TODAY` and compares it against the *same elapsed length* rather than the whole previous period — a year in progress is 212 days of spending, not 365, and holding it against a full year reports a saving the user did not make.

## Contract

```ts
const { win, prev, invalid, period, controls } = usePeriod(initial?);
<PeriodPicker controls={controls} label={win.label}
              summary?={{ from, to, count }} />
```

`summary` is the resolved window plus its transaction count, rendered as `31 days · 214 transactions`.

Segmented: outer `h-[34px]` radius 8, `--field` + 1px `--line`, padding 3. Segment `h-7` radius 6, padding `0 12`, 12.5/500. Selected = `--surface` fill + `--ink` + `--shadow`; rest `--muted`, hover `--hover`. Focus ring sits on the outer box.

Stepper: arrows 28×28 radius 6 with an 18px glyph.

Row: `min-h-[52px]`, padding `9 12`, gap 16, `--surface` card. Sits between the `<h1>` and the first block.

Range uses [[date-picker]], not `<input type="date">`.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Page jumps when "Range" is picked | The two arrangements drifted to different heights | Rule 1 |
| Tab takes four presses to get past the period switch | Roving tabindex lost | Rule 4 |
| Arrows twitch as the month name changes | Label lost `min-w-24` or `tabular-nums` | Rule 5 |
| "Next" is unreachable by keyboard | `disabled` used instead of `aria-disabled` | Rule 2 |
| A year in progress reports an impossible saving | The in-progress truncation in `usePeriod` removed | Rule 7 |
