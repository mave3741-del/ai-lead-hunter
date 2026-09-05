# AI Lead Hunter

Find legitimate US dental clinics that can use an **AI Appointment Assistant** ($100 one-time setup), audit their public website, score the fit, draft outreach, and wait for a human before anything is copied out.

This is not a spam bot, not a mass-mailer, and not a fake-engagement tool. It uses permitted public business information only. **Outreach never sends itself.**

## What it does

1. **Scout** — collect public clinic records (manual entry + demo pool). Deduplicate by domain and name.
2. **Audit** — inspect the public website for booking, chatbot, FAQ, lead capture, after-hours help, mobile quality. Unknown stays unknown.
3. **Score** — explainable 0–100. Default outreach threshold is 75. Weak prospects stay out of the draft queue.
4. **Draft** — email / contact-form / short message from verified observations only.
5. **Human approval** — Approve, Edit, or Reject. Copy Message. Mark contacted only after approval.
6. **Track** — statuses from NEW through WON / LOST / DO_NOT_CONTACT, plus manual revenue.

The Master agent coordinates: Discover → Audit → Score → Qualify → Create outreach → Human approval → Track response.

## Architecture

TanStack Start (React + Vite) · TypeScript · Postgres (Neon in production, PGLite in preview) · Tailwind · Zod · Better Auth.

Agents are **jobs**, not six always-on models. Each run is stored as an `agent_tasks` row (`id`, agent type, status, timestamps, input, output, error, retry count).

Demo mode (default) uses sample clinics, HTML heuristics, and templates. Live mode can call an AI provider for richer audit/outreach copy when a server-side key is present.

## Pages

- `/` overview
- `/login` Google, X, or email/password
- `/dashboard` metrics
- `/leads` table + filters
- `/leads/:id` audit, score, approval
- `/agents` control center + event stream
- `/tasks` job log
- `/settings` offer, niche, caps, demo mode
- `/demo` the clinic assistant you sell

## Installation / local run

```bash
npm install
npm run dev
```

Also available:

```bash
npm run seed       # explains auto-seed (per workspace on first dashboard load)
npm test
npm run lint
npm run typecheck
npm run build
```

The app listens on port 8080.

Sign up on `/login` with email and password (or Google / X). First dashboard load seeds **20 sample US dental clinics** into your workspace. Demo mode stays on by default so you can walk the full pipeline without a paid API key.

Example preview account (already seeded in this environment):

- Email: `hunter@example.com`
- Password: `leadhunter1`

Workspaces are isolated — another account never sees these leads.

## Environment variables

Do not put secrets in the client. Platform / server injects these.

Copy `env.example` to a local `.env` (never commit it). Placeholders only.

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

Auth client ids are injected by the platform. Never expose provider keys with a `VITE_` prefix.

## Database

Schema lives in `migrations/`:

- `0001_auth.sql` — Better Auth
- `0002_schema.sql` — workspaces, business profiles, leads, audits, scores, drafts, tasks, events, campaigns, revenue, AI usage

Applied automatically on preview startup and on `npm run build` (`db:migrate`).

Every row is scoped to a workspace owned by the signed-in `user_id`. Server functions use `authMiddleware` and never trust a client-supplied user or workspace id.

## Demo mode

Default on. When enabled:

- No real outbound email
- No paid APIs required
- 20 sample US dental clinics (scores from 42 to 91, including below-threshold and do-not-contact)
- Scout pulls additional quality prospects from a reserved pool
- Auditor / outreach use heuristics and templates

Turn it off in Settings when you have a provider key and want live website fetches + optional model copy.

## Agent workflow

From **Agents**:

- Start Scout
- Score pending leads
- Generate outreach drafts
- Pause / resume all

From a lead: **Run pipeline** executes audit → score → draft (draft only if score ≥ minimum).

Caps: max concurrent tasks (default 5), max daily AI spend, retries for 429/5xx/timeout only (not invalid keys or unsafe URLs).

## Security

- Auth required for CRM data
- Workspace isolation on every query
- SSRF guards on website fetch: http/https only, no credentials, block localhost / private / link-local / metadata / cloud internals, DNS re-check, redirect re-validation, timeout, size cap
- AI keys stay on the server
- Zod validation of model JSON
- Rate limits on expensive runs
- Approval gate: `canSendOutreach` is false until status is `approved`

## Adding an AI provider

Set `AI_PROVIDER` and the matching `*_API_KEY`. The client talks OpenAI-compatible `/chat/completions` (xAI default model `grok-4.5`). On retryable failure the orchestrator may fall back to xAI if `XAI_API_KEY` is also set. Invalid keys are not retried.

## Deploy

Production build is Vercel via the existing Vite/Nitro pipeline. Provide `DATABASE_URL` and auth credentials (injected on this platform). Keep demo mode on until you are ready for live fetches.

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

## Extensibility

Scoring, scout pools, and the business profile `target_niche` are the seams for HVAC, salons, law, etc. MVP niche is US dental clinics.
