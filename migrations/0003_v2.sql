-- v2: source adapters, follow-ups, opportunities, experiments, evidence.

alter table business_profiles
  add column if not exists daily_lead_target integer not null default 20;

alter table leads
  add column if not exists source text not null default 'manual';
alter table leads
  add column if not exists last_response_at timestamptz;
alter table leads
  add column if not exists owner_user_id text;

alter table lead_audits
  add column if not exists website_status text not null default 'unknown';
alter table lead_audits
  add column if not exists appointment_flow text not null default 'unknown';
alter table lead_audits
  add column if not exists evidence jsonb not null default '[]';

alter table outreach_drafts
  add column if not exists draft_kind text not null default 'outreach';
alter table outreach_drafts
  add column if not exists compliance_status text not null default 'SAFE';
alter table outreach_drafts
  add column if not exists sequence integer not null default 0;

create table if not exists lead_sources (
  id            text primary key,
  lead_id       text not null references leads(id) on delete cascade,
  workspace_id  text not null references workspaces(id) on delete cascade,
  source_name   text not null,
  source_url    text,
  external_id   text,
  payload       jsonb not null default '{}',
  discovered_at timestamptz not null default now()
);
create index if not exists lead_sources_lead_idx on lead_sources (lead_id);
create index if not exists lead_sources_ws_idx on lead_sources (workspace_id, source_name);

create table if not exists source_configs (
  id                text primary key,
  workspace_id      text not null references workspaces(id) on delete cascade,
  source_key        text not null,
  enabled           boolean not null default true,
  last_success_at   timestamptz,
  last_error        text,
  error_count       integer not null default 0,
  request_count     integer not null default 0,
  updated_at        timestamptz not null default now(),
  unique (workspace_id, source_key)
);

create table if not exists opportunities (
  id            text primary key,
  lead_id       text not null references leads(id) on delete cascade,
  workspace_id  text not null references workspaces(id) on delete cascade,
  title         text not null,
  offer         text not null,
  evidence      jsonb not null default '[]',
  created_at    timestamptz not null default now()
);
create index if not exists opportunities_lead_idx on opportunities (lead_id);

create table if not exists followups (
  id                text primary key,
  lead_id           text not null references leads(id) on delete cascade,
  workspace_id      text not null references workspaces(id) on delete cascade,
  sequence          integer not null,
  email_draft       text not null,
  short_message     text not null,
  approval_status   text not null default 'pending',
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists followups_lead_idx on followups (lead_id, sequence);

create table if not exists experiments (
  id            text primary key,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  niche         text not null,
  offer         text not null,
  price         numeric not null default 100,
  status        text not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists experiments_ws_idx on experiments (workspace_id);
