---
id: report-page
type: decision
status: active
updated: 2026-08-01
links: [analytics-page, design-tokens]
---

# The Report screen

A fifth tab (`apps/desktop/src/Reports.tsx`) that reads the same feed as [[analytics-page]] and writes about it: what stood out, why it costs something, what habit would change it, and the same figures seen from an angle that changes the decision. Analytics answers *how much*; Report answers *so what*.

The generator (`apps/desktop/src/report.ts`) is **rules, not a model**. Every sentence interpolates a figure computed from the rows, so any claim on the page traces back to an arithmetic operation on the user's own data. That is the difference between a report and a horoscope, and it is the property to preserve if a generated version ever replaces it: same `Report` shape, same "every claim carries its number" rule.

**Investing advice is deliberately out of scope.** The page discusses spending the user controls and nothing else — no returns, no products, no "if you had invested this".

## Rules for an agent working here

1. **Never emit a claim without the number it came from.** A `Finding` has both `figure` and `why`; a finding with no figure is an opinion, and this app has no standing to have those.
2. **Guard every denominator.** The page is template strings over division, and one zero denominator ships "NaN× your rent" to someone looking at their own money. `buildReport` returns early on an empty window and `pct()` returns `0` for a zero total; `report.check.ts` asserts no output ever matches `/NaN|Infinity|undefined/`.
3. **Only ever suggest cutting the controllable half.** Essentials are `ESSENTIAL` in `report.ts` (Rent, Groceries, Utilities, Health). A target below essentials would require the user to move house, which is not a habit.
4. **Estimated savings are labelled `~` and must total less than the controllable spend.** Promising a saving larger than what was spent is a lie the page is capable of telling by accident; the check asserts against it.
5. **State a consequence, do not moralise.** "Card spending separates the purchase from the payment by up to 45 days" is a mechanism. "You should be more careful" is a lecture, and it is what makes people close the tab.
6. **A rule that finds nothing must stay silent.** Every push into `findings`/`habits`/`reframes` sits behind a threshold; a report that always says the same eight things is wallpaper.
7. **Keep the window maths in `usePeriod`** (`apps/desktop/src/PeriodPicker.tsx`), shared with Analytics, so the two screens can never disagree about what "this month" means.

## Contract

`apps/desktop/src/report.ts` — `buildReport(rows, win, prevRows): Report`:

| Field | Meaning |
|---|---|
| `headline` | one sentence naming the controllable share and what led it |
| `findings[]` | `{ title, figure, why, severity }`, `severity` ∈ `watch` \| `note` \| `good` |
| `habits[]` | `{ title, how, saves }`; `saves` is paise per month, `0` when the habit is not about money |
| `reframes[]` | `{ title, body }` — the same figures in a different unit (per year, days worked, taps) |
| `target` | essentials + 90% of controllable, for the next period |

Thresholds: `SMALL` ₹500 (the "didn't think about it" spend), `BIG` ₹3,000 (the "should have slept on it" spend).

Severity → colour, via [[design-tokens]]: `watch` → `--danger`, `note` → `--line`/`--muted`, `good` → `--credit`.

## Anti-patterns

- **A finding with a percentage but no rupee figure.** "23% of your spending" is unfalsifiable to a reader who cannot see the base.
- **Advice that requires a product** — a card, a fund, an app. The page suggests behaviour, not purchases.
- **Hardcoded prose that does not move when the period does.** If switching from Month to Week leaves a sentence unchanged, that sentence was never derived from the data.
- **Ranking habits by how clever they sound.** They are sorted by `saves`, descending.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| "NaN" or "Infinity" in a sentence | A new rule divided without guarding its denominator | Rule 2; add the case to `report.check.ts` |
| Every period produces identical findings | Thresholds set so low that every rule always fires | Rule 6 |
| Suggested saving exceeds the controllable spend | A `saves` estimate multiplied over the wrong span | Rule 4 |
| Report and Analytics disagree about the period | One of them stopped using `usePeriod` | Rule 7 |
