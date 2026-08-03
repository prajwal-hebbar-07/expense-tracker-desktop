use tauri_plugin_sql::{Migration, MigrationKind};

/// Append-only. Never edit a migration that has shipped — add the next version instead.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_expense_table",
            sql: "
            CREATE TABLE expense (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              amount      INTEGER NOT NULL CHECK (amount > 0),
              currency    TEXT    NOT NULL DEFAULT 'INR',
              description TEXT    NOT NULL,
              category    TEXT    NOT NULL,
              spent_at    TEXT    NOT NULL,
              created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX idx_expense_spent_at ON expense (spent_at);

            CREATE TABLE settings (
              key   TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
        ",
            kind: MigrationKind::Up,
        },
        // `balance` has no CHECK (> 0) on purpose: unlike an expense, an account
        // can sit at zero or be overdrawn. `last4` is TEXT so a card ending 0421
        // does not become 421.
        Migration {
            version: 2,
            description: "create_account_and_card_tables",
            sql: "
            CREATE TABLE account (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              bank       TEXT    NOT NULL CHECK (length(trim(bank)) > 0),
              balance    INTEGER NOT NULL,
              currency   TEXT    NOT NULL DEFAULT 'INR',
              updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );

            CREATE TABLE card (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              bank       TEXT    NOT NULL CHECK (length(trim(bank)) > 0),
              name       TEXT,
              last4      TEXT    CHECK (last4 IS NULL OR last4 GLOB '[0-9][0-9][0-9][0-9]'),
              created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );
        ",
            kind: MigrationKind::Up,
        },
        // `direction` carries money-in vs money-out because migration 1 froze
        // CHECK (amount > 0) onto `expense.amount`, so the sign cannot.
        //
        // No CHECK that exactly one of account_id/card_id is set: SQLite
        // *does* validate a CHECK added by ADD COLUMN against existing rows,
        // and any expense row predating this migration has both NULL, which
        // would make the migration fail permanently on that install. The
        // form enforces it instead.
        Migration {
            version: 3,
            description: "add_direction_and_source_to_expense",
            sql: "
            ALTER TABLE expense ADD COLUMN direction TEXT NOT NULL DEFAULT 'debit'
              CHECK (direction IN ('debit','credit'));
            ALTER TABLE expense ADD COLUMN account_id INTEGER REFERENCES account(id);
            ALTER TABLE expense ADD COLUMN card_id    INTEGER REFERENCES card(id);
        ",
            kind: MigrationKind::Up,
        },
        // The one mandatory text field is a title, not a description, so the
        // column is renamed to match; `note` is the optional "why". RENAME
        // COLUMN keeps the data, unlike adding a column and abandoning the old
        // one, which would leave a NOT NULL column every INSERT still has to
        // fill. `category` is left as-is — see the note on it in lib.rs callers.
        Migration {
            version: 4,
            description: "split_expense_description_into_title_and_note",
            sql: "
            ALTER TABLE expense RENAME COLUMN description TO title;
            ALTER TABLE expense ADD COLUMN note TEXT;
        ",
            kind: MigrationKind::Up,
        },
        // A self-transfer is ONE row, not a debit row plus a credit row: there
        // is no transaction available (see docs/derived-balances.md), so two
        // inserts could be left half-applied by a crash and no longer net to
        // zero. `account_id` is the source, `to_account_id` the destination,
        // and `direction` stays 'debit' — money does leave the source.
        Migration {
            version: 5,
            description: "add_transfer_destination_to_expense",
            sql: "
            ALTER TABLE expense ADD COLUMN to_account_id INTEGER REFERENCES account(id);
        ",
            kind: MigrationKind::Up,
        },
        // A day-of-month, not a date: a statement is due on the same day every
        // cycle, and storing the next date would need a job to roll it over.
        // Nullable, because a card whose cycle you have not typed in is a card
        // that shows no due line rather than one that shows a wrong one.
        //
        // The CHECK is safe to add here (unlike migration 3's) precisely because
        // it admits NULL: every existing card row satisfies it.
        Migration {
            version: 6,
            description: "add_statement_due_day_to_card",
            sql: "
            ALTER TABLE card ADD COLUMN due_day INTEGER
              CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);
        ",
            kind: MigrationKind::Up,
        },
    ]
}

// ---------------------------------------------------------------------------
// Ollama
//
// The API key bills to a paid Ollama subscription, so it lives in the OS
// credential store (Keychain on macOS, Secret Service on Linux) and never in
// the `settings` table, a dotfile, or the repo. Only `base_url` and `model` are
// settings rows. See docs/ollama-flow.md.
//
// Every call is made here rather than with `fetch` in the WebView so the key
// never enters a context that can execute loaded script — rule 2 of
// docs/stack.md — and so CORS / OLLAMA_ORIGINS never comes up.

