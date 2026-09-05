import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { importLeadsCsv, listLeadSources, setSourceEnabled } from "@/lib/server/fns";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sources")({ component: SourcesPage });

function SourcesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sources"], queryFn: () => listLeadSources() });
  const [csv, setCsv] = useState("business_name,website,city,state\n");
  const [busy, setBusy] = useState<string | null>(null);

  async function onImport() {
    setBusy("import");
    try {
      const res = await importLeadsCsv({ data: { csv } });
      toast.success(`Imported ${res.added} · skipped ${res.skipped}`);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(key: string, enabled: boolean) {
    setBusy(key);
    try {
      await setSourceEnabled({ data: { key, enabled } });
      toast.success(enabled ? "Enabled" : "Disabled");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update source");
    } finally {
      setBusy(null);
    }
  }

  const data = q.data;
  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Discovery</p>
        <h1 className="font-display text-4xl">Lead sources</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Scout queries every ready source and merges duplicates. Production never uses sample clinics.
        </p>
      </div>

      {data?.demo_mode ? (
        <Card className="border-warn/40 p-4 text-sm">
          DEMO MODE is on. Scout may use labeled sample clinics. Turn it off in Settings for live sources.
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted">
          Production mode. Sample data is locked. OSM is live without a key. Places/Serper stay Not configured until you set keys.
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
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-subtle">Leads</dt>
                <dd className="tabular-nums">{s.leads ?? 0}</dd>
              </div>
              <div>
                <dt className="text-subtle">Qualified</dt>
                <dd className="tabular-nums">{s.qualified ?? 0}</dd>
              </div>
              <div>
                <dt className="text-subtle">Won</dt>
                <dd className="tabular-nums">{s.won ?? 0}</dd>
              </div>
              <div>
                <dt className="text-subtle">Contacted</dt>
                <dd className="tabular-nums">{s.contacted ?? 0}</dd>
              </div>
              <div>
                <dt className="text-subtle">Replies</dt>
                <dd className="tabular-nums">{s.replies ?? 0}</dd>
              </div>
              <div>
                <dt className="text-subtle">Revenue</dt>
                <dd className="tabular-nums">{formatMoney(s.revenue ?? 0)}</dd>
              </div>
            </dl>
            {"request_count" in s ? (
              <p className="mt-2 text-xs text-subtle">
                {s.request_count ?? 0} requests
                {s.last_success_at ? ` · last ok ${new Date(String(s.last_success_at)).toLocaleString()}` : ""}
                {s.last_error ? ` · last error: ${s.last_error}` : ""}
              </p>
            ) : null}
            {s.requires_key ? (
              <p className="mt-2 text-xs text-subtle">API key stays server-side. Never sent to the browser.</p>
            ) : null}
            {s.key !== "demo_pool" && s.status !== "not_configured" ? (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void toggle(s.key, !s.enabled)}
              >
                {s.enabled ? "Disable" : "Enable"}
              </Button>
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-display text-2xl">CSV import</h2>
        <p className="mt-1 text-sm text-muted">
          Columns: business_name, website, city, state, country, phone, email, source. Max 50 rows. Enters the same pipeline as Scout.
        </p>
        <Textarea className="mt-3 min-h-40 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <Button className="mt-3" disabled={!!busy} onClick={() => void onImport()}>
          {busy === "import" ? "Importing…" : "Import CSV"}
        </Button>
      </Card>
    </div>
  );
}
