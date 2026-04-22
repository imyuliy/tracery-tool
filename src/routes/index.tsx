import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSupabaseAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-mono text-xs uppercase tracking-widest text-bone/50">Laden…</div>
      </div>
    );
  }

  return <Navigate to={session ? "/dashboard" : "/login"} replace />;
}
