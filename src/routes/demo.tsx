import { createFileRoute, Link } from "@tanstack/react-router";
import { AppointmentAssistant } from "@/components/assistant";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/demo")({ component: DemoPage });

function DemoPage() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-8 text-fg md:px-8">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Prospect demo</p>
          <h1 className="mt-3 font-display text-4xl leading-tight">The clinic assistant you sell.</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            This is the product behind the $100 setup. It answers hours, location, and listed
            services, and collects appointment requests. It will refuse diagnosis or treatment
            questions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/dashboard">
              <Button>Open lead dashboard</Button>
            </Link>
            <Link to="/">
              <Button variant="secondary">Home</Button>
            </Link>
          </div>
        </div>
        <AppointmentAssistant />
      </div>
    </div>
  );
}
