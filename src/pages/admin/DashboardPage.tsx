import { useAllOrderProgress } from "../../hooks/useOrders";
import { buildFleetStats } from "../../lib/progress";
import { StatCard } from "../../components/ui/StatCard";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Loader } from "../../components/ui/Loader";
import { OrderCard } from "../../components/dashboard/OrderCard";
import { DeliveryReminderList } from "../../components/dashboard/DeliveryReminderList";

export function DashboardPage() {
  const { bundles, isLoading, isError } = useAllOrderProgress();

  if (isLoading) return <Loader full label="Loading dashboard…" />;
  if (isError) {
    return (
      <p className="text-sm text-status-bad">
        Couldn't load orders. Check your Supabase connection in .env.
      </p>
    );
  }

  const stats = buildFleetStats(bundles.map((b) => b.progress));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-500">Fleet-wide view of every order in production.</p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Orders" value={stats.totalOrders} icon="📦" />
          <StatCard label="On Track" value={stats.onTrack} tone="good" icon="✓" />
          <StatCard label="Due Soon" value={stats.dueSoon} tone="warn" icon="⏱" />
          <StatCard label="Delayed" value={stats.delayed} tone="bad" icon="⚠" />
          <StatCard label="Stages Completed" value={stats.totalCompletedStages} tone="brand" icon="🏁" />
          <StatCard label="Stages Pending" value={stats.totalPendingStages} tone="warn" icon="⧗" />
        </div>
      </section>

      <section>
        <Card>
          <CardHeader title="Delivery Reminders" subtitle="Nearest deadlines across every active order" />
          <CardBody>
            <DeliveryReminderList bundles={bundles} />
          </CardBody>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">All Orders</h2>
          <span className="text-xs text-ink-400">{bundles.length} total</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bundles.map((bundle) => (
            <OrderCard key={bundle.order.id} bundle={bundle} />
          ))}
        </div>
      </section>
    </div>
  );
}
