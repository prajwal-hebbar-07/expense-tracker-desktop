// Turning a batch of ledger rows into categories, and reading the model's
// answer back. Pure functions, no db and no invoke, so `categorize.check.ts`
// can run them against fixed replies — which is the half that breaks, since a
// model's JSON is only ever *probably* the shape you asked for.
//
// See docs/expense-categories.md.

/** A closed list, sent to the model verbatim and enforced on the way back.
 *  Free-form labels drift — "Food", "food", "Dining", "Restaurants" become four
 *  groups of the same thing — and a grouped view is only useful if the same
 *  expense lands in the same bucket every run.
 *
 *  `Income` covers credits; transfers never reach the model at all. */
export const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills & Utilities",
  "Rent",
  // Debt repayments are commitments, not shopping. Keeping them separate lets
  // the Report protect them while looking for savings elsewhere.
  "Loans & EMIs",
  "Health",
  "Entertainment",
  "Travel",
  "Education",
  // Added 2026-08-05, when the Report screen started reading the real ledger:
  // its "renews whether you use it or not" finding needs a bucket that is
  // about the *commitment*, not the content — Netflix is not an evening out.
  // Adding a category is a data decision: rows already filed keep what they
  // have until something re-categorises them, and nothing does today.
  "Subscriptions",
  "Income",
  "Other",
] as const;

export type Item = {
  id: number;
  title: string;
  note?: string | null;
  direction: "debit" | "credit";
};

const BY_NAME = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c]));

/** One prompt per batch. The ids are the ledger's own, so the reply needs no
 *  positional matching — a model that drops or reorders an entry still lands
 *  every category it did return on the right row. */
export function buildPrompt(items: Item[]): string {
  const lines = items.map(
    (i) =>
      `${i.id}: ${i.title}${i.note ? ` (${i.note})` : ""} [${
        i.direction === "credit" ? "money in" : "money out"
      }]`,
  );
  return [
    "Categorise each personal-finance transaction below.",
    "",
    `Allowed categories: ${CATEGORIES.join(", ")}.`,
    "Use Loans & EMIs for loan repayments and EMIs, not ordinary card purchases.",
    "",
    "Transactions:",
    ...lines,
    "",
    'Reply with JSON only: an object mapping each id to one allowed category, e.g. {"12":"Groceries"}.',
    "Use Other when nothing fits. Do not invent categories and do not add commentary.",
  ].join("\n");
}

/** Reply -> id -> category, for exactly the ids that were asked about.
 *
 *  Every requested id comes back with something: an omitted or unrecognised
 *  answer becomes "Other" rather than staying empty, because an empty category
 *  is the uncategorised bucket, and a row that silently returns to it after a
 *  run looks like the button did nothing. */
export function parseCategories(reply: string, items: Item[]): Map<number, string> {
  // Models wrap JSON in ```json fences even when told not to, and `format:
  // "json"` only makes that rarer, not impossible. Take the outermost braces.
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`Model did not answer with JSON: ${reply.slice(0, 120)}`);

  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error(`Model's JSON did not parse: ${reply.slice(start, start + 120)}`);
  }
  const answers = new Map(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k.trim(), v]),
  );

  return new Map(
    items.map((i) => {
      const said = answers.get(String(i.id));
      const name = typeof said === "string" ? BY_NAME.get(said.trim().toLowerCase()) : undefined;
      return [i.id, name ?? "Other"];
    }),
  );
}

/** Rows per request. Small enough that a 20b model keeps the ids straight and
 *  the reply fits well inside a completion, large enough that a 200-row ledger
 *  is five round trips rather than fifty. */
// ponytail: fixed size, sequential. Concurrent batches would be faster and
// would also rate-limit an ollama.com account; revisit if a run feels slow.
export const BATCH = 40;

export function batches<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
