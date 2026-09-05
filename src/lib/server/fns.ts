import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getCtx, recordEvent, seedDemoLeads, todayUsage } from "./workspace";
import { mapAudit, mapEvent, mapLead, mapTask, jsonParam } from "./map";
import {
  generatePendingDrafts,
  runAudit,
  runMasterForLead,
  runOutreach,
  runScore,
  runScout,
  scorePendingLeads,
  auditPendingLeads,
  researchPendingLeads,
  runFollowup,
} from "./pipeline";
import {
  assertCanSend,
  assertTransition,
  canSendOutreach,
  conversionRate,
  averageDeal,
  isLeadStatus,
} from "../lead-rules";
import type { ApprovalStatus, DashboardMetrics, Lead, LeadFilters, LeadStatus } from "../types";
import { AGENT_TYPES } from "../types";
import { domainFromUrl, num, asStringArray } from "../utils";
import { isDuplicateLead } from "../lead-rules";
import { parseLeadCsv } from "../sources/csv";
import { listSourceHealth } from "../sources/registry";
import { parsePublicHttpUrl } from "../url-safety";
import { limitAgentRun, dailySpendReached } from "../rate-limit";
import { aiAvailable } from "../ai/client";
import { ruleBasedAssistant, DEFAULT_CLINIC, ASSISTANT_SYSTEM } from "../demo-assistant";
import { chatCompletion } from "../ai/client";
import { ASSISTANT_MAX_TOKENS } from "../ai/retry";

const LEAD_LIST_SQL = `
  select l.*,
    s.score,
    s.priority,
    s.reasons,
    d.approval_status
  from leads l
  left join lateral (
    select score, priority, reasons from lead_scores
    where lead_id = l.id order by created_at desc limit 1
  ) s on true
  left join lateral (
    select approval_status from outreach_drafts
    where lead_id = l.id order by created_at desc limit 1
  ) d on true
`;

function leadFromJoin(row: Record<string, unknown>) {
  const reasons = asStringArray(row.reasons);
  const mapped = mapLead(row);
  mapped.problem = reasons[0] ?? mapped.problem;
  return mapped;
}

