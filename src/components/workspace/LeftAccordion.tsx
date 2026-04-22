import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import {
  useActiveParameters,
  useGenerateTraceDescription,
  useLatestTrace,
  useProjectScope,
  useSegmentDescriptions,
  useSegmentTrace,
  useSetTraceGeometryFromWkt,
} from "@/lib/workspace";
import { parseKmlToMultiLineStringWkt } from "@/lib/kml-parser";
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
  const { data: segDescriptions = [] } = useSegmentDescriptions(trace?.id ?? null);
  const segment = useSegmentTrace();
  const setGeom = useSetTraceGeometryFromWkt();
  const generateDesc = useGenerateTraceDescription();

  const sections: Section[] = [
    { id: "project", title: "Projectinfo", complete: !!project.client },
    { id: "trace", title: "Tracé", complete: !!trace?.geometry },
    { id: "scope", title: "Scope & eisen", complete: (scope?.length ?? 0) > 0 },
    { id: "params", title: "Parameters", complete: !!params },
    {
      id: "stations",
      title: "Stations",
      complete: !!trace?.start_station_id && !!trace?.eind_station_id,
    },
    {
      id: "scan",
      title: "Scan & analyse",
      complete: segDescriptions.length > 0,
    },
  ];
  const completed = sections.filter((s) => s.complete).length;

  const runFullPipeline = useCallback(
    async (traceId: string) => {
      try {
        await segment.mutateAsync(traceId);
      } catch {
        return; // toast al getoond
      }
      try {
        await generateDesc.mutateAsync(traceId);
      } catch {
        // toast al getoond — segmentatie was wel succes
      }
    },
    [segment, generateDesc],
  );

  return (
    <aside className="glass flex h-full w-full flex-col overflow-hidden rounded-xl shadow-xl shadow-ink/10">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
            Project setup
          </h2>
          <span className="font-mono text-[10px] tracking-wider text-blood">
            {completed}/{sections.length}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {sections.map((s, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors ${
                s.complete ? "bg-blood" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <Accordion type="multiple" defaultValue={["trace"]} className="w-full">
          {sections.map((s, i) => (
            <AccordionItem key={s.id} value={s.id} className="border-border">
              <AccordionTrigger className="rounded-md px-2 transition-colors hover:bg-blood/8 hover:no-underline">
                <span className="flex items-center gap-2.5 text-left font-sans text-sm text-ink">
                  <span className="font-mono text-[10px] text-ink/40">
                    0{i + 1}
                  </span>
                  <CompletenessDot state={s.complete ? "complete" : "incomplete"} />
                  {s.title}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-3">
                {s.id === "project" && <ProjectSection project={project} />}
                {s.id === "trace" && (
                  <TraceSection
                    projectId={project.id}
                    trace={trace}
                    onUploaded={() => {
                      qc.invalidateQueries({ queryKey: ["latest-trace", project.id] });
                    }}
                    onIngestKml={async (traceId, wkt4326) => {
                      await setGeom.mutateAsync({ traceId, wkt4326 });
                      toast.success("Tracé ingelezen — pipeline draait");
                      void runFullPipeline(traceId);
                    }}
                    onSegment={() =>
                      trace && segment.mutate(trace.id)
                    }
                    segmenting={segment.isPending}
                    ingesting={setGeom.isPending || generateDesc.isPending}
                  />
                )}
                {s.id === "scope" && <ScopeSection scope={scope ?? []} />}
                {s.id === "params" && <ParamsSection params={params} />}
                {s.id === "stations" && <StationsSection trace={trace} />}
                {s.id === "scan" && (
                  <ScanSection count={segDescriptions.length} />
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </aside>
  );
}

function ScanSection({ count }: { count: number }) {
  if (count === 0) {
    return (
      <p className="font-sans text-xs text-ink/50">
        Nog geen segment-scan. Start via &ldquo;Brondocument v1&rdquo; rechts.
      </p>
    );
  }
  return (
    <dl className="space-y-1.5 font-sans text-xs">
      <Row label="Segmenten gescand" value={String(count)} />
      <Row label="Status" value="✓ klaar voor export" />
    </dl>
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
  onIngestKml,
  onSegment,
  segmenting,
  ingesting,
}: {
  projectId: string;
  trace: { id: string; source_file: string | null; length_m: number | null } | null | undefined;
  onUploaded: () => void;
  onIngestKml: (traceId: string, wkt4326: string) => Promise<void>;
  onSegment: () => void;
  segmenting: boolean;
  ingesting: boolean;
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

        // 1. Parse KML client-side voor we de DB-row aanmaken — als parsing
        //    faalt willen we geen verweesde trace zonder geometrie.
        let parsedWkt: string | null = null;
        let chosenLayer: string | null = null;
        let availableLayers: { name: string; lineCount: number; pointCount: number }[] = [];
        if (ext === "kml") {
          const text = await file.text();
          const parsed = parseKmlToMultiLineStringWkt(text);
          parsedWkt = parsed.wkt;
          chosenLayer = parsed.chosenLayer;
          availableLayers = parsed.availableLayers.map((l) => ({
            name: l.name,
            lineCount: l.lineCount,
            pointCount: l.pointCount,
          }));
          // Diagnostische toast — laat zien wat er gevonden is.
          const others = availableLayers
            .filter((l) => l.name !== chosenLayer)
            .map((l) => `${l.name} (${l.lineCount})`)
            .join(", ");
          toast.message(
            `KML gelezen: ${parsed.lineCount} lijnen, ${parsed.pointCount} punten`,
            {
              description:
                `Gekozen laag: ${chosenLayer}` +
                (others ? ` · andere lagen: ${others}` : ""),
            },
          );
        }

        // 2. Insert trace-row.
        const variantLabel = chosenLayer
          ? `Variant A — ${chosenLayer}`
          : "Variant A";
        const { data: traceRow, error } = await supabase
          .from("traces")
          .insert({
            project_id: projectId,
            variant: "A",
            variant_label: variantLabel,
            source_file: file.name,
            source_format: ext,
            analysis_status: "pending",
          })
          .select("id")
          .single();
        if (error) throw error;

        // 3. Upload originele file (raw, voor audit).
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

        // 4. Als KML: zet eerst de geometrie. Pas daarna markeren we deze
        // trace als "latest" in de UI. Zo voorkomen we dat een mislukte ingest
        // als lege actieve trace blijft hangen en de map grijs maakt.
        if (parsedWkt) {
          try {
            await onIngestKml(traceRow.id, parsedWkt);
            onUploaded();
          } catch (ingestErr) {
            await Promise.allSettled([
              supabase.storage.from("traces").remove([path]),
              supabase.from("traces").delete().eq("id", traceRow.id),
            ]);
            throw ingestErr;
          }
        } else {
          toast.success("Tracé geüpload");
          onUploaded();
          toast.message("Alleen KML-parsing is momenteel actief.");
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [projectId, onUploaded, onIngestKml],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: MAX_BYTES,
    disabled: uploading,
  });

  const [showReplace, setShowReplace] = useState(false);
  const showDropzone = !trace?.source_file || showReplace;

  return (
    <div className="space-y-3">
      {trace?.source_file && !showReplace && (
        <div className="rounded-md border border-border bg-paper px-3 py-2 transition-colors hover:border-blood/40">
          <div className="flex items-center gap-2 font-sans text-xs text-ink">
            <FileText className="h-3.5 w-3.5 text-blood" />
            <span className="truncate">{trace.source_file}</span>
          </div>
          {trace.length_m && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/50">
              {Math.round(trace.length_m)} m
            </p>
          )}
          <button
            type="button"
            className="mt-2 font-mono text-[10px] uppercase tracking-wider text-blood hover:text-ember"
            onClick={() => setShowReplace(true)}
          >
            Vervang tracé →
          </button>
        </div>
      )}
      {showDropzone && (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-md border-2 border-dashed p-4 text-center transition-all ${
            isDragActive
              ? "border-blood bg-blood/8"
              : "border-border bg-paper/60 hover:border-blood/60 hover:bg-blood/5"
          }`}
        >
          <input {...getInputProps()} />
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-blood/10 ring-1 ring-blood/30">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-blood" />
            ) : (
              <Upload className="h-4 w-4 text-blood" />
            )}
          </div>
          <p className="mt-2 font-sans text-xs text-ink">
            Sleep tracé hier of klik
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink/40">
            kml (geojson · gpx · zip volgen)
          </p>
        </div>
      )}
      {ingesting && (
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-blood">
          <Loader2 className="h-3 w-3 animate-spin" />
          Pipeline draait — BGT + omschrijving
        </p>
      )}
      {trace?.id && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onSegment}
          disabled={segmenting || ingesting}
        >
          {segmenting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "BGT-segmentatie opnieuw draaien"
          )}
        </Button>
      )}
    </div>
  );
}

function ScopeSection({ scope }: { scope: Array<{ objecttype: string; in_scope: boolean }> }) {
  if (scope.length === 0)
    return (
      <p className="font-sans text-xs text-ink/50">
        Geen scope-objecttypes ingesteld.
      </p>
    );
  return (
    <ul className="space-y-1 font-sans text-xs">
      {scope.map((s) => (
        <li key={s.objecttype} className="flex items-center gap-2 text-ink">
          <CompletenessDot state="complete" />
          {s.objecttype}
        </li>
      ))}
    </ul>
  );
}

// Completeness-dot — UI-chrome palette (zwart/grijs/rood, geen groen/oranje).
//   complete   → gevulde zwarte cirkel
//   incomplete → open grijze cirkel
//   error      → rood vierkantje
function CompletenessDot({
  state,
}: {
  state: "complete" | "incomplete" | "error";
}) {
  if (state === "error") {
    return (
      <span
        aria-label="fout"
        className="inline-block h-2.5 w-2.5 rounded-[1px] bg-blood shadow-[0_0_6px_-1px_oklch(0.58_0.22_24/0.6)]"
      />
    );
  }
  if (state === "complete") {
    return (
      <span
        aria-label="compleet"
        className="inline-block h-2.5 w-2.5 rounded-full bg-ink"
      />
    );
  }
  return (
    <span
      aria-label="incompleet"
      className="inline-block h-2.5 w-2.5 rounded-full border border-ink/40 bg-transparent"
    />
  );
}

function ParamsSection({ params }: { params: { kabeltype: string; spanningsniveau_kv: number; sleufdiepte_m: number } | null | undefined }) {
  if (!params)
    return (
      <p className="font-sans text-xs text-ink/50">
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
      <p className="font-sans text-xs text-ink/50">
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
      <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
        {label}
      </dt>
      <dd className="text-right font-sans text-ink">{value}</dd>
    </div>
  );
}
