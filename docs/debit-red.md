---
id: debit-red
type: decision
status: active
updated: 2026-08-02
links: [card-movement, ledger-row-debit-red, design-tokens, accent-green, transaction-ledger]
---

# Debits are red

A bank debit inks its arrow and its amount `--debit`, a brick red. Adopted 2026-08-02, on the same day [[card-movement]] shipped and over that section's own preference for keeping debits at `--ink`.

This is the **direction half** of [[ledger-row-debit-red]], taken without its card half. The two designs disagreed about what hue is *for*; the resolution is that hue answers **what the money did**, and a card is a fourth answer rather than a competing axis:

| Hue | Means |
|---|---|
| `--debit` | left an account |
| `--credit` | arrived in an account |
| `--violet` | the card — no account balance moved, what you owe did |
| `--muted` | neither (a self-transfer) |

## Rules for an agent working here

1. `--debit` **only ever inks** — glyph and numeral. `--danger` **only ever fills** — the delete button, the confirm band. Keep that split or the ledger stops being distinguishable from an alarm; a screen of debits must never produce a red block.
2. Never fill a row with `--debit-weak`. It exists for parity with the other hues and has no consumer. A standing tint on most of the list is the glare the palette exists to prevent, and the tinted well is already the hover/selection/confirm channel.
3. A card debit stays `--violet`, not `--debit`. It did not move an account balance, so it is not "money out" in the sense this hue means. See [[card-movement]] rule 3.
4. Colour is still the third signal. The sign (`−`, `+`, none) and the arrow angle (↗, ↙, ⇄) each carry direction alone and unchanged — this only adds a hue to what they already say.
5. Re-run `apps/desktop/series-contrast.check.ts` before touching `--debit`, `--credit` or `--danger`. It fails if the direction pair converges under protanopia or deuteranopia, or if debit red drifts toward danger crimson.

## Contract

```
--debit        light #af3a24   dark #f08c6b
--debit-weak   light rgba(175,58,36,.10)   dark rgba(240,140,107,.14)
```

Exposed to Tailwind as `--color-debit` / `--color-debit-weak` in the `@theme inline` block of `apps/desktop/src/App.css`, used as `text-debit`.

Applied in `apps/desktop/src/Transactions.tsx` at exactly two keys — `GLYPH.debit` and `AMOUNT.debit`. Nothing else in the app uses it.

Measured, on `--surface`, by `series-contrast.check.ts` (it prints these on every run):

| | light | dark |
|---|---|---|
| `--debit` | 5.9:1 | 7.3:1 |
| `--credit` | 5.2:1 | 9.2:1 |
| `--danger` | 5.4:1 | 5.5:1 |
| ΔE `--debit` vs `--danger` | 21.5 | 27.0 |

Floor is 4.5:1, not the 3:1 the chart series use — a signed amount is 15px/500 text, not a graphical object.

## The cost, accepted

Debits are roughly nine rows in ten, so this is the change that puts saturation on most of the list — which is precisely why [[card-movement]] argued for keeping them quiet. Two things hold the volume down and must not be undone: the hue **inks and never fills** (rule 1), and the red is a brick rather than a crimson.

One inconsistency is known and not fixed: the **Spent this month** tile is now the only money figure in the app that is red in the list and not red in the tile. [[ledger-row-debit-red]] flagged this and stopped there; so does this. Revisit only if the tiles are being reworked anyway.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| The list reads as an error state | Something filled with `--debit-weak`, or `--debit` was swapped for `--danger` | Rules 1 and 2 |
| Delete confirm no longer reads as the alarm | A red fill appeared elsewhere on the page | The confirm band must stay the only one |
| Income and expense look alike to a colour-blind reader | `--debit`/`--credit` drifted together | `series-contrast.check.ts` asserts ΔE > 5.7 under protan and deutan |
| Card rows went red | `kindOf` collapsed `cardDebit` into `debit` | Rule 3 — they are separate kinds on purpose |
