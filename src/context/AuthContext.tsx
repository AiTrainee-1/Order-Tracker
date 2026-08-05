import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchAppUser, loginWithUsername, logout as logoutRequest } from "../lib/auth";
import type { AppUser } from "../lib/types";

interface AuthContextValue {
  appUser: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<AppUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (userId) {
        const profile = await fetchAppUser(userId);
        if (mounted) setAppUser(profile);
      }
      if (mounted) setLoading(false);
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        if (mounted) setAppUser(null);
        return;
      }
      const profile = await fetchAppUser(session.user.id);
      if (mounted) setAppUser(profile);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      appUser,
      loading,
      isAdmin: appUser?.role === "admin",
      login: async (username, password) => {
        const { appUser: user } = await loginWithUsername(username, password);
        setAppUser(user);
        return user;
      },
      logout: async () => {
        await logoutRequest();
        setAppUser(null);
      },
    }),
    [appUser, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
