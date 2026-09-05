import { SAMPLE_CLINICS, SCOUT_POOL } from "../agents/sample-clinics.ts";
import { domainFromUrl, normalizeName } from "../utils.ts";
import { limitSource } from "../rate-limit.ts";
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
        sources: ["demo_pool"],
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

export const DEFAULT_SCOUT_CITIES = [
  "Austin",
  "Denver",
  "Portland",
  "Nashville",
  "Raleigh",
  "Columbus",
  "Tampa",
];

export function productionAdapters(): LeadSourceAdapter[] {
  return ALL_ADAPTERS.filter((a) => a.key !== "demo_pool" && a.configured());
}

export function fingerprint(c: SourceCandidate): { domain: string | null; name: string; place: string } {
  return {
    domain: (c.domain || (c.website ? domainFromUrl(c.website) : null) || "").toLowerCase() || null,
    name: normalizeName(c.business_name),
    place: `${normalizeName(c.city || "")}|${normalizeName(c.state || "")}`,
  };
}

export type MergedCandidate = SourceCandidate & { sources: string[] };

/** Combine adapter batches into one list. Same domain / name+place / external id → one row. */
export function mergeCandidates(
  batches: Array<{ source: string; candidates: SourceCandidate[] }>,
): MergedCandidate[] {
  const out: MergedCandidate[] = [];
  const byDomain = new Map<string, number>();
  const byNamePlace = new Map<string, number>();
  const byExt = new Map<string, number>();

  function locate(c: SourceCandidate, source: string): number | undefined {
    const fp = fingerprint(c);
    if (c.external_id) {
      const k = `${source}:${c.external_id}`;
      if (byExt.has(k)) return byExt.get(k);
    }
    if (fp.domain && byDomain.has(fp.domain)) return byDomain.get(fp.domain);
    if (fp.name && fp.place !== "|") {
      const k = `${fp.name}|${fp.place}`;
      if (byNamePlace.has(k)) return byNamePlace.get(k);
    }
    return undefined;
  }

  function remember(idx: number, c: SourceCandidate, source: string) {
    const fp = fingerprint(c);
    if (fp.domain) byDomain.set(fp.domain, idx);
    if (fp.name && fp.place !== "|") byNamePlace.set(`${fp.name}|${fp.place}`, idx);
    if (c.external_id) byExt.set(`${source}:${c.external_id}`, idx);
  }

  function fillMissing(target: MergedCandidate, extra: SourceCandidate) {
    if (!target.website && extra.website) {
      target.website = extra.website;
      target.domain = extra.domain || target.domain;
    }
    if (!target.public_phone && extra.public_phone) target.public_phone = extra.public_phone;
    if (!target.public_email && extra.public_email) target.public_email = extra.public_email;
    if (!target.source_url && extra.source_url) target.source_url = extra.source_url;
    if (!target.city && extra.city) target.city = extra.city;
    if (!target.state && extra.state) target.state = extra.state;
  }

  for (const batch of batches) {
    for (const c of batch.candidates) {
      const idx = locate(c, batch.source);
      if (idx != null) {
        const existing = out[idx]!;
        if (!existing.sources.includes(batch.source)) existing.sources.push(batch.source);
        fillMissing(existing, c);
        continue;
      }
      const merged: MergedCandidate = { ...c, sources: [batch.source] };
      out.push(merged);
      remember(out.length - 1, merged, batch.source);
    }
  }
  return out;
}

async function searchAdapter(adapter: LeadSourceAdapter, args: SearchArgs): Promise<SearchResult> {
  const gated = limitSource(adapter.key);
  if (!gated.ok) {
    return { ok: false, error: "Source rate limited — try again shortly", source: adapter.key };
  }
  if (adapter.key === "osm_overpass" && !args.city?.trim()) {
    const pooled: SourceCandidate[] = [];
    const errors: string[] = [];
    for (const city of DEFAULT_SCOUT_CITIES.slice(0, 2)) {
      const r = await adapter.search({ ...args, city });
      if (r.ok) pooled.push(...r.candidates);
      else errors.push(r.error);
      if (pooled.length >= args.limit) break;
    }
    if (pooled.length > 0) {
      return { ok: true, candidates: pooled.slice(0, args.limit), source: adapter.key };
    }
    return {
      ok: false,
      error: errors.join(" · ") || "0 results",
      source: adapter.key,
    };
  }
  return adapter.search(args);
}

export async function discoverLeads(opts: {
  demoMode: boolean;
  args: SearchArgs;
  disabledKeys?: string[];
}): Promise<SearchResult & { used: string; sources_used: string[] }> {
  if (opts.demoMode) {
    const r = await demoAdapter.search(opts.args);
    return { ...r, used: "demo_pool", sources_used: ["demo_pool"] };
  }
  const skip = new Set(opts.disabledKeys ?? []);
  const live = productionAdapters().filter((a) => !skip.has(a.key));
  if (live.length === 0) {
    return {
      ok: false,
      error: "No live lead source configured. Add a source or import leads.",
      source: "none",
      not_configured: true,
      used: "none",
      sources_used: [],
    };
  }
  const batches: Array<{ source: string; candidates: SourceCandidate[] }> = [];
  const errors: string[] = [];
  const used: string[] = [];
  for (const adapter of live) {
    try {
      const r = await searchAdapter(adapter, opts.args);
      if (r.ok && r.candidates.length > 0) {
        batches.push({ source: adapter.key, candidates: r.candidates });
        used.push(adapter.key);
      } else if (r.ok) {
        errors.push(`${adapter.key}: 0 results`);
      } else {
        errors.push(`${adapter.key}: ${r.error}`);
      }
    } catch (err) {
      errors.push(`${adapter.key}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  const candidates = mergeCandidates(batches);
  if (candidates.length === 0) {
    return {
      ok: false,
      error: errors.join(" · ") || "No live lead source returned results",
      source: used[0] || live[0]!.key,
      used: used.join(",") || "none",
      sources_used: used,
    };
  }
  return {
    ok: true,
    candidates,
    source: used.join(","),
    used: used.join(","),
    sources_used: used,
  };
}
