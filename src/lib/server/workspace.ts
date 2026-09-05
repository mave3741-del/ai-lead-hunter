import { getSql, type Sql } from "../db";
import type { BusinessProfile, Workspace } from "../types";
import { SAMPLE_CLINICS } from "../agents/sample-clinics";
import { templateOutreach } from "../agents/outreach";
import { jsonParam } from "./map";
import { num } from "../utils";
import { DEFAULT_OFFER } from "../lead-rules";

export type Ctx = { sql: Sql; workspace: Workspace; profile: BusinessProfile };

function mapProfile(row: Record<string, unknown>): BusinessProfile {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    business_name: String(row.business_name),
    offer: String(row.offer),
    price: num(row.price, 100),
    currency: String(row.currency ?? "USD"),
    target_niche: String(row.target_niche),
    target_country: String(row.target_country),
    min_lead_score: num(row.min_lead_score, 75),
    outreach_tone: String(row.outreach_tone ?? "professional"),
    demo_url: row.demo_url ? String(row.demo_url) : null,
    contact_email: row.contact_email ? String(row.contact_email) : null,
    max_concurrent_tasks: num(row.max_concurrent_tasks, 5),
    max_daily_ai_spend: num(row.max_daily_ai_spend, 5),
    agents_paused: Boolean(row.agents_paused),
    demo_mode: row.demo_mode == null ? true : Boolean(row.demo_mode),
  };
}

export async function getCtx(userId: string): Promise<Ctx> {
  const sql = await getSql();
  const existing = await sql<Record<string, unknown>>`
    select * from workspaces where user_id = ${userId} limit 1
  `;
  let workspace: Workspace;
  if (existing[0]) {
    workspace = {
      id: String(existing[0].id),
      user_id: String(existing[0].user_id),
      name: String(existing[0].name),
    };
  } else {
    const id = crypto.randomUUID();
    await sql`
      insert into workspaces (id, user_id, name)
      values (${id}, ${userId}, ${"Lead Hunter"})
      on conflict (user_id) do nothing
    `;
    const rows = await sql<Record<string, unknown>>`
      select * from workspaces where user_id = ${userId} limit 1
    `;
    const row = rows[0]!;
    workspace = { id: String(row.id), user_id: String(row.user_id), name: String(row.name) };
  }

  const profiles = await sql<Record<string, unknown>>`
    select * from business_profiles where workspace_id = ${workspace.id} limit 1
  `;
  let profile: BusinessProfile;
  if (profiles[0]) {
    profile = mapProfile(profiles[0]);
  } else {
    const demoDefault = process.env.ENABLE_DEMO_MODE === "false" ? false : true;
    const pid = crypto.randomUUID();
    await sql`
      insert into business_profiles (
        id, workspace_id, business_name, offer, price, currency,
        target_niche, target_country, min_lead_score, demo_mode
      ) values (
        ${pid}, ${workspace.id}, ${"Lead Hunter Studio"}, ${DEFAULT_OFFER}, ${100}, ${"USD"},
        ${"Dental clinics"}, ${"United States"}, ${75}, ${demoDefault}
      ) on conflict (workspace_id) do nothing
    `;
    const again = await sql<Record<string, unknown>>`
      select * from business_profiles where workspace_id = ${workspace.id} limit 1
    `;
    profile = mapProfile(again[0]!);
  }

  const campaigns = await sql<{ id: string }>`
    select id from campaigns where workspace_id = ${workspace.id} limit 1
  `;
  if (!campaigns[0]) {
    await sql`
      insert into campaigns (id, workspace_id, name, niche, country)
      values (${crypto.randomUUID()}, ${workspace.id}, ${"US Dental Clinics"}, ${"Dental clinics"}, ${"United States"})
    `;
  }

  await seedIfEmpty(sql, workspace.id, profile);
  return { sql, workspace, profile };
}

export async function seedIfEmpty(sql: Sql, workspaceId: string, profile: BusinessProfile) {
  const countRows = await sql<{ n: number }>`
    select count(*)::int as n from leads where workspace_id = ${workspaceId}
  `;
  if (num(countRows[0]?.n) > 0) return;
  await seedDemoLeads(sql, workspaceId, profile);
}

