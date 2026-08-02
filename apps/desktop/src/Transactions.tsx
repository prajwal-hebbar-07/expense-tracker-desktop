import { useEffect, useState } from "react";
import { db } from "./db";
import { fromMinor, formatAmount } from "./money";
import { button, iconButton, cancelButton, card, errorBox, h1, page } from "./ui";
import ConfirmDelete from "./ConfirmDelete";
import { ArrowIn, ArrowOut, ArrowsLeftRight, CardIn, CardOut } from "./icons";
import { Fields } from "./TransactionFields";
import { Draft, Errors, cardHint, cardLabel, sourceOf, toParams } from "./transactionForm";
import { outstandingAround } from "./cardBill";
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
  to_account_id: number | null;
  source: string | null;
  destination: string | null;
};
type Account = { id: number; bank: string };
type Card = {
  id: number;
  bank: string;
  name: string | null;
  last4: string | null;
  outstanding: number;
};

/** Two axes, two carriers. Angle carries direction — out, in, both ways — and
 *  hue says what the money did: --debit red left an account, --credit green
 *  arrived in one, --violet is the card, --muted is neither.
 *
 *  A card row keeps the card's hue rather than the direction hue, because it
 *  never moved an account balance — it moved what you owe — and its sign
 *  follows the debt instead: − raises outstanding, signless lowers it. */
// ponytail: five kinds, not six. A card bill payment is a sixth — two rows read
// as one bracketed event — but nothing links the bank leg to the card leg, so
// it renders as an ordinary debit plus an ordinary card credit. Add the kind
// when the link exists; see docs/card-movement.md.
type Kind = "transfer" | "cardDebit" | "cardCredit" | "credit" | "debit";

const kindOf = (r: Row): Kind =>
  r.to_account_id
    ? "transfer"
    : r.card_id
      ? r.direction === "credit"
        ? "cardCredit"
        : "cardDebit"
      : r.direction === "credit"
        ? "credit"
        : "debit";

const GLYPH = {
  transfer: [ArrowsLeftRight, "text-muted"],
  cardDebit: [CardOut, "text-violet"],
  cardCredit: [CardIn, "text-violet"],
  credit: [ArrowIn, "text-credit"],
  debit: [ArrowOut, "text-debit"],
} as const;

/** Signless twice, for two different reasons. A transfer is neither in nor out;
 *  a card credit is money that *did not arrive in an account* — the debt just
 *  went down. `+` and green are reserved for money that actually landed. */
const SIGN = { transfer: "", cardDebit: "−", cardCredit: "", credit: "+", debit: "−" };

const AMOUNT = {
  transfer: "text-muted",
  cardDebit: "text-violet",
  // The pill is what keeps a signless violet figure from reading as a plain
  // violet charge — the two states are one character apart otherwise.
  cardCredit: "rounded-md bg-violet-weak px-1.5 py-0.5 text-violet",
  credit: "text-credit",
  // Inked, never filled. --debit lands on most of the list, and a tint behind
  // every other row is the glare the palette exists to prevent — it is also
  // what keeps the delete-confirm band the only red *block* on the page.
  debit: "text-debit",
};

/** 4485300 -> "44,853". No symbol and no paise: this runs inside a 12.5px meta
 *  line as prose ("outstanding 46,652 → 44,853"), not as a money column. */
const grouped = (paise: number) => Math.round(paise / 100).toLocaleString("en-IN");

/** "2026-07-31T00:00:00Z" -> "31 Jul 2026". Dates are stored as a UTC midnight
 *  standing for a local calendar day, so read the parts rather than parsing. */
