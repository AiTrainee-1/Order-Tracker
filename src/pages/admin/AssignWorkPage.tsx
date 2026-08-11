import { useMemo, useState } from "react";
import { useUsers } from "../../hooks/useUsers";
import { useOrdersList } from "../../hooks/useOrdersList";
import { useWorkflowStages } from "../../hooks/useWorkflowStages";
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
} from "../../hooks/useAssignments";
import { useStageAssignments } from "../../hooks/useStageAssignments";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Select, Input, Toggle } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";
import { useToast } from "../../context/ToastContext";
import { Link } from "react-router-dom";
import type { AppUser, AssignmentWithDetails, StageAssignment, WorkflowStage } from "../../lib/types";

export function AssignWorkPage() {
  const toast = useToast();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: ordersData, isLoading: ordersLoading } = useOrdersList();
  const { data: stages, isLoading: stagesLoading } = useWorkflowStages();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: stageDefaults } = useStageAssignments();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const [userId, setUserId] = useState("");
  const [ioNo, setIoNo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [sectionIds, setSectionIds] = useState<Set<string>>(new Set());
  const [unitName, setUnitName] = useState("");
  const [canEnterData, setCanEnterData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orders = useMemo(() => ordersData?.orders ?? [], [ordersData]);

  const ioNumbers = useMemo(() => Array.from(new Set(orders.map((o) => o.io_no))), [orders]);
  const ordersForIo = useMemo(() => orders.filter((o) => o.io_no === ioNo), [orders, ioNo]);

  // Sections this exact user is already assigned to on this order -  pre-checked
  // (and locked) so the admin never re-assigns the same scope.
  const existingForUserOrder = useMemo(
    () => (assignments ?? []).filter((a) => a.user_id === userId && a.order_id === orderId),
    [assignments, userId, orderId],
  );
  const alreadyAssignedSectionIds = useMemo(
    () => new Set(existingForUserOrder.map((a) => a.section_id)),
    [existingForUserOrder],
  );

  // Everyone (any user) assigned to each section of the selected order -  powers
  // the per-section "who's on this" tooltip. `assignments` already embeds
  // user + po + section for the admin.
  const assigneesBySection = useMemo(() => {
    const map = new Map<string, AssignmentWithDetails[]>();
    for (const a of assignments ?? []) {
      if (a.order_id !== orderId) continue;
      map.set(a.section_id, [...(map.get(a.section_id) ?? []), a]);
    }
    return map;
  }, [assignments, orderId]);

  const usersById = useMemo(() => {
    const map = new Map<string, AppUser>();
    for (const u of users ?? []) map.set(u.id, u);
    return map;
  }, [users]);

  // Global stage-role defaults per section (apply to all orders). Shown in the
  // section tooltip, and -  for the selected user -  lock the section as covered.
  const defaultsBySection = useMemo(() => {
    const map = new Map<string, StageAssignment[]>();
    for (const sa of stageDefaults ?? []) map.set(sa.section_id, [...(map.get(sa.section_id) ?? []), sa]);
    return map;
  }, [stageDefaults]);
  const userDefaultSectionIds = useMemo(
    () => new Set((stageDefaults ?? []).filter((sa) => sa.user_id === userId).map((sa) => sa.section_id)),
    [stageDefaults, userId],
  );

  // Numeric (not alphabetical) order-by-number, so "9/26" sorts before "10/26".
  const ordersInSequence = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const numA = parseInt(a.io_no, 10) || 0;
        const numB = parseInt(b.io_no, 10) || 0;
        return numA - numB || a.style.localeCompare(b.style);
      }),
    [orders],
  );

  function handleQuickSelect(selectedOrderId: string) {
    const order = orders.find((o) => o.id === selectedOrderId);
    if (!order) return;
    setIoNo(order.io_no);
    setOrderId(order.id);
  }

  const isLoading = usersLoading || ordersLoading || stagesLoading || assignmentsLoading;
  if (isLoading) return <Loader full label="Loading assignment data…" />;

  function toggleSection(id: string) {
    setSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!userId || !orderId || sectionIds.size === 0) {
      setError("Select a user, an order, and at least one new section.");
      return;
    }
    // Data entry is order-wide, never PO-scoped -  every assignment covers the
    // whole order (po_id: null). Skip sections this user already has, or
    // covers via a global stage-role default.
    const existingSectionIds = new Set(existingForUserOrder.map((a) => a.section_id));
    const jobs = Array.from(sectionIds)
      .filter((sectionId) => !userDefaultSectionIds.has(sectionId) && !existingSectionIds.has(sectionId))
      .map((sectionId) =>
        createAssignment.mutateAsync({
          user_id: userId,
          order_id: orderId,
          po_id: null,
          section_id: sectionId,
          unit_name: unitName || null,
          can_enter_data: canEnterData,
        }),
      );
    if (jobs.length === 0) {
      setError("Every selected section is already assigned to this user.");
      return;
    }
    try {
      await Promise.all(jobs);
      setSuccess(`Created ${jobs.length} assignment(s) successfully.`);
      toast.success(`Created ${jobs.length} assignment(s) successfully.`);
      setSectionIds(new Set());
      setUnitName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save assignment.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Assign Work</h1>
        <p className="text-sm text-ink-500">
          Scope exactly which order and section a user is responsible for. Data entry always covers
          the whole order -  every PO under it combined -  not a single PO.
        </p>
      </div>

      <Card>
        <CardHeader title="New Assignment" />
        <CardBody className="space-y-5">
          <Select
            label="Quick Select Order (number-wise)"
            value={orderId}
            onChange={(e) => handleQuickSelect(e.target.value)}
          >
            <option value="">Jump to an order…</option>
            {ordersInSequence.map((o, index) => (
              <option key={o.id} value={o.id}>
                {index + 1}. IO {o.io_no} -  {o.style} -  {o.color}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select user…</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </Select>

            <Select
              label="IO / No"
              value={ioNo}
              onChange={(e) => {
                setIoNo(e.target.value);
                setOrderId("");
              }}
            >
              <option value="">Select IO/No…</option>
              {ioNumbers.map((io) => (
                <option key={io} value={io}>
                  {io}
                </option>
              ))}
            </Select>

            <Select
              label="Style / Color"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={!ioNo}
            >
              <option value="">Select style/color…</option>
              {ordersForIo.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.style} -  {o.color}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-ink-700">
                Section(s) -  numbered in actual production sequence
              </p>
              <p className="text-xs text-ink-400">Hover a section to see who's already on it</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...(stages ?? [])]
                .sort((a, b) => a.sequence_no - b.sequence_no)
                .map((s) => (
                  <SectionRow
                    key={s.id}
                    stage={s}
                    checked={
                      alreadyAssignedSectionIds.has(s.id) ||
                      userDefaultSectionIds.has(s.id) ||
                      sectionIds.has(s.id)
                    }
                    alreadyAssigned={alreadyAssignedSectionIds.has(s.id)}
                    coveredByDefault={userDefaultSectionIds.has(s.id)}
                    onToggle={() => toggleSection(s.id)}
                    assignees={assigneesBySection.get(s.id) ?? []}
                    defaults={defaultsBySection.get(s.id) ?? []}
                    usersById={usersById}
                  />
                ))}
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Stages a user covers via a global default are marked{" "}
              <span className="font-medium text-ink-500">Default</span> and don't need per-order
              assignment. Manage those on the{" "}
              <Link to="/admin/stage-roles" className="font-medium text-brand hover:text-brand-dark">
                Stage Roles
              </Link>{" "}
              page.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Unit / Vendor Name (optional)"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              placeholder="e.g. Unit 1, ABC Subcontractor"
            />
            <div className="flex items-end">
              <Toggle
                checked={canEnterData}
                onChange={setCanEnterData}
                label="Can Enter Data"
                description="Turn off for monitor-only access to this scope."
              />
            </div>
          </div>

          {error && <p className="text-sm text-status-bad">{error}</p>}
          {success && <p className="text-sm text-status-good">{success}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} isLoading={createAssignment.isPending}>
              Save Assignment
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Existing Assignments" subtitle={`${assignments?.length ?? 0} total`} />
        <CardBody>
          <Table
            keyFor={(a) => a.id}
            rows={assignments ?? []}
            columns={[
              { header: "User", render: (a) => a.user?.name ?? "- " },
              {
                header: "Order",
                render: (a) => (
                  <div>
                    <p className="font-medium text-ink-900">{a.order?.style}</p>
                    <p className="text-xs text-ink-500">
                      IO {a.order?.io_no} · {a.order?.color}
                    </p>
                  </div>
                ),
              },
              { header: "PO", render: (a) => a.po?.po_number ?? "All POs" },
              { header: "Section", render: (a) => a.section?.label ?? "- " },
              { header: "Unit", render: (a) => a.unit_name ?? "- " },
              {
                header: "Access",
                render: (a) => (
                  <Badge tone={a.can_enter_data ? "neutral" : "info"}>
                    {a.can_enter_data ? "Can Enter Data" : "Monitor Only"}
                  </Badge>
                ),
              },
              {
                header: "",
                render: (a) => (
                  <Button variant="ghost" size="sm" onClick={() => deleteAssignment.mutate(a.id)}>
                    Remove
                  </Button>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function SectionRow({
  stage,
  checked,
  alreadyAssigned,
  coveredByDefault,
  onToggle,
  assignees,
  defaults,
  usersById,
}: {
  stage: WorkflowStage;
  checked: boolean;
  alreadyAssigned: boolean;
  coveredByDefault: boolean;
  onToggle: () => void;
  assignees: AssignmentWithDetails[];
  defaults: StageAssignment[];
  usersById: Map<string, AppUser>;
}) {
  const locked = alreadyAssigned || coveredByDefault;
  const hasTooltip = assignees.length > 0 || defaults.length > 0;

  return (
    <div className="group relative flex items-center justify-between gap-2 rounded-lg border border-ink-100 px-2.5 py-2">
      <label
        className={`flex min-w-0 items-center gap-2 text-sm ${
          locked ? "text-ink-400" : "cursor-pointer text-ink-700"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 rounded border border-ink-300 text-brand focus:ring-brand disabled:opacity-60"
        />
        <span className="truncate leading-tight">
          {stage.sequence_no}. {stage.label}
        </span>
      </label>
      <div className="flex shrink-0 items-center gap-1.5">
        {coveredByDefault && <Badge tone="brand">Default</Badge>}
        {alreadyAssigned && !coveredByDefault && <Badge tone="info">Assigned</Badge>}
        {assignees.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-100 px-1 text-[10px] font-semibold text-ink-600">
            {assignees.length}
          </span>
        )}
      </div>

      {hasTooltip && (
        <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-ink-100 bg-white p-3 text-left opacity-0 shadow-popover transition-opacity group-hover:block group-hover:opacity-100">
          {defaults.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand">
                Default -  all orders
              </p>
              <ul className="space-y-1">
                {defaults.map((d) => {
                  const u = usersById.get(d.user_id);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-ink-800">{u?.name ?? "Unknown"}</span>
                      <Badge tone={d.can_enter_data ? "neutral" : "info"}>
                        {d.can_enter_data ? "Can Enter" : "Monitor"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {assignees.length > 0 && (
            <>
              <p className="mb-1.5 text-xs font-semibold text-ink-900">This order</p>
              <ul className="space-y-1.5">
                {assignees.map((a) => (
                  <li key={a.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink-800">{a.user?.name ?? "Unknown"}</span>
                      <Badge tone={a.can_enter_data ? "neutral" : "info"}>
                        {a.can_enter_data ? "Can Enter" : "Monitor"}
                      </Badge>
                    </div>
                    <p className="text-ink-500">
                      {a.user?.phone ? `${a.user.phone} · ` : ""}
                      {a.po?.po_number ? `PO ${a.po.po_number}` : "All POs"}
                      {a.unit_name ? ` · ${a.unit_name}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
