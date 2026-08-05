---
id: ollama-flow
type: decision
status: active
updated: 2026-08-05
links: [stack, persistence-sqlite, settings-schema, linux-release, expense-categories, analytics-insights, ollama-key-in-settings, ollama-key-keychain]
---

# Reaching Ollama

The app talks to **Ollama Cloud (`https://ollama.com`) by default**, with a Bearer key from the user's paid subscription, and to a local daemon (`http://localhost:11434`, no key) by typing that URL into the same field. There is no cloud/local mode switch: the two differ only by a `base_url` value and whether a key is present. Going direct to the cloud drops the requirement that Ollama.app be installed and running; the cost is one real secret to manage, and where that secret is kept — a plaintext `settings` row since 2026-08-05 — is [[ollama-key-in-settings]], with the credential store it replaced in [[ollama-key-keychain]].

The Settings screen (`apps/desktop/src/OllamaSettings.tsx`) is the only UI: a server field, a write-only key field, **Connect**, a model dropdown, and **Test**. Connect saves and lists models; choosing a model then fires a real one-word completion and quotes the reply back, which is the only thing that can prove a key. Configured 2026-08-03. This node covers configuration and the transport; key storage is [[ollama-key-in-settings]] and the features that spend the model are [[expense-categories]] and [[analytics-insights]].

## Rules for an agent working here

1. **The API key is the `settings` row `api_key`, and every command is handed it by its caller** — `apiKey: settings.api_key ?? ""`. Rust stores nothing and can fetch nothing, so a command that goes looking for a key on its own is the deleted design coming back. Three settings rows now: `base_url`, `model`, `api_key`; see [[persistence-sqlite]], and [[ollama-key-in-settings]] for the threat model that was accepted when the key left the Keychain.
2. **The key field stays write-only in the UI.** Blank means "keep what is stored", and the Remove button — which writes `''` — is the only way to clear it. The value is readable now, but rendering a live credential buys the user nothing and costs a shoulder, a screenshare, or a screenshot in a bug report.
3. **Make the HTTP call from Rust with `reqwest`, never `fetch` in the WebView and never `tauri-plugin-http`** — rule 2 of [[stack]]. That plugin exists specifically to give the *webview* a `fetch`, which is the thing being avoided. Going through Rust also means CORS and `OLLAMA_ORIGINS` never come up.
4. **Trim the trailing slash off `base_url` before joining a path.** A pasted `https://ollama.com/` otherwise becomes `https://ollama.com//api/tags`, which 404s with a message that blames the endpoint.
5. **Send the key only to `base_url`.** It is an Ollama credential; there is no second host it belongs on.
6. **A missing key is not an error.** A local daemon has no auth at all, and ollama.com answers `/api/tags` anonymously, so the model list loads before anything is pasted. An empty `api_key` reaches Rust as `""` and simply means no `Authorization` header.
7. **Never treat a successful `/api/tags` as evidence the key works**, because ollama.com serves it **anonymously**: a wrong key, a revoked key, and no key at all all return the full catalogue. Only `ollama_check` — a real completion — can fail on authentication. Any UI that says "connected" after listing models is lying.
8. **Test with `/api/chat`, and never with a cheaper auth-only endpoint — there is no such endpoint.** `/api/ps` 401s **even with a working key** (re-probed 2026-08-05, against a key that answered 200 on `/api/chat` the same minute), so it proves nothing at all, and it would not prove that the *chosen model* is one the subscription covers either — which is the failure the user actually hits. A completion costs a few tokens and answers both.
9. **Send `stream: false` on every `/api/chat` call.** The streaming default answers with a sequence of NDJSON objects, and deserialising that as one object fails with a parse error that reads like a schema mismatch.
10. **Do not persist "verified".** A key can be revoked between launches, so a remembered tick asserts something the app has not checked.

## Contract

### Commands — `apps/desktop/src-tauri/src/lib.rs`

