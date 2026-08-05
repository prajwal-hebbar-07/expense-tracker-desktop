---
id: ollama-flow
type: decision
status: active
updated: 2026-08-05
links: [stack, persistence-sqlite, settings-schema, linux-release, expense-categories, analytics-insights]
---

# Reaching Ollama

The app talks to **Ollama Cloud (`https://ollama.com`) by default**, with a Bearer key from the user's paid subscription, and to a local daemon (`http://localhost:11434`, no key) by typing that URL into the same field. There is no cloud/local mode switch: the two differ only by a `base_url` value and whether a key is present. Going direct to the cloud drops the requirement that Ollama.app be installed and running; the cost is one real secret to manage, which is what most of this node is about.

The Settings screen (`apps/desktop/src/OllamaSettings.tsx`) is the only UI: a server field, a write-only key field, **Connect**, a model dropdown, and **Test**. Connect saves and lists models; choosing a model then fires a real one-word completion and quotes the reply back, which is the only thing that can prove a key. Configured 2026-08-03. This node covers configuration and the transport; the features that spend the model are [[expense-categories]] and [[analytics-insights]].

## Rules for an agent working here

1. **The API key lives in the OS credential store, never in the `settings` table, a dotfile, or the repo**, because it bills to a paid subscription — a plaintext row in `expenses.db` is a token any process reading that file can spend. Only `base_url` and `model` are settings rows; see [[persistence-sqlite]].
2. **No command returns the key to the WebView.** `has_ollama_key` answers a boolean and that is the whole read API, because the point of rule 1 is defeated the moment the key sits in a context that can execute loaded script. The key field is write-only: blank means "keep what is stored", and the Remove button is the only way to clear it.
3. **Make the HTTP call from Rust with `reqwest`, never `fetch` in the WebView and never `tauri-plugin-http`** — rule 2 of [[stack]]. That plugin exists specifically to give the *webview* a `fetch`, which is the thing being avoided. Going through Rust also means CORS and `OLLAMA_ORIGINS` never come up.
4. **Trim the trailing slash off `base_url` before joining a path.** A pasted `https://ollama.com/` otherwise becomes `https://ollama.com//api/tags`, which 404s with a message that blames the endpoint.
5. **Keep every credential-store call inside `blocking()`.** They are synchronous, and on Linux a Secret Service call is a D-Bus round trip; running one on an async worker stalls unrelated work.
6. **Keep `KEY_SERVICE` equal to `identifier` in `tauri.conf.json`** (`com.hebbar.desktop`). Changing it orphans the stored key exactly as changing the identifier orphans the database — [[stack]] rule 7.
7. **Send the key only to `base_url`.** It is an Ollama credential; there is no second host it belongs on.
8. **A missing key is not an error.** A local daemon has no auth at all, and ollama.com answers `/api/tags` anonymously, so the model list loads before anything is pasted.
9. **Never treat a successful `/api/tags` as evidence the key works**, because ollama.com serves it **anonymously**: a wrong key, a revoked key, and no key at all all return the full catalogue. Only `ollama_check` — a real completion — can fail on authentication. Any UI that says "connected" after listing models is lying.
10. **Test with `/api/chat`, and never with a cheaper auth-only endpoint — there is no such endpoint.** `/api/ps` 401s **even with a working key** (re-probed 2026-08-05, against a key that answered 200 on `/api/chat` the same minute), so it proves nothing at all, and it would not prove that the *chosen model* is one the subscription covers either — which is the failure the user actually hits. A completion costs a few tokens and answers both.
11. **Send `stream: false` on every `/api/chat` call.** The streaming default answers with a sequence of NDJSON objects, and deserialising that as one object fails with a parse error that reads like a schema mismatch.
12. **Do not persist "verified".** A key can be revoked between launches, so a remembered tick asserts something the app has not checked.

## Contract

### Commands — `apps/desktop/src-tauri/src/lib.rs`

| Command | Signature | Notes |
|---|---|---|
| `ollama_models` | `(base_url: String) -> Result<Vec<String>, String>` | `GET {base_url}/api/tags`, 15s timeout, names sorted. **Says nothing about the key** — rule 9 |
| `ollama_check` | `(base_url: String, model: String) -> Result<String, String>` | One fixed prompt, plain text. Returns the model's reply. The only call that proves a key |
| `ollama_json` | `(base_url: String, model: String, prompt: String) -> Result<String, String>` | Caller's prompt with `format: "json"`. Valid JSON, **not** a schema — validate the reply. Used by [[expense-categories]] |
| `set_ollama_key` | `(key: String) -> Result<(), String>` | Empty string **deletes**; deleting a key that was never set is `Ok` |
| `has_ollama_key` | `() -> bool` | False on any error, including an unreachable credential store |

Both commands are wrappers over one private `chat(base_url, model, prompt, json)`, which is where `stream: false`, the 120s timeout and the empty-model guard live. Add a third caller there, not with a second `/api/chat` body.

