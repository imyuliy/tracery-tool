// De Tracémolen — Sprint 4 Workspace data hooks & types.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getTraceMapData,
  segmentTraceByBgt,
  type TraceMapData,
} from "@/lib/server/trace.functions";
import {
  generateSegmentScanV1,
  exportBrondocumentV1Docx,
} from "@/lib/server/scan.functions";
import {
  generateTrekPartDescriptions,
  exportTrekHierarchyDocx,
} from "@/lib/server/trek_part.functions";
import {
  runEisenverificatie,
  exportEisenverificatieDocx,
} from "@/lib/server/eisenverificatie.functions";

export type PhaseState =
  | "VO_fase_1"
  | "VO_fase_2"
  | "DO"
  | "UO"
  | "Realisatie";

export const PHASE_ORDER: PhaseState[] = [
  "VO_fase_1",
  "VO_fase_2",
  "DO",
  "UO",
  "Realisatie",
];

export const PHASE_LABELS: Record<PhaseState, string> = {
  VO_fase_1: "VO fase 1",
  VO_fase_2: "VO fase 2",
  DO: "DO",
  UO: "UO",
  Realisatie: "Realisatie",
};

// BGT feature_type kleurpalet — data-viz palette (los van UI-chrome).
// Grijstinten + rood-accent. Twee afwijkingen: groen (gras) + blauw (water)
// omdat NL publiek dat verwacht op topografische kaart.
export const BGT_COLORS: Record<string, string> = {
  wegdeel: "#2D2D2D",                 // donkergrijs
  ondersteunendwegdeel: "#707070",    // middengrijs
  begroeidterreindeel: "#8A9A5B",     // lichtgrijs-groen (afwijking: gras)
  onbegroeidterreindeel: "#C4A572",   // zandkleur
  waterdeel: "#1F3A5F",               // donkerblauw (afwijking: water)
  pand: "#D62828",                    // signaal-rood (alarmkleur)
  overigbouwwerk: "#5D2A5D",          // diep-paars
  scheiding: "#000000",               // zwart
  scheiding_vlak: "#000000",          // zwart (PDOK collection-naam)
  spoor: "#404040",                   // donkergrijs (legacy)
  default: "#9A9A9A",                 // neutraal grijs
};

// Tracé-lijn zelf — helderder rood, krijgt witte outline in MapPanel.
export const TRACE_COLOR = "#E63946";
export const TRACE_OUTLINE_COLOR = "#FFFFFF";

// BGT-legend labels (Nederlands, voor UI).
export const BGT_LABELS: Record<string, string> = {
  wegdeel: "Wegdeel",
  ondersteunendwegdeel: "Ondersteunend wegdeel",
  begroeidterreindeel: "Begroeid terrein",
  onbegroeidterreindeel: "Onbegroeid terrein",
  waterdeel: "Waterdeel",
  pand: "Pand",
  overigbouwwerk: "Overig bouwwerk",
  scheiding: "Scheiding",
  scheiding_vlak: "Scheiding",
};

export const BGT_FEATURE_TYPES = Object.keys(BGT_COLORS).filter(
  (k) => k !== "default",
);

export function colorFor(featureType: string | null | undefined): string {
  if (!featureType) return BGT_COLORS.default;
  return BGT_COLORS[featureType] ?? BGT_COLORS.default;
}

// ─── Query: BGT map-data ────────────────────────────────────────────────
export function useTraceMapData(traceId: string | null) {
  return useQuery({
    queryKey: ["trace-map", traceId],
    enabled: !!traceId,
    staleTime: 60_000,
    queryFn: async (): Promise<TraceMapData> => {
      if (!traceId) throw new Error("no trace");
      return await getTraceMapData({ data: { trace_id: traceId } });
    },
  });
}

