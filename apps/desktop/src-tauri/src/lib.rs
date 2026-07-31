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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:expenses.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
