export type ClinicConfig = {
  name: string;
  hours: string;
  address: string;
  phone: string;
  services: string[];
  newPatients: boolean;
};

export const DEFAULT_CLINIC: ClinicConfig = {
  name: "Willow & Pine Family Dentistry",
  hours: "Monday–Thursday 8:00am–5:00pm, Friday 8:00am–2:00pm, closed weekends.",
  address: "418 Pine Street, Suite 200, Austin, TX 78701",
  phone: "(512) 555-0140",
  services: [
    "Cleanings and exams",
    "Fillings",
    "Whitening",
    "Crowns",
    "New-patient visits",
  ],
  newPatients: true,
};

const MEDICAL_RE =
  /\b(diagnos|what is this pain|is it cancer|prescribe|antibiotic|root canal|which treatment|should i get|my tooth is|abscess|infection|x-ray)\b/i;

export type AssistantReply = {
  text: string;
  quickReplies: string[];
  blockedMedical: boolean;
  generic?: boolean;
  collected?: { name?: string; phone?: string; preferredDay?: string };
};

export function ruleBasedAssistant(
  message: string,
  clinic: ClinicConfig = DEFAULT_CLINIC,
  history: { role: "user" | "assistant"; content: string }[] = [],
): AssistantReply {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (MEDICAL_RE.test(lower)) {
    return {
      text: `I can’t help with medical questions, symptoms, or treatment decisions. For anything clinical, please call ${clinic.name} at ${clinic.phone} so the team can help in person.`,
      quickReplies: ["Book an Appointment", "Opening Hours", "Location"],
      blockedMedical: true,
    };
  }

  if (/hour|open|close|time are you/.test(lower)) {
    return {
      text: `${clinic.name} hours: ${clinic.hours}`,
      quickReplies: ["Book an Appointment", "Location", "Services"],
      blockedMedical: false,
    };
  }

  if (/where|location|address|park/.test(lower)) {
    return {
      text: `We’re at ${clinic.address}. You can also call ${clinic.phone}.`,
      quickReplies: ["Book an Appointment", "Opening Hours", "Contact Us"],
      blockedMedical: false,
    };
  }

  if (/service|cleaning|whitening|crown|filling/.test(lower)) {
    return {
      text: `${clinic.name} publicly lists: ${clinic.services.join(", ")}. I can take an appointment request — I don’t recommend treatments.`,
      quickReplies: ["Book an Appointment", "Do you accept new patients?"],
      blockedMedical: false,
    };
  }

  if (/new patient/.test(lower) || /accept/.test(lower)) {
    return {
      text: clinic.newPatients
        ? "Yes. I can help you request an appointment. What day would you prefer?"
        : `Please call ${clinic.phone} and the front desk can confirm availability.`,
      quickReplies: ["Tuesday", "Thursday", "Opening Hours"],
      blockedMedical: false,
    };
  }

  if (/book|appoint|visit|schedule/.test(lower) || /tuesday|wednesday|thursday|monday|friday/.test(lower)) {
    const dayMatch = lower.match(/mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday/);
    const prior = history.filter((h) => h.role === "user").map((h) => h.content).join(" ");
    const nameMatch = `${prior} ${text}`.match(/(?:i'm|i am|my name is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
    const phoneMatch = `${prior} ${text}`.match(/(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (dayMatch && !phoneMatch) {
      return {
        text: `I can request ${dayMatch[0]} for you. What’s the best name and phone number for the front desk to confirm?`,
        quickReplies: ["Contact Us", "Opening Hours"],
        blockedMedical: false,
        collected: { preferredDay: dayMatch[0] },
      };
    }
    if (phoneMatch || nameMatch) {
      return {
        text: `Thanks. I logged an appointment request for the ${clinic.name} team — they will confirm by phone. This is a request, not a guaranteed booking.`,
        quickReplies: ["Opening Hours", "Location", "Services"],
        blockedMedical: false,
        collected: {
          name: nameMatch?.[1],
          phone: phoneMatch?.[1],
          preferredDay: dayMatch?.[0],
        },
      };
    }
    return {
      text: "Yes. I can help you request an appointment. What day would you prefer?",
      quickReplies: ["Tuesday", "Wednesday", "Thursday"],
      blockedMedical: false,
    };
  }

  if (/contact|phone|call|email/.test(lower)) {
    return {
      text: `You can reach ${clinic.name} at ${clinic.phone}, or request an appointment here and the team will call you back.`,
      quickReplies: ["Book an Appointment", "Location"],
      blockedMedical: false,
    };
  }

  return {
    text: `I’m the clinic’s AI assistant for ${clinic.name}. I can help with hours, location, listed services, and appointment requests. How can I help?`,
    quickReplies: ["Book an Appointment", "Opening Hours", "Services", "Location", "Contact Us"],
    blockedMedical: false,
    generic: true,
  };
}

export const ASSISTANT_SYSTEM = `You are a clinic front-desk AI appointment assistant.
You may: answer FAQs from the supplied clinic profile, explain hours/location/contact, list approved services, collect appointment requests (name, phone, preferred day), and notify that the business will follow up.
You must NEVER: diagnose, interpret symptoms, recommend treatments, prescribe, or give medical advice. If asked, refuse and suggest calling the clinic.
Keep replies under 80 words. Do not invent insurance details, prices, or availability beyond the profile.`;
