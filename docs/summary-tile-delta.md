---
id: summary-tile-delta
type: decision
status: active
updated: 2026-08-01
links: [design-tokens, filter-row, analytics-page]
---

# The summary tile and its delta

`apps/desktop/src/Stat.tsx` is the Analytics summary tile; `delta.ts` decides what its bottom row says. The Overview balance tile is a **different object** (`Balance`, local to `AddTransaction.tsx`), not this one with the delta switched off — a standing balance has nothing to compare itself against, and its figure right-aligns.

## The two axes

The mark reports the arithmetic. The colour reports the verdict. Neither is asked to do both.

Spent ↑30% and Net ↓48% are opposite marks in the same red, and that is correct: `direction(pct)` is the sign, `tone(pct, goal)` is whether the user is better off. `goal` is what makes a sign mean anything — −9% on Spent is good news, −9% on Received is not.

## Rules for an agent working here

1. **The mark is a filled 9×9 triangle, never a stroked chevron.** At 12px a 1.7 stroke is 1.7px of ink on a 9px glyph and it greys out against `--surface`. Filled, the same glyph is a solid mass that survives 100% scaling on a non-retina panel.
2. **Up and down are separate paths, never one rotated triangle**, so neither inherits the other's optical weight.
3. **The flat state is the word plus a slab: `flat · 2% vs Jun`.** `≈` at 12px collapses into a smudge that scans as a dash, an equals sign, or dirt on the screen — and it was the only glyph in the tile carrying meaning by shape alone.
4. **No prior period is a sentence, not a 0% delta.** The first month in the file, and any Range with no equal-length predecessor, renders `no prior period`. `↑0%` there is a lie told in the strongest colour on the screen. The row keeps its 15px height so four tiles stay flush.
5. **The verdict word goes in the accessible label.** "Spent, ₹1,27,645, up 30 percent versus June, worse" — colour is never the only carrier. `VERDICT` in `delta.ts` maps every tone to a word; if you add a tone, add its word.
6. **Tint the icon circle only.** `--danger-weak` fill with a `--danger` glyph; the figure itself stays `--ink`. A tinted figure makes the tile shout before it has said anything.
7. **Write tint classes out in full.** `TINT` in `Stat.tsx` is a literal map because Tailwind scans source text — `bg-${tint}-weak` compiles to a class that was never generated, and the circle comes out transparent with no error anywhere.

## Contract

```ts
<Stat label value
      delta={{ pct: number | null, goal: "lower" | "higher", vs: string }}
      icon tint={"accent" | "credit" | "danger" | "violet"} />
```

`vs` is the previous window's label, shortened by the caller: Analytics strips a trailing year that matches the current window's, so "Jun 2026" reads "Jun".

Tints: Spent `danger` · Received `credit` · Net `accent` · Per day `violet`.

Sizes: padding 14, gap 8, min-height 118, circle 40 with a 24px 1.7-stroke glyph, label 11/500 caps +7%, figure 22/600 tabular at −1% tracking, delta 12/500 with a 5px gap.

`NOISE_PCT` is 5: under it a move is noise. A tile that shouts at a 2% wobble is ignored by the time it has something worth saying.

Colour ratios at 12px on `--surface`: `--danger` 5.5:1, `--credit` 6.8:1, `--muted` 6.3:1 — all above the 4.5:1 small-text floor.

## Anti-patterns

- **A single rotated triangle for both directions.** Rule 2.
- **`≈` or `~` for the flat state.** Rule 3.
- **`change()` returning 0 instead of `null` for a missing base.** `delta.ts` returns `null` when the base is not positive, because dividing by zero gives Infinity and dividing by a negative flips the sign — a Net going −₹1,000 → +₹500 would report "−150%", a fall, for an outcome that improved.
- **Colouring by the sign of `pct`.** That is `direction`; colour comes from `tone(pct, goal)`.
- **Interpolating a tint into a class name.** Rule 7.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A green "you spent 40% more" | `goal` wrong, or colour taken from the sign | `delta.check.ts` pins both directions |
| The icon circle is transparent | Tint class interpolated | Rule 7 |
| Tiles sit at different heights in a row | The delta row lost its fixed 15px in one branch | Rule 4 |
| "↑0% vs prev" on the earliest period | `pct: null` treated as 0 | Rule 4 |
