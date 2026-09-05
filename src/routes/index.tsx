import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui";
import { ShieldCheck, ScanSearch, Scale, PenLine } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

const STEPS = [
  {
    icon: ScanSearch,
    title: "Scout",
    body: "Collect permitted public clinic records. Deduplicate. Reject junk.",
  },
  {
    icon: Scale,
    title: "Audit & score",
    body: "Check the public site for booking, FAQ, chat, and after-hours help. Score 0–100 with reasons.",
  },
  {
    icon: PenLine,
    title: "Draft",
    body: "Write outreach from verified observations only. Nothing is sent.",
  },
  {
    icon: ShieldCheck,
    title: "Human approval",
    body: "Approve, edit, or reject. Copy the message yourself. Anti-spam by design.",
  },
];

function Home() {
  const { isPending } = useCurrentUserState();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-[10px] border border-border">
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            </svg>
          </span>
          <span className="font-display text-lg">Lead Hunter</span>
        </Link>
        <div className="flex items-center gap-3">
          {isPending ? (
            <div className="h-11 w-24 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
          ) : (
            <>
              <SignedOut>
                <Link to="/login">
                  <Button variant="ghost">Sign in</Button>
                </Link>
              </SignedOut>
              <SignedIn>
                <Link to="/dashboard">
                  <Button>Open dashboard</Button>
                </Link>
              </SignedIn>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 md:pt-20">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          Find better business opportunities with AI
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.1] tracking-[-0.03em] md:text-6xl">
          Find clinics that actually need an assistant.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
          AI Lead Hunter scouts public business information, audits the website, scores the
          fit, and drafts a short note. A person must approve every message. This is not a spam
          bot.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {isPending ? (
            <div className="h-12 w-40 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
          ) : (
            <>
              <SignedOut>
                <Link to="/login">
                  <Button size="lg">Start hunting</Button>
                </Link>
              </SignedOut>
              <SignedIn>
                <Link to="/dashboard">
                  <Button size="lg">Go to dashboard</Button>
                </Link>
              </SignedIn>
            </>
          )}
          <Link to="/demo">
            <Button size="lg" variant="secondary">
              Try the clinic assistant
            </Button>
          </Link>
        </div>

        <section className="mt-20 grid gap-4 md:grid-cols-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <article key={s.title} className="rounded-[var(--radius-xl)] border border-border bg-surface p-6">
                <Icon className="size-5 text-muted" />
                <h2 className="mt-4 font-display text-2xl">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-16 rounded-[var(--radius-xl)] border border-border bg-surface p-6 md:p-10">
          <h2 className="font-display text-3xl">What we sell</h2>
          <p className="mt-3 max-w-2xl text-muted">
            An AI Appointment Assistant for dental clinics. It answers hours, location, and
            approved service FAQs, collects appointment requests, and never diagnoses.
            One-time setup: $100.
          </p>
          <ul className="mt-6 grid gap-2 text-sm text-fg md:grid-cols-2">
            {[
              "Answer basic business FAQs",
              "Collect name and contact information",
              "Notify the clinic of a new request",
              "Never provide medical advice",
            ].map((item) => (
              <li key={item} className="flex h-11 items-center rounded-[var(--radius-md)] bg-surface-2 px-3">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
