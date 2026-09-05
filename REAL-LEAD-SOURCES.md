# Real lead sources

Production Scout **never** reads `SAMPLE_CLINICS` or `SCOUT_POOL`. Those exist only for **Demo mode**.

If Demo mode is off and no live adapter is ready, Scout returns:

> No live lead source configured. Add a source or import leads.

It does not invent businesses.

## Adapters

| Key | Live? | Credentials | Notes |
|---|---|---|---|
| `demo_pool` | Demo mode only | none | Labeled sample US dental clinics |
| `osm_overpass` | Yes, public OSM | none | Dentists from OpenStreetMap Overpass. Permitted map data. Rate-limited. Disable with `OSM_OVERPASS_ENABLED=false`. |
| `google_places` | Adapter ready | `GOOGLE_PLACES_API_KEY` | Shows **Not configured** until the key is set server-side |
| `serper` | Adapter ready | `SERPER_API_KEY` | Same — not claimed live without a key |
| `csv` | Always | none | Import on **Sources** |
| `manual` | Always | none | **Add business** on Leads |

Keys never go to the browser. Health on `/sources` reports `ready` / `not_configured` / `disabled`.

## What we will not do

No CAPTCHA bypass, login bypass, private-profile scraping, fake reviews, or mass unsolicited sending.
