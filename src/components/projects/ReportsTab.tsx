import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { generateReportSection } from "@/lib/server/eisenpakket.functions";

interface ReportSection {
  id: string;
  trace_id: string;
  section_number: string | null;
  section_title: string;
  content_md: string;
  sources: unknown;
  model: string | null;
  generated_at: string | null;
}

export function ReportsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);

  const { data: traces = [] } = useQuery({
    queryKey: ["project-traces", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traces")
        .select("id, variant, variant_label, length_m")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const traceId = selectedTrace ?? traces[0]?.id ?? null;

  const { data: sections = [] } = useQuery({
    queryKey: ["report-sections", traceId],
    enabled: !!traceId,
    queryFn: async (): Promise<ReportSection[]> => {
      if (!traceId) return [];
      const { data, error } = await supabase
        .from("report_sections")
        .select("*")
        .eq("trace_id", traceId)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const generate = useMutation({
    mutationFn: async (sectionNumber: string) => {
      if (!traceId) throw new Error("Geen tracé geselecteerd");
      return await generateReportSection({
        data: { trace_id: traceId, section_number: sectionNumber },
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["report-sections", traceId] });
      if (r.warnings.length > 0) {
        toast.warning(`Sectie gegenereerd met ${r.warnings.length} waarschuwingen`);
      } else {
        toast.success(`Sectie gegenereerd · ${r.eis_refs.length} eisen geciteerd`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (traces.length === 0) {
    return (
      <Card className="border-border bg-card p-10 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-3 font-display text-xl text-ink">Nog geen tracé</h3>
        <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted-foreground">
          Upload eerst een tracé op het tabblad Tracé. Daarna kun je AI-rapport-secties genereren.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
              Tracé
            </label>
            <Select
              value={traceId ?? undefined}
              onValueChange={setSelectedTrace}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Kies tracé…" />
              </SelectTrigger>
              <SelectContent>
                {traces.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.variant_label ?? t.variant}
                    {t.length_m ? ` · ${Math.round(t.length_m)} m` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => generate.mutate("3.1")}
            disabled={!traceId || generate.isPending}
            className="gap-2 bg-signal text-paper hover:bg-signal/90"
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Genereer sectie 3.1 · Projectdoel & scope
          </Button>
        </div>
      </Card>

      {sections.length === 0 ? (
        <Card className="border-dashed border-border bg-card p-8 text-center">
          <p className="font-sans text-sm text-muted-foreground">
            Nog geen secties gegenereerd voor dit tracé.
          </p>
        </Card>
      ) : (
        sections.map((s) => <SectionCard key={s.id} section={s} />)
      )}
    </div>
  );
}

function SectionCard({ section }: { section: ReportSection }) {
  const sources = (section.sources ?? {}) as {
    eisen?: Array<{ eis_code: string; brondocument: string | null; count: number }>;
    embedding_model?: string;
    generation_model?: string;
  };
  const eisRefs = sources.eisen ?? [];

  return (
    <Card className="border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-ink">
            {section.section_number} · {section.section_title}
          </h3>
          <p className="mt-0.5 font-sans text-xs text-muted-foreground">
            {section.model ?? "—"} ·{" "}
            {section.generated_at
              ? new Date(section.generated_at).toLocaleString("nl-NL")
              : "—"}
          </p>
        </div>
      </div>

      <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans text-sm text-ink">
        {section.content_md}
      </div>

      {eisRefs.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Geciteerde eisen ({eisRefs.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {eisRefs.map((e) => (
              <span
                key={e.eis_code}
                title={e.brondocument ?? ""}
                className="rounded border border-border bg-paper px-2 py-0.5 font-mono text-xs text-ink"
              >
                {e.eis_code}
                {e.count > 1 && (
                  <span className="ml-1 text-muted-foreground">×{e.count}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {sources.embedding_model && (
        <p className="mt-3 font-sans text-[10px] text-muted-foreground">
          Embeddings: {sources.embedding_model} · Generatie: {sources.generation_model}
        </p>
      )}
    </Card>
  );
}

export function ReportSectionWarnings({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 font-sans text-xs text-amber-900">
      <AlertTriangle className="h-3.5 w-3.5" />
      {count} waarschuwing{count > 1 ? "en" : ""}
    </div>
  );
}
