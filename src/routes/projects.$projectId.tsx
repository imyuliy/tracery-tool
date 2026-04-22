import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/card";
import { projectQueryOptions } from "@/lib/projects";
import { useLatestTrace, useTraceMapData } from "@/lib/workspace";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { LeftAccordion } from "@/components/workspace/LeftAccordion";
import { MapPanel } from "@/components/workspace/MapPanel";
import { RightProducts } from "@/components/workspace/RightProducts";
import { BottomDrawer } from "@/components/workspace/BottomDrawer";

export const Route = createFileRoute("/projects/$projectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Workspace — De Tracémolen` },
      {
        name: "description",
        content: `Tracé-workspace voor project ${params.projectId}.`,
      },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(projectQueryOptions(params.projectId)),
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
  component: ProjectWorkspaceRoute,
});

function ProjectWorkspaceRoute() {
  return (
    <RequireAuth>
      <Workspace />
    </RequireAuth>
  );
}

function Workspace() {
  const { projectId } = Route.useParams();
  const { data: project } = useQuery(projectQueryOptions(projectId));
  const { data: trace } = useLatestTrace(projectId);
  const traceId = trace?.id ?? null;
  const { data: mapData, isLoading: mapLoading } = useTraceMapData(traceId);
  const [highlightedLokaalId, setHighlightedLokaalId] = useState<string | null>(null);

  const handleSegmentClick = useCallback(
    (props: { bgt_lokaal_id: string }) => {
      setHighlightedLokaalId(props.bgt_lokaal_id);
    },
    [],
  );

  const handlePillClick = useCallback((lokaalId: string) => {
    setHighlightedLokaalId((prev) => (prev === lokaalId ? null : lokaalId));
  }, []);

  if (!project) throw notFound();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-paper">
      <WorkspaceHeader project={project} />
      <div className="flex min-h-0 flex-1">
        <LeftAccordion project={project} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MapPanel
              data={mapData}
              isLoading={mapLoading}
              highlightedLokaalId={highlightedLokaalId}
              onSegmentClick={handleSegmentClick}
            />
          </div>
          <BottomDrawer
            traceId={traceId}
            highlightedLokaalId={highlightedLokaalId}
            onPillClick={handlePillClick}
          />
        </main>
        <RightProducts traceId={traceId} />
      </div>
    </div>
  );
}