| Command | Signature | Notes |
|---|---|---|
| `ollama_models` | `(base_url: String, api_key: String) -> Result<Vec<String>, String>` | `GET {base_url}/api/tags`, 15s timeout, names sorted. **Says nothing about the key** — rule 7 |
| `ollama_check` | `(base_url: String, model: String, api_key: String) -> Result<String, String>` | One fixed prompt, plain text. Returns the model's reply. The only call that proves a key |
| `ollama_json` | `(base_url: String, model: String, prompt: String, api_key: String) -> Result<String, String>` | Caller's prompt with `format: "json"`. Valid JSON, **not** a schema — validate the reply. Used by [[expense-categories]] |

There is no `set_ollama_key` and no `has_ollama_key`: both were deleted with the credential store on 2026-08-05 — [[ollama-key-keychain]]. Nothing in Rust reads or writes the key.

`ollama_check` and `ollama_json` are wrappers over one private `chat(base_url, model, prompt, json, api_key)`, which is where `stream: false`, the 120s timeout and the empty-model guard live. Add a third caller there, not with a second `/api/chat` body.

`ollama_request(base_url, method, path, timeout, api_key: &str)` builds every outbound call — it installs the TLS provider, joins the path, and attaches `bearer_auth` when `api_key` is non-empty. Add endpoints through it, not with a fresh `reqwest::Client`, or the new path silently loses the key and the crypto provider. `check_status()` turns a non-2xx into the sentence the UI shows; its sentences are unchanged by the storage move.

Called from TypeScript with camelCase arguments — `invoke("ollama_json", { baseUrl, model, prompt, apiKey })`, not `{ base_url }`. Tauri converts the parameter names, not the object keys you pass.

### Where the key is kept

| Item | Value |
|---|---|
| Storage | `settings` row `api_key` in `expenses.db`, plaintext |
| Write | `setSetting("api_key", key)`; `setSetting("api_key", "")` is Remove |
| Read | `getSettings()`; `!!settings.api_key` is the has-a-key test |
| Callers | `OllamaSettings.tsx`, `Transactions.tsx` (`categorise()`), `Analytics.tsx` (`explain()`), each passing `apiKey: settings.api_key ?? ""` |
| Migration | none — `settings` is key/value, so a new key is not a schema change |

The reasoning, the threat model, and the rule about never running two credential stores at once are in [[ollama-key-in-settings]]. What this replaced — `keyring` 4.1.6, service `com.hebbar.desktop`, account `ollama` — is in [[ollama-key-keychain]].

### Settings rows

| Key | Value | Default |
|---|---|---|
| `base_url` | `https://ollama.com`, or `http://localhost:11434` | `https://ollama.com` |
| `model` | A name from `/api/tags`, e.g. `gpt-oss:120b` | unset |
| `api_key` | The raw Ollama key, plaintext. `''` means no key — see [[ollama-key-in-settings]] | unset |

Read and written by `getSettings()` / `setSetting()` in `apps/desktop/src/db.ts`. They live in `db.ts` rather than a `settings.ts` because that filename collides with `Settings.tsx` on a case-insensitive filesystem and `tsc` rejects the program outright.

### Endpoint responses

`/api/tags` — identical on cloud and local; every other field is ignored.

```json
{ "models": [ { "name": "gpt-oss:120b" } ] }
```

`/api/chat` with `stream: false` — only `message.content` is read.

```json
{ "message": { "role": "assistant", "content": "ok" } }
```

Errors carry `{"error":"Unauthorized"}`, which `check_status()` replaces with an instruction: 401/403 point at `ollama.com/settings/keys`, 404 says the server may not offer that model, 429 says rate limited.

### Auth, verified by probing ollama.com on 2026-08-03, `/api/ps` re-probed 2026-08-05

| Endpoint | No key / bad key | Working key |
|---|---|---|
| `GET /api/tags` | **200** with the full catalogue — see rule 7 | 200 |
| `GET /v1/models` | **200** | 200 |
| `POST /api/chat` | **401** `{"error":"Unauthorized"}` | **200** — the only call that separates the two columns |
| `GET /api/ps` | **401** | **401** — not an auth probe; rule 8 |

### TLS

