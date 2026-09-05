export type SourceCandidate = {
  business_name: string;
  website?: string | null;
  domain?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  public_phone?: string | null;
  public_email?: string | null;
  source_url?: string | null;
  category?: string;
  external_id?: string | null;
  notes?: string | null;
};

export type SourceHealth = {
  key: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  status: "ready" | "not_configured" | "disabled" | "error";
  requires_key: boolean;
  last_error?: string | null;
  detail: string;
};

export type SearchArgs = {
  niche: string;
  country: string;
  city?: string;
  limit: number;
};

export type SearchResult =
  | { ok: true; candidates: SourceCandidate[]; source: string }
  | { ok: false; error: string; source: string; not_configured?: boolean };

export type LeadSourceAdapter = {
  key: string;
  name: string;
  requiresKey: boolean;
  configured: () => boolean;
  health: () => SourceHealth;
  search: (args: SearchArgs) => Promise<SearchResult>;
};
