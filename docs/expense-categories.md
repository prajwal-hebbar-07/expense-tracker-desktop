---
id: expense-categories
type: decision
status: active
updated: 2026-08-03
links: [ollama-flow, transaction-ledger, analytics-page, persistence-sqlite]
---

# Categorising expenses

`expense.category` is written by **one button on the Transactions page**, never by the add form and never automatically. Pressing **Categorise** sends the uncategorised rows on screen to the configured Ollama model in batches of 40 and writes back a category per row. `''` is the uncategorised bucket ([[transaction-ledger]]), so a row added after a run simply stays `''` until the next press. Decided 2026-08-03; this is the first feature that consumes the model configured in [[ollama-flow]].

The page has two views of the same list — **Ledger** (every row, newest first, uncategorised included) and **Categories** (categorised rows only, grouped, biggest group first). There is no "Uncategorised" group in the second view: that group is the first view.

## Rules for an agent working here

1. **Never categorise on mount, on a timer, or after an insert.** Every run spends tokens on a paid subscription, and an automatic one spends them on every visit to the page. The button is the whole trigger.
2. **Validate the model's answer against `CATEGORIES` before it reaches SQL.** A free-form label drifts — "Food", "food", "Restaurants" become three groups of one thing — and the grouped view is only worth having if the same expense lands in the same bucket every run. Anything unrecognised becomes `Other`.
3. **Give every row in the batch a category, including the ones the model omitted.** A row left at `''` after a run the user was told had finished reappears as uncategorised and reads as a broken button.
4. **Skip transfers** (`to_account_id IS NOT NULL`). Moving your own money between your own accounts is not spending — [[self-transfer]] — so no category applies, and a transfer stays out of the Categories view permanently rather than until the next run.
5. **Write with `SET_CATEGORY`, never by widening `UPDATE_TRANSACTION`.** Editing a row must not silently re-file it, and a categorisation run must not be able to touch the amounts [[derived-balances]] is computed from.
6. **Write batch by batch, not once at the end.** A run that fails on batch three keeps batches one and two; pressing the button again picks up the rest. The `finally` around `refresh()` in `categorise()` is what makes that visible.
7. **Match on the ledger id, not on position.** The prompt numbers each line with the real `expense.id`, so a model that drops or reorders an entry still files every category it did return on the right row.
8. **Keep the model call in Rust** — `ollama_json`, rule 3 of [[ollama-flow]]. No `fetch` in a `.tsx`.

## Contract

### Files

| File | Holds |
|---|---|
| `apps/desktop/src/categorize.ts` | `CATEGORIES`, `buildPrompt`, `parseCategories`, `batches`, `BATCH = 40`. Pure — no db, no `invoke` |
| `apps/desktop/categorize.check.ts` | The reply-parsing checks. `pnpm --filter desktop test` |
| `apps/desktop/src/Transactions.tsx` | `categorise()`, the `View` toggle, `byCategory()` |
| `apps/desktop/src/queries.ts` | `SET_CATEGORY`; `TRANSACTIONS` now selects `e.category` |

### Categories

The closed list, in `categorize.ts`. Adding one is a data decision — old rows keep whatever they were filed under until they are re-categorised, and nothing re-categorises a non-empty row today.

```
Food & Dining, Groceries, Transport, Shopping, Bills & Utilities,
Rent, Health, Entertainment, Travel, Education, Income, Other
```

`Income` covers credits. `Rent` is also the tag [[chart-outlier]] reads.

### Command

`ollama_json(base_url, model, prompt) -> String` — `/api/chat` with `format: "json"`, 120s. Same key, host and error sentences as `ollama_check`; both are thin wrappers over one private `chat()` in `lib.rs`. `format: "json"` constrains the output to valid JSON, **not** to a schema — rule 2 still applies.

### Prompt and reply

One line per transaction, `id: title (note) [money out]`, then the closed list and an instruction to answer with an object mapping id to category:

```json
{ "12": "Groceries", "13": "Income" }
```

`parseCategories` takes the outermost `{`…`}` (models fence their JSON even when told not to), parses, then maps each requested id through a lowercase lookup of `CATEGORIES`.

## Anti-patterns

- **Categorising inside `refresh()` or a `useEffect`.** Rule 1.
- **`UPDATE expense SET category = '<model output>'`** without the `CATEGORIES` lookup. Rule 2 — this is the line to reject in review.
- **An `Uncategorised` group in the Categories view.** It is the Ledger view printed a second time.
- **Adding `category` to `UPDATE_TRANSACTION`'s parameter list** so the edit form can set one. Rule 5; the form deliberately does not collect a category.
- **A `LIMIT`-less pass over the whole table.** The run categorises what the page loaded (`TRANSACTIONS`, 200 rows), which is also what the user can see.
- **Re-categorising rows that already have a category.** It costs tokens to overwrite a user-visible value with a possibly different one.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `Pick an AI model in Settings before categorising.` | No `model` settings row | Settings → AI model → Connect, pick a model |
| `API key rejected…` | [[ollama-flow]] rule 9 — the key was never proven by listing models | Paste a fresh key and press Test |
| `Model did not answer with JSON` | The model ignored `format: "json"` — small models do | Pick a larger model; the run wrote nothing for that batch |
| Everything lands in `Other` | The model is answering with labels outside the list | Rule 2 is working as intended; a bigger model fixes the labels |
| The button says a number that never drops | Every remaining row is a transfer | Rule 4 — transfers are not counted; if it is not zero, check `to_account_id` |
| A run stops halfway with an error | One batch failed | Earlier batches are already filed; press Categorise again |

## Not done yet

- **Editing a category by hand.** There is no picker on a row; the only way to change one is a model run, and a run skips rows that already have a category. ⚠ Verify before promising a user can correct a mistake.
- **"Where it went" in [[analytics-page]]** — the node says it needs categorisation to exist first. It exists now; `FEED` still does not select `category`.
