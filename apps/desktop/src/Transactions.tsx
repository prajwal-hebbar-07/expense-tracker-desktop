import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CLOUD_URL, db, getSettings } from "./db";
import { fromMinor, formatAmount } from "./money";
import {
  button,
  iconButton,
  cancelButton,
  card,
  errorBox,
  h1,
  lede,
  noticeBox,
  page,
} from "./ui";
import ConfirmDelete from "./ConfirmDelete";
import { ArrowIn, ArrowOut, ArrowsLeftRight, CardIn, CardOut } from "./icons";
import { Fields } from "./TransactionFields";
import { Draft, Errors, cardHint, cardLabel, sourceOf, toParams } from "./transactionForm";
import { outstandingAround } from "./cardBill";
import { batches, buildPrompt, parseCategories } from "./categorize";
import {
  TRANSACTIONS,
  UPDATE_TRANSACTION,
  DELETE_TRANSACTION,
  SET_CATEGORY,
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
  /** '' until a categorisation run files it — see docs/expense-categories.md. */
  category: string;
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
  transfer: [ArrowsLeftRight, "bg-hover text-muted"],
  cardDebit: [CardOut, "bg-violet-weak text-violet"],
  cardCredit: [CardIn, "bg-violet-weak text-violet"],
  credit: [ArrowIn, "bg-credit-weak text-credit"],
  debit: [ArrowOut, "bg-debit-weak text-debit"],
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
  cardCredit: "rounded-lg bg-violet-weak px-1.5 py-0.5 text-violet",
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

/** The two readings of the same list. Ledger is the ledger: every row, newest
 *  first, uncategorised ones included — which is where a new transaction lives
 *  until the next run files it. Categories drops what has no category, because
 *  an "Uncategorised" group here would just be the ledger's tail printed twice.
 */
type View = "ledger" | "categories";

/** Categorised rows only, grouped by category, biggest spend first — the order
 *  that answers "where did it go". Rows arrive newest-first and `sort` is
 *  stable, so each group keeps its dates in order. */
function byCategory(rows: Row[]) {
  const total = new Map<string, number>();
  for (const r of rows) {
    if (r.category) total.set(r.category, (total.get(r.category) ?? 0) + r.amount);
  }
  const list = rows
    .filter((r) => r.category)
    .sort(
      (a, b) =>
        total.get(b.category)! - total.get(a.category)! ||
        a.category.localeCompare(b.category),
    );
  return { list, total };
}

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
  const [view, setView] = useState<View>("ledger");
  /** The progress line while a run is in flight, and the button's disabled flag. */
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  /** Files every uncategorised row on screen, on demand and never on its own:
   *  it spends tokens on a paid subscription, and a page that categorised
   *  itself on mount would spend them on every visit.
   *
   *  Transfers are skipped — moving your own money between your own accounts
   *  is not spending, so there is no category it belongs in — which also means
   *  a transfer stays out of the Categories view for good, not until the next
   *  run. Rows are written batch by batch, so a run that fails halfway keeps
   *  what it had already filed; pressing the button again picks up the rest.
   */
  function categorise() {
    const todo = rows.filter((r) => !r.category && !r.to_account_id);
    setError(null);
    setNote(null);
    if (todo.length === 0) {
      setNote("Everything is already categorised.");
      return;
    }

    setBusy(`Categorising 0 of ${todo.length}…`);
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.model) {
          throw new Error("Pick an AI model in Settings before categorising.");
        }
        const baseUrl = settings.base_url || CLOUD_URL;
        const apiKey = settings.api_key ?? "";
        const conn = await db;

        let done = 0;
        for (const batch of batches(todo)) {
          const reply = await invoke<string>("ollama_json", {
            baseUrl,
            model: settings.model,
            apiKey,
            prompt: buildPrompt(batch),
          });
          for (const [id, category] of parseCategories(reply, batch)) {
            await conn.execute(SET_CATEGORY, [category, id]);
          }
          done += batch.length;
          setBusy(`Categorising ${done} of ${todo.length}…`);
        }
        setNote(`Categorised ${done} transaction${done === 1 ? "" : "s"}.`);
        setView("categories");
      } finally {
        // In `finally` because a run that dies on batch three has still
        // written batches one and two, and the list has to show them.
        await refresh().catch(() => {});
      }
    })()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(null));
  }

  const options = {
    accounts: accounts.map((a) => ({ id: a.id, label: a.bank })),
    cards: cards.map((c) => ({ id: c.id, label: cardLabel(c), hint: cardHint(c) })),
  };

  // One walk for the whole list rather than a lookup per row: it has to run in
  // list order to be correct at all.
  const owed = outstandingAround(rows, cards);

  // Same rows, same components, two orders — the view only decides what the
  // list is sorted by and what the heading above a run of rows says.
  const { list: filed, total } = byCategory(rows);
  const list = view === "ledger" ? rows : filed;
  const headingOf = (r: Row) => (view === "ledger" ? day(r.spent_at) : r.category);
  const uncategorised = rows.filter((r) => !r.category && !r.to_account_id).length;

  return (
    <div className={page}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={h1}>Transactions</h1>
          <p className={lede}>Review, correct, or remove every movement in your ledger.</p>
        </div>
        {/* On demand, never on a timer or on mount: it spends tokens. */}
        <button className={button} onClick={categorise} disabled={busy !== null}>
          {busy ?? `Categorise${uncategorised ? ` ${uncategorised}` : ""}`}
        </button>
      </div>

      {/* Two readings of one list, so a segmented control rather than a second
          nav item — nothing here is a different screen. */}
      <div className="mt-4 flex w-fit gap-1 rounded-xl bg-hover p-1">
        {(["ledger", "categories"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`h-8 cursor-pointer rounded-lg px-3 text-[12.5px] transition-colors ${
              view === v ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink"
            }`}
          >
            {v === "ledger" ? "Ledger" : "Categories"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}
      {note && !error && <p className={noticeBox}>{note}</p>}

      {list.length === 0 ? (
        <div className={`mt-5 ${card} py-10 text-center`}>
          <p className="text-[13.5px] font-medium">
            {view === "categories" ? "Nothing categorised yet." : "Nothing logged yet."}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            {view === "categories"
              ? "Press Categorise and the AI model files what is in your ledger."
              : "Your first entry shows up here, newest first, grouped by day."}
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {list.map((r, i) => (
            <li key={r.id}>
              {/* One heading per run of rows — a date in the ledger, a category
                  in the other view. Both orders are already sorted by it. */}
              {(i === 0 || headingOf(list[i - 1]) !== headingOf(r)) && (
                <p
                  className={`${i === 0 ? "pt-0" : "pt-4"} px-1 pb-1.5 text-[11px] font-medium tracking-[0.07em] text-muted uppercase`}
                >
                  <span className="rounded-full bg-hover px-2.5 py-1">{headingOf(r)}</span>
                  {/* What the group cost, in the same prose the outstanding
                      line uses — the reason to group at all. */}
                  {view === "categories" && (
                    <span className="ml-2 tabular-nums">{grouped(total.get(r.category)!)}</span>
                  )}
                </p>
              )}

              {editing === r.id && draft ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
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
                <div className="flex rounded-2xl border border-line bg-surface p-3 shadow-card">
                  <ConfirmDelete
                    label={`${r.title} — ${formatAmount(r.amount, r.currency)}`}
                    onCancel={() => setPending(null)}
                    onConfirm={confirmDelete}
                  />
                </div>
              ) : (
                <div className="group grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card transition-colors hover:border-muted">
                  {/* Leading slot: direction read by angle before it is read by
                      colour. A transfer takes the two-way arrow — it is a third
                      kind of movement, not a debit with the sign filed off — and
                      a card row takes a card body with the arrow leaving or
                      entering it. */}
                  {(() => {
                    const [Glyph, tone] = GLYPH[kindOf(r)];
                    return (
                      <span className={`grid size-9 place-items-center rounded-xl ${tone}`}>
                        <Glyph className="size-[18px]" />
                      </span>
                    );
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

                  <span className="flex flex-col items-end gap-1 nav:flex-row nav:items-center nav:gap-2">
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
                    {/* Always visible in narrow touch layouts; wider pointer
                        layouts reveal them on hover or keyboard focus. */}
                    <span className="flex gap-1 opacity-100 transition-opacity nav:opacity-0 nav:group-focus-within:opacity-100 nav:group-hover:opacity-100">
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
