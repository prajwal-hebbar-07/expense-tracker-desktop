import { useEffect, useState } from "react";
import { db } from "./db";
import { toMinor, formatAmount } from "./money";
import { input, button } from "./ui";
import {
  ACCOUNT_BALANCES,
  CARD_OUTSTANDING,
  MONTH_TOTALS,
  RECENT,
  INSERT_TRANSACTION,
  CATEGORIES,
} from "./queries";

type Balance = { id: number; bank: string; currency: string; balance: number };
type Outstanding = {
  id: number;
  bank: string;
  name: string | null;
  last4: string | null;
  outstanding: number;
};
type Row = {
  id: number;
  amount: number;
  currency: string;
  description: string;
  category: string;
  spent_at: string;
  direction: "debit" | "credit";
  source: string | null;
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

export default function Transactions() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [cards, setCards] = useState<Outstanding[]>([]);
  const [month, setMonth] = useState({ debit: 0, credit: 0 });
  const [recent, setRecent] = useState<Row[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(today);
  // "a:3" = account 3, "c:5" = card 5. One select instead of two coupled ones.
  const [source, setSource] = useState("");

  async function refresh() {
    const conn = await db;
    setBalances(await conn.select<Balance[]>(ACCOUNT_BALANCES));
    setCards(await conn.select<Outstanding[]>(CARD_OUTSTANDING));
    setRecent(await conn.select<Row[]>(RECENT));
    setCategories(
      (await conn.select<{ category: string }[]>(CATEGORIES)).map((r) => r.category),
    );

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
    if (!description.trim()) return setError("Description is required.");
    if (!category.trim()) return setError("Category is required.");
    if (!source) return setError("Pick the account or card this went through.");

    const [kind, id] = source.split(":");
    setError(null);
    (async () => {
      await (await db).execute(INSERT_TRANSACTION, [
        minor,
        "INR",
        description.trim(),
        category.trim(),
        `${date}T00:00:00Z`,
        direction,
        kind === "a" ? Number(id) : null,
        kind === "c" ? Number(id) : null,
      ]);
      setAmount("");
      setDescription("");
    })()
      .then(refresh)
      .catch((e) => setError(String(e)));
  }

  const inAccounts = balances.reduce((s, a) => s + a.balance, 0);
  const owed = cards.reduce((s, c) => s + c.outstanding, 0);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 text-left">
      <h1 className="text-3xl font-semibold">Transactions</h1>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In accounts" value={formatAmount(inAccounts)} />
        <Stat label="Card outstanding" value={formatAmount(owed)} />
        <Stat label="Net" value={formatAmount(inAccounts - owed)} hint="accounts − cards" />
        <Stat
          label="This month"
          value={formatAmount(month.debit)}
          hint={`spent · ${formatAmount(month.credit)} in`}
        />
      </div>

      <form onSubmit={submit} className="mt-8 flex flex-wrap gap-2">
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
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <input
          className={`${input} flex-1 min-w-32`}
          placeholder="Category"
          list="categories"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value)}
        />
        <datalist id="categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
        <button type="submit" className={button}>
          Add
        </button>
      </form>

      {balances.length === 0 && cards.length === 0 && (
        <p className="mt-3 text-sm opacity-60">
          Add a bank account or a credit card in Settings first.
        </p>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-medium">Where the money is</h2>
        <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
          {balances.map((a) => (
            <li key={`a${a.id}`} className="flex items-center gap-3 py-3">
              <span className="flex-1">{a.bank}</span>
              <span className="tabular-nums">{formatAmount(a.balance, a.currency)}</span>
            </li>
          ))}
          {cards.map((c) => (
            <li key={`c${c.id}`} className="flex items-center gap-3 py-3">
              <span className="flex-1">{cardLabel(c)}</span>
              <span className="tabular-nums opacity-70">
                {formatAmount(-c.outstanding)} owed
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-medium">Recent</h2>
        <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <span className="flex-1">
                {r.description}
                <span className="ml-2 text-sm opacity-50">
                  {r.category} · {r.source ?? "unassigned"} · {r.spent_at.slice(0, 10)}
                </span>
              </span>
              <span
                className={`tabular-nums ${
                  r.direction === "credit" ? "text-green-600 dark:text-green-400" : ""
                }`}
              >
                {r.direction === "credit" ? "+" : "−"}
                {formatAmount(r.amount, r.currency)}
              </span>
            </li>
          ))}
        </ul>
        {recent.length === 0 && (
          <p className="mt-4 text-sm opacity-60">Nothing recorded yet.</p>
        )}
      </section>
    </div>
  );
}
