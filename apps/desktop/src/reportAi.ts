// The Report screen's model path: the same `Facts` the rules read, turned into
// one prompt, and the reply turned back into the `Report` shape the page
// already renders. Pure — no db, no `invoke` — so `reportAi.check.ts` can run
// it against fixed replies under node, which is the half that breaks.
//
// See docs/report-ai.md.

// Explicit .ts extensions and `import type`: the check runs this file under
// node, whose loader neither guesses extensions nor erases a type imported in
// value position.
import type { Facts, Finding, Habit, Reframe, Severity } from "./report.ts";
import { BIG, SMALL } from "./report.ts";
import { formatAmount, formatAmountRound } from "./money.ts";

/** The half of a `Report` a model is allowed to write: the prose. The figures
 *  the page draws — spent, essentials, discretionary, target — stay arithmetic
 *  over the ledger, so the split bar can never disagree with the ledger even
 *  when the paragraph above it does. */
export type Written = {
  headline: string;
  findings: Finding[];
  habits: Habit[];
  reframes: Reframe[];
};

/** Caps, stated in the prompt and enforced on the reply. A report with nine
 *  findings is a list nobody finishes; the rules version tops out near these. */
export const MAX_FINDINGS = 5;
export const MAX_HABITS = 4;
export const MAX_REFRAMES = 3;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * One prompt, one round trip. Every figure the report could want is spelled
 * out — including the ratios, so the model never has to divide — and it is told
 * to use only these: a number invented next to the split bar that contradicts
 * it is worse than no report at all.
 */
