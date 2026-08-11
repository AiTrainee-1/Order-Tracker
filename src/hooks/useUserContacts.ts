import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { UserContact } from "../lib/types";

/** Resolves a set of user ids to just {name, phone} via the get_user_contacts
 * RPC -  safe for any authenticated user to call, unlike selecting app_users
 * directly (which would also be blocked by RLS for anyone but the owner/admin). */
export function useUserContacts(userIds: string[]) {
  const sortedIds = useMemo(() => [...new Set(userIds)].sort(), [userIds]);

  const query = useQuery({
    queryKey: ["user_contacts", sortedIds],
    enabled: sortedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_contacts", { p_user_ids: sortedIds });
      if (error) throw error;
      return data as UserContact[];
    },
  });

  const contactsById = useMemo(() => {
    const map = new Map<string, UserContact>();
    for (const c of query.data ?? []) map.set(c.id, c);
    return map;
  }, [query.data]);

  return { contactsById, isLoading: query.isLoading };
}
