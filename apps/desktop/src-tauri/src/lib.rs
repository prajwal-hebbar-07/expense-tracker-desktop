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
        // One AI analysis per Analytics window. The primary key is the window
        // itself, so pressing the button again replaces the row instead of
        // growing a history nobody reads.
        //
        // `insights` is a JSON array of {title, detail}. It is a document, not
        // a relation: nothing queries it by field, and a child table would buy
        // ordering and a join for prose that is only ever read back whole.
        //
        // `fingerprint` is what the window's figures looked like when the model
        // wrote about them. A stored analysis whose fingerprint no longer
        // matches is shown as stale rather than as current — see
        // docs/analysis-persistence.md.
        Migration {
            version: 7,
            description: "create_analysis_table",
            sql: "
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
        ",
            kind: MigrationKind::Up,
        },
        // One written report per Report window, same shape and same discipline
        // as `analysis` above: the window is the primary key, so pressing
        // Generate again replaces the row rather than growing a history.
        //
        // `headline` is one sentence; `findings`, `habits` and `reframes` are
        // JSON arrays, each read back whole and rendered whole. The page still
        // computes its own figures — spent, essentials, target — from the
        // ledger, so nothing a model wrote can move a number on screen.
        // See docs/report-ai.md.
        Migration {
            version: 8,
            description: "create_report_table",
            sql: "
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
        ",
            kind: MigrationKind::Up,
        },
        // Ollama credentials are an entity list now that one installation can
        // hold more than one account. Exactly one row may be active; no active
        // row is the valid local-daemon configuration.
        //
        // Move the former singleton setting in the same migration so an
        // existing installation keeps working without asking for the key again.
        Migration {
            version: 9,
            description: "create_ollama_account_table",
            sql: "
            CREATE TABLE ollama_account (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              name       TEXT    NOT NULL COLLATE NOCASE UNIQUE
                                 CHECK (length(trim(name)) > 0),
              api_key    TEXT    NOT NULL CHECK (length(trim(api_key)) > 0),
              active     INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
              created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );

            CREATE UNIQUE INDEX idx_ollama_account_active
              ON ollama_account (active) WHERE active = 1;

            INSERT INTO ollama_account (name, api_key, active)
              SELECT 'Default', value, 1
              FROM settings
              WHERE key = 'api_key' AND length(trim(value)) > 0;
            DELETE FROM settings WHERE key = 'api_key';
        ",
            kind: MigrationKind::Up,
        },
    ]
}

// ---------------------------------------------------------------------------
// Ollama
//
// API keys live in `ollama_account`; the active row is passed in by the caller
// on every command. This side stores nothing. They used to live in the OS
// credential store; macOS binds a keychain item's ACL to the exact binary that
// created it, so every rebuild brought the authorization dialog back. See
// docs/ollama-key-in-settings.md, and docs/ollama-key-keychain.md for what was
// given up.
//
// The HTTP call still happens here rather than with `fetch` in the WebView:
// one code path, one place that sets `stream: false`, one place that turns a
// status into a sentence — and CORS / OLLAMA_ORIGINS never come up.

/// Builds a request to `{base_url}{path}`, carrying `api_key` when there is
/// one. An empty key is not an error: a local daemon has no auth at all, and
/// ollama.com answers `/api/tags` anonymously.
///
/// `timeout` differs per endpoint: listing models should give up quickly so a
/// typo'd host is obvious, while a completion on a large cloud model genuinely
/// takes tens of seconds and must not be cut off mid-answer.
fn ollama_request(
    base_url: &str,
    method: reqwest::Method,
    path: &str,
    timeout: std::time::Duration,
    api_key: &str,
) -> Result<reqwest::RequestBuilder, String> {
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
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())?;

    // trim_end_matches: a pasted URL ending in `/` would otherwise become
    // `https://ollama.com//api/tags`, which 404s.
    let mut req = client.request(method, format!("{}{path}", base_url.trim_end_matches('/')));
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }
    Ok(req)
}

/// Turns a non-2xx into a sentence the Settings screen can show as-is.
///
/// Ollama answers `{"error":"Unauthorized"}`, which on its own tells the user
/// nothing about what to do, so the common statuses get a real instruction and
/// the raw detail is kept only as a suffix for the ones that do not.
async fn check_status(res: reqwest::Response) -> Result<reqwest::Response, String> {
    if res.status().is_success() {
        return Ok(res);
    }
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["error"].as_str().map(str::to_owned))
        .unwrap_or(body);

    Err(match status.as_u16() {
        401 | 403 => "API key rejected. Check it at ollama.com/settings/keys.".into(),
        404 => format!("Not found — this server may not offer that model. ({detail})"),
        429 => "Rate limited by Ollama. Wait a moment and try again.".into(),
        _ => format!("Ollama replied {status}: {detail}"),
    })
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
/// ⚠ This proves nothing about the API key. A local daemon has no auth at all,
/// and ollama.com answers `/api/tags` **anonymously** — a wrong key returns the
/// full catalogue exactly like a right one. `ollama_check` is what tests a key.
#[tauri::command]
async fn ollama_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let res = ollama_request(
        &base_url,
        reqwest::Method::GET,
        "/api/tags",
        std::time::Duration::from_secs(15),
        &api_key,
    )?
    .send()
    .await
    .map_err(|e| e.to_string())?;

    let mut names: Vec<String> = check_status(res)
        .await?
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

#[derive(serde::Deserialize)]
struct Chat {
    message: ChatMessage,
}

#[derive(serde::Deserialize)]
struct ChatMessage {
    content: String,
}

