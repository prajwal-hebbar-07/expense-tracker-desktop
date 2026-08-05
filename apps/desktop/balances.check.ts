// Run: pnpm --filter desktop test
//
// Runs the real migration SQL and the real queries against an in-memory SQLite,
// because the balance derivation lives in SQL and nothing else would catch a
// flipped CASE arm. Lives outside src/ for the same reason money.check.ts does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_BALANCES,
  ANALYTICS_FEED,
  CARD_OUTSTANDING,
  LOAD_ANALYSIS,
  LOAD_REPORT,
  MONTH_TOTALS,
  INSERT_TRANSACTION,
  UPDATE_TRANSACTION,
  DELETE_TRANSACTION,
  SAVE_ANALYSIS,
  SAVE_REPORT,
  SET_CATEGORY,
} from "./src/queries.ts";

/** The migration bodies out of lib.rs, so a schema change here cannot drift. */
function schema(): string {
  const rust = readFileSync(new URL("./src-tauri/src/lib.rs", import.meta.url), "utf8");
  const sql = [...rust.matchAll(/sql: "([\s\S]*?)",\n\s*kind:/g)].map((m) => m[1]);
  assert.equal(sql.length, 8, "expected 8 migrations in lib.rs");
  return sql.join("\n");
}

function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec(schema());
  db.exec("INSERT INTO account (bank, balance) VALUES ('HDFC', 100000)"); // ₹1000
  db.exec("INSERT INTO account (bank, balance) VALUES ('ICICI', 50000)"); // ₹500
  db.exec("INSERT INTO card (bank, name, last4) VALUES ('HDFC', 'Regalia', '0421')");
  return db;
}

const book = (
  db: DatabaseSync,
  amount: number,
  direction: string,
  on: "account" | "card",
  spentAt = "2026-07-15T00:00:00Z",
) =>
  db
    .prepare(INSERT_TRANSACTION.replace(/\$\d+/g, "?"))
    .run(
      amount,
      "INR",
      "x",
      null,
      spentAt,
      direction,
      on === "account" ? 1 : null,
      on === "card" ? 1 : null,
      null,
    );

/** Account 1 -> account 2: one row, a debit carrying a destination. */
const transfer = (
  db: DatabaseSync,
  amount: number,
  spentAt = "2026-07-15T00:00:00Z",
) =>
  db
    .prepare(INSERT_TRANSACTION.replace(/\$\d+/g, "?"))
    .run(amount, "INR", "moved", null, spentAt, "debit", 1, null, 2);

const balances = (db: DatabaseSync) =>
  Object.fromEntries(db.prepare(ACCOUNT_BALANCES).all().map((r) => [r.bank, r.balance]));

test("account balance is opening + credits - debits", () => {
  const db = seed();
  assert.equal(db.prepare(ACCOUNT_BALANCES).get()!.balance, 100000);

  book(db, 25000, "debit", "account");
  book(db, 5000, "credit", "account");
  book(db, 90000, "debit", "card"); // a card spend must not touch the account
  assert.equal(db.prepare(ACCOUNT_BALANCES).get()!.balance, 80000);
});

test("card outstanding grows on debit and shrinks on credit", () => {
  const db = seed();
  assert.equal(db.prepare(CARD_OUTSTANDING).get()!.outstanding, 0);

  book(db, 90000, "debit", "card");
  book(db, 10000, "credit", "card"); // refund or bill payment
  book(db, 25000, "debit", "account"); // must not land on the card
  assert.equal(db.prepare(CARD_OUTSTANDING).get()!.outstanding, 80000);
  assert.equal(db.prepare(CARD_OUTSTANDING).get()!.last4, "0421"); // not 421
});

test("month totals filter on the stored spent_at prefix", () => {
  const db = seed();
  book(db, 25000, "debit", "account", "2026-07-15T00:00:00Z");
  book(db, 5000, "credit", "account", "2026-07-31T00:00:00Z");
  book(db, 99999, "debit", "account", "2026-06-30T00:00:00Z"); // last month

  const rows = db.prepare(MONTH_TOTALS.replace("$1", "?")).all("2026-07");
  assert.deepEqual(
    Object.fromEntries(rows.map((r) => [r.direction, r.total])),
    { credit: 5000, debit: 25000 },
  );
});

// The Analytics and Report feed. Everything below is business logic that lives
// in SQL — a mapping done in TypeScript would be a second place for it to
// disagree with itself. See docs/analytics-real-feed.md.
const feed = (db: DatabaseSync, from: string, to: string) =>
  db.prepare(ANALYTICS_FEED.replace("$1", "?").replace("$2", "?")).all(from, to);

