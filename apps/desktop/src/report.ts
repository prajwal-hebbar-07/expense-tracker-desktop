// Turns a window of transactions into a written report: what stands out, why it
// costs something, and what to do differently.
//
// Deliberately RULES, not a model. Every sentence is derived from a figure in
// the feed, so a claim on this page can always be traced to an arithmetic
// operation on the rows — which is the difference between a report and a
// horoscope. If a generated version ever replaces it, this file is the contract
// that version has to fill: same `Report` shape, same "every claim carries its
// number" rule.
// ponytail: threshold constants tuned by eye against the mock feed; move them
// into user settings only if someone actually wants to change them.

// Explicit .ts extensions and `import type`: report.check.ts runs this file
// under node, whose loader neither guesses extensions nor erases a type
// imported in value position.
import type { Txn, Window } from "./analyticsFeed.ts";
import { daysBetween } from "./analyticsFeed.ts";
import { CATEGORIES } from "./categorize.ts";
import { formatAmount, formatAmountRound } from "./money.ts";

/** Every category string in this file is one of the closed list the model
 *  writes (docs/expense-categories.md). Typing them as `Category` is what
 *  stops a rename over there from silently switching a finding off here —
 *  which is exactly what the mock feed's own vocabulary ("Eating out",
 *  "Utilities") did until the ledger replaced it. */
type Category = (typeof CATEGORIES)[number];

const FOOD: Category = "Food & Dining";
const SUBSCRIPTIONS: Category = "Subscriptions";

/** Not a category: the label `ANALYTICS_FEED` gives a row nothing has filed
 *  yet. It is excluded from every *finding*, because "your biggest
 *  controllable cost is the spending you have not labelled" is not advice —
 *  it is a description of the ledger's state, and rule 1 below turns it into
 *  the one action that fixes it. It still counts in every total: the money
 *  moved whether or not anyone named it. */
const UNFILED = "Uncategorised";

/** Spending you cannot stop this month without changing where you live or what
 *  you eat. The split drives most of the report — a report that tells you to
 *  cut rent is not a report. */
const ESSENTIAL: Record<string, true | undefined> = {
  Rent: true,
  Groceries: true,
  "Bills & Utilities": true,
  Health: true,
} satisfies Partial<Record<Category, true>>;

const SMALL = 500_00; // ₹500 — the "didn't think about it" threshold
const BIG = 3_000_00; // ₹3,000 — the "should have slept on it" threshold

export type Severity = "watch" | "note" | "good";

export type Finding = {
  /** Headline, e.g. "Eating out is your biggest controllable cost". */
  title: string;
  /** The number that makes the claim checkable. */
  figure: string;
  /** Why it costs something. One sentence, no lecture. */
  why: string;
  severity: Severity;
};

export type Habit = {
  title: string;
  /** What to actually do, concretely enough to start tomorrow. */
  how: string;
  /** Estimated monthly saving, in paise. `0` when the habit is not about money. */
  saves: number;
};

export type Reframe = { title: string; body: string };

export type Report = {
  window: Window;
  days: number;
  spent: number;
  essentials: number;
  discretionary: number;
  headline: string;
  findings: Finding[];
  habits: Habit[];
  reframes: Reframe[];
  /** Suggested cap for the next period, in paise. */
  target: number;
};

