---
id: analysis-persistence
type: decision
status: active
updated: 2026-08-05
links: [analytics-insights, persistence-sqlite, analytics-real-feed]
---

# Storing the AI analysis

The analysis that **Explain with AI** produces ([[analytics-insights]]) is written to SQLite, one row per Analytics window, and read back on mount and on every period change. Before 2026-08-05 it lived in React state and died with the page: a reload, a tab switch, or a step to another month and back cost another model call. It is a paragraph the user paid tokens for; throwing it away on unmount was the only part of that feature that spent money for nothing.

Reading is free and therefore automatic. **Generating is still the button, and only the button** — the whole trigger discipline of [[analytics-insights]] rule 1 is unchanged. What changed is that a press now also writes, and that the row carries enough context to say whether it is still true.

## Rules for an agent working here

1. **Read on mount and on a period change; never generate there.** A `SELECT` costs a millisecond and no tokens, so loading a stored analysis is free — but `explain()` bills a request, and the period stepper is one click. This is the line the two behaviours are separated on, and it is the one to check in review: a `useEffect` calling `loadAnalysis` is correct, a `useEffect` calling `explain()` is [[analytics-insights]] rule 1 violated.
2. **Key the row on the window, never on an autoincrement id.** `PRIMARY KEY (window_from, window_to)` plus `ON CONFLICT … DO UPDATE` means pressing the button again replaces the analysis for that window. Without it, every press appends and the read has to pick a winner by `created_at` — a history nobody asked for, growing forever, in exchange for a `MAX()` in every query.
3. **Never put this in the `settings` table.** [[persistence-sqlite]] is explicit that nothing but `base_url` and `model` belongs there, and a JSON blob in a `value` column is the anti-pattern [[settings-schema]] exists to prevent. `settings` is a key/value store for scalars the app configures itself with; an analysis is per-window content with its own lifetime, its own staleness rule, and a primary key that means something.
4. **Store `insights` as a JSON array in one `TEXT` column**, because nothing queries it by field. It is a document — read back whole, rendered whole, replaced whole. A child `insight` table would add a join, an ordering column, and a cascade delete to buy filtering that no screen offers.
5. **Write a `fingerprint` with every analysis and compare it on read.** The prose asserts figures. If the ledger has changed since — a transaction added, edited, deleted, or categorised — those figures may no longer hold, and a confident paragraph about numbers that have moved is worse than no paragraph. Same failure the window stamp in [[analytics-insights]] rule 3 prevents; the stamp catches the wrong *window*, the fingerprint catches the same window with different *contents*.
6. **Render a stale analysis as stale, never hide it and never silently refresh it.** Hiding it makes a reload look like the button never worked. Refreshing it spends tokens the user did not authorise (rule 1). Showing it with a "figures have changed since this was written" line lets the user decide whether to press the button again — which is the only thing that can make it current.
7. **Never write an analysis the model did not produce.** `saveAnalysis` runs after `parseInsights` has succeeded ([[analytics-insights]] rule 6). A malformed reply throws and writes nothing, so the previous stored analysis for that window survives a failed retry.
8. **Compute the fingerprint from the window's rows at generation time**, from the same `Txn[]` the prompt's facts came from, so the stored figures and the fingerprint can never describe different data.

## Contract

### Migration 7, `create_analysis_table` — `apps/desktop/src-tauri/src/lib.rs`

```sql
CREATE TABLE analysis (
  window_from TEXT NOT NULL,
  window_to   TEXT NOT NULL,
  model       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  insights    TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (window_from, window_to)
);
```

| Column | Holds |
|---|---|
| `window_from` / `window_to` | the Analytics window, `YYYY-MM-DD`, exactly the `win.from`/`win.to` the card is stamped with |
| `model` | the model that wrote it, so the card can name its author after a reload ([[analytics-insights]] rule 8) — not the model currently configured in Settings |
| `summary` | the one-sentence summary |
| `insights` | JSON array of `{ title, detail }`, capped at `MAX_INSIGHTS = 4` by `parseInsights` before it is written |
| `fingerprint` | `"<row count>:<spent>:<received>"` for the window at generation time |
| `created_at` | ISO-8601 UTC, `strftime('%Y-%m-%dT%H:%M:%SZ','now')` — rule 4 of [[persistence-sqlite]]; reset by the upsert, because a replaced analysis is a new one |

No index: the primary key *is* the lookup, and the table holds at most one row per window a user has ever pressed the button on.