/// Must match `identifier` in `tauri.conf.json`. Changing it orphans the key.
const KEY_SERVICE: &str = "com.hebbar.desktop";
const KEY_ACCOUNT: &str = "ollama";

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_ACCOUNT).map_err(|e| e.to_string())
}

/// Credential-store calls block — on Linux they are a round trip to a D-Bus
/// service — so they stay off the async runtime's worker threads.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Stores the key, or forgets it when `key` is empty. Clearing the field is the
/// only way to remove a key, so an empty string must not be written as one.
#[tauri::command]
async fn set_ollama_key(key: String) -> Result<(), String> {
    blocking(move || {
        let entry = key_entry()?;
        if key.is_empty() {
            return match entry.delete_credential() {
                // Deleting a key that was never set is the state the caller asked for.
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(e.to_string()),
            };
        }
        entry.set_password(&key).map_err(|e| e.to_string())
    })
    .await
}

/// Whether a key is stored. Deliberately not a getter: nothing hands the key
/// back to the WebView, so the field on the Settings screen is write-only.
#[tauri::command]
async fn has_ollama_key() -> bool {
    blocking(|| Ok(key_entry()?.get_password().is_ok()))
        .await
        .unwrap_or(false)
}

/// `/api/tags` answers with the same shape on a local daemon and on
/// ollama.com, so one command serves both. Every other field is ignored.
#[derive(serde::Deserialize)]
struct Tags {
    models: Vec<Tag>,
}

#[derive(serde::Deserialize)]
struct Tag {
    name: String,
}

/// Lists the models the configured Ollama can serve, sorted.
///
/// The key comes from the credential store, never from the caller. A missing
/// key is not an error: a local daemon has no auth at all, and ollama.com
/// answers this one endpoint anonymously — so the catalogue loads before the
/// user has pasted anything, and a bad key shows up as a 401 here.
#[tauri::command]
async fn ollama_models(base_url: String) -> Result<Vec<String>, String> {
    let api_key = blocking(|| Ok(key_entry()?.get_password().ok())).await?;

    // reqwest's `rustls-no-provider` leaves the crypto provider to us, and the
    // alternative (`rustls`) pins aws-lc-rs, which is a cmake + C build in CI.
    // ring is already in the tree via rustls itself, so this costs no new crate.
    // Installed here rather than in `run()` so the tests get it too.
    static TLS: std::sync::Once = std::sync::Once::new();
    TLS.call_once(|| {
        // Err only means someone else installed one first, which is fine.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });

    let client = reqwest::Client::builder()
        // Without this a wrong host leaves the button spinning until the OS
        // gives up, which on macOS is well over a minute.
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // trim_end_matches: a pasted URL ending in `/` would otherwise become
    // `https://ollama.com//api/tags`, which 404s.
    let mut req = client.get(format!("{}/api/tags", base_url.trim_end_matches('/')));
    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        req = req.bearer_auth(key);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Ollama replied {}", res.status()));
    }

    let mut names: Vec<String> = res
        .json::<Tags>()
        .await
        .map_err(|e| e.to_string())?
        .models
        .into_iter()
        .map(|m| m.name)
        .collect();
    names.sort();
    Ok(names)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ollama_models,
            set_ollama_key,
            has_ollama_key
        ])
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:expenses.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Touches the real ollama.com and the real Keychain, so these are #[ignore]d —
// CI runs only the node checks (see .github/workflows/release.yml) and neither
// the network nor a login keychain has any business deciding whether a release
// ships. Run them by hand after touching the commands:
//
//   cargo test -- --ignored --nocapture
//
// The keychain test writes to the app's own real entry and restores whatever
// was there, so running it does not cost you your configured key.
#[cfg(test)]
mod tests {
    #[tokio::test]
    #[ignore]
    async fn lists_cloud_models_and_tolerates_a_trailing_slash() {
        let models = super::ollama_models("https://ollama.com/".into())
            .await
            .expect("ollama.com should answer /api/tags anonymously");
        assert!(!models.is_empty(), "expected a non-empty catalogue");
        assert!(models.windows(2).all(|w| w[0] <= w[1]), "expected sorted names");
    }

    #[tokio::test]
    #[ignore]
    async fn a_bad_host_is_an_error_not_a_panic() {
        assert!(super::ollama_models("http://127.0.0.1:1".into()).await.is_err());
    }

    #[tokio::test]
    #[ignore]
    async fn key_round_trips_and_an_empty_string_clears_it() {
        let restore = super::blocking(|| Ok(super::key_entry()?.get_password().ok()))
            .await
            .expect("credential store should be reachable");

        super::set_ollama_key("test-key".into()).await.unwrap();
        assert!(super::has_ollama_key().await);

        super::set_ollama_key(String::new()).await.unwrap();
        assert!(!super::has_ollama_key().await, "empty string must delete, not store \"\"");

        // Clearing twice must not error — the second delete finds no entry.
        super::set_ollama_key(String::new()).await.unwrap();

        if let Some(key) = restore {
            super::set_ollama_key(key).await.unwrap();
        }
    }
}
