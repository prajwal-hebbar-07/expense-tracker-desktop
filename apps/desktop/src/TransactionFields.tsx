// The fields themselves. Split from `transactionForm.ts` so the validator next
// door can be tested by `node --test`, which cannot strip JSX.
import { input, label as labelClass, fieldError, textarea } from "./ui";
import Select, { Item } from "./Select";
import DatePicker from "./DatePicker";
import { Draft, Errors, Option } from "./transactionForm";

const TYPES: Item[] = [
  { value: "debit", label: "Debit" },
  { value: "credit", label: "Credit" },
  { value: "transfer", label: "Transfer" },
];

export function Fields({
  draft,
  onChange,
  accounts,
  cards,
  errors = {},
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  accounts: Option[];
  cards: (Option & { hint?: string })[];
  errors?: Errors;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  const transfer = draft.direction === "transfer";

  const accountItems: Item[] = accounts.map((a) => ({ value: `a:${a.id}`, label: a.label }));
  // A transfer moves money between accounts; a card holds none, so cards are
  // hidden from both lists rather than shown and then rejected on submit.
  const sourceItems: Item[] = transfer
    ? accountItems
    : [
        { group: "Bank accounts" },
        ...accountItems,
        { group: "Credit cards" },
        ...cards.map((c) => ({ value: `c:${c.id}`, label: c.label, hint: c.hint })),
      ];

  return (
    <>
      {/* The four-field row: type, amount, title, date. Collapses to one column
          below `sm`, where 388px of content box cannot hold two 150px fields
          and a title worth reading. */}
      <div className="grid gap-3 sm:grid-cols-[7.5rem_9.375rem_minmax(0,1fr)_9.375rem]">
        <Select
          label="Type"
          items={TYPES}
          value={draft.direction}
          onChange={(v) => {
            const direction = v as Draft["direction"];
            // Switching to Transfer drops a card source: the option is about to
            // disappear from the list below and would leave the select blank.
            const keep = direction !== "transfer" || draft.source.startsWith("a:");
            onChange({ ...draft, direction, source: keep ? draft.source : "" });
          }}
        />
        <Amount
          value={draft.amount}
          onChange={(v) => set("amount", v)}
          error={errors.amount}
        />
        <Text
          label="Title"
          value={draft.title}
          onChange={(v) => set("title", v)}
          error={errors.title}
        />
        <DatePicker label="Date" value={draft.date} onChange={(v) => set("date", v)} />
      </div>

      {/* One select, or two. `flex-wrap` with a 176px floor is the whole of the
          stacking rule: two of them plus the 12px gap need 364px, so they drop
          to one column exactly where the design says they do, at no breakpoint. */}
      <div className="flex flex-wrap gap-3">
        <Select
          className={transfer ? "min-w-44 flex-1" : "w-full"}
          label={transfer ? "From account" : "Account or card"}
          items={sourceItems}
          value={draft.source}
          onChange={(v) => set("source", v)}
          placeholder={transfer ? "From account…" : "Account or card…"}
          error={errors.source}
        />
        {transfer && (
          <Select
            className="min-w-44 flex-1"
            label="To account"
            items={accounts.map((a) => ({ value: String(a.id), label: a.label }))}
            value={draft.to}
            onChange={(v) => set("to", v)}
            placeholder="To account…"
            error={errors.to}
          />
        )}
      </div>

      <div>
        <label htmlFor="txn-note" className={`${labelClass} mb-1.5 block`}>
          Note (optional)
        </label>
        <textarea
          id="txn-note"
          className={`${textarea} w-full resize-y`}
          placeholder="Why did this money move?"
          value={draft.note}
          onChange={(e) => set("note", e.currentTarget.value)}
        />
      </div>
    </>
  );
}

function Text({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = `txn-${label.toLowerCase()}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={`${labelClass} mb-1.5 block`}>
        {label}
      </label>
      <input
        id={id}
        className={`${input} w-full ${error !== undefined ? "border-danger! bg-danger-weak!" : ""}`}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {error && <p className={fieldError}>{error}</p>}
    </div>
  );
}

function Amount({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor="txn-amount" className={`${labelClass} mb-1.5 block`}>
        Amount
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-0 left-2.5 flex h-[34px] items-center text-[13.5px] text-muted">
          ₹
        </span>
        {/* Right-aligned and tabular: a column of amounts is read by comparing
            the digits that line up, not by reading each one. */}
        <input
          id="txn-amount"
          className={`${input} w-full pr-2.5 pl-6 text-right font-medium tabular-nums ${
            error !== undefined ? "border-danger! bg-danger-weak!" : ""
          }`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      </div>
      {error && <p className={fieldError}>{error}</p>}
    </div>
  );
}
