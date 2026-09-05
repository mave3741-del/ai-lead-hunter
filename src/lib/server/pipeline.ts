import type { Sql } from "../db";
import type { AgentType, AuditResult, BusinessProfile, JsonValue, LeadStatus } from "../types";
import { SAMPLE_CLINICS, SCOUT_POOL } from "../agents/sample-clinics";
import { discoverLeads, fingerprint } from "../sources/registry";
import type { SourceCandidate } from "../sources/types";
import { detectOpportunities, offerPitch } from "../agents/opportunity";
import { reviewDraftBundle } from "../agents/compliance";
import { runWebsiteAudit } from "../agents/auditor";
import { researchBusiness } from "../agents/research";
import { generateOutreach, templateOutreach } from "../agents/outreach";
import { calculateScore, isDuplicateLead, nextFollowupSequence, shouldPrepareOutreach, statusAfterAudit, statusAfterDraft } from "../lead-rules";
import { aiAvailable, estimateCostUsd } from "../ai/client";
import { domainFromUrl, normalizeName } from "../utils";
import { addUsage, recordEvent, todayUsage, type Ctx } from "./workspace";
import { jsonParam, mapLead } from "./map";
import { parsePublicHttpUrl } from "../url-safety";
import { dailySpendReached } from "../rate-limit";

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
  if (leadId) {
    const dup = await ctx.sql<{ id: string }>`
      select id from agent_tasks
      where workspace_id = ${ctx.workspace.id}
        and lead_id = ${leadId}
        and agent_type = ${agent}
        and status = 'running'
      limit 1
    `;
    if (dup[0]) {
      return { ok: false, error: "Task already running", id: dup[0].id };
    }
  }
  const running = await runningCount(ctx.sql, ctx.workspace.id);
  if (running >= ctx.profile.max_concurrent_tasks) {
    return { ok: false, error: `Max concurrent tasks (${ctx.profile.max_concurrent_tasks}) reached` };
  }
  const usage = await todayUsage(ctx.sql, ctx.workspace.id);
  if (dailySpendReached(usage.cost, ctx.profile.max_daily_ai_spend, ctx.profile.demo_mode)) {
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
        completed_at = now(),
        duration_ms = (extract(epoch from (now() - started_at)) * 1000)::int
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

export async function runScout(
  ctx: Ctx,
  opts?: { city?: string; state?: string; limit?: number },
): Promise<TaskResult> {
  const started = await beginTask(ctx, "scout", {
    niche: ctx.profile.target_niche,
    demo: ctx.profile.demo_mode,
    city: opts?.city ?? null,
    state: opts?.state ?? null,
  });
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "scout", status: "failed", error: started.error };
  }
  try {
    const existing = await ctx.sql<{
      id: string;
      domain: string | null;
      business_name: string;
      city: string | null;
      state: string | null;
    }>`
      select id, domain, business_name, city, state from leads where workspace_id = ${ctx.workspace.id}
    `;
    const limit = Math.min(opts?.limit || ctx.profile.daily_lead_target || 20, 20);
    const disabled = await ctx.sql<{ source_key: string }>`
      select source_key from source_configs
      where workspace_id = ${ctx.workspace.id} and enabled = false
    `;

    const discovered = await discoverLeads({
      demoMode: ctx.profile.demo_mode,
      disabledKeys: disabled.map((d) => d.source_key),
      args: {
        niche: ctx.profile.target_niche,
        country: ctx.profile.target_country,
        city: opts?.city || undefined,
        state: opts?.state || undefined,
        limit,
      },
    });

    if (!discovered.ok) {
      await recordEvent(ctx.sql, ctx.workspace.id, discovered.error, "scout");
      for (const key of discovered.sources_used.length ? discovered.sources_used : []) {
        await touchSource(ctx, key, false, discovered.error);
      }
      await finishTask(ctx.sql, started.id, "completed", {
        added: 0,
        reason: discovered.error,
        used: discovered.used,
      });
      return {
        id: started.id,
        agent_type: "scout",
        status: "completed",
        output: { added: 0, reason: discovered.error, used: discovered.used },
      };
    }

    const campaign = await ctx.sql<{ id: string }>`
      select id from campaigns where workspace_id = ${ctx.workspace.id} limit 1
    `;
    const added: string[] = [];
    const addedIds: string[] = [];
    const isDemo = ctx.profile.demo_mode && discovered.used === "demo_pool";
    const category = ctx.profile.target_niche || "Dental clinics";

    async function attachSources(
      leadId: string,
      sources: string[],
      c: SourceCandidate,
    ) {
      for (const src of sources) {
        if (!src || src === "none") continue;
        const have = await ctx.sql<{ n: number }>`
          select count(*)::int as n from lead_sources
          where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id} and source_name = ${src}
        `;
        if (Number(have[0]?.n ?? 0) > 0) continue;
        await ctx.sql`
          insert into lead_sources (id, lead_id, workspace_id, source_name, source_url, external_id, payload)
          values (
            ${crypto.randomUUID()}, ${leadId}, ${ctx.workspace.id}, ${src},
            ${c.source_url ?? null}, ${c.external_id ?? null}, ${jsonParam({ city: c.city ?? null })}::jsonb
          )
        `;
      }
    }

    for (const c of discovered.candidates) {
      const fp = fingerprint(c);
      const sources = c.sources?.length ? c.sources : discovered.sources_used;
      const dup = existing.find((e) =>
        isDuplicateLead(
          { domain: fp.domain, business_name: c.business_name, city: c.city, state: c.state },
          [e],
        ),
      );
      if (dup) {
        await attachSources(dup.id, sources, c);
        continue;
      }
      const website = c.website ?? null;
      if (website && !website.includes(".example")) {
        const parsed = parsePublicHttpUrl(website);
        if (!parsed.ok) continue;
      }
      const id = crypto.randomUUID();
      const inserted = await ctx.sql<{ id: string }>`
        insert into leads (
          id, workspace_id, campaign_id, business_name, website, domain, category,
          city, state, country, public_phone, public_email, source_url, notes, tags, status, is_demo, source
        ) values (
          ${id}, ${ctx.workspace.id}, ${campaign[0]?.id ?? null}, ${c.business_name}, ${website},
          ${fp.domain}, ${c.category || category}, ${c.city ?? null}, ${c.state ?? null},
          ${c.country || ctx.profile.target_country}, ${c.public_phone ?? null},
          ${c.public_email ?? null}, ${c.source_url ?? website}, ${c.notes ?? null},
          ${jsonParam(sources)}::jsonb, ${"NEW"}, ${isDemo}, ${sources[0] || discovered.used}
        )
        on conflict do nothing
        returning id
      `;
      if (!inserted[0]) continue;
      await attachSources(inserted[0].id, sources, c);
      existing.push({
        id: inserted[0].id,
        domain: fp.domain,
        business_name: c.business_name,
        city: c.city ?? null,
        state: c.state ?? null,
      });
      added.push(c.business_name);
      addedIds.push(inserted[0].id);
      await recordEvent(
        ctx.sql,
        ctx.workspace.id,
        `Scout found a new lead: ${c.business_name} (${sources.join(", ")})`,
        "scout",
        id,
      );
      if (added.length >= Math.min(4, limit)) break;
    }

    for (const key of discovered.sources_used) {
      await touchSource(ctx, key, true);
    }

    for (const leadId of addedIds) {
      await runResearch(ctx, leadId);
    }

    await finishTask(ctx.sql, started.id, "completed", {
      added: added.length,
      names: added,
      used: discovered.used,
      sources_used: discovered.sources_used,
    });
    return {
      id: started.id,
      agent_type: "scout",
      status: "completed",
      output: { added: added.length, used: discovered.used },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scout failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "scout", status: "failed", error: message };
  }
}