`reqwest` uses `rustls-no-provider`, and `ollama_request()` installs `rustls::crypto::ring` behind a `std::sync::Once`. The plain `rustls` feature pins the aws-lc-rs provider, which drags `aws-lc-sys` and a cmake C build into every CI run; `ring` is already in the tree via `rustls` itself and costs no new crate. The `Once` sits in the request builder rather than in `run()` so the tests get a provider too.

## Anti-patterns

- **A command, helper, or `#[tauri::command]` that reads the key in Rust.** There is no way to — Rust has no database handle for `settings` and no credential store — so this shows up as a reintroduced `keyring` dependency or a new SQL read. Rule 1.
- **`invoke("ollama_json", { baseUrl, model, prompt })` with no `apiKey`.** It compiles and it lists models fine; it 401s on the first completion. Rule 1.
- **Rendering the stored key in the Settings input** because it is readable now: `value={settings.api_key}`. Rule 2.
- **`fetch("https://ollama.com/api/tags")` in a `.tsx` file.** Rule 3, and it hands the key to a `fetch` the page can also make to any other host.
- **A cloud/local toggle, or separate `cloud_url` and `local_url` rows.** One `base_url` already expresses both.
- **Persisting the model list.** It is a remote catalogue; caching it means showing models the account no longer has.
- **Telling the user "Connected" after `ollama_models` succeeds.** Rule 7 — it succeeds with no key at all.
- **Building a `reqwest::Client` outside `ollama_request()`.** The new path loses the key and the TLS provider; the latter panics at runtime, the former just 401s.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `API key rejected` on Test, while the model list loaded fine | Exactly the case rule 7 describes — listing never needed the key | Paste a fresh key from `ollama.com/settings/keys` and press Connect |
| `Not found — this server may not offer that model` | The key is valid but the model is outside the subscription, or `base_url` ends in `/api` | Pick another model; the server field wants an origin, not an endpoint |
| `Rate limited by Ollama` | 429 | Wait and press Test again |
| Test errors with a JSON parse failure | `stream: false` was dropped from the request body | Rule 9 |
| Connect hangs ~15s then errors | Wrong host, or a local daemon that is not running | `curl $base_url/api/tags`; for local, start Ollama.app |
| `No rustls crypto provider is configured` (panic) | The `Once` was removed, or a new call path builds a `reqwest::Client` without it | Install the provider on that path too |
| The model calls 401 while Settings shows a key is saved | A caller forgot to pass `apiKey`, so the request carries no `Authorization` header | Rule 1; add `apiKey: settings.api_key ?? ""` to that `invoke` |
| The key is gone after a rebuild or reinstall | `identifier` in `tauri.conf.json` changed, moving `expenses.db` | Restore the identifier — [[stack]] rule 7; the old database is still on disk |
| The saved model is missing from the dropdown | The account or daemon no longer serves it | Connect clears it and says so — pick another |

## Checks

`cargo test` in `apps/desktop/src-tauri/` runs one test that needs nothing: `an_empty_key_sends_no_authorization_header` builds a request without sending it and asserts an empty key produces no `Authorization` header while a non-empty one produces `Bearer k`. That is the emptiness rule of rule 1, pinned where it lives — in `ollama_request`, not in each caller.

`cargo test -- --ignored` runs the four that touch the network: the cloud listing (with a trailing slash), the unreachable-host error path, the empty-model guard, and the one that pins rule 7 — with `String::new()` as the key, `ollama_models` must still succeed while `ollama_check` must fail with a message naming `ollama.com/settings/keys`. Every test passes `String::new()`; none needs a valid key, which is what makes them runnable by anyone.

The credential-store round trip (`key_round_trips_and_an_empty_string_clears_it`) is gone with the store it tested — [[ollama-key-keychain]].

`--test-threads=1` is **no longer required**, and the flag has been dropped from this node. It existed because several tests wrote the app's own real credential entry and clobbered each other in parallel; no test writes shared state now that the key is an argument. Verified 2026-08-05: all four ignored tests pass in parallel.

They are `#[ignore]`d because they touch the real network, and CI runs only the node checks — see rule 5 of [[linux-release]].
