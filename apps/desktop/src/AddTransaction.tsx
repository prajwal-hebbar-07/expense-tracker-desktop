import { useEffect, useState } from "react";
import { db } from "./db";
import { formatAmount } from "./money";
import { button } from "./ui";
import { Draft, Fields, cardLabel, emptyDraft, toParams, today } from "./transactionForm";
import { ACCOUNT_BALANCES, CARD_OUTSTANDING, MONTH_TOTALS, INSERT_TRANSACTION } from "./queries";

type Balance = { id: number; bank: string; currency: string; balance: number };
type Outstanding = {
  id: number;
  bank: string;
  name: string | null;
  last4: string | null;
  outstanding: number;
};

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
  const [draft, setDraft] = useState<Draft>(emptyDraft);

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
    const result = toParams(draft);
    if ("error" in result) return setError(result.error);

    const label = `${draft.title.trim()} · ${formatAmount(result.params[0] as number)}`;
    setError(null);
    (async () => {
      await (await db).execute(INSERT_TRANSACTION, result.params);
      // Keep direction, date and source — entering a run of expenses from one
      // card is the common case, and retyping them each time is the annoyance.
      setDraft({ ...draft, amount: "", title: "", note: "" });
      // The list lives on another page now, so this is the only feedback that
      // the row landed.
      setSaved(label);
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
        <Fields
          draft={draft}
          onChange={setDraft}
          accounts={balances.map((a) => ({ id: a.id, label: a.bank }))}
          cards={cards.map((c) => ({ id: c.id, label: cardLabel(c) }))}
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
