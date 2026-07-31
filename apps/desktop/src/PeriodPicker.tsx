import { useState } from "react";
import { input } from "./ui";
import { ChevronDown } from "./icons";
import { Period, TODAY, Window, previous, windowFor } from "./analyticsFeed";

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

export default function PeriodPicker({
  controls,
  label,
}: {
  controls: ReturnType<typeof usePeriod>["controls"];
  label: string;
}) {
  const { period, setPeriod, offset, setOffset, range, setRange } = controls;

  return (
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
          <span className="min-w-40 text-center text-sm font-medium">{label}</span>
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
  );
}
