// Run: pnpm --filter desktop test
//
// The two-series chart ("Accounts vs cards") is the one place in the app where
// colour alone separates two quantities — the legend names them, but the bar
// itself is just two lengths of hue. So the pair has to survive colour-vision
// deficiency, and "it looks fine to me" is not a check.
//
// This pins the pair chosen on 2026-08-01 (accent green + series-b blue, after
// the accent moved off blue) and the floors it has to clear. Re-run it before
// changing either hue; the numbers it prints are the ones to paste into
// docs/design-tokens.md.
import { test } from "node:test";
import assert from "node:assert/strict";

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// --- WCAG contrast ---------------------------------------------------------

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: RGB) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Dichromat simulation --------------------------------------------------
//
// Viénot–Brettel–Mollon, in the form the published simulators use: the matrices
// are applied to gamma-encoded sRGB rather than to linear light. That is a
// simplification, but it is the same one every tool the design was eyeballed
// against makes, so the numbers are comparable to the ones already recorded.

const clamp = (n: number) => Math.min(255, Math.max(0, n));

function simulate([r, g, b]: RGB, kind: "protan" | "deutan" | "tritan"): RGB {
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;

  let [l, m, s] = [L, M, S];
  if (kind === "protan") l = 2.02344 * M - 2.52581 * S;
  if (kind === "deutan") m = 0.494207 * L + 1.24827 * S;
  if (kind === "tritan") s = -0.395913 * L + 0.801109 * M;

  return [
    clamp(0.080944448 * l - 0.130504409 * m + 0.116721066 * s),
    clamp(-0.0102485335 * l + 0.0540193266 * m - 0.113614708 * s),
    clamp(-0.000365296938 * l - 0.00412161469 * m + 0.693511405 * s),
  ];
}

// --- CIE76 ΔE --------------------------------------------------------------

