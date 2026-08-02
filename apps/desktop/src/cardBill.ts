// Two facts about a credit card that no query returns, both derived from what
// is already on screen. Outside the components so `cardBill.check.ts` can run
// them without a React renderer.

// `.ts` extension because `node --test *.check.ts` resolves this file directly,
// with no bundler to guess at it — the same reason transactionForm.ts does it.
import { at, shiftMonths, todayIso } from "./day.ts";

/**
 * Outstanding on each card *before* and *after* every card row, keyed by row id.
 *
 * A card holds no money — its number is what you owe — so a refund's real
 * sentence is "46,652 → 44,853", not "+₹1,799 arrived". Rows arrive
 * newest-first, so this walks down from each card's live total undoing one row
 * at a time: a debit raised the debt, a credit lowered it. Transfers are not
 * skipped, deliberately — CARD_OUTSTANDING sums every row carrying a card_id,
 * and a walk that disagreed with it would drift row by row.
 */
export function outstandingAround(
  rows: { id: number; amount: number; direction: string; card_id: number | null }[],
  cards: { id: number; outstanding: number }[],
): Map<number, { before: number; after: number }> {
  const running = new Map(cards.map((c) => [c.id, c.outstanding]));
  const out = new Map<number, { before: number; after: number }>();

  for (const r of rows) {
    if (r.card_id === null) continue;
    const after = running.get(r.card_id) ?? 0;
    const before = after - (r.direction === "debit" ? r.amount : -r.amount);
    out.set(r.id, { before, after });
    running.set(r.card_id, before);
  }
  return out;
}

/**
 * The card's next statement due date and how many days off it is.
 *
 * `dueDay` is a day-of-month, so it is clamped to short months: a card due on
 * the 31st is due on the 30th in November, not the 1st of December. A date that
 * has already passed rolls to next month — the app cannot tell an unpaid bill
 * from a paid one (a bill payment is not modelled), so it never claims overdue.
 */
export function nextDue(dueDay: number, today = todayIso()) {
  const [y, m] = today.split("-").map(Number);
  const lastOfMonth = new Date(y, m, 0).getDate();
  const thisMonth = `${today.slice(0, 8)}${String(Math.min(dueDay, lastOfMonth)).padStart(2, "0")}`;
  const due = thisMonth >= today ? thisMonth : shiftMonths(thisMonth, 1);

  return {
    due,
    // at() is noon-anchored on both sides, so a DST shift cannot round this to
    // a day either way.
    days: Math.round((at(due).getTime() - at(today).getTime()) / 86_400_000),
  };
}
