import { SAMPLE_CLINICS, SCOUT_POOL } from "../agents/sample-clinics.ts";
import { domainFromUrl, normalizeName } from "../utils.ts";
import { osmAdapter } from "./osm.ts";
import { googlePlacesAdapter, serperAdapter } from "./places.ts";
import type { LeadSourceAdapter, SearchArgs, SearchResult, SourceCandidate, SourceHealth } from "./types.ts";

export type { SourceCandidate, SourceHealth, SearchResult };

const demoAdapter: LeadSourceAdapter = {
  key: "demo_pool",
  name: "Demo sample clinics",
  requiresKey: false,
  configured: () => true,
  health: () => ({
    key: "demo_pool",
    name: "Demo sample clinics",
    configured: true,
    enabled: true,
    status: "ready",
    requires_key: false,
    detail: "Labeled demo records. Used only when Demo mode is on.",
  }),
  search: async (args) => {
    const pool = [...SAMPLE_CLINICS, ...SCOUT_POOL];
    return {
      ok: true,
      source: "demo_pool",
      candidates: pool.slice(0, args.limit).map((c) => ({
        business_name: c.business_name,
        website: c.website,
        domain: c.domain,
        city: c.city,
        state: c.state,
        country: c.country,
        public_phone: c.public_phone,
        public_email: c.public_email,
        source_url: c.source_url,
        category: c.category,
        notes: c.notes,
      })),
    };
  },
};

export const ALL_ADAPTERS: LeadSourceAdapter[] = [
  demoAdapter,
  osmAdapter,
  googlePlacesAdapter,
  serperAdapter,
];

export function listSourceHealth(demoMode: boolean): SourceHealth[] {
  return ALL_ADAPTERS.map((a) => {
    const h = a.health();
    if (a.key === "demo_pool" && !demoMode) {
      return {
        ...h,
        enabled: false,
        status: "disabled",
        detail: "Demo pool is locked in production. Import CSV, add a lead, or enable a live adapter.",
      };
    }
    return h;
  });
}

export function productionAdapters(): LeadSourceAdapter[] {
  return ALL_ADAPTERS.filter((a) => a.key !== "demo_pool" && a.configured());
}

export async function discoverLeads(opts: {
  demoMode: boolean;
  args: SearchArgs;
}): Promise<SearchResult & { used: string }> {
  if (opts.demoMode) {
    const r = await demoAdapter.search(opts.args);
    return { ...r, used: "demo_pool" };
  }
  const live = productionAdapters();
  if (live.length === 0) {
    return {
      ok: false,
      error: "No live lead source configured. Add a source or import leads.",
      source: "none",
      not_configured: true,
      used: "none",
    };
  }
  const errors: string[] = [];
  for (const adapter of live) {
    const r = await adapter.search(opts.args);
    if (r.ok && r.candidates.length > 0) return { ...r, used: adapter.key };
    if (r.ok) errors.push(`${adapter.key}: 0 results`);
    else errors.push(`${adapter.key}: ${r.error}`);
  }
  return {
    ok: false,
    error: errors.join(" · ") || "No live lead source returned results",
    source: live[0]!.key,
    used: live[0]!.key,
  };
}

export function fingerprint(c: SourceCandidate): { domain: string | null; name: string; place: string } {
  return {
    domain: (c.domain || (c.website ? domainFromUrl(c.website) : null) || "").toLowerCase() || null,
    name: normalizeName(c.business_name),
    place: `${normalizeName(c.city || "")}|${normalizeName(c.state || "")}`,
  };
}
