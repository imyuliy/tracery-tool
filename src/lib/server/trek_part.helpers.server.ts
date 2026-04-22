// De Tracémolen — Sprint 4.6 trek-part aggregatie helper.
// Roept ai-provider aan voor één narrative-alinea per natuurlijke trek-part
// (= aaneengesloten LineString-part na ST_LineMerge).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAIProvider } from "./ai-provider.server";
import type { Database } from "@/integrations/supabase/types";

if (typeof window !== "undefined") {
  throw new Error("trek_part.helpers.server.ts mag niet in de browser laden.");
}

type SupabaseLike = SupabaseClient<Database>;

const MAX_TOKENS_PER_TREK = 1200;
const MAX_CONCURRENT_TREKS = 4;

interface TrekPartRow {
  part_idx: number;
  part_geom_28992: unknown;
  // PostGIS geometry kolommen komen als GeoJSON binnen via PostgREST
  start_point_4326: { type: "Point"; coordinates: [number, number] } | string;
  end_point_4326: { type: "Point"; coordinates: [number, number] } | string;
  length_m: number | string;
  start_km: number | string;
  end_km: number | string;
}

interface SegmentMappingRow {
  segment_id: string;
  sequence: number;
  part_idx: number;
  bgt_feature_type: string | null;
  bgt_subtype: string | null;
  length_m: number | string;
}

interface SegmentDescRow {
  segment_id: string;
  narrative_md: string | null;
  ai_aandacht: boolean | null;
  ai_aandacht_reden: string | null;
  aandacht_reden: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eisen_matches: any;
}

interface SegmentInTrek {
  segment_id: string;
  sequence: number;
  part_idx: number;
  bgt_feature_type: string;
  bgt_subtype: string | null;
  length_m: number;
  narrative_md: string;
  van_toepassing_eisen: string[];
  aandacht_flag: boolean;
  aandacht_reden: string[];
}

export interface TrekPartGenResult {
  trace_id: string;
  trek_count: number;
  total_segments: number;
  aandacht_count: number;
  duration_ms: number;
}

