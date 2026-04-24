// De Tracémolen — Sprint 4.7 trek-part aggregatie helper.
// DETERMINISTISCH: geen AI-calls meer per trek. We aggregeren puur uit de
// reeds AI-gegenereerde segment_descriptions en bouwen een markdown-template.
// Voordeel: <1s ipv ~30s, €0 ipv €€, 100% reproduceerbaar, geen timeout-risico.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

if (typeof window !== "undefined") {
  throw new Error("trek_part.helpers.server.ts mag niet in de browser laden.");
}

type SupabaseLike = SupabaseClient<Database>;

// Marker zodat audit/UI weet dat dit deterministisch is samengesteld.
const TREK_MODEL = "deterministic-template-v1";

interface TrekPartRow {
  part_idx: number;
  part_geom_28992: unknown;
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
  bgt_type: string | null;
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
  bgt_type: string | null;
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

  // 1. Trek-parts ophalen via RPC (admin om RLS-recursie/timeouts te vermijden)
  log("fetch trace_parts_for_trace…");
  const { data: parts, error: pErr } = await supabaseAdmin.rpc(
    "trace_parts_for_trace",
    { p_trace_id: traceId },
  );
  if (pErr) throw new Error(`trace_parts laden: ${pErr.message}`);
  const partRows = (parts ?? []) as unknown as TrekPartRow[];
  log(`parts=${partRows.length}`);
  if (partRows.length === 0) {
    throw new Error("Geen trek-parts gevonden. Draai eerst BGT-segmentatie.");
  }

  // 2. Segment-to-part mapping (admin)
  log("fetch segments_with_part_idx…");
  const { data: mappings, error: mErr } = await supabaseAdmin.rpc(
    "segments_with_part_idx",
    { p_trace_id: traceId },
  );
  if (mErr) throw new Error(`segment-mapping: ${mErr.message}`);
  const mapRows = (mappings ?? []) as unknown as SegmentMappingRow[];
  log(`segment-mappings=${mapRows.length}`);

  // 3. Bestaande segment_descriptions ophalen (admin)
  log("fetch segment_descriptions…");
  const { data: segDescs, error: dErr } = await supabaseAdmin
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

  // 4. Bouw per-trek lijst, gesorteerd op sequence
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
      bgt_type: m.bgt_type ?? null,
      bgt_subtype: m.bgt_subtype,
      length_m: Number(m.length_m ?? 0),
      narrative_md: desc?.narrative_md ?? "",
      van_toepassing_eisen: eisCodes,
      aandacht_flag: Boolean(desc?.ai_aandacht),
      aandacht_reden: reden,
    });
    segsByPart.set(m.part_idx, arr);
  }
  for (const [k, arr] of segsByPart) {
    arr.sort((a, b) => a.sequence - b.sequence);
    segsByPart.set(k, arr);
  }

  // 5. Verwijder bestaande v1-rijen voor deze trace (idempotent)
  await supabaseAdmin
    .from("trek_part_descriptions")
    .delete()
    .eq("trace_id", traceId)
    .eq("version", 1);

  // 6. Bouw rows deterministisch (geen async, geen AI)
  const rows = partRows.map((part) => {
    const segs = segsByPart.get(part.part_idx) ?? [];
    return buildTrekRow({ part, segments: segs, traceId, userId });
  });
  log(`rows-built=${rows.length}`);

  // 7. Insert via admin (RLS-bypass)
  if (rows.length > 0) {
    const { error: iErr } = await supabaseAdmin
      .from("trek_part_descriptions")
      .insert(rows);
    if (iErr) throw new Error(`Insert trek_part: ${iErr.message}`);
  }
  log(`inserted=${rows.length}`);

  // 8. Audit
  const { data: trace } = await opts.supabase
    .from("traces")
    .select("project_id")
    .eq("id", traceId)
    .maybeSingle();

  const aandachtCount = rows.filter((r) => r.aandacht_flag).length;

  await supabaseAdmin.from("audit_log").insert({
    project_id: trace?.project_id ?? null,
    user_id: userId,
    action: "generate_trek_part_descriptions",
    resource_type: "trace",
    resource_id: traceId,
    payload: {
      trek_count: rows.length,
      total_segments: mapRows.length,
      aandacht_count: aandachtCount,
      model: TREK_MODEL,
      duration_ms: Date.now() - t0,
    },
  });

  return {
    trace_id: traceId,
    trek_count: rows.length,
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

function buildTrekRow(args: {
  part: TrekPartRow;
  segments: SegmentInTrek[];
  traceId: string;
  userId: string | null;
}) {
  const { part, segments, traceId } = args;

  // BGT-verdeling: meters per functie (bgt_type), fallback op feature_type.
  const bgtVerdeling: Record<string, number> = {};
  for (const s of segments) {
    const key = (s.bgt_type ?? s.bgt_feature_type ?? "onbekend").toLowerCase() + "_m";
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

  const narrative = renderTrekMarkdown(part, segments, bgtVerdeling, [
    ...aandachtSet,
  ]);

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
    model: TREK_MODEL,
    prompt_tokens: null,
    completion_tokens: null,
    generated_by: args.userId,
  };
}

// Deterministische markdown-template — auditbaar, geen AI-variatie.
function renderTrekMarkdown(
  part: TrekPartRow,
  segments: SegmentInTrek[],
  bgtVerdeling: Record<string, number>,
  aandachtReden: string[],
): string {
  const lengte = Math.round(Number(part.length_m));
  const km0 = Number(part.start_km).toFixed(3);
  const km1 = Number(part.end_km).toFixed(3);

  if (segments.length === 0) {
    return `Deze trek heeft een lengte van ${lengte} m (km ${km0} – ${km1}) maar bevat geen gemapte BGT-segmenten.`;
  }

  const eerste = segments[0];
  const laatste = segments[segments.length - 1];

  const bgtVolgorde = Object.entries(bgtVerdeling)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.replace(/_m$/, "")} (${v} m)`)
    .join(", ");

  const lines: string[] = [];
  lines.push(
    `Deze trek van **${lengte} m** (km ${km0} – ${km1}) bevat ${segments.length} BGT-segment${segments.length === 1 ? "" : "en"} en start in ${labelBgt(eerste)} en eindigt in ${labelBgt(laatste)}.`,
  );
  lines.push("");
  lines.push(`**BGT-verdeling:** ${bgtVolgorde}.`);

  if (aandachtReden.length > 0) {
    lines.push("");
    lines.push(`**Aandachtspunten:** ${aandachtReden.join("; ")}.`);
  }

  return lines.join("\n");
}

function labelBgt(s: SegmentInTrek): string {
  const t = s.bgt_feature_type || "onbekend";
  return s.bgt_subtype ? `${t} (${s.bgt_subtype})` : t;
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
    const m = v.match(/POINT\s*\(\s*([-\d.eE]+)\s+([-\d.eE]+)/i);
    if (m) {
      return { type: "Point", coordinates: [Number(m[1]), Number(m[2])] };
    }
  }
  return { type: "Point", coordinates: [0, 0] };
}
