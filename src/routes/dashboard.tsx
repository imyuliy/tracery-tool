import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, FolderOpen, Building2 } from "lucide-react";
import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { TopNav } from "@/components/nav/TopNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayName, useSupabaseAuth } from "@/lib/auth";
import {
  PROJECT_STATUS_LABELS,
  formatRelativeDate,
  projectsQueryOptions,
} from "@/lib/projects";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: projects, isLoading, error } = useQuery(projectsQueryOptions());

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
              Welkom, {displayName(user)}
            </h1>
            <p className="mt-2 font-sans text-base text-muted-foreground">
              Begin een nieuw tracé-ontwerp of open een bestaand project.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="bg-signal text-paper hover:bg-signal/90"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
            Nieuw project
          </Button>
        </div>

        {isLoading ? (
          <ProjectGridSkeleton />
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-6">
            <p className="font-sans text-sm text-destructive">
              Kon projecten niet laden: {(error as Error).message}
            </p>
          </Card>
        ) : !projects || projects.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const status =
                PROJECT_STATUS_LABELS[p.status ?? "draft"] ??
                PROJECT_STATUS_LABELS.draft;
              return (
                <Link
                  key={p.id}
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="group"
                >
                  <Card className="h-full border-border bg-card p-6 shadow-sm transition-all hover:border-ink/40 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display text-xl font-semibold leading-tight text-ink group-hover:text-signal">
                        {p.name}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 font-sans text-xs ${status.tone}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 font-sans text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>
                        {p.client ?? "—"}
                        {p.perceel ? ` · ${p.perceel}` : ""}
                      </span>
                    </div>
                    {p.bto_reference && (
                      <p className="mt-1 font-sans text-xs text-muted-foreground">
                        {p.bto_reference}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-sans text-[11px] text-cyan">
                        {p.phase_state ?? "VO_fase_1"}
                      </span>
                      <p className="font-sans text-xs text-muted-foreground">
                        {formatRelativeDate(p.created_at)}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-border bg-card p-12 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <FolderOpen className="h-8 w-8 text-cyan" />
        </div>
        <h2 className="font-display text-2xl text-ink">Nog geen projecten</h2>
        <p className="mt-2 max-w-md font-sans text-sm text-muted-foreground">
          Je hebt nog geen tracé-projecten. Start een nieuw project om een
          kabeltracé te uploaden, ontwerpparameters in te vullen en de analyse
          te starten.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-8 bg-signal text-paper hover:bg-signal/90"
          onClick={onCreate}
        >
          <Plus className="mr-2 h-5 w-5" />
          Nieuw project
        </Button>
      </div>
    </Card>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="h-40 animate-pulse border-border bg-card p-6" />
      ))}
    </div>
  );
}
