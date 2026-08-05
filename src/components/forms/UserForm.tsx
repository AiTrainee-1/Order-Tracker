import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/FormControls";
import { Toggle } from "../ui/FormControls";
import type { CreateUserInput } from "../../hooks/useUsers";

export function UserForm({
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  onSubmit: (input: CreateUserInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [isMonitorOnly, setIsMonitorOnly] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ name, username, password, role, isMonitorOnly });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        label="Role / Designation"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="e.g. Cutting Master, Merchandiser"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          required
        />
        <Input
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <Toggle
        checked={isMonitorOnly}
        onChange={setIsMonitorOnly}
        label="Monitor Only"
        description="Can view assigned sections but cannot enter or modify production data."
      />
      {error && <p className="text-sm text-status-bad">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          Create User
        </Button>
      </div>
    </form>
  );
}
