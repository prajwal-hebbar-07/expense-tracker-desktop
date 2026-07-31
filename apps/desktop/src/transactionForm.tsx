// The add form and the inline editor on the Transactions list are the same six
// fields with the same rules, so they share one component and one validator.
// Two call sites, not a speculative abstraction — a second copy of `toParams`
// is how an edit ends up accepting an amount the insert would have rejected.
import { toMinor } from "./money";
import { input } from "./ui";

export type Draft = {
  direction: "debit" | "credit";
  amount: string;
  title: string;
  note: string;
  date: string;
  /** "a:3" = account 3, "c:5" = card 5. One select instead of two coupled ones. */
  source: string;
};

export type Option = { id: number; label: string };

export const cardLabel = (c: { bank: string; name: string | null; last4: string | null }) =>
  [c.bank, c.name, c.last4 && `••••${c.last4}`].filter(Boolean).join(" ");

/** Local calendar day as `YYYY-MM-DD` — what `<input type="date">` expects. */
export const today = () => new Date().toLocaleDateString("en-CA");

export const emptyDraft = (): Draft => ({
  direction: "debit",
  amount: "",
  title: "",
  note: "",
  date: today(),
  source: "",
});

export const sourceOf = (accountId: number | null, cardId: number | null) =>
  accountId ? `a:${accountId}` : cardId ? `c:${cardId}` : "";

/**
 * The bound parameters shared by INSERT_TRANSACTION and UPDATE_TRANSACTION —
 * amount, currency, title, note, spent_at, direction, account_id, card_id — or
 * the reason the draft cannot be saved. UPDATE appends the id as $9.
 */
export function toParams(d: Draft): { error: string } | { params: unknown[] } {
  const minor = toMinor(d.amount);
  // The schema's CHECK (amount > 0) means direction, not the sign, carries
  // "money out" — a negative here would be rejected by SQLite anyway.
  if (minor === null || minor <= 0)
    return { error: `"${d.amount}" is not a positive amount.` };
  if (!d.title.trim()) return { error: "Title is required." };
  if (!d.source) return { error: "Pick the account or card this went through." };

  const [kind, id] = d.source.split(":");
  return {
    params: [
      minor,
      "INR",
      d.title.trim(),
      d.note.trim() || null, // '' would read as "there is a note, it is empty"
      `${d.date}T00:00:00Z`,
      d.direction,
      kind === "a" ? Number(id) : null,
      kind === "c" ? Number(id) : null,
    ],
  };
}

export function Fields({
  draft,
  onChange,
  accounts,
  cards,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  accounts: Option[];
  cards: Option[];
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <>
      <select
        className={`${input} w-28`}
        value={draft.direction}
        onChange={(e) => set("direction", e.currentTarget.value as Draft["direction"])}
      >
        <option value="debit">Debit</option>
        <option value="credit">Credit</option>
      </select>
      <input
        className={`${input} w-32 text-right`}
        placeholder="Amount"
        inputMode="decimal"
        value={draft.amount}
        onChange={(e) => set("amount", e.currentTarget.value)}
      />
      <input
        className={`${input} flex-1 min-w-40`}
        placeholder="Title"
        value={draft.title}
        onChange={(e) => set("title", e.currentTarget.value)}
      />
      <input
        className={`${input} w-40`}
        type="date"
        value={draft.date}
        onChange={(e) => set("date", e.currentTarget.value)}
      />
      <select
        className={`${input} flex-1 min-w-48`}
        value={draft.source}
        onChange={(e) => set("source", e.currentTarget.value)}
      >
        <option value="">Account or card…</option>
        <optgroup label="Bank accounts">
          {accounts.map((a) => (
            <option key={a.id} value={`a:${a.id}`}>
              {a.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Credit cards">
          {cards.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.label}
            </option>
          ))}
        </optgroup>
      </select>
      <textarea
        className={`${input} min-h-20 w-full resize-y`}
        placeholder="Why did this money move? (optional)"
        value={draft.note}
        onChange={(e) => set("note", e.currentTarget.value)}
      />
    </>
  );
}
