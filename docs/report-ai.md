---
id: report-ai
type: decision
status: active
updated: 2026-08-05
links: [report-page, analysis-persistence, analytics-insights, ollama-flow, ollama-accounts, expense-categories]
---

# The written report

**Generate report** is one button in the Report header. Pressing it sends the figures the rules already computed for the window — the split, the category ranking, the ratios, the outliers — to the configured Ollama model, and replaces the *prose* of the page with what comes back: the headline, the findings, the habits, the reframes. It is then written to the `report` table and read back on mount, so a report is generated once per window and survives a reload. Decided 2026-08-05; the third feature to spend the model configured in [[ollama-flow]], after [[expense-categories]] and [[analytics-insights]].

Nothing about it is automatic. Without a press the page is exactly what [[report-page]] describes: the rules version, complete on its own. The rules are not a fallback that exists to be replaced — they are what the page shows to a user with no model configured, and the shape the model has to fill.

**The model writes sentences, never figures.** `report.spent`, the split bar, and the target are recomputed from the ledger on every render whichever author is on screen. A model that hallucinates a total therefore contradicts a number sitting two lines above it, and the reader can see both.

## Rules for an agent working here

1. **Never generate on mount, on a period change, or on a timer.** Every run spends tokens on a paid subscription and the stepper is one click. Reading a stored report is free and therefore automatic; writing one is the button and only the button. A `useEffect` calling `loadReport` is correct, a `useEffect` calling `generate()` is this rule violated — same line as [[analytics-insights]] rule 1.
2. **One aggregation, two writers.** `buildFacts` in `report.ts` computes every figure; `buildReport` turns it into rules-prose and `buildReportPrompt` turns the same object into the prompt. Never compute a figure for the prompt separately — a second aggregation is how the model gets told 24% while the bar beside it draws 36%.
3. **Do the dividing in the prompt.** Every ratio the report could want is already a figure in the fact sheet: eating out against groceries, subscriptions annualised, the card share, the small-spend drip, the change against the previous period. A model asked to divide is a model that will get it wrong next to the chart that shows it.
4. **Drop a finding that has no figure.** [[report-page]] rule 1 is the whole premise of the screen, and a model will happily write "you spend too much on impulse buys". `parseWrittenReport` requires both `title` and `figure`; a finding with neither is discarded rather than rendered.
5. **Clamp estimated savings to the controllable spend, cumulatively.** The prompt states the budget in **whole rupees** and the parser clamps each `saves` in paise as it goes, so the total is always strictly below one month of controllable spend. [[report-page]] rule 4 is the property; the clamp is what makes it hold when a model multiplies a weekly saving by 30.
6. **An unknown severity becomes `note`.** `watch`/`note`/`good` are the three colours the page has ([[design-tokens]]); `"critical"` would render as an undefined tone. `note` is the one that claims nothing.
7. **Parse before you write.** `saveReport` runs only after `parseWrittenReport` has returned, so a malformed reply throws, the error renders, and the previously stored report for that window survives. Same as [[analysis-persistence]] rule 7.
8. **Render a stale report as stale.** The `fingerprint` is compared on read; a mismatch adds a line saying the period has changed and naming the button that fixes it. Never hide it, never regenerate it — regenerating on a mismatch turns the period stepper into a billing loop. [[analysis-persistence]] rule 6, and its known blind spot (a category change does not move the fingerprint) applies here too.
9. **Keep the model call in Rust** — `ollama_json`, rule 3 of [[ollama-flow]]. No `fetch` in a `.tsx`.
10. **Credit the model that wrote it, not the one configured now.** The row stores `model`; the card renders `shown.model`. After changing the model in Settings, the old prose must still name its author.

## Contract

### Files

| File | Holds |
|---|---|
| `apps/desktop/src/report.ts` | `Facts`, `buildFacts`, `buildReport`, `SMALL`, `BIG`. Pure |
| `apps/desktop/src/reportAi.ts` | `Written`, `buildReportPrompt`, `parseWrittenReport`, `MAX_FINDINGS = 5`, `MAX_HABITS = 4`, `MAX_REFRAMES = 3`. Pure — no db, no `invoke` |
| `apps/desktop/src/Reports.tsx` | `generate()`, the `ai` stamp, the stored-report load, the attribution and stale lines |
| `apps/desktop/src/queries.ts`, `db.ts` | `SAVE_REPORT`, `LOAD_REPORT`, `saveReport`, `loadReport`, `StoredReport` |
| `apps/desktop/reportAi.check.ts` | Prompt and reply checks. `pnpm --filter desktop test` |

### Facts

`buildFacts(all, win, prevRows)` — everything the window supports, computed once:

```
win, rows (debits), days, months (≥ 0.25), spent, essentials, discretionary,
cats [[category, amount]], topControllable, unfiled, rent, eatingOut,
foodOrders, groceries, subs, onCards, smalls[], bigs[], before, income,
spendDays, target
```

Amounts are paise. The prompt renders them with `formatAmount`/`formatAmountRound`, the same functions the page prints.

### Reply

```json
{
  "headline": "one sentence",
  "findings": [{ "title": "…", "figure": "…", "why": "…", "severity": "watch|note|good" }],
  "habits":   [{ "title": "…", "how": "…", "saves": 0 }],
  "reframes": [{ "title": "…", "body": "…" }]
}
```

