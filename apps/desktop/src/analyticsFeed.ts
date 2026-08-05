// The shape the Analytics and Report screens read, and the window maths and
// aggregations over it. The rows themselves come from the ledger — see
// `ANALYTICS_FEED` in queries.ts and `loadFeed` in db.ts, and
// docs/analytics-real-feed.md.
//
// Nothing here touches the database: every function takes a `Txn[]` and knows
// nothing about where it came from, which is what lets `analytics.check.ts`
// run them under node against a deterministic fixture.

import { at, shiftDays, toIso, todayIso } from "./day.ts";

export type Txn = {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Minor units (paise), always positive — direction carries the sign. */
  amount: number;
  direction: "debit" | "credit";
  category: string;
  source: string;
  kind: "account" | "card";
  title: string;
};

// ---------------------------------------------------------------- windows

export type Period = "week" | "month" | "year" | "range";

export type Window = { from: string; to: string; label: string };

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const shortDay = (isoDate: string) => {
  const [, m, day] = isoDate.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]}`;
};

/** `offset` counts periods back from the one containing `today`. */
export function windowFor(period: Period, offset: number, today = todayIso()): Window {
  const d = new Date(`${today}T12:00:00`);

  if (period === "week") {
    // Weeks start Monday: a spending week that splits the weekend reads wrong.
    const mondayShift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - mondayShift - offset * 7);
    const from = toIso(d);
    d.setDate(d.getDate() + 6);
    const to = toIso(d);
    return { from, to, label: `${shortDay(from)} – ${shortDay(to)}` };
  }

  if (period === "month") {
    const start = new Date(d.getFullYear(), d.getMonth() - offset, 1, 12);
    const end = new Date(d.getFullYear(), d.getMonth() - offset + 1, 0, 12);
    return {
      from: toIso(start),
      to: toIso(end),
      label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
    };
  }

  const year = d.getFullYear() - offset;
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
}

/** The window of the same length immediately before `w` — what "vs previous"
 *  compares against. Calendar months and years step by name, not by day count,
 *  so February does not look like a 10% saving. */
export function previous(
  period: Period,
  w: Window,
  offset: number,
  today = todayIso(),
): Window {
  if (period === "range") {
    const days = daysBetween(w.from, w.to);
    const to = shiftDays(w.from, -1);
    return { from: shiftDays(to, -(days - 1)), to, label: "previous" };
  }
  // `today` has to be threaded through: stepping back from a window built on
  // one reference day using another lands somewhere neither caller meant.
  return windowFor(period, offset + 1, today);
}

const dayMs = 86_400_000;
export const daysBetween = (from: string, to: string) =>
  Math.round((at(to).getTime() - at(from).getTime()) / dayMs) + 1;

// ------------------------------------------------------------ aggregation

export const within = (feed: Txn[], w: Window) =>
  feed.filter((t) => t.date >= w.from && t.date <= w.to);

export type Totals = { spent: number; received: number; net: number; perDay: number };

export function totals(rows: Txn[], w: Window): Totals {
  const spent = sum(rows.filter((t) => t.direction === "debit"));
  const received = sum(rows.filter((t) => t.direction === "credit"));
  return {
    spent,
    received,
    net: received - spent,
    perDay: Math.round(spent / daysBetween(w.from, w.to)),
  };
}

const sum = (rows: Txn[]) => rows.reduce((s, t) => s + t.amount, 0);

export type Slice = { label: string; amount: number };

/** Debits grouped by a field, largest first. Everything past `keep` folds into
 *  "Other" — a ranked bar chart with 14 rows is a table nobody reads. */
export function rank(rows: Txn[], by: keyof Txn, keep = 6): Slice[] {
  const acc = new Map<string, number>();
  for (const t of rows) {
    if (t.direction !== "debit") continue;
    const k = String(t[by]);
    acc.set(k, (acc.get(k) ?? 0) + t.amount);
  }
  const all = [...acc].map(([label, amount]) => ({ label, amount }));
  all.sort((a, b) => b.amount - a.amount);
  if (all.length <= keep) return all;
  const rest = all.slice(keep).reduce((s, x) => s + x.amount, 0);
  return [...all.slice(0, keep), { label: "Other", amount: rest }];
}

/**
 * Categories that are one decision a year and the same figure every month.
 *
 * They are held out of the daily series on purpose. A ₹42,000 rent charge
 * against a ₹5,180 median peak turns a month into one wall and thirty slivers,
 * and a daily chart exists to show the days you can still change — rent answers
 * none of its questions. This is not hiding: the strip above the chart states
 * the figure before the chart does, and a tick keeps the day it fell on honest.
 */
export const FIXED = new Set(["Rent"]);

export type Fixed = { total: number; count: number; days: Set<string>; labels: string[] };

/** Splits the fixed charges out of a window's debits. When nothing is tagged
 *  fixed the chart falls back to plotting everything, which is correct — there
 *  is nothing to hold out. */
export function splitFixed(rows: Txn[]): { variable: Txn[]; fixed: Fixed } {
  const variable: Txn[] = [];
  const held: Txn[] = [];
  for (const t of rows) (FIXED.has(t.category) ? held : variable).push(t);
  return {
    variable,
    fixed: {
      total: sum(held.filter((t) => t.direction === "debit")),
      count: held.length,
      days: new Set(held.map((t) => t.date)),
      // Deduplicated: "rent, rent, rent" for a quarter is one fact stated once.
      labels: [...new Set(held.map((t) => t.title.toLowerCase()))],
    },
  };
}

export type Bucket = {
  label: string;
  amount: number;
  from: string;
  to: string;
  /** Debits folded into this bucket. The tooltip's third line — "₹3,560 over 4
   *  transactions" is a different day from "₹3,560 on one". */
  count: number;
};

/** Spend per bucket across the window. Day buckets up to a month, then weeks,
 *  then months — so a bar is never one pixel wide. */
export function buckets(rows: Txn[], w: Window): Bucket[] {
  const days = daysBetween(w.from, w.to);
  const step = days <= 31 ? 1 : days <= 186 ? 7 : 0; // 0 = calendar months
  const out: Bucket[] = [];

  if (step === 0) {
    const start = at(w.from);
    for (let i = 0; ; i++) {
      const b0 = new Date(start.getFullYear(), start.getMonth() + i, 1, 12);
      if (toIso(b0) > w.to) break;
      const b1 = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 12);
      out.push({
        label: MONTHS[b0.getMonth()],
        from: toIso(b0),
        to: toIso(b1) > w.to ? w.to : toIso(b1),
        amount: 0,
        count: 0,
      });
    }
  } else {
    for (let i = 0; i * step < days; i++) {
      const from = shiftDays(w.from, i * step);
      const to = shiftDays(from, step - 1);
      out.push({
        label: step === 1 ? String(Number(from.slice(8))) : shortDay(from),
        from,
        to: to > w.to ? w.to : to,
        amount: 0,
        count: 0,
      });
    }
  }

  for (const t of rows) {
    if (t.direction !== "debit") continue;
    const b = out.find((x) => t.date >= x.from && t.date <= x.to);
    if (b) {
      b.amount += t.amount;
      b.count++;
    }
  }
  return out;
}

export const biggest = (rows: Txn[], n = 5) =>
  rows
    .filter((t) => t.direction === "debit")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
