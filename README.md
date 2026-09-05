# AI Lead Hunter

**v2.1.0** — Find real businesses. Sell a real offer. Get a real $100 customer.

Find legitimate businesses (current niche: US dental clinics) that can use an **AI Appointment Assistant** ($100 one-time setup), audit their public website, score the fit, draft outreach, and wait for a human before anything is copied out.

This is not a spam bot, not a mass-mailer, and not a fake-engagement tool. Permitted public business information only. **Outreach never sends itself.**

Repo: [github.com/mave3741-del/ai-lead-hunter](https://github.com/mave3741-del/ai-lead-hunter)

See [REAL-LEAD-SOURCES.md](./REAL-LEAD-SOURCES.md) and [BUSINESS-PLAYBOOK.md](./BUSINESS-PLAYBOOK.md).

## Quick start

```bash
git clone https://github.com/mave3741-del/ai-lead-hunter.git
cd ai-lead-hunter
npm install
npm run dev
```

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Sign up on `/login`. First dashboard load seeds **20 sample US dental clinics** when Demo mode is on.

Preview account (this environment only): `hunter@example.com` / `leadhunter1`

Workspaces are isolated.

## What it does

1. **Scout** — queries every ready source (OSM, optional Places/Serper, CSV, manual), merges duplicates, keeps source records. Demo mode may use labeled samples. Production never silently uses sample data.
2. **Research / audit** — public website only. Unknown stays unknown. Evidence URLs stored.
3. **Opportunity + score + offer** — explainable 0–100. Default threshold 75. No pitch without a verified gap.
4. **Draft + compliance** — evidence-based copy. Deceptive/medical/spam patterns rejected.
5. **Human approval** — Approve / Edit / Reject. Copy the message yourself. Follow-ups also need approval (max 2).
6. **Track** — WON / LOST / DO_NOT_CONTACT, experiments, source ROI, $100 revenue.

Master jobs: Discover → Deduplicate → Research → Audit → Opportunity → Score → Offer → Outreach → Compliance → Human approval → Track → Revenue.

Agents are **queued jobs** with concurrency and spend caps — not 300 always-on models. One AI provider can play several roles.

## Pages

`/` `/login` `/dashboard` `/leads` `/leads/:id` `/sources` `/agents` `/tasks` `/campaigns` `/revenue` `/experiments` `/settings` `/demo`

## Architecture

TanStack Start (React + Vite) · TypeScript · Postgres (Neon or PGLite) · Tailwind · Zod · Better Auth.

## Environment

Copy `env.example` (or `.env.example`) to `.env`. Never commit secrets. Never prefix provider keys with `VITE_`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres. Unset → PGLite |
| `AI_PROVIDER` / `AI_FALLBACK_PROVIDER` | Provider routing |
| `XAI_API_KEY` `OPENAI_API_KEY` `ANTHROPIC_API_KEY` `GOOGLE_API_KEY` `OPENROUTER_API_KEY` | Server-side model keys |
| `GOOGLE_PLACES_API_KEY` `SERPER_API_KEY` | Live search adapters |
| `OSM_OVERPASS_ENABLED` | Public OSM dentist POIs (default on) |
| `ENABLE_DEMO_MODE` | Default for new workspaces |

## Database

`migrations/0001_auth.sql`, `0002_schema.sql`, `0003_v2.sql`, `0004_v21.sql`. Auto-applied.

## Demo vs production

**Demo mode:** labeled sample clinics, heuristics, no outbound. Badge shown.

**Production:** never uses `SAMPLE_CLINICS`. If no live adapter is ready: *No live lead source configured. Add a source or import leads.*

## Cost control

`max_concurrent_tasks` (default 5), `max_daily_ai_spend`, `daily_lead_target` (~20). Source searches rate-limited. Website fetch timeout + size cap.

## Security

Auth, workspace isolation, SSRF (http/https only, block localhost/private/metadata, DNS re-check, redirect re-validation, timeout, size cap), server-side keys, Zod on model JSON, rate limits, approval gate server-side.

## License

Proprietary. See [LICENSE](./LICENSE).