// ─── Query: laatste tracé van project ──────────────────────────────────
export function useLatestTrace(projectId: string) {
  return useQuery({
    queryKey: ["latest-trace", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traces")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// (Sprint 5) useTraceDescription verwijderd — trace_description-flow is dead code.
// Brondocument-flow vervangt deze.

// ─── Query: project_artifacts (DOCX exports) ───────────────────────────
export function useProjectArtifacts(projectId: string) {
  return useQuery({
    queryKey: ["project-artifacts", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_artifacts")
        .select("*")
        .eq("project_id", projectId)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Query: design_parameters (active) ─────────────────────────────────
export function useActiveParameters(projectId: string) {
  return useQuery({
    queryKey: ["active-parameters", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_parameters")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// ─── Query: product_catalog ────────────────────────────────────────────
export function useProductCatalog() {
  return useQuery({
    queryKey: ["product-catalog"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Query: scope (objecttypes + completeness) ─────────────────────────
export function useProjectScope(projectId: string) {
  return useQuery({
    queryKey: ["project-scope", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_eisen_scope")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Mutation: BGT-segmentatie ─────────────────────────────────────────
export function useSegmentTrace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (traceId: string) => {
      return await segmentTraceByBgt({ data: { trace_id: traceId } });
    },
    onSuccess: (_r, traceId) => {
      qc.invalidateQueries({ queryKey: ["trace-map", traceId] });
      qc.invalidateQueries({ queryKey: ["latest-trace"] });
      toast.success("BGT-segmentatie voltooid");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// (Sprint 5) useGenerateTraceDescription + useExportDocx verwijderd —
// trace_description / DOCX-export-flow is dead code (Brondocument-flow vervangt).

// ─── Mutation: KML-ingest (zet geometry vanuit WKT 4326) ───────────────
export function useSetTraceGeometryFromWkt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { traceId: string; wkt4326: string }) => {
      const { data, error } = await supabase.rpc("set_trace_geometry_from_wkt_4326", {
        p_trace_id: vars.traceId,
        p_wkt: vars.wkt4326,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        trace_id: vars.traceId,
        length_m: Number((row as { length_m?: number } | null)?.length_m ?? 0),
        geom_type: (row as { geom_type?: string } | null)?.geom_type ?? null,
        num_geoms: Number((row as { num_geoms?: number } | null)?.num_geoms ?? 1),
      };
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["trace-map", vars.traceId] });
      qc.invalidateQueries({ queryKey: ["latest-trace"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Phase-state mutation ──────────────────────────────────────────────
export function usePromotePhase(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phase: PhaseState) => {
      const { error } = await supabase
        .from("projects")
        .update({ phase_state: phase })
        .eq("id", projectId);
      if (error) throw error;
      return phase;
    },
    onSuccess: (phase) => {
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Fase gepromoot naar ${PHASE_LABELS[phase]}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Query: segment_descriptions per trace ─────────────────────────────
export function useSegmentDescriptions(traceId: string | null) {
  return useQuery({
    queryKey: ["segment-descriptions", traceId],
    enabled: !!traceId,
    queryFn: async () => {
      if (!traceId) return [];
      const { data, error } = await supabase
        .from("segment_descriptions")
        .select("*, segments!inner(id, sequence, km_start, km_end, length_m, bgt_feature_type, bgt_lokaal_id, beheerder)")
        .eq("trace_id", traceId)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      // Dedupe per segment_id — keep most recent.
      const seen = new Set<string>();
      const out: typeof data = [];
      for (const row of data ?? []) {
        if (seen.has(row.segment_id)) continue;
        seen.add(row.segment_id);
        out.push(row);
      }
      return out;
    },
  });
}

// ─── Mutation: per-segment scan v1 ─────────────────────────────────────
export function useGenerateSegmentScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { traceId: string; maxSegments?: number }) => {
      return await generateSegmentScanV1({
        data: { trace_id: vars.traceId, max_segments: vars.maxSegments },
      });
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["segment-descriptions", vars.traceId] });
      const note = vars.maxSegments
        ? ` (test: ${res.segments_processed} segment)`
        : "";
      toast.success(`Segment-scan voltooid${note}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Mutation: Brondocument v1 DOCX-export ─────────────────────────────
export function useExportBrondocumentV1() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (traceId: string) => {
      return await exportBrondocumentV1Docx({ data: { trace_id: traceId } });
    },
    onSuccess: (result) => {
      if (result?.url && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = result.filename ?? "brondocument.docx";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      qc.invalidateQueries({ queryKey: ["project-artifacts"] });
      toast.success(`Brondocument gedownload: ${result?.filename ?? ""}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Query: trek-part descriptions (Sprint 4.6) ────────────────────────
export function useTrekParts(traceId: string | null) {
  return useQuery({
    queryKey: ["trek-parts", traceId],
    enabled: !!traceId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!traceId) return [];
      const { data, error } = await supabase
        .from("trek_part_descriptions")
        .select("*")
        .eq("trace_id", traceId)
        .eq("version", 1)
        .order("part_idx", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Mutation: trek-part generatie (Sprint 4.6) ────────────────────────
export function useGenerateTrekParts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (traceId: string) => {
      return await generateTrekPartDescriptions({
        data: { trace_id: traceId },
      });
    },
    onSuccess: (_r, traceId) => {
      qc.invalidateQueries({ queryKey: ["trek-parts", traceId] });
      toast.success("Trek-overzicht gegenereerd");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Mutation: trek-hiërarchie DOCX-export (Sprint 4.6) ────────────────
export function useExportTrekDocx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (traceId: string) => {
      return await exportTrekHierarchyDocx({ data: { trace_id: traceId } });
    },
    onSuccess: (result) => {
      if (result?.url && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = result.filename ?? "trek-plan.docx";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      qc.invalidateQueries({ queryKey: ["project-artifacts"] });
      toast.success(`Trek-DOCX gedownload: ${result?.filename ?? ""}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Query: segmenten van één trek (voor map-highlight) ────────────────
export function useTrekSegments(traceId: string | null, partIdx: number | null) {
  return useQuery({
    queryKey: ["trek-segments", traceId, partIdx],
    enabled: !!traceId && partIdx !== null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!traceId || partIdx === null) return [];
      const { data, error } = await supabase.rpc("segments_with_part_idx", {
        p_trace_id: traceId,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        segment_id: string;
        part_idx: number;
      }>;
      return rows.filter((r) => r.part_idx === partIdx).map((r) => r.segment_id);
    },
  });
}

// ─── Query: eisenverificaties per trace (Sprint 5.3 — view + override) ─
export function useEisVerifications(traceId: string | null) {
  return useQuery({
    queryKey: ["eis-verifications", traceId],
    enabled: !!traceId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!traceId) return [];
      const { data, error } = await supabase
        .from("v_eis_verifications_effective")
        .select(
          `id, trace_id, eis_id, version,
           ai_status, ai_onderbouwing_md, ai_confidence,
           override_status, override_reason_md, override_by, override_at,
           effective_status, is_overridden,
           verificatiemethode, geraakte_trek_idx, geraakte_segment_ids,
           generated_at, model,
           eis:eisen(eis_code, eistitel, eistekst, objecttype, fase, brondocument, verificatiemethode),
           override_user:user_profiles!eis_verifications_override_by_fkey(full_name)`,
        )
        .eq("trace_id", traceId)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Mutation: override op eisenverificatie zetten/wissen (Sprint 5.3) ─
export function useSetEisVerificationOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      verificationId: string;
      overrideStatus: string | null;
      reasonMd: string | null;
    }) => {
      const { data, error } = await supabase.rpc(
        "set_eis_verification_override",
        {
          p_verification_id: args.verificationId,
          p_override_status: args.overrideStatus,
          p_reason_md: args.reasonMd,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["eis-verifications"] });
      toast.success(
        vars.overrideStatus
          ? "Override opgeslagen"
          : "Override verwijderd — AI-status actief",
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Mutation: eisenverificatie genereren (Sprint 5.2) ─────────────────
export function useRunEisenverificatie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (traceId: string) => {
      return await runEisenverificatie({ data: { trace_id: traceId } });
    },
    onSuccess: (result, traceId) => {
      qc.invalidateQueries({ queryKey: ["eis-verifications", traceId] });
      const s = result?.status_summary ?? {};
      toast.success(
        `Eisenverificatie klaar: ${result?.eisen_verified ?? 0} eisen · ` +
          `${s.voldoet ?? 0} voldoet · ${s.twijfelachtig ?? 0} twijfel · ` +
          `${s.voldoet_niet ?? 0} voldoet niet`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Mutation: eisenverificatie DOCX-export (Sprint 5.2) ───────────────
export function useExportEisenverificatieDocx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (traceId: string) => {
      return await exportEisenverificatieDocx({ data: { trace_id: traceId } });
    },
    onSuccess: (result) => {
      if (result?.url && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = result.filename ?? "eisenverificatie.docx";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      qc.invalidateQueries({ queryKey: ["project-artifacts"] });
      toast.success(`Eisenverificatie gedownload: ${result?.filename ?? ""}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
