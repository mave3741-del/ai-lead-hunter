import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverLeads, fingerprint, listSourceHealth, productionAdapters } from "./registry.ts";

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
  it("never includes demo_pool in production adapters", () => {
    assert.equal(
      productionAdapters().some((a) => a.key === "demo_pool"),
      false,
    );
  });
});

describe("discoverLeads", () => {
  it("uses the labeled demo pool only in demo mode", async () => {
    const r = await discoverLeads({
      demoMode: true,
      args: { niche: "Dental clinics", country: "United States", limit: 3 },
    });
    assert.equal(r.used, "demo_pool");
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.candidates.length > 0);
  });
  it("does not silently fall back to sample clinics in production", async () => {
    const prevOsm = process.env.OSM_OVERPASS_ENABLED;
    const prevPlaces = process.env.GOOGLE_PLACES_API_KEY;
    const prevSerper = process.env.SERPER_API_KEY;
    process.env.OSM_OVERPASS_ENABLED = "false";
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.SERPER_API_KEY;
    try {
      const r = await discoverLeads({
        demoMode: false,
        args: { niche: "Dental clinics", country: "United States", limit: 3 },
      });
      assert.equal(r.ok, false);
      assert.equal(r.used, "none");
      assert.match(r.error ?? "", /No live lead source configured/);
    } finally {
      if (prevOsm == null) delete process.env.OSM_OVERPASS_ENABLED;
      else process.env.OSM_OVERPASS_ENABLED = prevOsm;
      if (prevPlaces) process.env.GOOGLE_PLACES_API_KEY = prevPlaces;
      if (prevSerper) process.env.SERPER_API_KEY = prevSerper;
    }
  });
});

describe("fingerprint", () => {
  it("normalizes domain and name for dedup", () => {
    const a = fingerprint({ business_name: "The Oak Dental", domain: "Oak.Example", city: "Austin", state: "TX" });
    const b = fingerprint({ business_name: "Oak Dental", domain: "oak.example", city: "Austin", state: "TX" });
    assert.equal(a.domain, b.domain);
    assert.equal(a.place, "austin|tx");
  });
});
