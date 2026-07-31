// The consolidated feed the Analytics page reads.
//
// Everything below the `Txn` type is MOCK data, generated once at import with a
// fixed seed so the page is stable across renders and reloads. Swapping in the
// real thing means replacing `FEED` with a query — the aggregation functions
// underneath take a `Txn[]` and know nothing about where it came from.
// ponytail: mock feed; replace FEED with a SQL read when the page earns it.

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

const CATEGORIES = [
  ["Rent", 1],
  ["Groceries", 6],
  ["Eating out", 5],
  ["Transport", 4],
  ["Shopping", 3],
  ["Utilities", 2],
  ["Health", 1],
  ["Subscriptions", 2],
] as const;

const SOURCES = [
  { source: "HDFC", kind: "account" as const, weight: 5 },
  { source: "ICICI", kind: "account" as const, weight: 2 },
  { source: "HDFC Regalia", kind: "card" as const, weight: 6 },
  { source: "Amex Platinum", kind: "card" as const, weight: 3 },
];

const TITLES: Record<string, string[]> = {
  Rent: ["Flat rent"],
  Groceries: ["BigBasket", "Local kirana", "Zepto"],
  "Eating out": ["Swiggy", "Third Wave Coffee", "Toit", "Zomato"],
  Transport: ["Uber", "Metro card", "Indian Oil", "Rapido"],
  Shopping: ["Amazon", "Decathlon", "Croma"],
  Utilities: ["Electricity", "Airtel Fiber", "Water bill"],
  Health: ["Apollo Pharmacy", "Cult.fit", "Dental"],
  Subscriptions: ["Netflix", "Spotify", "iCloud", "Notion"],
};

/** Deterministic LCG — the page must not reshuffle itself on every render. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const pick = <T,>(rnd: () => number, xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

const weighted = <T extends { weight: number }>(rnd: () => number, xs: T[]) => {
  let n = rnd() * xs.reduce((s, x) => s + x.weight, 0);
  for (const x of xs) if ((n -= x.weight) < 0) return x;
  return xs[xs.length - 1];
};

const iso = (d: Date) => d.toLocaleDateString("en-CA");

function generate(from: string, to: string): Txn[] {
  const rnd = random(20260801);
  const bag = CATEGORIES.flatMap(([name, w]) => Array<string>(w).fill(name));
  const out: Txn[] = [];

  for (const d = new Date(`${from}T12:00:00`); iso(d) <= to; d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    const day = d.getDay();
    const weekend = day === 0 || day === 6;

    // Salary lands on the 1st; so does rent.
    if (d.getDate() === 1) {
      out.push({
        date,
        amount: 1_85_000_00 + Math.floor(rnd() * 4_000_00),
        direction: "credit",
        category: "Salary",
        source: "HDFC",
        kind: "account",
        title: "Salary",
      });
      out.push({
        date,
        amount: 42_000_00,
        direction: "debit",
        category: "Rent",
        source: "HDFC",
        kind: "account",
        title: "Flat rent",
      });
    }

    for (let i = 0, n = (weekend ? 3 : 2) + Math.floor(rnd() * 3); i < n; i++) {
      const category = pick(rnd, bag);
      if (category === "Rent") continue; // rent is monthly, booked above
      const { source, kind } = weighted(rnd, SOURCES);
      // Long tail: most spends are small, a few are not.
      // Long tail: ₹80–₹980 most days, ₹400–₹6,400 for the occasional big one —
      // but only where a big one is plausible. A ₹6,000 Netflix charge would
      // make the report's "sleep on anything over ₹3,000" advice look silly.
      const canBeLarge = /Shopping|Eating out|Health|Groceries/.test(category);
      const base =
        canBeLarge && rnd() < 0.15 ? 400_00 + rnd() * 6_000_00 : 80_00 + rnd() * 900_00;
      out.push({
        date,
        amount: Math.round(base / 50_0) * 50_0,
        direction: "debit",
        category,
        source,
        kind,
        title: pick(rnd, TITLES[category]),
      });
    }
  }
  return out;
}

/** Roughly 19 months back from the newest day, so a year view has a full year
 *  behind it and the previous-period comparison always has something to read. */
export const FEED: Txn[] = generate("2025-01-01", "2026-07-31");

/** The newest day in the feed. Every window is relative to this rather than to
 *  the real clock, so the page never opens on a month with two days in it. */
export const TODAY = "2026-07-31";

// ---------------------------------------------------------------- windows

export type Period = "week" | "month" | "year" | "range";

export type Window = { from: string; to: string; label: string };

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const shortDay = (isoDate: string) => {
  const [, m, day] = isoDate.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]}`;
};

/** `offset` counts periods back from the one containing `today`. */
export function windowFor(period: Period, offset: number, today = TODAY): Window {
  const d = new Date(`${today}T12:00:00`);

  if (period === "week") {
    // Weeks start Monday: a spending week that splits the weekend reads wrong.
    const mondayShift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - mondayShift - offset * 7);
    const from = iso(d);
    d.setDate(d.getDate() + 6);
    const to = iso(d);
    return { from, to, label: `${shortDay(from)} – ${shortDay(to)}` };
  }

  if (period === "month") {
    const start = new Date(d.getFullYear(), d.getMonth() - offset, 1, 12);
    const end = new Date(d.getFullYear(), d.getMonth() - offset + 1, 0, 12);
    return {
      from: iso(start),
      to: iso(end),
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
  today = TODAY,
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
const asDate = (s: string) => new Date(`${s}T12:00:00`);
export const daysBetween = (from: string, to: string) =>
  Math.round((asDate(to).getTime() - asDate(from).getTime()) / dayMs) + 1;

function shiftDays(from: string, n: number) {
  const d = asDate(from);
  d.setDate(d.getDate() + n);
  return iso(d);
}

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

export type Bucket = { label: string; amount: number; from: string; to: string };

/** Spend per bucket across the window. Day buckets up to a month, then weeks,
 *  then months — so a bar is never one pixel wide. */
export function buckets(rows: Txn[], w: Window): Bucket[] {
  const days = daysBetween(w.from, w.to);
  const step = days <= 31 ? 1 : days <= 186 ? 7 : 0; // 0 = calendar months
  const out: Bucket[] = [];

  if (step === 0) {
    const start = asDate(w.from);
    for (let i = 0; ; i++) {
      const b0 = new Date(start.getFullYear(), start.getMonth() + i, 1, 12);
      if (iso(b0) > w.to) break;
      const b1 = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 12);
      out.push({
        label: MONTHS[b0.getMonth()],
        from: iso(b0),
        to: iso(b1) > w.to ? w.to : iso(b1),
        amount: 0,
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
      });
    }
  }

  for (const t of rows) {
    if (t.direction !== "debit") continue;
    const b = out.find((x) => t.date >= x.from && t.date <= x.to);
    if (b) b.amount += t.amount;
  }
  return out;
}

export const biggest = (rows: Txn[], n = 5) =>
  rows
    .filter((t) => t.direction === "debit")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
