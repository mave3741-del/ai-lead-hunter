export type CsvLead = {
  business_name: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  source?: string;
};

const HEADER_MAP: Record<string, keyof CsvLead> = {
  business_name: "business_name",
  business: "business_name",
  name: "business_name",
  website: "website",
  url: "website",
  city: "city",
  state: "state",
  country: "country",
  phone: "phone",
  public_phone: "phone",
  email: "email",
  public_email: "email",
  source: "source",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseLeadCsv(text: string): { rows: CsvLead[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], errors: ["CSV is empty"] };
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx: Array<{ i: number; key: keyof CsvLead }> = [];
  for (let i = 0; i < header.length; i += 1) {
    const key = HEADER_MAP[header[i]!];
    if (key) idx.push({ i, key });
  }
  if (!idx.some((x) => x.key === "business_name")) {
    return { rows: [], errors: ["CSV must include a business_name (or name) column"] };
  }
  const rows: CsvLead[] = [];
  const errors: string[] = [];
  for (let n = 1; n < lines.length; n += 1) {
    const cols = splitCsvLine(lines[n]!);
    const row: CsvLead = { business_name: "" };
    for (const m of idx) {
      const v = cols[m.i]?.trim();
      if (v) (row as Record<string, string>)[m.key] = v;
    }
    if (!row.business_name) {
      errors.push(`Row ${n + 1}: missing business name`);
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}
