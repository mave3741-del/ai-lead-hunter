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
import {
  getDashboard,
  runAuditPending,
  runGenerateDrafts,
  runResearchPending,
  runScorePending,
  setAgentsPaused,
  startScout,
} from "@/lib/server/fns";
import { Badge, Button, Card, Input } from "@/components/ui";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const data = q.data;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      toast.success(label);
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label);
    } finally {
      setBusy(null);
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
  const paused = data.profile.agents_paused;

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Command</p>
          <h1 className="font-display text-4xl">Lead desk</h1>
          <p className="mt-1 text-sm text-muted">
            Target {data.profile.daily_lead_target} quality prospects/day. Net revenue is the scoreboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!!busy || paused}
            onClick={() =>
              void run("Scout finished", () =>
                startScout({ data: { city: city || undefined, state: state || undefined } }),
              )
            }
          >
            Run discovery
          </Button>
          <Button variant="secondary" disabled={!!busy || paused} onClick={() => void run("Research done", () => runResearchPending())}>
            Run research
          </Button>
          <Button variant="secondary" disabled={!!busy || paused} onClick={() => void run("Audits done", () => runAuditPending())}>
            Run audits
          </Button>
          <Button variant="secondary" disabled={!!busy || paused} onClick={() => void run("Scored", () => runScorePending())}>
            Score leads
          </Button>
          <Button variant="secondary" disabled={!!busy || paused} onClick={() => void run("Drafts ready", () => runGenerateDrafts())}>
            Generate drafts
          </Button>
          <Button
            variant={paused ? "primary" : "outline"}
            disabled={!!busy}
            onClick={() => void run(paused ? "Agents resumed" : "Agents paused", () => setAgentsPaused({ data: !paused }))}
          >
            {paused ? "Resume agents" : "Pause all"}
          </Button>
          <Link to="/leads">
            <Button variant="ghost">All leads</Button>
          </Link>
        </div>
      </div>

      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">First $100 goal</p>
          <p className="mt-1 font-display text-3xl tabular-nums">
            {formatMoney(m.revenue, data.profile.currency)} / {formatMoney(data.profile.price || 100, data.profile.currency)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Customers {m.customers} / 1 · {m.customers >= 1 ? "Goal hit. Keep going." : "One real $100 customer."}
          </p>
        </div>
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.min(100, Math.round((m.revenue / Math.max(data.profile.price || 100, 1)) * 100))}%` }}
          />
        </div>
      </Card>

      {data.spendCapped ? (
        <Card className="border-warn/40 p-4 text-sm">
          Daily AI spend cap reached. New model calls are paused until tomorrow or you raise the cap in Settings.
        </Card>
      ) : null}

      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Scout city</p>
          <Input className="mt-1" placeholder="Austin" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">State</p>
          <Input className="mt-1" placeholder="TX" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <p className="self-end text-xs text-subtle">
          Niche: {data.profile.target_niche} · {data.profile.target_country}. Quality over volume (max ~20/day).
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Today's prospects" value={String(m.today_prospects)} hint={`Daily target ${data.profile.daily_lead_target}`} />
        <Metric label="Total leads" value={String(m.total_leads)} />
        <Metric label="Qualified" value={String(m.qualified_leads)} />
        <Metric label="High priority" value={String(m.high_priority_leads)} />
        <Metric label="Drafts ready" value={String(m.drafts_ready)} />
        <Metric label="Approved outreach" value={String(m.approved)} />
        <Metric label="Contacted" value={String(m.contacted)} />
        <Metric label="Replies" value={String(m.replied)} />
        <Metric label="Interested" value={String(m.interested)} />
        <Metric label="Demos" value={String(m.demos)} />
        <Metric label="Customers" value={String(m.customers)} hint={`${m.conversion_rate}% of contacted`} />
        <Metric
          label="Revenue"
          value={formatMoney(m.revenue, data.profile.currency)}
          hint={`Avg ${formatMoney(m.average_deal, data.profile.currency)}`}
        />
        <Metric label="AI cost today" value={formatMoney(m.ai_cost_today, data.profile.currency)} hint={`${m.ai_calls_today} calls`} />
        <Metric
          label="Est. profit"
          value={formatMoney(m.estimated_profit, data.profile.currency)}
          hint="Revenue minus today's AI cost"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Leads by status</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }} />
                <Bar dataKey="n" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Score distribution</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.scoreBuckets}>
                <XAxis dataKey="bucket" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }} />
                <Bar dataKey="n" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Source performance</p>
          <ul className="mt-4 space-y-2">
            {data.bySource.length === 0 ? (
              <li className="text-sm text-muted">No sources yet.</li>
            ) : (
              data.bySource.map((s) => (
                <li key={s.source} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{s.source.replaceAll("_", " ")}</span>
                  <span className="tabular-nums text-muted">{s.n}</span>
                </li>
              ))
            )}
          </ul>
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
