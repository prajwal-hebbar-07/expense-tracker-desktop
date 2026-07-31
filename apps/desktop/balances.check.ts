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
} from "./src/queries.ts";

/** The migration bodies out of lib.rs, so a schema change here cannot drift. */
function schema(): string {
  const rust = readFileSync(new URL("./src-tauri/src/lib.rs", import.meta.url), "utf8");
  const sql = [...rust.matchAll(/sql: "([\s\S]*?)",\n\s*kind:/g)].map((m) => m[1]);
  assert.equal(sql.length, 3, "expected 3 migrations in lib.rs");
  return sql.join("\n");
}

function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec(schema());
  db.exec("INSERT INTO account (bank, balance) VALUES ('HDFC', 100000)"); // ₹1000
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
    .prepare(INSERT_TRANSACTION.replace(/\$\d/g, "?"))
    .run(
      amount,
      "INR",
      "x",
      "food",
      spentAt,
      direction,
      on === "account" ? 1 : null,
      on === "card" ? 1 : null,
    );

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
    "INSERT INTO expense (amount, description, category, spent_at) VALUES (100,'legacy','food','2026-07-01T00:00:00Z')",
  );
  assert.equal(db.prepare("SELECT direction FROM expense").get()!.direction, "debit");
});
