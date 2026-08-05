import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const navItems = [
  { to: "/user/home", label: "Home" },
  { to: "/user/data-input", label: "Data Input" },
];

export function UserLayout() {
  const { appUser, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="sticky top-0 z-10 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold tracking-tight text-ink-900">UK TEXTILES</p>
            <p className="text-xs text-ink-500">{appUser?.name} · {appUser?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
          >
            Logout
          </button>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
