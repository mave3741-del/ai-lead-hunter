import type { LeadSourceAdapter, SearchArgs, SearchResult, SourceCandidate } from "./types.ts";
import { domainFromUrl } from "../utils.ts";

function placesKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || undefined;
}

function serperKey(): string | undefined {
  return process.env.SERPER_API_KEY || undefined;
}

export const googlePlacesAdapter: LeadSourceAdapter = {
  key: "google_places",
  name: "Google Places",
  requiresKey: true,
  configured: () => Boolean(placesKey()),
  health: () => {
    const ok = Boolean(placesKey());
    return {
      key: "google_places",
      name: "Google Places",
      configured: ok,
      enabled: ok,
      status: ok ? "ready" : "not_configured",
      requires_key: true,
      detail: ok
        ? "GOOGLE_PLACES_API_KEY is set (server-side)."
        : "Not configured. Set GOOGLE_PLACES_API_KEY to enable Places Text Search.",
    };
  },
  search: async (args: SearchArgs): Promise<SearchResult> => {
    const key = placesKey();
    if (!key) {
      return {
        ok: false,
        error: "Google Places is not configured",
        source: "google_places",
        not_configured: true,
      };
    }
    const q = `${args.niche} in ${args.city || "Austin"} ${args.country}`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return { ok: false, error: `Places HTTP ${res.status}`, source: "google_places" };
      const json = (await res.json()) as {
        results?: Array<{
          place_id: string;
          name: string;
          formatted_address?: string;
          business_status?: string;
        }>;
        error_message?: string;
        status?: string;
      };
      if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
        return { ok: false, error: json.error_message || json.status, source: "google_places" };
      }
      const candidates: SourceCandidate[] = (json.results ?? []).slice(0, args.limit).map((r) => ({
        business_name: r.name,
        source_url: `https://www.google.com/maps/place/?q=place_id:${r.place_id}`,
        city: args.city ?? null,
        country: args.country,
        category: "Dental clinic",
        external_id: r.place_id,
        notes: r.formatted_address ?? null,
      }));
      return { ok: true, candidates, source: "google_places" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Places failed",
        source: "google_places",
      };
    }
  },
};

export const serperAdapter: LeadSourceAdapter = {
  key: "serper",
  name: "Serper web search",
  requiresKey: true,
  configured: () => Boolean(serperKey()),
  health: () => {
    const ok = Boolean(serperKey());
    return {
      key: "serper",
      name: "Serper web search",
      configured: ok,
      enabled: ok,
      status: ok ? "ready" : "not_configured",
      requires_key: true,
      detail: ok
        ? "SERPER_API_KEY is set (server-side)."
        : "Not configured. Set SERPER_API_KEY for permitted web search of public clinic sites.",
    };
  },
  search: async (args: SearchArgs): Promise<SearchResult> => {
    const key = serperKey();
    if (!key) {
      return { ok: false, error: "Serper is not configured", source: "serper", not_configured: true };
    }
    try {
      const res = await fetch("https://google.serper.dev/places", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `${args.niche} ${args.city || "Austin"}`, gl: "us" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, error: `Serper HTTP ${res.status}`, source: "serper" };
      const json = (await res.json()) as {
        places?: Array<{ title?: string; website?: string; phoneNumber?: string; address?: string }>;
      };
      const candidates: SourceCandidate[] = (json.places ?? []).slice(0, args.limit).map((p) => ({
        business_name: p.title || "Unknown clinic",
        website: p.website ?? null,
        domain: p.website ? domainFromUrl(p.website) : null,
        public_phone: p.phoneNumber ?? null,
        city: args.city ?? null,
        country: args.country,
        source_url: p.website ?? null,
        category: "Dental clinic",
        notes: p.address ?? null,
      }));
      return { ok: true, candidates, source: "serper" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Serper failed",
        source: "serper",
      };
    }
  },
};