test("the feed spans both bounds and shapes a row as the charts read it", () => {
  const db = seed();
  book(db, 25000, "debit", "account", "2026-07-01T00:00:00Z"); // first day
  book(db, 30000, "debit", "card", "2026-07-31T00:00:00Z"); // last day
  book(db, 99999, "debit", "account", "2026-06-30T00:00:00Z"); // outside

  const rows = feed(db, "2026-07-01", "2026-07-31");
  assert.equal(rows.length, 2, "both boundary days are inside the window");
  assert.deepEqual(
    { ...rows[0] },
    {
      date: "2026-07-01",
      amount: 25000,
      direction: "debit",
      title: "x",
      category: "Uncategorised",
      kind: "account",
      source: "HDFC",
    },
  );
  // The card row carries the card's name, and is the borrowed kind.
  assert.equal(rows[1].kind, "card");
  assert.equal(rows[1].source, "HDFC Regalia");
});

test("the feed leaves transfers out", () => {
  const db = seed();
  book(db, 25000, "debit", "account", "2026-07-15T00:00:00Z");
  transfer(db, 500000, "2026-07-16T00:00:00Z");

  const rows = feed(db, "2026-07-01", "2026-07-31");
  assert.equal(rows.length, 1, "moving your own money is neither spending nor income");
  assert.equal(rows[0].amount, 25000);
});

test("a categorised row keeps its own label", () => {
  const db = seed();
  book(db, 25000, "debit", "account", "2026-07-15T00:00:00Z");
  db.prepare(SET_CATEGORY.replace("$1", "?").replace("$2", "?")).run("Groceries", 1);

  assert.equal(feed(db, "2026-07-01", "2026-07-31")[0].category, "Groceries");
});

// One analysis per window: the button replaces, never accumulates.
const saveAnalysis = (db: DatabaseSync, to: string, summary: string, fingerprint: string) =>
  db
    .prepare(SAVE_ANALYSIS.replace(/\$\d+/g, "?"))
    .run("2026-07-01", to, "gpt-oss:120b", summary, '[{"title":"t","detail":"d"}]', fingerprint);

test("saving an analysis twice for one window overwrites it", () => {
  const db = seed();
  saveAnalysis(db, "2026-07-31", "first", "3:100:200");
  saveAnalysis(db, "2026-07-31", "second", "4:150:200");
  saveAnalysis(db, "2026-06-30", "another window", "1:10:20");

  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analysis").get()!.n, 2);
  const row = db
    .prepare(LOAD_ANALYSIS.replace("$1", "?").replace("$2", "?"))
    .get("2026-07-01", "2026-07-31")!;
  assert.equal(row.summary, "second");
  assert.equal(row.fingerprint, "4:150:200", "the fingerprint must move with the prose");
  assert.match(String(row.created_at), /^\d{4}-\d{2}-\d{2}T/, "ISO-8601 UTC, per rule 4");
  assert.deepEqual(JSON.parse(String(row.insights)), [{ title: "t", detail: "d" }]);
});

// Same discipline for the written report: one row per Report window, replaced
// by the next press — docs/report-ai.md.
const saveReport = (db: DatabaseSync, headline: string, fingerprint: string) =>
  db
    .prepare(SAVE_REPORT.replace(/\$\d+/g, "?"))
    .run(
      "2026-07-01",
      "2026-07-31",
      "gpt-oss:120b",
      headline,
      '[{"title":"f","figure":"₹1","why":"w","severity":"note"}]',
      '[{"title":"h","how":"do it","saves":150000}]',
      '[{"title":"r","body":"b"}]',
      fingerprint,
    );

test("regenerating a report for one window replaces it", () => {
  const db = seed();
  saveReport(db, "first", "3:100:200");
  saveReport(db, "second", "4:150:200");

  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report").get()!.n, 1);
  const row = db
    .prepare(LOAD_REPORT.replace("$1", "?").replace("$2", "?"))
    .get("2026-07-01", "2026-07-31")!;
  assert.equal(row.headline, "second");
  assert.equal(row.fingerprint, "4:150:200", "the fingerprint must move with the prose");
  assert.match(String(row.created_at), /^\d{4}-\d{2}-\d{2}T/, "ISO-8601 UTC");
  // Three documents, read back whole. A habit's `saves` stays paise across the
  // boundary — the badge divides, the column does not.
  assert.deepEqual(JSON.parse(String(row.habits)), [{ title: "h", how: "do it", saves: 150000 }]);
  assert.equal(JSON.parse(String(row.findings))[0].severity, "note");
  assert.deepEqual(JSON.parse(String(row.reframes)), [{ title: "r", body: "b" }]);
});

