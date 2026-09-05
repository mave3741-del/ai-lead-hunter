import { z } from "zod";
import type { AuditResult, MobileExperience, ActivitySignals } from "../types.ts";
import { fetchPublicHtml } from "../url-safety.ts";
import { chatCompletion, extractJson } from "../ai/client.ts";
import { AUDIT_MAX_TOKENS } from "../ai/retry.ts";

const CHATBOT_HINTS = [
  "intercom",
  "drift",
  "tidio",
  "crisp.chat",
  "zendesk",
  "tawk",
  "livechat",
  "hubspot",
  "chatbot",
  "smartsupp",
  "manychat",
  "facebook messenger",
  "ada.support",
];

const APPOINTMENT_HINTS = [
  "book appointment",
  "book an appointment",
  "schedule online",
  "request appointment",
  "request an appointment",
  "zocdoc",
  "nexhealth",
  "patientpop",
  "localmed",
  "opendental",
  "dentrix",
  "calendly",
  "square appointments",
  "setmore",
  "online scheduling",
  "schedule a visit",
];

const FAQ_HINTS = ["faq", "frequently asked", "common questions", "q&a"];
const AFTER_HOURS_HINTS = ["after hours", "after-hours", "24/7", "24-7", "emergency line", "on call"];
const LEAD_FORM_HINTS = ["type=\"email\"", "name=\"email\"", "contact-form", "wpcf7", "hubspot-form"];

const auditSchema = z.object({
  appointment_available: z.boolean().nullable(),
  chatbot_present: z.boolean().nullable(),
  faq_present: z.boolean().nullable(),
  lead_capture_present: z.boolean().nullable(),
  after_hours_help: z.boolean().nullable(),
  mobile_experience: z.enum(["good", "average", "poor", "unknown"]),
  contact_flow_clear: z.boolean().nullable(),
  activity_signals: z.enum(["strong", "average", "weak", "unknown"]),
  opportunities: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
});

export function unknownAudit(): AuditResult {
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
    confidence: 0,
  };
}

export function parseAudit(input: unknown): AuditResult {
  const parsed = auditSchema.safeParse(input);
  if (!parsed.success) return unknownAudit();
  return {
    ...parsed.data,
    opportunities: parsed.data.opportunities.filter(Boolean).slice(0, 8),
    observations: parsed.data.observations.filter(Boolean).slice(0, 8),
    confidence: Math.round(parsed.data.confidence),
  };
}

function hasAny(html: string, hints: string[]): boolean {
  return hints.some((h) => html.includes(h));
}

function countHits(html: string, hints: string[]): number {
  return hints.reduce((n, h) => (html.includes(h) ? n + 1 : n), 0);
}

/**
 * Deterministic HTML audit. Never invents findings — unknown if not evidenced.
 */
export function auditHtml(html: string, finalUrl?: string): AuditResult {
  const text = html.toLowerCase();
  const opportunities: string[] = [];
  const observations: string[] = [];

  const chatbot = hasAny(text, CHATBOT_HINTS);
  const appointment = hasAny(text, APPOINTMENT_HINTS);
  const faq = hasAny(text, FAQ_HINTS);
  const afterHours = hasAny(text, AFTER_HOURS_HINTS);
  const form =
    hasAny(text, LEAD_FORM_HINTS) ||
    /<form[\s>]/.test(text) ||
    /request a (callback|consult)/.test(text);

  const viewport = /name=["']viewport["']/.test(text);
  let mobile: MobileExperience = "unknown";
  if (viewport && !/width=["']?[0-7]\d{2}\b/.test(text)) mobile = "good";
  else if (viewport) mobile = "average";
  else if (html.length > 500) mobile = "poor";

  const tel = /href=["']tel:/.test(text);
  const contactPage = /contact/.test(text);
  const contactClear = tel || (contactPage && form) ? true : form || tel ? true : html.length > 800 ? false : null;

  let activity: ActivitySignals = "unknown";
  const year = new Date().getFullYear();
  if (text.includes(String(year)) || text.includes(String(year - 1))) activity = "average";
  if (countHits(text, ["team", "our doctors", "new patients", "insurance", "reviews"]) >= 3) {
    activity = "strong";
  }

  if (!chatbot) opportunities.push("Add an after-hours assistant for common questions");
  if (!appointment) opportunities.push("Add a simple appointment request flow");
  if (!faq) opportunities.push("Publish a structured FAQ the assistant can use");
  if (!form) opportunities.push("Capture name and callback number on the site");
  if (mobile === "poor") opportunities.push("Improve the mobile layout");

  if (chatbot) observations.push("A third-party chat widget is referenced in the public HTML");
  else observations.push("No chatbot widget signatures were found in the public HTML");
  if (appointment) observations.push("Online appointment or scheduling language is present");
  else observations.push("No online appointment/scheduling language was found");
  if (faq) observations.push("An FAQ section is present");
  else observations.push("No FAQ section was found");
  if (form) observations.push("A public form is present");
  else observations.push("No public lead-capture form was found");
  if (afterHours) observations.push("After-hours or emergency language is present");
  else observations.push("No after-hours assistance language was found");
  if (finalUrl) observations.push(`Audited public URL: ${finalUrl}`);

  const known = [chatbot, appointment, faq, form, afterHours].length;
  const confidence = Math.min(92, 40 + known * 8 + (viewport ? 8 : 0));

  return {
    appointment_available: appointment,
    chatbot_present: chatbot,
    faq_present: faq,
    lead_capture_present: form,
    after_hours_help: afterHours,
    mobile_experience: mobile,
    contact_flow_clear: contactClear,
    activity_signals: activity,
    opportunities: opportunities.slice(0, 6),
    observations: observations.slice(0, 8),
    confidence,
  };
}

export async function runWebsiteAudit(opts: {
  website: string;
  useAi: boolean;
}): Promise<{ audit: AuditResult; source: "heuristic" | "ai" | "unavailable"; error?: string }> {
  const fetched = await fetchPublicHtml(opts.website);
  if (!fetched.ok) {
    return { audit: unknownAudit(), source: "unavailable", error: fetched.error };
  }
  const heuristic = auditHtml(fetched.html, fetched.url);
  if (!opts.useAi) return { audit: heuristic, source: "heuristic" };

  const snippet = fetched.html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 6000);

  const ai = await chatCompletion({
    maxTokens: AUDIT_MAX_TOKENS,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You audit public small-business websites. Return ONLY JSON. Never invent findings. If a signal is not evidenced in the excerpt, use null or \"unknown\". Do not mention medical advice.",
      },
      {
        role: "user",
        content: `URL: ${fetched.url}\nHeuristic guess (may be wrong): ${JSON.stringify(heuristic)}\n\nVisible text excerpt:\n${snippet}\n\nReturn JSON with keys: appointment_available, chatbot_present, faq_present, lead_capture_present, after_hours_help, mobile_experience, contact_flow_clear, activity_signals, opportunities, observations, confidence.`,
      },
    ],
  });

  if (!ai.ok) return { audit: heuristic, source: "heuristic", error: ai.error };
  try {
    const parsed = parseAudit(extractJson(ai.text));
    if (parsed.confidence === 0 && parsed.observations.length === 0) {
      return { audit: heuristic, source: "heuristic" };
    }
    return { audit: parsed, source: "ai" };
  } catch {
    return { audit: heuristic, source: "heuristic", error: "Model output failed schema validation" };
  }
}
