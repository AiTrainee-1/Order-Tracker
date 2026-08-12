import { useMemo, useState, type FormEvent } from "react";
import { useCreateUser, useResetPassword, useUpdateUser, useUsers } from "../../hooks/useUsers";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/FormControls";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { Loader } from "../../components/ui/Loader";
import { useToast } from "../../context/ToastContext";
import { formatDisplayDate } from "../../lib/workflow";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

/**
 * The MD account is a special-purpose login -  not another floor-worker row
 * on the general Users page -  so it gets its own small, focused control
 * panel: create it if it doesn't exist yet, otherwise view/reset it. Reuses
 * the exact same mutations (and the same /api/admin-create-user route) as the
 * regular Users page; only the role is fixed to "md" and there's no section
 * assignment, since MD never enters production data.
 */
export function AccountManagementPage() {
  const toast = useToast();
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [revealPassword, setRevealPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const mdUser = useMemo(() => (users ?? []).find((u) => u.role === "md") ?? null, [users]);
  const existingUsernames = useMemo(() => (users ?? []).map((u) => u.username.toLowerCase()), [users]);

  if (isLoading) return <Loader full label="Loading account management…" />;

  const normalizedUsername = username.trim().toLowerCase();
  const usernameTaken = existingUsernames.includes(normalizedUsername);
  const usernameError = !touched
    ? undefined
    : !normalizedUsername
      ? "Username is required."
      : !USERNAME_PATTERN.test(normalizedUsername)
        ? "3-32 characters: lowercase letters, numbers, dots, underscores, or hyphens only."
        : usernameTaken
          ? "This username is already in use."
          : undefined;
  const passwordError =
    touched && password.length > 0 && password.length < 6
      ? "Password must be at least 6 characters."
      : touched && password.length === 0
        ? "Password is required."
        : undefined;
  const isValid =
    name.trim().length > 0 && USERNAME_PATTERN.test(normalizedUsername) && !usernameTaken && password.length >= 6;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setCreateError(null);
    if (!isValid) return;
    try {
      await createUser.mutateAsync({
        name: name.trim(),
        username: normalizedUsername,
        password,
        role: "md",
        phone: "",
        isMonitorOnly: false,
      });
      toast.success(`MD account "${name.trim()}" created.`);
      setName("");
      setUsername("");
      setPassword("");
      setTouched(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the MD account.";
      setCreateError(message);
      toast.error(message);
    }
  }

  async function handleResetPassword() {
    if (!mdUser) return;
    setResetError(null);
    try {
      await resetPassword.mutateAsync({ userId: mdUser.id, newPassword });
      setResetOpen(false);
      setNewPassword("");
      toast.success("MD password updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reset the password.";
      setResetError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Account Management</h1>
        <p className="text-sm text-ink-500">
          Create and manage the MD (Managing Director) login -  a read-only account that only sees the
          Dashboard and Users.
        </p>
      </div>

      {mdUser ? (
        <Card>
          <CardHeader
            title="MD Account"
            action={<Badge tone={mdUser.is_active ? "good" : "bad"}>{mdUser.is_active ? "Active" : "Inactive"}</Badge>}
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Name</p>
                <p className="text-sm font-semibold text-ink-900">{mdUser.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Username</p>
                <p className="text-sm font-semibold text-ink-900">@{mdUser.username}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Password</p>
                <div className="flex items-center gap-2 font-mono text-sm">
                  <span>{revealPassword ? mdUser.password_plain : "••••••••"}</span>
                  <button
                    type="button"
                    onClick={() => setRevealPassword((v) => !v)}
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-sans font-semibold text-brand hover:bg-blue-50"
                  >
                    {revealPassword ? "Hide" : "View"}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Last Activity</p>
                <p className="text-sm text-ink-700">
                  {mdUser.last_activity_at ? formatDisplayDate(mdUser.last_activity_at) : "Never"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
              <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
                Reset Password
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateUser.mutate({ id: mdUser.id, is_active: !mdUser.is_active })}
                isLoading={updateUser.isPending}
              >
                {mdUser.is_active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Create the MD Account" subtitle="No MD account exists yet -  set one up below." />
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-4" noValidate>
              <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  error={usernameError}
                  required
                />
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    error={passwordError}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-[34px] text-xs font-semibold text-brand hover:text-brand-dark"
                    tabIndex={-1}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <p className="-mt-2 text-xs text-ink-400">
                Minimum 6 characters. The username becomes their login -  it can't be changed later.
              </p>
              {createError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-status-bad">{createError}</p>
              )}
              <div className="flex justify-end">
                <Button type="submit" isLoading={createUser.isPending}>
                  Create MD Account
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title={`Reset password for ${mdUser?.name ?? ""}`}>
        <div className="space-y-4">
          <Input label="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          {resetError && <p className="text-sm text-status-bad">{resetError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
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
