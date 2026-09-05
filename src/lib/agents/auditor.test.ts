import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditHtml, parseAudit, unknownAudit } from "./auditor.ts";

describe("audit parsing", () => {
  it("returns unknown for garbage", () => {
    const a = parseAudit({ nope: true });
    assert.equal(a.confidence, 0);
    assert.equal(a.mobile_experience, "unknown");
  });
  it("accepts a valid payload", () => {
    const a = parseAudit({
      appointment_available: false,
      chatbot_present: false,
      faq_present: true,
      lead_capture_present: false,
      after_hours_help: false,
      mobile_experience: "average",
      contact_flow_clear: true,
      activity_signals: "weak",
      opportunities: ["Add booking"],
      observations: ["No chatbot"],
      confidence: 70,
    });
    assert.equal(a.faq_present, true);
    assert.equal(a.confidence, 70);
  });
});

describe("html heuristic", () => {
  it("detects booking, chatbot, faq, form", () => {
    const html = `
      <html><head><meta name="viewport" content="width=device-width"></head>
      <body>
        <a href="/book-appointment">Book an appointment</a>
        <script src="https://widget.tidio.co/x.js"></script>
        <h2>Frequently asked questions</h2>
        <form><input type="email" name="email" /></form>
        <p>After hours emergency line</p>
      </body></html>`;
    const a = auditHtml(html, "https://clinic.example");
    assert.equal(a.appointment_available, true);
    assert.equal(a.chatbot_present, true);
    assert.equal(a.faq_present, true);
    assert.equal(a.lead_capture_present, true);
    assert.equal(a.after_hours_help, true);
    assert.ok(a.confidence > 50);
    assert.ok(a.observations.length > 0);
  });
  it("does not invent a chatbot on a brochure page", () => {
    const html = `<html><body><h1>Smith Dental</h1><p>Call (555) 0100</p></body></html>`;
    const a = auditHtml(html);
    assert.equal(a.chatbot_present, false);
    assert.equal(a.appointment_available, false);
  });
});

describe("unknown audit", () => {
  it("starts empty", () => {
    const a = unknownAudit();
    assert.equal(a.appointment_available, null);
    assert.equal(a.observations.length, 0);
  });
});
