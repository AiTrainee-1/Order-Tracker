import type { UnitBreakdown } from "../../lib/progress";
import { Badge } from "../ui/Badge";
import { Table } from "../ui/Table";
import { formatDisplayDate } from "../../lib/workflow";

export function MultiUnitSplitTable({ units }: { units: UnitBreakdown[] }) {
  return (
    <Table
      keyFor={(u) => u.unitName}
      rows={units}
      emptyMessage="No unit/vendor movement recorded for this stage yet."
      columns={[
        {
          header: "Unit / Vendor",
          render: (u) => (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink-900">{u.unitName}</span>
              {u.isExternal && <Badge tone="external">External</Badge>}
              {u.transferLabel && <Badge tone="external">{u.transferLabel}</Badge>}
            </div>
          ),
        },
        {
          header: "Records",
          render: (u) => (
            <span className="font-medium text-ink-700">
              {u.entryCount} {u.entryCount === 1 ? "entry" : "entries"}
            </span>
          ),
        },
        { header: "Allotted", render: (u) => (u.qtyReceived > 0 ? u.qtyReceived.toLocaleString() : "—") },
        {
          header: "Forwarded",
          render: (u) => <span className="font-semibold text-ink-900">{u.qtyForwarded.toLocaleString()}</span>,
        },
        {
          header: "Shortage",
          render: (u) =>
            u.qtyShortage > 0 ? (
              <span className="font-medium text-status-shortage">{u.qtyShortage.toLocaleString()}</span>
            ) : (
              "—"
            ),
        },
        {
          header: "Rejected",
          render: (u) =>
            u.qtyRejected > 0 ? (
              <span className="font-medium text-status-rejected">{u.qtyRejected.toLocaleString()}</span>
            ) : (
              "—"
            ),
        },
        { header: "Returned", render: (u) => (u.qtyReturned > 0 ? u.qtyReturned.toLocaleString() : "—") },
        {
          header: "Status",
          render: (u) => (
            <Badge tone={u.isCompleted ? "good" : "warn"}>
              {u.isCompleted ? "Completed" : "In progress"}
            </Badge>
          ),
        },
        { header: "Last Update", render: (u) => formatDisplayDate(u.lastEntryDate) },
      ]}
    />
  );
}
