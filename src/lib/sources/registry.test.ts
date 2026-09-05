import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listSourceHealth } from "./registry.ts";

describe("source health", () => {
  it("locks the demo pool in production mode", () => {
    const prod = listSourceHealth(false);
    const demo = prod.find((s) => s.key === "demo_pool");
    assert.equal(demo?.status, "disabled");
  });
  it("keeps demo pool ready in demo mode", () => {
    const demo = listSourceHealth(true).find((s) => s.key === "demo_pool");
    assert.equal(demo?.status, "ready");
  });
  it("marks Google Places not configured without a key", () => {
    const places = listSourceHealth(false).find((s) => s.key === "google_places");
    assert.equal(places?.requires_key, true);
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      assert.equal(places?.status, "not_configured");
    }
  });
});
