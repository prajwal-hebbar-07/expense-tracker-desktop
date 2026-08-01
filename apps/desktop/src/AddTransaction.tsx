import { ComponentType, useEffect, useState } from "react";
import { db } from "./db";
import { formatAmount } from "./money";
import { button, card, errorBox, h1, h2, noticeBox, page } from "./ui";
import { ArrowsLeftRight, Bank, Calendar, Card } from "./icons";
import type { Go } from "./App";
import { Fields } from "./TransactionFields";
import { Draft, Errors, cardHint, cardLabel, emptyDraft, toParams, today } from "./transactionForm";
import { ACCOUNT_BALANCES, CARD_OUTSTANDING, MONTH_TOTALS, INSERT_TRANSACTION } from "./queries";

type Balance = { id: number; bank: string; currency: string; balance: number };
type Outstanding = {
  id: number;
  bank: string;
  name: string | null;
  last4: string | null;
  outstanding: number;
};

/** The Overview tile. A standing balance has nothing to compare itself against,
 *  so this is a different object from the Analytics summary tile rather than
 *  that one with its delta row switched off — the figure right-aligns, and the
 *  icon sits on the label instead of in a tinted circle. */
function Balance({
  label,
  value,
  icon: Icon,
  tint = "",
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted">
        <Icon className={`size-[18px] shrink-0 ${tint}`} />
        <span className="truncate text-[11px] font-medium tracking-[0.07em] uppercase">
          {label}
        </span>
      </div>
      <p className={`truncate text-right text-xl font-semibold tracking-[-0.01em] tabular-nums ${tint}`}>
        {value}
      </p>
    </div>
  );
}

export default function AddTransaction({ go }: { go: Go }) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [cards, setCards] = useState<Outstanding[]>([]);
  const [month, setMonth] = useState({ debit: 0, credit: 0 });
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Errors>({});
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

  // Typed structurally rather than as a FormEvent so the ⌘↵ handler can call it
  // with its own keyboard event.
  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const result = toParams(draft);
    // Validation fires on submit and captions the offending fields; Add stays
    // enabled, because a button that greys out without saying why is a puzzle.
    if ("errors" in result) return setInvalid(result.errors);

    const label = `${draft.title.trim()} · ${formatAmount(result.params[0] as number)}`;
    setInvalid({});
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
      <div className="mt-5 grid grid-cols-1 gap-4 nav:grid-cols-2 lg:grid-cols-4">
        <Balance label="In accounts" value={formatAmount(inAccounts)} icon={Bank} />
        <Balance
          label="Card outstanding"
          value={formatAmount(owed)}
          icon={Card}
          tint="text-violet"
        />
        <Balance
          label="Net"
          value={formatAmount(inAccounts - owed)}
          icon={ArrowsLeftRight}
          tint={inAccounts - owed >= 0 ? "text-credit" : "text-danger"}
        />
        <Balance label="This month" value={formatAmount(month.debit)} icon={Calendar} />
      </div>

      {balances.length === 0 && cards.length === 0 ? (
        // Nothing to file a transaction against, so the form would only be a
        // dead end. The empty state replaces it rather than sitting under it.
        <section className={`mt-5 ${card} py-10 text-center`}>
          <p className="text-[13.5px] font-medium">
            Add a bank account or a credit card in Settings first.
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            Transactions need somewhere to go. Takes about ten seconds.
          </p>
          <button onClick={() => go("settings")} className={`${button} mt-4`}>
            Open Settings
          </button>
        </section>
      ) : (
        <section className={`mt-5 ${card}`}>
          <h2 className={h2}>Add a transaction</h2>

          <form
            onSubmit={submit}
            // The note field swallows a plain Enter, and that is the field you
            // are usually in when the entry is finished.
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit(e)}
            className="mt-4 flex flex-col gap-3"
          >
            <Fields
              draft={draft}
              onChange={setDraft}
              errors={invalid}
              accounts={balances.map((a) => ({ id: a.id, label: a.bank }))}
              cards={cards.map((c) => ({ id: c.id, label: cardLabel(c), hint: cardHint(c) }))}
            />
            <div className="flex items-center justify-end gap-3">
              <span className="font-mono text-[11px] text-muted">⌘↵ to save</span>
              <button type="submit" className={button}>
                Add
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
