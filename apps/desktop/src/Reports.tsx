import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatAmount, formatAmountRound } from "./money";
import { button, card, errorBox, h1, h2, lede, pageWide } from "./ui";
import { Alert, Check, Info, Lightbulb, Repeat, Target } from "./icons";
import PeriodPicker, { usePeriod } from "./PeriodPicker";
import { totals, within } from "./analyticsFeed";
import { Severity, buildFacts, buildReport } from "./report";
import { Written, buildReportPrompt, parseWrittenReport } from "./reportAi";
import { CLOUD_URL, getSettings, loadReport, saveReport } from "./db";
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
    <div className="mt-4">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        <div className="bg-accent" style={{ width: `${(essentials / total) * 100}%` }} />
        <div className="bg-series-b" style={{ width: `${(discretionary / total) * 100}%` }} />
      </div>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-accent" />
          <span className="flex-1">Essentials</span>
          <span className="tabular-nums">{formatAmount(essentials)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-series-b" />
          <span className="flex-1">Controllable</span>
          <span className="tabular-nums">{formatAmount(discretionary)}</span>
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
      const settings = await getSettings();
      if (!settings.model) {
        throw new Error("Pick an AI model in Settings before generating a report.");
      }
      const facts = buildFacts(rows, win, within(feed, prev));
      const reply = await invoke<string>("ollama_json", {
        baseUrl: settings.base_url || CLOUD_URL,
        model: settings.model,
        apiKey: settings.api_key ?? "",
        prompt: buildReportPrompt(facts),
      });
      // Parsed before it is written: a malformed reply must leave the previous
      // stored report for this window intact.
      const w = parseWrittenReport(reply, Math.round(facts.discretionary / facts.months));
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
            What your spending in this period says, and what would change it. Figures come
            from your own ledger; transfers between your own accounts are left out.
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

      <PeriodPicker controls={controls} label={win.label} />

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
            <p className={`text-lg leading-relaxed font-medium ${stale ? "text-muted" : ""}`}>
              {view.headline}
            </p>
            <p className="mt-2 text-sm text-muted">
              {formatAmount(report.spent)} over {report.days} days ·{" "}
              {formatAmountRound(Math.round(report.spent / report.days))} a day
            </p>
            <SplitBar
              essentials={report.essentials}
              discretionary={report.discretionary}
            />

            {generating && (
              <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
                Writing a report on {win.label}…
              </p>
            )}

            {/* The figures moved after the model read them, so the prose below
                is about a window that no longer looks like this. Said out loud:
                the alternative is paragraphs quietly contradicting the bar
                above them. Never refreshed on its own — that would spend tokens
                nobody asked for. */}
            {stale && (
              <p className="mt-4 rounded-md border border-line bg-violet-weak px-3 py-2 text-[12.5px]">
                This period has changed since the report was written. Press{" "}
                <span className="font-medium">Rewrite with AI</span> for a current one.
              </p>
            )}

            {written && (
              <p className="mt-3 text-[11.5px] text-muted">
                Written by {shown?.model ?? "a language model"} from the figures on this
                page
                {shown?.writtenAt && ` on ${formatDay(shown.writtenAt.slice(0, 10))}`}. The
                split above is arithmetic on your ledger; check anything surprising in the
                prose against Analytics.
              </p>
            )}
          </section>

          {view.findings.length > 0 && (
            <section className="mt-6">
              <h2 className={h2}>What stands out</h2>
              {/* Independent cards, so extra width becomes a third column rather
                  than three wider ones — a finding is a paragraph, and a 700px
                  measure is where one stops being readable. */}
              <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {view.findings.map((f, n) => {
                  const tone = TONE[f.severity];
                  const Icon = tone.icon;
                  return (
                    <article
                      key={n}
                      className={`rounded-2xl border bg-surface p-5 shadow-card ${tone.ring}`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`mt-0.5 size-5 shrink-0 ${tone.text}`} />
                        <div className="min-w-0">
                          <h3 className="font-medium">{f.title}</h3>
                          <p className="mt-1 text-sm tabular-nums">{f.figure}</p>
                          {/* The "why" is the point of the page: a number without
                              a consequence is just the Analytics tab again. */}
                          <p className="mt-2 text-sm leading-relaxed text-muted">{f.why}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {view.habits.length > 0 && (
            <section className={`mt-6 ${card}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={h2}>Habits worth building</h2>
                {saveable > 0 && (
                  <p className="text-sm text-muted">
                    Together, about{" "}
                    <span className="font-medium text-ink tabular-nums">
                      {formatAmountRound(saveable)}
                    </span>{" "}
                    a month
                  </p>
                )}
              </div>
              <ul className="mt-4 divide-y divide-line">
                {view.habits.map((h, n) => (
                  <li key={n} className="flex items-start gap-3 py-4 first:pt-1">
                    <Lightbulb className="mt-0.5 size-5 shrink-0 text-series-b" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{h.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{h.how}</p>
                    </div>
                    {h.saves > 0 && (
                      <span className="shrink-0 rounded-lg bg-credit-weak px-2 py-1 text-xs font-medium text-credit tabular-nums">
                        ~{formatAmountRound(h.saves)}/mo
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view.reframes.length > 0 && (
            <section className="mt-6">
              <h2 className={h2}>Same numbers, different angle</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {view.reframes.map((r, n) => (
                  <article
                    key={n}
                    className="rounded-2xl border border-line bg-surface p-5 shadow-card"
                  >
                    <Repeat className="size-5 text-violet" />
                    <h3 className="mt-3 font-medium">{r.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {report.target > 0 && (
            <section className={`mt-6 ${card}`}>
              <div className="flex items-start gap-3">
                <Target className="mt-0.5 size-5 shrink-0 text-accent" />
                <div>
                  <h2 className={h2}>Next period</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Hold the next {report.days} days to{" "}
                    <span className="font-medium text-ink tabular-nums">
                      {formatAmountRound(report.target)}
                    </span>{" "}
                    — the same essentials, 10% off the controllable half. That is a
                    target you can hit by changing what you buy, not where you live.
                  </p>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
