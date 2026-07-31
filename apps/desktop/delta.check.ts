// Run: pnpm --filter desktop test
//
// A green "you spent 40% more" is a bug nothing else catches: it type-checks,
// it renders, and it looks deliberate. These pin the rule in both directions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOISE_PCT, arrow, change, tone } from "./src/delta.ts";

test("the same sign means opposite things on different figures", () => {
  // Spending less is good news; earning less is not.
  assert.equal(tone(-30, "lower"), "good");
  assert.equal(tone(-30, "higher"), "bad");
  assert.equal(tone(+30, "lower"), "bad");
  assert.equal(tone(+30, "higher"), "good");
});

test("small moves are noise, not news", () => {
  for (const goal of ["lower", "higher"] as const) {
    assert.equal(tone(NOISE_PCT - 1, goal), "flat");
    assert.equal(tone(-(NOISE_PCT - 1), goal), "flat");
    assert.equal(tone(0, goal), "flat");
  }
  assert.notEqual(tone(NOISE_PCT, "lower"), "flat", "the threshold itself counts");
});

test("a percentage is only stated when the base allows one", () => {
  assert.equal(change(500, 0), null, "dividing by zero is not a comparison");
  assert.equal(
    change(500, -1000),
    null,
    "a negative base flips the sign: an improving Net would report a fall",
  );
  assert.equal(change(90, 100), -10);
  assert.equal(change(150, 100), 50);
});

test("the arrow carries the direction without colour", () => {
  assert.equal(arrow(20), "↑");
  assert.equal(arrow(-20), "↓");
  assert.equal(arrow(1), "≈");
});