export const bootstrapWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const usage = await todayUsage(ctx.sql, ctx.workspace.id);
    return {
      workspace: ctx.workspace,
      profile: ctx.profile,
      usage,
      aiConfigured: aiAvailable(),
    };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const ws = ctx.workspace.id;
    const rows = await ctx.sql<Record<string, unknown>>`
      select
        (select count(*)::int from leads where workspace_id = ${ws}) as total_leads,
        (select count(*)::int from leads where workspace_id = ${ws} and status = 'NEW') as new_leads,
        (select count(*)::int from leads where workspace_id = ${ws} and status in ('QUALIFIED','DRAFT_READY','APPROVED')) as qualified_leads,
        (select count(*)::int from leads l
           join lateral (select score, priority from lead_scores where lead_id = l.id order by created_at desc limit 1) s on true
           where l.workspace_id = ${ws} and s.priority in ('high','very_high')) as high_priority_leads,
        (select count(*)::int from leads where workspace_id = ${ws} and status in ('CONTACTED','REPLIED','INTERESTED','DEMO','WON')) as contacted,
        (select count(*)::int from leads where workspace_id = ${ws} and status in ('INTERESTED','DEMO','WON')) as interested,
        (select count(*)::int from leads where workspace_id = ${ws} and status = 'WON') as won,
        (select count(*)::int from leads where workspace_id = ${ws} and status = 'DRAFT_READY') as drafts_ready,
        (select count(*)::int from leads where workspace_id = ${ws} and status = 'APPROVED') as approved,
        (select count(*)::int from leads where workspace_id = ${ws} and created_at >= current_date) as today_prospects,
        (select count(*)::int from leads where workspace_id = ${ws} and status in ('REPLIED','INTERESTED','DEMO','NEGOTIATION','WON')) as replied,
        (select count(*)::int from leads where workspace_id = ${ws} and status in ('DEMO','NEGOTIATION','WON')) as demos,
        (select coalesce(sum(revenue),0) from revenue_records where workspace_id = ${ws}) as revenue,
        (select count(*)::int from revenue_records where workspace_id = ${ws}) as customers,
        (select count(*)::int from agent_tasks where workspace_id = ${ws} and status = 'completed') as tasks_completed,
        (select count(*)::int from agent_tasks where workspace_id = ${ws} and status = 'failed') as tasks_failed
    `;
    const r = rows[0] ?? {};
    const won = num(r.won);
    const contacted = num(r.contacted);
    const customers = num(r.customers);
    const revenue = num(r.revenue);
    const usage = await todayUsage(ctx.sql, ws);
    const metrics: DashboardMetrics = {
      total_leads: num(r.total_leads),
      new_leads: num(r.new_leads),
      qualified_leads: num(r.qualified_leads),
      high_priority_leads: num(r.high_priority_leads),
      contacted,
      interested: num(r.interested),
      won,
      revenue,
      conversion_rate: conversionRate(won, contacted),
      customers,
      average_deal: averageDeal(revenue, customers),
      drafts_ready: num(r.drafts_ready),
      replied: num(r.replied),
      demos: num(r.demos),
      estimated_profit: Math.round((revenue - usage.cost) * 100) / 100,
      today_prospects: num(r.today_prospects),
      approved: num(r.approved),
      ai_calls_today: usage.calls,
      ai_cost_today: usage.cost,
      tasks_completed: num(r.tasks_completed),
      tasks_failed: num(r.tasks_failed),
    };

    const byStatus = await ctx.sql<{ status: string; n: number }>`
      select status, count(*)::int as n from leads
      where workspace_id = ${ws} group by status
    `;
    const order = [
      "NEW","RESEARCHING","AUDITED","QUALIFIED","DRAFT_READY","APPROVED",
      "CONTACTED","FOLLOW_UP_1","FOLLOW_UP_2","REPLIED","INTERESTED","DEMO","NEGOTIATION","WON","LOST","DO_NOT_CONTACT",
    ];
    const orderedStatus = order
      .map((status) => ({ status, n: num(byStatus.find((s) => s.status === status)?.n) }))
      .filter((s) => s.n > 0);
    const recent = await ctx.sql.query<Record<string, unknown>>(
      `${LEAD_LIST_SQL} where l.workspace_id = $1 order by l.updated_at desc limit 6`,
      [ws],
    );

    const events = await ctx.sql<Record<string, unknown>>`
      select * from agent_events where workspace_id = ${ws}
      order by created_at desc limit 8
    `;

    const bySource = await ctx.sql<{ source: string; n: number }>`
      select source, count(*)::int as n from leads
      where workspace_id = ${ws} group by source order by n desc
    `;
    const scoreRows = await ctx.sql<{ bucket: string; n: number }>`
      select
        case
          when coalesce(s.score, 0) < 50 then '0-49'
          when s.score < 75 then '50-74'
          when s.score < 90 then '75-89'
          else '90-100'
        end as bucket,
        count(*)::int as n
      from leads l
      left join lateral (
        select score from lead_scores where lead_id = l.id order by created_at desc limit 1
      ) s on true
      where l.workspace_id = ${ws}
      group by 1
    `;
    const scoreOrder = ["0-49", "50-74", "75-89", "90-100"];
    const scoreBuckets = scoreOrder.map((bucket) => ({
      bucket,
      n: num(scoreRows.find((s) => s.bucket === bucket)?.n),
    }));

    return {
      metrics,
      byStatus: orderedStatus,
      bySource: bySource.map((s) => ({ source: s.source, n: num(s.n) })),
      scoreBuckets,
      recent: recent.map(leadFromJoin),
      events: events.map(mapEvent),
      profile: ctx.profile,
      spendCapped: dailySpendReached(usage.cost, ctx.profile.max_daily_ai_spend, ctx.profile.demo_mode),
    };
  });

export const listLeads = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: LeadFilters) => input)
  .handler(async ({ context, data: filters }) => {
    const ctx = await getCtx(context.userId);
    const ws = ctx.workspace.id;
    const clauses: string[] = ["l.workspace_id = $1"];
    const params: unknown[] = [ws];
    let i = 2;
    if (filters.q && filters.q.trim()) {
      clauses.push(
        `(l.business_name ilike $${i} or coalesce(l.domain,'') ilike $${i} or coalesce(l.city,'') ilike $${i})`,
      );
      params.push(`%${filters.q.trim()}%`);
      i += 1;
    }
    if (filters.status) {
      clauses.push(`l.status = $${i}`);
      params.push(filters.status);
      i += 1;
    }
    if (filters.priority) {
      clauses.push(`s.priority = $${i}`);
      params.push(filters.priority);
      i += 1;
    }
    if (filters.city) {
      clauses.push(`l.city ilike $${i}`);
      params.push(filters.city);
      i += 1;
    }
    if (filters.state) {
      clauses.push(`l.state = $${i}`);
      params.push(filters.state);
      i += 1;
    }
    if (filters.category) {
      clauses.push(`l.category ilike $${i}`);
      params.push(`%${filters.category}%`);
      i += 1;
    }
    if (filters.minScore !== "" && filters.minScore != null) {
      clauses.push(`coalesce(s.score,0) >= $${i}`);
      params.push(Number(filters.minScore));
      i += 1;
    }
    if (filters.maxScore !== "" && filters.maxScore != null) {
      clauses.push(`coalesce(s.score,0) <= $${i}`);
      params.push(Number(filters.maxScore));
      i += 1;
    }
    if (filters.from) {
      clauses.push(`l.created_at >= $${i}::timestamptz`);
      params.push(filters.from);
      i += 1;
    }
    if (filters.to) {
      clauses.push(`l.created_at <= $${i}::timestamptz`);
      params.push(filters.to);
      i += 1;
    }
    const sqlText = `${LEAD_LIST_SQL} where ${clauses.join(" and ")} order by coalesce(s.score,0) desc, l.created_at desc limit 200`;
    const rows = await ctx.sql.query<Record<string, unknown>>(sqlText, params);
    return rows.map(leadFromJoin);
  });