async function touchSource(ctx: Ctx, key: string, ok: boolean, error?: string) {
  if (!key || key === "none") return;
  await ctx.sql`
    insert into source_configs (id, workspace_id, source_key, last_success_at, last_error, error_count, request_count)
    values (
      ${crypto.randomUUID()}, ${ctx.workspace.id}, ${key},
      ${ok ? new Date().toISOString() : null},
      ${ok ? null : error ?? "error"},
      ${ok ? 0 : 1},
      ${1}
    )
    on conflict (workspace_id, source_key) do update set
      last_success_at = coalesce(excluded.last_success_at, source_configs.last_success_at),
      last_error = excluded.last_error,
      error_count = case when ${ok} then 0 else source_configs.error_count + 1 end,
      request_count = source_configs.request_count + 1,
      updated_at = now()
  `;
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
      activity_signals, opportunities, observations, confidence, raw_json,
      website_status, appointment_flow, evidence
    ) values (
      ${id}, ${leadId}, ${ctx.workspace.id},
      ${audit.appointment_available}, ${audit.chatbot_present}, ${audit.faq_present},
      ${audit.lead_capture_present}, ${audit.after_hours_help}, ${audit.mobile_experience},
      ${audit.contact_flow_clear}, ${audit.activity_signals},
      ${jsonParam(audit.opportunities)}::jsonb, ${jsonParam(audit.observations)}::jsonb,
      ${audit.confidence}, ${jsonParam(audit)}::jsonb,
      ${audit.website_status ?? "unknown"}, ${audit.appointment_flow ?? "unknown"},
      ${jsonParam(audit.evidence ?? [])}::jsonb
    )
  `;
  return id;
}

export async function persistOpportunities(ctx: Ctx, leadId: string, profile: BusinessProfile, audit: AuditResult) {
  const hits = detectOpportunities(audit, profile.offer);
  const existing = await ctx.sql<{ n: number }>`
    select count(*)::int as n from opportunities
    where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id}
  `;
  if (Number(existing[0]?.n ?? 0) === 0) {
    for (const hit of hits) {
      await ctx.sql`
        insert into opportunities (id, lead_id, workspace_id, title, offer, evidence)
        values (
          ${crypto.randomUUID()}, ${leadId}, ${ctx.workspace.id}, ${hit.title}, ${hit.offer},
          ${jsonParam(hit.evidence)}::jsonb
        )
      `;
    }
  }
  return hits;
}

export async function persistScore(ctx: Ctx, leadId: string, profile: BusinessProfile, audit: AuditResult) {
  const scored = calculateScore(audit, profile.offer);
  const hits = await persistOpportunities(ctx, leadId, profile, audit);
  const pitch = offerPitch(hits[0] ?? null, profile.offer, profile.price, profile.currency);
  const id = crypto.randomUUID();
  await ctx.sql`
    insert into lead_scores (
      id, lead_id, workspace_id, score, priority, reasons, recommended_offer, estimated_value
    ) values (
      ${id}, ${leadId}, ${ctx.workspace.id}, ${scored.score}, ${scored.priority},
      ${jsonParam(scored.reasons)}::jsonb, ${scored.recommended_offer}, ${scored.estimated_value}
    )
  `;
  return { ...scored, recommended_offer: pitch || scored.recommended_offer };
}

export async function runResearch(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "research", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "research", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    await setStatus(ctx.sql, ctx.workspace.id, leadId, "RESEARCHING");
    const notes = researchBusiness({
      business_name: lead.business_name,
      website: lead.website,
      city: lead.city,
      state: lead.state,
      public_phone: lead.public_phone,
      public_email: lead.public_email,
      source_url: lead.source_url,
    });
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      `Research: ${notes.notes[0] ?? lead.business_name} (${notes.website_status})`,
      "research",
      leadId,
    );
    await finishTask(ctx.sql, started.id, "completed", { ...notes });
    return { id: started.id, agent_type: "research", status: "completed", output: { ...notes } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "research", status: "failed", error: message };
  }
}

export async function runOpportunity(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "opportunity", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "opportunity", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    const audits = await ctx.sql<Record<string, unknown>>`
      select * from lead_audits
      where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    if (!audits[0]) throw new Error("No audit to analyze");
    const { mapAudit } = await import("./map");
    const audit = mapAudit(audits[0]);
    const hits = await persistOpportunities(ctx, leadId, ctx.profile, audit);
    const pitch = offerPitch(hits[0] ?? null, ctx.profile.offer, ctx.profile.price, ctx.profile.currency);
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      hits[0] ? `Opportunity: ${hits[0].title}` : `No verified gap mapped for ${lead.business_name}`,
      "opportunity",
      leadId,
    );
    await finishTask(ctx.sql, started.id, "completed", { hits, pitch });
    return { id: started.id, agent_type: "opportunity", status: "completed", output: { hits, pitch } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Opportunity failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "opportunity", status: "failed", error: message };
  }
}

