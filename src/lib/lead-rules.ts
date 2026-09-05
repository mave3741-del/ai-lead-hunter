import type {
  ApprovalStatus,
  AuditResult,
  EstimatedValue,
  LeadStatus,
  Priority,
  ScoreResult,
} from "./types.ts";
import { LEAD_STATUSES } from "./types.ts";
import { normalizeName } from "./utils.ts";

export const DEFAULT_MIN_SCORE = 75;
export const DEFAULT_OFFER = "AI Appointment Assistant";

const STATUS_SET = new Set<string>(LEAD_STATUSES);

export function isLeadStatus(value: string): value is LeadStatus {
  return STATUS_SET.has(value);
}

/** Allowed forward / lateral transitions. Reject + DNC can be reached from most live states. */
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["RESEARCHING", "AUDITED", "LOST", "DO_NOT_CONTACT"],
  RESEARCHING: ["AUDITED", "NEW", "LOST", "DO_NOT_CONTACT"],
  AUDITED: ["QUALIFIED", "RESEARCHING", "LOST", "DO_NOT_CONTACT"],
  QUALIFIED: ["DRAFT_READY", "AUDITED", "LOST", "DO_NOT_CONTACT"],
  DRAFT_READY: ["APPROVED", "QUALIFIED", "LOST", "DO_NOT_CONTACT"],
  APPROVED: ["CONTACTED", "DRAFT_READY", "LOST", "DO_NOT_CONTACT"],
  CONTACTED: ["FOLLOW_UP_1", "FOLLOW_UP_2", "REPLIED", "INTERESTED", "LOST", "DO_NOT_CONTACT"],
  FOLLOW_UP_1: ["FOLLOW_UP_2", "REPLIED", "INTERESTED", "LOST", "DO_NOT_CONTACT"],
  FOLLOW_UP_2: ["REPLIED", "INTERESTED", "LOST", "DO_NOT_CONTACT"],
  REPLIED: ["INTERESTED", "LOST", "DO_NOT_CONTACT"],
  INTERESTED: ["DEMO", "NEGOTIATION", "LOST", "DO_NOT_CONTACT"],
  DEMO: ["NEGOTIATION", "WON", "LOST", "DO_NOT_CONTACT"],
  NEGOTIATION: ["WON", "LOST", "DO_NOT_CONTACT"],
  WON: [],
  LOST: ["NEW"],
  DO_NOT_CONTACT: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move a lead from ${from} to ${to}`);
  }
}

export function statusAfterAudit(score: number, minScore: number): LeadStatus {
  return score >= minScore ? "QUALIFIED" : "AUDITED";
}

export function statusAfterDraft(score: number, minScore: number): LeadStatus {
  return score >= minScore ? "DRAFT_READY" : "AUDITED";
}

export function canSendOutreach(approvalStatus: ApprovalStatus | null | undefined): boolean {
  return approvalStatus === "approved";
}

export function assertCanSend(approvalStatus: ApprovalStatus | null | undefined): void {
  if (!canSendOutreach(approvalStatus)) {
    throw new Error("Outreach cannot be sent without human approval");
  }
}

export function priorityFromScore(score: number): Priority {
  if (score >= 90) return "very_high";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function estimatedValueFromScore(score: number): EstimatedValue {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function boolPoints(
  value: boolean | null,
  whenFalse: number,
  reason: string,
): { points: number; reason?: string } {
  if (value === false) return { points: whenFalse, reason };
  return { points: 0 };
}

/**
 * Explainable 0–100 score from verified audit signals only.
 * Unknowns add zero points (we never invent findings).
 */
export function calculateScore(
  audit: AuditResult,
  offer = DEFAULT_OFFER,
): ScoreResult {
  const reasons: string[] = [];
  let score = 0;

  const chatbot = boolPoints(
    audit.chatbot_present,
    20,
    "No chatbot detected on the public website",
  );
  score += chatbot.points;
  if (chatbot.reason) reasons.push(chatbot.reason);

  const appt = boolPoints(
    audit.appointment_available,
    20,
    "No obvious online appointment assistant",
  );
  score += appt.points;
  if (appt.reason) reasons.push(appt.reason);

  if (audit.lead_capture_present === false) {
    score += 15;
    reasons.push("Weak or missing lead capture");
  } else if (audit.lead_capture_present === true && audit.appointment_available === false) {
    score += 6;
    reasons.push("Has a form, but no appointment flow");
  }

  if (audit.faq_present === false) {
    score += 15;
    reasons.push("Weak FAQ / help experience");
  }

  if (audit.after_hours_help === false) {
    score += 10;
    reasons.push("No after-hours assistance detected");
  }

  if (audit.contact_flow_clear === false) {
    score += 10;
    reasons.push("Unclear contact or appointment flow");
  }

  if (audit.mobile_experience === "poor") {
    score += 4;
    reasons.push("Mobile experience looks poor");
  }

  if (audit.activity_signals === "strong") {
    score += 10;
    reasons.push("Strong public business activity signals");
  } else if (audit.activity_signals === "average") {
    score += 5;
    reasons.push("Moderate public business activity");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const unknownCount = [
    audit.appointment_available,
    audit.chatbot_present,
    audit.faq_present,
    audit.lead_capture_present,
    audit.after_hours_help,
    audit.contact_flow_clear,
  ].filter((v) => v === null).length;
  if (audit.mobile_experience === "unknown") {
    /* already not scored */
  }
  if (unknownCount >= 4 && audit.confidence < 40) {
    score = Math.min(score, 45);
    reasons.push("Too many unverified signals — capped until a better audit");
  }

  return {
    score,
    priority: priorityFromScore(score),
    reasons,
    recommended_offer: offer,
    estimated_value: estimatedValueFromScore(score),
  };
}

export function shouldPrepareOutreach(score: number, minScore = DEFAULT_MIN_SCORE): boolean {
  return score >= minScore;
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function isDuplicateLead(
  incoming: { domain?: string | null; business_name: string },
  existing: Array<{ domain?: string | null; business_name: string }>,
): boolean {
  const domain = incoming.domain?.replace(/^www\./, "").toLowerCase() || null;
  if (domain && existing.some((e) => e.domain && e.domain === domain)) return true;
  return existing.some((e) => namesMatch(e.business_name, incoming.business_name));
}

export function conversionRate(won: number, contacted: number): number {
  if (contacted <= 0) return 0;
  return Math.round((won / contacted) * 1000) / 10;
}

export function averageDeal(totalRevenue: number, customers: number): number {
  if (customers <= 0) return 0;
  return Math.round((totalRevenue / customers) * 100) / 100;
}

export function problemSummary(audit: AuditResult | null, reasons: string[]): string {
  if (reasons.length > 0) return reasons[0]!;
  if (audit?.observations?.[0]) return audit.observations[0];
  return "Needs review";
}
