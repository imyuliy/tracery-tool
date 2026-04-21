import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectTraces, type Trace } from "@/lib/project-detail";
import { formatRelativeDate } from "@/lib/projects";

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
const VARIANT_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-ink/80 border-border",
  running: "bg-cyan/15 text-cyan border-cyan/30",
  done: "bg-emerald-100 text-emerald-900 border-emerald-300",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

export function TraceTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: traces, isLoading } = useProjectTraces(projectId);
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
        const variantIndex = traces?.length ?? 0;
        const variant =
          VARIANT_LABELS[variantIndex] ?? `V${variantIndex + 1}`;

        const { data: traceRow, error: insErr } = await supabase
          .from("traces")
          .insert({
            project_id: projectId,
            variant,
            variant_label: `Variant ${variant}`,
            source_file: file.name,
            source_format: ext,
            analysis_status: "pending",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        const path = `${projectId}/${traceRow.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("traces")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          // Roll back trace-row als upload faalt.
          await supabase.from("traces").delete().eq("id", traceRow.id);
          throw upErr;
        }

        toast.success(
          "Tracé geüpload. Analyse staat in wacht — backend-engine volgt in Sprint 3.",
        );
        qc.invalidateQueries({ queryKey: ["traces", projectId] });
        qc.invalidateQueries({ queryKey: ["project-stations", projectId] });
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [projectId, qc, traces?.length],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: MAX_BYTES,
    disabled: uploading,
  });

  const handleDelete = async (trace: Trace) => {
    if (!confirm(`Tracé ${trace.variant_label ?? trace.variant} verwijderen?`)) return;
    try {
      if (trace.source_file) {
        const ext = trace.source_format ?? trace.source_file.split(".").pop();
        await supabase.storage
          .from("traces")
          .remove([`${projectId}/${trace.id}.${ext}`]);
      }
      const { error } = await supabase.from("traces").delete().eq("id", trace.id);
      if (error) throw error;
      toast.success("Tracé verwijderd");
      qc.invalidateQueries({ queryKey: ["traces", projectId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        {...getRootProps()}
        className={`cursor-pointer border-2 border-dashed bg-card p-10 text-center transition-colors ${
          isDragActive
            ? "border-signal bg-signal/5"
            : "border-border hover:border-ink/40"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input {...getInputProps()} />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-cyan" />
          ) : (
            <Upload className="h-7 w-7 text-cyan" />
          )}
        </div>
        <h3 className="mt-4 font-display text-lg text-ink">
          {uploading
            ? "Bezig met uploaden…"
            : isDragActive
              ? "Laat los om te uploaden"
              : "Sleep een tracé hierheen of klik om te kiezen"}
        </h3>
        <p className="mt-1 font-sans text-xs text-muted-foreground">
          .zip · .shp · .kml · .kmz · .geojson · .gpx — max 50&nbsp;MB
        </p>
      </Card>

      <Card className="border-border bg-card p-0">
        <div className="border-b border-border px-5 py-3">
          <h3 className="font-display text-base font-semibold text-ink">
            Geüploade tracés
          </h3>
        </div>
        {isLoading ? (
          <p className="px-5 py-6 font-sans text-sm text-muted-foreground">
            Laden…
          </p>
        ) : !traces || traces.length === 0 ? (
          <p className="px-5 py-6 font-sans text-sm text-muted-foreground">
            Nog geen tracés geüpload.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Bestand</TableHead>
                <TableHead className="text-right">Lengte</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Geüpload</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map((t) => {
                const tone =
                  STATUS_TONE[t.analysis_status ?? "pending"] ??
                  STATUS_TONE.pending;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-display font-semibold text-ink">
                      {t.variant_label ?? t.variant}
                    </TableCell>
                    <TableCell className="font-sans text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.source_file ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-sans text-sm text-muted-foreground">
                      {t.length_m ? `${Math.round(t.length_m)} m` : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full border px-2 py-0.5 font-sans text-xs ${tone}`}
                      >
                        {t.analysis_status ?? "pending"}
                      </span>
                    </TableCell>
                    <TableCell className="font-sans text-xs text-muted-foreground">
                      {formatRelativeDate(t.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(t)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
