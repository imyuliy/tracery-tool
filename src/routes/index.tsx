import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSupabaseAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { session, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="font-sans text-sm text-muted-foreground">Laden…</div>
      </div>
    );
  }

  return <Navigate to={session ? "/dashboard" : "/login"} replace />;
}