test("direction is constrained and defaults to debit", () => {
  const db = seed();
  assert.throws(() => book(db, 100, "sideways", "account"), /CHECK constraint/);
  db.exec(
    "INSERT INTO expense (amount, title, category, spent_at) VALUES (100,'legacy','food','2026-07-01T00:00:00Z')",
  );
  assert.equal(db.prepare("SELECT direction FROM expense").get()!.direction, "debit");
});

// UPDATE_TRANSACTION takes the same eight params as INSERT_TRANSACTION plus the
// id. Nothing but this catches the two drifting apart — SQLite happily writes an
// amount into `spent_at`, since both columns accept anything.
test("editing a transaction rewrites every field and moves the balance", () => {
  const db = seed();
  book(db, 25000, "debit", "account");
  assert.equal(db.prepare(ACCOUNT_BALANCES).get()!.balance, 75000);

  db.prepare(UPDATE_TRANSACTION.replace(/\$\d+/g, "?")).run(
    9900,
    "INR",
    "corrected",
    "typed a zero too many",
    "2026-07-20T00:00:00Z",
    "credit",
    1,
    null,
    null,
    1,
  );

  const row = db.prepare("SELECT * FROM expense WHERE id = 1").get()!;
  assert.equal(row.amount, 9900);
  assert.equal(row.title, "corrected");
  assert.equal(row.note, "typed a zero too many");
  assert.equal(row.spent_at, "2026-07-20T00:00:00Z");
  assert.equal(row.direction, "credit");
  assert.equal(db.prepare(ACCOUNT_BALANCES).get()!.balance, 109900); // 100000 + 9900
});

test("deleting a transaction gives the balance back", () => {
  const db = seed();
  book(db, 25000, "debit", "account");
  book(db, 90000, "debit", "card");
  db.prepare(DELETE_TRANSACTION.replace("$1", "?")).run(1);

  assert.equal(db.prepare(ACCOUNT_BALANCES).get()!.balance, 100000);
  assert.equal(db.prepare(CARD_OUTSTANDING).get()!.outstanding, 90000); // untouched
});

test("migration 4 renames description to title and leaves note optional", () => {
  const db = seed();
  book(db, 100, "debit", "account");
  const row = db.prepare("SELECT title, note, category FROM expense").get()!;
  assert.equal(row.title, "x");
  assert.equal(row.note, null); // an omitted note is NULL, never ''
  assert.equal(row.category, ""); // the form no longer collects one
  assert.throws(
    () => db.exec("INSERT INTO expense (amount, spent_at) VALUES (1,'2026-07-01')"),
    /NOT NULL/,
  );
});

// The whole point of the feature: the money is not gone, it is somewhere else.
test("a transfer moves money between accounts and nets to zero", () => {
  const db = seed();
  assert.deepEqual(balances(db), { HDFC: 100000, ICICI: 50000 });

  transfer(db, 25000);
  assert.deepEqual(balances(db), { HDFC: 75000, ICICI: 75000 });

  const total = (b: Record<string, number>) => Object.values(b).reduce((x, y) => x + y, 0);
  assert.equal(total(balances(db)), 150000, "a transfer must not change the total");
});

test("a transfer is neither spending nor income", () => {
  const db = seed();
  transfer(db, 25000);
  book(db, 4000, "debit", "account");

  const rows = db.prepare(MONTH_TOTALS.replace("$1", "?")).all("2026-07");
  assert.deepEqual(
    Object.fromEntries(rows.map((r) => [r.direction, r.total])),
    { debit: 4000 }, // the 25000 transfer is excluded, not counted as spend
  );
});

test("deleting a transfer restores both accounts", () => {
  const db = seed();
  transfer(db, 25000);
  db.prepare(DELETE_TRANSACTION.replace("$1", "?")).run(1);
  assert.deepEqual(balances(db), { HDFC: 100000, ICICI: 50000 });
});

// The destination arm of the CASE has to win over `direction`, and the join has
// to reach rows through either column. Both are easy to get wrong by half.
test("a transfer credits the destination and debits the source, once each", () => {
  const db = seed();
  transfer(db, 10000);
  transfer(db, 10000);
  assert.deepEqual(balances(db), { HDFC: 80000, ICICI: 70000 });
});
