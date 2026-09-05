# AI Lead Hunter

**MVP v1.0.0** — find, audit, score, and draft outreach for US dental clinics.
Human approval required. Not a spam bot.

Find legitimate US dental clinics that can use an **AI Appointment Assistant** ($100 one-time setup), audit their public website, score the fit, draft outreach, and wait for a human before anything is copied out.

This is not a mass-mailer and not a fake-engagement tool. It uses permitted public business information only. **Outreach never sends itself.**

Repo: [github.com/mave3741-del/ai-lead-hunter](https://github.com/mave3741-del/ai-lead-hunter)

## Quick start

```bash
git clone https://github.com/mave3741-del/ai-lead-hunter.git
cd ai-lead-hunter
npm install
npm run dev
```

App: [http://localhost:8080](http://localhost:8080)

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Sign up on `/login` with email and password (or Google / X). First dashboard load seeds **20 sample US dental clinics**. Demo mode is on by default — full pipeline without a paid API key.

Preview account (this environment only):

- Email: `hunter@example.com`
- Password: `leadhunter1`

Workspaces are isolated — another account never sees these leads.

## What it does

1. **Scout** — collect public clinic records (manual entry + demo pool). Deduplicate by domain and name.
2. **Audit** — inspect the public website for booking, chatbot, FAQ, lead capture, after-hours help, mobile quality. Unknown stays unknown.
3. **Score** — explainable 0–100. Default outreach threshold is 75.
4. **Draft** — email / contact-form / short message from verified observations only.
5. **Human approval** — Approve, Edit, or Reject. Copy Message. Mark contacted only after approval.
6. **Track** — statuses from NEW through WON / LOST / DO_NOT_CONTACT, plus manual revenue.

Master agent: Discover → Audit → Score → Qualify → Create outreach → Human approval → Track response.

## Pages

| Path | Purpose |
|---|---|
| `/` | Overview |
| `/login` | Google, X, or email/password |
| `/dashboard` | Metrics |
| `/leads` | Table + filters |
| `/leads/:id` | Audit, score, approval |
| `/agents` | Control center + event stream |
| `/tasks` | Job log |
| `/settings` | Offer, niche, caps, demo mode |
| `/demo` | Clinic assistant you sell |

## Architecture

TanStack Start (React + Vite) · TypeScript · Postgres (Neon in production, PGLite in preview) · Tailwind · Zod · Better Auth.

Agents are **jobs**, not six always-on models. Each run is an `agent_tasks` row (`id`, agent type, status, timestamps, input, output, error, retry count).

Demo mode uses sample clinics, HTML heuristics, and templates. Live mode can call an AI provider when a server-side key is present.

## Environment

Copy `env.example` to `.env`. Never commit secrets. Do not prefix provider keys with `VITE_`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres. Unset → embedded PGLite for preview |
| `XAI_API_KEY` | xAI chat (server only). Preferred provider |
| `AI_PROVIDER` | `xai` (default), `openai`, `anthropic`, `google`, `openrouter` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | OpenAI-compatible fallback |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GOOGLE_API_KEY` | Google |
| `OPENROUTER_API_KEY` | OpenRouter |
| `ENABLE_DEMO_MODE` | `false` to default new workspaces to live mode |

## Database

Schema in `migrations/`:

- `0001_auth.sql` — Better Auth
- `0002_schema.sql` — workspaces, business profiles, leads, audits, scores, drafts, tasks, events, campaigns, revenue, AI usage

Applied automatically on preview startup and on `npm run build` (`db:migrate`).

Every row is scoped to a workspace owned by the signed-in `user_id`. Server functions use `authMiddleware` and never trust a client-supplied user or workspace id.

## Demo mode

Default on:

- No real outbound email
- No paid APIs required
- 20 sample US dental clinics (scores 42–91, including below-threshold and do-not-contact)
- Scout pulls additional quality prospects from a reserved pool
- Auditor / outreach use heuristics and templates

Turn it off in Settings when you have a provider key and want live website fetches + optional model copy.

## Agent workflow

From **Agents**: Start Scout, score pending leads, generate outreach drafts, pause / resume all.

From a lead: **Run pipeline** executes audit → score → draft (draft only if score ≥ minimum).

Caps: max concurrent tasks (default 5), max daily AI spend, retries for 429/5xx/timeout only.

## Security

- Auth required for CRM data
- Workspace isolation on every query
- SSRF guards on website fetch: http/https only, no credentials, block localhost / private / link-local / metadata / cloud internals, DNS re-check, redirect re-validation, timeout, size cap
- AI keys stay on the server
- Zod validation of model JSON
- Rate limits on expensive runs
- Approval gate: `canSendOutreach` is false until status is `approved`

## How to find leads

1. Sign in.
2. Open the dashboard — demo clinics load automatically.
3. Or **Add business** with a public website / **Start Scout**.
4. Run pipeline on a prospect.
5. If score ≥ 75, open the draft, **Approve** (or Edit then Approve).
6. **Copy message** and send it yourself. Then **Mark contacted**.
7. Log replies. **Mark as won** records $100 revenue.

Quality target: about 20 high-quality prospects/day, not thousands of junk rows.

## Human approval

Mandatory. There is no send API. Mark contacted is rejected unless the latest draft is `approved`.

## Compliance

- Public business information only
- No CAPTCHA bypass, no unauthorized scraping, no private data
- No impersonation, fake reviews, or fake engagement
- No medical claims in outreach or in the clinic assistant
- CAN-SPAM / anti-spam: a person chooses whether a specific, evidence-based note goes out

## Deploy

This is a Node + Postgres app, not a static site. GitHub Pages is not enough.

**Recommended: Vercel + Neon**

1. Create a Neon Postgres database and copy `DATABASE_URL`.
2. Import this repo in [Vercel](https://vercel.com/new).
3. Set env vars: `DATABASE_URL`, `XAI_API_KEY` (or another provider), `ENABLE_DEMO_MODE=true` until live fetches are ready.
4. Deploy. Auth client IDs are injected by the platform or set in Vercel env.

Keep demo mode on until you are ready for live website fetches.

**Make the repo private (optional)**

GitHub app → repo → **Settings** → **General** → Danger Zone → **Change repository visibility** → Private.

Private is better if you are selling the product and do not want the source public. Vercel can still deploy a private repo if your GitHub account is connected.

## License

Proprietary. See [LICENSE](LICENSE). Evaluation viewing only unless you have a written license.

## Extensibility

Scoring, scout pools, and `target_niche` are the seams for HVAC, salons, law, etc. MVP niche is US dental clinics.