/// One completion, returned as text. Every model call in the app goes through
/// here, so there is one place that sets `stream: false` and one place that
/// turns a status into a sentence.
///
/// `stream: false` is required — the streaming default answers with a sequence
/// of NDJSON objects that `json::<Chat>()` cannot parse.
///
/// `json` asks Ollama to constrain the output to valid JSON. It makes a
/// caller that parses the reply far more likely to succeed, but it is not a
/// schema: the caller still has to validate what came back.
async fn chat(
    base_url: &str,
    model: &str,
    prompt: &str,
    json: bool,
    api_key: &str,
) -> Result<String, String> {
    if model.trim().is_empty() {
        return Err("Pick a model first.".into());
    }

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": false,
    });
    if json {
        body["format"] = serde_json::Value::String("json".into());
    }

    let res = ollama_request(
        base_url,
        reqwest::Method::POST,
        "/api/chat",
        std::time::Duration::from_secs(120),
        api_key,
    )?
    .json(&body)
    .send()
    .await
    .map_err(|e| e.to_string())?;

    let reply = check_status(res)
        .await?
        .json::<Chat>()
        .await
        .map_err(|e| e.to_string())?
        .message
        .content;

    Ok(reply.trim().to_string())
}

/// Proves the whole path end to end and returns what the model actually said.
///
/// `/api/chat` is used rather than a cheaper auth-only endpoint (`/api/ps` also
/// 401s) because the question the user is asking is "can I use this model",
/// and only a real completion answers it: the key can be valid while the model
/// is one the subscription does not cover. It costs a few tokens.
#[tauri::command]
async fn ollama_check(base_url: String, model: String, api_key: String) -> Result<String, String> {
    // A model that answers at all is a working model, whatever it chose to say.
    chat(&base_url, &model, "Reply with the single word: ok", false, &api_key).await
}

/// A prompt whose answer is meant to be parsed. Same key, same host, same
/// error sentences as `ollama_check` — only `format: "json"` differs.
#[tauri::command]
async fn ollama_json(
    base_url: String,
    model: String,
    prompt: String,
    api_key: String,
) -> Result<String, String> {
    chat(&base_url, &model, &prompt, true, &api_key).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ollama_models,
            ollama_check,
            ollama_json
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

// Touches the real ollama.com, so these are #[ignore]d — CI runs only the node
// checks (see .github/workflows/release.yml) and the network has no business
// deciding whether a release ships. Run them by hand after touching the
// commands:
//
//   cargo test -- --ignored
//
// They need no key and touch no stored one: every assertion is about the
// unauthenticated path, which is what makes them runnable by anyone. Nothing
// here reads or writes the user's configuration any more, so they are also
// safe to run in parallel.
#[cfg(test)]
mod tests {
    #[tokio::test]
    #[ignore]
    async fn lists_cloud_models_and_tolerates_a_trailing_slash() {
        let models = super::ollama_models("https://ollama.com/".into(), String::new())
            .await
            .expect("ollama.com should answer /api/tags anonymously");
        assert!(!models.is_empty(), "expected a non-empty catalogue");
        assert!(models.windows(2).all(|w| w[0] <= w[1]), "expected sorted names");
    }

    #[tokio::test]
    #[ignore]
    async fn a_bad_host_is_an_error_not_a_panic() {
        assert!(super::ollama_models("http://127.0.0.1:1".into(), String::new())
            .await
            .is_err());
    }

    /// The point of `ollama_check`: with no key, the cloud must reject it.
    /// `ollama_models` passes in the same state, which is exactly why the model
    /// list cannot be used to tell the user their key works.
    #[tokio::test]
    #[ignore]
    async fn a_missing_key_fails_the_check_but_not_the_listing() {
        assert!(
            super::ollama_models("https://ollama.com".into(), String::new())
                .await
                .is_ok(),
            "/api/tags is anonymous, so listing must still succeed"
        );

        let err = super::ollama_check(
            "https://ollama.com".into(),
            "gpt-oss:20b".into(),
            String::new(),
        )
        .await
        .expect_err("an unauthenticated completion must be rejected");
        assert!(err.contains("ollama.com/settings/keys"), "unhelpful message: {err}");
    }

    #[tokio::test]
    #[ignore]
    async fn the_check_refuses_an_empty_model_without_a_round_trip() {
        assert!(
            super::ollama_check("https://ollama.com".into(), "  ".into(), String::new())
                .await
                .is_err()
        );
    }

    /// An empty key must not become an `Authorization: Bearer ` header — the
    /// local-daemon case, and the reason the emptiness check lives in
    /// `ollama_request` rather than in each caller.
    ///
    /// Not `#[ignore]`d: it builds a request and never sends it, so it needs
    /// neither the network nor any configuration.
    #[test]
    fn an_empty_key_sends_no_authorization_header() {
        let req = super::ollama_request(
            "https://ollama.com",
            reqwest::Method::GET,
            "/api/tags",
            std::time::Duration::from_secs(5),
            "",
        )
        .expect("building a request must not fail")
        .build()
        .expect("the request must be valid");
        assert!(req.headers().get(reqwest::header::AUTHORIZATION).is_none());

        let with_key = super::ollama_request(
            "https://ollama.com",
            reqwest::Method::GET,
            "/api/tags",
            std::time::Duration::from_secs(5),
            "k",
        )
        .unwrap()
        .build()
        .unwrap();
        assert_eq!(with_key.headers()[reqwest::header::AUTHORIZATION], "Bearer k");
    }
}
