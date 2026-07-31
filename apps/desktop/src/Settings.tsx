import { useEffect, useState } from "react";
import { db } from "./db";
import { toMinor, fromMinor, formatAmount } from "./money";
import { input, button, iconButton, cancelButton, dangerButton } from "./ui";

type Account = { id: number; bank: string; balance: number; currency: string };
type Card = { id: number; bank: string; name: string | null; last4: string | null };
type Pending = { table: "account" | "card"; id: number };

/**
 * Two-step delete guard. Deliberately *not* window.confirm(): wry's WKUIDelegate
 * implements no runJavaScriptConfirmPanel, so window.confirm() returns false
 * immediately without showing a dialog and the delete would never fire.
 *
 * Cancel is focused and sits left of Delete, so a stray Enter or a second click
 * in the same spot as the first cancels rather than destroys.
 */
function ConfirmDelete({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-3 rounded-lg bg-red-500/10 px-3 py-2">
      <span className="flex-1 text-sm">
        Delete <span className="font-medium">{label}</span>? This cannot be undone.
      </span>
      <button autoFocus className={cancelButton} onClick={onCancel}>
        Cancel
      </button>
      <button className={dangerButton} onClick={onConfirm}>
        Delete
      </button>
    </div>
  );
}

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
        "SELECT id, bank, name, last4 FROM card ORDER BY bank, name",
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

    run(async () => {
      await (await db).execute(
        "INSERT INTO card (bank, name, last4) VALUES ($1, $2, $3)",
        [cardBank.trim(), cardName.trim() || null, last4 || null],
      );
      setCardBank("");
      setCardName("");
      setLast4("");
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
    <div className="mx-auto w-full max-w-2xl px-6 py-10 text-left">
      <h1 className="text-3xl font-semibold">Settings</h1>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-medium">Bank accounts</h2>
        <p className="mt-1 text-sm opacity-60">
          Opening balances. Transactions adjust them — the live figure is on that screen.
        </p>

        <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              {isPending("account", a.id) ? (
                <ConfirmDelete
                  label={`${a.bank} — ${formatAmount(a.balance, a.currency)}`}
                  onCancel={() => setPending(null)}
                  onConfirm={confirmDelete}
                />
              ) : editingId === a.id ? (
                <>
                  <span className="flex-1">{a.bank}</span>
                  <input
                    autoFocus
                    className={`${input} w-32 text-right`}
                    value={editValue}
                    onChange={(e) => setEditValue(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveBalance(a.id)}
                  />
                  <button className={iconButton} onClick={() => saveBalance(a.id)}>
                    Save
                  </button>
                  <button className={iconButton} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">{a.bank}</span>
                  <span className="tabular-nums">
                    {formatAmount(a.balance, a.currency)}
                  </span>
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
                </>
              )}
            </li>
          ))}
        </ul>

        {accounts.length > 0 && (
          <p className="flex justify-between border-t border-black/20 py-3 font-medium dark:border-white/20">
            <span>Total opening</span>
            <span className="tabular-nums">{formatAmount(total)}</span>
          </p>
        )}

        <form onSubmit={addAccount} className="mt-4 flex flex-wrap gap-2">
          <input
            className={`${input} flex-1 min-w-40`}
            placeholder="Bank (e.g. HDFC)"
            value={bank}
            onChange={(e) => setBank(e.currentTarget.value)}
          />
          <input
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
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-medium">Credit cards</h2>

        <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
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
                  <span className="flex-1">
                    {c.bank}
                    {c.name && <span className="opacity-70"> {c.name}</span>}
                    {c.last4 && (
                      <span className="ml-2 opacity-50 tabular-nums">••••{c.last4}</span>
                    )}
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

        <form onSubmit={addCard} className="mt-4 flex flex-wrap gap-2">
          <input
            className={`${input} flex-1 min-w-32`}
            placeholder="Bank (e.g. HDFC)"
            value={cardBank}
            onChange={(e) => setCardBank(e.currentTarget.value)}
          />
          <input
            className={`${input} flex-1 min-w-32`}
            placeholder="Card (optional)"
            value={cardName}
            onChange={(e) => setCardName(e.currentTarget.value)}
          />
          <input
            className={`${input} w-24 text-center`}
            placeholder="Last 4"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.currentTarget.value)}
          />
          <button type="submit" className={button}>
            Add card
          </button>
        </form>
      </section>
    </div>
  );
}
