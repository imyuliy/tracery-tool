// Pure async helpers voor Sprint 4 — gedeeld door trace.functions.ts.
// Sprint 5: trace_description / DOCX-export verwijderd; alleen
// BGT-segmentatie + helpers blijven.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type SupabaseLike = SupabaseClient<Database>;

// PDOK migreerde 2025-2026 de BGT WFS v1_0 naar OGC API Features.
// De oude /lv/bgt/wfs/v1_0 endpoint geeft 404. We gebruiken nu de
// nieuwe /lv/bgt/ogc/v1 endpoint met collection-IDs (lowercase, geen "bgt:" prefix).
const PDOK_BGT_OGC = "https://api.pdok.nl/lv/bgt/ogc/v1";
const BGT_FEATURETYPES = [
  "wegdeel",
  "waterdeel",
  "ondersteunendwegdeel",
  "onbegroeidterreindeel",
  "begroeidterreindeel",
  "pand",
  "overigbouwwerk",
  "scheiding_vlak",
] as const;
const BBOX_BUFFER_M = 10;
const STAGING_BATCH = 250;
const MAX_TOKENS = 4000;
const MAX_SEGMENTS_IN_PROMPT = 50;

// ============================================================================
// 1) segmentTraceByBgt
// ============================================================================

export interface SegmentResult {
  trace_id: string;
  segment_count: number;
  features_fetched: number;
  staging_inserted: number;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
  bgt_distribution: Array<{
    bgt_feature_type: string | null;
    segment_count: number | null;
    total_length_m: number | null;
    pct_of_trace: number | null;
  }>;
}

