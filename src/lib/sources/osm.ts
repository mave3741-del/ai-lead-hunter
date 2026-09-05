import type { LeadSourceAdapter, SearchArgs, SearchResult, SourceCandidate } from "./types.ts";
import { domainFromUrl } from "../utils.ts";

const OVERPASS = process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter";

function enabled(): boolean {
  return process.env.OSM_OVERPASS_ENABLED !== "false";
}

async function queryOverpass(city: string, limit: number): Promise<SearchResult> {
  const q = `
[out:json][timeout:12];
area["name"="${city.replace(/"/g, "")}"]["admin_level"~"^(6|8)$"]["boundary"="administrative"]->.searchArea;
(
  node["amenity"="dentist"](area.searchArea);
  way["amenity"="dentist"](area.searchArea);
);
out center ${Math.min(40, Math.max(5, limit * 2))};
`.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14_000);
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "AILeadHunter/2.0 (public OSM Overpass; dental MVP)",
      },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) {
      return { ok: false, error: `Overpass HTTP ${res.status}`, source: "osm_overpass" };
    }
    const json = (await res.json()) as {
      elements?: Array<{ id: number; tags?: Record<string, string> }>;
    };
    const candidates: SourceCandidate[] = [];
    for (const el of json.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name?.trim();
      if (!name) continue;
      const website = tags.website || tags["contact:website"] || null;
      candidates.push({
        business_name: name,
        website,
        domain: website ? domainFromUrl(website) : null,
        city: tags["addr:city"] || city,
        state: tags["addr:state"] || null,
        country: "United States",
        public_phone: tags.phone || tags["contact:phone"] || null,
        public_email: tags.email || tags["contact:email"] || null,
        source_url: website || `https://www.openstreetmap.org/node/${el.id}`,
        category: "Dental clinic",
        external_id: String(el.id),
        notes: "Discovered from OpenStreetMap (public map data).",
      });
      if (candidates.length >= limit) break;
    }
    return { ok: true, candidates, source: "osm_overpass" };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      return { ok: false, error: "Overpass timed out", source: "osm_overpass" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Overpass failed",
      source: "osm_overpass",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const osmAdapter: LeadSourceAdapter = {
  key: "osm_overpass",
  name: "OpenStreetMap Overpass",
  requiresKey: false,
  configured: () => enabled(),
  health: () => ({
    key: "osm_overpass",
    name: "OpenStreetMap Overpass",
    configured: enabled(),
    enabled: enabled(),
    status: enabled() ? "ready" : "disabled",
    requires_key: false,
    detail: enabled()
      ? "Public OSM dentist POIs (no API key). Permitted map data, rate-limited."
      : "Disabled via OSM_OVERPASS_ENABLED=false",
  }),
  search: async (args: SearchArgs) => {
    if (!enabled()) {
      return { ok: false, error: "OSM Overpass is disabled", source: "osm_overpass", not_configured: true };
    }
    const city = args.city?.trim() || "Austin";
    return queryOverpass(city, args.limit);
  },
};
