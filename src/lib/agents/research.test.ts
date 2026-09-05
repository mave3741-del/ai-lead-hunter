import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { researchBusiness } from "./research.ts";

describe("business research", () => {
  it("records listed website and location without inventing facts", () => {
    const r = researchBusiness({
      business_name: "Oak Dental",
      website: "https://oak.example",
      city: "Austin",
      state: "TX",
      public_phone: "(512) 555-0100",
      public_email: null,
      source_url: "https://oak.example",
    });
    assert.equal(r.website_status, "listed");
    assert.equal(r.has_location, true);
    assert.equal(r.has_public_contact, true);
    assert.ok(r.notes.some((n) => /Austin/.test(n)));
    assert.ok(!r.notes.some((n) => /revenue|patients|diagnos/i.test(n)));
  });

  it("marks missing website and rejects private URLs", () => {
    const none = researchBusiness({
      business_name: "No Site Dental",
      website: null,
      city: null,
      state: null,
      public_phone: null,
      public_email: null,
      source_url: null,
    });
    assert.equal(none.website_status, "none");
    assert.equal(none.has_location, false);

    const bad = researchBusiness({
      business_name: "Localhost Dental",
      website: "http://127.0.0.1/",
      city: "Austin",
      state: "TX",
      public_phone: null,
      public_email: null,
      source_url: null,
    });
    assert.equal(bad.website_status, "invalid");
  });
});
