import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "./icons";
import DatePicker from "./DatePicker";
import { shiftMonths, todayIso } from "./day";
import { loadFeed } from "./db";
import { Period, Txn, Window, daysBetween, previous, windowFor } from "./analyticsFeed";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "range", label: "Range" },
];

export type Resolved = {
  /** The window to read, never extending past today. */
  win: Window;
  /** What to compare it against — same elapsed length when `win` is in progress. */
  prev: Window;
  invalid: boolean;
};

/**
 * Period state, the window maths, and the ledger rows for both windows —
 * shared by Analytics and Reports so the two screens can never disagree about
 * what "this month" means or read different rows for it.
 *
 * The rows are the real ledger (docs/analytics-real-feed.md). One query covers
 * the period *and* its comparison, because `prev` abuts `win` by construction:
 * asking for `prev.from … win.to` is one round trip instead of two, and the
 * two halves can never come from different reads of a table the user is
 * editing on another screen.
 */
export function usePeriod(initial: Period = "month") {
  const [period, setPeriod] = useState<Period>(initial);
  /** Periods back from today; reset on a period change, because "3 weeks ago"
   *  and "3 years ago" are not the same place. */
  const [offset, setOffset] = useState(0);
  const today = todayIso();
  /** Three months back, the shortest span where a custom range beats picking
   *  "Month" — and it ends today rather than on a date baked into the source. */
  const [range, setRange] = useState({ from: shiftMonths(today, -3), to: today });

  const full: Window =
    period === "range"
      ? { ...range, label: `${range.from} → ${range.to}` }
      : windowFor(period, offset);

  // Never average or compare across days that have not happened yet. A year in
  // progress is 212 days of spending, not 365, and holding it against a whole
  // previous year reports a saving the user did not make.
  const inProgress = full.to > today;
  const win: Window = inProgress ? { ...full, to: today } : full;
  const prev = inProgress
    ? previous("range", win, offset) // same elapsed length, ending before it
    : previous(period, full, offset);

  const resolved: Resolved = {
    win,
    prev,
    invalid: period === "range" && range.from > range.to,
  };

  const [feed, setFeed] = useState<{ rows: Txn[]; loading: boolean; error: string | null }>({
    rows: [],
    loading: true,
    error: null,
  });

  // `span` is exactly the two values the query is built from, so it is the
  // dependency: re-reading on every render of a stepper click that landed on
  // the same dates would be a query per keystroke in the range fields.
  const span = `${prev.from}|${win.to}`;
  useEffect(() => {
    if (resolved.invalid) return;
    // A slow read that lands after the user has stepped on must not overwrite
    // the newer one; the flag is cleared by cleanup before the next run starts.
    let live = true;
    setFeed((f) => ({ ...f, loading: true, error: null }));
    loadFeed(prev.from, win.to).then(
      (rows) => live && setFeed({ rows, loading: false, error: null }),
      (e) => live && setFeed({ rows: [], loading: false, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [span, resolved.invalid]);

  return {
    ...resolved,
    rows: feed.rows,
    loading: feed.loading,
    feedError: feed.error,
    period,
    controls: { period, setPeriod, offset, setOffset, range, setRange },
  };
}

/**
 * The filter row, shared by Analytics and Report. One 52px surface holding a
 * segmented period switch and either a stepper or a pair of date fields — the
 * two arrangements keep the same height, because a row that grows when you pick
 * "Range" shoves the whole page down for a control you were already looking at.
 */
export default function PeriodPicker({
  controls,
  label,
  summary,
}: {
  controls: ReturnType<typeof usePeriod>["controls"];
  label: string;
  /** The resolved window, for the count on the right. Sits at the end of the
   *  row and drops below `md`, where it is the first thing worth losing. */
  summary?: { from: string; to: string; count: number };
}) {
  const { period, setPeriod, offset, setOffset, range, setRange } = controls;

  const choose = (id: Period) => {
    setPeriod(id);
    // "3 weeks ago" and "3 years ago" are not the same place.
    setOffset(0);
  };

  return (
    <div className="mt-5 flex min-h-14 flex-col gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card sm:flex-row sm:items-center sm:gap-4">
      <div
        role="tablist"
        aria-label="Period"
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const at = PERIODS.findIndex((p) => p.id === period);
          choose(PERIODS[(at + step + PERIODS.length) % PERIODS.length].id);
        }}
        className="flex h-10 shrink-0 gap-0.5 rounded-xl border border-line bg-field p-[3px] focus-within:shadow-[0_0_0_3px_var(--focus)]"
      >
        {PERIODS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={period === p.id}
            // Roving: one stop for the whole group, then ←/→ inside it.
            tabIndex={period === p.id ? 0 : -1}
            onClick={() => choose(p.id)}
            className={`h-8 flex-1 cursor-pointer rounded-lg px-3 text-[12.5px] font-medium transition-colors outline-none sm:flex-none ${
              period === p.id
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:bg-hover"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === "range" ? (
        <div className="flex min-w-0 items-center gap-2">
          <DatePicker
            className="min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            value={range.from}
            onChange={(from) => setRange({ ...range, from })}
          />
          <span className="shrink-0 text-muted">–</span>
          <DatePicker
            className="min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            value={range.to}
            onChange={(to) => setRange({ ...range, to })}
          />
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <Step label="Previous period" onClick={() => setOffset(offset + 1)} />
          <span className="min-w-24 text-center text-[13.5px] font-medium tabular-nums">
            {label}
          </span>
          <Step
            label="Next period"
            next
            // aria-disabled, not `disabled`: the button stays focusable so a
            // screen reader can reach it and say why it does nothing.
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 1))}
          />
        </div>
      )}

      {summary && (
        <p className="hidden shrink-0 font-mono text-[11px] text-muted tabular-nums md:ml-auto md:block">
          {daysBetween(summary.from, summary.to)} days · {summary.count} transactions
        </p>
      )}
    </div>
  );
}

function Step({
  label,
  onClick,
  next,
  disabled,
}: {
  label: string;
  onClick: () => void;
  next?: boolean;
  disabled?: boolean;
}) {
  const Icon = next ? ChevronRight : ChevronLeft;
  return (
    <button
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => !disabled && onClick()}
      className={`grid size-7 place-items-center rounded-md outline-none focus-visible:shadow-[0_0_0_3px_var(--focus)] ${
        disabled
          ? "cursor-default text-muted opacity-[.38]"
          : "cursor-pointer text-ink hover:bg-hover"
      }`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
