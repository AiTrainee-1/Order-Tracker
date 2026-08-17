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
import { Card, CardBody } from "../../components/ui/Card";
import { Select, Input, Toggle } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";
import { useToast } from "../../context/ToastContext";
import { PHASES, phaseOf } from "../../lib/stagePhases";
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

  /** Existing assignments grouped by person, most-loaded first. */
  const assignmentsByUser = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; rows: AssignmentWithDetails[] }>();
    for (const a of assignments ?? []) {
      const row = map.get(a.user_id) ?? {
        userId: a.user_id,
        name: a.user?.name ?? "Unknown user",
        rows: [],
      };
      row.rows.push(a);
      map.set(a.user_id, row);
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        rows: [...g.rows].sort(
          (x, y) => (x.section?.sequence_no ?? 0) - (y.section?.sequence_no ?? 0),
        ),
      }))
      .sort((x, y) => y.rows.length - x.rows.length || x.name.localeCompare(y.name));
  }, [assignments]);

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

  const sortedStages = [...(stages ?? [])].sort((a, b) => a.sequence_no - b.sequence_no);
  const selectedUser = usersById.get(userId) ?? null;
  const selectedOrder = orders.find((o) => o.id === orderId) ?? null;

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

      {/* The form is three decisions in order -  who, which order, which
          sections -  so it's laid out as three numbered steps rather than one
          undifferentiated column of inputs. The bar underneath restates the
          current selection, so what's about to be created is readable without
          scrolling back up through the fields. */}
      <div className="space-y-4">
        <Step n={1} title="Who is being assigned" done={!!userId}>
          <div className="max-w-md">
            <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select user…</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </Select>
          </div>
        </Step>

        <Step n={2} title="Which order" done={!!orderId}>
          <div className="space-y-4">
            <Select
              label="Quick select (number-wise)"
              value={orderId}
              onChange={(e) => handleQuickSelect(e.target.value)}
            >
              <option value="">Jump straight to an order…</option>
              {ordersInSequence.map((o, index) => (
                <option key={o.id} value={o.id}>
                  {index + 1}. IO {o.io_no} -  {o.style} -  {o.color}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>
        </Step>

        <Step n={3} title="Which sections" done={sectionIds.size > 0} count={sectionIds.size}>
          <div className="space-y-3">
            <p className="text-xs text-ink-500">
              Grouped by production phase. Hover a section to see who's already on it. Stages the
              user already covers via a global default are marked{" "}
              <span className="font-medium text-ink-600">Default</span> and can't be re-assigned -
              manage those on{" "}
              <Link to="/admin/stage-roles" className="font-medium text-brand hover:text-brand-dark">
                Stage Roles
              </Link>
              .
            </p>

            {PHASES.map((phase) => {
              const phaseStages = sortedStages.filter((s) => phaseOf(s.key) === phase.key);
              if (phaseStages.length === 0) return null;
              const picked = phaseStages.filter((s) => sectionIds.has(s.id)).length;

              return (
                <div key={phase.key} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                  <div className={`flex items-center gap-2.5 border-l-4 px-3 py-2 ${phase.rail} ${phase.band}`}>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white ${phase.chip}`}
                      aria-hidden
                    >
                      {phase.initial}
                    </span>
                    <p className={`flex-1 text-xs font-bold uppercase tracking-wide ${phase.text}`}>
                      {phase.label}
                    </p>
                    {picked > 0 && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink-700 ring-1 ring-inset ring-ink-200">
                        {picked} selected
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {phaseStages.map((s) => (
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
                </div>
              );
            })}
          </div>
        </Step>

        <Step n={4} title="Access & unit" done>
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
        </Step>

        {/* What's about to be created, in words. */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <SummaryBit label="User" value={selectedUser ? selectedUser.name : "Not chosen"} ok={!!selectedUser} />
            <SummaryBit
              label="Order"
              value={selectedOrder ? `IO ${selectedOrder.io_no} · ${selectedOrder.style}` : "Not chosen"}
              ok={!!selectedOrder}
            />
            <SummaryBit
              label="New sections"
              value={sectionIds.size === 0 ? "None selected" : `${sectionIds.size} selected`}
              ok={sectionIds.size > 0}
            />
            <SummaryBit label="Access" value={canEnterData ? "Can Enter Data" : "Monitor Only"} ok />
          </div>

          {error && <p className="mt-3 text-sm text-status-bad">{error}</p>}
          {success && <p className="mt-3 text-sm text-status-good">{success}</p>}

          <div className="mt-3 flex justify-end">
            <Button onClick={handleSubmit} isLoading={createAssignment.isPending}>
              Save Assignment
            </Button>
          </div>
        </div>
      </div>

      {/* Grouped by person, because that's the question this list answers:
          "what is X responsible for?" A flat seven-column table made you scan
          for repeated names to work that out. */}
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight text-ink-900">Existing Assignments</h2>
          <p className="text-xs text-ink-500">
            {assignments?.length ?? 0} assignment{(assignments?.length ?? 0) === 1 ? "" : "s"} across{" "}
            {assignmentsByUser.length} user{assignmentsByUser.length === 1 ? "" : "s"}
          </p>
        </div>

        {assignmentsByUser.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-sm text-ink-400">
              No per-order assignments yet. Stage Roles cover every order by default -  use this page
              only when someone needs a specific order on top of that.
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {assignmentsByUser.map((group) => (
              <div
                key={group.userId}
                className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_8px_24px_-18px_rgba(30,41,90,0.4)]"
              >
                <div className="flex items-center gap-2.5 border-b border-ink-100 bg-ink-50/70 px-4 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-xs font-bold text-white">
                    {group.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{group.name}</p>
                    <p className="truncate text-[11px] text-ink-500">
                      {group.rows.length} assignment{group.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <ul className="divide-y divide-ink-100">
                  {group.rows.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-ink-900">
                            {a.section?.label ?? "Unknown section"}
                          </span>
                          <Badge tone={a.can_enter_data ? "neutral" : "info"}>
                            {a.can_enter_data ? "Can Enter" : "Monitor"}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-ink-500">
                          {a.order?.style ?? "Unknown order"} · IO {a.order?.io_no ?? "- "}
                          {a.order?.color ? ` · ${a.order.color}` : ""}
                          {a.unit_name ? ` · ${a.unit_name}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-status-bad hover:bg-red-50"
                        onClick={() => deleteAssignment.mutate(a.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One decision in the assignment sequence. The number and the tick are the
 * point: they make it obvious how many choices there are and which are made,
 * which a single column of selects does not.
 */
function Step({
  n,
  title,
  done,
  count,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            done ? "bg-status-good" : "bg-ink-400"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <p className="flex-1 text-xs font-bold uppercase tracking-wide text-ink-700">{title}</p>
        {count != null && count > 0 && (
          <span className="rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SummaryBit({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      <span className={`truncate font-semibold ${ok ? "text-ink-900" : "text-ink-400"}`}>{value}</span>
    </span>
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
