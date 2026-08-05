---
id: ollama-key-in-settings
type: decision
status: superseded
superseded-by: ollama-accounts
updated: 2026-08-05
links: [ollama-accounts, ollama-flow, ollama-key-keychain, persistence-sqlite, settings-schema, stack]
---

# Superseded: the Ollama API key as one `settings` row

The key is a row in the `settings` key/value table of `expenses.db`, under the key `api_key`, next to `base_url` and `model`. It is stored in plaintext. It used to live in the OS credential store — Keychain on macOS, Secret Service on Linux — and that decision, with everything it bought, is kept in [[ollama-key-keychain]]. It was moved on 2026-08-05 for one reason: macOS binds a Keychain item's ACL to the exact binary that created it, and every `pnpm tauri dev` rebuild produces a new binary, so the authorization dialog came back on every rebuild and, until it was answered, on every model call. "Always Allow" only holds until the next rebuild. Development was the whole cost centre and the app was paying it several times an hour.

The trade was made knowingly: the key is now readable by any process running as the user, and that is judged cheaper than a prompt loop. The threat model section below says exactly what is being given up. This node owns *where the key lives and why*; the transport, the endpoints and the "listing models proves nothing" rule are [[ollama-flow]].

It was replaced by [[ollama-accounts]] on 2026-08-05 when the UI gained named keys and an active-account selector. The plaintext-database threat model below still applies; the singleton storage and write-only UI contracts do not.

## Rules for an agent working here

1. **Store the key as the `settings` row `api_key`, written with `setSetting("api_key", key)` and read with `getSettings()`** in `apps/desktop/src/db.ts`, because it is now ordinary configuration and every other piece of Ollama configuration already goes through those two functions. There is no second read path and no Rust-side store.
2. **Treat the empty string as "no key".** `setSetting("api_key", "")` is what the Remove button does and `!!settings.api_key` is the has-a-key test, because a key/value row cannot be absent-but-typed and a separate "is set" flag would be a second source of truth for one boolean.
3. **Never add a migration for this.** `settings` is key/value, so a new key needs no schema change — [[persistence-sqlite]] rule 2 is about columns, not rows. A migration here would bump the version for nothing and every installed copy would record an empty change.
4. **Every Ollama command takes the key as an argument from its caller.** Rust holds no key and has no way to fetch one; a command that reads storage on its own would be the old design with a new spelling. Signatures are in [[ollama-flow]].
5. **Pass `apiKey: settings.api_key ?? ""` at every call site.** The three are `OllamaSettings.tsx`, `Transactions.tsx` (`categorise()`) and `Analytics.tsx` (`explain()`). `?? ""` rather than a throw, because a missing key is not an error (rule 6 of [[ollama-flow]]) — a local daemon has no auth and ollama.com lists models anonymously.
6. **Keep the Settings key field write-only in the UI**, even though the value is now readable and rendering it would be one line. Blank means "keep what is stored"; Remove writes `''`. Putting a live credential on screen buys the user nothing they cannot get from `ollama.com/settings/keys`, and costs a shoulder, a screenshare, or a screenshot in a bug report.
7. **The key still only ever goes to `base_url`.** Moving where it rests changed nothing about where it is sent — rule 5 of [[ollama-flow]] is unchanged and is the reason this decision is a local-disk trade and not a network one.
8. **Anyone reintroducing a credential store must move every caller in the same change.** One key, one place. A design where Rust reads a Keychain entry *and* TypeScript reads `settings.api_key` has two sources of truth that disagree the moment either is written, and the symptom is a model call authenticating with a key the Settings screen does not show as stored. Half a migration is worse than either end of it.

## Contract

### Storage

| Item | Value |
|---|---|
| Table | `settings` (`key TEXT PRIMARY KEY`, `value TEXT NOT NULL`) |
| Key | `api_key` |
| Value | The raw key, plaintext. `''` means no key |
| File | `~/Library/Application Support/com.hebbar.desktop/expenses.db` — Linux: `~/.local/share/com.hebbar.desktop/expenses.db` |
| Write | `setSetting("api_key", key)` — `apps/desktop/src/db.ts` |
| Read | `getSettings()` — same file |
| Has-a-key | `!!settings.api_key` |
| Migration | **None.** Key/value table, no schema change |

### Call sites

| File | Call | Argument |
|---|---|---|
| `apps/desktop/src/OllamaSettings.tsx` | `ollama_models`, `ollama_check` | `apiKey: settings.api_key ?? ""` |
| `apps/desktop/src/Transactions.tsx` | `ollama_json` in `categorise()` | same |
| `apps/desktop/src/Analytics.tsx` | `ollama_json` in `explain()` | same |

