// Run: pnpm --filter desktop test
//
// The outstanding walk runs backwards through the list and flips sign per row,
// which is exactly the shape of thing that is off by one row or inverted and
// still looks plausible on screen. The due-date roll is here for the two dates
// that break naive day-of-month arithmetic: a short month and a past day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { outstandingAround, nextDue } from "./src/cardBill.ts";

const row = (id: number, amount: number, direction: string, card_id: number | null) => ({
  id,
  amount,
  direction,
  card_id,
});

test("outstandingAround retraces the design's refund sentence", () => {
  // Newest first, as TRANSACTIONS returns them. Live outstanding is ₹44,853.
  const rows = [
    row(3, 179900, "credit", 1), // the refund: 46,652 -> 44,853
    row(2, 214000, "debit", 1), // before it the card was at 46,652
    row(1, 500, "debit", null), // a bank row, ignored
  ];
  const at = outstandingAround(rows, [{ id: 1, outstanding: 4485300 }]);

  assert.deepEqual(at.get(3), { before: 4665200, after: 4485300 });
  assert.deepEqual(at.get(2), { before: 4451200, after: 4665200 });
  assert.equal(at.get(1), undefined, "a row with no card has no outstanding");
});

test("outstandingAround keeps each card on its own running total", () => {
  const at = outstandingAround(
    [row(2, 1000, "debit", 2), row(1, 1000, "debit", 1)],
    [
      { id: 1, outstanding: 1000 },
      { id: 2, outstanding: 5000 },
    ],
  );
  assert.equal(at.get(1)?.before, 0);
  assert.equal(at.get(2)?.before, 4000);
});

test("outstandingAround unwinds to the opening position", () => {
  // Undoing every row on a card must land on zero, or the walk disagrees with
  // CARD_OUTSTANDING and the printed figures drift the further you scroll.
  const rows = [row(3, 300, "credit", 1), row(2, 900, "debit", 1), row(1, 400, "debit", 1)];
  const at = outstandingAround(rows, [{ id: 1, outstanding: 400 + 900 - 300 }]);
  assert.equal(at.get(1)?.before, 0);
});

test("nextDue clamps to the length of a short month", () => {
  assert.equal(nextDue(31, "2026-11-01").due, "2026-11-30");
  assert.equal(nextDue(31, "2027-02-01").due, "2027-02-28");
});

test("nextDue rolls a passed day into next month", () => {
  assert.deepEqual(nextDue(5, "2026-08-02"), { due: "2026-08-05", days: 3 });
  assert.deepEqual(nextDue(5, "2026-08-05"), { due: "2026-08-05", days: 0 });
  assert.deepEqual(nextDue(5, "2026-08-06"), { due: "2026-09-05", days: 30 });
  // A 31st that rolls has to clamp on arrival too, not just on the first pass:
  // 31 Oct is past, and November has no 31st.
  assert.equal(nextDue(31, "2026-11-01").due, "2026-11-30");
});
