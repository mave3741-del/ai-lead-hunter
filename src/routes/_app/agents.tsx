import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getAgents,
  runAuditPending,
  runGenerateDrafts,
  runScorePending,
  setAgentsPaused,
  startScout,
} from "@/lib/server/fns";
import { Badge, Button, Card } from "@/components/ui";
import { formatMoney, relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import type { AgentType } from "@/lib/types";

export const Route = createFileRoute("/_app/agents")({ component: AgentsPage });

const LABELS: Record<AgentType, { name: string; blurb: string }> = {
  master: { name: "Master", blurb: "Orchestrates discover → audit → score → outreach → approval." },
  scout: { name: "Scout", blurb: "Finds permitted public clinic records. Quality over volume." },
  auditor: { name: "Website auditor", blurb: "Reads public pages. Never invents findings." },
  scorer: { name: "Lead scoring", blurb: "Explainable 0–100 score from verified signals." },
  outreach: { name: "Outreach writer", blurb: "Drafts copy from evidence. Does not send." },
  manager: { name: "Lead manager", blurb: "Status, approval, revenue, do-not-contact." },
};

function AgentsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agents"], queryFn: () => getAgents() });
  const [busy, setBusy] = useState<string | null>(null);
  const data = q.data;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      toast.success(label);
      await qc.invalidateQueries({ queryKey: ["agents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <div className="h-64 animate-pulse rounded-[var(--radius-xl)] bg-surface" />;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Control center</p>
          <h1 className="font-display text-4xl">Agents</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy || data.paused} onClick={() => run("Scout", () => startScout())}>
            Start Scout
          </Button>
          <Button variant="secondary" disabled={!!busy || data.paused} onClick={() => run("Audit pending", () => runAuditPending())}>
            Run Audit
          </Button>
          <Button variant="secondary" disabled={!!busy || data.paused} onClick={() => run("Scored pending", () => runScorePending())}>
            Score pending
          </Button>
          <Button variant="secondary" disabled={!!busy || data.paused} onClick={() => run("Drafts", () => runGenerateDrafts())}>
            Generate drafts
          </Button>
          <Button
            variant={data.paused ? "primary" : "outline"}
            disabled={!!busy}
            onClick={() => run(data.paused ? "Resumed" : "Paused", () => setAgentsPaused({ data: !data.paused }))}
          >
            {data.paused ? "Resume agents" : "Pause all"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">AI today</p>
          <p className="mt-2 font-display text-2xl tabular-nums">{data.usage.calls} calls</p>
          <p className="text-xs text-subtle">{formatMoney(data.usage.cost)} estimated</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Tasks today</p>
          <p className="mt-2 font-display text-2xl tabular-nums">{data.tasksToday.completed} done</p>
          <p className="text-xs text-subtle">{data.tasksToday.failed} failed</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Mode</p>
          <p className="mt-2 font-display text-2xl">{data.profile.demo_mode ? "Demo" : "Live"}</p>
          <p className="text-xs text-subtle">{data.aiConfigured ? "AI provider configured" : "Heuristic / template only"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Caps</p>
          <p className="mt-2 text-sm">{data.profile.max_concurrent_tasks} concurrent</p>
          <p className="text-xs text-subtle">Daily AI ${data.profile.max_daily_ai_spend} · min score {data.profile.min_lead_score}</p>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {data.agents.map((a) => {
          const meta = LABELS[a.agent_type];
          const status = a.running > 0 ? "running" : data.paused ? "paused" : "idle";
          return (
            <Card key={a.agent_type}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl">{meta.name}</h2>
                  <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
                </div>
                <Badge tone={status === "running" ? "ok" : status === "paused" ? "warn" : "neutral"}>{status}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-subtle">Last run</dt>
                  <dd>{relativeTime(a.last_run)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Avg time</dt>
                  <dd className="tabular-nums">{a.avg_ms != null ? `${a.avg_ms} ms` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Completed</dt>
                  <dd className="tabular-nums">{a.completed}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Failures</dt>
                  <dd className="tabular-nums">{a.failed}</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card>
        <h2 className="font-display text-2xl">Event stream</h2>
        <ul className="mt-4 space-y-3">
          {data.events.map((ev) => (
            <li key={ev.id} className="border-b border-border pb-3 last:border-0">
              <p className="text-sm">{ev.message}</p>
              <p className="text-xs text-subtle">
                {ev.agent_type ?? "system"} · {relativeTime(ev.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
