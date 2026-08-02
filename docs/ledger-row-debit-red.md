---
id: ledger-row-debit-red
type: alternative
status: superseded
superseded-by: card-movement, debit-red
updated: 2026-08-02
links: [card-movement, debit-red, accent-green, design-tokens]
---

# Rejected: cards on a blue chip

A competing design for the same transaction row, arriving alongside [[card-movement]] and shipped over by it on 2026-08-02. Recorded because the two disagree on the central question — *what does a card row look like* — and a rejected option without its reason gets proposed again next week.

**Split verdict, same day.** Its *card* half was rejected — reasons below, and they still stand. Its *direction* half was then adopted on request: debits went red and `--debit` shipped. That decision has its own node, [[debit-red]]; this one keeps only the case against the blue chip.

Its rule: a row holds saturation in exactly two places. The **arrow and amount carry direction** — a new `--debit` brick red for money out, `--credit` green for money in, muted and signless for a transfer — and **one chip on the meta line carries source** when the money is borrowed, in `--series-b` blue.

The first clause is now how the ledger works. The second is not.

## Why the blue chip did not ship

1. **It gave `--series-b` a second job the palette did not need.** `--violet` was already reserved for cards; this design explicitly rejected violet and reached for the chart's second series instead. [[card-movement]] marks a card with a token that already means "card".
2. **Its own rejection of violet does not hold here.** It argued a recurring card charge would be "violet twice for two different reasons" — but the recurring marker lives on Analytics, not in this list, so the collision it guarded against does not occur on the screen in question.
3. **`--series-b` is a chart series colour.** Giving it a second meaning in the ledger breaks the "the two surfaces don't meet" claim the moment a card row and a two-series chart share a screen, which Overview and Analytics both do.
4. **It was never dated and never measured.** The section asks for ΔE per deficiency from `apps/desktop/series-contrast.check.ts` "before this ships". Those numbers now exist for `--debit` against `--credit` and `--danger` (see [[debit-red]]), because that half shipped; they were never produced for `--series-b` as a row mark.

## What was worth keeping

Beyond the direction half in [[debit-red]], two observations survive as constraints on [[card-movement]] and on anything that follows:

- **The left edge is spoken for.** 2px `--accent` is edit mode and 2px `--danger` is delete confirm in this exact list, so a permanent mark there reads as a stuck state. Do not put a row-kind marker on the left edge.
- **The arrow angle cannot be spent.** It is the sole hue-free direction cue, so it must keep meaning direction and nothing else — which is why [[card-movement]] changes the glyph *body* to a card and leaves the angle alone.

## Tokens

`--debit` and `--debit-weak` shipped with the direction half — values, measurements and rules are in [[debit-red]]. Nothing else from this design was added to `apps/desktop/src/App.css`; `--series-b` keeps its single chart-series meaning.
