import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppShell } from "@/components/layout/app-shell";
import { bootstrapWorkspace } from "@/lib/server/fns";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  useEffect(() => {
    if (user) void bootstrapWorkspace();
  }, [user]);
  if (isPending) {
    return (
      <div className="min-h-dvh bg-bg p-6">
        <div className="h-14 animate-pulse rounded-[var(--radius-lg)] bg-surface" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[var(--radius-xl)] bg-surface" />
          ))}
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
