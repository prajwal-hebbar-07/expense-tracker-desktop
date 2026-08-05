// Run: pnpm --filter desktop test
//
// The prompt is the only thing standing between the model and a number it
// invented, and the reply is the half that breaks: a model fences its JSON,
// hands back a finding with no figure, invents a severity the page has no
// colour for, or promises a saving larger than the spend it came from. Each of
// those either paints a broken card or prints a lie about someone's money.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED, FIXTURE_TODAY } from "./feed.fixture.ts";
import { windowFor, within } from "./src/analyticsFeed.ts";
import { buildFacts } from "./src/report.ts";
import {
  MAX_FINDINGS,
  MAX_HABITS,
  MAX_REFRAMES,
  buildReportPrompt,
  parseWrittenReport,
} from "./src/reportAi.ts";

const july = windowFor("month", 0, FIXTURE_TODAY);
const june = windowFor("month", 1, FIXTURE_TODAY);
const facts = buildFacts(within(FEED, july), july, within(FEED, june));
const prompt = buildReportPrompt(facts);

test("the prompt states the window, the split and the categories", () => {
  assert.match(prompt, new RegExp(`${july.from} to ${july.to}, ${facts.days} days`));
  assert.match(prompt, /Essentials \(rent, groceries, bills, health\) ₹[\d,.]+ — \d+%/);
  assert.match(prompt, /Controllable, everything else ₹[\d,.]+ — \d+%/);
  assert.match(prompt, /Spend by category: [A-Z]/);
  assert.match(prompt, /never invent a number/);
});

test("the prompt does the dividing, so the model never has to", () => {
  // Every ratio the report could want is already a figure. A model asked to
  // divide is a model that will get it wrong next to the bar that shows it.
  assert.match(prompt, /a day\./);
  assert.match(prompt, /On cards ₹[\d,.]+ — \d+% of the total/);
  assert.match(prompt, /Suggested cap for the next period, already computed: ₹[\d,.]+/);
});

test("no figure in the prompt is broken", () => {
  assert.doesNotMatch(prompt, /NaN|Infinity|undefined|null/);
  const empty = windowFor("month", 0, "2030-01-15");
  assert.doesNotMatch(buildReportPrompt(buildFacts([], empty, [])), /NaN|Infinity|undefined/);
});

test("the savings budget is stated in rupees, not paise", () => {
  // Handing the model 120000 for ₹1,200 is how a report ends up promising a
  // saving a hundred times the spend it came from.
  const budget = Math.round(facts.discretionary / facts.months / 100);
  assert.match(prompt, new RegExp(`must stay under ${budget},`));
});

test("unfiled rows are named as missing information, never as a habit", () => {
  const unfiled = within(FEED, july).map((t) => ({ ...t, category: "Uncategorised" }));
  const p = buildReportPrompt(buildFacts(unfiled, july, []));
  assert.match(p, /rows nobody has filed yet, not a kind of spending/);
  assert.match(p, /Transactions → Categorise/);
});

const clean = JSON.stringify({
  headline: "Two thirds of your spending was controllable.",
  findings: [
    { title: "Eating out led it", figure: "₹12,000 · 24%", why: "Three times cooked.", severity: "watch" },
  ],
  habits: [{ title: "Cook two dinners", how: "Swap two orders.", saves: 1500 }],
  reframes: [{ title: "By the year", body: "₹1,44,000 a year." }],
});

test("a clean answer parses into the shape the page renders", () => {
  const w = parseWrittenReport(clean, 50_000_00);
  assert.equal(w.headline, "Two thirds of your spending was controllable.");
  assert.deepEqual(w.findings[0], {
    title: "Eating out led it",
    figure: "₹12,000 · 24%",
    why: "Three times cooked.",
    severity: "watch",
  });
  // Rupees on the wire, paise in the app — the badge reads ~₹1,500/mo.
  assert.equal(w.habits[0].saves, 1500_00);
  assert.deepEqual(w.reframes, [{ title: "By the year", body: "₹1,44,000 a year." }]);
});

test("fences and commentary around the JSON are tolerated", () => {
  assert.equal(
    parseWrittenReport("Here you go!\n```json\n" + clean + "\n```\n", 50_000_00).headline,
    "Two thirds of your spending was controllable.",
  );
});

test("a finding without its figure is dropped, never rendered", () => {
  // docs/report-page.md rule 1: a claim with no number is an opinion, and this
  // app has no standing to have those.
  const w = parseWrittenReport(
    '{"headline":"ok","findings":[{"title":"You spend too much","why":"Be careful.","severity":"watch"},{"title":"Cards","figure":"₹9,000","why":"45 days.","severity":"note"}]}',
    50_000_00,
  );
  assert.deepEqual(
    w.findings.map((f) => f.title),
    ["Cards"],
  );
});

test("a severity the page has no colour for becomes the one that claims nothing", () => {
  const w = parseWrittenReport(
    '{"headline":"ok","findings":[{"title":"t","figure":"₹1","why":"w","severity":"CRITICAL"},{"title":"u","figure":"₹2","why":"w","severity":"GOOD"}]}',
    50_000_00,
  );
  assert.deepEqual(
    w.findings.map((f) => f.severity),
    ["note", "good"],
  );
});

test("estimated savings can never total more than the controllable spend", () => {
  const greedy = JSON.stringify({
    headline: "ok",
    habits: [
      { title: "a", how: "h", saves: 9_000_000 },
      { title: "b", how: "h", saves: 4_000 },
      { title: "c", how: "h", saves: "not a number" },
    ],
  });
  const w = parseWrittenReport(greedy, 10_000_00);
  const claimed = w.habits.reduce((s, h) => s + h.saves, 0);
  assert.ok(claimed < 10_000_00, `claimed ${claimed} of a 1000000 budget`);
  assert.ok(w.habits.every((h) => h.saves >= 0 && Number.isFinite(h.saves)));
  // Ranked by what they save, like the rules version — never by order given.
  assert.deepEqual([...w.habits].sort((a, b) => b.saves - a.saves), w.habits);
});

test("more sections than asked for are cut to the caps", () => {
  const many = (n: number, extra: object) =>
    Array.from({ length: n }, (_, i) => ({ title: `t${i}`, ...extra }));
  const w = parseWrittenReport(
    JSON.stringify({
      headline: "ok",
      findings: many(9, { figure: "₹1", why: "w", severity: "note" }),
      habits: many(9, { how: "h", saves: 0 }),
      reframes: many(9, { body: "b" }),
    }),
    50_000_00,
  );
  assert.equal(w.findings.length, MAX_FINDINGS);
  assert.equal(w.habits.length, MAX_HABITS);
  assert.equal(w.reframes.length, MAX_REFRAMES);
});

test("a reply that is not JSON, or carries no report, is an error", () => {
  assert.throws(() => parseWrittenReport("I cannot help with that.", 100), /did not answer with JSON/);
  assert.throws(() => parseWrittenReport('{"headline": ok}', 100), /did not parse/);
  // Valid JSON with nothing usable in it would paint a page that looks broken.
  assert.throws(() => parseWrittenReport('{"headline":"  ","findings":[]}', 100), /no report/);
  assert.throws(
    () => parseWrittenReport('{"findings":[{"why":"orphan"}],"habits":[{"how":"x"}]}', 100),
    /no report/,
  );
});
