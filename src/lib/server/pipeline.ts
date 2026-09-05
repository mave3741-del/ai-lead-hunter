import type { Sql } from "../db";
import type { AgentType, AuditResult, BusinessProfile, JsonValue, LeadStatus } from "../types";
import { SAMPLE_CLINICS, SCOUT_POOL, type SampleClinic } from "../agents/sample-clinics";
import { runWebsiteAudit } from "../agents/auditor";
import { generateOutreach, templateOutreach } from "../agents/outreach";
import { calculateScore, shouldPrepareOutreach, statusAfterAudit, statusAfterDraft } from "../lead-rules";
import { aiAvailable, estimateCostUsd } from "../ai/client";
import { domainFromUrl, normalizeName } from "../utils";
import { addUsage, recordEvent, todayUsage, type Ctx } from "./workspace";
import { jsonParam, mapLead } from "./map";
import { parsePublicHttpUrl } from "../url-safety";

export type TaskResult = {
  id: string;
  agent_type: AgentType;
  status: "completed" | "failed" | "cancelled";
  output?: JsonValue;
  error?: string;
};

async function runningCount(sql: Sql, workspaceId: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from agent_tasks
    where workspace_id = ${workspaceId} and status = 'running'
  `;
  return Number(rows[0]?.n ?? 0);
}

async function beginTask(
  ctx: Ctx,
  agent: AgentType,
  input: JsonValue,
  leadId?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string; id?: string }> {
  if (ctx.profile.agents_paused) {
    return { ok: false, error: "Agents are paused" };
  }
  const running = await runningCount(ctx.sql, ctx.workspace.id);
  if (running >= ctx.profile.max_concurrent_tasks) {
    return { ok: false, error: `Max concurrent tasks (${ctx.profile.max_concurrent_tasks}) reached` };
  }
  const usage = await todayUsage(ctx.sql, ctx.workspace.id);
  if (usage.cost >= ctx.profile.max_daily_ai_spend && !ctx.profile.demo_mode) {
    return { ok: false, error: "Daily AI spend cap reached" };
  }
  const id = crypto.randomUUID();
  await ctx.sql`
    insert into agent_tasks (id, workspace_id, lead_id, agent_type, status, input, started_at)
    values (${id}, ${ctx.workspace.id}, ${leadId ?? null}, ${agent}, ${"running"}, ${jsonParam(input)}::jsonb, now())
  `;
  return { ok: true, id };
}

async function finishTask(
  sql: Sql,
  id: string,
  status: "completed" | "failed" | "cancelled",
  output?: JsonValue,
  error?: string,
) {
  await sql`
    update agent_tasks
    set status = ${status},
        output = ${output ? jsonParam(output) : null}::jsonb,
        error = ${error ?? null},
        completed_at = now()
    where id = ${id}
  `;
}

async function loadLead(sql: Sql, workspaceId: string, leadId: string) {
  const rows = await sql<Record<string, unknown>>`
    select * from leads where id = ${leadId} and workspace_id = ${workspaceId} limit 1
  `;
  return rows[0] ? mapLead(rows[0]) : null;
}

async function setStatus(sql: Sql, workspaceId: string, leadId: string, status: LeadStatus) {
  await sql`
    update leads set status = ${status}, updated_at = now()
    where id = ${leadId} and workspace_id = ${workspaceId}
  `;
}

function clinicToInsert(c: SampleClinic) {
  return c;
}

export async function runScout(ctx: Ctx): Promise<TaskResult> {
  const started = await beginTask(ctx, "scout", { niche: ctx.profile.target_niche });
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "scout", status: "failed", error: started.error };
  }
  try {
    const existing = await ctx.sql<{ domain: string | null; business_name: string }>`
      select domain, business_name from leads where workspace_id = ${ctx.workspace.id}
    `;
    const domains = new Set(existing.map((e) => (e.domain || "").toLowerCase()).filter(Boolean));
    const names = new Set(existing.map((e) => normalizeName(e.business_name)));
    const pool = [...SAMPLE_CLINICS, ...SCOUT_POOL].filter(
      (c) => !domains.has(c.domain) && !names.has(normalizeName(c.business_name)),
    );
    const quality = pool.filter((c) => c.score === 0 || c.score >= 70 || c.status === "NEW");
    const pick = quality.slice(0, 4);
    if (pick.length === 0) {
      await recordEvent(ctx.sql, ctx.workspace.id, "Scout found no new quality prospects in the permitted pool", "scout");
      await finishTask(ctx.sql, started.id, "completed", { added: 0, reason: "pool exhausted" });
      return { id: started.id, agent_type: "scout", status: "completed", output: { added: 0 } };
    }
    const campaign = await ctx.sql<{ id: string }>`
      select id from campaigns where workspace_id = ${ctx.workspace.id} limit 1
    `;
    const added: string[] = [];
    for (const c of pick.map(clinicToInsert)) {
      const id = crypto.randomUUID();
      await ctx.sql`
        insert into leads (
          id, workspace_id, campaign_id, business_name, website, domain, category,
          city, state, country, public_phone, public_email, source_url, notes, tags, status, is_demo
        ) values (
          ${id}, ${ctx.workspace.id}, ${campaign[0]?.id ?? null}, ${c.business_name}, ${c.website},
          ${c.domain}, ${c.category}, ${c.city}, ${c.state}, ${c.country}, ${c.public_phone},
          ${c.public_email}, ${c.source_url}, ${c.notes}, ${jsonParam(c.tags)}::jsonb, ${"NEW"}, ${true}
        )
        on conflict do nothing
      `;
      added.push(c.business_name);
      await recordEvent(ctx.sql, ctx.workspace.id, `Scout found a new lead: ${c.business_name}`, "scout", id);
    }
    await finishTask(ctx.sql, started.id, "completed", { added: added.length, names: added });
    return { id: started.id, agent_type: "scout", status: "completed", output: { added: added.length } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scout failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "scout", status: "failed", error: message };
  }
}

export async function persistAudit(
  ctx: Ctx,
  leadId: string,
  audit: AuditResult,
) {
  const id = crypto.randomUUID();
  await ctx.sql`
    insert into lead_audits (
      id, lead_id, workspace_id, appointment_available, chatbot_present, faq_present,
      lead_capture_present, after_hours_help, mobile_experience, contact_flow_clear,
      activity_signals, opportunities, observations, confidence, raw_json
    ) values (
      ${id}, ${leadId}, ${ctx.workspace.id},
      ${audit.appointment_available}, ${audit.chatbot_present}, ${audit.faq_present},
      ${audit.lead_capture_present}, ${audit.after_hours_help}, ${audit.mobile_experience},
      ${audit.contact_flow_clear}, ${audit.activity_signals},
      ${jsonParam(audit.opportunities)}::jsonb, ${jsonParam(audit.observations)}::jsonb,
      ${audit.confidence}, ${jsonParam(audit)}::jsonb
    )
  `;
  return id;
}

export async function persistScore(ctx: Ctx, leadId: string, profile: BusinessProfile, audit: AuditResult) {
  const scored = calculateScore(audit, profile.offer);
  const id = crypto.randomUUID();
  await ctx.sql`
    insert into lead_scores (
      id, lead_id, workspace_id, score, priority, reasons, recommended_offer, estimated_value
    ) values (
      ${id}, ${leadId}, ${ctx.workspace.id}, ${scored.score}, ${scored.priority},
      ${jsonParam(scored.reasons)}::jsonb, ${scored.recommended_offer}, ${scored.estimated_value}
    )
  `;
  return scored;
}

async function demoAuditFor(leadName: string, website: string | null): Promise<AuditResult | null> {
  const all = [...SAMPLE_CLINICS, ...SCOUT_POOL];
  const domain = website ? domainFromUrl(website) : null;
  const found = all.find(
    (c) => c.domain === domain || normalizeName(c.business_name) === normalizeName(leadName),
  );
  return found && found.audit.confidence > 0 ? found.audit : null;
}

export async function runAudit(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "auditor", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "auditor", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    await setStatus(ctx.sql, ctx.workspace.id, leadId, "RESEARCHING");

    let audit: AuditResult | null = null;
    let source = "demo";
    const canned = await demoAuditFor(lead.business_name, lead.website);
    if (canned && (ctx.profile.demo_mode || !lead.website || lead.website.includes(".example"))) {
      audit = canned;
      source = "demo";
    } else if (lead.website) {
      const parsed = parsePublicHttpUrl(lead.website);
      if (!parsed.ok) throw new Error(parsed.error);
      const useAi = !ctx.profile.demo_mode && aiAvailable();
      const result = await runWebsiteAudit({ website: lead.website, useAi });
      audit = result.audit;
      source = result.source;
      if (result.error && result.source === "unavailable") {
        throw new Error(result.error);
      }
    } else {
      throw new Error("Lead has no website to audit");
    }

    await persistAudit(ctx, leadId, audit);
    await setStatus(ctx.sql, ctx.workspace.id, leadId, "AUDITED");
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      `Audit completed for ${lead.business_name} (${source}, confidence ${audit.confidence})`,
      "auditor",
      leadId,
    );
    await finishTask(ctx.sql, started.id, "completed", { audit, source });
    return { id: started.id, agent_type: "auditor", status: "completed", output: { audit, source } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audit failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "auditor", status: "failed", error: message };
  }
}

export async function runScore(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "scorer", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "scorer", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    const audits = await ctx.sql<Record<string, unknown>>`
      select * from lead_audits
      where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    if (!audits[0]) throw new Error("No audit to score");
    const { mapAudit } = await import("./map");
    const audit = mapAudit(audits[0]);
    const scored = await persistScore(ctx, leadId, ctx.profile, audit);
    const next = statusAfterAudit(scored.score, ctx.profile.min_lead_score);
    await setStatus(ctx.sql, ctx.workspace.id, leadId, next);
    const msg =
      scored.score >= ctx.profile.min_lead_score
        ? `Lead scored ${scored.score} — ${lead.business_name} (qualified)`
        : `Lead scored ${scored.score} — ${lead.business_name} (below threshold ${ctx.profile.min_lead_score}, rejected for outreach)`;
    await recordEvent(ctx.sql, ctx.workspace.id, msg, "scorer", leadId);
    await finishTask(ctx.sql, started.id, "completed", { ...scored });
    return { id: started.id, agent_type: "scorer", status: "completed", output: { ...scored } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scoring failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "scorer", status: "failed", error: message };
  }
}

