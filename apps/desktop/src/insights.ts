// Turning the figures already on the Analytics page into one prompt, and
// reading the model's answer back. Pure functions, no db and no invoke, so
// `insights.check.ts` can run them against fixed replies — which is the half
// that breaks, since a model's JSON is only ever *probably* the shape asked for.
//
// See docs/analytics-insights.md.

import { formatAmountRound } from "./money.ts";
import type { Slice, Totals, Txn, Window } from "./analyticsFeed.ts";

/** Everything the prompt is allowed to state. The page has already aggregated
 *  all of it for the charts, so a run sends ~20 lines rather than a window of
 *  transactions: it is cheaper, it fits any model's context, and the model can
 *  only comment on figures the user can see on screen next to the answer. */
export type Facts = {
  win: Window;
  /** The comparison window's label — "Jun", as printed on the tiles. */
  vs: string;
  days: number;
  now: Totals;
  before: Totals;
  categories: Slice[];
  sources: Slice[];
  onAccounts: number;
  onCards: number;
  fixed: { total: number; labels: string[] };
  biggest: Txn[];
};

/** At most this many bullets, stated in the prompt and enforced on the reply.
 *  Six paragraphs of AI prose next to a chart is a thing nobody reads twice. */
export const MAX_INSIGHTS = 4;

export type Insight = { title: string; detail: string };
export type Report = { summary: string; insights: Insight[] };

/** One prompt, one round trip. Every figure is spelled out and the model is
 *  told to use only these, because an invented number sitting beside the chart
 *  that contradicts it is worse than no analysis at all. */
export function buildInsightsPrompt(f: Facts): string {
  const lines = [
    `Period: ${f.win.label} (${f.win.from} to ${f.win.to}, ${f.days} days), compared with ${f.vs}.`,
    `Spent ${formatAmountRound(f.now.spent)} (previous ${formatAmountRound(f.before.spent)}).`,
    `Received ${formatAmountRound(f.now.received)} (previous ${formatAmountRound(f.before.received)}).`,
    `Net ${formatAmountRound(f.now.net)} (previous ${formatAmountRound(f.before.net)}).`,
    `Per day ${formatAmountRound(f.now.perDay)} (previous ${formatAmountRound(f.before.perDay)}).`,
    `Spend by category: ${f.categories.map((s) => `${s.label} ${formatAmountRound(s.amount)}`).join(", ") || "none"}.`,
    `Spend by source: ${f.sources.map((s) => `${s.label} ${formatAmountRound(s.amount)}`).join(", ") || "none"}.`,
    `Paid from accounts ${formatAmountRound(f.onAccounts)}, on cards ${formatAmountRound(f.onCards)}.`,
  ];
  if (f.fixed.labels.length > 0) {
    lines.push(
      `Fixed charges: ${formatAmountRound(f.fixed.total)} (${f.fixed.labels.join(", ")}).`,
    );
  }
  if (f.biggest.length > 0) {
    lines.push(
      `Biggest single spends: ${f.biggest
        .map((t) => `${t.title} ${formatAmountRound(t.amount)} (${t.category}, ${t.date})`)
        .join("; ")}.`,
    );
  }

  return [
    "You are a personal finance analyst. Below are the totals for one period of a user's spending, in Indian rupees.",
    "",
    ...lines,
    "",
    `Reply with JSON only: {"summary": "one sentence", "insights": [{"title": "three to six words", "detail": "one or two sentences"}]}.`,
    `Give at most ${MAX_INSIGHTS} insights, most important first. Each one must say something the figures show and, where it helps, what to do about it.`,
    "Use only the figures above — never invent a number, a category or a merchant. Do not add commentary outside the JSON.",
  ].join("\n");
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Reply -> the report the page renders.
 *
 * Anything malformed is dropped rather than rendered: a bullet with no title
 * is a blank row the user cannot interpret. A reply that survives with nothing
 * at all throws, because a button that reports success and paints an empty
 * card is indistinguishable from one that is broken.
 */
export function parseInsights(reply: string): Report {
  // Models wrap JSON in ```json fences even when told not to, and `format:
  // "json"` only makes that rarer, not impossible. Take the outermost braces.
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`Model did not answer with JSON: ${reply.slice(0, 120)}`);
  }

  let raw: { summary?: unknown; insights?: unknown };
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error(`Model's JSON did not parse: ${reply.slice(start, start + 120)}`);
  }

  const insights: Insight[] = (Array.isArray(raw.insights) ? raw.insights : [])
    .map((i): Insight => {
      const o = (i ?? {}) as Record<string, unknown>;
      return { title: text(o.title), detail: text(o.detail) };
    })
    // A detail with no title still carries its sentence; a title with no detail
    // is a heading over nothing, so the title is the one that is required.
    .filter((i) => i.title !== "")
    .slice(0, MAX_INSIGHTS);

  const summary = text(raw.summary);
  if (summary === "" && insights.length === 0) {
    throw new Error(`Model answered with no analysis: ${reply.slice(start, start + 120)}`);
  }
  return { summary, insights };
}
