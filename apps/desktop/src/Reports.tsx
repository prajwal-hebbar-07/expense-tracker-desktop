import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatAmount, formatAmountRound } from "./money";
import { button, card, errorBox, h1, h2, lede, pageWide } from "./ui";
import { Alert, Check, Info, Lightbulb, Repeat, Target } from "./icons";
import PeriodPicker, { usePeriod } from "./PeriodPicker";
import { totals, within } from "./analyticsFeed";
import { Severity, buildFacts, buildReport } from "./report";
import { Written, buildReportPrompt, parseWrittenReport, reportSavingsBudget } from "./reportAi";
import { getOllamaConfig, loadReport, saveReport } from "./db";
import { formatDay } from "./day";

const TONE: Record<Severity, { ring: string; text: string; icon: typeof Alert }> = {
  watch: { ring: "border-danger/30 bg-danger/5", text: "text-danger", icon: Alert },
  note: { ring: "border-line", text: "text-muted", icon: Info },
  good: { ring: "border-credit/30 bg-credit/5", text: "text-credit", icon: Check },
};

/** Essentials vs the rest, as one bar. The split is the report's whole premise,
 *  so it is stated once at the top rather than repeated in every section. */
function SplitBar({ essentials, discretionary }: { essentials: number; discretionary: number }) {
  const total = essentials + discretionary || 1;
  return (
    <div className="mt-3">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-hover">
        <div className="bg-accent" style={{ width: `${(essentials / total) * 100}%` }} />
        <div className="bg-series-b" style={{ width: `${(discretionary / total) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-2 text-[13px]">
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-accent" />
          <span className="flex-1 text-muted">Essentials</span>
          <span className="font-medium tabular-nums">{formatAmount(essentials)}</span>
          <span className="w-9 text-right text-xs text-muted tabular-nums">
            {Math.round((essentials / total) * 100)}%
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-series-b" />
          <span className="flex-1 text-muted">Controllable</span>
          <span className="font-medium tabular-nums">{formatAmount(discretionary)}</span>
          <span className="w-9 text-right text-xs text-muted tabular-nums">
            {Math.round((discretionary / total) * 100)}%
          </span>
        </li>
      </ul>
    </div>
  );
}

export default function Reports() {
  const { win, prev, invalid, controls, rows: feed, loading, feedError } = usePeriod("month");
  const rows = within(feed, win);
  const now = totals(rows, win);

  /** The rules version, recomputed every render. It is what the page shows
   *  until the model has written one, and — whichever is on screen — the only
   *  source of the figures the page draws: spent, the split, the target. */
  const report = buildReport(rows, win, within(feed, prev));

  /** What the model wrote about this window, held with the window it belongs
   *  to: a report of July above August's split bar is a confident lie, and so
   *  is one from a run that lands after the user has stepped away.
   *
   *  It survives a reload because it is a row in `report` keyed by the window
   *  (docs/report-ai.md); `fingerprint` is what the figures looked like when
   *  it was written, so prose about a window that has since gained
   *  transactions is shown as stale rather than as current. */
  const [ai, setAi] = useState<{
    window: string;
    model?: string;
    written?: Written;
    fingerprint?: string;
    writtenAt?: string;
    error?: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  const winKey = `${win.from}|${win.to}`;
  const shown = ai?.window === winKey ? ai : null;
  const written = shown?.written;
  const fingerprint = `${rows.length}:${now.spent}:${now.received}`;
  const stale = written != null && shown?.fingerprint !== fingerprint;

  /** One report, two possible authors. The model replaces the prose and
   *  nothing else — every figure below still comes off the ledger. */
  const view = written
    ? {
        ...report,
        headline: written.headline || report.headline,
        findings: written.findings,
        habits: written.habits,
        reframes: written.reframes,
      }
    : report;
  const saveable = view.habits.reduce((s, h) => s + h.saves, 0);

  // Reading a stored report costs nothing, so unlike writing one it may happen
  // on mount and on every period change — the button is about tokens.
  useEffect(() => {
    let live = true;
    setAi(null);
    loadReport(win.from, win.to)
      .then((row) => {
        if (!live || !row) return;
        setAi({
          window: `${win.from}|${win.to}`,
          model: row.model,
          written: {
            headline: row.headline,
            findings: row.findings,
            habits: row.habits,
            reframes: row.reframes,
          },
          fingerprint: row.fingerprint,
          writtenAt: row.created_at,
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [win.from, win.to]);

  /** Sends this window's figures — the same ones the rules read, never the
   *  transactions — to the configured model, and stores what comes back.
   *
   *  On the button and nowhere else: not on mount, not on a period change, not
   *  on a timer. A run spends tokens on a paid subscription, and the stepper is
   *  one click. The page is complete without ever pressing it. */
  function generate() {
    setAi(null);
    setGenerating(true);
    (async () => {
      const settings = await getOllamaConfig();
      if (!settings.model) {
        throw new Error("Pick an AI model in Settings before generating a report.");
      }
      const facts = buildFacts(rows, win, within(feed, prev));
      const reply = await invoke<string>("ollama_json", {
        baseUrl: settings.base_url,
        model: settings.model,
        apiKey: settings.api_key,
        prompt: buildReportPrompt(facts),
      });
      // Parsed before it is written: a malformed reply must leave the previous
      // stored report for this window intact.
      const w = parseWrittenReport(reply, reportSavingsBudget(facts));
      await saveReport(win.from, win.to, { model: settings.model, ...w, fingerprint });
      setAi({
        window: winKey,
        model: settings.model,
        written: w,
        fingerprint,
        writtenAt: new Date().toISOString(),
      });
    })()
      .catch((e) => setAi({ window: winKey, error: String(e) }))
      .finally(() => setGenerating(false));
  }

  return (
    <div className={pageWide}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={h1}>Report</h1>
          <p className={lede}>
            See what shaped this period and the clearest next move. Internal transfers are
            excluded.
          </p>
        </div>
        {/* On demand, never on mount or on a period change: it spends tokens. */}
        <button
          className={button}
          onClick={generate}
          disabled={generating || invalid || loading || report.spent === 0}
        >
          {generating ? "Writing…" : written ? "Rewrite with AI" : "Generate report"}
        </button>
      </div>

      <PeriodPicker
        controls={controls}
        label={win.label}
        summary={{ from: win.from, to: win.to, count: rows.length }}
      />

      {shown?.error && (
        <p role="alert" className={errorBox}>
          {shown.error}
        </p>
      )}

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
      ) : report.spent === 0 ? (
        // Every finding is a statement about money that moved. With none, the
        // honest report is one sentence, not six empty sections.
        <div className={`mt-6 ${card}`}>
          <p className="text-[13.5px] font-medium">Nothing spent in {win.label}.</p>
          <p className="mt-1 text-[12.5px] text-muted">
            A report needs spending to read. Add transactions, or step back to a period
            that has some.
          </p>
        </div>
      ) : (
        <>
          <section className={`mt-6 ${card}`}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-[0.08em] text-accent uppercase">
                  At a glance
                </p>
                <h2
                  className={`mt-2 max-w-3xl text-[20px] leading-snug font-semibold tracking-[-0.015em] sm:text-[22px] ${
                    stale ? "text-muted" : ""
                  }`}
                >
                  {view.headline}
                </h2>
                <dl className="mt-5 grid max-w-lg grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-field px-3.5 py-3">
                    <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">
                      Spent
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {formatAmount(report.spent)}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-line bg-field px-3.5 py-3">
                    <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">
                      Per day
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {formatAmountRound(Math.round(report.spent / report.days))}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted">{report.days} days in this report</p>
              </div>

              <div className="rounded-xl border border-line bg-field p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">Spend mix</h3>
                  <span className="text-xs text-muted">what can move</span>
                </div>
                <SplitBar
                  essentials={report.essentials}
                  discretionary={report.discretionary}
                />
              </div>
            </div>

            {generating && (
              <div className="mt-4 border-t border-line pt-3">
                <span className="rounded-full bg-violet-weak px-2.5 py-1 text-[11px] font-medium text-violet">
                  Writing {win.label}…
                </span>
              </div>
            )}

            {stale && (
              <p className="mt-4 rounded-xl border border-line bg-violet-weak px-3.5 py-2.5 text-[12.5px]">
                This period changed after the report was written. Rewrite it for a current
                read.
              </p>
            )}

            {written && (
              <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-muted">
                AI · {shown?.model ?? "language model"}
                {shown?.writtenAt && ` · ${formatDay(shown.writtenAt.slice(0, 10))}`} · Check
                the prose against Analytics.
              </p>
            )}
          </section>

          {view.findings.length > 0 && (
            <section className="mt-6">
              <h2 className={h2}>What stands out</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {view.findings.map((f, n) => {
                  const tone = TONE[f.severity];
                  const Icon = tone.icon;
                  return (
                    <article
                      key={n}
                      className={`rounded-2xl border p-4 shadow-card sm:p-5 ${tone.ring}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface shadow-card">
                          <Icon className={`size-5 ${tone.text}`} />
                        </span>
                        <h3 className="min-w-0 font-medium">{f.title}</h3>
                      </div>
                      <p className="mt-4 text-[17px] font-semibold tabular-nums">{f.figure}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.why}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {view.habits.length > 0 && (
            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={h2}>Habits worth building</h2>
                {saveable > 0 && (
                  <p className="rounded-full bg-credit-weak px-3 py-1 text-xs font-medium text-credit tabular-nums">
                    ~{formatAmountRound(saveable)}/month together
                  </p>
                )}
              </div>
              <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                {view.habits.map((h, n) => (
                  <li
                    key={n}
                    className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-series-b-weak">
                        <Lightbulb className="size-5 text-series-b" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="font-medium">{h.title}</h3>
                          {h.saves > 0 && (
                            <span className="shrink-0 text-xs font-medium text-credit tabular-nums">
                              ~{formatAmountRound(h.saves)}/mo
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{h.how}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view.reframes.length > 0 && (
            <section className="mt-6">
              <h2 className={h2}>Another way to see it</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {view.reframes.map((r, n) => (
                  <article
                    key={n}
                    className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-violet-weak">
                      <Repeat className="size-5 text-violet" />
                    </span>
                    <h3 className="mt-3 font-medium">{r.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{r.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {report.target > 0 && (
            <section className={`mt-6 ${card}`}>
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <span className="grid size-11 place-items-center rounded-xl bg-accent-weak">
                  <Target className="size-6 text-accent" />
                </span>
                <div className="min-w-0">
                  <h2 className={h2}>Next period target</h2>
                  <p className="mt-1 text-[24px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                    {formatAmountRound(report.target)}
                  </p>
                </div>
                <p className="text-[13px] leading-relaxed text-muted sm:col-start-2">
                  Aim for this across the next {report.days} days. Essentials stay intact;
                  controllable spending comes down 10%.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
