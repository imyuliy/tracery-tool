// De Tracémolen — Sprint 4.5: per-segment Brondocument v1
// Hybride eisen-matching (Laag 1 regels + Laag 2 pgvector) en
// gebatchte Gemini Flash-narratives per segment. Pure helpers,
// gedeeld door scan.functions.ts en (later) smoke-tests.
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
import { getAIProvider, cosine, parseVector } from "./ai-provider.server";
import type { Database } from "@/integrations/supabase/types";

type SupabaseLike = SupabaseClient<Database>;

const BATCH_SIZE = 25;
const MAX_PARALLEL = 5;
const MAX_SEGMENTS = 1000;
const TOP_K_RULES = 8;
const TOP_K_VECTOR = 6;
const MIN_VECTOR_SCORE = 0.55;
const NARRATIVE_MAX_TOKENS = 1500;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface EisenMatch {
  eis_id: string;
  eis_code: string;
  eistitel: string;
  source: "rule" | "vector" | "rule+vector";
  score: number;
  fase: string | null;
  objecttype: string;
  brondocument: string | null;
}

export interface SegmentNarrative {
  segment_id: string;
  sequence: number;
  km_start: number;
  km_end: number;
  narrative_md: string;
  context_summary: string;
  ai_aandacht: boolean;
  ai_aandacht_reden: string | null;
  ai_voorgestelde_techniek: string | null;
  aandacht_flags: string[];
  aandacht_reden: string | null;
  eisen_matches: EisenMatch[];
  prompt_tokens: number | null;
  completion_tokens: number | null;
}

export interface ScanRunResult {
  trace_id: string;
  generation_run_id: string;
  segments_processed: number;
  segments_attention: number;
  total_eisen_cited: number;
  duration_ms: number;
  warnings: string[];
}

// ──────────────────────────────────────────────────────────────────
// 1) runGenerateSegmentScanV1
// ──────────────────────────────────────────────────────────────────