export const getLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const ctx = await getCtx(context.userId);
    const rows = await ctx.sql.query<Record<string, unknown>>(
      `${LEAD_LIST_SQL} where l.workspace_id = $1 and l.id = $2 limit 1`,
      [ctx.workspace.id, id],
    );
    if (!rows[0]) throw new Error("Lead not found");
    const lead = leadFromJoin(rows[0]);
    const audits = await ctx.sql<Record<string, unknown>>`
      select * from lead_audits where lead_id = ${id} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    const scores = await ctx.sql<Record<string, unknown>>`
      select * from lead_scores where lead_id = ${id} and workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 1
    `;
    const drafts = await ctx.sql<Record<string, unknown>>`
      select * from outreach_drafts where lead_id = ${id} and workspace_id = ${ctx.workspace.id}
      order by created_at desc
    `;
    const rev = await ctx.sql<Record<string, unknown>>`
      select * from revenue_records where lead_id = ${id} and workspace_id = ${ctx.workspace.id} limit 1
    `;
    const scoreRow = scores[0];
    return {
      ...lead,
      audit: audits[0] ? mapAudit(audits[0]) : null,
      score_record: scoreRow
        ? {
            id: String(scoreRow.id),
            score: num(scoreRow.score),
            priority: String(scoreRow.priority) as Lead["priority"],
            reasons: asStringArray(scoreRow.reasons),
            recommended_offer: String(scoreRow.recommended_offer ?? ctx.profile.offer),
            estimated_value: String(scoreRow.estimated_value ?? "medium") as "low" | "medium" | "high",
            created_at: String(scoreRow.created_at),
          }
        : null,
      drafts: drafts.map((d) => ({
        id: String(d.id),
        email_draft: String(d.email_draft),
        contact_form_draft: String(d.contact_form_draft),
        short_message: String(d.short_message),
        evidence_notes: asStringArray(d.evidence_notes),
        approval_status: String(d.approval_status) as ApprovalStatus,
        generated_at: String(d.generated_at),
        approved_at: d.approved_at ? String(d.approved_at) : null,
        draft_kind: String(d.draft_kind ?? "outreach"),
        compliance_status: String(d.compliance_status ?? "SAFE"),
        sequence: num(d.sequence),
      })),
      revenue: rev[0]
        ? {
            id: String(rev[0].id),
            revenue: num(rev[0].revenue),
            offer: String(rev[0].offer),
            won_at: String(rev[0].won_at),
          }
        : null,
      opportunities: (
        await ctx.sql<Record<string, unknown>>`
          select * from opportunities where lead_id = ${id} and workspace_id = ${ctx.workspace.id}
          order by created_at desc
        `
      ).map((o) => ({
        id: String(o.id),
        title: String(o.title),
        offer: String(o.offer),
        evidence: asStringArray(o.evidence),
      })),
      sources: (
        await ctx.sql<Record<string, unknown>>`
          select * from lead_sources where lead_id = ${id} and workspace_id = ${ctx.workspace.id}
          order by discovered_at desc
        `
      ).map((s) => ({
        id: String(s.id),
        source_name: String(s.source_name),
        source_url: s.source_url ? String(s.source_url) : null,
        discovered_at: String(s.discovered_at),
      })),
      events: (
        await ctx.sql<Record<string, unknown>>`
          select * from agent_events
          where lead_id = ${id} and workspace_id = ${ctx.workspace.id}
          order by created_at desc limit 20
        `
      ).map(mapEvent),
    };
  });

export const createLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    business_name: string;
    website?: string;
    city?: string;
    state?: string;
    public_phone?: string;
    public_email?: string;
    notes?: string;
    category?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    const name = data.business_name.trim();
    if (!name) throw new Error("Business name is required");
    let website = data.website?.trim() || null;
    if (website) {
      const check = parsePublicHttpUrl(website);
      if (!check.ok) throw new Error(check.error);
      website = check.url.toString();
    }
    const domain = domainFromUrl(website);
    const existing = await ctx.sql<{ domain: string | null; business_name: string }>`
      select domain, business_name from leads where workspace_id = ${ctx.workspace.id}
    `;
    if (isDuplicateLead({ domain, business_name: name }, existing)) {
      throw new Error("Duplicate lead — same domain or business name already exists");
    }
    const id = crypto.randomUUID();
    await ctx.sql`
      insert into leads (
        id, workspace_id, business_name, website, domain, category, city, state,
        country, public_phone, public_email, source_url, notes, tags, status, is_demo, source
      ) values (
        ${id}, ${ctx.workspace.id}, ${name}, ${website}, ${domain},
        ${data.category?.trim() || "Dental clinic"}, ${data.city?.trim() || null},
        ${data.state?.trim() || null}, ${ctx.profile.target_country},
        ${data.public_phone?.trim() || null}, ${data.public_email?.trim() || null},
        ${website}, ${data.notes?.trim() || null}, ${jsonParam(["manual"])}::jsonb, ${"NEW"}, ${false}, ${"manual"}
      )
    `;
    await recordEvent(ctx.sql, ctx.workspace.id, `Manual lead added: ${name}`, "scout", id);
    await ctx.sql`
      insert into lead_sources (id, lead_id, workspace_id, source_name, source_url)
      values (${crypto.randomUUID()}, ${id}, ${ctx.workspace.id}, ${"manual"}, ${website})
    `;
    return { id };
  });

export const updateLeadNotes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; notes: string; tags?: string[] }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    await ctx.sql`
      update leads set notes = ${data.notes}, tags = ${jsonParam(data.tags ?? [])}::jsonb, updated_at = now()
      where id = ${data.id} and workspace_id = ${ctx.workspace.id}
    `;
    return { ok: true };
  });

export const changeLeadStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: LeadStatus }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    if (!isLeadStatus(data.status)) throw new Error("Invalid status");
    const rows = await ctx.sql<{ status: string }>`
      select status from leads where id = ${data.id} and workspace_id = ${ctx.workspace.id} limit 1
    `;
    if (!rows[0]) throw new Error("Lead not found");
    assertTransition(rows[0].status as LeadStatus, data.status);
    if (data.status === "CONTACTED") {
      const drafts = await ctx.sql<{ approval_status: string }>`
        select approval_status from outreach_drafts
        where lead_id = ${data.id} and workspace_id = ${ctx.workspace.id}
        order by created_at desc limit 1
      `;
      assertCanSend((drafts[0]?.approval_status as ApprovalStatus) ?? null);
      await ctx.sql`
        update leads set status = ${data.status}, contacted_at = now(), updated_at = now()
        where id = ${data.id} and workspace_id = ${ctx.workspace.id}
      `;
    } else {
      await ctx.sql`
        update leads set status = ${data.status}, updated_at = now()
        where id = ${data.id} and workspace_id = ${ctx.workspace.id}
      `;
    }
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      `Lead moved to ${data.status}`,
      "manager",
      data.id,
    );
    return { ok: true };
  });

export const saveLeadResponse = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; response: string }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    await ctx.sql`
      update leads set response = ${data.response}, status = ${"REPLIED"}, last_response_at = now(), updated_at = now()
      where id = ${data.id} and workspace_id = ${ctx.workspace.id}
        and status in ('CONTACTED','FOLLOW_UP_1','FOLLOW_UP_2','REPLIED','INTERESTED','DEMO','NEGOTIATION')
    `;
    await recordEvent(ctx.sql, ctx.workspace.id, "Response recorded", "manager", data.id);
    return { ok: true };
  });

export const markWon = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    const rows = await ctx.sql<{ status: string; business_name: string }>`
      select status, business_name from leads where id = ${data.id} and workspace_id = ${ctx.workspace.id} limit 1
    `;
    if (!rows[0]) throw new Error("Lead not found");
    assertTransition(rows[0].status as LeadStatus, "WON");
    await ctx.sql`
      update leads set status = ${"WON"}, updated_at = now()
      where id = ${data.id} and workspace_id = ${ctx.workspace.id}
    `;
    await ctx.sql`
      insert into revenue_records (id, workspace_id, lead_id, offer, price, currency, payment_status, revenue)
      values (
        ${crypto.randomUUID()}, ${ctx.workspace.id}, ${data.id}, ${ctx.profile.offer},
        ${ctx.profile.price}, ${ctx.profile.currency}, ${"won"}, ${ctx.profile.price}
      )
      on conflict (lead_id) do nothing
    `;
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      `${rows[0].business_name} marked won — ${ctx.profile.currency} ${ctx.profile.price}`,
      "manager",
      data.id,
    );
    return { ok: true };
  });

export const decideDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    draftId: string;
    leadId: string;
    action: "approve" | "reject" | "edit";
    email_draft?: string;
    contact_form_draft?: string;
    short_message?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    const drafts = await ctx.sql<{ id: string }>`
      select id from outreach_drafts
      where id = ${data.draftId} and lead_id = ${data.leadId} and workspace_id = ${ctx.workspace.id}
      limit 1
    `;
    if (!drafts[0]) throw new Error("Draft not found");
    if (data.action === "approve") {
      await ctx.sql`
        update outreach_drafts
        set approval_status = ${"approved"}, approved_at = now(), approved_by = ${context.userId}, updated_at = now()
        where id = ${data.draftId} and workspace_id = ${ctx.workspace.id}
      `;
      await ctx.sql`
        update leads set status = ${"APPROVED"}, updated_at = now()
        where id = ${data.leadId} and workspace_id = ${ctx.workspace.id}
          and status in ('DRAFT_READY','QUALIFIED','APPROVED')
      `;
      await recordEvent(ctx.sql, ctx.workspace.id, "Outreach approved by a human", "manager", data.leadId);
      await ctx.sql`
        update followups
        set approval_status = ${"approved"}, approved_at = now()
        where id = ${data.draftId} and workspace_id = ${ctx.workspace.id}
      `;
    } else if (data.action === "reject") {
      await ctx.sql`
        update outreach_drafts
        set approval_status = ${"rejected"}, updated_at = now()
        where id = ${data.draftId} and workspace_id = ${ctx.workspace.id}
      `;
      await ctx.sql`
        update leads set status = ${"DO_NOT_CONTACT"}, updated_at = now()
        where id = ${data.leadId} and workspace_id = ${ctx.workspace.id}
      `;
      await recordEvent(ctx.sql, ctx.workspace.id, "Outreach rejected — do not contact", "manager", data.leadId);
      await ctx.sql`
        update followups
        set approval_status = ${"rejected"}
        where id = ${data.draftId} and workspace_id = ${ctx.workspace.id}
      `;
    } else {
      if (!data.email_draft || !data.short_message) throw new Error("Edited copy is required");
      await ctx.sql`
        update outreach_drafts
        set email_draft = ${data.email_draft},
            contact_form_draft = ${data.contact_form_draft ?? data.email_draft},
            short_message = ${data.short_message},
            approval_status = ${"edited"},
            updated_at = now()
        where id = ${data.draftId} and workspace_id = ${ctx.workspace.id}
      `;
      await recordEvent(ctx.sql, ctx.workspace.id, "Outreach draft edited — still needs approval", "manager", data.leadId);
    }
    return { ok: true };
  });

export const markContacted = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { leadId: string; draftId: string }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    const drafts = await ctx.sql<{ approval_status: string }>`
      select approval_status from outreach_drafts
      where id = ${data.draftId} and lead_id = ${data.leadId} and workspace_id = ${ctx.workspace.id}
      limit 1
    `;
    if (!drafts[0]) throw new Error("Draft not found");
    if (!canSendOutreach(drafts[0].approval_status as ApprovalStatus)) {
      throw new Error("Outreach cannot be sent without human approval");
    }
    await ctx.sql`
      update leads set status = ${"CONTACTED"}, contacted_at = now(), updated_at = now()
      where id = ${data.leadId} and workspace_id = ${ctx.workspace.id}
    `;
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      "Marked contacted after approved copy was used manually",
      "manager",
      data.leadId,
    );
    return { ok: true };
  });

function guardAgent(workspaceId: string) {
  const lim = limitAgentRun(workspaceId);
  if (!lim.ok) throw new Error("Too many agent runs — wait a few minutes");
}

export const startScout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { city?: string; state?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return runScout(ctx, {
      city: data.city?.trim() || undefined,
      state: data.state?.trim() || undefined,
      limit: data.limit,
    });
  });

export const runResearchPending = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return researchPendingLeads(ctx);
  });

export const auditLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((leadId: string) => leadId)
  .handler(async ({ context, data: leadId }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return runAudit(ctx, leadId);
  });

export const scoreLeadFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((leadId: string) => leadId)
  .handler(async ({ context, data: leadId }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return runScore(ctx, leadId);
  });

export const draftLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((leadId: string) => leadId)
  .handler(async ({ context, data: leadId }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return runOutreach(ctx, leadId);
  });

export const runPipeline = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((leadId: string) => leadId)
  .handler(async ({ context, data: leadId }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return runMasterForLead(ctx, leadId);
  });

export const runAuditPending = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return auditPendingLeads(ctx);
  });

export const runScorePending = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return scorePendingLeads(ctx);
  });

export const runGenerateDrafts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return generatePendingDrafts(ctx);
  });

export const setAgentsPaused = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((paused: boolean) => paused)
  .handler(async ({ context, data: paused }) => {
    const ctx = await getCtx(context.userId);
    await ctx.sql`
      update business_profiles set agents_paused = ${paused}, updated_at = now()
      where workspace_id = ${ctx.workspace.id}
    `;
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      paused ? "All agents paused" : "Agents resumed",
      "master",
    );
    return { ok: true, paused };
  });

export const getAgents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const stats = await ctx.sql<Record<string, unknown>>`
      select agent_type,
        max(completed_at) as last_run,
        count(*) filter (where status = 'completed')::int as completed,
        count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status = 'running')::int as running,
        avg(extract(epoch from (completed_at - started_at)) * 1000)
          filter (where completed_at is not null and started_at is not null) as avg_ms
      from agent_tasks
      where workspace_id = ${ctx.workspace.id}
      group by agent_type
    `;
    const byType = new Map(stats.map((s) => [String(s.agent_type), s]));
    const agents = AGENT_TYPES.map((t) => {
      const s = byType.get(t);
      return {
        agent_type: t,
        last_run: s?.last_run ? String(s.last_run) : null,
        completed: num(s?.completed),
        failed: num(s?.failed),
        running: num(s?.running),
        avg_ms: s?.avg_ms == null ? null : Math.round(num(s.avg_ms)),
      };
    });
    const events = await ctx.sql<Record<string, unknown>>`
      select * from agent_events where workspace_id = ${ctx.workspace.id}
      order by created_at desc limit 40
    `;
    const usage = await todayUsage(ctx.sql, ctx.workspace.id);
    const tasksToday = await ctx.sql<{ completed: number; failed: number }>`
      select
        count(*) filter (where status = 'completed')::int as completed,
        count(*) filter (where status = 'failed')::int as failed
      from agent_tasks
      where workspace_id = ${ctx.workspace.id} and created_at >= current_date
    `;
    return {
      agents,
      events: events.map(mapEvent),
      paused: ctx.profile.agents_paused,
      profile: ctx.profile,
      usage,
      tasksToday: {
        completed: num(tasksToday[0]?.completed),
        failed: num(tasksToday[0]?.failed),
      },
      aiConfigured: aiAvailable(),
    };
  });

export const listTasks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const rows = await ctx.sql<Record<string, unknown>>`
      select * from agent_tasks
      where workspace_id = ${ctx.workspace.id}
      order by created_at desc
      limit 100
    `;
    return rows.map(mapTask);
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    business_name: string;
    offer: string;
    price: number;
    currency: string;
    target_niche: string;
    target_country: string;
    min_lead_score: number;
    outreach_tone: string;
    demo_url?: string;
    contact_email?: string;
    max_concurrent_tasks: number;
    max_daily_ai_spend: number;
    demo_mode: boolean;
    daily_lead_target?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    const price = Math.max(0, Number(data.price) || 0);
    const min = Math.min(100, Math.max(0, Number(data.min_lead_score) || 0));
    const conc = Math.min(20, Math.max(1, Number(data.max_concurrent_tasks) || 5));
    const spend = Math.max(0, Number(data.max_daily_ai_spend) || 0);
    const daily = Math.min(50, Math.max(1, Number(data.daily_lead_target) || 20));
    await ctx.sql`
      update business_profiles set
        business_name = ${data.business_name.trim() || "Lead Hunter Studio"},
        offer = ${data.offer.trim() || "AI Appointment Assistant"},
        price = ${price},
        currency = ${data.currency.trim() || "USD"},
        target_niche = ${data.target_niche.trim() || "Dental clinics"},
        target_country = ${data.target_country.trim() || "United States"},
        min_lead_score = ${min},
        outreach_tone = ${data.outreach_tone.trim() || "professional"},
        demo_url = ${data.demo_url?.trim() || null},
        contact_email = ${data.contact_email?.trim() || null},
        max_concurrent_tasks = ${conc},
        max_daily_ai_spend = ${spend},
        demo_mode = ${Boolean(data.demo_mode)},
        daily_lead_target = ${daily},
        updated_at = now()
      where workspace_id = ${ctx.workspace.id}
    `;
    return { ok: true };
  });

export const resetDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const ws = ctx.workspace.id;
    await ctx.sql`delete from leads where workspace_id = ${ws}`;
    await ctx.sql`delete from agent_tasks where workspace_id = ${ws}`;
    await ctx.sql`delete from agent_events where workspace_id = ${ws}`;
    await ctx.sql`delete from ai_usage where workspace_id = ${ws}`;
    await seedDemoLeads(ctx.sql, ws, ctx.profile);
    return { ok: true };
  });

export const chatDemoAssistant = createServerFn({ method: "POST" })
  .validator((input: {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
  }) => input)
  .handler(async ({ data }) => {
    const message = data.message.slice(0, 500);
    const history = (data.history || []).slice(-8);
    const fallback = ruleBasedAssistant(message, DEFAULT_CLINIC, history);
    if (fallback.blockedMedical || fallback.generic !== true || !aiAvailable()) return fallback;
    const ai = await chatCompletion({
      maxTokens: ASSISTANT_MAX_TOKENS,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${ASSISTANT_SYSTEM}\nClinic profile: ${JSON.stringify(DEFAULT_CLINIC)}`,
        },
        ...history,
        { role: "user", content: message },
      ],
    });
    if (!ai.ok) return fallback;
    return {
      text: ai.text.trim() || fallback.text,
      quickReplies: fallback.quickReplies,
      blockedMedical: false,
    };
  });

