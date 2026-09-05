import type { AuditResult } from "../types.ts";

export type OpportunityHit = {
  title: string;
  offer: string;
  evidence: string[];
};

export function detectOpportunities(audit: AuditResult, offer: string): OpportunityHit[] {
  const hits: OpportunityHit[] = [];
  if (audit.appointment_available === false) {
    hits.push({
      title: "No instant appointment assistant",
      offer,
      evidence: ["Public site has no obvious online booking or appointment assistant"],
    });
  }
  if (audit.faq_present === false) {
    hits.push({
      title: "FAQ automation",
      offer,
      evidence: ["No FAQ / help content found on the public site"],
    });
  }
  if (audit.lead_capture_present === false) {
    hits.push({
      title: "Weak lead capture",
      offer,
      evidence: ["No visible lead-capture form"],
    });
  }
  if (audit.after_hours_help === false) {
    hits.push({
      title: "After-hours questions",
      offer,
      evidence: ["No after-hours conversational help detected"],
    });
  }
  if (audit.chatbot_present === false && hits.length === 0) {
    hits.push({
      title: "No chatbot / assistant",
      offer,
      evidence: ["No chatbot on the public website"],
    });
  }
  return hits;
}

export function offerPitch(hit: OpportunityHit | null, offer: string, price: number, currency: string): string {
  if (!hit) {
    return `We can set up an ${offer} for a fixed ${currency} ${price} so visitors can ask common questions and request appointments.`;
  }
  return `I noticed ${hit.title.toLowerCase()}. We can add an ${offer} that answers common questions and captures appointment requests for a fixed ${currency} ${price}.`;
}
