import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Bot,
  ListTodo,
  Settings,
  MessageSquare,
  Menu,
  Sun,
  Moon,
  Radio,
  Landmark,
  FlaskConical,
  Megaphone,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { Button } from "../ui";
import { useTheme } from "../theme";
import { bootstrapWorkspace } from "@/lib/server/fns";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/sources", label: "Sources", icon: Radio },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/revenue", label: "Revenue", icon: Landmark },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/demo", label: "Demo", icon: MessageSquare },
] as const;

function Mark() {
  return (
    <span className="grid size-8 place-items-center rounded-[10px] border border-border bg-surface-2">
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClick}
            className={cn(
              "flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors duration-[var(--motion-quick)]",
              active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const boot = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => bootstrapWorkspace(),
    enabled: Boolean(user),
  });
  const demo = boot.data?.profile.demo_mode;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface p-4 md:flex">
        <Link to="/dashboard" className="mb-8 flex items-center gap-3 px-1">
          <Mark />
          <div>
            <p className="font-display text-base leading-tight">Lead Hunter</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Quality over volume</p>
          </div>
        </Link>
        <NavLinks />
        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <p className="px-1 text-[11px] leading-relaxed text-subtle">
            Human approval required before any outreach.
          </p>
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-bg/70"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface p-4">
            <div className="mb-6 flex items-center gap-3">
              <Mark />
              <p className="font-display">Lead Hunter</p>
            </div>
            <NavLinks onClick={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-sm">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
          {demo ? (
            <span className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-warn">
              Demo mode
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {isPending ? (
              <div className="size-8 animate-pulse rounded-full bg-surface-2" />
            ) : user ? (
              <UserButton />
            ) : null}
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface/95 px-1 py-1 backdrop-blur md:hidden">
        {NAV.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
