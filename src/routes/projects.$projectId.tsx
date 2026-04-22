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
      <div className="flex min-h-screen items-center justify-center bg-bone px-4">
        <Card className="max-w-md border-blood/40 bg-popover p-6 text-ink">
          <h2 className="font-display text-xl">Project kon niet worden geladen</h2>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            {error.message}
          </p>
          <button
            className="mt-4 inline-flex items-center rounded-md bg-blood px-4 py-2 font-sans text-sm text-paper transition-colors hover:bg-ember"
            onClick={() => router.invalidate()}
          >
            Opnieuw proberen
          </button>
        </Card>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-bone px-4">
      <Card className="max-w-md border-border bg-popover p-6 text-center text-ink">
        <h2 className="font-display text-2xl">Project niet gevonden</h2>
        <Link
          to="/dashboard"
          className="mt-4 inline-flex items-center gap-1.5 font-sans text-sm text-blood transition-colors hover:text-ember hover:underline"
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
    <div className="relative h-screen w-screen overflow-hidden bg-bone text-ink">
      {/* Fullscreen map as canvas */}
      <div className="absolute inset-0">
        <MapPanel
          data={mapData}
          isLoading={mapLoading}
          highlightedLokaalId={highlightedLokaalId}
          onSegmentClick={handleSegmentClick}
        />
      </div>

      {/* Floating header — full width, glass */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="pointer-events-auto">
          <WorkspaceHeader project={project} />
        </div>
      </div>

      {/* Left floating panel */}
      <div className="pointer-events-none absolute left-4 top-[76px] bottom-[calc(var(--drawer-h,260px)+16px)] z-10 w-[340px]">
        <div className="pointer-events-auto h-full">
          <LeftAccordion project={project} />
        </div>
      </div>

      {/* Right floating panel */}
      <div className="pointer-events-none absolute right-4 top-[76px] bottom-[calc(var(--drawer-h,260px)+16px)] z-10 w-[320px]">
        <div className="pointer-events-auto h-full">
          <RightProducts traceId={traceId} />
        </div>
      </div>

      {/* Bottom drawer */}
      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
        <div className="pointer-events-auto">
          <BottomDrawer
            traceId={traceId}
            highlightedLokaalId={highlightedLokaalId}
            onPillClick={handlePillClick}
          />
        </div>
      </div>
    </div>
  );
}
