// Run: pnpm --filter desktop test
//
// Lives outside src/ on purpose: tsconfig.json has include:["src"] and no
// @types/node, so a node:test import in there would fail `tsc --noEmit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toMinor, fromMinor } from "./src/money.ts";

test("toMinor parses rupees into paise", () => {
  assert.equal(toMinor("1245.50"), 124550);
  assert.equal(toMinor("1245.5"), 124550); // one decimal place pads, not truncates
  assert.equal(toMinor("1245"), 124500);
  assert.equal(toMinor("0"), 0);
  assert.equal(toMinor("0.07"), 7);
  assert.equal(toMinor("-300.25"), -30025); // overdrawn accounts are legal
  assert.equal(toMinor("  42.10  "), 4210);
});

test("toMinor rejects anything it cannot represent exactly", () => {
  for (const bad of ["", "abc", "1.234", "1.2.3", "1,245", "1e3", ".5", "-", "12."]) {
    assert.equal(toMinor(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("the 0.10 case that floats get wrong", () => {
  // parseFloat("0.10") * 100 is 10.000000000000002 -> truncates to 10 by luck,
  // but 8.20 does not: parseFloat("8.20") * 100 === 819.9999999999999.
  assert.equal(toMinor("8.20"), 820);
  assert.notEqual(Math.trunc(parseFloat("8.20") * 100), 820);
});

test("fromMinor round-trips", () => {
  for (const s of ["1245.50", "0.00", "0.07", "-300.25", "999999.99"]) {
    assert.equal(fromMinor(toMinor(s)!), s);
  }
});
