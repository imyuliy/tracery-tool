import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side auth hook.
 *
 * MVP-1: Sessie wordt door supabase-js gepersisteerd in localStorage.
 * Echte SSR-cookies via @supabase/ssr volgen zodra we server-side
 * beschermde data ophalen (vanaf MVP-2 / Sprint 2).
 */
export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Listener eerst registreren — voorkomt race-conditions.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    // 2) Daarna huidige sessie ophalen.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null as User | null, loading };
}

export function displayName(user: User | null): string {
  if (!user) return "engineer";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return (
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    "engineer"
  );
}
