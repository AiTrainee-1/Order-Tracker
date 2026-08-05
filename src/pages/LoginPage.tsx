import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/FormControls";
import { Loader } from "../components/ui/Loader";
import { BrandMark } from "../components/ui/BrandMark";

const highlights = [
  {
    icon: "🧵",
    title: "End-to-End Tracking",
    body: "Follow every order from raw material planning through carton packing, in one place.",
  },
  {
    icon: "📊",
    title: "Live Dashboard",
    body: "Quantities, shortages, and delivery countdowns update the moment the floor logs them.",
  },
  {
    icon: "🏭",
    title: "Multi-Unit Visibility",
    body: "See exactly what's in-house, what's with an external unit, and what's still pending.",
  },
];

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
    <div className="min-h-screen bg-ink-950 md:grid md:grid-cols-[1.15fr_1fr]">
      {/* Branding / company introduction panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white md:flex">
        <div className="absolute inset-0 bg-mesh-dark" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 animate-floatSlow rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -right-16 bottom-10 h-64 w-64 animate-floatSlow rounded-full bg-blue-500/20 blur-3xl [animation-delay:1.5s]" />

        <div className="relative flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <p className="text-lg font-semibold tracking-tight">UK TEXTILES</p>
            <p className="text-xs text-indigo-200/80">Garment Order Tracking System</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            Complete visibility, from PO to carton.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-indigo-100/80">
            UK Textiles runs its production floor on this platform — every order, every stage,
            every quantity tracked in real time so nothing gets lost between departments and
            external units.
          </p>

          <div className="mt-8 space-y-4">
            {highlights.map((h) => (
              <div key={h.title} className="flex items-start gap-3 rounded-xl glass-panel p-3">
                <span className="text-xl">{h.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{h.title}</p>
                  <p className="text-xs text-indigo-100/70">{h.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-indigo-200/50">
          © {new Date().getFullYear()} UK Textiles. Internal production tracking platform.
        </p>
      </div>

      {/* Login form panel */}
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12 md:bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <BrandMark size={36} />
            <div>
              <p className="text-base font-semibold tracking-tight text-ink-900">UK TEXTILES</p>
              <p className="text-xs text-ink-500">Garment Order Tracking</p>
            </div>
          </div>

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
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-status-bad">
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
