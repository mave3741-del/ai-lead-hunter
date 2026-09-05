import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dailySpendReached, rateLimit, resetRateLimits } from "./rate-limit.ts";

describe("rate limiting", () => {
  it("allows up to the limit then blocks", () => {
    resetRateLimits();
    const now = 1_000_000;
    assert.equal(rateLimit("t", 2, 1000, now).ok, true);
    assert.equal(rateLimit("t", 2, 1000, now + 1).ok, true);
    assert.equal(rateLimit("t", 2, 1000, now + 2).ok, false);
    assert.equal(rateLimit("t", 2, 1000, now + 1001).ok, true);
  });
});

describe("AI spend cap", () => {
  it("blocks live work at the cap and never in demo", () => {
    assert.equal(dailySpendReached(5, 5, false), true);
    assert.equal(dailySpendReached(4.9, 5, false), false);
    assert.equal(dailySpendReached(50, 5, true), false);
  });
});
