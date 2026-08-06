import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/FormControls";
import { Loader } from "../components/ui/Loader";
import { BrandMark } from "../components/ui/BrandMark";

export function LoginPage() {
  const { appUser, loading, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex flex-col justify-between border-b border-ink-100 bg-ink-50 px-6 py-8 md:w-1/2 md:border-b-0 md:border-r md:px-14 md:py-14">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <p className="text-base font-bold tracking-tight text-ink-900">UK TEXTILES</p>
            <p className="text-xs text-ink-500">Excellence in Every Thread</p>
          </div>
        </div>

        <div className="my-10 md:my-0">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-ink-900 md:text-4xl">
            Garment order tracking, <span className="text-brand">simplified.</span>
          </h1>
          <p className="mt-3 max-w-sm text-sm text-ink-600">
            Track every order from PO to packing across the full 13-stage production workflow — in
            real time.
          </p>

          <div className="mt-8 space-y-3">
            <FeatureRow icon="📦" tone="brand" text="13-stage production workflow tracking" />
            <FeatureRow icon="⏱" tone="warn" text="Live delivery countdowns & urgency alerts" />
            <FeatureRow icon="👥" tone="good" text="Role-based assignments, monitor-only access" />
          </div>
        </div>

        <p className="hidden text-xs text-ink-400 md:block">
          © {new Date().getFullYear()} UK Textiles. All rights reserved.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-4 py-10 md:px-8">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-ink-100 bg-white p-8 shadow-popover">
            <h2 className="text-lg font-bold tracking-tight text-ink-900">Welcome back</h2>
            <p className="mt-1 text-sm text-ink-500">Sign in to continue to your workspace.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Input
                label="Username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                required
              />
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-[34px] text-ink-400 transition-colors hover:text-ink-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-status-bad">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" isLoading={submitting}>
                Sign In
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-ink-400">
            Having trouble signing in? Contact your Host Admin.
          </p>
        </div>
      </div>
    </div>
  );
}

const featureIconTone: Record<"brand" | "warn" | "good", string> = {
  brand: "bg-blue-50 text-brand",
  warn: "bg-amber-50 text-amber-600",
  good: "bg-green-50 text-green-600",
};

function FeatureRow({ icon, tone, text }: { icon: ReactNode; tone: "brand" | "warn" | "good"; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${featureIconTone[tone]}`}
      >
        {icon}
      </span>
      <p className="text-sm font-medium text-ink-700">{text}</p>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.36 5.6C10.2 5.2 11.08 5 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.22 4.06M6.6 6.6A13.6 13.6 0 0 0 2 12s3.5 7 10 7c1.06 0 2.06-.18 3-.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
