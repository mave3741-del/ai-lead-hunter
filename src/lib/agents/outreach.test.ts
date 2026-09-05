import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { containsFabrication, parseOutreach, templateOutreach } from "./outreach.ts";
import type { AuditResult } from "../types.ts";

const audit: AuditResult = {
  appointment_available: false,
  chatbot_present: false,
  faq_present: false,
  lead_capture_present: false,
  after_hours_help: false,
  mobile_experience: "average",
  contact_flow_clear: false,
  activity_signals: "average",
  opportunities: ["Add booking"],
  observations: ["No chatbot widget signatures were found in the public HTML"],
  confidence: 80,
};

describe("outreach schema", () => {
  it("rejects incomplete objects", () => {
    assert.equal(parseOutreach({ email_draft: "hi" }), null);
  });
  it("accepts a full draft", () => {
    const parsed = parseOutreach({
      email_draft: "Hello clinic team, I noticed a gap on the public site.",
      contact_form_draft: "Hello clinic team, I noticed a gap on the public site.",
      short_message: "Hi — noticed a public-site gap. Demo?",
      evidence_notes: ["No chatbot"],
    });
    assert.ok(parsed);
    assert.equal(parsed!.evidence_notes[0], "No chatbot");
  });
});

describe("template outreach", () => {
  it("cites a verified observation and the $100 offer", () => {
    const draft = templateOutreach({
      businessName: "Bright Smile Family Dentistry",
      audit,
      offer: "AI Appointment Assistant",
      price: 100,
      currency: "USD",
    });
    assert.ok(!("error" in draft));
    if ("error" in draft) return;
    assert.match(draft.email_draft, /Bright Smile Family Dentistry/);
    assert.match(draft.email_draft, /\$100/);
    assert.match(draft.email_draft, /No chatbot widget/);
    assert.doesNotMatch(draft.email_draft, /missed 40 patients/i);
  });
  it("refuses to invent when there is no evidence", () => {
    const draft = templateOutreach({
      businessName: "X",
      audit: { ...audit, observations: [], opportunities: [] },
      offer: "AI Appointment Assistant",
      price: 100,
      currency: "USD",
    });
    assert.ok("error" in draft);
  });
});

describe("fabrication guard", () => {
  it("flags invented volume and revenue", () => {
    assert.equal(containsFabrication("you missed 20 patients last month"), true);
    assert.equal(containsFabrication("this will add revenue"), true);
    assert.equal(containsFabrication("I noticed no chatbot on the public site"), false);
  });
});