### Queries — `apps/desktop/src/queries.ts`

```sql
-- SAVE_ANALYSIS
INSERT INTO analysis (window_from, window_to, model, summary, insights, fingerprint)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT(window_from, window_to) DO UPDATE SET
  model = excluded.model, summary = excluded.summary,
  insights = excluded.insights, fingerprint = excluded.fingerprint,
  created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')

-- LOAD_ANALYSIS
SELECT model, summary, insights, fingerprint, created_at
FROM analysis WHERE window_from = $1 AND window_to = $2
```

`apps/desktop/src/db.ts` holds `loadAnalysis(from, to)` and `saveAnalysis(from, to, { model, summary, insights, fingerprint })` around these, alongside `loadFeed` ([[analytics-real-feed]]). `insights` crosses the boundary as a JSON string: `saveAnalysis` stringifies, `loadAnalysis` parses exactly once and falls back to an empty list if the value is unreadable, so a corrupted row costs the bullets rather than the page.

### Fingerprint

`"<row count>:<spent>:<received>"` — the three figures every tile on the page is derived from, for the window at generation time, spent and received in paise.

It is a change detector, not a hash: cheap to compute from the rows already loaded, and it moves on the edits that matter (an added, deleted or re-amounted transaction; a transfer that stopped being one). It deliberately **does not** move when only a `category` changes, which reshapes "Where it went" without touching the totals. ⚠ That is the known blind spot — a categorisation run can leave a stale analysis reading as current. Widen the fingerprint before claiming otherwise.

Compare on read; do not recompute-and-rewrite. A mismatch is information for the user, not a repair job.

### States the card can be in

| Stored row | Fingerprint | Renders |
|---|---|---|
| none | — | no card; the button is the only thing on offer |
| present | matches the window's current figures | the analysis, naming the model and its date |
| present | does not match | the same analysis plus a stale line telling the reader the figures have moved and the button will refresh it |

The window stamp is not needed as a runtime guard on a stored analysis — the row is *looked up* by the window, so a mismatch is unrepresentable. It is still needed for an in-flight generate landing after the user has stepped away ([[analytics-insights]] rule 3).

## Anti-patterns

- **`settings` with a key like `analysis:2026-07-01:2026-07-31`.** Rule 3. This is the review line; the name of the table is not an invitation.
- **An `id INTEGER PRIMARY KEY AUTOINCREMENT` plus `ORDER BY created_at DESC LIMIT 1`.** Rule 2 — an accidental history, and a table that grows with every press.
- **A separate `analysis_insight` child table.** Rule 4. A join for prose that is only ever read whole.
- **Auto-regenerating when the fingerprint mismatches.** Spends tokens without a press — rule 1, and it turns a stepper into a billing loop.
- **Hiding a stale analysis.** Rule 6; indistinguishable from a broken feature.
- **Storing the *currently configured* model instead of the one that wrote it.** After changing the model in Settings the card would credit the wrong author for old prose.
- **Writing before parsing.** Rule 7 — a malformed reply would overwrite a good analysis with nothing.
- **Deleting rows on a period change** to "keep the table small". At most one row per window pressed; this is a table that never needs pruning.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `no such table: analysis` | Migration 7 has not run — the connection was opened before it was added, or `Database.load` is not reached | Restart the app; the migration runs when the connection opens ([[persistence-sqlite]]) |
| The analysis disappears on reload | `loadAnalysis` is not called on mount, or is called with the window before it resolves | Rule 1; load after `usePeriod` has resolved `win` |
| The card is always marked stale | The fingerprint is computed from different rows than the ones stored — e.g. before `within(rows, win)` rather than after | Rule 8 — compute from the same `Txn[]` the facts came from |
| The card never goes stale after an edit | Only the category changed, which the fingerprint does not cover | Known blind spot, above; press the button to refresh |
| Two analyses shown for one window | Reading without the window predicate, or the primary key was dropped | Rule 2 |
| `UNIQUE constraint failed: analysis.window_from, analysis.window_to` | A plain `INSERT` was used instead of `SAVE_ANALYSIS` | Use the upsert; the conflict clause is the whole point |
| A failed generate wiped the previous analysis | Something wrote before `parseInsights` returned | Rule 7 |
| Stored `insights` renders as `[object Object]` or as raw JSON | Double-stringified on write, or not parsed on read | Stringify once on write, `JSON.parse` once on read |
| The card credits a model the user never ran | `model` read from settings at render time instead of from the row | Render `analysis.model`, not the configured one |
