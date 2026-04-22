import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Check, Circle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import {
  useActiveParameters,
  useLatestTrace,
  useProjectScope,
  useSegmentTrace,
} from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/projects";

const ACCEPT: Record<string, string[]> = {
  "application/zip": [".zip"],
  "application/octet-stream": [".shp", ".kml", ".kmz", ".gpx"],
  "application/vnd.google-earth.kml+xml": [".kml"],
  "application/vnd.google-earth.kmz": [".kmz"],
  "application/geo+json": [".geojson"],
  "application/json": [".geojson"],
  "application/gpx+xml": [".gpx"],
};
const MAX_BYTES = 50 * 1024 * 1024;

interface Section {
  id: string;
  title: string;
  complete: boolean;
}

export function LeftAccordion({ project }: { project: Project }) {
  const qc = useQueryClient();
  const { data: trace } = useLatestTrace(project.id);
  const { data: params } = useActiveParameters(project.id);
  const { data: scope } = useProjectScope(project.id);
  const segment = useSegmentTrace();

  const sections: Section[] = [
    { id: "project", title: "1. Projectinfo", complete: !!project.client },
    { id: "trace", title: "2. Tracé", complete: !!trace?.geometry },
    { id: "scope", title: "3. Scope & eisen", complete: (scope?.length ?? 0) > 0 },
    { id: "params", title: "4. Parameters", complete: !!params },
    {
      id: "stations",
      title: "5. Stations",
      complete: !!trace?.start_station_id && !!trace?.eind_station_id,
    },
  ];

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-ink">Project setup</h2>
        <p className="mt-0.5 font-sans text-xs text-muted-foreground">
          {sections.filter((s) => s.complete).length} van {sections.length} compleet
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        <Accordion type="multiple" defaultValue={["trace"]} className="w-full">
          {sections.map((s) => (
            <AccordionItem key={s.id} value={s.id} className="border-border">
              <AccordionTrigger className="px-2 hover:no-underline">
                <span className="flex items-center gap-2 text-left font-sans text-sm text-ink">
                  {s.complete ? (
                    <Check className="h-3.5 w-3.5 text-cyan" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {s.title}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-2">
                {s.id === "project" && <ProjectSection project={project} />}
                {s.id === "trace" && (
                  <TraceSection
                    projectId={project.id}
                    trace={trace}
                    onUploaded={() => {
                      qc.invalidateQueries({ queryKey: ["latest-trace", project.id] });
                    }}
                    onSegment={() =>
                      trace && segment.mutate(trace.id)
                    }
                    segmenting={segment.isPending}
                  />
                )}
                {s.id === "scope" && <ScopeSection scope={scope ?? []} />}
                {s.id === "params" && <ParamsSection params={params} />}
                {s.id === "stations" && <StationsSection trace={trace} />}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </aside>
  );
}

function ProjectSection({ project }: { project: Project }) {
  return (
    <dl className="space-y-1.5 font-sans text-xs">
      <Row label="Opdrachtgever" value={project.client ?? "—"} />
      <Row label="Perceel" value={project.perceel ?? "—"} />
      <Row label="BTO-ref" value={project.bto_reference ?? "—"} />
    </dl>
  );
}

function TraceSection({
  projectId,
  trace,
  onUploaded,
  onSegment,
  segmenting,
}: {
  projectId: string;
  trace: { id: string; source_file: string | null; length_m: number | null } | null | undefined;
  onUploaded: () => void;
  onSegment: () => void;
  segmenting: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        toast.error("Bestand groter dan 50 MB.");
        return;
      }
      setUploading(true);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const { data: traceRow, error } = await supabase
          .from("traces")
          .insert({
            project_id: projectId,
            variant: "A",
            variant_label: "Variant A",
            source_file: file.name,
            source_format: ext,
            analysis_status: "pending",
          })
          .select("id")
          .single();
        if (error) throw error;
        const path = `${projectId}/${traceRow.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("traces")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          await supabase.from("traces").delete().eq("id", traceRow.id);
          throw upErr;
        }
        toast.success("Tracé geüpload");
        onUploaded();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [projectId, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: MAX_BYTES,
    disabled: uploading,
  });

  return (
    <div className="space-y-3">
      {trace?.source_file ? (
        <div className="rounded-md border border-border bg-paper px-3 py-2">
          <div className="flex items-center gap-2 font-sans text-xs text-ink">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{trace.source_file}</span>
          </div>
          {trace.length_m && (
            <p className="mt-1 font-sans text-[11px] text-muted-foreground">
              {Math.round(trace.length_m)} m
            </p>
          )}
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-md border-2 border-dashed bg-paper p-4 text-center transition-colors ${
            isDragActive ? "border-signal bg-signal/5" : "border-border hover:border-ink/40"
          }`}
        >
          <input {...getInputProps()} />
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-cyan" />
            ) : (
              <Upload className="h-4 w-4 text-cyan" />
            )}
          </div>
          <p className="mt-2 font-sans text-xs text-ink">
            Sleep tracé hier of klik
          </p>
          <p className="mt-0.5 font-sans text-[10px] text-muted-foreground">
            .zip · .kml · .geojson · .gpx
          </p>
        </div>
      )}
      {trace?.id && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onSegment}
          disabled={segmenting}
        >
          {segmenting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "BGT-segmentatie draaien"
          )}
        </Button>
      )}
    </div>
  );
}

function ScopeSection({ scope }: { scope: Array<{ objecttype: string; in_scope: boolean }> }) {
  if (scope.length === 0)
    return (
      <p className="font-sans text-xs text-muted-foreground">
        Geen scope-objecttypes ingesteld.
      </p>
    );
  return (
    <ul className="space-y-1 font-sans text-xs">
      {scope.map((s) => (
        <li key={s.objecttype} className="flex items-center gap-2">
          <Check className="h-3 w-3 text-cyan" />
          {s.objecttype}
        </li>
      ))}
    </ul>
  );
}

function ParamsSection({ params }: { params: { kabeltype: string; spanningsniveau_kv: number; sleufdiepte_m: number } | null | undefined }) {
  if (!params)
    return (
      <p className="font-sans text-xs text-muted-foreground">
        Nog geen actieve parameters.
      </p>
    );
  return (
    <dl className="space-y-1.5 font-sans text-xs">
      <Row label="Kabeltype" value={params.kabeltype} />
      <Row label="Spanning" value={`${params.spanningsniveau_kv} kV`} />
      <Row label="Sleufdiepte" value={`${params.sleufdiepte_m} m`} />
    </dl>
  );
}

function StationsSection({ trace }: { trace: { start_station_id: string | null; eind_station_id: string | null } | null | undefined }) {
  if (!trace)
    return (
      <p className="font-sans text-xs text-muted-foreground">
        Nog geen tracé.
      </p>
    );
  return (
    <dl className="space-y-1.5 font-sans text-xs">
      <Row label="Start" value={trace.start_station_id ? "✓ gekoppeld" : "—"} />
      <Row label="Eind" value={trace.eind_station_id ? "✓ gekoppeld" : "—"} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
