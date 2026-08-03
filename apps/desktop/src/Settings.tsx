import { useEffect, useState } from "react";
import { db } from "./db";
import { toMinor, fromMinor, formatAmount } from "./money";
import { input, button, iconButton, card, errorBox, h1, h2, lede, page } from "./ui";
import ConfirmDelete from "./ConfirmDelete";
import { Bank, Card as CardIcon } from "./icons";

type Account = { id: number; bank: string; balance: number; currency: string };
type Card = {
  id: number;
  bank: string;
  name: string | null;
  last4: string | null;
  due_day: number | null;
};
type Pending = { table: "account" | "card"; id: number };

export default function Settings() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  // Add-account form
  const [bank, setBank] = useState("");
  const [balance, setBalance] = useState("");

  // Add-card form
  const [cardBank, setCardBank] = useState("");
  const [cardName, setCardName] = useState("");
  const [last4, setLast4] = useState("");
  const [dueDay, setDueDay] = useState("");

  // Inline balance edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  async function refresh() {
    const conn = await db;
    setAccounts(
      await conn.select<Account[]>(
        "SELECT id, bank, balance, currency FROM account ORDER BY bank",
      ),
    );
    setCards(
      await conn.select<Card[]>(
        "SELECT id, bank, name, last4, due_day FROM card ORDER BY bank, name",
      ),
    );
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);

  // Escape always backs out of a pending delete.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  // Every handler routes through this so a rejected promise surfaces in the UI
  // instead of becoming a silent unhandled rejection.
  function run(fn: () => Promise<void>) {
    setError(null);
    fn()
      .then(refresh)
      .catch((e) => setError(String(e)));
  }

  function addAccount(e: React.FormEvent) {
    e.preventDefault();
    const minor = toMinor(balance);
    if (!bank.trim()) return setError("Bank is required.");
    if (minor === null) return setError(`"${balance}" is not a valid amount.`);

    run(async () => {
      await (await db).execute(
        "INSERT INTO account (bank, balance, currency) VALUES ($1, $2, $3)",
        [bank.trim(), minor, "INR"],
      );
      setBank("");
      setBalance("");
    });
  }

  function saveBalance(id: number) {
    const minor = toMinor(editValue);
    if (minor === null) return setError(`"${editValue}" is not a valid amount.`);

    run(async () => {
      // updated_at's default only fires on INSERT, so set it explicitly here.
      await (await db).execute(
        "UPDATE account SET balance = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = $2",
        [minor, id],
      );
      setEditingId(null);
    });
  }

  function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!cardBank.trim()) return setError("Bank is required.");
    if (last4 && !/^\d{4}$/.test(last4)) return setError("Last 4 must be exactly 4 digits.");
    // Checked here as well as by the column CHECK: a violated CHECK surfaces as
    // a raw SQLite string in the page-level error box, which is not a sentence.
    if (dueDay && !/^([1-9]|[12]\d|3[01])$/.test(dueDay))
      return setError("Due day must be a day of the month, 1 to 31.");

    run(async () => {
      await (await db).execute(
        "INSERT INTO card (bank, name, last4, due_day) VALUES ($1, $2, $3, $4)",
        [cardBank.trim(), cardName.trim() || null, last4 || null, dueDay ? Number(dueDay) : null],
      );
      setCardBank("");
      setCardName("");
      setLast4("");
      setDueDay("");
    });
  }

  /** Only ever called from ConfirmDelete's second click. */
  function confirmDelete() {
    if (!pending) return;
    const { table, id } = pending;
    run(async () => {
      // `table` comes from this module's own Pending union, never user input.
      await (await db).execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
      setPending(null);
    });
  }

  const isPending = (table: Pending["table"], id: number) =>
    pending?.table === table && pending.id === id;

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className={page}>
      <h1 className={h1}>Settings</h1>
      <p className={lede}>Manage the accounts and cards that keep your ledger accurate.</p>

      {error && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}

      <section className={`mt-8 ${card}`}>
        <div className="flex items-center gap-2">
          <h2 className={h2}>Bank accounts</h2>
          <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-muted tabular-nums">
            {accounts.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Opening balances. Transactions adjust them — the live figure is on that screen.
        </p>

        {accounts.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line bg-field p-4 text-sm text-muted">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-weak text-accent">
              <Bank className="size-[18px]" />
            </span>
            No bank accounts yet. Add the account you use most first.
          </div>
        ) : (
          <ul className="mt-4 grid gap-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-field p-3"
              >
                {isPending("account", a.id) ? (
                  <ConfirmDelete
                    label={`${a.bank} — ${formatAmount(a.balance, a.currency)}`}
                    onCancel={() => setPending(null)}
                    onConfirm={confirmDelete}
                  />
                ) : (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-weak text-accent">
                      <Bank className="size-[18px]" />
                    </span>
                    <span className="min-w-28 flex-1">
                      <span className="block truncate font-medium">{a.bank}</span>
                      <span className="block text-xs text-muted">Bank account · opening balance</span>
                    </span>
                    {editingId === a.id ? (
                      <>
                        <input
                          autoFocus
                          aria-label={`Opening balance for ${a.bank}`}
                          className={`${input} w-32 text-right`}
                          value={editValue}
                          onChange={(e) => setEditValue(e.currentTarget.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveBalance(a.id)}
                        />
                        <span className="ml-auto flex gap-1">
                          <button className={iconButton} onClick={() => saveBalance(a.id)}>
                            Save
                          </button>
                          <button className={iconButton} onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatAmount(a.balance, a.currency)}
                        </span>
                        <span className="flex gap-1">
                          <button
                            className={iconButton}
                            onClick={() => {
                              setEditingId(a.id);
                              setEditValue(fromMinor(a.balance));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className={iconButton}
                            onClick={() => {
                              setEditingId(null);
                              setPending({ table: "account", id: a.id });
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {accounts.length > 0 && (
          <p className="mt-3 flex justify-between rounded-xl bg-accent-weak px-3 py-2.5 font-medium">
            <span>Total opening</span>
            <span className="tabular-nums">{formatAmount(total)}</span>
          </p>
        )}

        <div className="mt-5 border-t border-line pt-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">New account</p>
          <form onSubmit={addAccount} className="mt-3 flex flex-wrap gap-2">
            <input
              aria-label="Bank name"
              className={`${input} flex-1 min-w-40`}
              placeholder="Bank (e.g. HDFC)"
              value={bank}
              onChange={(e) => setBank(e.currentTarget.value)}
            />
            <input
              aria-label="Opening balance"
              className={`${input} w-40 text-right`}
              placeholder="Opening balance"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.currentTarget.value)}
            />
            <button type="submit" className={button}>
              Add account
            </button>
          </form>
        </div>
      </section>

      <section className={`mt-6 ${card}`}>
        <div className="flex items-center gap-2">
          <h2 className={h2}>Credit cards</h2>
          <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-muted tabular-nums">
            {cards.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">Names, last four digits, and bill due days.</p>

        {cards.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line bg-field p-4 text-sm text-muted">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-weak text-violet">
              <CardIcon className="size-[18px]" />
            </span>
            No credit cards added. Skip this if you only use bank accounts.
          </div>
        ) : (
          <ul className="mt-4 grid gap-2">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-field p-3"
              >
                {isPending("card", c.id) ? (
                  <ConfirmDelete
                    label={[c.bank, c.name, c.last4 && `••••${c.last4}`]
                      .filter(Boolean)
                      .join(" ")}
                    onCancel={() => setPending(null)}
                    onConfirm={confirmDelete}
                  />
                ) : (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-weak text-violet">
                      <CardIcon className="size-[18px]" />
                    </span>
                    <span className="min-w-32 flex-1">
                      <span className="block truncate font-medium">{c.name || c.bank}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.name ? c.bank : "Credit card"}
                        {c.last4 && <span className="tabular-nums"> · •••• {c.last4}</span>}
                        {c.due_day !== null && <span> · due day {c.due_day}</span>}
                      </span>
                    </span>
                    <button
                      className={iconButton}
                      onClick={() => setPending({ table: "card", id: c.id })}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 border-t border-line pt-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">New card</p>
          <form onSubmit={addCard} className="mt-3 flex flex-wrap gap-2">
            <input
              aria-label="Card bank"
              className={`${input} flex-1 min-w-32`}
              placeholder="Bank (e.g. HDFC)"
              value={cardBank}
              onChange={(e) => setCardBank(e.currentTarget.value)}
            />
            <input
              aria-label="Card name"
              className={`${input} flex-1 min-w-32`}
              placeholder="Card (optional)"
              value={cardName}
              onChange={(e) => setCardName(e.currentTarget.value)}
            />
            <input
              aria-label="Last four digits"
              className={`${input} w-24 text-center`}
              placeholder="Last 4"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.currentTarget.value)}
            />
            {/* A day of the month, not a date — the statement falls on the same
                day every cycle. Optional: no day means the tile shows no due
                line, which beats showing a made-up one. */}
            <input
              aria-label="Due day"
              className={`${input} w-24 text-center`}
              placeholder="Due day"
              inputMode="numeric"
              maxLength={2}
              value={dueDay}
              onChange={(e) => setDueDay(e.currentTarget.value)}
            />
            <button type="submit" className={button}>
              Add card
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
