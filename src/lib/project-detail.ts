import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Trace = Database["public"]["Tables"]["traces"]["Row"];
export type Station = Database["public"]["Tables"]["stations"]["Row"];
export type DesignParameters =
  Database["public"]["Tables"]["design_parameters"]["Row"];

export function useProjectTraces(projectId: string) {
  const qc = useQueryClient();

  // Realtime channel — live status-updates op trace.analysis_status (Sprint 3+).
  useEffect(() => {
    const channel = supabase
      .channel(`traces-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "traces",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["traces", projectId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  return useQuery({
    queryKey: ["traces", projectId],
    queryFn: async (): Promise<Trace[]> => {
      const { data, error } = await supabase
        .from("traces")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectStations(projectId: string) {
  return useQuery({
    queryKey: ["project-stations", projectId],
    queryFn: async () => {
      // Stations zijn per org, koppeling loopt via traces.start/eind_station_id.
      // Voor het Stations-tab tonen we de start/eind van de meest recente trace.
      const { data: traces, error: traceErr } = await supabase
        .from("traces")
        .select("id, start_station_id, eind_station_id, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (traceErr) throw traceErr;

      const last = traces?.[0];
      const ids = [last?.start_station_id, last?.eind_station_id].filter(
        (v): v is string => Boolean(v),
      );
      if (ids.length === 0) {
        return { traceId: last?.id ?? null, start: null, end: null };
      }
      const { data: stationsData, error: sErr } = await supabase
        .from("stations")
        .select("*")
        .in("id", ids);
      if (sErr) throw sErr;

      return {
        traceId: last?.id ?? null,
        start:
          stationsData?.find((s) => s.id === last?.start_station_id) ?? null,
        end: stationsData?.find((s) => s.id === last?.eind_station_id) ?? null,
      };
    },
  });
}

export function useDesignParameters(projectId: string) {
  return useQuery({
    queryKey: ["design-parameters", projectId],
    queryFn: async (): Promise<DesignParameters[]> => {
      const { data, error } = await supabase
        .from("design_parameters")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAuditLog(projectId: string) {
  return useQuery({
    queryKey: ["audit-log", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("project_id", projectId)
        .order("timestamp", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const KABEL_TYPES = [
  "Cu_50mm2",
  "Al_95mm2",
  "Al_150mm2",
  "Al_240mm2",
  "Al_400mm2",
  "Al_630mm2",
] as const;

export const STATION_TYPES = [
  { value: "MS_station", label: "MS-station" },
  { value: "schakelstation", label: "Schakelstation" },
  { value: "onderstation", label: "Onderstation" },
  { value: "klantaansluiting", label: "Klantaansluiting" },
] as const;