export async function runOffer(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "offer", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "offer", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    const audits = await ctx.sql<Record<string, unknown>>`
      select * from lead_audits
      where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    if (!audits[0]) throw new Error("No audit for offer");
    const { mapAudit } = await import("./map");
    const audit = mapAudit(audits[0]);
    const hits = await persistOpportunities(ctx, leadId, ctx.profile, audit);
    const pitch = offerPitch(hits[0] ?? null, ctx.profile.offer, ctx.profile.price, ctx.profile.currency);
    if (!hits[0]) {
      await recordEvent(ctx.sql, ctx.workspace.id, `Offer skipped — no verified gap for ${lead.business_name}`, "offer", leadId);
      await finishTask(ctx.sql, started.id, "completed", { pitch: null, reason: "no_verified_gap" });
      return { id: started.id, agent_type: "offer", status: "completed", output: { pitch: null } };
    }
    await recordEvent(ctx.sql, ctx.workspace.id, `Offer: ${hits[0].title} → ${ctx.profile.offer}`, "offer", leadId);
    await finishTask(ctx.sql, started.id, "completed", { pitch, title: hits[0].title });
    return { id: started.id, agent_type: "offer", status: "completed", output: { pitch, title: hits[0].title } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Offer failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "offer", status: "failed", error: message };
  }
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

    const compliance = reviewDraftBundle({
      email_draft: drafted.email_draft,
      contact_form_draft: drafted.contact_form_draft,
      short_message: drafted.short_message,
    });
    const id = crypto.randomUUID();
    const approval = compliance.verdict === "REJECTED" ? "rejected" : "pending";
    await ctx.sql`
      insert into outreach_drafts (
        id, lead_id, workspace_id, email_draft, contact_form_draft, short_message,
        evidence_notes, approval_status, generated_at, draft_kind, compliance_status, sequence
      ) values (
        ${id}, ${leadId}, ${ctx.workspace.id}, ${drafted.email_draft}, ${drafted.contact_form_draft},
        ${drafted.short_message}, ${jsonParam(drafted.evidence_notes)}::jsonb, ${approval}, now(),
        ${"outreach"}, ${compliance.verdict}, ${0}
      )
    `;
    if (compliance.verdict === "REJECTED") {
      await recordEvent(
        ctx.sql,
        ctx.workspace.id,
        `Compliance rejected draft for ${lead.business_name}: ${compliance.reasons[0] ?? "policy"}`,
        "compliance",
        leadId,
      );
      await setStatus(ctx.sql, ctx.workspace.id, leadId, "AUDITED");
    } else {
      await setStatus(ctx.sql, ctx.workspace.id, leadId, statusAfterDraft(score, ctx.profile.min_lead_score));
      await recordEvent(
        ctx.sql,
        ctx.workspace.id,
        `Outreach draft generated for ${lead.business_name} — waiting for approval (${compliance.verdict})`,
        "outreach",
        leadId,
      );
    }
    await finishTask(ctx.sql, started.id, "completed", {
      draftId: id,
      source: drafted.source,
      compliance: compliance.verdict,
    });
    return { id: started.id, agent_type: "outreach", status: "completed", output: { draftId: id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Outreach failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "outreach", status: "failed", error: message };
  }
}

export async function runMasterForLead(ctx: Ctx, leadId: string): Promise<TaskResult[]> {
  const started = await beginTask(ctx, "master", { leadId, flow: "RESEARCH→AUDIT→OPPORTUNITY→SCORE→OFFER→OUTREACH" }, leadId);
  if (!started.ok) {
    return [{ id: started.id ?? "none", agent_type: "master", status: "failed", error: started.error }];
  }
  const results: TaskResult[] = [];
  try {
    results.push(await runResearch(ctx, leadId));
    const audit = await runAudit(ctx, leadId);
    results.push(audit);
    if (audit.status !== "completed") throw new Error(audit.error || "Audit failed");
    results.push(await runOpportunity(ctx, leadId));
    const score = await runScore(ctx, leadId);
    results.push(score);
    if (score.status !== "completed") throw new Error(score.error || "Score failed");
    const s = Number((score.output as { score?: number } | undefined)?.score ?? 0);
    if (shouldPrepareOutreach(s, ctx.profile.min_lead_score)) {
      results.push(await runOffer(ctx, leadId));
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

export async function researchPendingLeads(ctx: Ctx): Promise<TaskResult[]> {
  const rows = await ctx.sql<{ id: string }>`
    select l.id from leads l
    where l.workspace_id = ${ctx.workspace.id}
      and l.status = 'NEW'
    limit 8
  `;
  const out: TaskResult[] = [];
  for (const r of rows) out.push(await runResearch(ctx, r.id));
  return out;
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

export async function runFollowup(ctx: Ctx, leadId: string): Promise<TaskResult> {
  const started = await beginTask(ctx, "followup", { leadId }, leadId);
  if (!started.ok) {
    return { id: started.id ?? "none", agent_type: "followup", status: "failed", error: started.error };
  }
  try {
    const lead = await loadLead(ctx.sql, ctx.workspace.id, leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.status !== "CONTACTED" && lead.status !== "FOLLOW_UP_1") {
      throw new Error("Follow-up drafts only after a human has marked the lead contacted");
    }
    const existing = await ctx.sql<{ n: number }>`
      select count(*)::int as n from outreach_drafts
      where lead_id = ${leadId} and workspace_id = ${ctx.workspace.id} and draft_kind = 'followup'
    `;
    const seq = nextFollowupSequence(Number(existing[0]?.n ?? 0));
    const email = `Hi ${lead.business_name} team,\n\nJust checking whether a short walkthrough of an appointment assistant would still be useful. Happy to keep this brief.\n\nBest`;
    const short = `Hi — following up on the appointment assistant note. Happy to show a 2-minute demo if useful.`;
    const compliance = reviewDraftBundle({
      email_draft: email,
      contact_form_draft: email,
      short_message: short,
    });
    if (compliance.verdict === "REJECTED") throw new Error(compliance.reasons[0] || "Compliance rejected follow-up");
    const id = crypto.randomUUID();
    await ctx.sql`
      insert into outreach_drafts (
        id, lead_id, workspace_id, email_draft, contact_form_draft, short_message,
        evidence_notes, approval_status, generated_at, draft_kind, compliance_status, sequence
      ) values (
        ${id}, ${leadId}, ${ctx.workspace.id}, ${email}, ${email}, ${short},
        ${jsonParam(["Follow-up. Still requires human approval."])}::jsonb, ${"pending"}, now(),
        ${"followup"}, ${compliance.verdict}, ${seq}
      )
    `;
    await ctx.sql`
      insert into followups (id, lead_id, workspace_id, sequence, email_draft, short_message, approval_status)
      values (${id}, ${leadId}, ${ctx.workspace.id}, ${seq}, ${email}, ${short}, ${"pending"})
    `;
    await setStatus(ctx.sql, ctx.workspace.id, leadId, seq === 1 ? "FOLLOW_UP_1" : "FOLLOW_UP_2");
    await recordEvent(ctx.sql, ctx.workspace.id, `Follow-up ${seq} drafted — waiting for approval`, "followup", leadId);
    await finishTask(ctx.sql, started.id, "completed", { draftId: id, sequence: seq });
    return { id: started.id, agent_type: "followup", status: "completed", output: { draftId: id, sequence: seq } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Follow-up failed";
    await finishTask(ctx.sql, started.id, "failed", undefined, message);
    return { id: started.id, agent_type: "followup", status: "failed", error: message };
  }
}

