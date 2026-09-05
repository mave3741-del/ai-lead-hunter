import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "./rate-limit.ts";

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
