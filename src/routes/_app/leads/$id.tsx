import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  auditLead,
  changeLeadStatus,
  decideDraft,
  draftLead,
  getLead,
  markContacted,
  markWon,
  runPipeline,
  saveLeadResponse,
  scoreLeadFn,
  draftFollowup,
} from "@/lib/server/fns";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { PriorityBadge, ScorePip, StatusBadge } from "@/components/status";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { canSendOutreach } from "@/lib/lead-rules";

export const Route = createFileRoute("/_app/leads/$id")({ component: LeadDetail });

function LeadDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lead", id], queryFn: () => getLead({ data: id }) });
  const [edit, setEdit] = useState(false);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState("");
  const [short, setShort] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const lead = q.data;
  const outreachDrafts = (lead?.drafts ?? []).filter((d) => d.draft_kind !== "followup");
  const followups = (lead?.drafts ?? []).filter((d) => d.draft_kind === "followup");
  const draft = outreachDrafts[0] ?? lead?.drafts[0];

  useEffect(() => {
    if (edit && draft) {
      setEmail(draft.email_draft);
      setForm(draft.contact_form_draft);
      setShort(draft.short_message);
    }
  }, [edit, draft]);

  function invalidate() {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["lead", id] }),
      qc.invalidateQueries({ queryKey: ["leads"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      toast.success(label);
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label);
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading || !lead) {
    return <div className="h-96 animate-pulse rounded-[var(--radius-xl)] bg-surface" />;
  }

  const latest = draft;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/leads" className="text-xs uppercase tracking-[0.14em] text-muted">
            All leads
          </Link>
          <h1 className="mt-2 font-display text-4xl">{lead.business_name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[lead.city, lead.state, lead.country].filter(Boolean).join(" · ")}
            {lead.website ? ` · ${lead.website}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={lead.status} />
          <PriorityBadge priority={lead.priority} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Score</p>
          <p className="mt-1 font-display text-4xl"><ScorePip score={lead.score} /></p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Offer fit</p>
          <p className="mt-2 text-sm">{lead.score_record?.recommended_offer ?? "AI Appointment Assistant"}</p>
          <p className="text-xs text-muted">Value {lead.score_record?.estimated_value ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Contact</p>
          <p className="mt-2 text-sm">{lead.public_phone ?? "No public phone"}</p>
          <p className="text-xs text-muted">{lead.public_email ?? "No public email"}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => run("Pipeline", () => runPipeline({ data: id }))}>
          Run pipeline
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("Audit", () => auditLead({ data: id }))}>
          Run audit
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("Score", () => scoreLeadFn({ data: id }))}>
          Score
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("Draft", () => draftLead({ data: id }))}>
          Generate outreach
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={() => run("Won", () => markWon({ data: { id } }))}>
          Mark as won
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Audit</h2>
          {lead.audit ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Row k="Appointment" v={yn(lead.audit.appointment_available)} />
              <Row k="Chatbot" v={yn(lead.audit.chatbot_present)} />
              <Row k="FAQ" v={yn(lead.audit.faq_present)} />
              <Row k="Lead capture" v={yn(lead.audit.lead_capture_present)} />
              <Row k="After hours" v={yn(lead.audit.after_hours_help)} />
              <Row k="Mobile" v={lead.audit.mobile_experience} />
              <Row k="Website" v={lead.audit.website_status ?? "unknown"} />
              <Row k="Appt flow" v={lead.audit.appointment_flow ?? "unknown"} />
              <Row k="Confidence" v={`${lead.audit.confidence}`} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">Not audited yet.</p>
          )}
          {lead.audit?.observations.length ? (
            <ul className="mt-4 list-disc space-y-1 pl-4 text-sm text-muted">
              {lead.audit.observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : null}
        </Card>
        <Card>
          <h2 className="font-display text-2xl">Why this score</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {(lead.score_record?.reasons ?? []).length === 0 ? (
              <li>No score yet.</li>
            ) : (
              lead.score_record!.reasons.map((r) => <li key={r}>{r}</li>)
            )}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Business & source</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Row k="Category" v={lead.category} />
            <Row k="Source" v={lead.source.replaceAll("_", " ")} />
            <Row k="Website" v={lead.website ?? "None"} />
            <Row k="Domain" v={lead.domain ?? "—"} />
            <Row k="Phone" v={lead.public_phone ?? "—"} />
            <Row k="Email" v={lead.public_email ?? "—"} />
          </dl>
          {(lead.sources ?? []).length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-muted">
              {lead.sources.map((s) => (
                <li key={s.id}>
                  {s.source_name}
                  {s.source_url ? (
                    <>
                      {" · "}
                      <a className="underline-offset-4 hover:underline" href={s.source_url} target="_blank" rel="noreferrer">
                        {s.source_url}
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : lead.source_url ? (
            <p className="mt-3 text-sm">
              <a className="underline-offset-4 hover:underline" href={lead.source_url} target="_blank" rel="noreferrer">
                {lead.source_url}
              </a>
            </p>
          ) : null}
        </Card>
        <Card>
          <h2 className="font-display text-2xl">Opportunity</h2>
          {(lead.opportunities ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted">No verified gap yet. Run the pipeline.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lead.opportunities.map((o) => (
                <li key={o.id}>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-sm text-muted">{o.offer}</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-subtle">
                    {o.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm">{lead.score_record?.recommended_offer ?? "AI Appointment Assistant · $100"}</p>
        </Card>
      </div>

      {lead.audit?.evidence && lead.audit.evidence.length > 0 ? (
        <Card>
          <h2 className="font-display text-2xl">Audit evidence</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {lead.audit.evidence.map((e, i) => (
              <li key={`${e.finding}-${i}`}>
                {e.finding}
                {e.source_url ? (
                  <span className="text-muted">
                    {" · "}
                    <a className="underline-offset-4 hover:underline" href={e.source_url} target="_blank" rel="noreferrer">
                      {e.source_url}
                    </a>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Outreach draft</h2>
          {latest ? (
            <Badge tone={latest.approval_status === "approved" ? "ok" : latest.approval_status === "rejected" ? "danger" : "warn"}>
              {latest.approval_status}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted">
          Nothing is sent automatically. Approve first, then copy the message yourself.
        </p>
        {latest ? (
          <div className="mt-4 space-y-4">
            {edit ? (
              <>
                <Textarea value={email} onChange={(e) => setEmail(e.target.value)} />
                <Textarea value={form} onChange={(e) => setForm(e.target.value)} />
                <Textarea value={short} onChange={(e) => setShort(e.target.value)} />
              </>
            ) : (
              <>
                <CopyBlock title="Email" text={latest.email_draft} />
                <CopyBlock title="Contact form" text={latest.contact_form_draft} />
                <CopyBlock title="Short message" text={latest.short_message} />
              </>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Evidence</p>
              <ul className="mt-2 list-disc pl-4 text-sm text-muted">
                {latest.evidence_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-subtle">Generated {formatDateTime(latest.generated_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!!busy}
                onClick={() =>
                  run("Approved", () =>
                    decideDraft({ data: { draftId: latest.id, leadId: id, action: "approve" } }),
                  )
                }
              >
                Approve
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => setEdit((v) => !v)}>
                {edit ? "Cancel edit" : "Edit"}
              </Button>
              {edit ? (
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    run("Saved edits", () =>
                      decideDraft({
                        data: {
                          draftId: latest.id,
                          leadId: id,
                          action: "edit",
                          email_draft: email,
                          contact_form_draft: form,
                          short_message: short,
                        },
                      }),
                    ).then(() => setEdit(false))
                  }
                >
                  Save edits
                </Button>
              ) : null}
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={() =>
                  run("Rejected", () =>
                    decideDraft({ data: { draftId: latest.id, leadId: id, action: "reject" } }),
                  )
                }
              >
                Reject
              </Button>
              <Button
                variant="outline"
                disabled={!canSendOutreach(latest.approval_status) || !!busy}
                onClick={() =>
                  run("Marked contacted", () => markContacted({ data: { leadId: id, draftId: latest.id } }))
                }
              >
                Mark contacted
              </Button>
              <Button
                variant="outline"
                disabled={!!busy || (lead.status !== "CONTACTED" && lead.status !== "FOLLOW_UP_1")}
                onClick={() => run("Follow-up drafted", () => draftFollowup({ data: id }))}
              >
                Draft follow-up
              </Button>
            </div>
            {!canSendOutreach(latest.approval_status) ? (
              <p className="text-xs text-warn">Sending / marking contacted is locked until approval.</p>
            ) : (
              <p className="text-xs text-ok">Approved. You may copy the message and send it yourself.</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No draft yet. Qualify the lead first.</p>
        )}
      </Card>

      {followups.length > 0 ? (
        <Card>
          <h2 className="font-display text-2xl">Follow-ups</h2>
          <p className="mt-1 text-xs text-muted">Also require human approval. Cap of two.</p>
          <div className="mt-4 space-y-4">
            {followups.map((f) => (
              <div key={f.id} className="rounded-[var(--radius-md)] border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Follow-up {f.sequence || 1}</p>
                  <Badge tone={f.approval_status === "approved" ? "ok" : "warn"}>{f.approval_status}</Badge>
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-sm">{f.email_draft}</pre>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Timeline</h2>
          <ul className="mt-4 space-y-3">
            {(lead.events ?? []).length === 0 ? (
              <li className="text-sm text-muted">No events yet.</li>
            ) : (
              lead.events.map((ev) => (
                <li key={ev.id} className="border-b border-border pb-2 last:border-0">
                  <p className="text-sm">{ev.message}</p>
                  <p className="text-xs text-subtle">{formatDateTime(ev.created_at)}</p>
                </li>
              ))
            )}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-2xl">Revenue</h2>
          {lead.revenue ? (
            <p className="mt-3 font-display text-3xl">{lead.revenue.offer} · recorded {formatDateTime(lead.revenue.won_at)}</p>
          ) : (
            <p className="mt-3 text-sm text-muted">No payment recorded. Mark as won after they pay $100.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-2xl">Pipeline status</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-[0.12em] text-muted" htmlFor="lead-status">
            Move to
          </label>
          <select
            id="lead-status"
            className="h-11 min-w-48 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
            value={lead.status}
            onChange={(e) =>
              run(`Status ${e.target.value}`, () =>
                changeLeadStatus({ data: { id, status: e.target.value as LeadStatus } }),
              )
            }
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("Response saved", () => saveLeadResponse({ data: { id, response } }));
          }}
        >
          <Textarea
            placeholder="Log a reply from the clinic"
            value={response || lead.response || ""}
            onChange={(e) => setResponse(e.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm">Save response</Button>
        </form>
        {lead.notes ? <p className="mt-3 text-sm text-muted">{lead.notes}</p> : null}
        {lead.is_demo ? <p className="mt-3 text-xs uppercase tracking-[0.12em] text-subtle">Demo record</p> : null}
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function yn(v: boolean | null) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{title}</p>
        <button
          type="button"
          className="text-xs text-muted hover:text-fg"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            toast.success("Copied");
          }}
        >
          Copy message
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm leading-relaxed">
        {text}
      </pre>
    </div>
  );
}