export async function runGenerateSegmentScanV1(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<ScanRunResult> {
  const t0 = Date.now();
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(
      `[scan ${opts.traceId}] +${Date.now() - t0}ms ${msg}`,
      extra ? JSON.stringify(extra) : "",
    );

  const ai = getAIProvider();
  const generationRunId = crypto.randomUUID();
  const warnings: string[] = [];

  // Trace + project ophalen
  const { data: trace, error: traceErr } = await opts.supabase
    .from("traces")
    .select(
      `id, project_id,
       project:projects (id, name, client, perceel, phase_state, eisenpakket_version_id)`,
    )
    .eq("id", opts.traceId)
    .single();
  if (traceErr || !trace) throw new Error(`Trace ${opts.traceId} niet gevonden`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = trace.project;
  if (!project) throw new Error("Trace heeft geen project");

  // Segmenten met context-view
  const { data: segments, error: segErr } = await opts.supabase
    .from("v_segment_with_context")
    .select("*")
    .eq("trace_id", opts.traceId)
    .order("sequence");
  if (segErr) throw new Error(`Segments: ${segErr.message}`);
  if (!segments || segments.length === 0) {
    throw new Error("Geen segmenten gevonden. Draai eerst BGT-segmentatie.");
  }
  if (segments.length > MAX_SEGMENTS) {
    warnings.push(
      `Tracé heeft ${segments.length} segmenten — gecapt op ${MAX_SEGMENTS}.`,
    );
    segments.splice(MAX_SEGMENTS);
  }
  log(`segments=${segments.length}`);

  // Candidate-eisen voor dit project (via RPC)
  const { data: candidateRows, error: eisenErr } = await opts.supabase.rpc(
    "eisen_for_project",
    { p_project_id: project.id },
  );
  if (eisenErr) {
    throw new Error(`eisen_for_project: ${eisenErr.message}`);
  }
  const candidates = (candidateRows ?? []) as Array<{
    eis_id: string;
    eis_code: string;
    eistitel: string;
    eistekst?: string;
    fase: string | null;
    objecttype: string;
    brondocument: string | null;
    embedding: string | number[] | null;
  }>;
  log(`candidate_eisen=${candidates.length}`);

  if (candidates.length === 0) {
    warnings.push(
      "Geen eisen-candidates voor dit project — eisenpakket leeg of scope mismatch.",
    );
  }

  // Verwijder oude segment_descriptions voor dit trace_id (idempotent)
  await supabaseAdmin
    .from("segment_descriptions")
    .delete()
    .eq("trace_id", opts.traceId);

  // Process in batches met parallel concurrency
  const batches: Array<typeof segments> = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  const allNarratives: SegmentNarrative[] = [];
  let totalCited = 0;
  let attentionCount = 0;

  for (let i = 0; i < batches.length; i += MAX_PARALLEL) {
    const slice = batches.slice(i, i + MAX_PARALLEL);
    const results = await Promise.all(
      slice.map((batch) =>
        processBatch({
          batch,
          candidates,
          project,
          ai,
        }).catch((e) => {
          warnings.push(`Batch faalde: ${e instanceof Error ? e.message : e}`);
          return [] as SegmentNarrative[];
        }),
      ),
    );
    for (const narratives of results) {
      allNarratives.push(...narratives);
    }
    log(`batch-group ${i / MAX_PARALLEL + 1}/${Math.ceil(batches.length / MAX_PARALLEL)} done`);
  }

  // Persist
  const rows = allNarratives.map((n) => ({
    trace_id: opts.traceId,
    segment_id: n.segment_id,
    narrative_md: n.narrative_md,
    context_summary: n.context_summary,
    ai_aandacht: n.ai_aandacht,
    ai_aandacht_reden: n.ai_aandacht_reden,
    ai_voorgestelde_techniek: n.ai_voorgestelde_techniek,
    aandacht_flags: n.aandacht_flags,
    aandacht_reden: n.aandacht_reden,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eisen_matches: n.eisen_matches as any,
    model: ai.generationModel,
    prompt_tokens: n.prompt_tokens,
    completion_tokens: n.completion_tokens,
    generation_run_id: generationRunId,
    generated_by: opts.userId,
  }));

  // Insert in chunks (Postgres parameter cap)
  const INSERT_CHUNK = 100;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error: insertErr } = await supabaseAdmin
      .from("segment_descriptions")
      .insert(chunk);
    if (insertErr) {
      throw new Error(`Insert segment_descriptions: ${insertErr.message}`);
    }
  }
  log(`persisted=${rows.length}`);

  for (const n of allNarratives) {
    if (n.ai_aandacht || n.aandacht_flags.length > 0) attentionCount += 1;
    totalCited += n.eisen_matches.length;
  }

  await supabaseAdmin.from("audit_log").insert({
    project_id: project.id,
    user_id: opts.userId,
    action: "generate_segment_scan_v1",
    resource_type: "trace",
    resource_id: opts.traceId,
    payload: {
      generation_run_id: generationRunId,
      segments_processed: allNarratives.length,
      segments_attention: attentionCount,
      total_eisen_cited: totalCited,
      model: ai.generationModel,
      duration_ms: Date.now() - t0,
      warnings,
    },
  });

  return {
    trace_id: opts.traceId,
    generation_run_id: generationRunId,
    segments_processed: allNarratives.length,
    segments_attention: attentionCount,
    total_eisen_cited: totalCited,
    duration_ms: Date.now() - t0,
    warnings,
  };
}

// ──────────────────────────────────────────────────────────────────
// Batch processing
// ──────────────────────────────────────────────────────────────────

interface BatchInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batch: any[];
  candidates: Array<{
    eis_id: string;
    eis_code: string;
    eistitel: string;
    eistekst?: string;
    fase: string | null;
    objecttype: string;
    brondocument: string | null;
    embedding: string | number[] | null;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
  ai: ReturnType<typeof getAIProvider>;
}

