import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createLead, listLeads } from "@/lib/server/fns";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { PriorityBadge, ScorePip, StatusBadge } from "@/components/status";
import { LEAD_STATUSES, PRIORITIES, type LeadFilters, type LeadStatus, type Priority } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/leads/")({ component: LeadsPage });

const EMPTY: LeadFilters = {
  q: "",
  status: "",
  priority: "",
  city: "",
  state: "",
  category: "",
  minScore: "",
  from: "",
};

function LeadsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<LeadFilters>(EMPTY);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    website: "",
    city: "",
    state: "",
    notes: "",
  });

  const q = useQuery({
    queryKey: ["leads", filters],
    queryFn: () => listLeads({ data: filters }),
  });
  const leads = q.data ?? [];

  async function saveLead(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createLead({
        data: {
          business_name: form.business_name,
          website: form.website || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          notes: form.notes || undefined,
        },
      });
      toast.success("Lead saved");
      setForm({ business_name: "", website: "", city: "", state: "", notes: "" });
      setShowAdd(false);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save lead");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Pipeline</p>
          <h1 className="font-display text-4xl">Leads</h1>
          <p className="mt-1 text-sm text-muted">
            {q.isLoading ? "Loading…" : `${leads.length} prospects · quality first`}
          </p>
        </div>
        <Button variant={showAdd ? "secondary" : "primary"} onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "+ Add business"}
        </Button>
      </div>

      {showAdd ? (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveLead}>
            <div className="sm:col-span-2">
              <Label htmlFor="biz">Business name</Label>
              <Input
                id="biz"
                required
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="web">Website</Label>
              <Input
                id="web"
                placeholder="https://"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save lead"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search name, domain, city"
          value={filters.q ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          className="h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
          value={filters.status ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as LeadStatus | "" }))}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
          value={filters.priority ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as Priority | "" }))}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Input
          placeholder="Min score"
          type="number"
          min={0}
          max={100}
          value={filters.minScore ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, minScore: e.target.value === "" ? "" : Number(e.target.value) }))
          }
        />
        <Input
          placeholder="City"
          value={filters.city ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
        />
        <Input
          placeholder="State"
          value={filters.state ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
        />
        <Input
          placeholder="Category"
          value={filters.category ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
        />
        <Input
          type="date"
          value={filters.from ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          aria-label="From date"
        />
      </div>

      {q.isLoading ? (
        <div className="h-64 animate-pulse rounded-[var(--radius-xl)] bg-surface" />
      ) : leads.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No leads match these filters. Run Scout or add a business.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-surface text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                {["Business", "Location", "Score", "Priority", "Problem", "Status", "Created", "Action"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-border bg-bg">
                  <td className="px-4 py-3">
                    <Link to="/leads/$id" params={{ id: l.id }} className="font-medium hover:underline">
                      {l.business_name}
                    </Link>
                    <p className="text-xs text-subtle">{l.domain}</p>
                    {l.is_demo ? <Badge className="mt-1" tone="neutral">Demo</Badge> : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {[l.city, l.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3"><ScorePip score={l.score} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={l.priority} /></td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-muted">{l.problem ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-muted">{formatDate(l.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link to="/leads/$id" params={{ id: l.id }} className="text-sm underline-offset-4 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2 p-3 md:hidden">
            {leads.map((l) => (
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
                <p className="mt-1 text-xs text-muted">
                  {[l.city, l.state].filter(Boolean).join(", ") || l.domain}
                </p>
                <p className="mt-1 truncate text-xs text-subtle">{l.problem ?? "No score yet"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={l.status} />
                  <PriorityBadge priority={l.priority} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
