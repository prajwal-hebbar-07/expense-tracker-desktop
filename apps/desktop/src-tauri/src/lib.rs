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
