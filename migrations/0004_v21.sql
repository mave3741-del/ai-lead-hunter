-- v2.1: task duration/cost, source uniqueness, scout targeting.

alter table agent_tasks
  add column if not exists duration_ms integer;
alter table agent_tasks
  add column if not exists cost numeric not null default 0;

alter table business_profiles
  add column if not exists target_city text;
alter table business_profiles
  add column if not exists target_state text;

create unique index if not exists lead_sources_lead_src_uidx
  on lead_sources (lead_id, source_name);
