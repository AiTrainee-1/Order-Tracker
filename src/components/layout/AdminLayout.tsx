import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/assign", label: "Assign Work" },
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
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-100 bg-white md:flex">
        <div className="border-b border-ink-100 px-5 py-5">
          <p className="text-sm font-semibold tracking-tight text-ink-900">UK TEXTILES</p>
          <p className="text-xs text-ink-500">Order Tracking · Admin</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-100 px-4 py-4">
          <p className="truncate text-sm font-medium text-ink-800">{appUser?.name}</p>
          <p className="truncate text-xs text-ink-500">@{appUser?.username}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3 md:hidden">
          <div>
            <p className="text-sm font-semibold text-ink-900">UK TEXTILES</p>
            <p className="text-xs text-ink-500">Admin</p>
          </div>
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-2 py-1 text-xs font-medium ${
                    isActive ? "bg-ink-900 text-white" : "text-ink-600"
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
