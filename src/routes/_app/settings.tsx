import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { bootstrapWorkspace, resetDemo, saveSettings } from "@/lib/server/fns";
import { Button, Card, Input, Label } from "@/components/ui";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bootstrap"], queryFn: () => bootstrapWorkspace() });
  const p = q.data?.profile;
  const [form, setForm] = useState({
    business_name: "",
    offer: "",
    price: 100,
    currency: "USD",
    target_niche: "Dental clinics",
    target_country: "United States",
    min_lead_score: 75,
    outreach_tone: "professional",
    demo_url: "",
    contact_email: "",
    max_concurrent_tasks: 5,
    max_daily_ai_spend: 5,
    daily_lead_target: 20,
    demo_mode: true,
  });

  useEffect(() => {
    if (!p) return;
    setForm({
      business_name: p.business_name,
      offer: p.offer,
      price: p.price,
      currency: p.currency,
      target_niche: p.target_niche,
      target_country: p.target_country,
      min_lead_score: p.min_lead_score,
      outreach_tone: p.outreach_tone,
      demo_url: p.demo_url ?? "",
      contact_email: p.contact_email ?? "",
      max_concurrent_tasks: p.max_concurrent_tasks,
      max_daily_ai_spend: p.max_daily_ai_spend,
      daily_lead_target: p.daily_lead_target ?? 20,
      demo_mode: p.demo_mode,
    });
  }, [p]);

  if (!p) return <div className="h-64 animate-pulse rounded-[var(--radius-xl)] bg-surface" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Workspace</p>
        <h1 className="font-display text-4xl">Settings</h1>
      </div>
      <Card>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSettings({ data: form })
              .then(async () => {
                toast.success("Saved");
                await qc.invalidateQueries({ queryKey: ["bootstrap"] });
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        >
          <Field label="Business name" value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
          <Field label="Offer" value={form.offer} onChange={(v) => setForm({ ...form, offer: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" type="number" value={String(form.price)} onChange={(v) => setForm({ ...form, price: Number(v) })} />
            <Field label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
          </div>
          <Field label="Target niche" value={form.target_niche} onChange={(v) => setForm({ ...form, target_niche: v })} />
          <Field label="Target country" value={form.target_country} onChange={(v) => setForm({ ...form, target_country: v })} />
          <Field
            label="Minimum lead score"
            type="number"
            value={String(form.min_lead_score)}
            onChange={(v) => setForm({ ...form, min_lead_score: Number(v) })}
          />
          <Field label="Outreach tone" value={form.outreach_tone} onChange={(v) => setForm({ ...form, outreach_tone: v })} />
          <Field label="Demo URL" value={form.demo_url} onChange={(v) => setForm({ ...form, demo_url: v })} />
          <Field label="Contact email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Max concurrent tasks"
              type="number"
              value={String(form.max_concurrent_tasks)}
              onChange={(v) => setForm({ ...form, max_concurrent_tasks: Number(v) })}
            />
            <Field
              label="Max daily AI spend"
              type="number"
              value={String(form.max_daily_ai_spend)}
              onChange={(v) => setForm({ ...form, max_daily_ai_spend: Number(v) })}
            />
            <Field
              label="Daily lead target"
              type="number"
              value={String(form.daily_lead_target)}
              onChange={(v) => setForm({ ...form, daily_lead_target: Number(v) })}
            />
          </div>
          <label className="flex h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.demo_mode}
              onChange={(e) => setForm({ ...form, demo_mode: e.target.checked })}
            />
            Demo mode (no paid APIs required, no real outbound)
          </label>
          <Button type="submit">Save</Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-display text-2xl">Source providers</h2>
        <p className="mt-2 text-sm text-muted">
          API keys stay on the server. OSM Overpass is public (no key). Google Places and Serper
          show <strong>Not configured</strong> until you set <code>GOOGLE_PLACES_API_KEY</code> or{" "}
          <code>SERPER_API_KEY</code>. Production Scout never uses sample clinics.
        </p>
        <p className="mt-3 text-sm text-muted">
          Manage adapters, CSV import, and health on the Sources page.
        </p>
      </Card>
      <Card>
        <h2 className="font-display text-2xl">Demo data</h2>
        <p className="mt-2 text-sm text-muted">
          Reloads the 20 sample US dental clinics. Live-added leads in this workspace will be removed.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            void resetDemo()
              .then(async () => {
                toast.success("Demo clinics restored");
                await qc.invalidateQueries();
              })
              .catch((e: Error) => toast.error(e.message));
          }}
        >
          Reset demo clinics
        </Button>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