export async function runGenerateTrekPartDescriptions(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<TrekPartGenResult> {
  const t0 = Date.now();
  const { traceId, userId } = opts;
  const log = (msg: string) =>
    console.log(`[trek-part ${traceId}] +${Date.now() - t0}ms ${msg}`);

  const ai = getAIProvider();

  // 1. Trek-parts ophalen via RPC
  log("fetch trace_parts_for_trace…");
  const { data: parts, error: pErr } = await opts.supabase.rpc(
    "trace_parts_for_trace",
    { p_trace_id: traceId },
  );
  if (pErr) throw new Error(`trace_parts laden: ${pErr.message}`);
  const partRows = (parts ?? []) as unknown as TrekPartRow[];
  if (partRows.length === 0) {
    throw new Error("Geen trek-parts gevonden. Draai eerst BGT-segmentatie.");
  }
  log(`parts=${partRows.length}`);

  // 2. Segment-to-part mapping
  log("fetch segments_with_part_idx…");
  const { data: mappings, error: mErr } = await opts.supabase.rpc(
    "segments_with_part_idx",
    { p_trace_id: traceId },
  );
  if (mErr) throw new Error(`segment-mapping: ${mErr.message}`);
  const mapRows = (mappings ?? []) as unknown as SegmentMappingRow[];
  log(`segment-mappings=${mapRows.length}`);

  // 3. Bestaande segment_descriptions ophalen
  log("fetch segment_descriptions…");
  const { data: segDescs, error: dErr } = await opts.supabase
    .from("segment_descriptions")
    .select(
      "segment_id, narrative_md, ai_aandacht, ai_aandacht_reden, aandacht_reden, eisen_matches",
    )
    .eq("trace_id", traceId);
  if (dErr) throw new Error(`segment_descriptions: ${dErr.message}`);
  const descByseg = new Map<string, SegmentDescRow>();
  for (const s of (segDescs ?? []) as SegmentDescRow[]) {
    descByseg.set(s.segment_id, s);
  }
  log(`segment-descs=${descByseg.size}`);

  // 4. Bouw per-trek lijst
  const segsByPart = new Map<number, SegmentInTrek[]>();
  for (const m of mapRows) {
    const desc = descByseg.get(m.segment_id);
    const eisCodes = extractEisCodes(desc?.eisen_matches);
    const reden: string[] = [];
    if (desc?.ai_aandacht_reden) reden.push(desc.ai_aandacht_reden);
    if (desc?.aandacht_reden) reden.push(desc.aandacht_reden);

    const arr = segsByPart.get(m.part_idx) ?? [];
    arr.push({
      segment_id: m.segment_id,
      sequence: m.sequence,
      part_idx: m.part_idx,
      bgt_feature_type: m.bgt_feature_type ?? "onbekend",
      bgt_subtype: m.bgt_subtype,
      length_m: Number(m.length_m ?? 0),
      narrative_md: desc?.narrative_md ?? "",
      van_toepassing_eisen: eisCodes,
      aandacht_flag: Boolean(desc?.ai_aandacht),
      aandacht_reden: reden,
    });
    segsByPart.set(m.part_idx, arr);
  }

  // 5. Verwijder bestaande v1-rijen voor deze trace (idempotent)
  await supabaseAdmin
    .from("trek_part_descriptions")
    .delete()
    .eq("trace_id", traceId)
    .eq("version", 1);

  // 6. Genereer per trek (parallel met cap)
  type RowResult = {
    part_idx: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row: any;
  };
  const results: RowResult[] = [];

  for (let i = 0; i < partRows.length; i += MAX_CONCURRENT_TREKS) {
    const chunk = partRows.slice(i, i + MAX_CONCURRENT_TREKS);
    const chunkResults = await Promise.all(
      chunk.map(async (part) => {
        const segs = segsByPart.get(part.part_idx) ?? [];
        const row = await generateOneTrekPart({
          part,
          segments: segs,
          ai,
          traceId,
          userId,
        });
        return { part_idx: part.part_idx, row };
      }),
    );
    results.push(...chunkResults);
    log(
      `chunk ${Math.floor(i / MAX_CONCURRENT_TREKS) + 1}/${Math.ceil(
        partRows.length / MAX_CONCURRENT_TREKS,
      )} done`,
    );
  }

  // 7. Insert via admin (RLS-bypass voor server-side write)
  if (results.length > 0) {
    const { error: iErr } = await supabaseAdmin
      .from("trek_part_descriptions")
      .insert(results.map((r) => r.row));
    if (iErr) throw new Error(`Insert trek_part: ${iErr.message}`);
  }
  log(`inserted=${results.length}`);

  // 8. Audit
  const { data: trace } = await opts.supabase
    .from("traces")
    .select("project_id")
    .eq("id", traceId)
    .maybeSingle();

  const aandachtCount = results.filter((r) => r.row.aandacht_flag).length;

  await supabaseAdmin.from("audit_log").insert({
    project_id: trace?.project_id ?? null,
    user_id: userId,
    action: "generate_trek_part_descriptions",
    resource_type: "trace",
    resource_id: traceId,
    payload: {
      trek_count: results.length,
      total_segments: mapRows.length,
      aandacht_count: aandachtCount,
      model: ai.generationModel,
      duration_ms: Date.now() - t0,
    },
  });

  return {
    trace_id: traceId,
    trek_count: results.length,
    total_segments: mapRows.length,
    aandacht_count: aandachtCount,
    duration_ms: Date.now() - t0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEisCodes(eisenMatches: any): string[] {
  if (!Array.isArray(eisenMatches)) return [];
  const out = new Set<string>();
  for (const m of eisenMatches) {
    const code = m?.eis_code ?? m?.code;
    if (typeof code === "string" && code) out.add(code);
  }
  return [...out];
}

async function generateOneTrekPart(args: {
  part: TrekPartRow;
  segments: SegmentInTrek[];
  ai: ReturnType<typeof getAIProvider>;
  traceId: string;
  userId: string | null;
}) {
  const { part, segments, ai, traceId } = args;

  // BGT-verdeling: lengte per type
  const bgtVerdeling: Record<string, number> = {};
  for (const s of segments) {
    const key = (s.bgt_feature_type || "onbekend").toLowerCase() + "_m";
    bgtVerdeling[key] = (bgtVerdeling[key] ?? 0) + s.length_m;
  }
  for (const k of Object.keys(bgtVerdeling)) {
    bgtVerdeling[k] = Math.round(bgtVerdeling[k]);
  }

  // Eisen-union
  const eisenSet = new Set<string>();
  for (const s of segments)
    for (const e of s.van_toepassing_eisen) eisenSet.add(e);

  // Aandacht-aggregatie
  const aandachtSet = new Set<string>();
  for (const s of segments) for (const r of s.aandacht_reden) aandachtSet.add(r);
  const aandachtFlag = segments.some((s) => s.aandacht_flag);

  let narrative = "";
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  if (segments.length === 0) {
    narrative = `Deze trek heeft een lengte van ${Math.round(
      Number(part.length_m),
    )} m maar bevat geen gemapte BGT-segmenten.`;
  } else {
    try {
      const gen = await ai.generate({
        system: TREK_NARRATIVE_SYSTEM_PROMPT,
        user: buildTrekPrompt(part, segments, bgtVerdeling, [...aandachtSet]),
        maxTokens: MAX_TOKENS_PER_TREK,
      });
      narrative = (gen.text ?? "").trim();
      promptTokens = gen.input_tokens;
      completionTokens = gen.output_tokens;
    } catch (e) {
      narrative = `_Narrative niet gegenereerd: ${
        e instanceof Error ? e.message : "AI fout"
      }._`;
    }
  }

  // Coördinaten normaliseren — kunnen GeoJSON object of WKT-string zijn.
  const startPt = toGeoJsonPoint(part.start_point_4326);
  const endPt = toGeoJsonPoint(part.end_point_4326);

  return {
    trace_id: traceId,
    part_idx: part.part_idx,
    version: 1,
    start_point_4326: startPt,
    end_point_4326: endPt,
    start_km: Number(part.start_km),
    end_km: Number(part.end_km),
    length_m: Number(part.length_m),
    content_md: narrative,
    bgt_verdeling: bgtVerdeling,
    segment_count: segments.length,
    segment_ids: segments.map((s) => s.segment_id),
    van_toepassing_eisen: [...eisenSet],
    aandacht_flag: aandachtFlag,
    aandacht_reden: [...aandachtSet],
    model: ai.generationModel,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    generated_by: args.userId,
  };
}

// PostgREST geeft PostGIS-geom-kolommen terug als GeoJSON-object;
// fallback voor WKT-string als de connector dat doet.
function toGeoJsonPoint(
  v: TrekPartRow["start_point_4326"],
): { type: "Point"; coordinates: [number, number] } {
  if (v && typeof v === "object" && "coordinates" in v) {
    return { type: "Point", coordinates: v.coordinates };
  }
  if (typeof v === "string") {
    // WKT "POINT(lon lat)" of EWKT
    const m = v.match(/POINT\s*\(\s*([-\d.eE]+)\s+([-\d.eE]+)/i);
    if (m) {
      return { type: "Point", coordinates: [Number(m[1]), Number(m[2])] };
    }
  }
  return { type: "Point", coordinates: [0, 0] };
}

const TREK_NARRATIVE_SYSTEM_PROMPT = `Je bent een Nederlandse engineering-consultant die een tracé-omschrijving schrijft voor een MS-kabeltrek.

Per input krijg je één TREK-PART met:
- Begin- en eindcoördinaten (WGS84)
- Totale lengte
- BGT-verdeling (hoeveel meters per BGT-type)
- Samenvatting van segmenten binnen de trek
- Aandachtspunten (kruisingen, raakvlakken)

OUTPUT: één Nederlandse alinea (150–300 woorden) die:
1. START met een begin-anchor (bv. "Deze trek van XXm start in een [BGT-type]…")
2. Beschrijft de BGT-variatie in logische volgorde, met absolute meters per type
3. Benoemt aandachtspunten (watergang, pand, kunstwerk) expliciet
4. Eindigt met een eind-anchor

REGELS:
- GEEN aanbevelingen of engineering-beslissingen (geen "vereist", "zou moeten", "aanbevolen").
- GEEN aanleg-techniek-keuze (geen "gestuurde boring", "mantelbuis", enz.).
- PUUR beschrijvend: "is", "ligt", "kruist", "vervolgt", "overgaat in".
- Gebruik BGT-termen: "rijbaan", "voetpad", "watergang", "groenstrook", "pand", "berm".
- Noem geen segment-nummers of lokaal-IDs in de lopende tekst — die worden later als pills gerenderd.
- Nederlandse consultancy-toon, formeel.

Output is pure markdown zonder headers (geen ### of ##). Start direct met de alinea.`;

function buildTrekPrompt(
  part: TrekPartRow,
  segments: SegmentInTrek[],
  bgtVerdeling: Record<string, number>,
  aandachtReden: string[],
): string {
  const bgtLines = Object.entries(bgtVerdeling)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  - ${k.replace(/_m$/, "")}: ${v}m`)
    .join("\n");

  const segSummary = segments
    .slice(0, 30)
    .map(
      (s) =>
        `  ${s.sequence}. ${s.bgt_feature_type}${
          s.bgt_subtype ? ` (${s.bgt_subtype})` : ""
        } · ${Math.round(s.length_m)}m`,
    )
    .join("\n");

  const lengte = Math.round(Number(part.length_m));
  const km0 = Number(part.start_km).toFixed(3);
  const km1 = Number(part.end_km).toFixed(3);

  return `TREK-PART #${part.part_idx + 1}
Lengte: ${lengte}m  (km ${km0} – ${km1})
Aantal BGT-segmenten binnen trek: ${segments.length}

BGT-verdeling:
${bgtLines || "  (geen segmenten)"}

Aandachtspunten binnen trek: ${
    aandachtReden.length > 0 ? aandachtReden.join("; ") : "geen bijzonderheden"
  }

Segmenten-volgorde (eerste 30):
${segSummary || "(geen segmenten)"}

Schrijf nu de trek-narratieve alinea.`;
}
