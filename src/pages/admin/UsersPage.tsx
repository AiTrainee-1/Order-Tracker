import { useMemo, useState } from "react";
import {
  useCreateUser,
  useResetPassword,
  useUpdateUser,
  useUsers,
} from "../../hooks/useUsers";
import { useAssignments } from "../../hooks/useAssignments";
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
import type { AppUser } from "../../lib/types";
import type { CreateUserInput } from "../../hooks/useUsers";

function isActiveToday(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  const today = new Date().toDateString();
  return new Date(lastActivityAt).toDateString() === today;
}

export function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const { data: assignments } = useAssignments();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

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
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create user.");
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    try {
      await resetPassword.mutateAsync({ userId: resetTarget.id, newPassword });
      setResetTarget(null);
      setNewPassword("");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not reset password.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Users</h1>
          <p className="text-sm text-ink-500">Create accounts, manage access, and monitor activity.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add User</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={list.length} />
        <StatCard label="Active Accounts" value={activeCount} tone="good" />
        <StatCard label="Active Today" value={activeTodayCount} tone={activeTodayCount ? "good" : "warn"} />
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
                    <span>{revealedIds.has(u.id) ? u.password_plain : "••••••••"}</span>
                    <button
                      onClick={() => toggleReveal(u.id)}
                      className="text-ink-400 hover:text-ink-900"
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
                render: (u) => (
                  <Button variant="ghost" size="sm" onClick={() => setResetTarget(u)}>
                    Reset Password
                  </Button>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add User">
        <UserForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitting={createUser.isPending}
          error={createError}
        />
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
    </div>
  );
}
