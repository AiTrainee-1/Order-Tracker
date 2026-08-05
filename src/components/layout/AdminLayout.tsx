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

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-white md:flex">
        <div className="flex items-center gap-2.5 border-b border-ink-100 px-5 py-5">
          <BrandMark size={32} />
          <div>
            <p className="text-sm font-bold tracking-tight text-ink-900">UK TEXTILES</p>
            <p className="text-[11px] text-ink-500">Order Tracking · Admin</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand-gradient text-white shadow-sm shadow-indigo-500/30"
                    : "text-ink-600 hover:bg-ink-100"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-100 px-4 py-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
              {appUser?.name?.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-800">{appUser?.name}</p>
              <p className="truncate text-xs text-ink-500">@{appUser?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <BrandMark size={26} />
            <p className="text-sm font-bold text-ink-900">UK TEXTILES</p>
          </div>
          <div className="flex items-center gap-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-2 py-1 text-xs font-medium ${
                    isActive ? "bg-brand-gradient text-white" : "text-ink-600"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button onClick={handleLogout} className="text-xs font-medium text-ink-500">
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
