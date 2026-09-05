import { parsePublicHttpUrl } from "../url-safety.ts";

export type ResearchNotes = {
  website_status: "none" | "invalid" | "listed";
  has_location: boolean;
  has_public_contact: boolean;
  source_url: string | null;
  notes: string[];
};

/** Public-record research only. Never invents activity, revenue, or medical facts. */
export function researchBusiness(input: {
  business_name: string;
  website: string | null;
  city: string | null;
  state: string | null;
  public_phone: string | null;
  public_email: string | null;
  source_url: string | null;
}): ResearchNotes {
  const notes: string[] = [];
  const has_location = Boolean(input.city || input.state);
  const has_public_contact = Boolean(input.public_phone || input.public_email);

  if (input.business_name.trim()) notes.push(`Business name on file: ${input.business_name.trim()}`);
  if (has_location) {
    notes.push(`Location listed: ${[input.city, input.state].filter(Boolean).join(", ")}`);
  } else {
    notes.push("No city/state on record");
  }
  if (has_public_contact) notes.push("Public business phone or email is listed");
  else notes.push("No public phone or email on record");

  let website_status: ResearchNotes["website_status"] = "none";
  if (!input.website) {
    notes.push("No public website listed");
  } else {
    const check = parsePublicHttpUrl(input.website);
    if (!check.ok) {
      website_status = "invalid";
      notes.push(`Website rejected: ${check.error}`);
    } else {
      website_status = "listed";
      notes.push(`Public website on file: ${check.url.toString()}`);
    }
  }

  const source_url = input.source_url || input.website;
  if (source_url) notes.push(`Source: ${source_url}`);

  return { website_status, has_location, has_public_contact, source_url, notes };
}
