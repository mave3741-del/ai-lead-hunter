import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listRevenue } from "@/lib/server/fns";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_app/revenue")({ component: RevenuePage });

function RevenuePage() {
  const q = useQuery({ queryKey: ["revenue"], queryFn: () => listRevenue() });
  const data = q.data;
  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Scoreboard</p>
        <h1 className="font-display text-4xl">Revenue</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Net (won)</p>
          <p className="mt-2 font-display text-3xl">{formatMoney(data?.total ?? 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Customers</p>
          <p className="mt-2 font-display text-3xl">{data?.customers ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Avg deal</p>
          <p className="mt-2 font-display text-3xl">
            {formatMoney(data && data.customers ? data.total / data.customers : 0)}
          </p>
        </Card>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-[0.08em] text-muted">
            <tr>
              {["Clinic", "Offer", "Revenue", "Won"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No customers yet. Mark a qualified lead as won after they pay $100.
                </td>
              </tr>
            ) : (
              data!.rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">{r.business_name}</td>
                  <td className="px-4 py-3 text-muted">{r.offer}</td>
                  <td className="px-4 py-3">{formatMoney(r.revenue, r.currency)}</td>
                  <td className="px-4 py-3 text-muted">{new Date(r.won_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
