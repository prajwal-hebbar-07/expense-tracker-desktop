// Run: pnpm --filter desktop test
//
// `toParams` guards the one write path both the add form and the inline editor
// use, and it now has to say *which* field is wrong as well as that something
// is. A message filed under the wrong key renders under the wrong control,
// which reads as a bug in a field the user has not touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDraft, toParams, type Draft } from "./src/transactionForm.ts";

const draft = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(),
  amount: "100",
  title: "Groceries",
  source: "a:1",
  ...over,
});

/** The error map, or a failure saying it unexpectedly validated. */
function errors(d: Draft) {
  const r = toParams(d);
  assert.ok("errors" in r, "expected this draft to be rejected");
  return r.errors;
}

test("a valid debit produces the nine bound parameters, in order", () => {
  const r = toParams(draft({ date: "2026-07-31", note: "weekly" }));
  assert.ok("params" in r);
  assert.deepEqual(r.params, [
    10000,
    "INR",
    "Groceries",
    "weekly",
    "2026-07-31T00:00:00Z",
    "debit",
    1,
    null,
    null,
  ]);
});

test("each failure is filed under the control that caused it", () => {
  assert.deepEqual(Object.keys(errors(draft({ amount: "0" }))), ["amount"]);
  assert.deepEqual(Object.keys(errors(draft({ amount: "abc" }))), ["amount"]);
  assert.deepEqual(Object.keys(errors(draft({ title: "   " }))), ["title"]);
  assert.deepEqual(Object.keys(errors(draft({ source: "" }))), ["source"]);
});

test("a transfer must leave a bank account, not a card", () => {
  const e = errors(draft({ direction: "transfer", source: "c:2", to: "1" }));
  assert.match(e.source!, /bank account/);
  assert.equal(e.to, undefined, "the destination is fine; do not flag it too");
});

test("a transfer needs a destination", () => {
  const e = errors(draft({ direction: "transfer", to: "" }));
  assert.match(e.to!, /went to/);
});

test("the two-different rule flags both selects but says it once", () => {
  // A row pointing at itself adds and subtracts inside one GROUP BY and books
  // nothing at all, so this has to be caught before the write.
  const e = errors(draft({ direction: "transfer", source: "a:1", to: "1" }));
  assert.equal(e.source, "", "flagged, but not captioned twice");
  assert.match(e.to!, /two different/);
});

test("a valid transfer stores as a debit carrying a destination", () => {
  const r = toParams(draft({ direction: "transfer", source: "a:1", to: "2" }));
  assert.ok("params" in r);
  const [, , , , , direction, accountId, cardId, toAccountId] = r.params;
  // The column's CHECK only admits debit and credit; `to_account_id` is the
  // only thing that makes the row a transfer.
  assert.equal(direction, "debit");
  assert.equal(accountId, 1);
  assert.equal(cardId, null);
  assert.equal(toAccountId, 2);
});

test("every failure reports every problem, not just the first", () => {
  // The form captions all of its fields at once; stopping at the first error
  // would make the user submit three times to find three mistakes.
  const e = errors(draft({ amount: "", title: "", source: "" }));
  assert.deepEqual(Object.keys(e).sort(), ["amount", "source", "title"]);
});
