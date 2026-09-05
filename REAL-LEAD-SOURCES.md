# Real lead sources

Production Scout **never** reads `SAMPLE_CLINICS` or `SCOUT_POOL`. Those exist only for **Demo mode**.

Scout queries **every ready adapter**, then **merges** duplicates (domain, name+city, external id). One business from OSM + Places is still one lead, with both source records kept.

If Demo mode is off and no live adapter is ready:

> No live lead source configured. Add a source or import leads.

It does not invent businesses.

## Adapters

| Key | Live? | Credentials | Notes |
|---|---|---|---|
| `demo_pool` | Demo mode only | none | Labeled sample US dental clinics |
| `osm_overpass` | Yes, public OSM | none | Dentist POIs when niche is dental. Rate-limited. Disable with `OSM_OVERPASS_ENABLED=false`. Other niches return 0 OSM results (use Places/CSV). |
| `google_places` | Adapter ready | `GOOGLE_PLACES_API_KEY` | **Not configured** until the key is set server-side |
| `serper` | Adapter ready | `SERPER_API_KEY` | Same — not claimed live without a key |
| `csv` | Always | none | Import on **Sources**. Enters the same pipeline. |
| `manual` | Always | none | **Add business** on Leads |

Keys never go to the browser. Health on `/sources` reports `ready` / `not_configured` / `disabled`, plus leads / qualified / won / revenue (ROI).

Enable / disable a source per workspace. Disabled adapters are skipped.

## Rate limits

8 searches / minute / adapter in-process. Website fetches are capped separately. Do not hammer Overpass.

## What we will not do

No CAPTCHA bypass, login bypass, private-profile scraping, fake reviews, or mass unsolicited sending.
