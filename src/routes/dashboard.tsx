import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, FolderOpen, Building2, Trash2 } from "lucide-react";
import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { TopNav } from "@/components/nav/TopNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { displayName, useSupabaseAuth } from "@/lib/auth";
import {
  PROJECT_STATUS_LABELS,
  formatRelativeDate,
  projectsQueryOptions,
  useDeleteProject,
  type Project,
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
    <div className="min-h-screen bg-background">
      <TopNav />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Workspace
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
              Welkom, {displayName(user)}
            </h1>
            <p className="mt-2 font-sans text-base text-ink/60">
              Begin een nieuw tracé-ontwerp of open een bestaand project.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
            Nieuw project
          </Button>
        </div>

        {isLoading ? (
          <ProjectGridSkeleton />
        ) : error ? (
          <Card className="border-destructive/40 bg-destructive/10 p-6">
            <p className="font-sans text-sm text-destructive">
              Kon projecten niet laden: {(error as Error).message}
            </p>
          </Card>
        ) : !projects || projects.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </main>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useDeleteProject();
  const status =
    PROJECT_STATUS_LABELS[p.status ?? "draft"] ?? PROJECT_STATUS_LABELS.draft;

  return (
    <div className="group relative">
      <Link
        to="/projects/$projectId"
        params={{ projectId: p.id }}
        className="block"
      >
        <Card className="h-full border-border bg-paper p-6 backdrop-blur-sm transition-all hover:border-blood/60 hover:bg-paper hover:shadow-[0_0_32px_-8px_oklch(0.60_0.22_24/0.4)]">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl font-semibold leading-tight text-ink transition-colors group-hover:text-blood">
              {p.name}
            </h2>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 font-sans text-sm text-ink/60">
            <Building2 className="h-3.5 w-3.5" />
            <span>
              {p.client ?? "—"}
              {p.perceel ? ` · ${p.perceel}` : ""}
            </span>
          </div>
          {p.bto_reference && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/40">
              {p.bto_reference}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="rounded-full border border-blood/40 bg-blood/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blood">
              {p.phase_state ?? "VO_fase_1"}
            </span>
            <p className="font-sans text-xs text-ink/40">
              {formatRelativeDate(p.created_at)}
            </p>
          </div>
        </Card>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label="Project verwijderen"
          className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-paper/80 text-ink/40 opacity-0 backdrop-blur-sm transition-all hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Project verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt om <strong>{p.name}</strong> en alle
              gekoppelde data te verwijderen: tracés, segmenten, scans,
              trek-indelingen, eisen-scope, exports en artefacten. Deze actie
              kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuleren
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                setConfirmOpen(false);
                deleteMutation.mutate(p.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Verwijderen…" : "Definitief verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed border-border bg-paper p-12 backdrop-blur-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blood/10 ring-1 ring-blood/30">
          <FolderOpen className="h-8 w-8 text-blood" />
        </div>
        <h2 className="font-display text-2xl text-ink">Nog geen projecten</h2>
        <p className="mt-2 max-w-md font-sans text-sm text-ink/60">
          Je hebt nog geen tracé-projecten. Start een nieuw project om een
          kabeltracé te uploaden, ontwerpparameters in te vullen en de analyse
          te starten.
        </p>
        <Button type="button" size="lg" className="mt-8" onClick={onCreate}>
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
        <Card key={i} className="h-40 animate-pulse border-border bg-paper p-6" />
      ))}
    </div>
  );
}