const sum = (rows: Txn[]) => rows.reduce((s, t) => s + t.amount, 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Debits only, grouped and summed. */
function byCategory(rows: Txn[]) {
  const acc = new Map<string, number>();
  for (const t of rows) acc.set(t.category, (acc.get(t.category) ?? 0) + t.amount);
  return [...acc].sort((a, b) => b[1] - a[1]);
}

export function buildReport(all: Txn[], win: Window, prevRows: Txn[]): Report {
  const rows = all.filter((t) => t.direction === "debit");
  const spent = sum(rows);
  const days = daysBetween(win.from, win.to);
  const months = Math.max(days / 30, 0.25);

  const essentials = sum(rows.filter((t) => ESSENTIAL[t.category]));
  const discretionary = spent - essentials;
  const cats = byCategory(rows);
  const topControllable = cats.find(([c]) => !ESSENTIAL[c] && c !== UNFILED);

  const findings: Finding[] = [];
  const habits: Habit[] = [];
  const reframes: Reframe[] = [];

  // Empty window: say so and stop. Every rule below divides by something.
  if (!rows.length) {
    return {
      window: win,
      days,
      spent: 0,
      essentials: 0,
      discretionary: 0,
      headline: "Nothing was spent in this window, so there is nothing to report.",
      findings: [],
      habits: [],
      reframes: [],
      target: 0,
    };
  }

  // 1 — the biggest thing you can actually change
  if (topControllable) {
    const [name, amount] = topControllable;
    findings.push({
      title: `${name} is your biggest controllable cost`,
      figure: `${formatAmount(amount)} · ${pct(amount, spent)}% of everything you spent`,
      why: `Rent and bills are fixed for now; ${name.toLowerCase()} is the largest line you can move without changing anything structural about your life.`,
      severity: pct(amount, discretionary) > 40 ? "watch" : "note",
    });
  }

  // 1b — the ledger's own gap. Stated before anything derived from categories,
  // because a report built on a third of the rows should say so first.
  const unfiled = sum(rows.filter((t) => t.category === UNFILED));
  if (pct(unfiled, spent) >= 20) {
    findings.push({
      title: "Most of this period is unfiled",
      figure: `${formatAmount(unfiled)} · ${pct(unfiled, spent)}% has no category`,
      why: "Every split below reads only the rows that have one, so this share is the margin of error on the whole report.",
      severity: pct(unfiled, spent) >= 50 ? "watch" : "note",
    });
    habits.push({
      title: "Categorise before you read this page",
      how: "Transactions → Categorise files everything on screen in one press. The report re-reads the ledger, so the sections below sharpen as soon as it finishes.",
      saves: 0,
    });
  }

  // 2 — eating out measured against the thing it replaces
  const eatingOut = sum(rows.filter((t) => t.category === FOOD));
  const groceries = sum(rows.filter((t) => t.category === "Groceries"));
  if (eatingOut > 0 && groceries > 0) {
    const ratio = eatingOut / groceries;
    if (ratio >= 1) {
      findings.push({
        title: "You are buying more meals than ingredients",
        figure: `${formatAmount(eatingOut)} eating out vs ${formatAmount(groceries)} on groceries — ${ratio.toFixed(1)}×`,
        why: "A delivered meal runs roughly three times what the same food costs cooked, so this ratio is the single largest multiplier on your food budget.",
        severity: ratio >= 1.5 ? "watch" : "note",
      });
      const orders = rows.filter((t) => t.category === FOOD).length;
      const perMeal = Math.round(eatingOut / Math.max(orders, 1));
      habits.push({
        title: "Cook two more dinners a week",
        how: `Your average order is ${formatAmountRound(perMeal)}. Two fewer a week, with ingredients costing about a third, is the fastest cut available to you.`,
        saves: Math.round(perMeal * 8 * 0.66),
      });
    } else {
      findings.push({
        title: "Your kitchen is doing the work",
        figure: `${formatAmount(groceries)} on groceries vs ${formatAmount(eatingOut)} eating out`,
        why: "Cooking more than you order is the habit most people are still trying to build. Nothing to fix here.",
        severity: "good",
      });
    }
  }

  // 3 — the drip that never feels like a decision
  const smalls = rows.filter((t) => t.amount < SMALL && !ESSENTIAL[t.category]);
  if (smalls.length >= 5) {
    const drip = sum(smalls);
    findings.push({
      title: "Small taps add up to a large number",
      figure: `${smalls.length} spends under ${formatAmountRound(SMALL)}, together ${formatAmount(drip)}`,
      why: "Each one is too small to think about, which is exactly why they never get counted — but together they are a bill you never agreed to.",
      severity: pct(drip, discretionary) > 25 ? "watch" : "note",
    });
    reframes.push({
      title: "Count the taps, not the rupees",
      body: `You made ${smalls.length} small purchases in ${days} days — about ${(smalls.length / days).toFixed(1)} a day. Deciding once to halve the count is easier than deciding ${smalls.length} separate times to spend less.`,
    });
  }

  // 4 — subscriptions, priced the way they are actually paid
  const subs = sum(rows.filter((t) => t.category === SUBSCRIPTIONS));
  if (subs > 0) {
    const perYear = Math.round((subs / months) * 12);
    findings.push({
      title: "Subscriptions renew whether you use them or not",
      figure: `${formatAmount(subs)} here · about ${formatAmountRound(perYear)} a year`,
      why: "These are the only spends that continue by default. Every other line needs you to decide again; this one needs you to decide to stop.",
      severity: perYear > 20_000_00 ? "watch" : "note",
    });
    habits.push({
      title: "Cancel on renewal day, not on review day",
      how: "When a renewal charge lands, ask whether you opened it that month. If not, cancel then — you have already paid for the month you are in, so there is nothing to lose.",
      saves: Math.round(subs / months / 3),
    });
  }

  // 5 — cards, where the bill arrives after the feeling
  const onCards = sum(rows.filter((t) => t.kind === "card"));
  if (pct(onCards, spent) >= 30) {
    findings.push({
      title: "A third of your spending is on cards",
      figure: `${formatAmount(onCards)} · ${pct(onCards, spent)}% of the total`,
      why: "Card spending separates the purchase from the payment by up to 45 days, so the account balance you check does not reflect what you have already committed.",
      severity: pct(onCards, spent) >= 50 ? "watch" : "note",
    });
    habits.push({
      title: "Pay the card the same day you use it",
      how: "Settle the card from your bank account on the day of the spend. The reward points survive; the illusion of having more money than you do does not.",
      saves: 0,
    });
  }

  // 6 — the ones worth sleeping on
  const bigs = rows.filter((t) => t.amount >= BIG && !ESSENTIAL[t.category]);
  if (bigs.length) {
    habits.push({
      title: `Sleep on anything over ${formatAmountRound(BIG)}`,
      how: `You made ${bigs.length} such ${bigs.length === 1 ? "purchase" : "purchases"} — ${bigs.map((t) => t.title).slice(0, 3).join(", ")}. A 24-hour wait costs nothing and removes most of the ones you would regret.`,
      saves: Math.round(sum(bigs) / months / 4),
    });
  }

  // 7 — the trend, stated plainly
  const before = sum(prevRows.filter((t) => t.direction === "debit"));
  if (before > 0) {
    const change = pct(spent - before, before);
    findings.push({
      title: change > 0 ? "You spent more than last period" : "You spent less than last period",
      figure: `${change > 0 ? "+" : ""}${change}% · ${formatAmount(Math.abs(spent - before))} ${change > 0 ? "more" : "less"}`,
      why:
        change > 0
          ? "One period is noise, three in a row is a direction. Worth checking again next period rather than reacting now."
          : "Worth knowing which change caused it, so you can keep doing that one on purpose.",
      severity: change > 15 ? "watch" : change < 0 ? "good" : "note",
    });
  }

  // A no-spend day is the cheapest habit there is.
  const spendDays = new Set(rows.map((t) => t.date)).size;
  if (days - spendDays < days / 7) {
    habits.push({
      title: "Book one no-spend day a week",
      how: `You spent money on ${spendDays} of ${days} days. Pick the same weekday each week and buy nothing — it breaks the automatic part, which is where most discretionary spending lives.`,
      saves: Math.round((discretionary / days) * (days / 7)),
    });
  }

  // Reframes: the same numbers, from an angle that changes the decision.
  const monthlyDiscretionary = Math.round(discretionary / months);
  reframes.push({
    title: "Price it by the year, decide it by the year",
    body: `Your controllable spending runs about ${formatAmountRound(monthlyDiscretionary)} a month — ${formatAmountRound(monthlyDiscretionary * 12)} a year. Nobody would agree to that as an annual subscription without reading what is in it.`,
  });

  const income = sum(all.filter((t) => t.direction === "credit"));
  if (income > 0) {
    const daysOfIncome = (spent / (income / days)).toFixed(0);
    reframes.push({
      title: "Price it in days worked",
      body: `What you spent equals about ${daysOfIncome} days of the income that arrived in the same window. A ${formatAmountRound(BIG)} purchase is roughly ${((BIG / (income / days)) * 24).toFixed(0)} hours of work — a more honest unit than rupees, because it is the one you actually pay in.`,
    });
  }

  if (topControllable) {
    reframes.push({
      title: "Compare it to the thing you are not buying",
      body: `${formatAmountRound(topControllable[1])} on ${topControllable[0].toLowerCase()} is ${(topControllable[1] / Math.max(sum(rows.filter((t) => t.category === "Rent")), 1)).toFixed(1)}× your rent for the same window. Neither number is wrong — but only one of them bought you somewhere to live.`,
    });
  }

  habits.sort((a, b) => b.saves - a.saves);

  const headline = topControllable
    ? `${pct(discretionary, spent)}% of your spending was discretionary, and ${topControllable[0].toLowerCase()} led it.`
    : pct(unfiled, spent) >= 50
      ? `${pct(unfiled, spent)}% of this period has no category yet, so there is little to read into it.`
      : `Almost everything you spent was essential — ${pct(essentials, spent)}% of the total.`;

  return {
    window: win,
    days,
    spent,
    essentials,
    discretionary,
    headline,
    findings,
    habits,
    reframes,
    // A 10% cut on the controllable half only — telling someone to spend less
    // on rent is not a target, it is a move.
    target: Math.round(essentials + discretionary * 0.9),
  };
}
