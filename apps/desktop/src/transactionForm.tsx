// The add form and the inline editor on the Transactions list are the same six
// fields with the same rules, so they share one component and one validator.
// Two call sites, not a speculative abstraction — a second copy of `toParams`
// is how an edit ends up accepting an amount the insert would have rejected.
import { toMinor } from "./money";
import { input } from "./ui";
import { ChevronDown } from "./icons";

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
  to: "",
});

export const sourceOf = (accountId: number | null, cardId: number | null) =>
  accountId ? `a:${accountId}` : cardId ? `c:${cardId}` : "";

/**
 * The bound parameters shared by INSERT_TRANSACTION and UPDATE_TRANSACTION —
 * amount, currency, title, note, spent_at, direction, account_id, card_id,
 * to_account_id — or the reason the draft cannot be saved. UPDATE appends the
 * id as $10.
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
  const transfer = d.direction === "transfer";
  // Both sides of a transfer must be bank accounts, and two different ones —
  // a row pointing at itself would add and subtract within one GROUP BY and
  // silently book nothing.
  if (transfer) {
    if (kind !== "a") return { error: "Transfer from a bank account, not a card." };
    if (!d.to) return { error: "Pick the account the money went to." };
    if (d.to === id) return { error: "Pick two different accounts." };
  }

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

/** A native <select> keeps the platform popup and keyboard behaviour; only the
 *  closed-state arrow is ours, because the macOS one does not match the inputs
 *  next to it. `appearance-none` is what hides it. */
function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { className: string }) {
  return (
    <div className={`relative ${className}`}>
      <select {...props} className={`${input} w-full appearance-none pr-9`} />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
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

  const transfer = draft.direction === "transfer";

  return (
    <>
      <Select
        className="w-32"
        value={draft.direction}
        onChange={(e) => {
          const direction = e.currentTarget.value as Draft["direction"];
          // Switching to Transfer drops a card source: the option is about to
          // disappear from the list below and would leave the select blank.
          const keep = direction !== "transfer" || draft.source.startsWith("a:");
          onChange({ ...draft, direction, source: keep ? draft.source : "" });
        }}
      >
        <option value="debit">Debit</option>
        <option value="credit">Credit</option>
        <option value="transfer">Transfer</option>
      </Select>
      <div className="relative w-36">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
          ₹
        </span>
        <input
          className={`${input} w-full pl-7 text-right`}
          placeholder="Amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => set("amount", e.currentTarget.value)}
        />
      </div>
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
      {/* Full width, so it starts the second row and the four fields above it
          stay on one line at the widths this window is used at. A transfer
          splits that row in two: from-account and to-account. */}
      <Select
        className={transfer ? "flex-1 min-w-40" : "w-full"}
        value={draft.source}
        onChange={(e) => set("source", e.currentTarget.value)}
      >
        <option value="">{transfer ? "From account…" : "Account or card…"}</option>
        <optgroup label="Bank accounts">
          {accounts.map((a) => (
            <option key={a.id} value={`a:${a.id}`}>
              {a.label}
            </option>
          ))}
        </optgroup>
        {/* A transfer moves money between accounts; a card holds none. */}
        {!transfer && (
          <optgroup label="Credit cards">
            {cards.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.label}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {transfer && (
        <Select
          className="flex-1 min-w-40"
          value={draft.to}
          onChange={(e) => set("to", e.currentTarget.value)}
        >
          <option value="">To account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {a.label}
            </option>
          ))}
        </Select>
      )}
      <textarea
        className={`${input} min-h-20 w-full resize-y`}
        placeholder="Why did this money move? (optional)"
        value={draft.note}
        onChange={(e) => set("note", e.currentTarget.value)}
      />
    </>
  );
}
