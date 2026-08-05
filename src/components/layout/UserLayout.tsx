import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandMark } from "../ui/BrandMark";

const navItems = [
  { to: "/user/home", label: "Home", icon: "🏠" },
  { to: "/user/data-input", label: "Data Input", icon: "✍️" },
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
      <header className="sticky top-0 z-10 border-b border-ink-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <div>
              <p className="text-sm font-bold tracking-tight text-ink-900">UK TEXTILES</p>
              <p className="text-xs text-ink-500">
                {appUser?.name} · {appUser?.role}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100"
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
                `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand-gradient text-white shadow-sm shadow-indigo-500/30"
                    : "text-ink-600 hover:bg-ink-100"
                }`
              }
            >
              <span>{item.icon}</span>
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
