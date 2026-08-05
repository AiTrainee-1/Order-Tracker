import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAssignments } from "../../hooks/useAssignments";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useCreateStageEntry, useRecentStageEntries } from "../../hooks/useStageEntries";
import { useWorkflowStages } from "../../hooks/useWorkflowStages";
import { useUsers } from "../../hooks/useUsers";
import { useToast } from "../../context/ToastContext";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Input } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { Loader } from "../../components/ui/Loader";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { GarmentPlaceholder } from "../../components/ui/GarmentPlaceholder";
import { publicImageUrl } from "../../lib/supabaseClient";
import { StageEntryForm, type StageEntryFormValues } from "../../components/forms/StageEntryForm";
import { formatDisplayDate } from "../../lib/workflow";
import type { AssignmentWithDetails } from "../../lib/types";

const PAGE_SIZE = 8;

function matchesQuery(a: AssignmentWithDetails, query: string): boolean {
  if (!query) return true;
  const haystack = [a.order?.style, a.order?.io_no, a.order?.color, a.section?.label, a.po?.po_number]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function DataInputPage() {
  const { appUser } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(appUser?.id);
  const { data: ordersData } = useOrdersList();
  const { data: stages } = useWorkflowStages();
  const { data: users } = useUsers();
  const createEntry = useCreateStageEntry();

  const [selectedAssignmentId, setSelectedAssignmentId] = useState(searchParams.get("assignment") ?? "");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("assignment");
    if (fromUrl && fromUrl !== selectedAssignmentId) setSelectedAssignmentId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const allAssignments = useMemo(() => assignments ?? [], [assignments]);
  const selected = allAssignments.find((a) => a.id === selectedAssignmentId);

  const filtered = useMemo(
    () => allAssignments.filter((a) => matchesQuery(a, query)),
    [allAssignments, query],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function selectAssignment(id: string) {
    setSelectedAssignmentId(id);
    setSubmitError(null);
    setSearchParams(id ? { assignment: id } : {});
  }

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  const purchaseOrdersForOrder = useMemo(
    () => (ordersData?.purchaseOrders ?? []).filter((p) => p.order_id === selected?.order_id),
    [ordersData, selected],
  );

  const nextStage = useMemo(() => {
    if (!selected?.section || !stages) return undefined;
    return stages.find((s) => s.sequence_no === selected.section!.sequence_no + 1);
  }, [selected, stages]);

  const possibleRecipients = useMemo(
    () => (users ?? []).filter((u) => u.is_active && u.id !== appUser?.id),
    [users, appUser],
  );

  const recentEntries = useRecentStageEntries(selected?.order_id, selected?.section_id);

  if (assignmentsLoading) return <Loader full label="Loading your assignments…" />;

  async function handleSubmit(values: StageEntryFormValues) {
    if (!selected || !appUser) return;
    setSubmitError(null);
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
        forwarded_to_user_id: values.forwarded_to_user_id,
      });
      toast.success("Entry saved — the Admin dashboard has been updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save entry.";
      setSubmitError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Data Input</h1>
        <p className="text-sm text-ink-500">Find an order to log today's production movement.</p>
      </div>

      {allAssignments.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">
              You have no assignments yet. Contact your Admin.
            </p>
          </CardBody>
        </Card>
      ) : selected ? (
        <Card glass className="border-indigo-100/60 bg-gradient-to-br from-indigo-50/60 to-white">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                {publicImageUrl(selected.order?.image_path) ? (
                  <img
                    src={publicImageUrl(selected.order?.image_path)!}
                    alt={selected.order?.style}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <GarmentPlaceholder className="h-5 w-5 text-ink-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {selected.order?.style} — {selected.section?.label}
                </p>
                <p className="truncate text-xs text-ink-500">
                  IO {selected.order?.io_no} · {selected.order?.color}
                  {selected.po ? ` · PO ${selected.po.po_number}` : ""}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => selectAssignment("")}>
              Change Order
            </Button>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody>
              <Input
                label="Find an order"
                placeholder="Type a style, IO number, color, PO, or section…"
                value={query}
                onChange={(e) => updateQuery(e.target.value)}
                autoFocus
              />
            </CardBody>
          </Card>

          <p className="text-xs text-ink-500">
            {filtered.length} matching assignment{filtered.length === 1 ? "" : "s"}
          </p>

          <div className="space-y-2">
            {pageItems.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => selectAssignment(a.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 text-left shadow-card transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {a.order?.style} — {a.section?.label}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    IO {a.order?.io_no} · {a.order?.color}
                    {a.po ? ` · PO ${a.po.po_number}` : ""}
                  </p>
                </div>
                <Badge tone={a.can_enter_data ? "neutral" : "info"}>
                  {a.can_enter_data ? "Entry" : "Monitor"}
                </Badge>
              </button>
            ))}
            {filtered.length === 0 && (
              <Card>
                <CardBody>
                  <p className="text-sm text-ink-500">No assignments match your search.</p>
                </CardBody>
              </Card>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                ← Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}

      {selected && selected.can_enter_data && (
        <Card>
          <CardHeader
            title="Log Production Movement"
            subtitle="All fields save directly to the Admin dashboard"
            action={<Badge tone="brand">{selected.section?.unit_type}</Badge>}
          />
          <CardBody>
            <StageEntryForm
              unitType={selected.section?.unit_type ?? "PCS"}
              purchaseOrders={purchaseOrdersForOrder}
              lockedPoId={selected.po_id}
              possibleRecipients={possibleRecipients}
              nextStageLabel={nextStage?.label}
              onSubmit={handleSubmit}
              submitting={createEntry.isPending}
              error={submitError}
            />
          </CardBody>
        </Card>
      )}

      {selected && !selected.can_enter_data && (
        <Card>
          <CardBody>
            <p className="rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-700">
              You have monitor-only access to this section — you can review its status and history
              below, but only an assigned data-entry user can submit updates.
            </p>
          </CardBody>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader title="Recent Entries" subtitle="Last 20 submissions for this section" />
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