export function buildReportPrompt(f: Facts): string {
  const lines = [
    `Period: ${f.win.label} (${f.win.from} to ${f.win.to}, ${f.days} days).`,
    `Spent ${formatAmount(f.spent)}, about ${formatAmountRound(Math.round(f.spent / f.days))} a day.`,
    `Essentials (rent, groceries, bills, health) ${formatAmount(f.essentials)} — ${pct(f.essentials, f.spent)}%.`,
    `Controllable, everything else ${formatAmount(f.discretionary)} — ${pct(f.discretionary, f.spent)}%, about ${formatAmountRound(Math.round(f.discretionary / f.months))} a month.`,
    `Spend by category: ${f.cats.map(([c, a]) => `${c} ${formatAmount(a)} (${pct(a, f.spent)}%)`).join(", ") || "none"}.`,
    `On cards ${formatAmount(f.onCards)} — ${pct(f.onCards, f.spent)}% of the total.`,
    `Money spent on ${f.spendDays} of the ${f.days} days.`,
    `Suggested cap for the next period, already computed: ${formatAmountRound(f.target)} — the same essentials with 10% off the controllable half.`,
  ];

  if (f.before > 0) {
    const change = pct(f.spent - f.before, f.before);
    lines.push(
      `Previous period spent ${formatAmount(f.before)} — this one is ${change > 0 ? "+" : ""}${change}%, ${formatAmount(Math.abs(f.spent - f.before))} ${change > 0 ? "more" : "less"}.`,
    );
  }
  if (f.income > 0) {
    lines.push(
      `Income received in the same window ${formatAmount(f.income)}, about ${formatAmountRound(Math.round(f.income / f.days))} a day.`,
    );
  }
  if (f.eatingOut > 0 && f.groceries > 0) {
    lines.push(
      `Eating out ${formatAmount(f.eatingOut)} across ${f.foodOrders} orders (average ${formatAmountRound(Math.round(f.eatingOut / f.foodOrders))}) against ${formatAmount(f.groceries)} on groceries — ${(f.eatingOut / f.groceries).toFixed(1)}×.`,
    );
  }
  if (f.subs > 0) {
    lines.push(
      `Subscriptions ${formatAmount(f.subs)} here, about ${formatAmountRound(Math.round((f.subs / f.months) * 12))} a year at this rate.`,
    );
  }
  if (f.smalls.length > 0) {
    const drip = f.smalls.reduce((s, t) => s + t.amount, 0);
    lines.push(
      `${f.smalls.length} controllable spends under ${formatAmountRound(SMALL)}, together ${formatAmount(drip)} — about ${(f.smalls.length / f.days).toFixed(1)} a day.`,
    );
  }
  if (f.bigs.length > 0) {
    lines.push(
      `${f.bigs.length} controllable spends over ${formatAmountRound(BIG)}: ${f.bigs
        .slice(0, 5)
        .map((t) => `${t.title} ${formatAmountRound(t.amount)} (${t.category}, ${t.date})`)
        .join("; ")}.`,
    );
  }
  // Without this the model reads "Uncategorised" as a merchant or a habit and
  // writes advice about cutting it back. It is the ledger's own gap, and the
  // only action it supports is filing the rows.
  if (f.unfiled > 0) {
    lines.push(
      `${formatAmount(f.unfiled)} — ${pct(f.unfiled, f.spent)}% — is \`Uncategorised\`: rows nobody has filed yet, not a kind of spending. Treat it as missing information and as the margin of error on everything else; the action it supports is Transactions → Categorise, never "spend less on it".`,
    );
  }

  // Rupees, not paise: the model writes prose about ₹1,200, and handing it
  // 120000 is how a report ends up promising a saving a hundred times the
  // spend it came from.
  const budget = Math.round(f.discretionary / f.months / 100);

  return [
    "You are writing a short, plain personal finance report for one person, in Indian rupees. Everything you are allowed to state is below.",
    "",
    ...lines,
    "",
    'Reply with JSON only: {"headline": "one sentence", "findings": [{"title": "four to eight words", "figure": "the number the claim rests on", "why": "one or two sentences on what it costs", "severity": "watch|note|good"}], "habits": [{"title": "an action", "how": "one or two sentences, concrete enough to start tomorrow", "saves": 0}], "reframes": [{"title": "four to eight words", "body": "one or two sentences"}]}.',
    `At most ${MAX_FINDINGS} findings, ${MAX_HABITS} habits and ${MAX_REFRAMES} reframes, most important first. A rule with nothing to say says nothing — fewer is better than filler.`,
    "Every finding must carry a figure copied from the list above; a claim without its number is an opinion and will be discarded.",
    `"saves" is an estimated saving per month in whole rupees, 0 when the habit is not about money. Together they must stay under ${budget}, the controllable spend for a month — a saving larger than what was spent is a lie.`,
    "A reframe is the same figures in a different unit: a year, days worked, the number of separate decisions.",
    "Only ever suggest cutting the controllable half. Never suggest moving house, eating less, or cutting rent, groceries, bills or health.",
    "State a consequence, never a lecture. No investment advice, no products, no apps, no praise you cannot support.",
    "Use only the figures above — never invent a number, a category or a merchant. Do not add commentary outside the JSON.",
  ].join("\n");
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const SEVERITY: Record<string, Severity | undefined> = {
  watch: "watch",
  note: "note",
  good: "good",
};

/**
 * Reply -> the prose the page renders.
 *
 * Anything malformed is dropped rather than rendered: a finding with no figure
 * is the one thing this page must never print (docs/report-page.md rule 1), and
 * a habit with no title is a blank row with a rupee badge beside it. A reply
 * that survives with nothing at all throws, because a button that reports
 * success and paints nothing is indistinguishable from a broken one.
 *
 * `budget` is the controllable spend for a month, in paise. Estimated savings
 * are clamped to it cumulatively, so the page cannot promise more than the
 * reader had available to save.
 */
export function parseWrittenReport(reply: string, budget: number): Written {
  // Models wrap JSON in ```json fences even when told not to, and `format:
  // "json"` only makes that rarer, not impossible. Take the outermost braces.
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`Model did not answer with JSON: ${reply.slice(0, 120)}`);
  }

  let raw: { headline?: unknown; findings?: unknown; habits?: unknown; reframes?: unknown };
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error(`Model's JSON did not parse: ${reply.slice(start, start + 120)}`);
  }

  const list = (v: unknown): Record<string, unknown>[] =>
    (Array.isArray(v) ? v : []).map((i) => (i ?? {}) as Record<string, unknown>);

  const findings: Finding[] = list(raw.findings)
    .map((o): Finding => ({
      title: text(o.title),
      figure: text(o.figure),
      why: text(o.why),
      // An unknown severity is not a colour the page has; `note` is the one
      // that claims nothing.
      severity: SEVERITY[text(o.severity).toLowerCase()] ?? "note",
    }))
    .filter((f) => f.title !== "" && f.figure !== "")
    .slice(0, MAX_FINDINGS);

  // Strictly under, never equal: the budget itself is the whole controllable
  // spend, and "you could save all of it" is not advice.
  let left = Math.max(Math.round(budget) - 1, 0);
  const habits: Habit[] = list(raw.habits)
    .map((o): Habit => {
      const rupees = typeof o.saves === "number" ? o.saves : Number(text(o.saves));
      const saves = Number.isFinite(rupees) ? Math.min(Math.max(Math.round(rupees * 100), 0), left) : 0;
      left -= saves;
      return { title: text(o.title), how: text(o.how), saves };
    })
    .filter((h) => h.title !== "")
    .slice(0, MAX_HABITS)
    .sort((a, b) => b.saves - a.saves);

  const reframes: Reframe[] = list(raw.reframes)
    .map((o): Reframe => ({ title: text(o.title), body: text(o.body) }))
    .filter((r) => r.title !== "" && r.body !== "")
    .slice(0, MAX_REFRAMES);

  const headline = text(raw.headline);
  if (headline === "" && findings.length === 0 && habits.length === 0 && reframes.length === 0) {
    throw new Error(`Model answered with no report: ${reply.slice(start, start + 120)}`);
  }
  return { headline, findings, habits, reframes };
}
