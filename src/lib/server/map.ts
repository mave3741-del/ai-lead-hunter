import { asStringArray, iso, num } from "../utils";
import type {
  AgentEvent,
  AgentTask,
  AgentType,
  ApprovalStatus,
  AuditResult,
  JsonValue,
  Lead,
  LeadStatus,
  Priority,
  TaskStatus,
} from "../types";

export function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    business_name: String(row.business_name),
    website: row.website ? String(row.website) : null,
    domain: row.domain ? String(row.domain) : null,
    category: String(row.category ?? "Dental clinic"),
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    country: String(row.country ?? "United States"),
    public_phone: row.public_phone ? String(row.public_phone) : null,
    public_email: row.public_email ? String(row.public_email) : null,
    source_url: row.source_url ? String(row.source_url) : null,
    source: String(row.source ?? "manual"),
    notes: row.notes ? String(row.notes) : null,
    tags: asStringArray(row.tags),
    status: String(row.status) as LeadStatus,
    is_demo: Boolean(row.is_demo),
    response: row.response ? String(row.response) : null,
    contacted_at: iso(row.contacted_at),
    last_response_at: iso(row.last_response_at),
    created_at: iso(row.created_at) ?? new Date().toISOString(),
    updated_at: iso(row.updated_at) ?? new Date().toISOString(),
    score: row.score == null ? null : num(row.score),
    priority: row.priority ? (String(row.priority) as Priority) : null,
    problem: row.problem ? String(row.problem) : null,
    approval_status: row.approval_status
      ? (String(row.approval_status) as ApprovalStatus)
      : null,
  };
}

export function mapAudit(row: Record<string, unknown>): AuditResult & { id: string; created_at: string } {
  return {
    id: String(row.id),
    appointment_available: row.appointment_available == null ? null : Boolean(row.appointment_available),
    chatbot_present: row.chatbot_present == null ? null : Boolean(row.chatbot_present),
    faq_present: row.faq_present == null ? null : Boolean(row.faq_present),
    lead_capture_present: row.lead_capture_present == null ? null : Boolean(row.lead_capture_present),
    after_hours_help: row.after_hours_help == null ? null : Boolean(row.after_hours_help),
    mobile_experience: (row.mobile_experience as AuditResult["mobile_experience"]) || "unknown",
    contact_flow_clear: row.contact_flow_clear == null ? null : Boolean(row.contact_flow_clear),
    activity_signals: (row.activity_signals as AuditResult["activity_signals"]) || "unknown",
    opportunities: asStringArray(row.opportunities),
    observations: asStringArray(row.observations),
    confidence: num(row.confidence),
    website_status: (row.website_status as AuditResult["website_status"]) || "unknown",
    appointment_flow: (row.appointment_flow as AuditResult["appointment_flow"]) || "unknown",
    evidence: (() => {
      const raw = Array.isArray(row.evidence)
        ? row.evidence
        : typeof row.evidence === "string"
          ? (JSON.parse(row.evidence) as unknown)
          : [];
      if (!Array.isArray(raw)) return [];
      return raw
        .map((item) => {
          if (item && typeof item === "object" && "finding" in item) {
            return {
              finding: String((item as { finding: unknown }).finding),
              source_url: String((item as { source_url?: unknown }).source_url ?? ""),
            };
          }
          return null;
        })
        .filter((item): item is { finding: string; source_url: string } => Boolean(item));
    })(),
    created_at: iso(row.created_at) ?? new Date().toISOString(),
  };
}

export function mapTask(row: Record<string, unknown>): AgentTask {
  const input = typeof row.input === "string" ? JSON.parse(row.input) : row.input;
  const output = row.output == null ? null : typeof row.output === "string" ? JSON.parse(String(row.output)) : row.output;
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    lead_id: row.lead_id ? String(row.lead_id) : null,
    agent_type: String(row.agent_type) as AgentType,
    status: String(row.status) as TaskStatus,
    input: (input ?? {}) as JsonValue,
    output: (output ?? null) as JsonValue | null,
    error: row.error ? String(row.error) : null,
    retry_count: num(row.retry_count),
    started_at: iso(row.started_at),
    completed_at: iso(row.completed_at),
    created_at: iso(row.created_at) ?? new Date().toISOString(),
  };
}

export function mapEvent(row: Record<string, unknown>): AgentEvent {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    lead_id: row.lead_id ? String(row.lead_id) : null,
    agent_type: row.agent_type ? (String(row.agent_type) as AgentType) : null,
    message: String(row.message),
    created_at: iso(row.created_at) ?? new Date().toISOString(),
  };
}

export function jsonParam(value: unknown): string {
  return JSON.stringify(value ?? null);
}
