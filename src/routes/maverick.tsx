import { createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

export const Route = createFileRoute("/maverick")({
  component: MaverickDownloads,
  head: () => ({
    meta: [
      { title: "Maverick Downloadable Projects" },
      {
        name: "description",
        content: "Personal archive of Maverick’s project source ZIPs.",
      },
    ],
  }),
});

const PROJECTS = [
  {
    slug: "ai-lead-hunter",
    name: "AI Lead Hunter",
    file: "/ai-lead-hunter.zip",
    filename: "ai-lead-hunter.zip",
    size: "469 KB",
    files: "131 files",
    kind: "Source release",
    year: "2026",
    blurb:
      "Production MVP that finds US dental clinics, audits public websites, scores fit, and drafts outreach. Human approval required. Not a spam bot.",
  },
];

function MaverickDownloads() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-xl px-5 py-10 md:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Archive 001</p>
        <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-[-0.04em]">
          Maverick
        </h1>
        <p className="mt-2 font-display text-2xl text-muted">Downloadable projects</p>
        <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
          Source ZIPs of finished work. Separate from any live app. Tap download, save the file.
        </p>

        <ol className="mt-12 space-y-6">
          {PROJECTS.map((p, i) => (
            <li key={p.slug}>
              <article className="border-t border-border pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[11px] tabular-nums text-subtle">
                    {String(i + 1).padStart(2, "0")} / {p.year}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    {p.kind}
                  </p>
                </div>
                <h2 className="mt-3 font-display text-3xl tracking-[-0.03em]">{p.name}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.blurb}</p>
                <p className="mt-4 font-mono text-xs text-subtle">
                  {p.filename} · {p.size} · {p.files}
                </p>
                <a
                  href={p.file}
                  download={p.filename}
                  className={cn(buttonVariants({ size: "lg" }), "mt-6 min-h-12 w-full")}
                >
                  <Download className="size-4" />
                  Download ZIP
                </a>
              </article>
            </li>
          ))}
        </ol>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-subtle">
          Maverick Downloadable Projects · files only, no account required
        </footer>
      </div>
    </div>
  );
}
