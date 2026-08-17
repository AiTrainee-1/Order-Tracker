import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandMark } from "../ui/BrandMark";
import { brandGradient, iconGradient, sidebarBackground, spatialBackground, SHADOW_BRAND, type IconTone } from "../../lib/theme";

const navItems: { to: string; label: string; icon: string; tone: IconTone }[] = [
  { to: "/md/dashboard", label: "Dashboard", icon: "📊", tone: "sky" },
  { to: "/md/users", label: "Users", icon: "👥", tone: "emerald" },
  // { to: "/md/workflow-map", label: "Workflow Map", icon: "🗺️", tone: "violet" },
];

/** MD's shell -  a near-verbatim copy of AdminLayout, deliberately: same look
 * and feel as the rest of the app, just two nav items instead of five. MD is
 * a read-only login (see migration 015 + ProtectedRoute's requireMd), so
 * unlike AdminLayout there's nothing here that writes anything. */
export function MdLayout() {
  const { appUser, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen" style={spatialBackground}>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-ink-950/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <button
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/80 text-ink-800 shadow-[0_8px_20px_-10px_rgba(30,41,90,0.5)] backdrop-blur-xl md:hidden"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      <aside
        style={sidebarBackground}
        className={`fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-white/70 shadow-[10px_0_36px_-18px_rgba(30,41,90,0.35)] backdrop-blur-2xl transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="h-1 shrink-0" style={brandGradient} />
        <div className="flex shrink-0 items-center gap-2.5 border-b border-white/70 px-5 py-5">
          <span className="flex items-center justify-center rounded-xl border border-white/80 bg-white px-2 py-1.5 shadow-[0_8px_20px_-12px_rgba(30,41,90,0.5)]">
            <BrandMark size={26} />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-ink-900">UK TEXTILES</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
              MD Portal
            </p>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl py-2 pl-2 pr-3 text-sm font-semibold transition-all ${
                  isActive
                    ? `text-white ${SHADOW_BRAND}`
                    : "text-ink-600 hover:bg-white/70 hover:text-ink-900"
                }`
              }
              style={({ isActive }) => (isActive ? brandGradient : undefined)}
            >
              {({ isActive }) => (
                <>
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm shadow-sm"
                    style={isActive ? { backgroundColor: "rgba(255,255,255,0.22)" } : iconGradient[item.tone]}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/70 px-4 py-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-[0_8px_20px_-14px_rgba(30,41,90,0.4)]">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md"
              style={brandGradient}
            >
              {appUser?.name?.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{appUser?.name}</p>
              <p className="truncate text-xs text-ink-500">@{appUser?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs font-semibold text-ink-600 transition-colors hover:bg-white hover:text-ink-900"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="min-h-screen overflow-y-auto p-4 pt-16 md:ml-64 md:p-8 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
