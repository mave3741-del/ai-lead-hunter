import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectOpportunities, offerPitch } from "./opportunity.ts";
import type { AuditResult } from "../types.ts";

const empty: AuditResult = {
  appointment_available: false,
  chatbot_present: false,
  faq_present: false,
  lead_capture_present: true,
  after_hours_help: false,
  mobile_experience: "average",
  contact_flow_clear: true,
  activity_signals: "average",
  opportunities: [],
  observations: [],
  confidence: 80,
};

describe("opportunity detection", () => {
  it("maps verified gaps to the appointment offer", () => {
    const hits = detectOpportunities(empty, "AI Appointment Assistant");
    assert.ok(hits.some((h) => /appointment/i.test(h.title)));
    const pitch = offerPitch(hits[0]!, "AI Appointment Assistant", 100, "USD");
    assert.match(pitch, /100/);
    assert.doesNotMatch(pitch, /Buy our AI/i);
  });
});
