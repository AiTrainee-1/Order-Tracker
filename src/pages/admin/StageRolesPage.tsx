import { useMemo, useState } from "react";
import { useUsers } from "../../hooks/useUsers";
import { useWorkflowStages } from "../../hooks/useWorkflowStages";
import {
  useStageAssignments,
  useUpsertStageAssignment,
  useDeleteStageAssignment,
} from "../../hooks/useStageAssignments";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Select } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";
import { useToast } from "../../context/ToastContext";
import type { AppUser, StageAssignment, WorkflowStage } from "../../lib/types";

export function StageRolesPage() {
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: stages, isLoading: stagesLoading } = useWorkflowStages();
  const { data: assignments, isLoading: assignmentsLoading } = useStageAssignments();

  const usersById = useMemo(() => {
    const map = new Map<string, AppUser>();
    for (const u of users ?? []) map.set(u.id, u);
    return map;
  }, [users]);

  const bySection = useMemo(() => {
    const map = new Map<string, StageAssignment[]>();
    for (const a of assignments ?? []) map.set(a.section_id, [...(map.get(a.section_id) ?? []), a]);
    return map;
  }, [assignments]);

  if (usersLoading || stagesLoading || assignmentsLoading)
    return <Loader full label="Loading stage roles…" />;

  const sortedStages = [...(stages ?? [])].sort((a, b) => a.sequence_no - b.sequence_no);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Stage Roles</h1>
        <p className="text-sm text-ink-500">
          Assign a default user to each production stage. They're automatically responsible for that
          stage on <span className="font-medium text-ink-700">every order and every PO</span> —
          existing and new — without assigning them order by order.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Default Stage Assignments"
          subtitle={`${assignments?.length ?? 0} role${(assignments?.length ?? 0) === 1 ? "" : "s"} set across ${sortedStages.length} stages`}
        />
        <CardBody className="space-y-3">
          {sortedStages.map((stage) => (
            <StageRoleRow
              key={stage.id}
              stage={stage}
              assigned={bySection.get(stage.id) ?? []}
              users={users ?? []}
              usersById={usersById}
            />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function StageRoleRow({
  stage,
  assigned,
  users,
  usersById,
}: {
  stage: WorkflowStage;
  assigned: StageAssignment[];
  users: AppUser[];
  usersById: Map<string, AppUser>;
}) {
  const toast = useToast();
  const upsert = useUpsertStageAssignment();
  const del = useDeleteStageAssignment();
  const [addUserId, setAddUserId] = useState("");

  const assignedUserIds = new Set(assigned.map((a) => a.user_id));
  const available = users.filter((u) => !assignedUserIds.has(u.id));

  async function handleAdd() {
    if (!addUserId) return;
    try {
      await upsert.mutateAsync({ user_id: addUserId, section_id: stage.id, can_enter_data: true });
      toast.success(`Added to ${stage.label}.`);
      setAddUserId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add user.");
    }
  }

  async function toggleAccess(a: StageAssignment) {
    try {
      await upsert.mutateAsync({
        user_id: a.user_id,
        section_id: stage.id,
        can_enter_data: !a.can_enter_data,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update access.");
    }
  }

  async function remove(a: StageAssignment) {
    try {
      await del.mutateAsync(a.id);
      toast.success(`Removed from ${stage.label}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove user.");
    }
  }

  return (
    <div className="rounded-xl border border-ink-100 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
          {stage.sequence_no}
        </span>
        <p className="text-sm font-semibold text-ink-900">{stage.label}</p>
        <Badge tone="neutral">{stage.unit_type}</Badge>
      </div>

      {assigned.length === 0 ? (
        <p className="mb-2 pl-8 text-xs text-ink-400">No default user yet — this stage isn't covered.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-2 pl-8">
          {assigned.map((a) => {
            const user = usersById.get(a.user_id);
            return (
              <span
                key={a.id}
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white py-1 pl-3 pr-1.5 text-xs"
              >
                <span className="font-medium text-ink-800">{user?.name ?? "Unknown"}</span>
                <button
                  type="button"
                  onClick={() => toggleAccess(a)}
                  title="Toggle data-entry vs monitor-only"
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                >
                  <Badge tone={a.can_enter_data ? "neutral" : "info"}>
                    {a.can_enter_data ? "Can Enter" : "Monitor"}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  aria-label={`Remove ${user?.name ?? "user"}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pl-8">
        <div className="w-full max-w-xs">
          <Select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} aria-label={`Add user to ${stage.label}`}>
            <option value="">Add a user…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.username})
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={handleAdd} isLoading={upsert.isPending} disabled={!addUserId}>
          Add
        </Button>
      </div>
    </div>
  );
}
