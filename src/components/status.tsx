import { Badge } from "./ui";
import type { LeadStatus, Priority } from "@/lib/types";

const STATUS_TONE: Record<LeadStatus, "neutral" | "ok" | "warn" | "danger" | "info" | "accent"> = {
  NEW: "neutral",
  RESEARCHING: "info",
  AUDITED: "info",
  QUALIFIED: "ok",
  DRAFT_READY: "warn",
  APPROVED: "ok",
  CONTACTED: "info",
  REPLIED: "accent",
  INTERESTED: "ok",
  DEMO: "ok",
  WON: "ok",
  LOST: "danger",
  DO_NOT_CONTACT: "danger",
};

const PRIORITY_TONE: Record<Priority, "neutral" | "ok" | "warn" | "danger" | "info"> = {
  low: "neutral",
  medium: "info",
  high: "warn",
  very_high: "danger",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status.replaceAll("_", " ")}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-subtle">—</span>;
  return <Badge tone={PRIORITY_TONE[priority]}>{priority.replace("_", " ")}</Badge>;
}

export function ScorePip({ score }: { score: number | null }) {
  if (score == null) return <span className="text-subtle tabular-nums">—</span>;
  const color =
    score >= 90 ? "text-ok" : score >= 75 ? "text-warn" : score >= 50 ? "text-info" : "text-muted";
  return <span className={`tabular-nums font-medium ${color}`}>{score}</span>;
}
