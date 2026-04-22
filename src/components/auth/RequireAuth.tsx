import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useSupabaseAuth } from "@/lib/auth";

/**
 * Client-side route guard.
 * Toont kinderen pas zodra een sessie bekend is; anders redirect naar /login.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-mono text-xs uppercase tracking-widest text-ink/50">Laden…</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