async function processBatch(input: BatchInput): Promise<SegmentNarrative[]> {
  const { batch, candidates, project, ai } = input;

  // Build context summaries (for embedding + AI)
  const contexts = batch.map((seg) => buildSegmentContext(seg));

  // Generate embeddings for whole batch in one call
  let contextEmbeddings: number[][] = [];
  if (candidates.some((c) => c.embedding)) {
    try {
      contextEmbeddings = await ai.embed({
        input: contexts.map((c) => c.summary),
      });
    } catch (e) {
      console.warn("[scan] embedding failed, fallback to rules-only:", e);
    }
  }

  // Process per segment (sequentially within batch to keep memory small)
  const out: SegmentNarrative[] = [];
  for (let i = 0; i < batch.length; i++) {
    const seg = batch[i];
    const ctx = contexts[i];
    const queryVec = contextEmbeddings[i] ?? null;

    const matches = matchEisen({
      segment: seg,
      candidates,
      queryVec,
    });

    const { narrative, aiFlags, prompt_tokens, completion_tokens } =
      await generateSegmentNarrative({
        ai,
        segment: seg,
        context: ctx.summary,
        eisen: matches,
        project,
      });

    out.push({
      segment_id: seg.id,
      sequence: seg.sequence,
      km_start: Number(seg.km_start ?? 0),
      km_end: Number(seg.km_end ?? 0),
      narrative_md: narrative,
      context_summary: ctx.summary,
      ai_aandacht: aiFlags.aandacht,
      ai_aandacht_reden: aiFlags.reden,
      ai_voorgestelde_techniek: aiFlags.techniek,
      aandacht_flags: ctx.autoFlags,
      aandacht_reden: ctx.autoReden,
      eisen_matches: matches,
      prompt_tokens,
      completion_tokens,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Context builder
// ──────────────────────────────────────────────────────────────────

interface SegmentContext {
  summary: string;
  autoFlags: string[];
  autoReden: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSegmentContext(seg: any): SegmentContext {
  const flags: string[] = Array.isArray(seg.aandacht_flags_auto)
    ? seg.aandacht_flags_auto
    : [];
  const reden: string | null = seg.aandacht_reden_auto ?? null;

  const length = Math.round(Number(seg.length_m ?? 0));
  const km = `${Number(seg.km_start ?? 0).toFixed(0)}-${Number(seg.km_end ?? 0).toFixed(0)}m`;
  const bgt = `${seg.bgt_feature_type ?? "?"}${seg.bgt_subtype ? ` (${seg.bgt_subtype})` : ""}`;
  const beheerder = seg.beheerder ? `, beheerder ${seg.beheerder}` : "";
  const fysiek = seg.bgt_fysiek_voorkomen
    ? `, oppervlak ${seg.bgt_fysiek_voorkomen}`
    : "";
  const nearby = (seg.nearby_features ?? {}) as Record<string, unknown>;
  const nearbyParts: string[] = [];
  if (Number(seg.pand_count ?? 0) > 0)
    nearbyParts.push(`${seg.pand_count} panden binnen 5m`);
  if (Number(seg.waterdeel_count ?? 0) > 0)
    nearbyParts.push(`${seg.waterdeel_count} waterdelen binnen 5m`);
  if (Number(seg.wegkruising_count ?? 0) > 0)
    nearbyParts.push(`${seg.wegkruising_count} wegkruisingen`);
  const nearbyStr = nearbyParts.length > 0 ? `. Omgeving: ${nearbyParts.join(", ")}` : "";

  const summary = `Segment ${seg.sequence} (km ${km}, lengte ${length}m): ${bgt}${fysiek}${beheerder}${nearbyStr}.${
    flags.length > 0 ? ` Auto-flags: ${flags.join(", ")}.` : ""
  }`;

  return { summary, autoFlags: flags, autoReden: reden };
}

// ──────────────────────────────────────────────────────────────────
// Hybride eisen-matching (Laag 1 regels + Laag 2 pgvector)
// ──────────────────────────────────────────────────────────────────

interface MatchInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  segment: any;
  candidates: BatchInput["candidates"];
  queryVec: number[] | null;
}

function matchEisen(input: MatchInput): EisenMatch[] {
  const { segment, candidates, queryVec } = input;
  const bgtType = String(segment.bgt_feature_type ?? "").toLowerCase();
  const bgtSubtype = String(segment.bgt_subtype ?? "").toLowerCase();
  const beheerderType = String(segment.beheerder_type ?? "").toLowerCase();
  const flags: string[] = Array.isArray(segment.aandacht_flags_auto)
    ? segment.aandacht_flags_auto
    : [];

  // Laag 1: regels
  const ruleMatches = new Map<string, EisenMatch>();
  for (const c of candidates) {
    let score = 0;
    const obj = c.objecttype.toLowerCase();
    const fase = (c.fase ?? "").toLowerCase();

    // Algemene MS-kabel-eisen passen altijd op kabeltracé
    if (obj.includes("ms-kabel") || obj.includes("ms kabel") || obj === "ms_kabel") {
      score += 0.5;
    }
    // BGT-type matching
    if (bgtType && obj.includes(bgtType)) score += 0.3;
    if (bgtSubtype && obj.includes(bgtSubtype)) score += 0.2;
    // Beheerder context (gemeente/rws/waterschap)
    if (beheerderType && obj.includes(beheerderType)) score += 0.15;
    // Fase prioriteit
    if (fase.includes("vo") || fase.includes("ontwerp")) score += 0.05;
    // Aandacht-flag matching
    for (const f of flags) {
      if (obj.includes(f.toLowerCase())) score += 0.2;
    }

    if (score >= 0.3) {
      ruleMatches.set(c.eis_id, {
        eis_id: c.eis_id,
        eis_code: c.eis_code,
        eistitel: c.eistitel,
        source: "rule",
        score: Math.min(score, 1),
        fase: c.fase,
        objecttype: c.objecttype,
        brondocument: c.brondocument,
      });
    }
  }

  // Empty fallback: alle MS-kabel-eisen op 0.3
  if (ruleMatches.size === 0) {
    for (const c of candidates) {
      const obj = c.objecttype.toLowerCase();
      if (obj.includes("ms-kabel") || obj.includes("ms kabel") || obj === "ms_kabel") {
        ruleMatches.set(c.eis_id, {
          eis_id: c.eis_id,
          eis_code: c.eis_code,
          eistitel: c.eistitel,
          source: "rule",
          score: 0.3,
          fase: c.fase,
          objecttype: c.objecttype,
          brondocument: c.brondocument,
        });
      }
    }
  }

  // Top K regels
  const topRules = [...ruleMatches.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_RULES);

  // Laag 2: pgvector cosine
  const vectorScores = new Map<string, { match: EisenMatch; cos: number }>();
  if (queryVec) {
    for (const c of candidates) {
      const v = parseVector(c.embedding);
      if (!v) continue;
      const cos = cosine(queryVec, v);
      if (cos < MIN_VECTOR_SCORE) continue;
      vectorScores.set(c.eis_id, {
        cos,
        match: {
          eis_id: c.eis_id,
          eis_code: c.eis_code,
          eistitel: c.eistitel,
          source: "vector",
          score: cos,
          fase: c.fase,
          objecttype: c.objecttype,
          brondocument: c.brondocument,
        },
      });
    }
  }
  const topVector = [...vectorScores.values()]
    .sort((a, b) => b.cos - a.cos)
    .slice(0, TOP_K_VECTOR)
    .map((v) => v.match);

  // Merge: union, source upgraded to rule+vector als beide hits
  const merged = new Map<string, EisenMatch>();
  for (const r of topRules) merged.set(r.eis_id, r);
  for (const v of topVector) {
    const existing = merged.get(v.eis_id);
    if (existing) {
      merged.set(v.eis_id, {
        ...existing,
        source: "rule+vector",
        score: Math.max(existing.score, v.score),
      });
    } else {
      merged.set(v.eis_id, v);
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

// ──────────────────────────────────────────────────────────────────
// Per-segment narrative via Lovable AI (Gemini Flash standaard)
// ──────────────────────────────────────────────────────────────────

const SEGMENT_NARRATIVE_SYSTEM = `Je bent een Nederlandse senior-elektrotechnisch ingenieur die per BGT-segment een korte, feitelijke beschrijving schrijft voor een MS-kabel ontwerptracé.

REGELS:
1. Schrijf in Nederlands, professioneel en zakelijk. 2-4 zinnen per segment.
2. Beschrijf alléén wat in de context staat. NIETS verzinnen.
3. Citeer eisen alleen via [EIS-<eis_code>] uit de meegeleverde lijst. NOOIT eis-codes verzinnen.
4. Geef terug als JSON met velden: narrative_md (string), aandacht (boolean), aandacht_reden (string of null), voorgestelde_techniek (string of null — bv "open ontgraving", "gestuurde boring", "persing").
5. aandacht=true alleen bij: water-kruising, wegkruising hoofdweg, zeer korte segmenten <2m, ontbrekende beheerder, of expliciete auto-flag.
6. Antwoord ALLEEN met geldige JSON, geen markdown-fences.`;

interface NarrativeResult {
  narrative: string;
  aiFlags: {
    aandacht: boolean;
    reden: string | null;
    techniek: string | null;
  };
  prompt_tokens: number | null;
  completion_tokens: number | null;
}

async function generateSegmentNarrative(opts: {
  ai: ReturnType<typeof getAIProvider>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  segment: any;
  context: string;
  eisen: EisenMatch[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
}): Promise<NarrativeResult> {
  const { ai, context, eisen, project } = opts;

  const eisenBlock = eisen.length === 0
    ? "(geen eisen gematcht)"
    : eisen
        .slice(0, 10)
        .map(
          (e) =>
            `- [EIS-${e.eis_code}] ${e.eistitel} (objecttype: ${e.objecttype}, fase: ${e.fase ?? "?"})`,
        )
        .join("\n");

  const userPrompt = `# PROJECT
- ${project.name} (${project.client ?? "?"})

# SEGMENT-CONTEXT
${context}

# GEMATCHTE EISEN (gebruik alleen [EIS-<code>] uit deze lijst)
${eisenBlock}

Schrijf nu de JSON-respons.`;

  let gen;
  try {
    gen = await ai.generate({
      system: SEGMENT_NARRATIVE_SYSTEM,
      user: userPrompt,
      maxTokens: NARRATIVE_MAX_TOKENS,
    });
  } catch (e) {
    return {
      narrative: `_Beschrijving niet gegenereerd: ${e instanceof Error ? e.message : "AI fout"}._`,
      aiFlags: { aandacht: false, reden: null, techniek: null },
      prompt_tokens: null,
      completion_tokens: null,
    };
  }

  const parsed = parseNarrativeJson(gen.text);
  // Anti-hallucinatie: filter eis-citaties
  const allowedCodes = new Set(eisen.map((e) => e.eis_code));
  const cleaned = parsed.narrative.replace(
    /\[EIS-([A-Za-z0-9._\-]+)\]/g,
    (full, code) => (allowedCodes.has(code) ? full : ""),
  );

  return {
    narrative: cleaned,
    aiFlags: {
      aandacht: parsed.aandacht,
      reden: parsed.reden,
      techniek: parsed.techniek,
    },
    prompt_tokens: gen.input_tokens,
    completion_tokens: gen.output_tokens,
  };
}

function parseNarrativeJson(text: string): {
  narrative: string;
  aandacht: boolean;
  reden: string | null;
  techniek: string | null;
} {
  // Strip markdown fences
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  // Vind eerste {...} blok
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    return { narrative: text, aandacht: false, reden: null, techniek: null };
  }
  try {
    const obj = JSON.parse(match[0]);
    return {
      narrative: String(obj.narrative_md ?? obj.narrative ?? text),
      aandacht: Boolean(obj.aandacht ?? false),
      reden: obj.aandacht_reden ?? obj.reden ?? null,
      techniek: obj.voorgestelde_techniek ?? obj.techniek ?? null,
    };
  } catch {
    return { narrative: text, aandacht: false, reden: null, techniek: null };
  }
}

// ──────────────────────────────────────────────────────────────────
// 2) runExportBrondocumentV1Docx
// ──────────────────────────────────────────────────────────────────

export interface BrondocumentExportResult {
  url: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
}

export async function runExportBrondocumentV1Docx(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<BrondocumentExportResult> {
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

  const { data: descriptions, error: descErr } = await opts.supabase
    .from("segment_descriptions")
    .select(
      `id, segment_id, narrative_md, ai_aandacht, ai_aandacht_reden,
       ai_voorgestelde_techniek, aandacht_flags, aandacht_reden,
       eisen_matches, generated_at, model,
       segment:segments (sequence, km_start, km_end, length_m,
         bgt_feature_type, bgt_subtype, beheerder, bgt_lokaal_id)`,
    )
    .eq("trace_id", opts.traceId)
    .order("segment(sequence)" as never);
  if (descErr) throw new Error(`Descriptions: ${descErr.message}`);
  if (!descriptions || descriptions.length === 0) {
    throw new Error(
      "Geen segment-beschrijvingen gevonden. Genereer eerst de scan.",
    );
  }

  const dateStr = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = [...descriptions].sort((a: any, b: any) => {
    const sa = Number(a.segment?.sequence ?? 0);
    const sb = Number(b.segment?.sequence ?? 0);
    return sa - sb;
  });

  // Statistieken
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attentionRows = sorted.filter((d: any) => d.ai_aandacht || (d.aandacht_flags?.length ?? 0) > 0);
  const eisenCounts = new Map<string, { count: number; titel: string; bron: string | null }>();
  for (const d of sorted) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (d.eisen_matches ?? []) as any[]) {
      const cur = eisenCounts.get(m.eis_code) ?? {
        count: 0,
        titel: m.eistitel,
        bron: m.brondocument,
      };
      cur.count += 1;
      eisenCounts.set(m.eis_code, cur);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];
  children.push(
    new Paragraph({
      text: "Brondocument v1",
      heading: HeadingLevel.HEADING_1,
    }),
    metaLine("Project", project.name ?? "—"),
    metaLine("Opdrachtgever", project.client ?? "—"),
    metaLine("Tracé-variant", trace.variant_label ?? trace.variant ?? "—"),
    metaLine("Fase", phaseLabel(project.phase_state)),
    metaLine("Gegenereerd", dateStr),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Samenvatting",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: `Dit brondocument bevat per-segment beschrijvingen voor ${sorted.length} BGT-segmenten langs het tracé. ${attentionRows.length} segmenten zijn als aandachtspunt gemarkeerd. Totaal ${eisenCounts.size} unieke eisen geciteerd.`,
    }),
    new Paragraph({ text: "" }),
  );

  // Per-km tabel
  children.push(
    new Paragraph({
      text: "Per segment",
      heading: HeadingLevel.HEADING_2,
    }),
    buildSegmentTable(sorted),
    new Paragraph({ text: "" }),
  );

  // Appendix A: aandachtspunten
  if (attentionRows.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        text: "Bijlage A — Aandachtspunten",
        heading: HeadingLevel.HEADING_2,
      }),
    );
    for (const d of attentionRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seg: any = d.segment;
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Segment ${seg?.sequence ?? "?"} (km ${Number(seg?.km_start ?? 0).toFixed(0)}–${Number(seg?.km_end ?? 0).toFixed(0)}m): `,
              bold: true,
            }),
            new TextRun({
              text:
                d.ai_aandacht_reden ??
                d.aandacht_reden ??
                (Array.isArray(d.aandacht_flags) ? (d.aandacht_flags as string[]).join(", ") : ""),
            }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Appendix B: eisen cross-reference (truncate >100)
  const eisenList = [...eisenCounts.entries()].sort((a, b) => b[1].count - a[1].count);
  const trimmed = eisenList.slice(0, 100);
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      text: "Bijlage B — Geciteerde eisen",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: `${eisenList.length} unieke eisen geciteerd${eisenList.length > 100 ? ` (top 100 getoond)` : ""}.`,
    }),
    new Paragraph({ text: "" }),
    buildEisenTable(trimmed),
  );

  // Footer
  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Gegenereerd door De Tracémolen — ${descriptions[0]?.model ?? "AI"} — ${dateStr}`,
          italics: true,
          size: 18,
          color: "888888",
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "De Tracémolen",
    title: `Brondocument v1 — ${project.name ?? ""}`,
    description: "Per-segment BGT-narratief met eisen-matching",
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

  const filename = `brondocument-v1_${slugify(project.name ?? "project")}_${Date.now()}.docx`;
  const storagePath = `${project.id}/${opts.traceId}/${filename}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("exports")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (upErr) throw new Error(`Upload: ${upErr.message}`);

  const { data: urlData, error: urlErr } = await supabaseAdmin.storage
    .from("exports")
    .createSignedUrl(storagePath, 24 * 60 * 60);
  if (urlErr || !urlData) throw new Error(`Signed URL: ${urlErr?.message ?? "?"}`);

  await supabaseAdmin.from("project_artifacts").insert({
    project_id: project.id,
    trace_id: opts.traceId,
    product_code: "brondocument_v1",
    phase_state_at_gen: project.phase_state,
    model: descriptions[0]?.model ?? null,
    status: "draft",
    generated_by: opts.userId,
    storage_path: storagePath,
    file_size_bytes: buffer.byteLength,
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await supabaseAdmin.from("exports").insert({
    project_id: project.id,
    trace_id: opts.traceId,
    export_type: "brondocument_v1_docx",
    storage_path: storagePath,
    file_size_bytes: buffer.byteLength,
    generated_by: opts.userId,
  });

  await supabaseAdmin.from("audit_log").insert({
    project_id: project.id,
    user_id: opts.userId,
    action: "export_brondocument_v1_docx",
    resource_type: "trace",
    resource_id: opts.traceId,
    payload: {
      storage_path: storagePath,
      file_size_bytes: buffer.byteLength,
      segment_count: sorted.length,
      attention_count: attentionRows.length,
      eisen_count: eisenCounts.size,
    },
  });

  return {
    url: urlData.signedUrl,
    storage_path: storagePath,
    filename,
    size_bytes: buffer.byteLength,
  };
}

// ──────────────────────────────────────────────────────────────────
// DOCX helpers
// ──────────────────────────────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSegmentTable(rows: any[]): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const header = new TableRow({
    children: ["#", "km", "BGT-type", "Beschrijving", "Aandacht", "# Eisen"].map(
      (h) =>
        new TableCell({
          borders,
          shading: { fill: "F1ECE6", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true })] }),
          ],
        }),
    ),
  });
  const dataRows = rows.map((d) => {
    const seg = d.segment ?? {};
    const aandacht = d.ai_aandacht || (d.aandacht_flags?.length ?? 0) > 0;
    return new TableRow({
      children: [
        cell(String(seg.sequence ?? "?"), borders),
        cell(
          `${Number(seg.km_start ?? 0).toFixed(0)}–${Number(seg.km_end ?? 0).toFixed(0)}m`,
          borders,
        ),
        cell(seg.bgt_feature_type ?? "—", borders),
        cell((d.narrative_md ?? "").substring(0, 280), borders),
        cell(aandacht ? "⚠" : "", borders),
        cell(String((d.eisen_matches ?? []).length), borders),
      ],
    });
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [header, ...dataRows],
  });
}

function buildEisenTable(
  rows: Array<[string, { count: number; titel: string; bron: string | null }]>,
): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const header = new TableRow({
    children: ["Eis-code", "Titel", "Bron", "# Segmenten"].map(
      (h) =>
        new TableCell({
          borders,
          shading: { fill: "F1ECE6", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true })] }),
          ],
        }),
    ),
  });
  const data = rows.map(
    ([code, info]) =>
      new TableRow({
        children: [
          cell(code, borders),
          cell(info.titel, borders),
          cell(info.bron ?? "—", borders),
          cell(String(info.count), borders),
        ],
      }),
  );
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [header, ...data],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cell(text: string, borders: any): TableCell {
  return new TableCell({
    borders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text })] })],
  });
}
