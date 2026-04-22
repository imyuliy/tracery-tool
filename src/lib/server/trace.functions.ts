// De Tracémolen — Sprint 4 server-fns: BGT-segmentatie, tracé-omschrijving, .docx-export.
// Dunne wrappers rond de pure helpers in trace.helpers.server.ts. De helpers
// worden ook gedeeld met de smoke-test route (api.public.smoketest-sprint4.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import {
  runSegmentTraceByBgt,
  runGenerateTraceDescription,
  runExportTraceDescriptionDocx,
} from "./trace.helpers.server";

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

const generateSchema = z.object({ trace_id: z.string().uuid() });

export const generateTraceDescription = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runGenerateTraceDescription({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });

const exportSchema = z.object({
  trace_id: z.string().uuid(),
  section_id: z.string().uuid().optional(),
});

export const exportTraceDescriptionDocx = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => exportSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runExportTraceDescriptionDocx({
      supabase: context.supabase,
      traceId: data.trace_id,
      sectionId: data.section_id,
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
// Zet geometrie op een trace vanuit MultiLineString WKT in EPSG:4326
// (bv. uit KML). RPC handelt transformatie naar 28992 + length_m af.
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
    };
  });