`ollama_request()` builds every outbound call — it installs the TLS provider, reads the key, and joins the path. Add endpoints through it, not with a fresh `reqwest::Client`, or the new path silently loses the key and the crypto provider. `check_status()` turns a non-2xx into the sentence the UI shows.

Called from TypeScript with camelCase arguments — `invoke("ollama_models", { baseUrl })`, not `{ base_url }`. Tauri converts the parameter names, not the object keys you pass.

### Credential store

| Item | Value |
|---|---|
| Crate | `keyring` `4.1.6` |
| Service | `com.hebbar.desktop` |
| Account | `ollama` |
| macOS | Keychain Services (feature `apple-native-keyring-store`) |
| Linux | Secret Service over zbus — pure Rust, **no new apt package** for [[linux-release]] |

⚠ `keyring` 4 renamed every feature from the 3.x names an agent is likely to recall: it is `apple-native-keyring-store`, not `apple-native`, and there is no `crypto-rust`. `cargo add` prints the valid list on a miss.

### Settings rows

| Key | Value | Default |
|---|---|---|
| `base_url` | `https://ollama.com`, or `http://localhost:11434` | `https://ollama.com` |
| `model` | A name from `/api/tags`, e.g. `gpt-oss:120b` | unset |

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
| `GET /api/tags` | **200** with the full catalogue — see rule 9 | 200 |
| `GET /v1/models` | **200** | 200 |
| `POST /api/chat` | **401** `{"error":"Unauthorized"}` | **200** — the only call that separates the two columns |
| `GET /api/ps` | **401** | **401** — not an auth probe; rule 10 |

### TLS

`reqwest` uses `rustls-no-provider`, and `ollama_request()` installs `rustls::crypto::ring` behind a `std::sync::Once`. The plain `rustls` feature pins the aws-lc-rs provider, which drags `aws-lc-sys` and a cmake C build into every CI run; `ring` is already in the tree via `rustls` itself and costs no new crate. The `Once` sits in the request builder rather than in `run()` so the tests get a provider too.

## Anti-patterns

- **`INSERT INTO settings (key, value) VALUES ('api_key', …)`.** Rule 1. This is the specific line to reject in review.
- **A `get_ollama_key` command**, or returning the key from `set_ollama_key` "to confirm it saved". Rule 2.
- **`fetch("https://ollama.com/api/tags")` in a `.tsx` file.** Rule 3, and it hands the key to the WebView on the first authenticated call.
- **Writing `""` into the credential store** when the user clears the field. It makes `has_ollama_key` true forever with a key that authenticates nothing.
- **A cloud/local toggle, or separate `cloud_url` and `local_url` rows.** One `base_url` already expresses both.
- **Persisting the model list.** It is a remote catalogue; caching it means showing models the account no longer has.
- **Telling the user "Connected" after `ollama_models` succeeds.** Rule 9 — it succeeds with no key at all.
- **Building a `reqwest::Client` outside `ollama_request()`.** The new path loses the key and the TLS provider; the latter panics at runtime, the former just 401s.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `API key rejected` on Test, while the model list loaded fine | Exactly the case rule 9 describes — listing never needed the key | Paste a fresh key from `ollama.com/settings/keys` and press Connect |
| `Not found — this server may not offer that model` | The key is valid but the model is outside the subscription, or `base_url` ends in `/api` | Pick another model; the server field wants an origin, not an endpoint |
| `Rate limited by Ollama` | 429 | Wait and press Test again |
| Test errors with a JSON parse failure | `stream: false` was dropped from the request body | Rule 11 |
| Connect hangs ~15s then errors | Wrong host, or a local daemon that is not running | `curl $base_url/api/tags`; for local, start Ollama.app |
| `No rustls crypto provider is configured` (panic) | The `Once` was removed, or a new call path builds a `reqwest::Client` without it | Install the provider on that path too |
| Key vanishes after a rebuild | `identifier` in `tauri.conf.json` changed | Rule 6; restore the identifier |
| `has_ollama_key` is false right after saving on Linux | No Secret Service running (headless session, no gnome-keyring/KWallet) | Start a keyring daemon; the store has no fallback by design |
| The saved model is missing from the dropdown | The account or daemon no longer serves it | Connect clears it and says so — pick another |

## Checks

`cargo test -- --ignored --test-threads=1` in `apps/desktop/src-tauri/`. Five tests: the cloud listing (with a trailing slash), the unreachable-host error path, a credential-store round trip asserting an empty string deletes, the empty-model guard, and the one that pins rule 9 — with no key stored, `ollama_models` must still succeed while `ollama_check` must fail with a message naming `ollama.com/settings/keys`.

`--test-threads=1` is required: several write the app's own real credential entry and in parallel they clobber each other. Each restores whatever key it found, so running them does not cost you your configuration.

They are `#[ignore]`d because they touch the real network and the real keychain, and CI runs only the node checks — see rule 5 of [[linux-release]]. None of them needs a valid key: every assertion is about the unauthenticated path, which is what makes them runnable by anyone.
