---
id: date-picker
type: decision
status: active
updated: 2026-08-01
links: [floating-layer, custom-select, native-controls, filter-row]
---

# The date picker

`apps/desktop/src/DatePicker.tsx` replaces `<input type="date">`. It supersedes [[native-controls]]. Day arithmetic lives in `apps/desktop/src/day.ts`, shared with the form's validator so neither imports the other's component.

## Rules for an agent working here

1. **Parse every `YYYY-MM-DD` at noon** (`day.ts`'s `at()`). `new Date("2026-07-31")` is UTC midnight, which is the *previous* calendar day west of Greenwich — the single most common way a date control ends up one day out.
2. **The week starts Sunday, hard-coded for en-IN.** Reading the OS locale makes the grid reshape per machine and per test runner.
3. **Roving tabindex: exactly one cell has `tabIndex=0`.** Without it Tab walks 42 buttons to leave the calendar.
4. **Moving the cursor never commits.** Arrows move `cursor`; only Enter, a click, or Today writes through `onChange`.
5. **Clamp the day before adding months.** `setMonth` keeps the day number and lets it overflow, so 31 Jan + 1 month lands in March. `shiftMonths` clamps first.
6. **Today keeps its ring even when selected.** The fill says "chosen", the ring says "now"; on the day they coincide both facts still hold.
7. **The month/year switch stays in the same panel.** A second popover over a form field means two dismissable layers, and the wrong one always closes.
8. **Keep the Today button.** Same-day logging is the common case — one click instead of navigate-then-click — and it gives the `T` shortcut a visible home.

## Contract

```ts
<DatePicker value={string /* YYYY-MM-DD */} onChange={(iso: string) => void}
            label?  error?  className?  id? />
```

`day.ts` exports `at`, `toIso`, `todayIso`, `shiftDays`, `shiftMonths`, `formatDay`, `weeks`.

Day cell 32×32 (30 fluid), gap 2, radius 6. Today = 1px inset `--accent` ring. Selected = `--accent` fill + `--accent-ink`. Adjacent month = `--muted` at 55%. Panel ≈254px, positioned by [[floating-layer]].

Keyboard: `←→` ±1 day · `↑↓` ±1 week · `PageUp/Down` ±1 month · `Shift+PageUp/Down` ±1 year · `Home/End` week start/end · `Enter` select and close · `Escape` close unchanged · `T` today.

ARIA: trigger `role=combobox` + `aria-haspopup=dialog`; panel `role=dialog` + `aria-modal={false}` + `aria-label="Choose date"`; `role=grid` / `rowgroup` / `row` / `columnheader` / `gridcell`, `aria-selected` on the chosen day, and a full `aria-label` per cell ("12 August 2026").

## Anti-patterns

- **`new Date(iso)` anywhere.** Rule 1.
- **`toISOString().slice(0,10)`** to serialise — same UTC bug in the other direction. Use `toIso`.
- **`{ weekday: 'short' }` from the OS locale to build the header row.** Rule 2.
- **A second popover for month/year.** Rule 7.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Saved date is one day earlier than the one clicked | A bare `new Date(iso)` somewhere in the path | Rule 1 |
| Tab takes 40 presses to leave the calendar | Roving tabindex lost; every cell is `tabIndex=0` | Rule 3 |
| PageDown from 31 January lands in March | `shiftMonths` clamp removed | Rule 5 |
| Grid starts on Monday on one machine, Sunday on another | First day read from the locale | Rule 2 |
| Arrow keys change the stored value | `setCursor` replaced by `onChange` | Rule 4 |
