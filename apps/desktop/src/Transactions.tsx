import { useEffect, useState } from "react";
import { db } from "./db";
import { formatAmount } from "./money";
import { TRANSACTIONS } from "./queries";

type Row = {
  id: number;
  amount: number;
  currency: string;
  title: string;
  note: string | null;
  spent_at: string;
  direction: "debit" | "credit";
  source: string | null;
};

/** "2026-07-31T00:00:00Z" -> "31 Jul 2026". Dates are stored as a UTC midnight
 *  standing for a local calendar day, so read the parts rather than parsing. */
const day = (spentAt: string) =>
  new Date(`${spentAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function Transactions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refetches on every visit because switching tabs remounts the page.
  useEffect(() => {
    (async () => setRows(await (await db).select<Row[]>(TRANSACTIONS)))().catch((e) =>
      setError(String(e)),
    );
  }, []);

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
              {(i === 0 || rows[i - 1].spent_at.slice(0, 10) !== r.spent_at.slice(0, 10)) && (
                <p className="pt-5 pb-1 text-xs uppercase tracking-wide opacity-50">
                  {day(r.spent_at)}
                </p>
              )}
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
