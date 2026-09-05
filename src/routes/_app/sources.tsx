import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { importLeadsCsv, listLeadSources } from "@/lib/server/fns";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sources")({ component: SourcesPage });

function SourcesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sources"], queryFn: () => listLeadSources() });
  const [csv, setCsv] = useState("business_name,website,city,state\n");
  const [busy, setBusy] = useState(false);

  async function onImport() {
    setBusy(true);
    try {
      const res = await importLeadsCsv({ data: { csv } });
      toast.success(`Imported ${res.added} · skipped ${res.skipped}`);
      await qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const data = q.data;
  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Discovery</p>
        <h1 className="font-display text-4xl">Lead sources</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Production discovery never uses sample clinics. If nothing is configured, Scout tells you
          so — it will not invent leads.
        </p>
      </div>

      {data?.demo_mode ? (
        <Card className="border-warn/40 p-4 text-sm">
          DEMO MODE is on. Scout may use labeled sample clinics. Turn it off in Settings for live sources.
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted">
          Production mode. Sample data is locked. Use OSM, a configured API, CSV import, or Add business.
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(data?.sources ?? []).map((s) => (
          <Card key={s.key} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl">{s.name}</h2>
              <Badge tone={s.status === "ready" ? "ok" : s.status === "not_configured" ? "warn" : "neutral"}>
                {s.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{s.detail}</p>
            {s.requires_key ? (
              <p className="mt-2 text-xs text-subtle">API key stays server-side. Never sent to the browser.</p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-display text-2xl">CSV import</h2>
        <p className="mt-1 text-sm text-muted">
          Columns: business_name, website, city, state, country, phone, email, source. Max 50 rows.
        </p>
        <Textarea className="mt-3 min-h-40 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <Button className="mt-3" disabled={busy} onClick={() => void onImport()}>
          {busy ? "Importing…" : "Import CSV"}
        </Button>
      </Card>
    </div>
  );
}
