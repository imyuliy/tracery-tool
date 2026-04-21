import { createFileRoute } from "@tanstack/react-router";
import { Plus, FolderOpen } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { TopNav } from "@/components/nav/TopNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayName, useSupabaseAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — De Tracémolen" },
      {
        name: "description",
        content: "Overzicht van je MS-kabeltracé-projecten in De Tracémolen.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user } = useSupabaseAuth();

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            Welkom, {displayName(user)}
          </h1>
          <p className="mt-2 font-sans text-base text-muted-foreground">
            Begin een nieuw tracé-ontwerp of open een bestaand project.
          </p>
        </div>

        <Card className="border-border bg-card p-12 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="h-8 w-8 text-cyan" />
            </div>

            <h2 className="font-display text-2xl text-ink">
              Nog geen projecten
            </h2>
            <p className="mt-2 max-w-md font-sans text-sm text-muted-foreground">
              Je hebt nog geen tracé-projecten. Start een nieuw project om een
              kabeltracé te uploaden, ontwerpparameters in te vullen en de
              analyse te starten.
            </p>

            <Button
              type="button"
              size="lg"
              className="mt-8 bg-signal text-paper hover:bg-signal/90"
              // Sprint 1: placeholder — geen handler.
              onClick={() => {}}
            >
              <Plus className="mr-2 h-5 w-5" />
              Nieuw project
            </Button>

            <p className="mt-4 font-sans text-xs text-muted-foreground">
              Functionaliteit volgt in Sprint 2.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