export async function runOutreach(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "outreach", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "outreach", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    const scores = await ctx.sql<{ score: number }>`
      select score from lead_scores
      where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    const score = Number(scores[0]?.score ?? 0);
    if (!shouldPrepareOutreach(score, ctx.profile.min_lead_score)) {
      throw new Error(`Score ${score} is below the outreach threshold (${ctx.profile.min_lead_score})`);
    }
    const audits = await ctx.sql<Record<string, unknown>>`
      select * from lead_audits
      where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    if (!audits[0]) throw new Error("No verified audit");
    const { mapAudit } = await import("./map");
    const audit = mapAudit(audits[0]);
    const useAi = !ctx.profile.demo_mode && aiAvailable();
    const drafted = useAi
      ? await generateOutreach({
          businessName: lead.business_name,
          website: lead.website,
          city: lead.city,
          state: lead.state,
          audit,
          offer: ctx.profile.offer,
          price: ctx.profile.price,
          currency: ctx.profile.currency,
          tone: ctx.profile.outreach_tone,
          useAi: true,
        })
      : { ...(() => {
          const t = templateOutreach({
            businessName: lead.business_name,
            audit,
            offer: ctx.profile.offer,
            price: ctx.profile.price,
            currency: ctx.profile.currency,
          });
          if ("error" in t) throw new Error(t.error);
          return t;
        })(), source: "template" as const };

    if (useAi) {
      await addUsage(ctx.sql, ctx.workspace.id, 400, 300, estimateCostUsd(400, 300));
    }

    const id = crypto.randomUUID();
    await ctx.sql`
      insert into outreach_drafts (
        id, lead_id, workspace_id, email_draft, contact_form_draft, short_message,
        evidence_notes, approval_status, generated_at
      ) values (
        ${id}, ${leadId}, ${ctx.workspace.id}, ${drafted.email_draft}, ${drafted.contact_form_draft},
        ${drafted.short_message}, ${jsonParam(drafted.evidence_notes)}::jsonb, ${"pending"}, now()
      )
    `;
    await setStatus(ctx.sql, ctx.workspace.id, leadId, statusAfterDraft(score, ctx.profile.min_lead_score));
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      `Outreach draft generated for ${lead.business_name} — waiting for approval`,
      "outreach",
      leadId,
    );
    await finishTask(ctx.sql, started.id, "completed", { draftId: id, source: drafted.source });
    return { id: started.id, agent_type: "outreach", status: "completed", output: { draftId: id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Outreach failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "outreach", status: "failed", error: message };
  }
}

