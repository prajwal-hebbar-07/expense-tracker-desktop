// Run: pnpm --filter desktop test
//
// The feed is fixture data (see `feed.fixture.ts`), but the window and bucket
// maths is real: an off-by-one on a month boundary silently drops or
// double-counts a day's spending, and no amount of looking at the chart would
// show it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED } from "./feed.fixture.ts";
import {
  buckets,
  daysBetween,
  previous,
  rank,
  splitFixed,
  totals,
  within,
  windowFor,
} from "./src/analyticsFeed.ts";

// The checks pin their own reference day and pass it to every `windowFor` /
// `previous` call, so they never depend on the real clock.
const TODAY = "2026-08-01"; // a Saturday

test("windows land on the right boundaries", () => {
  // Weeks start Monday, so the week holding Sat 1 Aug 2026 opens on 27 Jul.
  assert.deepEqual(
    { ...windowFor("week", 0, TODAY) },
    { from: "2026-07-27", to: "2026-08-02", label: "27 Jul – 2 Aug" },
  );
  assert.equal(windowFor("week", 2, TODAY).from, "2026-07-13");

  const july = windowFor("month", 1, TODAY);
  assert.equal(july.from, "2026-07-01");
  assert.equal(july.to, "2026-07-31", "month must end on the last day, not the 30th");
  assert.equal(july.label, "Jul 2026");

  // February, the month that catches a "+30 days" implementation.
  assert.equal(windowFor("month", 6, TODAY).to, "2026-02-28");
  assert.deepEqual({ ...windowFor("year", 1, TODAY) }, {
    from: "2025-01-01",
    to: "2025-12-31",
    label: "2025",
  });
});

test("the previous window abuts the current one and never overlaps", () => {
  const july = windowFor("month", 1, TODAY);
  const june = previous("month", july, 1, TODAY);
  assert.equal(june.to, "2026-06-30");
  assert.ok(june.to < july.from);

  const range = { from: "2026-05-10", to: "2026-05-19", label: "" }; // 10 days
  const before = previous("range", range, 0);
  assert.equal(daysBetween(before.from, before.to), 10, "same length as the range");
  assert.equal(before.to, "2026-05-09", "ends the day before the range starts");
});

test("every debit in the window lands in exactly one bucket", () => {
  for (const [period, offset] of [
    ["week", 0],
    ["month", 1],
    ["year", 1],
  ] as const) {
    const w = windowFor(period, offset, TODAY);
    const rows = within(FEED, w);
    const binned = buckets(rows, w).reduce((s, b) => s + b.amount, 0);
    assert.equal(binned, totals(rows, w).spent, `${period}: buckets must sum to spend`);
  }
});

test("a year bucketises into 12 months, a week into 7 days", () => {
  const year = windowFor("year", 1, TODAY);
  assert.equal(buckets(within(FEED, year), year).length, 12);

  const week = windowFor("week", 0, TODAY);
  assert.equal(buckets(within(FEED, week), week).length, 7);
});

test("ranking folds the tail into Other without losing rupees", () => {
  const w = windowFor("month", 1, TODAY);
  const rows = within(FEED, w);
  const ranked = rank(rows, "category", 3);

  assert.equal(ranked.length, 4);
  assert.equal(ranked.at(-1)!.label, "Other");
  assert.equal(
    ranked.reduce((s, r) => s + r.amount, 0),
    totals(rows, w).spent,
    "the slices must still add up to everything spent",
  );
  assert.ok(ranked[0].amount >= ranked[1].amount, "sorted largest first");
});

test("credits never count as spending", () => {
  const w = windowFor("month", 1, TODAY);
  const rows = within(FEED, w);
  const t = totals(rows, w);
  assert.ok(t.received > 0, "the fixture feed pays an income");
  assert.equal(
    rank(rows, "category").find((r) => r.label === "Income"),
    undefined,
  );
  assert.equal(t.net, t.received - t.spent);
});

// The chart holds fixed charges out of the daily series. That is only honest as
// long as the two halves still add up to the whole and the held-out days are
// still named — a split that loses money, or loses the day it happened on, is
// the "hiding" the treatment was chosen to avoid.
test("the split loses nothing", () => {
  const win = windowFor("month", 1, TODAY);
  const rows = within(FEED, win);
  const { variable, fixed } = splitFixed(rows);

  const spent = (xs: typeof rows) =>
    xs.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);

  assert.equal(variable.length + fixed.count, rows.length, "no row is dropped");
  assert.equal(
    spent(variable) + fixed.total,
    spent(rows),
    "variable + fixed is the whole month's spending",
  );
});

test("a held-out charge keeps its day, so the tick has somewhere to land", () => {
  const win = windowFor("month", 1, TODAY);
  const { fixed } = splitFixed(within(FEED, win));
  assert.ok(fixed.count > 0, "the feed books rent on the 1st");
  for (const day of fixed.days) {
    assert.ok(day >= win.from && day <= win.to, `${day} is inside the window`);
    assert.ok(
      buckets(within(FEED, win), win).some((b) => day >= b.from && day <= b.to),
      `${day} falls in a bucket the tick can mark`,
    );
  }
});

test("holding out a charge lowers the peak the axis is scaled to", () => {
  // The whole reason for the treatment: one ₹42,000 wall flattens thirty days
  // of variable spending into slivers.
  const win = windowFor("month", 1, TODAY);
  const rows = within(FEED, win);
  const peak = (xs: typeof rows) => Math.max(...buckets(xs, win).map((b) => b.amount));
  assert.ok(peak(splitFixed(rows).variable) < peak(rows));
});

test("nothing tagged fixed is a valid split, not a crash", () => {
  const rows = within(FEED, windowFor("month", 1, TODAY)).filter(
    (t) => t.category !== "Rent",
  );
  const { variable, fixed } = splitFixed(rows);
  assert.equal(fixed.count, 0);
  assert.equal(fixed.total, 0);
  assert.equal(variable.length, rows.length, "the chart falls back to plotting everything");
});
