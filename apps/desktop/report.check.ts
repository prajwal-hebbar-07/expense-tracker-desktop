// Run: pnpm --filter desktop test
//
// The report makes claims with numbers in them. These check that the numbers
// are arithmetic rather than decoration — and that an empty or one-sided window
// produces a report rather than "NaN% of Infinity".
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Txn, Window } from "./src/analyticsFeed.ts";
import { FEED, within, windowFor } from "./src/analyticsFeed.ts";
import { buildReport } from "./src/report.ts";

const TODAY = "2026-07-31";
const july = windowFor("month", 0, TODAY);
const june = windowFor("month", 1, TODAY);
const report = buildReport(within(FEED, july), july, within(FEED, june));

const text = (r = report) =>
  [
    r.headline,
    ...r.findings.flatMap((f) => [f.title, f.figure, f.why]),
    ...r.habits.flatMap((h) => [h.title, h.how]),
    ...r.reframes.flatMap((f) => [f.title, f.body]),
  ].join(" ");

test("essentials and controllable account for every rupee spent", () => {
  assert.equal(report.essentials + report.discretionary, report.spent);
  assert.ok(report.spent > 0);
});

test("no claim contains a broken number", () => {
  // The whole page is template strings over division. One zero denominator and
  // the user reads "NaN× your rent" in an app about money.
  assert.doesNotMatch(text(), /NaN|Infinity|undefined|null/);
});

test("the target cuts only the controllable half", () => {
  assert.ok(report.target < report.spent, "a target above what was spent is not a target");
  assert.ok(
    report.target >= report.essentials,
    "a target below essentials would require moving house",
  );
});

test("an empty window reports nothing rather than dividing by zero", () => {
  const empty: Window = { from: "2030-01-01", to: "2030-01-31", label: "Jan 2030" };
  const r = buildReport([], empty, []);
  assert.equal(r.spent, 0);
  assert.deepEqual([r.findings, r.habits, r.reframes], [[], [], []]);
  assert.doesNotMatch(text(r), /NaN|Infinity/);
});

test("a window with no income still produces reframes", () => {
  // "days worked" divides by income; without a salary that rule must sit out
  // rather than emit a division by zero.
  const noIncome = within(FEED, july).filter((t: Txn) => t.direction === "debit");
  const r = buildReport(noIncome, july, []);
  assert.ok(r.reframes.length > 0);
  assert.doesNotMatch(text(r), /NaN|Infinity/);
});

test("habit savings are never larger than what was spent", () => {
  const claimed = report.habits.reduce((s, h) => s + h.saves, 0);
  assert.ok(
    claimed < report.discretionary,
    "promising a saving bigger than the controllable spend is a lie the page can tell",
  );
});

test("findings carry a severity the UI knows how to render", () => {
  for (const f of report.findings) {
    assert.ok(["watch", "note", "good"].includes(f.severity), f.severity);
    assert.ok(f.why.length > 20, "a finding without a reason is just a statistic");
  }
});