export async function runMasterForLead(ctx: Ctx, leadId: string): Promise<TaskResult[]> {
  const started = await beginTask(ctx, "master", { leadId, flow: "DISCOVER→AUDIT→SCORE→QUALIFY→OUTREACH" }, leadId);
  if (!started.ok) {
    return [{ id: started.id ?? "none", agent_type: "master", status: "failed", error: started.error }];
  }
  const results: TaskResult[] = [];
  try {
    const audit = await runAudit(ctx, leadId);
    results.push(audit);
    if (audit.status !== "completed") throw new Error(audit.error || "Audit failed");
    const score = await runScore(ctx, leadId);
    results.push(score);
    if (score.status !== "completed") throw new Error(score.error || "Score failed");
    const s = Number((score.output as { score?: number } | undefined)?.score ?? 0);
    if (shouldPrepareOutreach(s, ctx.profile.min_lead_score)) {
      results.push(await runOutreach(ctx, leadId));
    } else {
      await recordEvent(
        ctx.sql,
        ctx.workspace.id,
        `Master skipped outreach — score ${s} below threshold`,
        "master",
        leadId,
      );
    }
    await finishTask(ctx.sql, started.id, "completed", { steps: results.length });
    results.unshift({ id: started.id, agent_type: "master", status: "completed", output: { steps: results.length } });
    return results;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    results.unshift({ id: started.id, agent_type: "master", status: "failed", error: message });
    return results;
  }
}

