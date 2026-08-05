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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-500">Fleet-wide view of every order in production.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Orders" value={stats.totalOrders} />
        <StatCard label="On Track" value={stats.onTrack} tone="good" />
        <StatCard label="Due Soon" value={stats.dueSoon} tone="warn" />
        <StatCard label="Delayed" value={stats.delayed} tone="bad" />
        <StatCard label="Stages Completed" value={stats.totalCompletedStages} tone="good" />
        <StatCard label="Stages Pending" value={stats.totalPendingStages} tone="warn" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">All Orders</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {bundles.map((bundle) => (
              <OrderCard key={bundle.order.id} bundle={bundle} />
            ))}
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader title="Delivery Reminders" subtitle="Nearest deadlines first" />
          <CardBody>
            <DeliveryReminderList bundles={bundles} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
