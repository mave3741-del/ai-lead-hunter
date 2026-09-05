import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertCanSend,
  canSendOutreach,
  canTransition,
  calculateScore,
  conversionRate,
  averageDeal,
  isDuplicateLead,
  shouldPrepareOutreach,
} from "./lead-rules.ts";
import type { AuditResult } from "./types.ts";

function audit(partial: Partial<AuditResult>): AuditResult {
  return {
    appointment_available: null,
    chatbot_present: null,
    faq_present: null,
    lead_capture_present: null,
    after_hours_help: null,
    mobile_experience: "unknown",
    contact_flow_clear: null,
    activity_signals: "unknown",
    opportunities: [],
    observations: [],
    confidence: 80,
    ...partial,
  };
}

describe("score calculation", () => {
  it("adds explainable points only for verified negatives", () => {
    const result = calculateScore(
      audit({
        chatbot_present: false,
        appointment_available: false,
        lead_capture_present: false,
        faq_present: false,
        after_hours_help: false,
        contact_flow_clear: false,
        activity_signals: "strong",
      }),
    );
    assert.equal(result.score, 100);
    assert.equal(result.priority, "very_high");
    assert.ok(result.reasons.length >= 6);
    assert.equal(result.recommended_offer, "AI Appointment Assistant");
  });

  it("does not invent points for unknown signals", () => {
    const result = calculateScore(audit({ confidence: 20 }));
    assert.ok(result.score <= 45);
  });

  it("scores a well-instrumented clinic low", () => {
    const result = calculateScore(
      audit({
        chatbot_present: true,
        appointment_available: true,
        lead_capture_present: true,
        faq_present: true,
        after_hours_help: true,
        contact_flow_clear: true,
        mobile_experience: "good",
        activity_signals: "strong",
      }),
    );
    assert.equal(result.score, 10);
    assert.equal(result.priority, "low");
  });
});

describe("outreach threshold", () => {
  it("only prepares outreach at or above 75 by default", () => {
    assert.equal(shouldPrepareOutreach(74), false);
    assert.equal(shouldPrepareOutreach(75), true);
    assert.equal(shouldPrepareOutreach(90, 80), true);
    assert.equal(shouldPrepareOutreach(79, 80), false);
  });
});

describe("human approval", () => {
  it("forbids send without approval", () => {
    assert.equal(canSendOutreach("pending"), false);
    assert.equal(canSendOutreach("rejected"), false);
    assert.equal(canSendOutreach("edited"), false);
    assert.equal(canSendOutreach(null), false);
    assert.equal(canSendOutreach("approved"), true);
    assert.throws(() => assertCanSend("pending"), /without human approval/);
  });
});

describe("status transitions", () => {
  it("allows the core pipeline", () => {
    assert.equal(canTransition("NEW", "RESEARCHING"), true);
    assert.equal(canTransition("RESEARCHING", "AUDITED"), true);
    assert.equal(canTransition("AUDITED", "QUALIFIED"), true);
    assert.equal(canTransition("QUALIFIED", "DRAFT_READY"), true);
    assert.equal(canTransition("DRAFT_READY", "APPROVED"), true);
    assert.equal(canTransition("APPROVED", "CONTACTED"), true);
    assert.equal(canTransition("CONTACTED", "REPLIED"), true);
    assert.equal(canTransition("DEMO", "WON"), true);
  });
  it("blocks skip-to-won and dnc reversal", () => {
    assert.equal(canTransition("NEW", "WON"), false);
    assert.equal(canTransition("DRAFT_READY", "CONTACTED"), false);
    assert.equal(canTransition("DO_NOT_CONTACT", "NEW"), false);
    assert.equal(canTransition("WON", "LOST"), false);
  });
});

describe("deduplication", () => {
  const existing = [
    { domain: "brightsmileaustin.example", business_name: "Bright Smile Family Dentistry" },
  ];
  it("matches domain", () => {
    assert.equal(
      isDuplicateLead({ domain: "brightsmileaustin.example", business_name: "Other" }, existing),
      true,
    );
  });
  it("matches normalized name", () => {
    assert.equal(
      isDuplicateLead({ domain: "other.example", business_name: "The Bright Smile Family Dental Clinic" }, existing),
      true,
    );
  });
  it("allows a distinct clinic", () => {
    assert.equal(
      isDuplicateLead({ domain: "oakstreetortho.example", business_name: "Oak Street Orthodontics" }, existing),
      false,
    );
  });
});

describe("revenue math", () => {
  it("computes conversion and average deal", () => {
    assert.equal(conversionRate(1, 4), 25);
    assert.equal(conversionRate(0, 0), 0);
    assert.equal(averageDeal(100, 1), 100);
    assert.equal(averageDeal(250, 2), 125);
  });
});