export async function auditPendingLeads(ctx: Ctx): Promise<TaskResult[]> {
  const rows = await ctx.sql<{ id: string }>`
    select l.id from leads l
    where l.workspace_id = ${ctx.workspace.id}
      and l.status in ('NEW', 'RESEARCHING')
      and not exists (select 1 from lead_audits a where a.lead_id = l.id)
    limit 8
  `;
  const out: TaskResult[] = [];
  for (const r of rows) out.push(await runAudit(ctx, r.id));
  return out;
}

export async function scorePendingLeads(ctx: Ctx): Promise<TaskResult[]> {
  const rows = await ctx.sql<{ id: string }>`
    select l.id from leads l
    where l.workspace_id = ${ctx.workspace.id}
      and l.status in ('AUDITED', 'RESEARCHING')
      and exists (select 1 from lead_audits a where a.lead_id = l.id)
      and not exists (select 1 from lead_scores s where s.lead_id = l.id)
    limit 8
  `;
  const out: TaskResult[] = [];
  for (const r of rows) out.push(await runScore(ctx, r.id));
  return out;
}

export async function generatePendingDrafts(ctx: Ctx): Promise<TaskResult[]> {
  const rows = await ctx.sql<{ id: string }>`
    select l.id from leads l
    join lead_scores s on s.lead_id = l.id
    where l.workspace_id = ${ctx.workspace.id}
      and l.status in ('QUALIFIED', 'AUDITED')
      and s.score >= ${ctx.profile.min_lead_score}
      and not exists (
        select 1 from outreach_drafts d where d.lead_id = l.id
      )
    limit 8
  `;
  const out: TaskResult[] = [];
  for (const r of rows) out.push(await runOutreach(ctx, r.id));
  return out;
}
