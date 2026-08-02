// The add form and the inline editor on the Transactions list are the same six
// fields with the same rules, so they share one component and one validator.
// Two call sites, not a speculative abstraction — a second copy of `toParams`
// is how an edit ends up accepting an amount the insert would have rejected.
// Explicit `.ts`: this module is pulled directly by `node --test`, which does
// not do extensionless resolution the way the bundler does.
import { toMinor } from "./money.ts";
import { todayIso } from "./day.ts";

export type Draft = {
  /** "transfer" is a UI-only kind: it stores as a `debit` row carrying a
   *  `to_account_id`, because the column's CHECK only admits debit and credit. */
  direction: "debit" | "credit" | "transfer";
  amount: string;
  title: string;
  note: string;
  date: string;
  /** "a:3" = account 3, "c:5" = card 5. One select instead of two coupled ones. */
  source: string;
  /** Destination account id as a string, only read when direction is transfer. */
  to: string;
};

export type Option = { id: number; label: string };

/** Which control a validation failure belongs under. */
export type Field = "amount" | "title" | "source" | "to";

/**
 * Failures, keyed by the field that caused them. An empty string flags a field
 * without captioning it: "pick two different accounts" is one sentence about
 * two controls, and printing it twice reads as two separate problems.
 */
export type Errors = Partial<Record<Field, string>>;

export const cardLabel = (c: { bank: string; name: string | null; last4: string | null }) =>
  [c.bank, c.name].filter(Boolean).join(" ");

/** The masked digits, shown in mono next to the card's name. */
export const cardHint = (c: { last4: string | null }) => (c.last4 ? `••••${c.last4}` : undefined);

/** Local calendar day as `YYYY-MM-DD`. */
export const today = todayIso;

export const emptyDraft = (): Draft => ({
  direction: "debit",
  amount: "",
  title: "",
  note: "",
  date: today(),
  source: "",
  to: "",
});

export const sourceOf = (accountId: number | null, cardId: number | null) =>
  accountId ? `a:${accountId}` : cardId ? `c:${cardId}` : "";

/**
 * The bound parameters shared by INSERT_TRANSACTION and UPDATE_TRANSACTION —
 * amount, currency, title, note, spent_at, direction, account_id, card_id,
 * to_account_id — or the reasons the draft cannot be saved. UPDATE appends the
 * id as $10.
 */
export function toParams(d: Draft): { errors: Errors } | { params: unknown[] } {
  const errors: Errors = {};
  const minor = toMinor(d.amount);
  // The schema's CHECK (amount > 0) means direction, not the sign, carries
  // "money out" — a negative here would be rejected by SQLite anyway.
  if (minor === null || minor <= 0) errors.amount = "Amount must be more than 0.";
  if (!d.title.trim()) errors.title = "Title is required.";

  const [kind, id] = d.source.split(":");
  const transfer = d.direction === "transfer";

  if (!d.source) {
    errors.source = transfer
      ? "Pick the account the money came from."
      : "Pick the account or card this went through.";
  } else if (transfer) {
    // Both sides of a transfer must be bank accounts, and two different ones —
    // a row pointing at itself would add and subtract within one GROUP BY and
    // silently book nothing.
    if (kind !== "a") errors.source = "Transfer from a bank account, not a card.";
  }
  if (transfer) {
    if (!d.to) errors.to = "Pick the account the money went to.";
    else if (d.to === id) {
      errors.source ??= "";
      errors.to = "Pick two different accounts.";
    }
  }

  if (Object.keys(errors).length) return { errors };

  return {
    params: [
      minor,
      "INR",
      d.title.trim(),
      d.note.trim() || null, // '' would read as "there is a note, it is empty"
      `${d.date}T00:00:00Z`,
      // The stored direction is always debit or credit; a transfer is a debit
      // on the source, and `to_account_id` is what makes it a transfer.
      transfer ? "debit" : d.direction,
      kind === "a" ? Number(id) : null,
      kind === "c" && !transfer ? Number(id) : null,
      transfer ? Number(d.to) : null,
    ],
  };
}
