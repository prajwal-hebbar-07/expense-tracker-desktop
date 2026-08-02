// A period-on-period change, and whether it is good news.
//
// The sign of a delta does not carry its meaning: −9% on Spent is good, −9% on
// Received is bad, and colouring both red is how a dashboard trains people to
// ignore it. Each figure declares the direction it *wants* to move, and the
// tone follows from that rather than from the arithmetic sign.
//
// Its own module because it is a rule that can be inverted without anything
// looking broken — a green "you spent 40% more" is a bug no type checker or
// screenshot catches, so it gets a test.

/** Which way this figure should move for the user to be better off. */
export type Goal = "lower" | "higher";
export type Tone = "good" | "bad" | "flat";

/** Under this, a move is noise. A tile that shouts at a 2% wobble gets ignored
 *  by the time it has something worth saying. */
export const NOISE_PCT = 5;

/**
 * Percentage change, or `null` when there is no honest way to state one.
 * The base must be positive: dividing by zero gives Infinity, and dividing by a
 * negative base flips the sign, so a Net that went from −₹1,000 to +₹500 would
 * report "−150%" — a fall, for an outcome that improved.
 */
export function change(now: number, before: number): number | null {
  if (!(before > 0) || !Number.isFinite(now)) return null;
  return Math.round(((now - before) / before) * 100);
}

export function tone(pct: number, goal: Goal): Tone {
  if (Math.abs(pct) < NOISE_PCT) return "flat";
  // Rising is good news only when the figure wanted to rise.
  return pct > 0 === (goal === "higher") ? "good" : "bad";
}

/**
 * Which way the arithmetic went, so the tone is never carried by colour alone.
 *
 * Deliberately a different axis from `tone`: the mark reports the sign, the
 * colour reports the verdict, and neither is asked to do both. Spent ↑30% and
 * Net ↓48% are opposite marks in the same red, which is the point.
 */
export const direction = (pct: number): "up" | "down" | "flat" =>
  Math.abs(pct) < NOISE_PCT ? "flat" : pct > 0 ? "up" : "down";

/** The verdict, spelled out. Screen readers get it in the label, so colour is
 *  never the only carrier of "is this good news". */
export const VERDICT: Record<Tone, string> = {
  good: "better",
  bad: "worse",
  flat: "about the same",
};
