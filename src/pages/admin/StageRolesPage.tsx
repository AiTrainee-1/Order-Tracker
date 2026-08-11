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
import { Modal } from "../../components/ui/Modal";
import { StagePreviewSandbox } from "../../components/forms/stage/StagePreviewSandbox";
import { useToast } from "../../context/ToastContext";
import { BUTTON_GUIDE, UNIVERSAL_RULES, guideFor } from "../../lib/stageGuide";
import type { AppUser, StageAssignment, WorkflowStage } from "../../lib/types";

export function StageRolesPage() {
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: stages, isLoading: stagesLoading } = useWorkflowStages();
  const { data: assignments, isLoading: assignmentsLoading } = useStageAssignments();

  /** The stage whose Preview is open. Held here rather than per row so only one
   * walkthrough can be open at a time. */
  const [previewStage, setPreviewStage] = useState<WorkflowStage | null>(null);

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
  const uncovered = sortedStages.filter((s) => (bySection.get(s.id) ?? []).length === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Stage Roles</h1>
        <p className="text-sm text-ink-500">
          Assign a default user to each production stage. They're automatically responsible for that
          stage on <span className="font-medium text-ink-700">every order and every PO</span> - 
          existing and new -  without assigning them order by order.
        </p>
      </div>

      {/* What assigning someone actually commits them to. Stated up front so an
          admin isn't guessing what a name in a box means. */}
      <Card>
        <CardBody className="flex flex-wrap items-start gap-x-6 gap-y-3 text-xs text-ink-600">
          <div className="min-w-[14rem] flex-1">
            <p className="mb-1 font-bold text-ink-800">What you're handing them</p>
            <p className="leading-relaxed">
              The stage appears in their Home and Data Input lists for every order, and they become
              the contact the previous stage hands off to. Each stage below says what that means in
              practice -  press <span className="font-semibold text-brand">Preview</span> for the
              full step-by-step.
            </p>
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="mb-1 font-bold text-ink-800">Can Enter vs Monitor</p>
            <p className="leading-relaxed">
              <b>Can Enter</b> lets them record production. <b>Monitor</b> lets them watch the stage
              without changing anything. Click the tag on a name to switch.
            </p>
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="mb-1 font-bold text-ink-800">More than one person is fine</p>
            <p className="leading-relaxed">
              Add as many users to a stage as you need -  Raw Material Planning is usually shared
              between a yarn planner, a fabric planner and a supervisor.
            </p>
          </div>
        </CardBody>
      </Card>

      {uncovered.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          {uncovered.length} stage{uncovered.length === 1 ? " has" : "s have"} nobody assigned:{" "}
          {uncovered.map((s) => s.label).join(", ")}. Orders will still flow through {uncovered.length === 1 ? "it" : "them"}, but nobody
          will see the work on their list.
        </p>
      )}

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
              onPreview={() => setPreviewStage(stage)}
            />
          ))}
        </CardBody>
      </Card>

      <StagePreviewModal
        stage={previewStage}
        allStages={sortedStages}
        onClose={() => setPreviewStage(null)}
      />
    </div>
  );
}

