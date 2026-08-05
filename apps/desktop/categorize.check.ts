// Run: pnpm --filter desktop test
//
// The half that breaks is the reply, not the request: a model answers with a
// category nobody asked for, wraps its JSON in a fence, or quietly skips a row.
// Each of those writes a wrong `category` into the ledger if it gets through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { batches, buildPrompt, parseCategories, type Item } from "./src/categorize.ts";

const items: Item[] = [
  { id: 1, title: "Blue Tokai", note: "beans", direction: "debit" },
  { id: 2, title: "Salary", note: null, direction: "credit" },
];

test("the prompt carries the ids, the direction and the closed list", () => {
  const p = buildPrompt(items);
  assert.match(p, /1: Blue Tokai \(beans\) \[money out\]/);
  assert.match(p, /2: Salary \[money in\]/);
  assert.match(p, /Food & Dining/);
  assert.match(p, /Other/);
  assert.match(p, /Loans & EMIs/);
  assert.match(p, /loan repayments and EMIs/);
});

test("a clean answer files every row", () => {
  const at = parseCategories('{"1":"Food & Dining","2":"Income"}', items);
  assert.equal(at.get(1), "Food & Dining");
  assert.equal(at.get(2), "Income");
});

test("fences and commentary around the JSON are tolerated", () => {
  const reply = 'Sure!\n```json\n{"1": "Groceries", "2": "Income"}\n```\nHope that helps.';
  assert.equal(parseCategories(reply, items).get(1), "Groceries");
});

test("a category outside the list becomes Other, and case does not matter", () => {
  const at = parseCategories('{"1":"Coffee Shops","2":"  income "}', items);
  assert.equal(at.get(1), "Other", "an invented category must not reach the database");
  assert.equal(at.get(2), "Income");
});

test("a row the model skipped still gets a category", () => {
  // Otherwise it stays at '' and silently reappears as uncategorised after a
  // run the user was told had finished.
  const at = parseCategories('{"1":"Transport"}', items);
  assert.equal(at.size, 2);
  assert.equal(at.get(2), "Other");
});

test("ids outside the batch are ignored, not written", () => {
  const at = parseCategories('{"1":"Rent","99":"Travel"}', items);
  assert.deepEqual([...at.keys()], [1, 2]);
});

test("a non-JSON reply is an error, not a silent no-op", () => {
  assert.throws(() => parseCategories("I cannot help with that.", items), /did not answer with JSON/);
  assert.throws(() => parseCategories('{"1": Food}', items), /did not parse/);
});

test("batches covers every row exactly once", () => {
  const rows = Array.from({ length: 95 }, (_, i) => i);
  const out = batches(rows, 40);
  assert.deepEqual(out.map((b) => b.length), [40, 40, 15]);
  assert.deepEqual(out.flat(), rows);
  assert.deepEqual(batches([], 40), []);
});
