import { useRef, useState } from "react";
import { at } from "./day";
import { formatAmount, formatAmountRound } from "./money";
import { card, errorBox, h1, h2, lede, pageWide } from "./ui";
import Stat from "./Stat";
import { change } from "./delta";
import PeriodPicker, { usePeriod } from "./PeriodPicker";
import { ArrowRight, Calendar, TrendUp, Wallet } from "./icons";
import {
  Bucket,
  FEED,
  Slice,
  biggest,
  buckets,
  rank,
  splitFixed,
  totals,
  within,
} from "./analyticsFeed";

/** Plot height, and the tooltip's fixed width. The width is fixed rather than
 *  fitted to its content (the spec allows 132–220) because a constant makes the
 *  clamp arithmetic below exact instead of a measure-then-reposition. */
const PLOT_H = 176;
const TIP_W = 168;
/** Bar top closer than this to the chart top has nowhere to put a tooltip. */
const FLIP_AT = 56;
/** How close the caret may come to the tooltip's own corners. */
const CARET_INSET = 10;

const clamp = (lo: number, n: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Does a held-out charge fall inside this bucket? Drives the violet tick. */
const hasFixed = (b: Bucket, days: Set<string>) =>
  [...days].some((d) => d >= b.from && d <= b.to);

/** The tooltip's first line. A day bucket's axis label is a bare "15" — enough
 *  on an axis where the neighbours give it context, not enough in a box that
 *  floats free of it. Multi-day buckets already carry a readable label. */
const tipDate = (b: Bucket) =>
  b.from === b.to
    ? at(b.from).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : b.label;

type Hover = { at: number; box: number; caret: number; flip: boolean };

/**
 * Vertical bars, one series, so no legend — the card title names it. Heights
 * are percentages of the tallest bar; the axis is the ₹ labels on the left.
 *
 * The tooltip is anchored to the bar rather than to the cursor: a cursor-tracked
 * box makes the reader chase the number they are trying to read, and along a
 * 31-bar axis it never settles. Hovering a full-height column, not the bar,
 * means a ₹0 day is still reachable.
 */
function Bars({ data, tick }: { data: Bucket[]; tick?: (b: Bucket) => boolean }) {
  const plot = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const max = Math.max(...data.map((b) => b.amount), 1);
  // Past ~20 bars the labels collide, so only every nth one is drawn.
  const every = Math.ceil(data.length / 12);

  function show(at: number) {
    const width = plot.current?.offsetWidth ?? 0;
    if (!width) return;
    const centre = (width * (at + 0.5)) / data.length;
    // The box clamps to the plot's box; the caret keeps tracking the bar and
    // stops short of the corners, so it never points out of a rounded edge.
    const box = clamp(0, centre - TIP_W / 2, Math.max(0, width - TIP_W));
    setHover({
      at,
      box,
      caret: clamp(CARET_INSET, centre - box, TIP_W - CARET_INSET),
      flip: PLOT_H * (1 - data[at].amount / max) < FLIP_AT,
    });
  }

  const b = hover ? data[hover.at] : null;

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {/* Five labels, not one: without a scale to measure them against, thirty
            small bars are a texture rather than a series. */}
        <div className="flex h-44 shrink-0 flex-col justify-between text-[10px] text-muted tabular-nums">
          {[1, 0.75, 0.5, 0.25, 0].map((f) => (
            <span key={f} className="-translate-y-1/2 first:translate-y-0 last:-translate-y-full">
              {f === 0 ? "0" : formatAmountRound(max * f).replace("₹", "")}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" ref={plot}>
          {[0, 25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="pointer-events-none absolute inset-x-0 border-t border-line"
              style={{ top: `${pct}%` }}
            />
          ))}

          <div
            className="mb-5 flex h-44 items-end gap-[2px]"
            role="img"
            aria-label="Spend per period"
            onPointerLeave={() => setHover(null)}
          >
            {data.map((bucket, i) => (
              <div
                key={bucket.from}
                className="relative flex h-full flex-1 items-end"
                onPointerEnter={() => show(i)}
              >
                <div
                  className={`w-full rounded-t bg-accent transition-opacity ${
                    hover?.at === i ? "opacity-80" : ""
                  }`}
                  style={{
                    height: `${Math.max((bucket.amount / max) * 100, bucket.amount ? 2 : 0)}%`,
                  }}
                />
                {i % every === 0 && (
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted">
                    {bucket.label}
                  </span>
                )}
                {/* A held-out day is never silently empty. */}
                {tick?.(bucket) && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-violet"
                  />
                )}
              </div>
            ))}
          </div>

          {b && hover && (
            <div
              className="pointer-events-none absolute z-20 flex flex-col gap-1 rounded-md border border-line bg-overlay px-2.5 py-2 shadow-menu"
              style={{
                width: TIP_W,
                left: hover.box,
                // 8 clear of the bar top, either side of it. Both in pixels off
                // the plot box: the container is the 176px bars plus the 20px
                // label gutter, so a percentage here would be off by that
                // gutter's share and drift as the bar grows.
                [hover.flip ? "top" : "bottom"]: hover.flip
                  ? PLOT_H * (1 - b.amount / max) + 8
                  : 28 + (b.amount / max) * PLOT_H,
              }}
            >
              <span className="font-mono text-[11px] font-medium tracking-wide text-muted uppercase">
                {tipDate(b)}
              </span>
              <span className="text-[15px] leading-none font-semibold tabular-nums">
                {formatAmount(b.amount)}
              </span>
              <span className="text-xs text-muted">
                {b.count} transaction{b.count === 1 ? "" : "s"}
              </span>
              <span
                aria-hidden
                className={`absolute size-[6px] rotate-45 border-line bg-overlay ${
                  hover.flip ? "-top-[4px] border-t border-l" : "-bottom-[4px] border-r border-b"
                }`}
                style={{ left: hover.caret - 3 }}
              />
            </div>
          )}
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
          <div className="mt-1 h-2 rounded-full bg-hover">
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

/**
 * Two series, so a legend is mandatory — and here it is load-bearing, not
 * decoration. The green/blue pair separates well for the common red–green
 * deficiencies but collapses under tritanopia (ΔE ~1.5), so every series gets a
 * row carrying its name *and* its figure: the card stays readable with the hues
 * removed entirely. Measured in `series-contrast.check.ts`.
 */
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
  const { win, prev, invalid, controls } = usePeriod("month");
  /** Off by default: the fixed charge is stated above the chart either way, and
   *  putting it back is the escape hatch, not the starting point. */
  const [showFixed, setShowFixed] = useState(false);

  const rows = within(FEED, win);
  const now = totals(rows, win);
  const before = totals(within(FEED, prev), prev);

  const byCategory = rank(rows, "category");
  const bySource = rank(rows, "source", 4);
  const onAccounts = rows
    .filter((t) => t.direction === "debit" && t.kind === "account")
    .reduce((s, t) => s + t.amount, 0);
  const onCards = now.spent - onAccounts;

  const { variable, fixed } = splitFixed(rows);
  // Nothing tagged fixed means there is nothing to hold out, so the chart plots
  // everything — the split is a treatment for a case, not a mode.
  const held = fixed.count > 0 && !showFixed;
  const series = buckets(held ? variable : rows, win);
  const peak = series.reduce<Bucket | null>((a, b) => (a && a.amount >= b.amount ? a : b), null);

  // "vs Jun", not "vs Jun 2026": the year is already on the stepper, and the
  // tile has 177px for a figure and a comparison both.
  const vs = prev.label.replace(` ${win.from.slice(0, 4)}`, "");

  return (
    <div className={pageWide}>
      <h1 className={h1}>Analytics</h1>
      <p className={lede}>
        Sample data — this page reads a consolidated feed, not the ledger.
      </p>

      <PeriodPicker
        controls={controls}
        label={win.label}
        summary={{ from: win.from, to: win.to, count: rows.length }}
      />

      {invalid ? (
        <p role="alert" className={errorBox}>
          The start date is after the end date.
        </p>
      ) : (
        <>
          {/* Stacked, 2×2, then four across. `lg` is where the rail appears and
              the content box becomes 744 — exactly 4×177 plus three 12px gaps,
              which is what the four-across figure was sized for. */}
          <div className="mt-5 grid grid-cols-1 gap-3 nav:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Spent"
              value={formatAmountRound(now.spent)}
              delta={{ pct: change(now.spent, before.spent), goal: "lower", vs }}
              icon={ArrowRight}
              tint="danger"
            />
            <Stat
              label="Received"
              value={formatAmountRound(now.received)}
              delta={{ pct: change(now.received, before.received), goal: "higher", vs }}
              icon={Wallet}
              tint="accent"
            />
            <Stat
              label="Net"
              value={formatAmountRound(now.net)}
              delta={{ pct: change(now.net, before.net), goal: "higher", vs }}
              icon={TrendUp}
              tint="violet"
            />
            <Stat
              label="Per day"
              value={formatAmountRound(now.perDay)}
              delta={{ pct: change(now.perDay, before.perDay), goal: "lower", vs }}
              icon={Calendar}
              tint="muted"
            />
          </div>

          <section className={`mt-5 ${card}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={h2}>{held ? "Variable spend over time" : "Spend over time"}</h2>
              {/* The peak names its day as well as its figure: the number alone
                  tells you the axis is right, the day tells you where to look. */}
              <p className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                peak {formatAmountRound(peak?.amount ?? 0)}
                {peak && ` · ${tipDate(peak)}`}
              </p>
            </div>

            {/* The strip states the held-out figure before the chart does, which
                is what makes removing it a split rather than a silence. */}
            {fixed.count > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-violet-weak px-3 py-2">
                <span className="text-[13.5px] font-medium tabular-nums">
                  Fixed {formatAmountRound(fixed.total)}
                </span>
                <span className="text-[12.5px] text-muted">
                  {fixed.count} charge{fixed.count === 1 ? "" : "s"} · {fixed.labels.join(", ")}
                  {held && " · held out of the daily series"}
                </span>
                <button
                  onClick={() => setShowFixed(!showFixed)}
                  className="ml-auto cursor-pointer text-[12.5px] font-medium text-accent hover:underline"
                >
                  {showFixed ? "Hold out again" : "Show in chart"}
                </button>
              </div>
            )}

            <Bars data={series} tick={held ? (b) => hasFixed(b, fixed.days) : undefined} />
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
