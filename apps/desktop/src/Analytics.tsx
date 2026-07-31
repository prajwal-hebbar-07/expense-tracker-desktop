import { useState } from "react";
import { formatAmount, formatAmountRound } from "./money";
import { card, errorBox, h1, h2, input, pageWide } from "./ui";
import Stat from "./Stat";
import { ArrowsUpDown, Calendar, ChevronDown, TrendUp, Wallet } from "./icons";
import {
  Bucket,
  FEED,
  Period,
  Slice,
  TODAY,
  Window,
  biggest,
  buckets,
  daysBetween,
  previous,
  rank,
  totals,
  within,
  windowFor,
} from "./analyticsFeed";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "range", label: "Range" },
];

/** "+12% vs previous" — or nothing, when there is no previous figure to divide
 *  by. A percentage against zero is Infinity, which is not a comparison. */
function delta(now: number, before: number): string | undefined {
  if (!before) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}% vs prev`;
}

/** Vertical bars, one series, so no legend — the card title names it. Heights
 *  are percentages of the tallest bar; the axis is the ₹ label on the left. */
function Bars({ data }: { data: Bucket[] }) {
  const max = Math.max(...data.map((b) => b.amount), 1);
  // Past ~20 bars the labels collide, so only every nth one is drawn.
  const every = Math.ceil(data.length / 12);

  return (
    <div className="mt-4">
      <div className="relative">
        {/* Recessive scale: without it a month with rent in it reads as one bar
            and 30 slivers, with nothing to measure the slivers against. */}
        {[0, 25, 50, 75].map((pct) => (
          <div
            key={pct}
            className="pointer-events-none absolute inset-x-0 border-t border-line"
            style={{ top: `${pct}%` }}
          >
            {pct === 0 && (
              <span className="absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-muted tabular-nums">
                {formatAmountRound(max)}
              </span>
            )}
          </div>
        ))}
        <div className="mb-5 flex h-44 items-end gap-[2px]" role="img" aria-label="Spend per period">
        {data.map((b, i) => (
          <div key={b.from} className="group relative flex h-full flex-1 items-end">
            {/* Tooltip is CSS-only: no hover state to get stuck in a stale render. */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block">
              <span className="text-muted">{b.label}</span>{" "}
              <span className="font-medium tabular-nums">{formatAmount(b.amount)}</span>
            </div>
            <div
              className="w-full rounded-t bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max((b.amount / max) * 100, b.amount ? 2 : 0)}%` }}
            />
            {i % every === 0 && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted">
                {b.label}
              </span>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

/** Ranked horizontal bars. Identity is carried by the row label, so one hue is
 *  correct here — a colour per category would encode nothing. */
function Ranked({ rows, total }: { rows: Slice[]; total: number }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="mt-4 space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              {formatAmount(r.amount)}
              <span className="ml-2 text-xs text-muted">
                {total ? Math.round((r.amount / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-ink/5">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${(r.amount / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Two series, so a legend is mandatory. The pair is validated for colour-vision
 *  separation — see the --series-b note in App.css. */
function Split({ account, cardTotal }: { account: number; cardTotal: number }) {
  const total = account + cardTotal || 1;
  return (
    <div className="mt-4">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        <div className="bg-accent" style={{ width: `${(account / total) * 100}%` }} />
        <div className="bg-series-b" style={{ width: `${(cardTotal / total) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-accent" />
          <span className="flex-1">Bank accounts</span>
          <span className="tabular-nums">{formatAmount(account)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-series-b" />
          <span className="flex-1">Credit cards</span>
          <span className="tabular-nums">{formatAmount(cardTotal)}</span>
        </li>
      </ul>
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState<Period>("month");
  /** Periods back from today. Reset whenever the period changes, because
   *  "3 weeks ago" and "3 years ago" are not the same place. */
  const [offset, setOffset] = useState(0);
  const [range, setRange] = useState({ from: "2026-05-01", to: "2026-07-31" });

  const invalid = period === "range" && range.from > range.to;
  const full: Window =
    period === "range"
      ? { ...range, label: `${range.from} → ${range.to}` }
      : windowFor(period, offset);

  // Never average or compare across days that have not happened yet. A year in
  // progress is 212 days of spending, not 365, and holding it against a whole
  // previous year reports a saving the user did not make.
  const inProgress = full.to > TODAY;
  const win: Window = inProgress ? { ...full, to: TODAY } : full;
  const prev = inProgress
    ? previous("range", win, offset) // same elapsed length, ending before it
    : previous(period, full, offset);

  const rows = within(FEED, win);
  const now = totals(rows, win);
  const before = totals(within(FEED, prev), prev);

  const byCategory = rank(rows, "category");
  const bySource = rank(rows, "source", 4);
  const onAccounts = rows
    .filter((t) => t.direction === "debit" && t.kind === "account")
    .reduce((s, t) => s + t.amount, 0);
  const onCards = now.spent - onAccounts;

  return (
    <div className={pageWide}>
      <h1 className={h1}>Analytics</h1>
      <p className="mt-1 text-sm text-muted">
        Sample data — this page reads a consolidated feed, not the ledger.
      </p>

      {/* Period picker, then the window it resolved to. One row above the
          charts, per the filters convention. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPeriod(p.id);
                setOffset(0);
              }}
              aria-pressed={period === p.id}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-colors ${
                period === p.id
                  ? "bg-accent/15 font-medium text-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === "range" ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={`${input} w-40`}
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.currentTarget.value })}
            />
            <span className="text-muted">→</span>
            <input
              type="date"
              className={`${input} w-40`}
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.currentTarget.value })}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset(offset + 1)}
              aria-label="Previous period"
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <ChevronDown className="size-4 rotate-90" />
            </button>
            <span className="min-w-40 text-center text-sm font-medium">{win.label}</span>
            <button
              onClick={() => setOffset(Math.max(0, offset - 1))}
              disabled={offset === 0}
              aria-label="Next period"
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronDown className="size-4 -rotate-90" />
            </button>
          </div>
        )}
      </div>

      {invalid ? (
        <p role="alert" className={errorBox}>
          The start date is after the end date.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat
              label="Spent"
              value={formatAmountRound(now.spent)}
              hint={delta(now.spent, before.spent)}
              icon={ArrowsUpDown}
              tint="text-accent"
            />
            <Stat
              label="Received"
              value={formatAmountRound(now.received)}
              hint={delta(now.received, before.received)}
              icon={Wallet}
              tint="text-credit"
            />
            <Stat
              label="Net"
              value={formatAmountRound(now.net)}
              hint={now.net >= 0 ? "saved" : "overspent"}
              icon={TrendUp}
              tint={now.net >= 0 ? "text-credit" : "text-danger"}
            />
            <Stat
              label="Per day"
              value={formatAmountRound(now.perDay)}
              hint={`over ${daysBetween(win.from, win.to)} days`}
              icon={Calendar}
              tint="text-violet"
            />
          </div>

          <section className={`mt-6 ${card}`}>
            <h2 className={h2}>Spend over time</h2>
            <Bars data={buckets(rows, win)} />
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className={card}>
              <h2 className={h2}>Where it went</h2>
              <Ranked rows={byCategory} total={now.spent} />
            </section>

            <div className="space-y-6">
              <section className={card}>
                <h2 className={h2}>Accounts vs cards</h2>
                <Split account={onAccounts} cardTotal={onCards} />
              </section>

              <section className={card}>
                <h2 className={h2}>Top sources</h2>
                <Ranked rows={bySource} total={now.spent} />
              </section>
            </div>
          </div>

          <section className={`mt-6 ${card}`}>
            <h2 className={h2}>Biggest single spends</h2>
            {/* A table, not a chart: five exact figures beat five tiny bars. */}
            <ul className="mt-3 divide-y divide-line">
              {biggest(rows).map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {t.title}
                    <span className="ml-2 text-muted">{t.category}</span>
                  </span>
                  <span className="hidden shrink-0 text-muted sm:block">{t.source}</span>
                  <span className="shrink-0 tabular-nums">{formatAmount(t.amount)}</span>
                </li>
              ))}
              {rows.length === 0 && (
                <li className="py-3 text-sm text-muted">Nothing recorded in this window.</li>
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
