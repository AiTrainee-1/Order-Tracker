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
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/FormControls";
import { Modal } from "../../components/ui/Modal";
import { Loader } from "../../components/ui/Loader";
import { UserForm } from "../../components/forms/UserForm";
import { StatCard } from "../../components/ui/StatCard";
import { formatDisplayDate } from "../../lib/workflow";
import { useToast } from "../../context/ToastContext";
import type { AppUser } from "../../lib/types";
import type { CreateUserInput } from "../../hooks/useUsers";

function isActiveToday(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  const today = new Date().toDateString();
  return new Date(lastActivityAt).toDateString() === today;
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

      <Card>
        <CardHeader title="All Users" />
        <CardBody>
          <Table
            keyFor={(u) => u.id}
            rows={list}
            columns={[
              {
                header: "Name",
                render: (u) => (
                  <div>
                    <p className="font-medium text-ink-900">{u.name}</p>
                    <p className="text-xs text-ink-500">@{u.username}</p>
                  </div>
                ),
              },
              { header: "Role", render: (u) => u.role },
              { header: "Phone", render: (u) => u.phone || <span className="text-ink-300">—</span> },
              {
                header: "Sections",
                render: (u) => (
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {(sectionsByUser.get(u.id) ?? []).length === 0 ? (
                      <span className="text-xs text-ink-400">None assigned</span>
                    ) : (
                      sectionsByUser.get(u.id)!.map((s) => (
                        <Badge key={s} tone="neutral">
                          {s}
                        </Badge>
                      ))
                    )}
                  </div>
                ),
              },
              {
                header: "Access",
                render: (u) => <Badge tone={u.is_monitor_only ? "info" : "neutral"}>{u.is_monitor_only ? "Monitor Only" : "Can Enter Data"}</Badge>,
              },
              {
                header: "Password",
                render: (u) => (
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="min-w-[80px]">{revealedIds.has(u.id) ? u.password_plain : "••••••••"}</span>
                    <button
                      onClick={() => toggleReveal(u.id)}
                      className="rounded-md px-1.5 py-0.5 text-[11px] font-sans font-semibold text-brand hover:bg-blue-50"
                      title="Toggle visibility"
                    >
                      {revealedIds.has(u.id) ? "Hide" : "View"}
                    </button>
                  </div>
                ),
              },
              {
                header: "Last Activity",
                render: (u) => (
                  <div>
                    <p>{u.last_activity_at ? formatDisplayDate(u.last_activity_at) : "Never"}</p>
                    <Badge tone={isActiveToday(u.last_activity_at) ? "good" : "neutral"}>
                      {isActiveToday(u.last_activity_at) ? "Active today" : "No activity today"}
                    </Badge>
                  </div>
                ),
              },
              {
                header: "Status",
                render: (u) => (
                  <button
                    onClick={() => updateUser.mutate({ id: u.id, is_active: !u.is_active })}
                    className="cursor-pointer"
                  >
                    <Badge tone={u.is_active ? "good" : "bad"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                  </button>
                ),
              },
              {
                header: "",
                className: "text-right",
                render: (u) => (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setResetTarget(u)}>
                      Reset Password
                    </Button>
                    {u.id !== appUser?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-status-bad hover:bg-red-50"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(u);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

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
            the order history — deactivate them instead in that case.
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
