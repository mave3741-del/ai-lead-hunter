export const LEAD_STATUSES = [
  "NEW",
  "RESEARCHING",
  "AUDITED",
  "QUALIFIED",
  "DRAFT_READY",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "DEMO",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };


export const PRIORITIES = ["low", "medium", "high", "very_high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AGENT_TYPES = [
  "master",
  "scout",
  "auditor",
  "scorer",
  "outreach",
  "manager",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const TASK_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "edited",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type MobileExperience = "good" | "average" | "poor" | "unknown";
export type ActivitySignals = "strong" | "average" | "weak" | "unknown";
export type EstimatedValue = "low" | "medium" | "high";

export type AuditResult = {
  appointment_available: boolean | null;
  chatbot_present: boolean | null;
  faq_present: boolean | null;
  lead_capture_present: boolean | null;
  after_hours_help: boolean | null;
  mobile_experience: MobileExperience;
  contact_flow_clear: boolean | null;
  activity_signals: ActivitySignals;
  opportunities: string[];
  observations: string[];
  confidence: number;
};

export type ScoreResult = {
  score: number;
  priority: Priority;
  reasons: string[];
  recommended_offer: string;
  estimated_value: EstimatedValue;
};

export type OutreachDraftContent = {
  email_draft: string;
  contact_form_draft: string;
  short_message: string;
  evidence_notes: string[];
};

export type BusinessProfile = {
  id: string;
  workspace_id: string;
  business_name: string;
  offer: string;
  price: number;
  currency: string;
  target_niche: string;
  target_country: string;
  min_lead_score: number;
  outreach_tone: string;
  demo_url: string | null;
  contact_email: string | null;
  max_concurrent_tasks: number;
  max_daily_ai_spend: number;
  agents_paused: boolean;
  demo_mode: boolean;
};

export type Workspace = {
  id: string;
  user_id: string;
  name: string;
};

export type Lead = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  business_name: string;
  website: string | null;
  domain: string | null;
  category: string;
  city: string | null;
  state: string | null;
  country: string;
  public_phone: string | null;
  public_email: string | null;
  source_url: string | null;
  notes: string | null;
  tags: string[];
  status: LeadStatus;
  is_demo: boolean;
  response: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
  score: number | null;
  priority: Priority | null;
  problem: string | null;
  approval_status: ApprovalStatus | null;
};

export type LeadDetail = Lead & {
  audit: (AuditResult & { id: string; created_at: string }) | null;
  score_record: (ScoreResult & { id: string; created_at: string }) | null;
  drafts: Array<{
    id: string;
    email_draft: string;
    contact_form_draft: string;
    short_message: string;
    evidence_notes: string[];
    approval_status: ApprovalStatus;
    generated_at: string;
    approved_at: string | null;
  }>;
  revenue: { id: string; revenue: number; offer: string; won_at: string } | null;
};

export type AgentTask = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  agent_type: AgentType;
  status: TaskStatus;
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type AgentEvent = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  agent_type: AgentType | null;
  message: string;
  created_at: string;
};

export type DashboardMetrics = {
  total_leads: number;
  new_leads: number;
  qualified_leads: number;
  high_priority_leads: number;
  contacted: number;
  interested: number;
  won: number;
  revenue: number;
  conversion_rate: number;
  customers: number;
  average_deal: number;
  ai_calls_today: number;
  ai_cost_today: number;
  tasks_completed: number;
  tasks_failed: number;
};

export type AgentSummary = {
  agent_type: AgentType;
  last_run: string | null;
  completed: number;
  failed: number;
  running: number;
  avg_ms: number | null;
};

export type LeadFilters = {
  q?: string;
  status?: LeadStatus | "";
  priority?: Priority | "";
  city?: string;
  state?: string;
  category?: string;
  minScore?: number | "";
  maxScore?: number | "";
  from?: string;
  to?: string;
};
