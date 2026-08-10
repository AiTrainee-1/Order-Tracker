import { useAuth } from "../context/AuthContext";
import { useDemoStore } from "../context/DemoModeContext";

/** Attribution for practice entries. Never written to the database — the demo
 * guards intercept every write long before this reaches a row. */
export const DEMO_USER = { id: "demo-user", name: "Practice user" };

/**
 * Who is making this entry.
 *
 * Real work is attributed to the signed-in user. Inside a Preview sandbox there
 * may be no meaningful "who" — and it shouldn't matter, because nothing is
 * saved — so a fixed practice identity stands in.
 *
 * The forms previously read `appUser` directly and bailed out with a silent
 * `return` when it was null. That was fragile in two ways: a sandbox would do
 * nothing at all, and on a real page a null user meant `entered_by: ""`, which
 * is not a valid uuid and would have failed at the database rather than in the
 * UI. One hook, one guard, both problems gone.
 */
export function useEntryUser(): { id: string; name: string } | null {
  const { appUser } = useAuth();
  const demo = useDemoStore();

  if (demo) return DEMO_USER;
  return appUser ? { id: appUser.id, name: appUser.name } : null;
}
