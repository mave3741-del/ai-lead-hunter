import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCampaigns } from "@/lib/server/fns";
import { Badge, Card } from "@/components/ui";

export const Route = createFileRoute("/_app/campaigns")({ component: CampaignsPage });

function CampaignsPage() {
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });
  const rows = q.data ?? [];
  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Work</p>
        <h1 className="font-display text-4xl">Campaigns</h1>
      </div>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No campaign yet. One is created when your workspace seeds.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-display text-xl">{c.name}</p>
                <p className="text-sm text-muted">
                  {c.niche} · {c.country} · {c.leads} leads
                </p>
              </div>
              <Badge tone="ok">{c.status}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
