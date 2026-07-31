import { useEffect, useState } from "react";
import { db } from "./db";
import { fromMinor, formatAmount } from "./money";
import { button, iconButton, cancelButton } from "./ui";
import ConfirmDelete from "./ConfirmDelete";
import { Draft, Fields, cardLabel, sourceOf, toParams } from "./transactionForm";
import {
  TRANSACTIONS,
  UPDATE_TRANSACTION,
  DELETE_TRANSACTION,
  ACCOUNT_BALANCES,
  CARD_OUTSTANDING,
} from "./queries";

type Row = {
  id: number;
  amount: number;
  currency: string;
  title: string;
  note: string | null;
  spent_at: string;
  direction: "debit" | "credit";
  account_id: number | null;
  card_id: number | null;
  source: string | null;
};
type Account = { id: number; bank: string };
type Card = { id: number; bank: string; name: string | null; last4: string | null };

/** "2026-07-31T00:00:00Z" -> "31 Jul 2026". Dates are stored as a UTC midnight
 *  standing for a local calendar day, so read the parts rather than parsing. */
const day = (spentAt: string) =>
  new Date(`${spentAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const draftOf = (r: Row): Draft => ({
  direction: r.direction,
  amount: fromMinor(r.amount),
  title: r.title,
  note: r.note ?? "",
  date: r.spent_at.slice(0, 10),
  source: sourceOf(r.account_id, r.card_id),
});

export default function Transactions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  async function refresh() {
    const conn = await db;
    setRows(await conn.select<Row[]>(TRANSACTIONS));
    // The editor's source picker needs the same options the add form offers.
    setAccounts(await conn.select<Account[]>(ACCOUNT_BALANCES));
    setCards(await conn.select<Card[]>(CARD_OUTSTANDING));
  }

  // Refetches on every visit because switching tabs remounts the page.
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);

  // Escape backs out of either pending state, so neither can trap the row.
  useEffect(() => {
    if (pending === null && editing === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPending(null);
      setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, editing]);

  function run(fn: () => Promise<void>) {
    setError(null);
    fn()
      .then(refresh)
      .catch((e) => setError(String(e)));
  }

  function save(id: number) {
    if (!draft) return;
    const result = toParams(draft);
    if ("error" in result) return setError(result.error);

    run(async () => {
      await (await db).execute(UPDATE_TRANSACTION, [...result.params, id]);
      setEditing(null);
      setDraft(null);
    });
  }

  /** Only ever called from ConfirmDelete's second click. */
  function confirmDelete() {
    if (pending === null) return;
    run(async () => {
      await (await db).execute(DELETE_TRANSACTION, [pending]);
      setPending(null);
    });
  }

  const options = {
    accounts: accounts.map((a) => ({ id: a.id, label: a.bank })),
    cards: cards.map((c) => ({ id: c.id, label: cardLabel(c) })),
  };

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

      {rows.length === 0 ? (
        <p className="mt-6 text-sm opacity-60">
          Nothing recorded yet. Add one from the Add tab.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
          {rows.map((r, i) => (
            <li key={r.id}>
              {/* One heading per date, since the query is already sorted by it. */}
              {(i === 0 ||
                rows[i - 1].spent_at.slice(0, 10) !== r.spent_at.slice(0, 10)) && (
                <p className="pt-5 pb-1 text-xs uppercase tracking-wide opacity-50">
                  {day(r.spent_at)}
                </p>
              )}

              {editing === r.id && draft ? (
                <div className="flex flex-wrap gap-2 py-3">
                  <Fields draft={draft} onChange={setDraft} {...options} />
                  <button className={button} onClick={() => save(r.id)}>
                    Save
                  </button>
                  <button className={cancelButton} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              ) : pending === r.id ? (
                <div className="flex py-3">
                  <ConfirmDelete
                    label={`${r.title} — ${formatAmount(r.amount, r.currency)}`}
                    onCancel={() => setPending(null)}
                    onConfirm={confirmDelete}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 py-3">
                  <span className="flex-1">
                    {r.title}
                    <span className="ml-2 text-sm opacity-50">
                      {r.source ?? "unassigned"}
                    </span>
                    {r.note && <span className="block text-sm opacity-60">{r.note}</span>}
                  </span>
                  <span
                    className={`tabular-nums ${
                      r.direction === "credit" ? "text-green-600 dark:text-green-400" : ""
                    }`}
                  >
                    {r.direction === "credit" ? "+" : "−"}
                    {formatAmount(r.amount, r.currency)}
                  </span>
                  <button
                    className={iconButton}
                    onClick={() => {
                      setPending(null);
                      setEditing(r.id);
                      setDraft(draftOf(r));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className={iconButton}
                    onClick={() => {
                      setEditing(null);
                      setPending(r.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
