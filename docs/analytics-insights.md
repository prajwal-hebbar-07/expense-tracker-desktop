---
id: analytics-insights
type: decision
status: active
updated: 2026-08-05
links: [analytics-page, ollama-flow, expense-categories, summary-tile-delta, analysis-persistence]
---

# The AI analysis on Analytics

**Explain with AI** is one button in the Analytics header. Pressing it sends the *aggregates already on screen* — totals for the window and its comparison, the two ranked lists, accounts vs cards, the fixed charges and the five biggest spends — to the configured Ollama model, and renders a one-sentence summary plus up to four bullets in a card between the summary tiles and the chart. Nothing about it is automatic: without a press the page behaves exactly as it did before, and no token is spent. Decided 2026-08-05; the second feature to spend the model configured in [[ollama-flow]], after [[expense-categories]].

The card is **stamped with the window it was generated for** and only renders while that stamp matches the window on screen. Stepping from July to June hides it; stepping back shows the same analysis again without a second call. Since 2026-08-05 the analysis also **survives a reload**: it is written to the `analysis` table and read back on mount — see [[analysis-persistence]], which owns the schema, the staleness fingerprint, and the rule that reading is free while generating stays on the button.

## Rules for an agent working here

1. **Never run on mount, on a period change, or on a timer.** Every run spends tokens on a paid subscription, and the stepper is one click — an auto-run would bill a request per click. The button is the whole trigger, same as rule 1 of [[expense-categories]].
2. **Send the aggregates, never the transactions.** The page has already computed everything the prompt states, so a run is ~20 lines regardless of window size — a year costs the same as a week, fits any context, and the model can only speak about figures the user can see beside the answer.
3. **Stamp the result with `${win.from}|${win.to}` and render only on a match.** Two failures, one comparison: an analysis of July above August's charts, and a slow run landing after the user has stepped away. Never clear it from a `useEffect` — that fixes the first case and leaves the second.
4. **Never write to the ledger.** The run reads; there is no analytics equivalent of `SET_CATEGORY`, and no figure on the page is ever adjusted by it. The one thing a press does write is the analysis itself, into its own table ([[analysis-persistence]]) — after `parseInsights` has succeeded, so a failed run overwrites nothing.
5. **State in the prompt that the model may use only the figures given.** A number invented next to the chart that contradicts it is worse than no analysis, and the card sits directly above that chart.
6. **Drop a malformed bullet, throw on an empty report.** A bullet with no title is a blank row the user cannot interpret; a report with neither summary nor bullets is a card that reads as a broken button. `parseInsights` does both.
7. **Keep the model call in Rust** — `ollama_json`, rule 3 of [[ollama-flow]]. No `fetch` in a `.tsx`.
8. **Say who wrote it.** The card names the model and carries one line telling the reader to check anything surprising against the charts. The figures are the source; the prose is a model's reading of them.

## Contract

### Files

| File | Holds |
|---|---|
| `apps/desktop/src/insights.ts` | `Facts`, `buildInsightsPrompt`, `parseInsights`, `MAX_INSIGHTS = 4`, `Insight`, `Report`. Pure — no db, no `invoke` |
| `apps/desktop/insights.check.ts` | The reply-parsing checks. `pnpm --filter desktop test` |
| `apps/desktop/src/Analytics.tsx` | `explain()`, the `ai` stamp, the **AI analysis** card |
| `apps/desktop/src/queries.ts`, `db.ts` | `SAVE_ANALYSIS`, `LOAD_ANALYSIS`, `saveAnalysis`, `loadAnalysis` — [[analysis-persistence]] |

### Facts

Exactly what the prompt may state, all of it already computed for the charts:

```
win, vs, days, now/before (spent, received, net, perDay),
categories (rank by category), sources (rank by source, 4),
onAccounts, onCards, fixed { total, labels }, biggest (5)
```

Amounts are rendered with `formatAmountRound` — rounded rupees, matching rule 6 of [[analytics-page]]. `vs` is the short comparison label the tiles print ("Jun").

### Reply

```json
{ "summary": "one sentence", "insights": [ { "title": "three to six words", "detail": "one or two sentences" } ] }
```

`parseInsights` takes the outermost `{`…`}` (models fence their JSON even when told not to), trims every string, drops any bullet with no title, caps the list at `MAX_INSIGHTS`, and throws when nothing survives. A bullet with a title and no detail renders as a title alone.

### Command

`ollama_json(base_url, model, prompt) -> String` — one call per press, no batching. Same key, host and error sentences as the rest of [[ollama-flow]]; `format: "json"` constrains the reply to valid JSON, **not** to this schema, which is why rule 6 exists.

## Anti-patterns

- **Calling `explain()` from a `useEffect`**, or "refreshing" it when the period changes. Rule 1 — this is the line to reject in review.
- **Putting the window's transactions in the prompt.** Rule 2; a year window is thousands of rows for an answer the aggregates already support.
- **Rendering `ai.report` without checking the stamp.** Rule 3.
- **Caching the analysis in the `settings` table** so it survives a reload. Reloads are handled — the analysis is stored, but in the `analysis` table keyed by the window, with a fingerprint that makes a stale one visible ([[analysis-persistence]]). `settings` holds `base_url` and `model` and nothing else; a JSON document in a `value` column is the anti-pattern [[persistence-sqlite]] and [[settings-schema]] exist to prevent.
- **A second button for "regenerate".** Pressing the same button again is the regenerate.
- **Letting the model's prose replace a figure.** The tiles and charts stay exactly as they are; the card is commentary beside them, never instead of them.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `Pick an AI model in Settings before generating an analysis.` | No `model` settings row | Settings → AI model → Connect, pick a model |
| `API key rejected…` | [[ollama-flow]] rule 9 — listing models never proved the key | Paste a fresh key and press Test |
| `Model did not answer with JSON` | The model ignored `format: "json"` — small models do | Pick a larger model; nothing was written, press the button again |
| `Model answered with no analysis` | Valid JSON, empty summary and no usable bullet | Same — a larger model, or press again |
| The card vanished on its own | The period moved | Rule 3, working as intended; press the button again for the new window |
| The card is back after a reload but marked stale | The window's figures have changed since it was written | [[analysis-persistence]] rule 6 — press the button for a current one |
| A figure in the prose does not match the chart | The model invented it despite rule 5 | Trust the chart; the card's own footer says so |
| Pressing the button does nothing visible | The window is invalid (start after end) — the button is disabled there | Fix the range |

## Checks

`pnpm --filter desktop test` runs `insights.check.ts`: the prompt carries the window, both periods' figures and the rankings; empty rankings say "none"; fences and commentary are tolerated; a titleless bullet is dropped; more than `MAX_INSIGHTS` bullets are cut; non-JSON and empty replies throw.

Verified end to end on 2026-08-05 against a stubbed `ollama_json` in the dev server: one call per press and none before it, the prompt carrying the figures on screen, a fenced reply rendering, a stepper click hiding the card and stepping back showing it again without a second call.
