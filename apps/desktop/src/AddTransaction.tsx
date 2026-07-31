import { useEffect, useState } from "react";
import { db } from "./db";
import { formatAmount } from "./money";
import { button, card, errorBox, h1, h2, noticeBox, page } from "./ui";
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
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="truncate text-xs text-muted">{hint}</p>}
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
    <div className={page}>
      <h1 className={h1}>Overview</h1>

      {error && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}

      {saved && !error && (
        <p role="status" className={noticeBox}>
          Saved {saved}. See it under Transactions.
        </p>
      )}

      {/* Standing figures first: they are what the window is usually left open
          on, and the form below is entered into a few times a day. */}
      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="In accounts" value={formatAmount(inAccounts)} />
        <Stat label="Card outstanding" value={formatAmount(owed)} />
        <Stat label="Net" value={formatAmount(inAccounts - owed)} hint="accounts − cards" />
        <Stat
          label="This month"
          value={formatAmount(month.debit)}
          hint={`spent · ${formatAmount(month.credit)} in`}
        />
      </div>

      <section className={`mt-8 ${card}`}>
        <h2 className={h2}>Add a transaction</h2>

        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <Fields
            draft={draft}
            onChange={setDraft}
            accounts={balances.map((a) => ({ id: a.id, label: a.bank }))}
            cards={cards.map((c) => ({ id: c.id, label: cardLabel(c) }))}
          />
          <button type="submit" className={`${button} ml-auto`}>
            Add
          </button>
        </form>

        {balances.length === 0 && cards.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            Add a bank account or a credit card in Settings first.
          </p>
        )}
      </section>
    </div>
  );
}