export async function seedDemoLeads(sql: Sql, workspaceId: string, profile: BusinessProfile) {
  const campaign = await sql<{ id: string }>`
    select id from campaigns where workspace_id = ${workspaceId} limit 1
  `;
  const campaignId = campaign[0]?.id ?? null;
  const prefix = workspaceId.slice(0, 8);

  for (const clinic of SAMPLE_CLINICS) {
    const leadId = `demo-${prefix}-${clinic.slug}`;
    try {
      await sql`
        insert into leads (
          id, workspace_id, campaign_id, business_name, website, domain, category,
          city, state, country, public_phone, public_email, source_url, notes, tags,
          status, is_demo, response, created_at, updated_at
        ) values (
          ${leadId}, ${workspaceId}, ${campaignId}, ${clinic.business_name}, ${clinic.website},
          ${clinic.domain}, ${clinic.category}, ${clinic.city}, ${clinic.state}, ${clinic.country},
          ${clinic.public_phone}, ${clinic.public_email}, ${clinic.source_url}, ${clinic.notes},
          ${jsonParam(clinic.tags)}::jsonb, ${clinic.status}, ${true}, ${clinic.response ?? null},
          now() - (${Math.floor(Math.random() * 12)}::text || ' days')::interval,
          now()
        )
        on conflict do nothing
      `;
    } catch {
      continue;
    }

    if (clinic.audit.confidence > 0) {
      const auditId = `aud-${prefix}-${clinic.slug}`;
      await sql`
        insert into lead_audits (
          id, lead_id, workspace_id, appointment_available, chatbot_present, faq_present,
          lead_capture_present, after_hours_help, mobile_experience, contact_flow_clear,
          activity_signals, opportunities, observations, confidence, raw_json
        ) values (
          ${auditId}, ${leadId}, ${workspaceId},
          ${clinic.audit.appointment_available}, ${clinic.audit.chatbot_present}, ${clinic.audit.faq_present},
          ${clinic.audit.lead_capture_present}, ${clinic.audit.after_hours_help}, ${clinic.audit.mobile_experience},
          ${clinic.audit.contact_flow_clear}, ${clinic.audit.activity_signals},
          ${jsonParam(clinic.audit.opportunities)}::jsonb, ${jsonParam(clinic.audit.observations)}::jsonb,
          ${clinic.audit.confidence}, ${jsonParam(clinic.audit)}::jsonb
        )
        on conflict do nothing
      `;
    }

    if (clinic.score > 0) {
      await sql`
        insert into lead_scores (
          id, lead_id, workspace_id, score, priority, reasons, recommended_offer, estimated_value
        ) values (
          ${`scr-${prefix}-${clinic.slug}`}, ${leadId}, ${workspaceId}, ${clinic.score},
          ${clinic.priority}, ${jsonParam(clinic.reasons)}::jsonb, ${profile.offer}, ${clinic.estimated_value}
        )
        on conflict do nothing
      `;
    }

    if (clinic.seedDraft && clinic.audit.confidence > 0) {
      const drafted = templateOutreach({
        businessName: clinic.business_name,
        audit: clinic.audit,
        offer: profile.offer,
        price: profile.price,
        currency: profile.currency,
      });
      if (!("error" in drafted)) {
        const approved = clinic.seedApproval === "approved";
        await sql`
          insert into outreach_drafts (
            id, lead_id, workspace_id, email_draft, contact_form_draft, short_message,
            evidence_notes, approval_status, approved_at, generated_at
          ) values (
            ${`out-${prefix}-${clinic.slug}`}, ${leadId}, ${workspaceId},
            ${drafted.email_draft}, ${drafted.contact_form_draft}, ${drafted.short_message},
            ${jsonParam(drafted.evidence_notes)}::jsonb, ${clinic.seedApproval ?? "pending"},
            ${approved ? new Date().toISOString() : null}, now()
          )
          on conflict do nothing
        `;
      }
    }
  }

  const won = SAMPLE_CLINICS.find((c) => c.status === "WON");
  if (won) {
    const leadId = `demo-${prefix}-${won.slug}`;
    await sql`
      insert into revenue_records (
        id, workspace_id, lead_id, offer, price, currency, payment_status, revenue, won_at
      ) values (
        ${`rev-${prefix}-${won.slug}`}, ${workspaceId}, ${leadId}, ${profile.offer},
        ${profile.price}, ${profile.currency}, ${"won"}, ${profile.price}, now() - interval '4 days'
      )
      on conflict do nothing
    `;
  }

  const events: Array<{ agent: string; message: string }> = [
    { agent: "scout", message: "Scout found a new lead: Sunrise Family Dental" },
    { agent: "auditor", message: "Audit completed for Bright Smile Family Dentistry" },
    { agent: "scorer", message: "Lead scored 90 — Bright Smile Family Dentistry" },
    { agent: "outreach", message: "Outreach draft generated for Pine Ridge Family Dental" },
    { agent: "manager", message: "Waiting for approval — Lakeview Dental Care" },
    { agent: "manager", message: "Valley View Dental marked won — $100" },
  ];
  for (const ev of events) {
    await sql`
      insert into agent_events (id, workspace_id, agent_type, message)
      values (${crypto.randomUUID()}, ${workspaceId}, ${ev.agent}, ${ev.message})
    `;
  }
}

export async function recordEvent(
  sql: Sql,
  workspaceId: string,
  message: string,
  agentType?: string | null,
  leadId?: string | null,
) {
  await sql`
    insert into agent_events (id, workspace_id, lead_id, agent_type, message)
    values (${crypto.randomUUID()}, ${workspaceId}, ${leadId ?? null}, ${agentType ?? null}, ${message})
  `;
}

export async function todayUsage(sql: Sql, workspaceId: string) {
  const rows = await sql<{ estimated_cost: string | number; calls: number }>`
    select estimated_cost, calls from ai_usage
    where workspace_id = ${workspaceId} and day = current_date
    limit 1
  `;
  return {
    cost: num(rows[0]?.estimated_cost),
    calls: num(rows[0]?.calls),
  };
}

export async function addUsage(
  sql: Sql,
  workspaceId: string,
  tokensIn: number,
  tokensOut: number,
  cost: number,
) {
  const id = crypto.randomUUID();
  await sql`
    insert into ai_usage (id, workspace_id, day, tokens_in, tokens_out, estimated_cost, calls)
    values (${id}, ${workspaceId}, current_date, ${tokensIn}, ${tokensOut}, ${cost}, ${1})
    on conflict (workspace_id, day) do update set
      tokens_in = ai_usage.tokens_in + excluded.tokens_in,
      tokens_out = ai_usage.tokens_out + excluded.tokens_out,
      estimated_cost = ai_usage.estimated_cost + excluded.estimated_cost,
      calls = ai_usage.calls + 1
  `;
}