export const listLeadSources = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const roiRows = await ctx.sql<{
      source: string;
      leads: number;
      qualified: number;
      contacted: number;
      replies: number;
      won: number;
      revenue: number;
    }>`
      select
        ls.source_name as source,
        count(distinct ls.lead_id)::int as leads,
        count(distinct ls.lead_id) filter (
          where l.status in ('QUALIFIED','DRAFT_READY','APPROVED','CONTACTED','FOLLOW_UP_1','FOLLOW_UP_2','REPLIED','INTERESTED','DEMO','NEGOTIATION','WON')
        )::int as qualified,
        count(distinct ls.lead_id) filter (
          where l.status in ('CONTACTED','FOLLOW_UP_1','FOLLOW_UP_2','REPLIED','INTERESTED','DEMO','NEGOTIATION','WON')
        )::int as contacted,
        count(distinct ls.lead_id) filter (
          where l.status in ('REPLIED','INTERESTED','DEMO','NEGOTIATION','WON')
        )::int as replies,
        count(distinct ls.lead_id) filter (where l.status = 'WON')::int as won,
        coalesce(sum(r.revenue), 0) as revenue
      from lead_sources ls
      join leads l on l.id = ls.lead_id
      left join revenue_records r on r.lead_id = l.id
      where ls.workspace_id = ${ctx.workspace.id}
      group by ls.source_name
    `;
    const roi = new Map(roiRows.map((r) => [r.source, r]));
    const configs = await ctx.sql<{
      source_key: string;
      enabled: boolean;
      last_success_at: string | null;
      last_error: string | null;
      error_count: number;
      request_count: number;
    }>`
      select source_key, enabled, last_success_at, last_error, error_count, request_count
      from source_configs where workspace_id = ${ctx.workspace.id}
    `;
    const byKey = new Map(configs.map((c) => [c.source_key, c]));
    return {
      demo_mode: ctx.profile.demo_mode,
      sources: listSourceHealth(ctx.profile.demo_mode).map((s) => {
        const c = byKey.get(s.key);
        const r = roi.get(s.key);
        const enabled = c?.enabled ?? s.enabled;
        return {
          ...s,
          enabled,
          status: !enabled && s.status === "ready" ? "disabled" : s.status,
          last_success_at: c?.last_success_at ? String(c.last_success_at) : null,
          last_error: c?.last_error ?? s.last_error ?? null,
          error_count: num(c?.error_count),
          request_count: num(c?.request_count),
          leads: num(r?.leads),
          qualified: num(r?.qualified),
          contacted: num(r?.contacted),
          replies: num(r?.replies),
          won: num(r?.won),
          revenue: num(r?.revenue),
        };
      }),
    };
  });

