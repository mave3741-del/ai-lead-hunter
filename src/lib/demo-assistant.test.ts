import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ruleBasedAssistant } from "./demo-assistant.ts";

describe("clinic assistant", () => {
  it("answers hours and refuses medical advice", () => {
    const hours = ruleBasedAssistant("What time are you open?");
    assert.match(hours.text, /Monday/);
    assert.equal(hours.blockedMedical, false);
    const med = ruleBasedAssistant("Is this pain a sign I need a root canal?");
    assert.equal(med.blockedMedical, true);
    assert.match(med.text, /can’t help with medical/i);
  });
  it("collects an appointment request", () => {
    const a = ruleBasedAssistant("I'd like to book an appointment on Tuesday");
    assert.match(a.text, /name and phone/i);
  });
});