function StageRoleRow({
  stage,
  assigned,
  users,
  usersById,
  onPreview,
}: {
  stage: WorkflowStage;
  assigned: StageAssignment[];
  users: AppUser[];
  usersById: Map<string, AppUser>;
  onPreview: () => void;
}) {
  const toast = useToast();
  const upsert = useUpsertStageAssignment();
  const del = useDeleteStageAssignment();
  const [addUserId, setAddUserId] = useState("");
  const guide = guideFor(stage.key);

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
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
          {stage.sequence_no}
        </span>
        <p className="text-sm font-semibold text-ink-900">{stage.label}</p>
        <Badge tone="neutral">{stage.unit_type}</Badge>
        <Button variant="ghost" size="sm" onClick={onPreview} className="ml-auto text-brand">
          Preview
        </Button>
      </div>

      {guide && (
        <div className="mb-2.5 space-y-1.5 pl-8">
          <p className="text-xs leading-relaxed text-ink-600">
            <span className="font-semibold text-ink-700">Responsible for:</span> {guide.owns}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Enters
            </span>
            {guide.records.map((r) => (
              <span
                key={r}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-100"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {assigned.length === 0 ? (
        <p className="mb-2 pl-8 text-xs text-ink-400">No default user yet -  this stage isn't covered.</p>
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

/**
 * The Preview -  the stage's actual form, running on a throwaway sample order.
 *
 * The form comes first because seeing it is the point; the written walkthrough
 * sits underneath, collapsed, for anyone who wants the steps spelled out. Both
 * are needed: the form shows what the fields ARE, the steps explain what to put
 * in them.
 */
function StagePreviewModal({
  stage,
  allStages,
  onClose,
}: {
  stage: WorkflowStage | null;
  allStages: WorkflowStage[];
  onClose: () => void;
}) {
  const guide = stage ? guideFor(stage.key) : null;

  return (
    <Modal
      open={!!stage}
      onClose={onClose}
      title={stage ? `Preview -  Stage ${stage.sequence_no}: ${stage.label}` : ""}
      widthClass="max-w-4xl"
    >
      {stage && (
        <div className="space-y-5">
          {guide && (
            <div className="rounded-xl bg-brand-gradient px-4 py-3 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                What this person is responsible for
              </p>
              <p className="mt-0.5 text-sm font-medium leading-relaxed">{guide.owns}</p>
            </div>
          )}

          {guide && (
            <div className="flex flex-wrap gap-2 text-xs">
              <FlowPill label="Receives" value={guide.receives} />
              <FlowPill label="Hands on to" value={guide.handsTo} tone="good" />
              <FlowPill label="Measured in" value={stage.unit_type} tone="brand" />
            </div>
          )}

          {/* Keyed on the stage so switching previews rebuilds the sandbox from
              scratch rather than carrying the last stage's practice entries. */}
          <StagePreviewSandbox key={stage.id} stage={stage} allStages={allStages} />

          {guide && (
            <details className="rounded-xl border border-ink-100 bg-ink-50/50">
              <summary className="cursor-pointer px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-600">
                Written instructions -  what to enter, step by step
              </summary>
              <div className="space-y-4 border-t border-ink-100 px-4 py-4">
                <GuideSection title="What they enter">
                  <ul className="space-y-1">
                    {guide.records.map((r) => (
                      <li key={r} className="flex gap-2 text-sm text-ink-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </GuideSection>

                <GuideSection title="What they keep up to date">
                  <ul className="space-y-1">
                    {guide.maintains.map((m) => (
                      <li key={m} className="flex gap-2 text-sm text-ink-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </GuideSection>

                <GuideSection title="How to enter the data, step by step">
                  <ol className="space-y-2">
                    {guide.steps.map((s, i) => (
                      <li key={s} className="flex gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="text-sm leading-relaxed text-ink-700">{s}</span>
                      </li>
                    ))}
                  </ol>
                </GuideSection>

                {guide.watchFor && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Watch out for
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-amber-900">{guide.watchFor}</p>
                  </div>
                )}

                <GuideSection title="The three buttons at the bottom of every form">
                  <div className="space-y-2">
                    {BUTTON_GUIDE.map((b) => (
                      <div key={b.label} className="rounded-lg border border-ink-100 bg-white px-3 py-2">
                        <p className="text-xs font-bold text-ink-800">{b.label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{b.detail}</p>
                      </div>
                    ))}
                  </div>
                </GuideSection>

                <GuideSection title="Rules that apply everywhere">
                  <ul className="space-y-1.5">
                    {UNIVERSAL_RULES.map((r) => (
                      <li key={r} className="flex gap-2 text-xs leading-relaxed text-ink-600">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </GuideSection>
              </div>
            </details>
          )}

          <div className="flex justify-end border-t border-ink-100 pt-3">
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">{title}</h3>
      {children}
    </section>
  );
}

function FlowPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "brand";
}) {
  const classes =
    tone === "good"
      ? "bg-green-50 text-green-800 ring-green-200"
      : tone === "brand"
        ? "bg-blue-50 text-blue-800 ring-blue-200"
        : "bg-ink-50 text-ink-700 ring-ink-200";
  return (
    <span className={`rounded-lg px-2.5 py-1.5 ring-1 ring-inset ${classes}`}>
      <span className="font-semibold uppercase tracking-wide opacity-60">{label}: </span>
      {value}
    </span>
  );
}
