import { formatAmount, formatAmountRound } from "./money";
import { card, errorBox, h1, h2, pageWide } from "./ui";
import { Alert, Check, Info, Lightbulb, Repeat, Target } from "./icons";
import PeriodPicker, { usePeriod } from "./PeriodPicker";
import { FEED, within } from "./analyticsFeed";
import { Severity, buildReport } from "./report";

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
  const { win, prev, invalid, controls } = usePeriod("month");
  const report = buildReport(within(FEED, win), win, within(FEED, prev));
  const saveable = report.habits.reduce((s, h) => s + h.saves, 0);

  return (
    <div className={pageWide}>
      <h1 className={h1}>Report</h1>
      <p className="mt-1 text-sm text-muted">
        Sample data. Every line below is derived from a figure in the feed — no advice
        that isn't backed by one of your own numbers.
      </p>

      <PeriodPicker controls={controls} label={win.label} />

      {invalid ? (
        <p role="alert" className={errorBox}>
          The start date is after the end date.
        </p>
      ) : (
        <>
          <section className={`mt-6 ${card}`}>
            <p className="text-lg leading-relaxed font-medium">{report.headline}</p>
            <p className="mt-2 text-sm text-muted">
              {formatAmount(report.spent)} over {report.days} days ·{" "}
              {formatAmountRound(Math.round(report.spent / report.days))} a day
            </p>
            <SplitBar
              essentials={report.essentials}
              discretionary={report.discretionary}
            />
          </section>

          {report.findings.length > 0 && (
            <section className="mt-6">
              <h2 className={h2}>What stands out</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {report.findings.map((f) => {
                  const tone = TONE[f.severity];
                  const Icon = tone.icon;
                  return (
                    <article
                      key={f.title}
                      className={`rounded-2xl border bg-surface p-5 ${tone.ring}`}
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

          {report.habits.length > 0 && (
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
                {report.habits.map((h) => (
                  <li key={h.title} className="flex items-start gap-3 py-4 first:pt-1">
                    <Lightbulb className="mt-0.5 size-5 shrink-0 text-series-b" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{h.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{h.how}</p>
                    </div>
                    {h.saves > 0 && (
                      <span className="shrink-0 rounded-lg bg-credit/10 px-2 py-1 text-xs font-medium text-credit tabular-nums">
                        ~{formatAmountRound(h.saves)}/mo
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.reframes.length > 0 && (
            <section className="mt-6">
              <h2 className={h2}>Same numbers, different angle</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {report.reframes.map((r) => (
                  <article key={r.title} className="rounded-2xl border border-line bg-surface p-5">
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
