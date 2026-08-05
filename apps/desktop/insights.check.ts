// Run: pnpm --filter desktop test
//
// The half that breaks is the reply: a model answers with prose, fences its
// JSON, hands back a bullet with no title, or writes ten of them. Each of
// those either paints a blank row next to the charts or throws in render.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_INSIGHTS, buildInsightsPrompt, parseInsights, type Facts } from "./src/insights.ts";

const facts: Facts = {
  win: { from: "2026-07-01", to: "2026-07-31", label: "Jul 2026" },
  vs: "Jun",
  days: 31,
  now: { spent: 12_345_600, received: 20_000_000, net: 7_654_400, perDay: 398_245 },
  before: { spent: 10_000_000, received: 20_000_000, net: 10_000_000, perDay: 333_333 },
  categories: [
    { label: "Rent", amount: 4_500_000 },
    { label: "Groceries", amount: 1_200_000 },
  ],
  sources: [{ label: "HDFC", amount: 9_000_000 }],
  onAccounts: 9_000_000,
  onCards: 3_345_600,
  fixed: { total: 4_500_000, labels: ["Rent"] },
  biggest: [
    {
      date: "2026-07-01",
      amount: 4_500_000,
      direction: "debit",
      category: "Rent",
      source: "HDFC",
      kind: "account",
      title: "July rent",
    },
  ],
};

test("the prompt carries the window, both periods' figures and the rankings", () => {
  const p = buildInsightsPrompt(facts);
  assert.match(p, /Jul 2026 \(2026-07-01 to 2026-07-31, 31 days\), compared with Jun/);
  // Rounded rupees, and the comparison figure beside the current one — without
  // it the model invents a trend from a single number.
  assert.match(p, /Spent ₹1,23,456 \(previous ₹1,00,000\)/);
  assert.match(p, /Rent ₹45,000/);
  assert.match(p, /Spend by source: HDFC ₹90,000/);
  assert.match(p, /July rent ₹45,000 \(Rent, 2026-07-01\)/);
  assert.match(p, /never invent a number/);
});

test("empty rankings say so rather than trailing off", () => {
  const p = buildInsightsPrompt({ ...facts, categories: [], sources: [], biggest: [] });
  assert.match(p, /Spend by category: none\./);
  assert.doesNotMatch(p, /Biggest single spends/);
});

test("a clean answer parses to a summary and its bullets", () => {
  const r = parseInsights(
    '{"summary":"You spent 23% more.","insights":[{"title":"Rent dominates","detail":"₹45,000 of ₹1,23,456."}]}',
  );
  assert.equal(r.summary, "You spent 23% more.");
  assert.deepEqual(r.insights, [{ title: "Rent dominates", detail: "₹45,000 of ₹1,23,456." }]);
});

test("fences and commentary around the JSON are tolerated", () => {
  const reply = 'Sure!\n```json\n{"summary":"Steady month.","insights":[]}\n```\nHope that helps.';
  assert.equal(parseInsights(reply).summary, "Steady month.");
});

test("a bullet with no title is dropped, not rendered blank", () => {
  const r = parseInsights(
    '{"summary":"ok","insights":[{"detail":"orphan"},{"title":" Cards climbing ","detail":42}]}',
  );
  assert.deepEqual(r.insights, [{ title: "Cards climbing", detail: "" }]);
});

test("more bullets than asked for are cut to the cap", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, detail: "d" }));
  const r = parseInsights(JSON.stringify({ summary: "ok", insights: many }));
  assert.equal(r.insights.length, MAX_INSIGHTS);
  assert.equal(r.insights[0].title, "t0", "the model orders by importance; keep the head");
});

test("a reply that is not JSON, or carries no analysis, is an error", () => {
  assert.throws(() => parseInsights("I cannot help with that."), /did not answer with JSON/);
  assert.throws(() => parseInsights('{"summary": ok}'), /did not parse/);
  // Valid JSON with nothing in it would otherwise paint an empty card and read
  // as a broken button.
  assert.throws(() => parseInsights('{"summary":"  ","insights":[]}'), /no analysis/);
  assert.throws(() => parseInsights('{"insights":"soon"}'), /no analysis/);
});
