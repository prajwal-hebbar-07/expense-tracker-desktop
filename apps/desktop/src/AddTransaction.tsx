import { useEffect, useState } from "react";
import { db } from "./db";
import { toMinor, formatAmount } from "./money";
import { input, button } from "./ui";
import {
  ACCOUNT_BALANCES,
  CARD_OUTSTANDING,
  MONTH_TOTALS,
  INSERT_TRANSACTION,
} from "./queries";

type Balance = { id: number; bank: string; currency: string; balance: number };
type Outstanding = {
  id: number;
  bank: string;
  name: string | null;
  last4: string | null;
  outstanding: number;
};

/** Local calendar day as `YYYY-MM-DD` — what `<input type="date">` expects. */
const today = () => new Date().toLocaleDateString("en-CA");

const cardLabel = (c: Outstanding) =>
  [c.bank, c.name, c.last4 && `••••${c.last4}`].filter(Boolean).join(" ");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-black/5 px-4 py-3 dark:bg-white/5">
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs opacity-50">{hint}</p>}
    </div>
  );
}

export default function AddTransaction() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [cards, setCards] = useState<Outstanding[]>([]);
  const [month, setMonth] = useState({ debit: 0, credit: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  // "a:3" = account 3, "c:5" = card 5. One select instead of two coupled ones.
  const [source, setSource] = useState("");

  async function refresh() {
    const conn = await db;
    setBalances(await conn.select<Balance[]>(ACCOUNT_BALANCES));
    setCards(await conn.select<Outstanding[]>(CARD_OUTSTANDING));

    const totals = await conn.select<{ direction: string; total: number }[]>(
      MONTH_TOTALS,
      [today().slice(0, 7)],
    );
    setMonth({
      debit: totals.find((t) => t.direction === "debit")?.total ?? 0,
      credit: totals.find((t) => t.direction === "credit")?.total ?? 0,
    });
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = toMinor(amount);
    // The schema's CHECK (amount > 0) means direction, not the sign, carries
    // "money out" — a negative here would be rejected by SQLite anyway.
    if (minor === null || minor <= 0)
      return setError(`"${amount}" is not a positive amount.`);
    if (!title.trim()) return setError("Title is required.");
    if (!source) return setError("Pick the account or card this went through.");

    const [kind, id] = source.split(":");
    const label = title.trim();
    setError(null);
    (async () => {
      await (await db).execute(INSERT_TRANSACTION, [
        minor,
        "INR",
        label,
        note.trim() || null, // '' would read as "there is a note, it is empty"
        `${date}T00:00:00Z`,
        direction,
        kind === "a" ? Number(id) : null,
        kind === "c" ? Number(id) : null,
      ]);
      setAmount("");
      setTitle("");
      setNote("");
      // The list lives on another page now, so a confirmation is the only
      // feedback that the row landed.
      setSaved(`${label} · ${formatAmount(minor)}`);
    })()
      .then(refresh)
      .catch((e) => setError(String(e)));
  }

  const inAccounts = balances.reduce((s, a) => s + a.balance, 0);
  const owed = cards.reduce((s, c) => s + c.outstanding, 0);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 text-left">
      <h1 className="text-3xl font-semibold">Add a transaction</h1>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {saved && !error && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300"
        >
          Saved {saved}. See it under Transactions.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-wrap gap-2">
        <select
          className={`${input} w-28`}
          value={direction}
          onChange={(e) => setDirection(e.currentTarget.value as "debit" | "credit")}
        >
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        <input
          className={`${input} w-32 text-right`}
          placeholder="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
        />
        <input
          className={`${input} flex-1 min-w-40`}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <input
          className={`${input} w-40`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
        />
        <select
          className={`${input} flex-1 min-w-48`}
          value={source}
          onChange={(e) => setSource(e.currentTarget.value)}
        >
          <option value="">Account or card…</option>
          <optgroup label="Bank accounts">
            {balances.map((a) => (
              <option key={a.id} value={`a:${a.id}`}>
                {a.bank}
              </option>
            ))}
          </optgroup>
          <optgroup label="Credit cards">
            {cards.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {cardLabel(c)}
              </option>
            ))}
          </optgroup>
        </select>
        <textarea
          className={`${input} min-h-20 w-full resize-y`}
          placeholder="Why did this money move? (optional)"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <button type="submit" className={button}>
          Add
        </button>
      </form>

      {balances.length === 0 && cards.length === 0 && (
        <p className="mt-3 text-sm opacity-60">
          Add a bank account or a credit card in Settings first.
        </p>
      )}

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In accounts" value={formatAmount(inAccounts)} />
        <Stat label="Card outstanding" value={formatAmount(owed)} />
        <Stat label="Net" value={formatAmount(inAccounts - owed)} hint="accounts − cards" />
        <Stat
          label="This month"
          value={formatAmount(month.debit)}
          hint={`spent · ${formatAmount(month.credit)} in`}
        />
      </div>
    </div>
  );
}