function lab(rgb: RGB): [number, number, number] {
  const [r, g, b] = rgb.map(linear);
  // sRGB -> XYZ (D65), then normalised by the D65 white point.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const deltaE = (a: RGB, b: RGB) => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

// --- The pair --------------------------------------------------------------

const THEMES = {
  light: { seriesA: "#0e7a57", seriesB: "#2e5fd0", surface: "#fcfcfd" },
  dark: { seriesA: "#4fd1a5", seriesB: "#7aa2f7", surface: "#16191c" },
} as const;

/** A chart bar is a graphical object, not text: WCAG 1.4.11 asks 3:1. */
const OBJECT_FLOOR = 3;
/** Recorded failure: blue+violet simulated to ΔE 5.7 under protanopia and was
 *  rejected for it. Anything at or under that is indistinguishable in practice. */
const REJECTED_AT = 5.7;

for (const [theme, c] of Object.entries(THEMES)) {
  const a = hex(c.seriesA);
  const b = hex(c.seriesB);
  const surface = hex(c.surface);

  test(`${theme}: both series clear 3:1 against the surface they sit on`, () => {
    for (const [name, colour] of [
      ["series-a", a],
      ["series-b", b],
    ] as const) {
      const ratio = contrast(colour, surface);
      assert.ok(
        ratio >= OBJECT_FLOOR,
        `${name} on --surface is ${ratio.toFixed(2)}:1, below ${OBJECT_FLOOR}:1`,
      );
    }
  });

  test(`${theme}: the pair clears the red–green deficiencies it was chosen for`, () => {
    const results: Record<string, number> = { normal: deltaE(a, b) };
    for (const kind of ["protan", "deutan", "tritan"] as const)
      results[kind] = deltaE(simulate(a, kind), simulate(b, kind));

    console.log(
      `  ${theme}: ΔE ` +
        Object.entries(results)
          .map(([k, v]) => `${k} ${v.toFixed(1)}`)
          .join(" · "),
    );

    for (const kind of ["normal", "protan", "deutan"] as const)
      assert.ok(
        results[kind] > REJECTED_AT,
        `${theme}/${kind}: ΔE ${results[kind].toFixed(1)} is at or below the ${REJECTED_AT} that got blue+violet rejected`,
      );
  });

  test(`${theme}: tritanopia is the known gap — the legend is load-bearing`, () => {
    // Green and blue collapse into each other on the blue–yellow axis: ΔE ~1.5,
    // where the old blue+amber pair scored ~150. This is the cost of moving the
    // accent to green, and it was accepted because the design's stated bar is
    // "the common red–green deficiencies" (tritanopia is ~0.01% of people, the
    // red–green ones ~6% of men).
    //
    // What makes that acceptable is that colour is not the only carrier: `Split`
    // in Analytics.tsx gives every series a legend row with its name AND its
    // figure, so the chart is readable with the hues removed entirely. Do not
    // drop that legend, and do not add a third series here.
    //
    // Asserted rather than commented so it cannot rot: if a future pair is
    // tritan-safe this test fails, which is the prompt to relax the rule above
    // and update docs/design-tokens.md.
    const dE = deltaE(simulate(a, "tritan"), simulate(b, "tritan"));
    assert.ok(
      dE <= REJECTED_AT,
      `${theme}/tritan is now ΔE ${dE.toFixed(1)} — the pair became tritan-safe, so update this test and the docs`,
    );
  });
}

test("violet is still not a series colour", () => {
  // The rule that produced the current pair. If someone reaches for --violet as
  // a third series, this is the number that says no.
  const dE = deltaE(simulate(hex("#2e5fd0"), "protan"), simulate(hex("#6a4bc4"), "protan"));
  assert.ok(dE <= REJECTED_AT, `blue vs violet under protanopia is ΔE ${dE.toFixed(1)}`);
});

// --- The ledger row's three inks -------------------------------------------
//
// --debit was added on 2026-08-02 when debits went red. Unlike a chart bar
// these are text, so the floor is WCAG 1.4.3's 4.5:1 rather than 3:1 — and the
// pair to watch is --debit against --danger, because a ledger full of red
// numerals must not read as a page full of alarms.

const ROW = {
  light: { debit: "#af3a24", credit: "#0e7a57", danger: "#c0324a", surface: "#fcfcfd" },
  dark: { debit: "#f08c6b", credit: "#4fd1a5", danger: "#e5677a", surface: "#16191c" },
} as const;

/** A signed amount is 15px/500 text, not a graphical object. */
const TEXT_FLOOR = 4.5;

for (const [theme, c] of Object.entries(ROW)) {
  test(`${theme}: every row ink is readable as text on --surface`, () => {
    for (const name of ["debit", "credit", "danger"] as const) {
      const ratio = contrast(hex(c[name]), hex(c.surface));
      console.log(`  ${theme}: --${name} on --surface ${ratio.toFixed(1)}:1`);
      assert.ok(
        ratio >= TEXT_FLOOR,
        `--${name} on --surface is ${ratio.toFixed(2)}:1, below ${TEXT_FLOOR}:1`,
      );
    }
  });

  test(`${theme}: debit red and credit green survive red–green deficiency`, () => {
    // The direction pair. If these converge, an income row and an expense row
    // are one glance apart — which is why the sign and the arrow angle carry
    // direction too, and why this is asserted rather than trusted.
    for (const kind of ["protan", "deutan"] as const) {
      const dE = deltaE(simulate(hex(c.debit), kind), simulate(hex(c.credit), kind));
      assert.ok(dE > REJECTED_AT, `${theme}/${kind}: debit vs credit is ΔE ${dE.toFixed(1)}`);
    }
  });

  test(`${theme}: debit red stays distinct from danger crimson`, () => {
    // Not resolved by argument, resolved by a token: --debit is a warmer,
    // lower-chroma brick. They also take different forms — --danger only ever
    // fills, --debit only ever inks — so a screen of debits never produces a
    // red block. This pins the hue half of that; the form half is a review rule
    // in docs/debit-red.md.
    const dE = deltaE(hex(c.debit), hex(c.danger));
    console.log(`  ${theme}: --debit vs --danger ΔE ${dE.toFixed(1)}`);
    assert.ok(
      dE > REJECTED_AT,
      `${theme}: --debit and --danger are ΔE ${dE.toFixed(1)} apart — too close to tell a cost from an alarm`,
    );
  });
}
