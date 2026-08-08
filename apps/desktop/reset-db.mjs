// Deletes the app's SQLite file so the next launch re-runs every migration
// against an empty database. A dev convenience, never shipped: nothing in
// `src/` imports it and no Tauri command exposes it.
//
// Dropping the file rather than issuing DELETE FROM per table is what makes
// "everything" true without a list to keep in sync — a table added in a future
// migration is covered the day it lands. It also resets AUTOINCREMENT counters,
// which DELETE does not.
//
//   pnpm --filter desktop reset-db        # asks first
//   pnpm --filter desktop reset-db -y     # does not
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// Must match the plugin: tauri-plugin-sql resolves `sqlite:<name>` against
// Tauri's app-config dir, so the identifier in tauri.conf.json is half the
// path. Read it instead of hardcoding — a renamed bundle would otherwise wipe
// nothing and report success.
const { identifier } = JSON.parse(readFileSync(new URL("src-tauri/tauri.conf.json", import.meta.url)));

const configDir =
  process.platform === "win32"
    ? process.env.APPDATA
    : process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");

const file = join(configDir, identifier, "expenses.db");

if (!existsSync(file)) {
  console.log(`Nothing to reset — no database at ${file}`);
  process.exit(0);
}

if (!process.argv.slice(2).some((a) => a === "-y" || a === "--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Permanently delete ${file}? [y/N] `);
  rl.close();
  // Exit 0: declining the prompt is the command working, not failing. A
  // non-zero code makes pnpm print a recursive-run failure banner over it.
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }
}

// Deleting the sidecars is required, not defensive: sqlx opens SQLite in WAL
// mode (verified — `pragma journal_mode` reads `wal` on the live file), so an
// orphaned -wal holds committed rows that a fresh expenses.db would replay,
// resurrecting the data this command just deleted.
for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });

console.log(`Deleted ${file}\nRestart the app — migrations will rebuild it empty.`);
