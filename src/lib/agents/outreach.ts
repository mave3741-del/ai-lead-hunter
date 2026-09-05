import { z } from "zod";
import type { AuditResult, OutreachDraftContent } from "../types.ts";
import { chatCompletion, extractJson } from "../ai/client.ts";
import { OUTREACH_MAX_TOKENS } from "../ai/retry.ts";

const draftSchema = z.object({
  email_draft: z.string().min(20),
  contact_form_draft: z.string().min(20),
  short_message: z.string().min(10),
  evidence_notes: z.array(z.string()).default([]),
});

export function parseOutreach(input: unknown): OutreachDraftContent | null {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    email_draft: parsed.data.email_draft.trim(),
    contact_form_draft: parsed.data.contact_form_draft.trim(),
    short_message: parsed.data.short_message.trim(),
    evidence_notes: parsed.data.evidence_notes.filter(Boolean).slice(0, 8),
  };
}

const FORBIDDEN = [
  /missed (?:\d|customers|patients)/i,
  /revenue/i,
  /\$\d/,
  /reviews?/i,
  /google ranking/i,
  /you are losing/i,
  /software you use/i,
  /dentrix|opendental|eaglesoft/i,
];

export function containsFabrication(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}

function firstObservation(audit: AuditResult): string | null {
  const obs = audit.observations.find((o) => o && !o.toLowerCase().startsWith("audited public url"));
  return obs ?? audit.opportunities[0] ?? null;
}

export function templateOutreach(opts: {
  businessName: string;
  audit: AuditResult;
  offer: string;
  price: number;
  currency: string;
}): OutreachDraftContent | { error: string } {
  const observation = firstObservation(opts.audit);
  if (!observation) {
    return { error: "No verified observation to cite — refusing to invent a problem" };
  }
  const priceLabel =
    opts.currency === "USD" ? `$${opts.price}` : `${opts.price} ${opts.currency}`;
  const name = opts.businessName.replace(/\s+team$/i, "");

  const email = `Hi ${name} team,

I checked your website and noticed ${observation.replace(/\.$/, "")}.

I build simple AI appointment assistants that can answer common questions and help visitors request appointments.

I can set one up for your clinic for a fixed ${priceLabel}.

Would you like to see a quick demo?`;

  const form = `Hello — I reviewed the public ${name} website and noticed ${observation.replace(/\.$/, "")}. I offer a simple AI appointment assistant (${opts.offer}) that answers hours, location, and service questions from approved copy and collects appointment requests. Setup is a fixed ${priceLabel}. Happy to show a 5-minute demo if useful.`;

  const short = `Hi ${name} team — I noticed ${observation.replace(/\.$/, "")}. I can set up an AI appointment assistant for a fixed ${priceLabel}. Open to a quick demo?`;

  const evidence = [
    ...opts.audit.observations.slice(0, 4),
    `Offer cited: ${opts.offer} at ${priceLabel}`,
    "Draft generated from verified audit fields only",
  ];

  return {
    email_draft: email,
    contact_form_draft: form,
    short_message: short,
    evidence_notes: evidence,
  };
}

export async function generateOutreach(opts: {
  businessName: string;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  audit: AuditResult;
  offer: string;
  price: number;
  currency: string;
  tone: string;
  useAi: boolean;
}): Promise<OutreachDraftContent & { source: "template" | "ai" }> {
  const templated = templateOutreach(opts);
  if ("error" in templated) {
    throw new Error(templated.error);
  }
  if (!opts.useAi) return { ...templated, source: "template" };

  const ai = await chatCompletion({
    maxTokens: OUTREACH_MAX_TOKENS,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You write short, professional outreach for a human to approve and send manually.
Rules:
- Cite ONLY verified observations supplied by the user.
- Never fabricate website problems, patient volume, revenue, reviews, software, or missed customers.
- Do not include prices other than the provided price.
- Tone: ${opts.tone}.
- Return JSON: email_draft, contact_form_draft, short_message, evidence_notes.
- Email under 120 words. No medical claims.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          business_name: opts.businessName,
          website: opts.website,
          location: [opts.city, opts.state].filter(Boolean).join(", "),
          offer: opts.offer,
          price: opts.price,
          currency: opts.currency,
          verified_audit: opts.audit,
        }),
      },
    ],
  });

  if (!ai.ok) return { ...templated, source: "template" };
  try {
    const parsed = parseOutreach(extractJson(ai.text));
    if (!parsed) return { ...templated, source: "template" };
    const combined = `${parsed.email_draft}\n${parsed.contact_form_draft}\n${parsed.short_message}`;
    if (containsFabrication(combined)) return { ...templated, source: "template" };
    return {
      ...parsed,
      evidence_notes: parsed.evidence_notes.length ? parsed.evidence_notes : templated.evidence_notes,
      source: "ai",
    };
  } catch {
    return { ...templated, source: "template" };
  }
}