`saves` crosses the wire in **whole rupees** and is stored and rendered in **paise** — `parseWrittenReport` multiplies by 100. `parseWrittenReport(reply, budget)` takes the outermost `{`…`}` (models fence their JSON even when told not to), trims every string, drops a finding with no title or no figure, a habit with no title, a reframe with no title or no body, caps each list, sorts habits by `saves` descending, and throws when nothing at all survives. An empty `headline` with sections that survived is not an error — the page falls back to the rules headline.

### Command

`ollama_json(base_url, model, prompt, api_key) -> String` — one call per press, no batching. Same host and error sentences as the rest of [[ollama-flow]]; `getOllamaConfig()` supplies the selected account's key and the caller passes it as `apiKey: config.api_key` ([[ollama-accounts]]). `format: "json"` constrains the reply to valid JSON, **not** to this schema, which is why rules 4–6 exist.

### Migration 8, `create_report_table` — `apps/desktop/src-tauri/src/lib.rs`

```sql
CREATE TABLE report (
  window_from TEXT NOT NULL,
  window_to   TEXT NOT NULL,
  model       TEXT NOT NULL,
  headline    TEXT NOT NULL,
  findings    TEXT NOT NULL,
  habits      TEXT NOT NULL,
  reframes    TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (window_from, window_to)
);
```

Same shape and same reasoning as `analysis` ([[analysis-persistence]] rules 2–4): the window is the primary key so a second press replaces rather than appends, and each of `findings`, `habits` and `reframes` is a JSON array in one `TEXT` column because nothing queries them by field. `fingerprint` is `"<row count>:<spent>:<received>"` for the window at generation time, computed from `within(feed, win)` — the same rows the facts came from.

`SAVE_REPORT` is an upsert on `(window_from, window_to)`; `LOAD_REPORT` selects by the same pair. `db.ts` holds `loadReport` / `saveReport` around them and `list<T>()`, which parses a JSON column and falls back to an empty list so a corrupted row costs a section, not the page.

### What the page shows

| Stored / generated | Renders |
|---|---|
| nothing | the rules report; the button says **Generate report** |
| present, fingerprint matches | the model's headline, findings, habits and reframes over the ledger's own figures, credited to the model and its date; the button says **Rewrite with AI** |
| present, fingerprint differs | the same, plus a line saying the period has changed and naming the button |
| generate failed | the error, and the rules report underneath it — the stored row is untouched |

## Anti-patterns

- **Calling `generate()` from a `useEffect`**, or on a period change. Rule 1; this is the line to reject in review.
- **Letting the model write a figure the page draws.** `spent`, the split bar and the target come from `buildReport`, never from the reply. A `Written` that carried them would let a hallucination move a bar.
- **Deleting the rules version once the model path works.** It is the no-model experience, the empty-window sentence, and the shape the prompt is written against.
- **Sending the window's transactions.** The facts are ~15 lines whatever the window's size; a year of rows is thousands of them for an answer the aggregates already support.
- **A second table, or a JSON blob in `settings`.** [[analysis-persistence]] rule 3.
- **Auto-regenerating on a stale fingerprint.** Rule 8 — tokens nobody authorised, once per stepper click.
- **Keying the React list on `f.title`.** A model repeats itself; two findings with one title is a duplicate-key crash. The lists are keyed by index.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `Pick an AI model in Settings before generating a report.` | No `model` settings row | Settings → AI model → Connect, pick a model |
| `Model did not answer with JSON` | The model ignored `format: "json"` | Pick a larger model; nothing was written, press again |
| `Model answered with no report` | Valid JSON, no headline and no usable section | Same — a larger model, or press again |
| `no such table: report` | Migration 8 has not run | Restart the app; migrations run when the connection opens ([[persistence-sqlite]]) |
| The report reverts to the rules version after a failed press | Working as intended — rule 7. The stored row is intact | Press again; a remount shows the stored one |
| The report is marked stale immediately after generating | The fingerprint was computed from different rows than the facts | Compute both from `within(feed, win)` — [[analysis-persistence]] rule 8 |
| A habit promises more than the period's controllable spend | The clamp was bypassed, or `budget` was passed in rupees | Rule 5; `budget` is paise, `saves` on the wire is rupees |
| The card credits a model the user never ran | `model` read from settings at render time instead of from the row | Rule 10 |
| Prose about July above August's figures | The `window` stamp was not compared, or was cleared in a `useEffect` | `shown = ai?.window === winKey ? ai : null` |

## Checks

`pnpm --filter desktop test` runs `reportAi.check.ts`: the prompt carries the window, the split, the categories and the pre-divided ratios; no figure in it is `NaN`/`Infinity`, including for an empty window; the savings budget is stated in rupees; unfiled rows are named as missing information. On the reply: a clean answer parses, fences are tolerated, a finding without its figure is dropped, an unknown severity becomes `note`, savings are clamped below the budget and ranked, the caps hold, and non-JSON or empty replies throw. `balances.check.ts` runs `SAVE_REPORT`/`LOAD_REPORT` against real SQLite: a second save for one window replaces the row.

Verified end to end on 2026-08-05: against a real local Ollama daemon (`minimax-m3`), the prompt built from the fixture feed returned fenced JSON that parsed into five findings, four habits and three reframes with savings under the budget and no broken number; and in the app with a stubbed `ollama_json` — no call on mount or on a period change, one call per press, the stored report read back on remount crediting its own model and date, a fingerprint mismatch rendering the stale line without a call, and a malformed reply leaving the stored row untouched.
