import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getOllamaConfig, loadAnalysis, saveAnalysis } from "./db";
import { at, formatDay } from "./day";
import { formatAmount, formatAmountRound } from "./money";
import { button, card, errorBox, h1, h2, lede, pageWide } from "./ui";
import Stat from "./Stat";
import { change } from "./delta";
import PeriodPicker, { usePeriod } from "./PeriodPicker";
import { ArrowRight, Calendar, TrendUp, Wallet } from "./icons";
import { Report, buildInsightsPrompt, parseInsights } from "./insights";
import {
  Bucket,
  Slice,
  biggest,
  buckets,
  daysBetween,
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
          <span className="w-9 text-right text-xs text-muted tabular-nums">
            {Math.round((account / total) * 100)}%
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-series-b" />
          <span className="flex-1">Credit cards</span>
          <span className="tabular-nums">{formatAmount(cardTotal)}</span>
          <span className="w-9 text-right text-xs text-muted tabular-nums">
            {Math.round((cardTotal / total) * 100)}%
          </span>
        </li>
      </ul>
    </div>
  );
}

export default function Analytics() {
  const { win, prev, invalid, controls, rows: feed, loading, feedError } = usePeriod("month");
  /** Off by default: the fixed charge is stated above the chart either way, and
   *  putting it back is the escape hatch, not the starting point. */
  const [showFixed, setShowFixed] = useState(false);

  const rows = within(feed, win);
  const now = totals(rows, win);
  const before = totals(within(feed, prev), prev);

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

  /** What the model wrote about this window. Held with the window it belongs
   *  to — an analysis of July sitting above August's charts is a confident
   *  lie, and so is one from a run that lands after the user has stepped away
   *  from the period it read. The same comparison settles both.
   *
   *  It survives a reload because it is a row in `analysis` keyed by the
   *  window (docs/analysis-persistence.md); `fingerprint` is what the figures
   *  looked like when it was written, so a stored one whose window has since
   *  gained transactions is shown as stale rather than as current. */
  const [ai, setAi] = useState<{
    window: string;
    model?: string;
    report?: Report;
    fingerprint?: string;
    writtenAt?: string;
    error?: string;
  } | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const winKey = `${win.from}|${win.to}`;
  const shown = ai?.window === winKey ? ai : null;

  /** What the window's figures looked like, cheaply enough to compare on every
   *  render. Count and both totals: a row edited from ₹400 to ₹4,000 moves the
   *  sums without moving the count, and a delete plus an add moves the count
   *  back but not the sums. */
  const fingerprint = `${rows.length}:${now.spent}:${now.received}`;
  const stale = shown?.report != null && shown.fingerprint !== fingerprint;

  // Reading a stored analysis costs nothing, so unlike generating one it may
  // happen on mount and on every period change — rule 1 is about tokens.
  useEffect(() => {
    let live = true;
    setAi(null);
    loadAnalysis(win.from, win.to)
      .then((row) => {
        if (!live || !row) return;
        setAi({
          window: `${win.from}|${win.to}`,
          model: row.model,
          report: { summary: row.summary, insights: row.insights },
          fingerprint: row.fingerprint,
          writtenAt: row.created_at,
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [win.from, win.to]);

  /** Sends this window's figures — the same aggregates the charts below are
   *  drawn from, never the transactions — to the configured model.
   *
   *  On the button and nowhere else: not on mount, not on a period change, not
   *  on a timer. A run spends tokens on a paid subscription, and a page that
   *  analysed itself would spend them on every visit and every stepper click.
   *  The rest of the page is complete without ever pressing it. */
  function explain() {
    setAi(null);
    setAnalysing(true);
    (async () => {
      const settings = await getOllamaConfig();
      if (!settings.model) {
        throw new Error("Pick an AI model in Settings before generating an analysis.");
      }
      const reply = await invoke<string>("ollama_json", {
        baseUrl: settings.base_url,
        model: settings.model,
        apiKey: settings.api_key,
        prompt: buildInsightsPrompt({
          win,
          vs,
          days: daysBetween(win.from, win.to),
          now,
          before,
          categories: byCategory,
          sources: bySource,
          onAccounts,
          onCards,
          fixed,
          biggest: biggest(rows),
        }),
      });
      const report = parseInsights(reply);
      await saveAnalysis(win.from, win.to, {
        model: settings.model,
        summary: report.summary,
        insights: report.insights,
        fingerprint,
      });
      setAi({
        window: winKey,
        model: settings.model,
        report,
        fingerprint,
        writtenAt: new Date().toISOString(),
      });
    })()
      .catch((e) => setAi({ window: winKey, error: String(e) }))
      .finally(() => setAnalysing(false));
  }

  return (
    <div className={pageWide}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={h1}>Analytics</h1>
          <p className={lede}>
            See where your money went. Transfers between your own accounts are excluded.
          </p>
        </div>
        {/* On demand, never on mount or on a period change: it spends tokens. */}
        <button
          className={button}
          onClick={explain}
          disabled={analysing || invalid || loading || rows.length === 0}
        >
          {analysing ? "Analysing…" : "Explain with AI"}
        </button>
      </div>

      <PeriodPicker
        controls={controls}
        label={win.label}
        summary={{ from: win.from, to: win.to, count: rows.length }}
      />

      {invalid ? (
        <p role="alert" className={errorBox}>
          The start date is after the end date.
        </p>
      ) : feedError ? (
        <p role="alert" className={errorBox}>
          Could not read the ledger: {feedError}
        </p>
      ) : loading ? (
        <p className="mt-6 text-[13.5px] text-muted">Reading the ledger…</p>
      ) : rows.length === 0 ? (
        // Zeroes in four tiles and an empty chart is a page that looks broken;
        // an empty ledger is not the same thing as a quiet month.
        <div className={`mt-6 ${card}`}>
          <p className="text-[13.5px] font-medium">Nothing recorded in {win.label}.</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Add transactions on the Transactions page, or step back to a period that has
            some.
          </p>
        </div>
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

          {/* Present when this window has an analysis — freshly generated, or
              read back from the `analysis` table. Never generated on its own. */}
          {(analysing || shown) && (
            <section className={`mt-5 overflow-hidden ${card}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className={h2}>AI analysis</h2>
                  <p className="mt-0.5 text-[12px] text-muted">A quick read of the figures below</p>
                </div>
                {analysing && (
                  <span className="rounded-full bg-violet-weak px-2.5 py-1 text-[11px] font-medium text-violet">
                    Analysing…
                  </span>
                )}
              </div>

              {shown?.error && (
                <p role="alert" className={errorBox}>
                  {shown.error}
                </p>
              )}

              {stale && (
                <p className="mt-3 rounded-xl border border-line bg-violet-weak px-3.5 py-2.5 text-[12.5px]">
                  This window changed after the analysis was written. Run it again for a
                  current read.
                </p>
              )}

              {shown?.report && (
                <>
                  {shown.report.summary && (
                    <p
                      className={`mt-4 rounded-xl border border-accent/20 bg-accent-weak px-4 py-3 text-[14px] leading-relaxed font-medium ${
                        stale ? "text-muted" : ""
                      }`}
                    >
                      {shown.report.summary}
                    </p>
                  )}
                  <ol className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {shown.report.insights.map((i, n) => (
                      <li key={n} className="rounded-xl border border-line bg-field p-3.5">
                        <div className="flex items-start gap-3">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-violet-weak text-[11px] font-semibold text-violet tabular-nums">
                            {n + 1}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-[13.5px] font-medium ${stale ? "text-muted" : ""}`}>
                              {i.title}
                            </p>
                            {i.detail && (
                              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                                {i.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
                    AI · {shown.model ?? "language model"}
                    {shown.writtenAt && ` · ${formatDay(shown.writtenAt.slice(0, 10))}`} ·
                    Verify anything surprising with the charts.
                  </p>
                </>
              )}
            </section>
          )}

          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <section className={card}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className={h2}>{held ? "Variable spend over time" : "Spend over time"}</h2>
                <p className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                  peak {formatAmountRound(peak?.amount ?? 0)}
                  {peak && ` · ${tipDate(peak)}`}
                </p>
              </div>

              {fixed.count > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-violet-weak px-3 py-2">
                  <span className="text-[13.5px] font-medium tabular-nums">
                    Fixed {formatAmountRound(fixed.total)}
                  </span>
                  <span className="text-[12.5px] text-muted">
                    {fixed.count} charge{fixed.count === 1 ? "" : "s"} · {fixed.labels.join(", ")}
                    {held && " · held out"}
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

            <section className={card}>
              <h2 className={h2}>Where it went</h2>
              <Ranked rows={byCategory} total={now.spent} />
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className={card}>
              <h2 className={h2}>Accounts vs cards</h2>
              <Split account={onAccounts} cardTotal={onCards} />
            </section>

            <section className={card}>
              <h2 className={h2}>Top sources</h2>
              <Ranked rows={bySource} total={now.spent} />
            </section>
          </div>

          <section className={`mt-6 ${card}`}>
            <h2 className={h2}>Largest purchases</h2>
            <ul className="mt-3 divide-y divide-line">
              {biggest(rows).map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hover text-[11px] font-semibold text-muted tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {t.category} · {t.source}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatAmount(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
