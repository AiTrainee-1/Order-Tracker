import { useMemo, useState } from "react";
import {
  useCreateUser,
  useDeleteUser,
  useResetPassword,
  useUpdateUser,
  useUsers,
} from "../../hooks/useUsers";
import { useAssignments } from "../../hooks/useAssignments";
import { useAuth } from "../../context/AuthContext";
import { Card, CardBody } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/FormControls";
import { Modal } from "../../components/ui/Modal";
import { Loader } from "../../components/ui/Loader";
import { UserForm } from "../../components/forms/UserForm";
import { StatCard } from "../../components/ui/StatCard";
import { formatDisplayDate } from "../../lib/workflow";
import { useToast } from "../../context/ToastContext";
import {
  cardStatusAccent,
  cardStatusBorder,
  cardStatusShadow,
  cardStatusSoftBg,
  type CardStatusTone,
} from "../../lib/theme";
import type { AppUser } from "../../lib/types";
import type { CreateUserInput } from "../../hooks/useUsers";

function isActiveToday(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  const today = new Date().toDateString();
  return new Date(lastActivityAt).toDateString() === today;
}

/** Three states worth telling apart at a glance, in order of how much the
 * admin cares: someone working today, an enabled account that's idle, and a
 * deactivated login. */
function userTone(user: AppUser): CardStatusTone {
  if (!user.is_active) return "notStarted";
  return isActiveToday(user.last_activity_at) ? "completed" : "started";
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function UserCard({
  user,
  sections,
  isSelf,
  revealed,
  onToggleReveal,
  onToggleActive,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  user: AppUser;
  sections: string[];
  isSelf: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const tone = userTone(user);
  const today = isActiveToday(user.last_activity_at);

  return (
    <div
      style={cardStatusSoftBg[tone]}
      className={`relative flex flex-col overflow-hidden rounded-2xl border ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cardStatusAccent[tone] }} />

      {/* Identity */}
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: cardStatusAccent[tone] }}
        >
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
            {isSelf && <Badge tone="brand">You</Badge>}
          </div>
          <p className="truncate text-xs text-ink-600">
            @{user.username} · {user.role}
          </p>
        </div>
        {/* Still a click to toggle, as before -  just clearer that it's a control. */}
        <button type="button" onClick={onToggleActive} title="Click to activate / deactivate">
          <Badge tone={user.is_active ? "good" : "bad"}>{user.is_active ? "Active" : "Inactive"}</Badge>
        </button>
      </div>

      {/* Details */}
      <div className="space-y-2 border-t border-black/5 px-4 py-3 text-xs">
        <Row label="Phone">
          {user.phone ? (
            <a href={`tel:${user.phone}`} className="font-medium text-brand hover:underline">
              {user.phone}
            </a>
          ) : (
            <span className="text-ink-400">Not on file</span>
          )}
        </Row>

        <Row label="Access">
          <Badge tone={user.is_monitor_only ? "info" : "neutral"}>
            {user.is_monitor_only ? "Monitor Only" : "Can Enter Data"}
          </Badge>
        </Row>

        <Row label="Last activity">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-ink-800">
              {user.last_activity_at ? formatDisplayDate(user.last_activity_at) : "Never"}
            </span>
            {today && <Badge tone="good">Today</Badge>}
          </span>
        </Row>

        <Row label="Password">
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-ink-800">
              {revealed ? user.password_plain : "••••••••"}
            </span>
            <button
              type="button"
              onClick={onToggleReveal}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand hover:bg-blue-50"
              title="Toggle visibility"
            >
              {revealed ? "Hide" : "View"}
            </button>
          </span>
        </Row>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Assigned sections
          </p>
          {sections.length === 0 ? (
            <p className="text-ink-400">None assigned</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {sections.map((s) => (
                <Badge key={s} tone="neutral">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-black/5 bg-white/40 px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onResetPassword}>
          Reset Password
        </Button>
        {!isSelf && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-status-bad hover:bg-red-50"
            onClick={onDelete}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/** Label on the left, value on the right -  so the same field sits in the same
 * place on every card and the grid reads down a column. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export function UsersPage() {
  const toast = useToast();
  const { appUser } = useAuth();
  const { data: users, isLoading } = useUsers();
  const { data: assignments } = useAssignments();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();
  const deleteUser = useDeleteUser();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const sectionsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignments ?? []) {
      const label = a.section?.label ?? "Unknown section";
      const list = map.get(a.user_id) ?? [];
      if (!list.includes(label)) list.push(label);
      map.set(a.user_id, list);
    }
    return map;
  }, [assignments]);

  const existingUsernames = useMemo(
    () => (users ?? []).map((u) => u.username.toLowerCase()),
    [users],
  );

  if (isLoading) return <Loader full label="Loading users…" />;

  const list = users ?? [];
  const activeCount = list.filter((u) => u.is_active).length;
  const activeTodayCount = list.filter((u) => isActiveToday(u.last_activity_at)).length;

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(input: CreateUserInput) {
    setCreateError(null);
    try {
      await createUser.mutateAsync(input);
      setShowCreate(false);
      toast.success(`User "${input.name}" created successfully.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create user.";
      setCreateError(message);
      toast.error(message);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    try {
      await resetPassword.mutateAsync({ userId: resetTarget.id, newPassword });
      setResetTarget(null);
      setNewPassword("");
      toast.success("Password updated successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reset password.";
      setResetError(message);
      toast.error(message);
    }
  }

  function openEdit(u: AppUser) {
    setEditTarget(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditPhone(u.phone ?? "");
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setEditError(null);
    try {
      await updateUser.mutateAsync({
        id: editTarget.id,
        name: editName.trim(),
        role: editRole.trim(),
        phone: editPhone.trim() || null,
      });
      toast.success("User details updated.");
      setEditTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save changes.";
      setEditError(message);
      toast.error(message);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteUser.mutateAsync({ userId: deleteTarget.id });
      toast.success(`User "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete user.";
      setDeleteError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Users</h1>
          <p className="text-sm text-ink-500">Create accounts, manage access, and monitor activity.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add User</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={list.length} tone="brand" icon="👥" />
        <StatCard label="Active Accounts" value={activeCount} tone="good" icon="✓" />
        <StatCard label="Active Today" value={activeTodayCount} tone={activeTodayCount ? "good" : "warn"} icon="⚡" />
      </div>

      {/* A card per user rather than a nine-column table. The same fields are
          all here, but each user is one scannable block and their state is
          carried by colour as well as text -  grey account disabled, blue
          active, green worked today -  so the list can be read at a glance
          instead of column by column. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-500">
        <LegendDot className="bg-status-good" label="Worked today" />
        <LegendDot className="bg-brand" label="Active account" />
        <LegendDot className="bg-ink-300" label="Deactivated" />
        <span className="ml-auto font-medium text-ink-600">
          {list.length} {list.length === 1 ? "user" : "users"}
        </span>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-400">
            No users yet. Click <b>+ Add User</b> to create the first account.
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              sections={sectionsByUser.get(u.id) ?? []}
              isSelf={u.id === appUser?.id}
              revealed={revealedIds.has(u.id)}
              onToggleReveal={() => toggleReveal(u.id)}
              onToggleActive={() => updateUser.mutate({ id: u.id, is_active: !u.is_active })}
              onEdit={() => openEdit(u)}
              onResetPassword={() => setResetTarget(u)}
              onDelete={() => {
                setDeleteError(null);
                setDeleteTarget(u);
              }}
            />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add User">
        <UserForm
          existingUsernames={existingUsernames}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitting={createUser.isPending}
          error={createError}
        />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit ${editTarget?.name ?? ""}`}>
        <div className="space-y-4">
          <Input label="Full Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label="Role / Designation" value={editRole} onChange={(e) => setEditRole(e.target.value)} />
          <Input
            label="Phone Number"
            type="tel"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder="e.g. +91 98765 43210"
          />
          {editError && <p className="text-sm text-status-bad">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} isLoading={updateUser.isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset password for ${resetTarget?.name ?? ""}`}>
        <div className="space-y-4">
          <Input
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {resetError && <p className="text-sm text-status-bad">{resetError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} isLoading={resetPassword.isPending}>
              Save Password
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete User">
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            This will permanently delete <span className="font-semibold">{deleteTarget?.name}</span>{" "}
            (@{deleteTarget?.username}) and their login. This can't be undone.
          </p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            If this user has ever submitted production entries, deletion will be blocked to protect
            the order history -  deactivate them instead in that case.
          </p>
          {deleteError && <p className="text-sm font-medium text-status-bad">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteUser.isPending}>
              Delete Permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
