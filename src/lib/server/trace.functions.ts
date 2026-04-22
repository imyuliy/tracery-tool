// De Tracémolen — Sprint 4 server-fns: BGT-segmentatie, tracé-omschrijving, .docx-export.
// Geadapteerd uit de Edge-Function-spec naar TanStack Start (consistent met
// eisenpakket.functions.ts uit Sprint 3).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAIProvider } from "./ai-provider.server";

export const config = { maxDuration: 60 };

const PDOK_BGT_WFS = "https://service.pdok.nl/lv/bgt/wfs/v1_0";
const BGT_FEATURETYPES = [
  "bgt:Wegdeel",
  "bgt:Waterdeel",
  "bgt:OndersteunendWegdeel",
  "bgt:OnbegroeidTerreindeel",
  "bgt:Begroeidterreindeel",
  "bgt:Pand",
  "bgt:OverigBouwwerk",
  "bgt:Scheiding",
] as const;
const BBOX_BUFFER_M = 10;
const STAGING_BATCH = 250;
const MAX_TOKENS = 4000;
const MAX_SEGMENTS_IN_PROMPT = 50;

// ============================================================================
// 1) segment-trace-by-bgt
// ============================================================================

const segmentSchema = z.object({ trace_id: z.string().uuid() });

export const segmentTraceByBgt = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => segmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const log = (msg: string, extra?: Record<string, unknown>) =>
      console.log(
        `[segment ${data.trace_id}] +${Date.now() - t0}ms ${msg}`,
        extra ? JSON.stringify(extra) : "",
      );

    const { supabase } = context;

    // 1. Trace + project ophalen (RLS-gefilterd)
    const { data: trace, error: traceErr } = await supabase
      .from("traces")
      .select("id, project_id")
      .eq("id", data.trace_id)
      .single();
    if (traceErr || !trace) {
      throw new Error(`Trace ${data.trace_id} niet gevonden`);
    }

    // 2. Bbox in EPSG:28992
    const { data: bboxRows, error: bboxErr } = await supabaseAdmin.rpc(
      "trace_bbox_28992",
      { p_trace_id: data.trace_id, p_buffer_m: BBOX_BUFFER_M },
    );
    if (bboxErr) throw new Error(`bbox: ${bboxErr.message}`);
    const bbox = bboxRows?.[0];
    if (!bbox) throw new Error("Geen bbox kunnen bepalen");
    const { xmin, ymin, xmax, ymax } = bbox;
    log("bbox-ok", { xmin, ymin, xmax, ymax });

    // 3. PDOK BGT WFS bevragen per featuretype
    const allFeatures: PdokFeature[] = [];
    for (const ft of BGT_FEATURETYPES) {
      const features = await fetchPdokFeatures(
        ft,
        Number(xmin),
        Number(ymin),
        Number(xmax),
        Number(ymax),
      );
      log(`pdok-${ft}`, { count: features.length });
      allFeatures.push(...features);
    }

    // 4. Staging schoonvegen + in batches inserten
    await supabaseAdmin
      .from("bgt_features_staging")
      .delete()
      .eq("trace_id", data.trace_id);

    let stagingInserted = 0;
    for (let i = 0; i < allFeatures.length; i += STAGING_BATCH) {
      const batch = allFeatures.slice(i, i + STAGING_BATCH);
      const { data: inserted, error: insErr } = await supabaseAdmin.rpc(
        "bgt_staging_insert_batch",
        { p_trace_id: data.trace_id, p_features: batch },
      );
      if (insErr) throw new Error(`staging-batch ${i}: ${insErr.message}`);
      stagingInserted += inserted ?? 0;
    }
    log("staging-ok", { inserted: stagingInserted });

    // 5. Segmenteren via SQL-functie
    const { data: segCount, error: segErr } = await supabaseAdmin.rpc(
      "segment_trace_by_bgt",
      { p_trace_id: data.trace_id },
    );
    if (segErr) throw new Error(`segment_trace_by_bgt: ${segErr.message}`);
    log("segments-ok", { segCount });

    // 6. Summary uit view
    const { data: summary } = await supabase
      .from("v_trace_bgt_summary")
      .select("bgt_feature_type, segment_count, total_length_m, pct_of_trace")
      .eq("trace_id", data.trace_id)
      .order("total_length_m", { ascending: false });

    // 7. Audit
    await supabaseAdmin.from("audit_log").insert({
      project_id: trace.project_id,
      user_id: context.userId,
      action: "segment_trace_by_bgt",
      resource_type: "trace",
      resource_id: data.trace_id,
      payload: {
        segment_count: segCount ?? 0,
        bgt_features_fetched: allFeatures.length,
        staging_inserted: stagingInserted,
        bbox: { xmin, ymin, xmax, ymax },
      },
    });

    return {
      segment_count: segCount ?? 0,
      features_fetched: allFeatures.length,
      staging_inserted: stagingInserted,
      bbox: { xmin, ymin, xmax, ymax },
      bgt_distribution: summary ?? [],
    };
  });

