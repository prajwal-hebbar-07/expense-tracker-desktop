---
id: accent-green
type: decision
status: active
updated: 2026-08-01
links: [design-tokens, summary-tile-delta, analytics-page]
---

# The accent is green, and `--credit` is an alias of it

Changed 2026-08-01, together with the rename to Khata. The accent moved from blue (`#2e5fd0` / `#7aa2f7`) to green (`#0e7a57` / `#4fd1a5`); `--credit` stopped being its own hex and became `var(--accent)`; `--series-b` took over the blue; and the freed amber became `--warn`.

## Why

The app is about money in and money out. Green already meant "money in", and the primary button, the active nav and a credit amount were three different saturated hues competing in a palette whose whole premise is that saturated pixels are rare. Folding "the app" and "money in" into one green removes a hue rather than adding one.

Keeping the **name** `--credit` while aliasing the value is deliberate: `text-credit` at a call site says *why* something is that colour, which `text-accent` does not. If the two ever diverge again, every call site is already labelled correctly.

## Rules for an agent working here

1. **Do not "simplify" `--credit` away.** It is a semantic name, not a duplicate. Rule above.
2. **Do not give `--credit` its own hex again** without checking every place the two now sit together — the Net tile, a credit row in the ledger, and the primary button all assume they match.
3. **`--warn` is not a series colour.** It is the old amber, kept for caution states. Used as a series it lands next to `--series-b` blue and reads as a third series. ⚠ Nothing consumes `--warn` yet — it is a reserved slot from the design system, so the first caution state should use it rather than inventing an amber.
4. **Re-run `apps/desktop/series-contrast.check.ts` before touching `--accent` or `--series-b`.** They are a validated pair, and the check prints the numbers to paste into [[design-tokens]].

## The tritanopia trade

The old blue+amber series pair separated under every deficiency (ΔE ≈ 110–164). Green+blue does not:

| | normal | protanopia | deuteranopia | tritanopia |
|---|---|---|---|---|
| light | 96.4 | 83.7 | 77.3 | **1.4** |
| dark | 80.8 | 65.8 | 55.9 | **1.8** |

Green and blue collapse into each other on the blue–yellow axis. This was accepted rather than fixed, for two reasons:

1. The design's stated bar is "the common red–green deficiencies" — protanopia and deuteranopia affect ~6% of men; tritanopia is ~0.01% of people. The pair clears the common cases with enormous headroom.
2. **Colour is not the only carrier.** `Split` in `Analytics.tsx` gives every series a legend row with its name *and* its figure, so the card is fully readable with the hues removed. That is what makes the trade survivable, which is why the legend is load-bearing and must not be reduced to a colour key.

The trade is asserted, not just written down: `series-contrast.check.ts` fails if the pair ever becomes tritan-safe, which is the prompt to revisit rule 2 in [[design-tokens]] and relax the legend requirement.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A credit amount and the primary button are different greens | `--credit` given its own hex | Rule 2 |
| Two chart series look identical to a reader | Expected under tritanopia — check the legend still shows names and figures | See the trade above |
| An amber appears in a chart | `--warn` used as a series hue | Rule 3 |
| The CVD numbers in the docs disagree with the tokens | Hues changed without re-running the check | Rule 4 |