export const setSourceEnabled = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key: string; enabled: boolean }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    if (data.key === "demo_pool" && data.enabled && !ctx.profile.demo_mode) {
      throw new Error("Demo pool cannot be enabled in production mode");
    }
    await ctx.sql`
      insert into source_configs (id, workspace_id, source_key, enabled)
      values (${crypto.randomUUID()}, ${ctx.workspace.id}, ${data.key}, ${data.enabled})
      on conflict (workspace_id, source_key) do update set
        enabled = excluded.enabled,
        updated_at = now()
    `;
    await recordEvent(
      ctx.sql,
      ctx.workspace.id,
      `${data.key} ${data.enabled ? "enabled" : "disabled"}`,
      "scout",
    );
    return { ok: true };
  });

export const importLeadsCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { csv: string }) => input)
  .handler(async ({ context, data }) => {
    const ctx = await getCtx(context.userId);
    const parsed = parseLeadCsv(data.csv);
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] || "No rows to import");
    const existing = await ctx.sql<{ domain: string | null; business_name: string }>`
      select domain, business_name from leads where workspace_id = ${ctx.workspace.id}
    `;
    let added = 0;
    let skipped = 0;
    const names: string[] = [];
    for (const row of parsed.rows.slice(0, 50)) {
      let website = row.website?.trim() || null;
      if (website) {
        const check = parsePublicHttpUrl(website);
        if (!check.ok) {
          skipped += 1;
          continue;
        }
        website = check.url.toString();
      }
      const domain = domainFromUrl(website);
      if (isDuplicateLead({ domain, business_name: row.business_name }, existing)) {
        skipped += 1;
        continue;
      }
      const id = crypto.randomUUID();
      await ctx.sql`
        insert into leads (
          id, workspace_id, business_name, website, domain, category, city, state,
          country, public_phone, public_email, source_url, notes, tags, status, is_demo, source
        ) values (
          ${id}, ${ctx.workspace.id}, ${row.business_name}, ${website}, ${domain},
          ${ctx.profile.target_niche || "Dental clinics"}, ${row.city ?? null}, ${row.state ?? null},
          ${row.country || ctx.profile.target_country}, ${row.phone ?? null}, ${row.email ?? null},
          ${website}, ${"Imported from CSV"}, ${jsonParam(["csv"])}::jsonb, ${"NEW"}, ${false}, ${"csv"}
        )
      `;
      existing.push({ domain, business_name: row.business_name });
      added += 1;
      names.push(row.business_name);
      await ctx.sql`
        insert into lead_sources (id, lead_id, workspace_id, source_name, source_url)
        values (${crypto.randomUUID()}, ${id}, ${ctx.workspace.id}, ${row.source || "csv"}, ${website})
      `;
    }
    await recordEvent(ctx.sql, ctx.workspace.id, `CSV import: ${added} added, ${skipped} skipped`, "scout");
    return { added, skipped, errors: parsed.errors, names };
  });

