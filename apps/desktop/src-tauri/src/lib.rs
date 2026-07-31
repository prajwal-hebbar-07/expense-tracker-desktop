use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Append-only. Never edit a migration that has shipped — add the next version instead.
fn migrations() -> Vec<Migration> {
    vec![Migration {
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
    }]
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
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
