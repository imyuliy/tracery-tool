// Pure async helpers voor Sprint 4 — gedeeld tussen createServerFn-handlers
// (trace.functions.ts) en de smoke-test route (api.public.smoketest-sprint4.ts).
//
// Geen `createServerFn` of TanStack request-context hier — alleen Supabase clients
// + business logic. Hierdoor zijn de helpers aanroepbaar vanuit:
//   - de production server-fn-handler (met user-scoped supabase + admin)
//   - een service-role smoke-test endpoint (admin client als beide)
//   - toekomstige unit/integration tests
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageBreak,
  BorderStyle,
  ShadingType,
} from "docx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAIProvider } from "./ai-provider.server";
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

  // Dedupe op (feature_type, lokaal_id) — PDOK paginering kan dezelfde feature
  // meerdere keren teruggeven; ON CONFLICT DO UPDATE faalt anders met
  // "command cannot affect row a second time".
  const seen = new Set<string>();
  const dedupedFeatures: PdokFeature[] = [];
  for (const f of allFeatures) {
    const key = `${f.feature_type}::${f.lokaal_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedFeatures.push(f);
  }
  log("dedupe", {
    raw: allFeatures.length,
    deduped: dedupedFeatures.length,
    duplicates: allFeatures.length - dedupedFeatures.length,
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
            null,
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

// ============================================================================
// 2) generateTraceDescription
// ============================================================================

export interface GenerateResult {
  section_id: string;
  artifact_id: string | null;
  content_md: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sources: any;
  warnings: Array<{ type: string; message: string }>;
}

export async function runGenerateTraceDescription(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<GenerateResult> {
  const ai = getAIProvider();

  const { data: trace, error: traceErr } = await opts.supabase
    .from("traces")
    .select(
      `id, variant, variant_label, length_m, project_id,
       project:projects (id, name, client, perceel, phase_state),
       start_station:stations!traces_start_station_id_fkey (
         id, name, station_type, spanningsniveau_kv_primair, adres
       ),
       eind_station:stations!traces_eind_station_id_fkey (
         id, name, station_type, spanningsniveau_kv_primair, adres
       )`,
    )
    .eq("id", opts.traceId)
    .single();
  if (traceErr || !trace) throw new Error(`Trace ${opts.traceId} niet gevonden`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = trace.project;
  if (!project) throw new Error("Trace heeft geen project");

  const { data: segments, error: segErr } = await opts.supabase
    .from("segments")
    .select(
      "sequence, bgt_feature_type, bgt_type, bgt_subtype, bgt_lokaal_id, length_m, km_start",
    )
    .eq("trace_id", opts.traceId)
    .not("bgt_lokaal_id", "is", null)
    .order("sequence");
  if (segErr) throw new Error(`Segmenten: ${segErr.message}`);
  if (!segments || segments.length === 0) {
    throw new Error(
      "Geen BGT-segmenten gevonden. Draai eerst segment-trace-by-bgt.",
    );
  }

  const totalLength = segments.reduce(
    (s, seg) => s + Number(seg.length_m ?? 0),
    0,
  );
  const perFeatureType = new Map<string, { count: number; length: number }>();
  for (const seg of segments) {
    const key = seg.bgt_feature_type ?? "Onbekend";
    const cur = perFeatureType.get(key) ?? { count: 0, length: 0 };
    cur.count += 1;
    cur.length += Number(seg.length_m ?? 0);
    perFeatureType.set(key, cur);
  }

  const promptSegments =
    segments.length <= MAX_SEGMENTS_IN_PROMPT
      ? segments
      : segments.filter(
          (_, i) =>
            i % Math.ceil(segments.length / MAX_SEGMENTS_IN_PROMPT) === 0,
        );

  const userPrompt = buildUserPrompt({
    project,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trace: trace as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    segments: promptSegments as any,
    totalLength,
    perFeatureType,
    aggregated: segments.length > MAX_SEGMENTS_IN_PROMPT,
    totalSegmentCount: segments.length,
  });

  const gen = await ai.generate({
    system: TRACE_DESCRIPTION_SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: MAX_TOKENS,
  });
  const markdown = gen.text;

  const bgtLokaalIdsInContext = new Set(
    promptSegments.map((s) => s.bgt_lokaal_id),
  );
  const segSequencesInContext = new Set(
    promptSegments.map((s) => String(s.sequence)),
  );
  const bgtMatches = [...markdown.matchAll(/\[BGT-([a-zA-Z0-9._\-]+)\]/g)];
  const segMatches = [...markdown.matchAll(/\[SEG-(\d+)\]/g)];

  const bgtCountMap = new Map<string, number>();
  for (const m of bgtMatches)
    bgtCountMap.set(m[1], (bgtCountMap.get(m[1]) ?? 0) + 1);
  const segCountMap = new Map<string, number>();
  for (const m of segMatches)
    segCountMap.set(m[1], (segCountMap.get(m[1]) ?? 0) + 1);

  const warnings: Array<{ type: string; message: string }> = [];
  for (const [lid] of bgtCountMap) {
    if (!bgtLokaalIdsInContext.has(lid)) {
      warnings.push({
        type: "hallucinated_bgt",
        message: `[BGT-${lid}] niet in context.`,
      });
    }
  }
  for (const [seq] of segCountMap) {
    if (!segSequencesInContext.has(seq)) {
      warnings.push({
        type: "hallucinated_segment",
        message: `[SEG-${seq}] niet in context.`,
      });
    }
  }

  const sentences = markdown.split(/(?<=[.!?])\s+/);
  const ungrounded = sentences.filter(
    (s) =>
      s.trim().length > 30 && !/\[(BGT|SEG|STATION|PROJECT|OVERGANG)-/.test(s),
  );
  if (ungrounded.length > 0) {
    warnings.push({
      type: "ungrounded_sentences",
      message: `${ungrounded.length} zinnen zonder bron-tag.`,
    });
  }

  const bgtRefs = [...bgtCountMap.entries()].map(([lid, count]) => {
    const hit = promptSegments.find((s) => s.bgt_lokaal_id === lid);
    return {
      lokaal_id: lid,
      count,
      feature_type: hit?.bgt_feature_type ?? null,
    };
  });

  const sources = {
    bgt_segments: bgtRefs,
    segment_count: segments.length,
    total_length_m: Math.round(totalLength),
    bgt_distribution: [...perFeatureType.entries()].map(([ft, v]) => ({
      feature_type: ft,
      count: v.count,
      length_m: Math.round(v.length),
      pct: Math.round((v.length / Math.max(totalLength, 1)) * 1000) / 10,
    })),
    phase_state_at_gen: project.phase_state,
    warnings,
    embedding_model: null,
    generation_model: gen.model,
  };

  const auditHash = await sha256(
    JSON.stringify({ trace_id: opts.traceId, markdown, sources }),
  );

  const { data: sectionRow, error: insertErr } = await supabaseAdmin
    .from("report_sections")
    .insert({
      trace_id: opts.traceId,
      report_type: "trace_description",
      section_number: "2.1",
      section_title: "Tracé-omschrijving",
      content_md: markdown,
      sources,
      model: gen.model,
      prompt_tokens: gen.input_tokens,
      completion_tokens: gen.output_tokens,
      audit_hash: auditHash,
    })
    .select("id")
    .single();
  if (insertErr) throw new Error(`Insert section: ${insertErr.message}`);

  const { data: artifactRow } = await supabaseAdmin
    .from("project_artifacts")
    .insert({
      project_id: project.id,
      trace_id: opts.traceId,
      product_code: "trace_description",
      report_section_id: sectionRow.id,
      phase_state_at_gen: project.phase_state,
      model: gen.model,
      status: "draft",
      generated_by: opts.userId,
    })
    .select("id")
    .single();

  await supabaseAdmin.from("audit_log").insert({
    project_id: project.id,
    user_id: opts.userId,
    action: "generate_trace_description",
    resource_type: "report_section",
    resource_id: sectionRow.id,
    payload: {
      artifact_id: artifactRow?.id,
      model: gen.model,
      prompt_tokens: gen.input_tokens,
      completion_tokens: gen.output_tokens,
      warnings_count: warnings.length,
    },
  });

  return {
    section_id: sectionRow.id,
    artifact_id: artifactRow?.id ?? null,
    content_md: markdown,
    sources,
    warnings,
  };
}

const TRACE_DESCRIPTION_SYSTEM_PROMPT = `Je bent een Nederlandse senior-elektrotechnisch ingenieur die een Tracé-omschrijving schrijft voor een MS-kabel tracé in opdracht van een netbeheerder (Liander, Stedin, Enexis, of Coteq).

Doel: een professioneel, BGT-gegronde narrative die exact beschrijft welke fysieke omgeving het tracé doorkruist, gebaseerd op publieke BGT-data (PDOK).

REGELS:
1. Schrijf in het Nederlands, professioneel en zakelijk.
2. Elke feitelijke zin eindigt met een bron-tag uit deze set:
   - [BGT-<lokaal_id>] — verwijst naar een specifiek BGT-feature uit de context
   - [SEG-N] — verwijst naar segment N uit de context
   - [STATION-start] / [STATION-eind] — verwijst naar een station uit de context
   - [PROJECT-name] / [PROJECT-client] / [PROJECT-perceel] / [PROJECT-phase_state]
3. NOOIT [BGT-...] tags verzinnen die niet in de context staan.
4. Geen meningen, geen aanbevelingen — alleen wat in de data staat.
5. Geen emoji, geen markdown-tabellen in de output (de tabellen komen uit de bron-data).
6. Structuur: korte intro, BGT-verdeling kort genoemd, dan sequentieel langs het tracé.
7. Verwijs naar overgangen tussen BGT-typen (bv. "wegdeel naar groenstrook") expliciet.
8. Schat 350–600 woorden totaal, niet langer.`;

interface PromptInput {
  project: {
    name?: string;
    client?: string | null;
    perceel?: string | null;
    phase_state?: string;
  };
  trace: {
    variant?: string;
    variant_label?: string | null;
    start_station?: {
      name: string;
      station_type: string;
      spanningsniveau_kv_primair: number;
      adres?: string | null;
    } | null;
    eind_station?: {
      name: string;
      station_type: string;
      spanningsniveau_kv_primair: number;
      adres?: string | null;
    } | null;
  };
  segments: Array<{
    sequence: number;
    bgt_feature_type: string | null;
    bgt_type: string | null;
    bgt_subtype: string | null;
    bgt_lokaal_id: string | null;
    length_m: number | string | null;
    km_start: number | string | null;
  }>;
  totalLength: number;
  perFeatureType: Map<string, { count: number; length: number }>;
  aggregated: boolean;
  totalSegmentCount: number;
}

function buildUserPrompt(p: PromptInput): string {
  const distributionTable = [...p.perFeatureType.entries()]
    .map(
      ([ft, v]) =>
        `| ${ft} | ${v.count} | ${Math.round(v.length)} m | ${(
          (v.length / Math.max(p.totalLength, 1)) *
          100
        ).toFixed(1)}% |`,
    )
    .join("\n");

  const segmentsBlock = p.segments
    .map(
      (s) =>
        `- [SEG-${s.sequence}] BGT-type: ${s.bgt_feature_type ?? "?"} (${s.bgt_type ?? "?"}/${s.bgt_subtype ?? "?"}), lengte ${Math.round(Number(s.length_m ?? 0))} m, lokaal_id [BGT-${s.bgt_lokaal_id}]`,
    )
    .join("\n");

  const startStation = p.trace.start_station
    ? `${p.trace.start_station.name} (${p.trace.start_station.station_type}, ${p.trace.start_station.spanningsniveau_kv_primair}kV${p.trace.start_station.adres ? ", " + p.trace.start_station.adres : ""})`
    : "Niet gekoppeld";
  const eindStation = p.trace.eind_station
    ? `${p.trace.eind_station.name} (${p.trace.eind_station.station_type}, ${p.trace.eind_station.spanningsniveau_kv_primair}kV${p.trace.eind_station.adres ? ", " + p.trace.eind_station.adres : ""})`
    : "Niet gekoppeld";

  return `Schrijf de Tracé-omschrijving voor dit MS-kabeltracé.

# PROJECT
- [PROJECT-client]: ${p.project.client ?? "onbekend"}
- [PROJECT-name]: ${p.project.name ?? "onbekend"}
- [PROJECT-perceel]: ${p.project.perceel ?? "n.v.t."}
- [PROJECT-phase_state]: ${p.project.phase_state ?? "VO_fase_1"}

# STATIONS
- [STATION-start]: ${startStation}
- [STATION-eind]: ${eindStation}

# TRACÉ
- Variant: ${p.trace.variant_label ?? p.trace.variant ?? "onbekend"}
- Totale lengte: ${Math.round(p.totalLength)} m
- Aantal BGT-segmenten: ${p.totalSegmentCount}
${p.aggregated ? `- Let op: segment-lijst is steekproef van ${p.segments.length}/${p.totalSegmentCount} segmenten` : ""}

# BGT-VERDELING
| BGT-type | # segmenten | Totaal | % van tracé |
|---|---|---|---|
${distributionTable}

# SEGMENTEN (sequentieel langs tracé)
${segmentsBlock}

---
Schrijf nu de Tracé-omschrijving. Elke feitelijke zin eindigt met een bron-tag. Alleen lokaal_ids uit bovenstaande lijst mogen als [BGT-...] worden geciteerd.`;
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================================
// 3) exportTraceDescriptionDocx
// ============================================================================

export interface ExportResult {
  url: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
}

export async function runExportTraceDescriptionDocx(opts: {
  supabase: SupabaseLike;
  traceId: string;
  sectionId?: string;
  userId: string | null;
}): Promise<ExportResult> {
  const { data: trace, error: traceErr } = await opts.supabase
    .from("traces")
    .select(
      `id, variant_label, variant, length_m, project_id,
       project:projects (id, name, client, perceel, phase_state)`,
    )
    .eq("id", opts.traceId)
    .single();
  if (traceErr || !trace) throw new Error(`Trace ${opts.traceId} niet gevonden`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = trace.project;

  let sectionQuery = opts.supabase
    .from("report_sections")
    .select("*")
    .eq("trace_id", opts.traceId)
    .eq("report_type", "trace_description")
    .order("generated_at", { ascending: false })
    .limit(1);
  if (opts.sectionId) {
    sectionQuery = opts.supabase
      .from("report_sections")
      .select("*")
      .eq("id", opts.sectionId);
  }
  const { data: sections, error: sectionErr } = await sectionQuery;
  if (sectionErr) throw new Error(`Sectie: ${sectionErr.message}`);
  if (!sections || sections.length === 0) {
    throw new Error("Geen tracé-omschrijving gevonden. Genereer er eerst één.");
  }
  const section = sections[0];

  const dateStr = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];
  children.push(
    new Paragraph({
      text: "Tracé-omschrijving",
      heading: HeadingLevel.HEADING_1,
    }),
    metaLine("Project", project.name ?? "—"),
    metaLine("Opdrachtgever", project.client ?? "—"),
    metaLine("Tracé-variant", trace.variant_label ?? trace.variant ?? "—"),
    metaLine("Fase", phaseLabel(project.phase_state)),
    metaLine("Gegenereerd", dateStr),
    new Paragraph({ text: "" }),
  );

  const distribution = ((section.sources as Record<string, unknown>)
    ?.bgt_distribution ?? []) as Array<{
    feature_type: string;
    count: number;
    length_m: number;
    pct: number;
  }>;

  if (distribution.length > 0) {
    children.push(
      new Paragraph({
        text: "BGT-verdeling",
        heading: HeadingLevel.HEADING_2,
      }),
      buildDistributionTable(distribution),
      new Paragraph({ text: "" }),
    );
  }

  children.push(
    new Paragraph({
      text: "Omschrijving",
      heading: HeadingLevel.HEADING_2,
    }),
    ...markdownToParagraphs((section.content_md as string) ?? ""),
  );

  const bgtRefs = ((section.sources as Record<string, unknown>)
    ?.bgt_segments ?? []) as Array<{
    lokaal_id: string;
    count: number;
    feature_type: string | null;
  }>;
  if (bgtRefs.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        text: "Bijlage: geciteerde BGT-features",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        text: `Deze omschrijving citeert ${bgtRefs.length} unieke BGT-features. Elke [BGT-<id>]-tag in de tekst verwijst naar een specifiek PDOK BGT-object (lokaalID). Bij twijfel: raadpleeg PDOK Viewer.`,
      }),
      new Paragraph({ text: "" }),
      buildBgtRefsTable(bgtRefs),
    );
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Gegenereerd door De Tracémolen — ${section.model ?? "onbekend model"} — ${dateStr}`,
          italics: true,
          size: 18,
          color: "888888",
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "De Tracémolen",
    title: `Tracé-omschrijving ${project.name ?? ""}`,
    description: "BGT-gegronde tracé-omschrijving gegenereerd door De Tracémolen",
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  const filename = `trace-omschrijving_${slugify(project.name ?? "project")}_${Date.now()}.docx`;
  const storagePath = `${project.id}/${opts.traceId}/${filename}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("exports")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (uploadErr) throw new Error(`Upload: ${uploadErr.message}`);

  const { data: urlData, error: urlErr } = await supabaseAdmin.storage
    .from("exports")
    .createSignedUrl(storagePath, 24 * 60 * 60);
  if (urlErr || !urlData) {
    throw new Error(`Signed URL: ${urlErr?.message ?? "onbekend"}`);
  }

  await supabaseAdmin
    .from("project_artifacts")
    .update({
      storage_path: storagePath,
      file_size_bytes: buffer.byteLength,
      mime_type:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    .eq("report_section_id", section.id)
    .eq("product_code", "trace_description");

  await supabaseAdmin.from("audit_log").insert({
    project_id: project.id,
    user_id: opts.userId,
    action: "export_trace_description_docx",
    resource_type: "report_section",
    resource_id: section.id,
    payload: {
      storage_path: storagePath,
      file_size_bytes: buffer.byteLength,
    },
  });

  return {
    url: urlData.signedUrl,
    storage_path: storagePath,
    filename,
    size_bytes: buffer.byteLength,
  };
}

function metaLine(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value }),
    ],
  });
}

function phaseLabel(state?: string): string {
  if (!state) return "—";
  const map: Record<string, string> = {
    VO_fase_1: "VO fase 1",
    VO_fase_2: "VO fase 2",
    VO_tollgate: "VO tollgate",
    DO_fase_1: "DO fase 1",
    DO_fase_2: "DO fase 2",
    DO_tollgate: "DO tollgate",
    UO_fase_1: "UO fase 1",
    UO_fase_2: "UO fase 2",
    UO_tollgate: "UO tollgate",
    afgerond: "Afgerond",
  };
  return map[state] ?? state;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function markdownToParagraphs(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  const lines = md.split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      out.push(new Paragraph({ text: "" }));
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(
        new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }),
      );
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }),
      );
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(
        new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }),
      );
      continue;
    }
    if (line.match(/^\s*[-*]\s+/)) {
      out.push(
        new Paragraph({
          text: line.replace(/^\s*[-*]\s+/, ""),
          bullet: { level: 0 },
        }),
      );
      continue;
    }
    out.push(new Paragraph({ children: parseInlineRuns(line) }));
  }
  return out;
}

function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[(?:BGT|SEG|STATION|PROJECT|OVERGANG)-[^\]]+\])/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const idx = m.index ?? 0;
    if (idx > last) runs.push(new TextRun({ text: text.slice(last, idx) }));
    const tok = m[0];
    if (tok.startsWith("**")) {
      runs.push(new TextRun({ text: tok.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: tok, color: "2A6F7C" }));
    }
    last = idx + tok.length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) }));
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

function buildDistributionTable(
  rows: Array<{
    feature_type: string;
    count: number;
    length_m: number;
    pct: number;
  }>,
): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const header = new TableRow({
    children: ["BGT-type", "Aantal", "Lengte (m)", "% tracé"].map(
      (h) =>
        new TableCell({
          width: { size: 2340, type: WidthType.DXA },
          borders,
          shading: { fill: "F1ECE6", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true })] }),
          ],
        }),
    ),
  });
  const dataRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          cell(r.feature_type, borders),
          cell(String(r.count), borders),
          cell(String(r.length_m), borders),
          cell(`${r.pct}%`, borders),
        ],
      }),
  );
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [header, ...dataRows],
  });
}

function buildBgtRefsTable(
  refs: Array<{ lokaal_id: string; count: number; feature_type: string | null }>,
): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const header = new TableRow({
    children: ["Lokaal-ID", "Type", "Citaties"].map(
      (h) =>
        new TableCell({
          width: { size: 3120, type: WidthType.DXA },
          borders,
          shading: { fill: "F1ECE6", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true })] }),
          ],
        }),
    ),
  });
  const rows = refs.map(
    (r) =>
      new TableRow({
        children: [
          cell(r.lokaal_id, borders),
          cell(r.feature_type ?? "—", borders),
          cell(String(r.count), borders),
        ],
      }),
  );
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 3120, 3120],
    rows: [header, ...rows],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cell(text: string, borders: any): TableCell {
  return new TableCell({
    width: { size: 2340, type: WidthType.DXA },
    borders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text })] })],
  });
}
