// De Tracémolen — Sprint 4 server-fns: BGT-segmentatie + map-data + WKT-ingest.
// Dunne wrappers rond de pure helpers in trace.helpers.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { runSegmentTraceByBgt } from "./trace.helpers.server";

export const config = { maxDuration: 60 };

const segmentSchema = z.object({ trace_id: z.string().uuid() });

export const segmentTraceByBgt = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => segmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runSegmentTraceByBgt({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });

const mapDataSchema = z.object({ trace_id: z.string().uuid() });

export interface TraceMapData {
  trace_geojson: Feature | null;
  segments_geojson: FeatureCollection;
  stations_geojson: FeatureCollection;
  bbox_4326: Polygon | null;
}

export const getTraceMapData = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => mapDataSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc(
      "get_trace_map_data",
      { p_trace_id: data.trace_id },
    );
    if (error) throw new Error(`get_trace_map_data: ${error.message}`);
    return (row ?? {
      trace_geojson: null,
      segments_geojson: { type: "FeatureCollection", features: [] },
      stations_geojson: { type: "FeatureCollection", features: [] },
      bbox_4326: null,
    }) as unknown as TraceMapData;
  });

// ─── set_trace_geometry_from_wkt_4326 ──────────────────────────────────
const setGeomSchema = z.object({
  trace_id: z.string().uuid(),
  wkt_4326: z.string().min(20),
});

export const setTraceGeometryFromWkt = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => setGeomSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "set_trace_geometry_from_wkt_4326",
      { p_trace_id: data.trace_id, p_wkt: data.wkt_4326 },
    );
    if (error) throw new Error(`set_trace_geometry: ${error.message}`);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      trace_id: data.trace_id,
      length_m: Number(row?.length_m ?? 0),
      geom_type: (row as { geom_type?: string } | undefined)?.geom_type ?? null,
      num_geoms: Number((row as { num_geoms?: number } | undefined)?.num_geoms ?? 1),
    };
  });
