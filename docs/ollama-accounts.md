---
id: ollama-accounts
type: decision
status: active
updated: 2026-08-05
links: [ollama-flow, ollama-key-in-settings, ollama-key-keychain, persistence-sqlite, settings-schema, stack]
---

# Named Ollama accounts and active API key

Ollama API keys are named rows in `ollama_account`, not scalar settings. One row may be active; its key handles every AI request. No active row is valid and means “send no key”, which is the local-daemon configuration. Keys remain plaintext in `expenses.db`; [[ollama-key-in-settings]] keeps the superseded singleton design and its still-applicable threat analysis.

## Rules for an agent working here

1. **Store every key in `ollama_account`, because credentials are an entity list.** Never encode the list as JSON or dynamic keys in `settings`.
2. **Read model-call configuration only through `getOllamaConfig()` in `apps/desktop/src/db.ts`, because it joins scalar settings with the active credential.** A caller reading tables independently can pair the wrong key with the selected account.
3. **Allow at most one `active = 1` row, because every request needs one deterministic account.** `idx_ollama_account_active` enforces this; `setActiveOllamaAccount()` clears the current row before setting the next one.
4. **Treat no active row as no key, not as an error, because local Ollama has no authentication.** `getOllamaConfig()` returns `api_key: ''` in this state.
5. **Name accounts uniquely with case-insensitive comparison, because the selection control must distinguish them.** `Personal` and `personal` are the same name under the table constraint.
6. **Mask the selected key by default and reveal it only after the user presses Show, because the user asked to inspect saved values without exposing them in ordinary screenshots.** Hide it again after selection, edit, add, or removal.
7. **Pass the active key into every Rust Ollama command, because Rust stores nothing and reads no database.** Keep the invoke argument camelCase: `apiKey`.
8. **Delete the whole account row when Remove is pressed, because a name without a key has no usable state.** A user who wants local mode selects `No API key`; do not store an empty credential row.
9. **Never persist verification, because a key may be revoked between launches.** Only a successful `ollama_check` completion earns the in-memory Verified badge.

## Contract

### Migration 9 — `create_ollama_account_table`

| Column | Type and constraint | Meaning |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Selection identity |
| `name` | `TEXT NOT NULL COLLATE NOCASE UNIQUE`, non-blank check | User-facing account label |
| `api_key` | `TEXT NOT NULL`, non-blank check | Raw plaintext bearer key |
| `active` | `INTEGER NOT NULL DEFAULT 0`, `0..1` check | The key used by model calls |
| `created_at` | UTC ISO-8601 text | Creation time |

`idx_ollama_account_active ON ollama_account(active) WHERE active = 1` permits many saved keys and at most one selected key.

Migration 9 copies a non-empty legacy `settings.api_key` into `{ name: 'Default', active: 1 }`, then deletes the legacy row. An empty or absent legacy value creates no account. `apps/desktop/balances.check.ts` executes the real migration SQL and pins both the copy and the one-active constraint.

### Frontend persistence — `apps/desktop/src/db.ts`

| Function | Result |
|---|---|
| `getOllamaConfig()` | `{ base_url, model, api_key }`; key comes from the active row or `''` |
| `getOllamaAccounts()` | All `{ id, name, api_key, active }` rows, active first then name |
| `addOllamaAccount(name, apiKey)` | Inserts the row, selects it, returns it |
| `setActiveOllamaAccount(id | null)` | Selects one row or the no-key state |
| `updateOllamaAccountKey(id, apiKey)` | Replaces one saved key |
| `deleteOllamaAccount(id)` | Removes the name and key |

`settings` now holds only `base_url` and `model`, still written with `setSetting()`. `getSettings()` and the `settings.api_key` read path no longer exist.

### UI — `apps/desktop/src/OllamaSettings.tsx`

- `Account used for AI` selects a named row or `No API key — Local server` and persists immediately.
- The selected key is a read-only password field until Change; Show/Hide controls visibility.
- `Add API key` requires a unique account name and non-empty key, then selects the new account.
- Remove deletes the selected row. Connect lists models with the active key; Test and model selection run `ollama_check`.

### Call sites

`OllamaSettings.tsx`, `Transactions.tsx`, `Analytics.tsx`, and `Reports.tsx` call `getOllamaConfig()` and pass `config.api_key` as `apiKey`. No caller reads `ollama_account` directly except the Settings account list.

## Anti-patterns

- **A JSON array or `api_key:<name>` row in `settings`.** This bypasses the table constraints and creates a second account model.
- **A separate `active_ollama_account_id` setting.** It can point at a deleted row; `active` is already the single source of truth.
- **Rendering the key as plain text on load.** The explicit Show action is the disclosure boundary.
- **Keeping `settings.api_key` as a fallback.** Migration 9 is the clean cutover; two stores make the selected label and authenticated key disagree.
- **Reading the first account row when none is active.** That silently defeats the local no-key choice.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A legacy install has no named account | Legacy `settings.api_key` was absent or empty | Add a key; local mode is still valid |
| Selecting an account produces a uniqueness error | The old active row was not cleared first | Route selection through `setActiveOllamaAccount()` |
| AI requests use a different key than Settings shows | A caller bypassed `getOllamaConfig()` or a second store exists | Remove the bypass and the second store |
| The key appears in a screenshot without user action | The field defaulted to text or reveal state survived selection | Default to password and clear reveal state on every account transition |
| Removing the active account sends no Authorization header | Expected no-active state | Select another account or use a local daemon |
