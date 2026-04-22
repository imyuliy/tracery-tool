import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { TopNav } from "@/components/nav/TopNav";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PROJECT_STATUS_LABELS,
  projectQueryOptions,
} from "@/lib/projects";
import { OverviewTab } from "@/components/projects/OverviewTab";
import { StationsTab } from "@/components/projects/StationsTab";
import { TraceTab } from "@/components/projects/TraceTab";
import { ParametersTab } from "@/components/projects/ParametersTab";
import { ReportsTab } from "@/components/projects/ReportsTab";
import { useProjectTraces } from "@/lib/project-detail";

export const Route = createFileRoute("/projects/$projectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Project — De Tracémolen` },
      {
        name: "description",
        content: `Project ${params.projectId} in De Tracémolen.`,
      },
    ],
  }),
  loader: ({ params, context }) => {
    return context.queryClient.ensureQueryData(
      projectQueryOptions(params.projectId),
    );
  },
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <Card className="max-w-md border-destructive/30 bg-card p-6">
          <h2 className="font-display text-xl text-ink">
            Project kon niet worden geladen
          </h2>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            {error.message}
          </p>
          <button
            className="mt-4 inline-flex items-center rounded-md bg-ink px-4 py-2 font-sans text-sm text-paper"
            onClick={() => router.invalidate()}
          >
            Opnieuw proberen
          </button>
        </Card>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="max-w-md border-border bg-card p-6 text-center">
        <h2 className="font-display text-2xl text-ink">Project niet gevonden</h2>
        <Link
          to="/dashboard"
          className="mt-4 inline-flex items-center gap-1.5 font-sans text-sm text-cyan hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Terug naar dashboard
        </Link>
      </Card>
    </div>
  ),
  component: ProjectPage,
});

function ProjectPage() {
  return (
    <RequireAuth>
      <ProjectContent />
    </RequireAuth>
  );
}

function ProjectContent() {
  const { projectId } = Route.useParams();
  const { data: project } = useQuery({
    ...projectQueryOptions(projectId),
  });

  // Realtime channel activeren via traces-hook (side-effect).
  useProjectTraces(projectId);

  if (!project) {
    throw notFound();
  }

  const status =
    PROJECT_STATUS_LABELS[project.status ?? "draft"] ??
    PROJECT_STATUS_LABELS.draft;

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          to="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
                {project.name}
              </h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 font-sans text-xs ${status.tone}`}
              >
                {status.label}
              </span>
            </div>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              {project.client ?? "—"}
              {project.perceel ? ` · ${project.perceel}` : ""}
              {project.bto_reference ? ` · ${project.bto_reference}` : ""}
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 flex flex-wrap gap-1 bg-card">
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="stations">Stations</TabsTrigger>
            <TabsTrigger value="trace">Tracé</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
            <TabsTrigger value="analyse">Analyse</TabsTrigger>
            <TabsTrigger value="reports">Rapporten</TabsTrigger>
            <TabsTrigger value="exports">Exports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab project={project} />
          </TabsContent>
          <TabsContent value="stations">
            <StationsTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="trace">
            <TraceTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="parameters">
            <ParametersTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="analyse">
            <Placeholder
              title="Analyse"
              text="Wacht op backend-engine. BGT-segmentatie, KLIC-clashes en techniek-keuze worden in Sprint 3 toegevoegd."
            />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="exports">
            <Placeholder
              title="Exports"
              text="DOCX, XLSX en PDF-artefacten worden gegenereerd in Sprint 3."
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <Card className="border-border bg-card p-10 text-center">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted-foreground">
        {text}
      </p>
    </Card>
  );
}