const day = (spentAt: string) =>
  new Date(`${spentAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// A stored transfer is a debit row with a destination, so the editor has to be
// told it is a transfer again — nothing in `direction` says so.
const draftOf = (r: Row): Draft => ({
  direction: r.to_account_id ? "transfer" : r.direction,
  amount: fromMinor(r.amount),
  title: r.title,
  note: r.note ?? "",
  date: r.spent_at.slice(0, 10),
  source: sourceOf(r.account_id, r.card_id),
  to: r.to_account_id ? String(r.to_account_id) : "",
});

export default function Transactions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invalid, setInvalid] = useState<Errors>({});
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
    // Errors land under the fields that caused them, not in a page-level box
    // above a form the user is already looking at.
    if ("errors" in result) return setInvalid(result.errors);
    setInvalid({});

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
    cards: cards.map((c) => ({ id: c.id, label: cardLabel(c), hint: cardHint(c) })),
  };

  // One walk for the whole list rather than a lookup per row: it has to run in
  // list order to be correct at all.
  const owed = outstandingAround(rows, cards);

  return (
    <div className={page}>
      <h1 className={h1}>Transactions</h1>

      {error && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className={`mt-5 ${card} py-10 text-center`}>
          <p className="text-[13.5px] font-medium">Nothing logged yet.</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Your first entry shows up here, newest first, grouped by day.
          </p>
        </div>
      ) : (
        <ul className={`mt-5 divide-y divide-line ${card} py-1`}>
          {rows.map((r, i) => (
            <li key={r.id}>
              {/* One heading per date, since the query is already sorted by it. */}
              {(i === 0 ||
                rows[i - 1].spent_at.slice(0, 10) !== r.spent_at.slice(0, 10)) && (
                <p className="pt-5 pb-1 text-xs tracking-wide text-muted uppercase">
                  {day(r.spent_at)}
                </p>
              )}

              {editing === r.id && draft ? (
                <div className="flex flex-col gap-3 py-3">
                  <Fields draft={draft} onChange={setDraft} errors={invalid} {...options} />
                  <div className="flex justify-end gap-2">
                    <button className={cancelButton} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button className={button} onClick={() => save(r.id)}>
                      Save
                    </button>
                  </div>
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
                <div className="group grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5">
                  {/* Leading slot: direction read by angle before it is read by
                      colour. A transfer takes the two-way arrow — it is a third
                      kind of movement, not a debit with the sign filed off — and
                      a card row takes a card body with the arrow leaving or
                      entering it. */}
                  {(() => {
                    const [Glyph, tint] = GLYPH[kindOf(r)];
                    return <Glyph className={`size-[18px] ${tint}`} />;
                  })()}

                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-medium">{r.title}</span>
                    <span className="truncate text-[12.5px] text-muted">
                      {/* Louder, not bigger. On a card row the thing you want
                          after "how much" is *which card owes it*, and one
                          weight step inside the existing meta line buys that
                          without a chip, a second line or a fourth column. */}
                      <span className={r.card_id ? "font-medium text-ink" : ""}>
                        {r.source ?? "unassigned"}
                      </span>
                      {/* The text glyph, not the 24px icon: it scales and
                          baselines with the 12.5px line it sits in, where the
                          stroke icon would push the row to 60px. */}
                      {r.destination && ` → ${r.destination}`}
                      {/* Before the note, not after: this is the sentence a
                          refund actually makes, so it is the clause worth
                          keeping when the line truncates. */}
                      {kindOf(r) === "cardCredit" &&
                        owed.has(r.id) &&
                        ` · outstanding ${grouped(owed.get(r.id)!.before)} → ${grouped(
                          owed.get(r.id)!.after,
                        )}`}
                      {r.note && ` · ${r.note}`}
                    </span>
                  </span>

                  <span className="flex items-center gap-2">
                    {/* A transfer gets no sign and drops to --muted: signless
                        next to signed siblings only reads as broken, and the
                        quieter weight makes the difference deliberate rather
                        than missing. The money is still yours. */}
                    <span
                      className={`text-[15px] font-medium tabular-nums ${AMOUNT[kindOf(r)]}`}
                    >
                      {SIGN[kindOf(r)]}
                      {formatAmount(r.amount, r.currency)}
                    </span>
                    {/* Revealed on hover, but never hidden from the keyboard —
                        `focus-within` is what keeps them tabbable. */}
                    <span className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        className={iconButton}
                        onClick={() => {
                          setPending(null);
                          setInvalid({});
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
                    </span>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
