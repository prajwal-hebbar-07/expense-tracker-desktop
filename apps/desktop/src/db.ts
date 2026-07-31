import Database from "@tauri-apps/plugin-sql";

// One connection for the whole app, opened once at import. Loading the same URL
// again returns the existing handle, but two live connections writing at once
// means "database is locked". Opening it is also what runs pending migrations.
export const db = Database.load("sqlite:expenses.db");
