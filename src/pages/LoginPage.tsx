import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/FormControls";
import { Loader } from "../components/ui/Loader";

export function LoginPage() {
  const { appUser, loading, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Loader full label="Loading…" />;
  if (appUser) {
    return <Navigate to={appUser.role === "admin" ? "/admin/dashboard" : "/user/home"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(username, password);
      navigate(user.role === "admin" ? "/admin/dashboard" : "/user/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-popover">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold tracking-tight text-ink-900">UK TEXTILES</p>
          <p className="mt-1 text-sm text-ink-500">Garment Order Tracking</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. admin"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <p className="text-sm text-status-bad">{error}</p>}
          <Button type="submit" className="w-full" isLoading={submitting}>
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
