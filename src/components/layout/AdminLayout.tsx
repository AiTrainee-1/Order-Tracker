import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandMark } from "../ui/BrandMark";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/admin/orders", label: "Orders", icon: "📦" },
  { to: "/admin/users", label: "Users", icon: "👥" },
  { to: "/admin/assign", label: "Assign Work", icon: "📝" },
];

export function AdminLayout() {
  const { appUser, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-ink-50">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-ink-950/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <button
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 shadow-card md:hidden"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-ink-100 bg-white transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-ink-100 px-5 py-5">
          <BrandMark size={32} />
          <div>
            <p className="text-sm font-bold tracking-tight text-ink-900">UK TEXTILES</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Admin Portal</p>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-dark text-white shadow-card"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-100 px-4 py-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-dark text-xs font-bold text-white">
              {appUser?.name?.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{appUser?.name}</p>
              <p className="truncate text-xs text-ink-500">@{appUser?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
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
