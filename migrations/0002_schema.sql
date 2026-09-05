-- AI Lead Hunter core schema. Workspace-isolated CRM + agent task store.
-- user_id is TEXT (Better Auth / preview 'dev-user'). Never UUID.

create table if not exists workspaces (
  id          text primary key,
  user_id     text not null unique,
  name        text not null default 'My workspace',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists workspaces_user_id_idx on workspaces (user_id);

create table if not exists business_profiles (
  id                    text primary key,
  workspace_id          text not null unique references workspaces(id) on delete cascade,
  business_name         text not null default 'Lead Hunter Studio',
  offer                 text not null default 'AI Appointment Assistant',
  price                 numeric not null default 100,
  currency              text not null default 'USD',
  target_niche          text not null default 'Dental clinics',
  target_country        text not null default 'United States',
  min_lead_score        integer not null default 75,
  outreach_tone         text not null default 'professional',
  demo_url              text,
  contact_email         text,
  max_concurrent_tasks  integer not null default 5,
  max_daily_ai_spend    numeric not null default 5,
  agents_paused         boolean not null default false,
  demo_mode             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists campaigns (
  id            text primary key,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  niche         text not null default 'Dental clinics',
  country       text not null default 'United States',
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists campaigns_workspace_idx on campaigns (workspace_id);

create table if not exists leads (
  id              text primary key,
  workspace_id    text not null references workspaces(id) on delete cascade,
  campaign_id     text references campaigns(id) on delete set null,
  business_name   text not null,
  website         text,
  domain          text,
  category        text not null default 'Dental clinic',
  city            text,
  state           text,
  country         text not null default 'United States',
  public_phone    text,
  public_email    text,
  source_url      text,
  notes           text,
  tags            jsonb not null default '[]',
  status          text not null default 'NEW',
  is_demo         boolean not null default false,
  response        text,
  contacted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists leads_ws_domain_uidx
  on leads (workspace_id, domain) where domain is not null and domain <> '';
create index if not exists leads_ws_status_idx on leads (workspace_id, status);
create index if not exists leads_ws_created_idx on leads (workspace_id, created_at desc);
create index if not exists leads_ws_name_idx on leads (workspace_id, business_name);
create index if not exists leads_ws_city_idx on leads (workspace_id, city);
create index if not exists leads_ws_state_idx on leads (workspace_id, state);

create table if not exists lead_audits (
  id                      text primary key,
  lead_id                 text not null references leads(id) on delete cascade,
  workspace_id            text not null,
  appointment_available   boolean,
  chatbot_present         boolean,
  faq_present             boolean,
  lead_capture_present    boolean,
  after_hours_help        boolean,
  mobile_experience       text not null default 'unknown',
  contact_flow_clear      boolean,
  activity_signals        text not null default 'unknown',
  opportunities           jsonb not null default '[]',
  observations            jsonb not null default '[]',
  confidence              integer not null default 0,
  raw_json                jsonb not null default '{}',
  created_at              timestamptz not null default now()
);
create index if not exists lead_audits_lead_idx on lead_audits (lead_id, created_at desc);
create index if not exists lead_audits_ws_idx on lead_audits (workspace_id);

create table if not exists lead_scores (
  id                  text primary key,
  lead_id             text not null references leads(id) on delete cascade,
  workspace_id        text not null,
  score               integer not null,
  priority            text not null,
  reasons             jsonb not null default '[]',
  recommended_offer   text not null default 'AI Appointment Assistant',
  estimated_value     text not null default 'medium',
  created_at          timestamptz not null default now()
);
create index if not exists lead_scores_lead_idx on lead_scores (lead_id, created_at desc);
create index if not exists lead_scores_ws_score_idx on lead_scores (workspace_id, score desc);

create table if not exists outreach_drafts (
  id                    text primary key,
  lead_id               text not null references leads(id) on delete cascade,
  workspace_id          text not null,
  email_draft           text not null,
  contact_form_draft    text not null,
  short_message         text not null,
  evidence_notes        jsonb not null default '[]',
  approval_status       text not null default 'pending',
  approved_at           timestamptz,
  approved_by           text,
  generated_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists outreach_drafts_lead_idx on outreach_drafts (lead_id, created_at desc);
create index if not exists outreach_drafts_ws_status_idx on outreach_drafts (workspace_id, approval_status);

create table if not exists agent_tasks (
  id            text primary key,
  workspace_id  text not null references workspaces(id) on delete cascade,
  lead_id       text,
  agent_type    text not null,
  status        text not null default 'queued',
  input         jsonb not null default '{}',
  output        jsonb,
  error         text,
  retry_count   integer not null default 0,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists agent_tasks_ws_created_idx on agent_tasks (workspace_id, created_at desc);
create index if not exists agent_tasks_ws_agent_idx on agent_tasks (workspace_id, agent_type, status);
create index if not exists agent_tasks_lead_idx on agent_tasks (lead_id);

create table if not exists agent_events (
  id            text primary key,
  workspace_id  text not null references workspaces(id) on delete cascade,
  lead_id       text,
  agent_type    text,
  message       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists agent_events_ws_created_idx on agent_events (workspace_id, created_at desc);

create table if not exists revenue_records (
  id              text primary key,
  workspace_id    text not null references workspaces(id) on delete cascade,
  lead_id         text not null references leads(id) on delete cascade,
  offer           text not null,
  price           numeric not null,
  currency        text not null default 'USD',
  payment_status  text not null default 'won',
  revenue         numeric not null,
  won_at          timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists revenue_records_ws_idx on revenue_records (workspace_id, won_at desc);
create unique index if not exists revenue_records_lead_uidx on revenue_records (lead_id);

create table if not exists ai_usage (
  id              text primary key,
  workspace_id    text not null,
  day             date not null,
  tokens_in       integer not null default 0,
  tokens_out      integer not null default 0,
  estimated_cost  numeric not null default 0,
  calls           integer not null default 0,
  unique (workspace_id, day)
);
create index if not exists ai_usage_ws_day_idx on ai_usage (workspace_id, day);
