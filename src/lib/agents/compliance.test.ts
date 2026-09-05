import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reviewDraftBundle, reviewOutreach } from "./compliance.ts";

describe("compliance checks", () => {
  it("accepts a factual pitch", () => {
    const r = reviewOutreach("I checked your website and noticed no chatbot. We can set up an appointment assistant for $100.");
    assert.equal(r.verdict, "SAFE");
  });
  it("rejects fake volume and impersonation", () => {
    assert.equal(reviewOutreach("You missed customers last month.").verdict, "REJECTED");
    assert.equal(reviewOutreach("I'm a patient of yours and loved the visit.").verdict, "REJECTED");
    assert.equal(reviewOutreach("We diagnose cavities automatically.").verdict, "REJECTED");
  });
  it("reviews a whole draft bundle", () => {
    const r = reviewDraftBundle({
      email_draft: "Hi team, noticed no after-hours help.",
      contact_form_draft: "Same.",
      short_message: "Happy to show a demo.",
    });
    assert.equal(r.verdict, "SAFE");
  });
});