interface PdokFeature {
  lokaal_id: string;
  feature_type: string;
  bgt_type: string | null;
  bgt_subtype: string | null;
  geometry_wkt: string;
  attributes: Record<string, unknown>;
}

async function fetchPdokFeatures(
  typename: string,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): Promise<PdokFeature[]> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typename,
    srsName: "EPSG:28992",
    outputFormat: "application/json",
    bbox: `${xmin},${ymin},${xmax},${ymax},EPSG:28992`,
    count: "5000",
  });
  const url = `${PDOK_BGT_WFS}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`PDOK ${typename} faalde: HTTP ${res.status}`);
    return [];
  }
  const json = (await res.json()) as {
    features?: Array<{
      id?: string;
      properties: Record<string, unknown>;
      geometry: { type: string; coordinates: unknown };
    }>;
  };
  const features = json.features ?? [];
  const featureTypeName = typename.replace("bgt:", "");

  return features.flatMap((f) => {
    const props = f.properties ?? {};
    const lokaalIdRaw =
      (props.lokaalID as string) ??
      (props.lokaalid as string) ??
      f.id ??
      crypto.randomUUID();
    const polygons = extractPolygons(f.geometry);
    return polygons.map((poly, idx) => ({
      lokaal_id: polygons.length > 1 ? `${lokaalIdRaw}_p${idx}` : lokaalIdRaw,
      feature_type: featureTypeName,
      bgt_type:
        (props.bgt_type as string) ??
        (props.bgtType as string) ??
        (props["function"] as string) ??
        null,
      bgt_subtype:
        (props.bgt_functie as string) ??
        (props.bgtFunctie as string) ??
        (props.plus_type as string) ??
        (props["plus-type"] as string) ??
        null,
      geometry_wkt: poly,
      attributes: { ...props, _source_feature_type: featureTypeName },
    }));
  });
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
// 2) generate-trace-description
// ============================================================================

const generateSchema = z.object({ trace_id: z.string().uuid() });

export const generateTraceDescription = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ai = getAIProvider();

    // 1. Trace + project + stations
    const { data: trace, error: traceErr } = await supabase
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
      .eq("id", data.trace_id)
      .single();
    if (traceErr || !trace) throw new Error(`Trace ${data.trace_id} niet gevonden`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project: any = trace.project;
    if (!project) throw new Error("Trace heeft geen project");

    // 2. Segmenten met BGT-herkomst
    const { data: segments, error: segErr } = await supabase
      .from("segments")
      .select(
        "sequence, bgt_feature_type, bgt_type, bgt_subtype, bgt_lokaal_id, length_m, km_start",
      )
      .eq("trace_id", data.trace_id)
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

    // 3. Generate via Lovable AI
    const gen = await ai.generate({
      system: TRACE_DESCRIPTION_SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: MAX_TOKENS,
    });
    const markdown = gen.text;

    // 4. Citation-validatie
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
      JSON.stringify({ trace_id: data.trace_id, markdown, sources }),
    );

    // 5. Insert report_section
    const { data: sectionRow, error: insertErr } = await supabaseAdmin
      .from("report_sections")
      .insert({
        trace_id: data.trace_id,
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

    // 6. Insert artifact (draft)
    const { data: artifactRow } = await supabaseAdmin
      .from("project_artifacts")
      .insert({
        project_id: project.id,
        trace_id: data.trace_id,
        product_code: "trace_description",
        report_section_id: sectionRow.id,
        phase_state_at_gen: project.phase_state,
        model: gen.model,
        status: "draft",
        generated_by: userId,
      })
      .select("id")
      .single();

    // 7. Audit
    await supabaseAdmin.from("audit_log").insert({
      project_id: project.id,
      user_id: userId,
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
  });

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
// 3) export-trace-description-docx
// ============================================================================

const exportSchema = z.object({
  trace_id: z.string().uuid(),
  section_id: z.string().uuid().optional(),
});

export const exportTraceDescriptionDocx = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => exportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: trace, error: traceErr } = await supabase
      .from("traces")
      .select(
        `id, variant_label, variant, length_m, project_id,
         project:projects (id, name, client, perceel, phase_state)`,
      )
      .eq("id", data.trace_id)
      .single();
    if (traceErr || !trace) throw new Error(`Trace ${data.trace_id} niet gevonden`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project: any = trace.project;

    let sectionQuery = supabase
      .from("report_sections")
      .select("*")
      .eq("trace_id", data.trace_id)
      .eq("report_type", "trace_description")
      .order("generated_at", { ascending: false })
      .limit(1);
    if (data.section_id) {
      sectionQuery = supabase
        .from("report_sections")
        .select("*")
        .eq("id", data.section_id);
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
      metaLine(
        "Tracé-variant",
        trace.variant_label ?? trace.variant ?? "—",
      ),
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
      description:
        "BGT-gegronde tracé-omschrijving gegenereerd door De Tracémolen",
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
    const storagePath = `${project.id}/${data.trace_id}/${filename}`;

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

    // Update artifact (zoek nieuwste draft voor deze sectie)
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
      user_id: userId,
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
  });

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
        new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
        }),
      );
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
        }),
      );
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(
        new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_1,
        }),
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
