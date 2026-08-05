import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAssignments } from "../../hooks/useAssignments";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useCreateStageEntry, useRecentStageEntries } from "../../hooks/useStageEntries";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Select } from "../../components/ui/FormControls";
import { Loader } from "../../components/ui/Loader";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { StageEntryForm, type StageEntryFormValues } from "../../components/forms/StageEntryForm";
import { formatDisplayDate } from "../../lib/workflow";

export function DataInputPage() {
  const { appUser } = useAuth();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(appUser?.id);
  const { data: ordersData } = useOrdersList();
  const createEntry = useCreateStageEntry();

  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const enterableAssignments = useMemo(
    () => (assignments ?? []).filter((a) => a.can_enter_data),
    [assignments],
  );

  const selected = enterableAssignments.find((a) => a.id === selectedAssignmentId);
  const purchaseOrdersForOrder = useMemo(
    () => (ordersData?.purchaseOrders ?? []).filter((p) => p.order_id === selected?.order_id),
    [ordersData, selected],
  );

  const recentEntries = useRecentStageEntries(selected?.order_id, selected?.section_id);

  if (assignmentsLoading) return <Loader full label="Loading your assignments…" />;

  async function handleSubmit(values: StageEntryFormValues) {
    if (!selected || !appUser) return;
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await createEntry.mutateAsync({
        order_id: selected.order_id,
        po_id: values.po_id,
        section_id: selected.section_id,
        entry_date: values.entry_date,
        unit_type: selected.section?.unit_type ?? "PCS",
        qty_received: values.qty_received,
        qty_completed_today: values.qty_completed_today,
        qty_forwarded: values.qty_forwarded,
        qty_shortage: values.qty_shortage,
        qty_rejected: values.qty_rejected,
        qty_returned: values.qty_returned,
        is_external: values.is_external,
        external_unit_name: values.external_unit_name || null,
        is_sent_outside: values.is_sent_outside,
        is_returned: values.is_returned,
        is_completed: values.is_completed,
        branch: values.branch || null,
        unit_name: values.unit_name || selected.unit_name || null,
        notes: values.notes || null,
        entered_by: appUser.id,
      });
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save entry.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Data Input</h1>
        <p className="text-sm text-ink-500">Select an order to log today's production movement.</p>
      </div>

      <Card>
        <CardBody>
          <Select
            label="Assigned Order & Section"
            value={selectedAssignmentId}
            onChange={(e) => {
              setSelectedAssignmentId(e.target.value);
              setSubmitSuccess(false);
              setSubmitError(null);
            }}
          >
            <option value="">Select order…</option>
            {enterableAssignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.order?.style} — {a.order?.color} · {a.section?.label}
                {a.po ? ` · PO ${a.po.po_number}` : ""}
              </option>
            ))}
          </Select>
          {enterableAssignments.length === 0 && (
            <p className="mt-2 text-sm text-ink-500">
              You have no data-entry assignments yet. Contact your Admin.
            </p>
          )}
        </CardBody>
      </Card>

      {selected && (
        <Card>
          <CardHeader
            title={`${selected.order?.style} — ${selected.section?.label}`}
            subtitle={`IO ${selected.order?.io_no} · ${selected.order?.color}${selected.po ? ` · PO ${selected.po.po_number}` : ""}`}
          />
          <CardBody>
            {submitSuccess && (
              <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-status-good">
                Entry saved. The Admin dashboard has been updated.
              </p>
            )}
            <StageEntryForm
              unitType={selected.section?.unit_type ?? "PCS"}
              purchaseOrders={purchaseOrdersForOrder}
              lockedPoId={selected.po_id}
              onSubmit={handleSubmit}
              submitting={createEntry.isPending}
              error={submitError}
            />
          </CardBody>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader title="Your Recent Entries" subtitle="Last 20 submissions for this section" />
          <CardBody>
            {recentEntries.isLoading ? (
              <Loader label="Loading recent entries…" />
            ) : (
              <Table
                keyFor={(e) => e.id}
                rows={recentEntries.data ?? []}
                emptyMessage="No entries submitted yet."
                columns={[
                  { header: "Date", render: (e) => formatDisplayDate(e.entry_date) },
                  { header: "Completed", render: (e) => e.qty_completed_today.toLocaleString() },
                  { header: "Forwarded", render: (e) => e.qty_forwarded.toLocaleString() },
                  { header: "Shortage", render: (e) => e.qty_shortage.toLocaleString() },
                  { header: "Rejected", render: (e) => e.qty_rejected.toLocaleString() },
                  {
                    header: "Status",
                    render: (e) => (
                      <Badge tone={e.is_completed ? "good" : "warn"}>
                        {e.is_completed ? "Completed" : "In progress"}
                      </Badge>
                    ),
                  },
                ]}
              />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
