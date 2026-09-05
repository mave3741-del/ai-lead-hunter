import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboard, startScout } from "@/lib/server/fns";
import { Badge, Button, Card } from "@/components/ui";
import { PriorityBadge, ScorePip, StatusBadge } from "@/components/status";
import { formatMoney, relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </Card>
  );
}

function Dashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const [busy, setBusy] = useState(false);
  const data = q.data;

  async function scout() {
    setBusy(true);
    try {
      const res = await startScout();
      if (res.status === "failed") throw new Error(res.error);
      toast.success("Scout finished");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scout failed");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[var(--radius-xl)] bg-surface" />
        ))}
      </div>
    );
  }

  const m = data.metrics;
  const chart = data.byStatus.map((s) => ({ name: s.status.replaceAll("_", " "), n: s.n }));

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Command</p>
          <h1 className="font-display text-4xl">Lead desk</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void scout()} disabled={busy || data.profile.agents_paused}>
            Start Scout
          </Button>
          <Link to="/leads">
            <Button variant="secondary">All leads</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total leads" value={String(m.total_leads)} />
        <Metric label="New" value={String(m.new_leads)} />
        <Metric label="Qualified" value={String(m.qualified_leads)} />
        <Metric label="High priority" value={String(m.high_priority_leads)} />
        <Metric label="Contacted" value={String(m.contacted)} />
        <Metric label="Interested" value={String(m.interested)} />
        <Metric label="Won" value={String(m.won)} />
        <Metric label="Drafts ready" value={String(m.drafts_ready)} />
        <Metric label="Demos" value={String(m.demos)} />
        <Metric
          label="Revenue"
          value={formatMoney(m.revenue, data.profile.currency)}
          hint={`${m.conversion_rate}% of contacted · avg ${formatMoney(m.average_deal, data.profile.currency)}`}
        />
        <Metric
          label="Est. profit"
          value={formatMoney(m.estimated_profit, data.profile.currency)}
          hint={`AI cost today ${formatMoney(m.ai_cost_today, data.profile.currency)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Pipeline</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }}
                />
                <Bar dataKey="n" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Activity</p>
          <ul className="mt-4 space-y-3">
            {data.events.length === 0 ? (
              <li className="text-sm text-muted">No agent events yet.</li>
            ) : (
              data.events.map((ev) => (
                <li key={ev.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm">{ev.message}</p>
                  <p className="text-xs text-subtle">{relativeTime(ev.created_at)}</p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent leads</h2>
          <Badge>Demo data marked</Badge>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-surface text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                {["Business", "Location", "Score", "Priority", "Problem", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recent.map((l) => (
                <tr key={l.id} className="border-t border-border bg-bg">
                  <td className="px-4 py-3">
                    <Link to="/leads/$id" params={{ id: l.id }} className="font-medium hover:underline">
                      {l.business_name}
                    </Link>
                    <p className="text-xs text-subtle">{l.domain}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {[l.city, l.state].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-4 py-3"><ScorePip score={l.score} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={l.priority} /></td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-muted">{l.problem ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2 p-3 md:hidden">
            {data.recent.map((l) => (
              <Link
                key={l.id}
                to="/leads/$id"
                params={{ id: l.id }}
                className="block rounded-[var(--radius-lg)] border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{l.business_name}</p>
                  <ScorePip score={l.score} />
                </div>
                <p className="mt-1 text-xs text-muted">{l.problem}</p>
                <div className="mt-2"><StatusBadge status={l.status} /></div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