export async function runSegmentTraceByBgt(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<SegmentResult> {
  const t0 = Date.now();
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(
      `[segment ${opts.traceId}] +${Date.now() - t0}ms ${msg}`,
      extra ? JSON.stringify(extra) : "",
    );

  const { data: trace, error: traceErr } = await opts.supabase
    .from("traces")
    .select("id, project_id")
    .eq("id", opts.traceId)
    .single();
  if (traceErr || !trace) {
    throw new Error(`Trace ${opts.traceId} niet gevonden`);
  }

  const { data: bboxRows, error: bboxErr } = await supabaseAdmin.rpc(
    "trace_bbox_28992",
    { p_trace_id: opts.traceId, p_buffer_m: BBOX_BUFFER_M },
  );
  if (bboxErr) throw new Error(`bbox: ${bboxErr.message}`);
  const bbox = bboxRows?.[0];
  if (!bbox) throw new Error("Geen bbox kunnen bepalen");
  const xmin = Number(bbox.xmin);
  const ymin = Number(bbox.ymin);
  const xmax = Number(bbox.xmax);
  const ymax = Number(bbox.ymax);
  log("bbox-ok", { xmin, ymin, xmax, ymax });

  const allFeatures: PdokFeature[] = [];
  for (const ft of BGT_FEATURETYPES) {
    const features = await fetchPdokFeatures(ft, xmin, ymin, xmax, ymax);
    log(`pdok-${ft}`, { count: features.length });
    allFeatures.push(...features);
  }

  // Dedupe ALLEEN op lokaal_id (first wins). De UNIQUE constraint in
  // bgt_features_staging is (trace_id, lokaal_id) — PDOK levert soms dezelfde
  // lokaal_id onder meerdere feature_types (bijv. wegdeel + ondersteunendwegdeel),
  // wat ON CONFLICT DO UPDATE laat crashen met "command cannot affect row a
  // second time". First wins; we loggen welke feature_types verloren gaan.
  const seen = new Set<string>();
  const dedupedFeatures: PdokFeature[] = [];
  const droppedByType = new Map<string, number>();
  for (const f of allFeatures) {
    if (seen.has(f.lokaal_id)) {
      droppedByType.set(
        f.feature_type,
        (droppedByType.get(f.feature_type) ?? 0) + 1,
      );
      continue;
    }
    seen.add(f.lokaal_id);
    dedupedFeatures.push(f);
  }
  log("dedupe", {
    raw: allFeatures.length,
    deduped: dedupedFeatures.length,
    duplicates: allFeatures.length - dedupedFeatures.length,
    dropped_by_feature_type: Object.fromEntries(droppedByType),
  });

  await supabaseAdmin
    .from("bgt_features_staging")
    .delete()
    .eq("trace_id", opts.traceId);

  let stagingInserted = 0;
  for (let i = 0; i < dedupedFeatures.length; i += STAGING_BATCH) {
    const batch = dedupedFeatures.slice(i, i + STAGING_BATCH);
    const { data: inserted, error: insErr } = await supabaseAdmin.rpc(
      "bgt_staging_insert_batch",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { p_trace_id: opts.traceId, p_features: batch as any },
    );
    if (insErr) throw new Error(`staging-batch ${i}: ${insErr.message}`);
    stagingInserted += inserted ?? 0;
  }
  log("staging-ok", { inserted: stagingInserted });

  const { data: segCount, error: segErr } = await supabaseAdmin.rpc(
    "segment_trace_by_bgt",
    { p_trace_id: opts.traceId },
  );
  if (segErr) throw new Error(`segment_trace_by_bgt: ${segErr.message}`);
  log("segments-ok", { segCount });

  const { data: summary } = await supabase_or_admin(opts.supabase)
    .from("v_trace_bgt_summary")
    .select("bgt_feature_type, segment_count, total_length_m, pct_of_trace")
    .eq("trace_id", opts.traceId)
    .order("total_length_m", { ascending: false });

  await supabaseAdmin.from("audit_log").insert({
    project_id: trace.project_id,
    user_id: opts.userId,
    action: "segment_trace_by_bgt",
    resource_type: "trace",
    resource_id: opts.traceId,
    payload: {
      segment_count: segCount ?? 0,
      bgt_features_fetched: allFeatures.length,
      staging_inserted: stagingInserted,
      bbox: { xmin, ymin, xmax, ymax },
    },
  });

  return {
    trace_id: opts.traceId,
    segment_count: segCount ?? 0,
    features_fetched: allFeatures.length,
    staging_inserted: stagingInserted,
    bbox: { xmin, ymin, xmax, ymax },
    bgt_distribution: summary ?? [],
  };
}

// Helper: gebruikt opts.supabase als die er is, anders admin (smoke-test pad).
function supabase_or_admin(s: SupabaseLike): SupabaseLike {
  return s ?? (supabaseAdmin as unknown as SupabaseLike);
}

interface PdokFeature {
  lokaal_id: string;
  feature_type: string;
  bgt_type: string | null;
  bgt_subtype: string | null;
  geometry_wkt: string;
  attributes: Record<string, unknown>;
}

// OGC API Features call. Endpoint format:
//   GET /collections/{collectionId}/items?bbox=xmin,ymin,xmax,ymax
//        &bbox-crs=http://www.opengis.net/def/crs/EPSG/0/28992
//        &crs=http://www.opengis.net/def/crs/EPSG/0/28992
//        &f=json&limit=N
// Pagineert via "next" rel-link.
const OGC_CRS_28992 = "http://www.opengis.net/def/crs/EPSG/0/28992";
const PDOK_PAGE_LIMIT = 1000; // OGC server-side max is meestal 1000
const PDOK_MAX_PAGES = 10;

async function fetchPdokFeatures(
  collectionId: string,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): Promise<PdokFeature[]> {
  const initialParams = new URLSearchParams({
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    "bbox-crs": OGC_CRS_28992,
    crs: OGC_CRS_28992,
    f: "json",
    limit: String(PDOK_PAGE_LIMIT),
  });
  let nextUrl: string | null =
    `${PDOK_BGT_OGC}/collections/${collectionId}/items?${initialParams.toString()}`;
  const out: PdokFeature[] = [];
  let pages = 0;
  while (nextUrl && pages < PDOK_MAX_PAGES) {
    pages++;
    const res = await fetch(nextUrl);
    if (!res.ok) {
      console.warn(
        `PDOK ${collectionId} faalde: HTTP ${res.status} (page ${pages})`,
      );
      return out;
    }
    const json = (await res.json()) as {
      features?: Array<{
        id?: string;
        properties: Record<string, unknown>;
        geometry: { type: string; coordinates: unknown };
      }>;
      links?: Array<{ rel: string; href: string }>;
    };
    const features = json.features ?? [];
    for (const f of features) {
      const props = f.properties ?? {};
      const lokaalIdRaw =
        (props.lokaal_id as string) ??
        (props.lokaalID as string) ??
        (props.lokaalid as string) ??
        f.id ??
        crypto.randomUUID();
      const polygons = extractPolygons(f.geometry);
      for (let idx = 0; idx < polygons.length; idx++) {
        out.push({
          lokaal_id:
            polygons.length > 1 ? `${lokaalIdRaw}_p${idx}` : lokaalIdRaw,
          feature_type: collectionId,
          bgt_type:
            (props.functie as string) ??
            (props.bgt_type as string) ??
            (props.bgtType as string) ??
            (props["function"] as string) ??
            // Fallback: segments.bgt_type is NOT NULL en sommige BGT-collecties
            // (bv. pand, overigbouwwerk) hebben geen 'functie' property. Gebruik
            // dan de collection-naam zelf zodat segment_trace_by_bgt niet crasht.
            collectionId,
          bgt_subtype:
            (props.fysiek_voorkomen as string) ??
            (props.bgt_functie as string) ??
            (props.bgtFunctie as string) ??
            (props.plus_type as string) ??
            (props["plus-type"] as string) ??
            null,
          geometry_wkt: polygons[idx],
          attributes: { ...props, _source_feature_type: collectionId },
        });
      }
    }
    const next = (json.links ?? []).find((l) => l.rel === "next");
    nextUrl = next?.href ?? null;
  }
  return out;
}

function extractPolygons(geom: { type: string; coordinates: unknown }): string[] {
  if (!geom) return [];
  if (geom.type === "Polygon") {
    return [polygonCoordsToWKT(geom.coordinates as number[][][])];
  }
  if (geom.type === "MultiPolygon") {
    return (geom.coordinates as number[][][][]).map(polygonCoordsToWKT);
  }
  return [];
}

function polygonCoordsToWKT(rings: number[][][]): string {
  const ringStrings = rings.map(
    (ring) => "(" + ring.map(([x, y]) => `${x} ${y}`).join(", ") + ")",
  );
  return `POLYGON(${ringStrings.join(", ")})`;
}

