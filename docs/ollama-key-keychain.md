---
id: ollama-key-keychain
type: decision
status: superseded
superseded-by: ollama-key-in-settings
updated: 2026-08-05
links: [ollama-key-in-settings, ollama-flow, persistence-sqlite, linux-release, stack]
---

# Superseded: the API key in the OS credential store

From 2026-08-03 to 2026-08-05 the Ollama API key was stored in the operating system's credential store — Keychain Services on macOS, Secret Service over D-Bus on Linux — through the `keyring` crate, under service `com.hebbar.desktop` and account `ollama`. Rust owned it end to end: the WebView could ask *whether* a key existed and could write one, and that was the entire API. Nothing could read it back.

It was replaced by [[ollama-key-in-settings]] on 2026-08-05, not because the reasoning was wrong but because of a macOS platform behaviour that only bites during development: **a Keychain item's ACL is bound to the exact binary that created it.** Every `pnpm tauri dev` rebuild produces a new binary, which the ACL does not recognise, so macOS raised an authorization dialog again — on every model call, several times an hour. "Always Allow" is honoured only until the next rebuild. There was no way to keep the security property and stop the prompting, so the property was sold. This node exists so that trade is not silently re-made in the other direction.

## What it bought

- The key was never in a file the user could accidentally copy, sync, or attach to a bug report. Reading it required the OS to authorize the reader.
- The key never entered the WebView, so no amount of loaded script — an injected dependency, a compromised npm package rendering into the page — could exfiltrate it. This was the strongest single property of the design and it is genuinely gone.
- `expenses.db` was safe to hand to anyone for debugging.
- On Linux it cost no new apt package: `keyring` 4 speaks Secret Service over zbus in pure Rust, which is why [[linux-release]]'s dependency list never mentioned `libsecret`.

## The rules it carried

These were rules 1, 2, 5 and 6 of [[ollama-flow]] until 2026-08-05. They are recorded here in full because their reasons outlive them — anyone proposing a credential store again is proposing exactly this, and should start from what it actually said.

1. **The API key lives in the OS credential store, never in the `settings` table, a dotfile, or the repo**, because it bills to a paid subscription — a plaintext row in `expenses.db` is a token any process reading that file can spend. Only `base_url` and `model` were settings rows.
   *Status:* deliberately reversed. The threat is real and is now accepted; see the threat model in [[ollama-key-in-settings]].
2. **No command returns the key to the WebView.** `has_ollama_key` answered a boolean and that was the whole read API, because the point of rule 1 is defeated the moment the key sits in a context that can execute loaded script.
   *Status:* the command is gone and the key is now read by TypeScript. The *UI half* survived: the key field is still write-only, blank still means "keep what is stored", Remove is still the only way to clear it — rule 6 of [[ollama-key-in-settings]]. It survived on its own merit, not on this rule's.
3. **Keep every credential-store call inside `blocking()`.** They are synchronous, and on Linux a Secret Service call is a D-Bus round trip; running one on an async worker stalls unrelated work.
   *Status:* moot — `blocking()` was deleted with its only callers. The reason is still live for any *future* synchronous store: `tauri::async_runtime::spawn_blocking` is the correct wrapper, and a D-Bus round trip on an async worker thread is the specific failure it prevents.
4. **Keep `KEY_SERVICE` equal to `identifier` in `tauri.conf.json`** (`com.hebbar.desktop`). Changing it orphaned the stored key exactly as changing the identifier orphans the database — [[stack]] rule 7.
   *Status:* moot; `KEY_SERVICE` no longer exists. The identifier still orphans the database, which is why the key now travels with it instead.

## The implementation, as it stood

In `apps/desktop/src-tauri/src/lib.rs` at commit `2746647` (`git show 2746647:apps/desktop/src-tauri/src/lib.rs`), all of it deleted on 2026-08-05:

| Symbol | What it was |
|---|---|
| `KEY_SERVICE` | `const &str = "com.hebbar.desktop"` — had to match `identifier` |
| `KEY_ACCOUNT` | `const &str = "ollama"` |
| `key_entry()` | `keyring::Entry::new(KEY_SERVICE, KEY_ACCOUNT)`, error stringified |
| `blocking<T, F>()` | `tauri::async_runtime::spawn_blocking`, keeping synchronous store calls off async workers |
| `set_ollama_key(key: String)` | Empty string called `delete_credential()`; `Err(keyring::Error::NoEntry)` was mapped to `Ok(())`, because deleting a key that was never set is the state the caller asked for |
| `has_ollama_key() -> bool` | `key_entry()?.get_password().is_ok()`, `unwrap_or(false)` — false on any error, including an unreachable store |
| `ollama_request(...)` | Read the key itself: `blocking(\|\| Ok(key_entry()?.get_password().ok()))`, then `bearer_auth` when non-empty. Callers passed no key |

### Credential store

| Item | Value |
|---|---|
| Crate | `keyring` `4.1.6` |
| Service | `com.hebbar.desktop` |
| Account | `ollama` |
| macOS | Keychain Services (feature `apple-native-keyring-store`) |
| Linux | Secret Service over zbus — pure Rust, **no new apt package** for [[linux-release]] |

⚠ Still true if `keyring` is ever added back: `keyring` 4 renamed every feature from the 3.x names an agent is likely to recall. It is `apple-native-keyring-store`, not `apple-native`, and there is no `crypto-rust`. `cargo add` prints the valid list on a miss.

### Anti-patterns it defined

Historical; do not apply them to current code.

- **`INSERT INTO settings (key, value) VALUES ('api_key', …)`** was *the* line to reject in review. It is now the correct thing to write — [[ollama-key-in-settings]] rule 1.
- **A `get_ollama_key` command**, or returning the key from `set_ollama_key` "to confirm it saved". Moot: there is no command to add a getter to.
- **Writing `""` into the credential store** when the user cleared the field, which made `has_ollama_key` true forever with a key that authenticates nothing. Inverted: writing `''` into `settings.api_key` is now exactly how Remove works, because a row can hold the empty string meaningfully where a credential entry could not.

### Failure modes it had

| Symptom | Cause | Why it is gone |
|---|---|---|
| Key vanishes after a rebuild | `identifier` in `tauri.conf.json` changed, orphaning the entry | The key moved into `expenses.db`, which the identifier also moves — one thing to restore instead of two |
| `has_ollama_key` is false right after saving on Linux | No Secret Service running: headless session, no gnome-keyring or KWallet. The store had no fallback by design | No credential store, no daemon to run |
| macOS asks for Keychain authorization on every model call | The ACL is bound to the binary that created the item, and every dev rebuild is a new binary | **This is what killed the design** |

## Why it lost, precisely

Nothing in the security reasoning was refuted. What changed is that the cost turned out to be paid in the wrong place: the protection is against a process reading a file, which requires an attacker already running code as the user, while the price was an interactive OS dialog charged to the developer at the rate of one per rebuild — and, before it was answered, one per model call. Rebuilds happen many times an hour; the attack has never happened.

The key is revocable at `ollama.com/settings/keys` and grants nothing but inference on a paid subscription. Trading an unbounded, certain, recurring cost for a bounded, unlikely, recoverable one is the whole argument.

## If you bring it back

The prompt loop is the thing to solve first — a stable code signature across dev builds, or a store whose ACL is not per-binary. Without that, this node repeats.

Then honour rule 8 of [[ollama-key-in-settings]]: move every caller in the same change. The three call sites (`OllamaSettings.tsx`, `Transactions.tsx`, `Analytics.tsx`) and the `settings.api_key` row must all go in one commit, or the app has two sources of truth for one credential and no way to tell which one authenticated a request.