export const draftFollowup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((leadId: string) => leadId)
  .handler(async ({ context, data: leadId }) => {
    const ctx = await getCtx(context.userId);
    guardAgent(ctx.workspace.id);
    return runFollowup(ctx, leadId);
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const rows = await ctx.sql<Record<string, unknown>>`
      select c.*,
        (select count(*)::int from leads l where l.campaign_id = c.id) as leads
      from campaigns c
      where c.workspace_id = ${ctx.workspace.id}
      order by c.created_at desc
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      niche: String(r.niche),
      country: String(r.country),
      status: String(r.status),
      leads: num(r.leads),
      created_at: String(r.created_at),
    }));
  });

export const listRevenue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const rows = await ctx.sql<Record<string, unknown>>`
      select r.*, l.business_name
      from revenue_records r
      join leads l on l.id = r.lead_id
      where r.workspace_id = ${ctx.workspace.id}
      order by r.won_at desc
    `;
    const total = rows.reduce((s, r) => s + num(r.revenue), 0);
    return {
      rows: rows.map((r) => ({
        id: String(r.id),
        lead_id: String(r.lead_id),
        business_name: String(r.business_name),
        offer: String(r.offer),
        revenue: num(r.revenue),
        currency: String(r.currency),
        won_at: String(r.won_at),
      })),
      total,
      customers: rows.length,
    };
  });

export const listExperiments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await getCtx(context.userId);
    const rows = await ctx.sql<Record<string, unknown>>`
      select * from experiments where workspace_id = ${ctx.workspace.id} order by created_at desc
    `;
    if (rows.length === 0) {
      await ctx.sql`
        insert into experiments (id, workspace_id, name, niche, offer, price, status, notes)
        values (
          ${crypto.randomUUID()}, ${ctx.workspace.id},
          ${"AI Appointment Assistant for dental clinics"},
          ${ctx.profile.target_niche}, ${ctx.profile.offer}, ${ctx.profile.price},
          ${"active"}, ${"MVP experiment. Track contacted → won."}
        )
      `;
      const again = await ctx.sql<Record<string, unknown>>`
        select * from experiments where workspace_id = ${ctx.workspace.id} order by created_at desc
      `;
      return again.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        niche: String(r.niche),
        offer: String(r.offer),
        price: num(r.price),
        status: String(r.status),
        notes: r.notes ? String(r.notes) : null,
      }));
    }
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      niche: String(r.niche),
      offer: String(r.offer),
      price: num(r.price),
      status: String(r.status),
      notes: r.notes ? String(r.notes) : null,
    }));
  });
