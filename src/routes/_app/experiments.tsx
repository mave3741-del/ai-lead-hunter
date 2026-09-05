import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDashboard, listExperiments } from "@/lib/server/fns";
import { Badge, Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_app/experiments")({ component: ExperimentsPage });

function ExperimentsPage() {
  const exp = useQuery({ queryKey: ["experiments"], queryFn: () => listExperiments() });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const m = dash.data?.metrics;
  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Learn</p>
        <h1 className="font-display text-4xl">Experiments</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          MVP is locked to US dental clinics / $100 appointment assistant. Later the Master agent can
          compare niches. Do not treat these numbers as guarantees.
        </p>
      </div>
      {(exp.data ?? []).map((e) => (
        <Card key={e.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl">{e.name}</h2>
            <Badge tone="ok">{e.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted">
            {e.niche} · {e.offer} · {formatMoney(e.price)}
          </p>
          {e.notes ? <p className="mt-2 text-sm text-subtle">{e.notes}</p> : null}
          {m ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">Prospects</dt><dd className="font-display text-2xl">{m.total_leads}</dd></div>
              <div><dt className="text-muted">Contacted</dt><dd className="font-display text-2xl">{m.contacted}</dd></div>
              <div><dt className="text-muted">Replied</dt><dd className="font-display text-2xl">{m.replied}</dd></div>
              <div><dt className="text-muted">Interested</dt><dd className="font-display text-2xl">{m.interested}</dd></div>
              <div><dt className="text-muted">Demos</dt><dd className="font-display text-2xl">{m.demos}</dd></div>
              <div><dt className="text-muted">Won</dt><dd className="font-display text-2xl">{m.won}</dd></div>
              <div><dt className="text-muted">Revenue</dt><dd className="font-display text-2xl">{formatMoney(m.revenue)}</dd></div>
              <div><dt className="text-muted">Est. profit</dt><dd className="font-display text-2xl">{formatMoney(m.estimated_profit)}</dd></div>
            </dl>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
