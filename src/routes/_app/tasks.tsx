import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listTasks } from "@/lib/server/fns";
import { Badge, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/tasks")({ component: TasksPage });

function TasksPage() {
  const q = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks() });
  const tasks = q.data ?? [];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Audit log</p>
        <h1 className="font-display text-4xl">Tasks</h1>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium capitalize">{t.agent_type}</p>
                <p className="text-xs text-subtle">{formatDateTime(t.created_at)}</p>
              </div>
              <Badge
                tone={
                  t.status === "completed" ? "ok" : t.status === "failed" ? "danger" : t.status === "running" ? "info" : "neutral"
                }
              >
                {t.status}
              </Badge>
            </div>
            {t.error ? <p className="mt-2 text-sm text-danger">{t.error}</p> : null}
            {t.lead_id ? (
              <Link to="/leads/$id" params={{ id: t.lead_id }} className="mt-2 inline-block text-xs underline-offset-4 hover:underline">
                View lead
              </Link>
            ) : null}
            <p className="mt-2 text-xs text-subtle">Retries {t.retry_count}</p>
          </Card>
        ))}
        {tasks.length === 0 && !q.isLoading ? (
          <p className="text-sm text-muted">No tasks yet. Run Scout from the Agents page.</p>
        ) : null}
      </div>
    </div>
  );
}
