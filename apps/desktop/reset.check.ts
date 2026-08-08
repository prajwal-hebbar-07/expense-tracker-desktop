// Run: pnpm --filter desktop test
//
// Runs the real reset against a real SQLite built from the real migrations,
// with foreign keys enforced exactly as sqlx enforces them. A reset that
// silently skips a table, or that bricks the app by clearing _sqlx_migrations,
// type-checks and looks like it worked — only running the SQL catches it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { RESET_TABLES, clearTables } from "./src/queries.ts";

/** The migration bodies out of lib.rs, so a schema change here cannot drift. */
function migrations(): string[] {
  const rust = readFileSync(new URL("./src-tauri/src/lib.rs", import.meta.url), "utf8");
  const sql = [...rust.matchAll(/sql: "([\s\S]*?)",\n\s*kind:/g)].map((m) => m[1]);
  assert.equal(sql.length, 9, "expected 9 migrations in lib.rs");
  return sql;
}

/** Every table carrying at least one row, so "cleared" means something. */
function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec(migrations().join("\n"));
  // What the app runs with. Without it the ordering hazard does not exist and
  // this file would pass while the real reset failed.
  db.exec("PRAGMA foreign_keys = ON");
  // sqlx creates this itself, so it is absent from the migration bodies above.
  // Without it the exclusion in RESET_TABLES has nothing to exclude and this
  // file would pass while the real reset bricked the app. DDL copied from a
  // live database.
  db.exec(`CREATE TABLE _sqlx_migrations (
             version BIGINT PRIMARY KEY,
             description TEXT NOT NULL,
             installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
             success BOOLEAN NOT NULL,
             checksum BLOB NOT NULL,
             execution_time BIGINT NOT NULL)`);
  for (let v = 1; v <= 9; v++)
    db.exec(`INSERT INTO _sqlx_migrations
             VALUES (${v}, 'm${v}', CURRENT_TIMESTAMP, 1, x'00', 0)`);
  db.exec("INSERT INTO account (bank, balance) VALUES ('HDFC', 100000)");
  db.exec("INSERT INTO card (bank, name, last4) VALUES ('HDFC', 'Regalia', '0421')");
  db.exec(`INSERT INTO expense (amount, title, category, spent_at, account_id)
           VALUES (2500, 'Chai', 'food', '2026-07-15T00:00:00Z', 1)`);
  db.exec(`INSERT INTO expense (amount, title, category, spent_at, card_id)
           VALUES (9900, 'Books', 'shopping', '2026-07-16T00:00:00Z', 1)`);
  db.exec("INSERT INTO settings (key, value) VALUES ('model', 'qwen3')");
  db.exec(`INSERT INTO ollama_account (name, api_key, active) VALUES ('Default', 'k', 1)`);
  db.exec(`INSERT INTO analysis (window_from, window_to, model, summary, insights, fingerprint)
           VALUES ('2026-07-01', '2026-07-31', 'm', 's', '[]', 'f')`);
  db.exec(`INSERT INTO report (window_from, window_to, model, headline, findings, habits, reframes, fingerprint)
           VALUES ('2026-07-01', '2026-07-31', 'm', 'h', '[]', '[]', '[]', 'f')`);
  return db;
}

// Three helpers, each used by most tests below, so the assertions read as the
// rule they are pinning rather than as SQLite plumbing.
const names = (db: DatabaseSync) => db.prepare(RESET_TABLES).all().map((r) => r.name);

/** The seam `resetDatabase` fills with `conn.execute`. */
const exec = (db: DatabaseSync) => async (sql: string) => db.exec(sql);

const count = (db: DatabaseSync, table: string) =>
  db.prepare(`SELECT count(*) AS c FROM ${table}`).get()!.c;

test("the reset clears every table the migrations created", async () => {
  const db = seed();
  const tables = names(db);
  // Guards the SELECT, not the loop: a filter that matched nothing would make
  // every assertion below pass against a database it never touched.
  assert.deepEqual(
    [...tables].sort(),
    ["account", "analysis", "card", "expense", "ollama_account", "report", "settings"],
    "every user-data table, and nothing else",
  );

  await clearTables(tables, exec(db));
  for (const t of tables) assert.equal(count(db, t), 0, `${t} still has rows`);
});

test("foreign keys are enforced, so the order the tables come back in is not safe", () => {
  const db = seed();
  // The reason the loop retries. If this ever stops throwing, sqlx changed its
  // default or the FKs went away, and the retry became dead code.
  assert.throws(() => db.exec("DELETE FROM account"), /FOREIGN KEY constraint failed/);
});

test("a parents-first order still converges", async () => {
  const db = seed();
  // sqlite_master happens to return children first, which would let a
  // non-retrying loop pass. Feed the worst order to exercise the real path.
  await clearTables(["account", "card", "settings", "expense"], exec(db));
  for (const t of ["account", "card", "settings", "expense"]) assert.equal(count(db, t), 0);
});

test("migration bookkeeping survives, or the app cannot open its database", async () => {
  const db = seed();
  const before = count(db, "_sqlx_migrations");
  await clearTables(names(db), exec(db));
  assert.equal(count(db, "_sqlx_migrations"), before, "clearing this re-runs every migration");
  assert.equal(before, 9);
});

test("a failure that is not about ordering is thrown, not retried forever", async () => {
  const db = seed();
  const boom = new Error("disk I/O error");
  await assert.rejects(
    clearTables(["expense"], async () => {
      throw boom;
    }),
    // The real error, not a timeout and not a generic one this code invented.
    (e: unknown) => e === boom,
  );
  assert.equal(count(db, "expense"), 2, "nothing was cleared");
});

test("an unbreakable cycle terminates instead of hanging", async () => {
  // Two tables that always fail: the pass clears nothing, so the loop stops.
  // Without the no-progress check this test would never return.
  await assert.rejects(
    clearTables(["a", "b"], async () => {
      throw new Error("FOREIGN KEY constraint failed");
    }),
    /FOREIGN KEY constraint failed/,
  );
});

test("resetting an already-empty database is a no-op, so a partial reset can be re-run", async () => {
  const db = seed();
  await clearTables(names(db), exec(db));
  await clearTables(names(db), exec(db));
  for (const t of names(db)) assert.equal(count(db, t), 0);
});
