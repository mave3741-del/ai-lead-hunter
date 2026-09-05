export type ComplianceVerdict = "SAFE" | "REVIEW_REQUIRED" | "REJECTED";

const BANNED = [
  /\bguaranteed (revenue|results|patients|roi)\b/i,
  /\bmissed (customers|appointments|revenue)\b/i,
  /\b\$\d[\d,]+\s*(in )?(revenue|sales) (boost|increase)/i,
  /\bas a (patient|customer) of yours\b/i,
  /\bi('m| am) (your|a) (patient|client)\b/i,
  /\baffiliated with (your|the) (clinic|practice|ada)\b/i,
  /\bdiagnos(e|is|ing)\b/i,
  /\btreatment (plan|recommend)/i,
  /\bclick (here )?now\b/i,
  /\bact now\b/i,
  /\blimited time only\b/i,
  /\bfree money\b/i,
];

const REVIEW = [
  /\bwe (will|can) (double|triple)\b/i,
  /\b#1 (dentist|clinic)\b/i,
  /\bwithout (your )?approval\b/i,
];

export function reviewOutreach(text: string): { verdict: ComplianceVerdict; reasons: string[] } {
  const blob = text || "";
  const reasons: string[] = [];
  for (const re of BANNED) {
    if (re.test(blob)) reasons.push(`Rejected pattern: ${re.source}`);
  }
  if (reasons.length) return { verdict: "REJECTED", reasons };
  for (const re of REVIEW) {
    if (re.test(blob)) reasons.push(`Needs review: ${re.source}`);
  }
  if (reasons.length) return { verdict: "REVIEW_REQUIRED", reasons };
  return { verdict: "SAFE", reasons: [] };
}

export function reviewDraftBundle(parts: {
  email_draft: string;
  contact_form_draft: string;
  short_message: string;
}): { verdict: ComplianceVerdict; reasons: string[] } {
  const joined = `${parts.email_draft}\n${parts.contact_form_draft}\n${parts.short_message}`;
  return reviewOutreach(joined);
}
