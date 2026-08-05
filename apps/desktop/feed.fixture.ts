// Fixture data for the `*.check.ts` files only. Nothing under `src/` imports
// this, and nothing here ships: the app reads the real ledger (`ANALYTICS_FEED`
// in `src/queries.ts`, `loadFeed` in `src/db.ts`).
//
// It exists because the aggregation invariants the checks defend — buckets
// summing to the window's spend, ranking folding a tail into "Other" without
// losing rupees, windows landing on month and week boundaries — need a
// deterministic feed that spans many months and has a long enough tail to fold.
// A real database guarantees none of that: a developer's ledger can be empty,
// one-sided, or a single week long, and the assertions would pass by accident.
//
// The generator is seeded (20260801), so the numbers are the same on every run.
// Categories use the closed vocabulary from `src/categorize.ts`.
import type { Txn } from "./src/analyticsFeed.ts";

const CATEGORIES = [
  ["Rent", 1],
  ["Groceries", 6],
  ["Food & Dining", 5],
  ["Transport", 4],
  ["Shopping", 3],
  ["Bills & Utilities", 2],
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
  "Food & Dining": ["Swiggy", "Third Wave Coffee", "Toit", "Zomato"],
  Transport: ["Uber", "Metro card", "Indian Oil", "Rapido"],
  Shopping: ["Amazon", "Decathlon", "Croma"],
  "Bills & Utilities": ["Electricity", "Airtel Fiber", "Water bill"],
  Health: ["Apollo Pharmacy", "Cult.fit", "Dental"],
  Subscriptions: ["Netflix", "Spotify", "iCloud", "Notion"],
};

/** Deterministic LCG — the checks must not reshuffle themselves per run. */
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

    // Income lands on the 1st; so does rent.
    if (d.getDate() === 1) {
      out.push({
        date,
        amount: 1_85_000_00 + Math.floor(rnd() * 4_000_00),
        direction: "credit",
        category: "Income",
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
      const canBeLarge = /Shopping|Food & Dining|Health|Groceries/.test(category);
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

/** The newest day the generator emits. Checks that need a reference day inside
 *  the fixture use this instead of the real clock, so a window is never a month
 *  with two days in it. */
export const FIXTURE_TODAY = "2026-07-31";
