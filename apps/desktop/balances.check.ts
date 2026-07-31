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
  CARD_OUTSTANDING,
  MONTH_TOTALS,
  INSERT_TRANSACTION,
  UPDATE_TRANSACTION,
  DELETE_TRANSACTION,
} from "./src/queries.ts";

/** The migration bodies out of lib.rs, so a schema change here cannot drift. */
function schema(): string {
  const rust = readFileSync(new URL("./src-tauri/src/lib.rs", import.meta.url), "utf8");
  const sql = [...rust.matchAll(/sql: "([\s\S]*?)",\n\s*kind:/g)].map((m) => m[1]);
  assert.equal(sql.length, 5, "expected 5 migrations in lib.rs");
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