Arguments are camelCase across the `invoke` boundary — `invoke("ollama_json", { baseUrl, model, prompt, apiKey })`. Tauri converts the Rust parameter names; it does not convert the object keys you pass.

### What Rust no longer has

Deleted from `apps/desktop/src-tauri/src/lib.rs` and `Cargo.toml` on 2026-08-05: the `keyring` dependency, `KEY_SERVICE`, `KEY_ACCOUNT`, `key_entry()`, the `blocking()` helper, and the commands `set_ollama_key` and `has_ollama_key`. `ollama_request(base_url, method, path, timeout, api_key: &str)` now attaches `bearer_auth` only when `api_key` is non-empty. There is no code path from Rust to any credential store, and adding one back is rule 8.

### The existing key

The user's key was moved out of the Keychain and into the `settings` row by hand as a one-time operation, and the orphaned Keychain item (`com.hebbar.desktop` / `ollama`) deleted. **No migration code was written for this and none exists** — do not document one, do not look for one, and do not write one for a second machine: pasting the key into Settings once is the supported path.

## Threat model

What was accepted:

| | |
|---|---|
| **What an attacker gets** | Any process running as this user can read `expenses.db` and lift a working Ollama API key — a bearer token that bills the user's paid subscription until it is revoked |
| **Who that is** | Anything the user runs: a malicious `pnpm` postinstall, a curious script, a shared or backed-up copy of the file, Time Machine, a support bundle that includes the app data directory |
| **What it costs** | Money, and only money. The key grants inference on the user's account; it is not a login, it reaches no expense data, and it cannot change the account |
| **Mitigation** | Revoke at `ollama.com/settings/keys` and paste a new one. That is a 30-second operation and is the entire incident response |
| **Why it was accepted** | The alternative charged an OS authorization dialog on every rebuild — see [[ollama-key-keychain]]. A risk that requires an attacker already executing code as the user beat a cost paid several times an hour |

What did **not** change:

- The key is still sent to exactly one host, `base_url`, and to no other — rule 5 of [[ollama-flow]].
- The key is still never in the repo, never in a dotfile, and never in an environment variable; `expenses.db` is not tracked by git.
- The database is still outside the app bundle, so an update never reads or rewrites it.
- An attacker who can read `expenses.db` could already read the user's entire expense history. The key raises what a full-file read is worth; it does not create the read.

Explicitly not claimed: this is **not** as safe as the Keychain was. It is cheaper, and the thing it is cheaper than was measured in dialogs per hour.

## Anti-patterns

- **A `get_ollama_key`-shaped command, or any Rust code reading the key from storage.** Rust is a pure function of its arguments here. In review this looks like a `#[tauri::command]` that touches `settings` or a credential store to find a key it was not handed.
- **Rendering the stored key in the Settings input** because it is now readable. Rule 6. In review: `value={settings.api_key}` on the key field.
- **A new migration "to add `api_key`".** Rule 3. In review: an eighth `Migration` whose SQL is an `INSERT INTO settings`.
- **A `has_api_key` settings row, or a `key_set` boolean anywhere.** Rule 2 — `!!settings.api_key` already answers it, and the flag drifts.
- **Calling an Ollama command without `apiKey`.** It compiles, it lists models, and it 401s on the first completion. Rule 5.
- **Reintroducing `keyring` for the key while leaving `settings.api_key` in place.** Rule 8. Two stores, one credential.
- **Writing the key into an `.env`, `localStorage`, or a JSON sidecar** "so the model call is faster". Same exposure as the database row with none of the single-source-of-truth benefit.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Model calls 401 while Settings shows a key is saved | The caller did not pass `apiKey` — the command sends no `Authorization` header | Rule 5; add `apiKey: settings.api_key ?? ""` to that `invoke` |
| Test says `API key rejected` immediately after Remove | Remove wrote `''`, which is the correct "no key" state | Paste a key and press Connect; this is rule 2 working |
| Key survives Remove and keeps authenticating | Something wrote the key somewhere besides the `settings` row | Rule 8 — find the second store and delete it, do not add a second Remove |
| Key is gone after a reinstall or an identifier change | It lives in `expenses.db`, which moves with `identifier` — [[stack]] rule 7 | Restore the identifier; the old database is still on disk under the previous one |
| `settings.api_key` is `undefined` rather than `''` on a fresh install | The row has never been written; `getSettings()` returns only rows that exist | `?? ""` at the call site already handles it — do not seed an empty row |
| A Keychain prompt still appears on a dev build | An old binary is being run, or `keyring` was reintroduced | Confirm `keyring` is absent from `Cargo.toml`; delete any leftover `com.hebbar.desktop` / `ollama` Keychain item |
| The key appears in a screenshot or a log | Something renders or logs it | Rule 6; the field is write-only and the key is never logged |
