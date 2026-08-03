import { useState } from "react";
import { ChevronLeft, ChevronRight } from "./icons";
import DatePicker from "./DatePicker";
import { Period, TODAY, Window, daysBetween, previous, windowFor } from "./analyticsFeed";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "range", label: "Range" },
];

export type Resolved = {
  /** The window to read, never extending past the newest day in the feed. */
  win: Window;
  /** What to compare it against — same elapsed length when `win` is in progress. */
  prev: Window;
  invalid: boolean;
};

/**
 * Period state plus the window maths, shared by Analytics and Reports so the
 * two screens can never disagree about what "this month" means.
 */
export function usePeriod(initial: Period = "month") {
  const [period, setPeriod] = useState<Period>(initial);
  /** Periods back from today; reset on a period change, because "3 weeks ago"
   *  and "3 years ago" are not the same place. */
  const [offset, setOffset] = useState(0);
  const [range, setRange] = useState({ from: "2026-05-01", to: "2026-07-31" });

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

  const resolved: Resolved = {
    win,
    prev,
    invalid: period === "range" && range.from > range.to,
  };

  return {
    ...resolved,
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
