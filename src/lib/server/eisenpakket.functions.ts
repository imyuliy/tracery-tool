// De Tracémolen — Server functions voor eisenpakket-import en sectie-generatie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getAIProvider,
  cosine,
  toVectorLiteral,
  parseVector,
} from "./ai-provider.server";

const EMBEDDING_DIM = 1536;
const EMBEDDING_BATCH = 200;
const INSERT_BATCH = 500;
const TOP_K_EISEN = 15;
const MAX_TOKENS = 4000;

const EXPECTED_HEADERS = [
  "Objecttype",
  "Klantnummer",
  "Eistitel",
  "Eistekst",
  "Brondocument",
  "Bijlage",
  "Type",
  "Scope",
  "Titel verificatieplan",
  "Fase",
  "Verantwoordelijke rol",
  "Verificatiemethode",
  "Type bewijsdocument",
] as const;

interface EisRow {
  objecttype: string;
  eis_code: string;
  eistitel: string;
  eistekst: string;
  brondocument: string | null;
  bron_prefix: string | null;
  fase: string | null;
  verantwoordelijke_rol: string | null;
  verificatiemethode: string | null;
  type_bewijsdocument: string | null;
  raw: Record<string, unknown>;
}

// ============================================================================
// 1) Import eisenpakket xlsx
// ============================================================================

const importSchema = z.object({
  eisenpakket_id: z.string().uuid(),
  version_label: z.string().min(1).max(80),
  storage_path: z.string().min(1).max(500),
  source_file_hash: z.string().max(128).optional().nullable(),
});

export const importEisenpakketXlsx = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const log = (phase: string, extra?: Record<string, unknown>) => {
      console.log(
        `[import ${data.version_label}] +${Date.now() - t0}ms ${phase}`,
        extra ? JSON.stringify(extra) : "",
      );
    };
    log("START", { eisenpakket_id: data.eisenpakket_id, storage_path: data.storage_path });

    const { supabase, userId } = context;
    const ai = getAIProvider();
    log("ai-provider-ok", { embed: ai.embeddingModel });

    // RLS-check: kan deze user dit pakket lezen?
    const { data: pakket, error: pakketErr } = await supabase
      .from("eisenpakketten")
      .select("id, org_id")
      .eq("id", data.eisenpakket_id)
      .single();
    if (pakketErr || !pakket) {
      log("FAIL pakket-lookup", { error: pakketErr?.message });
      throw new Error("Eisenpakket niet gevonden of geen toegang.");
    }
    log("pakket-ok");

    // Idempotency — alleen ACTIVE versies tellen als duplicaat.
    // Drafts = mislukte imports, die ruimen we hieronder op.
    if (data.source_file_hash) {
      const { data: existing } = await supabaseAdmin
        .from("eisenpakket_versions")
        .select("id, row_count")
        .eq("eisenpakket_id", data.eisenpakket_id)
        .eq("source_file_hash", data.source_file_hash)
        .eq("status", "active")
        .maybeSingle();
      if (existing) {
        log("DUPLICATE — skipping", { existing_id: existing.id });
        return {
          version_id: existing.id,
          row_count: existing.row_count ?? 0,
          inserted: 0,
          skipped_duplicates: existing.row_count ?? 0,
          embedding_model: ai.embeddingModel,
          message: `Al geïmporteerd als versie ${existing.id}.`,
        };
      }
    }
    log("idempotency-check-ok");

    // Ruim mislukte drafts voor dit pakket op (rollback van vorige poging)
    const { data: stuckDrafts } = await supabaseAdmin
      .from("eisenpakket_versions")
      .select("id")
      .eq("eisenpakket_id", data.eisenpakket_id)
      .eq("status", "draft");
    if (stuckDrafts && stuckDrafts.length > 0) {
      const draftIds = stuckDrafts.map((d) => d.id);
      await supabaseAdmin.from("eisen").delete().in("eisenpakket_version_id", draftIds);
      await supabaseAdmin.from("eisenpakket_versions").delete().in("id", draftIds);
      log("cleaned-stuck-drafts", { count: draftIds.length });
    }

    // Download xlsx via admin (storage RLS bypass)
    const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage
      .from("requirements")
      .download(data.storage_path);
    if (dlErr || !fileBlob) {
      log("FAIL download", { error: dlErr?.message });
      throw new Error(
        `Kan bestand ${data.storage_path} niet downloaden: ${dlErr?.message ?? "onbekend"}`,
      );
    }
    log("downloaded", { size_bytes: fileBlob.size });

    const arrayBuffer = await fileBlob.arrayBuffer();
    log("arraybuffer-ok", { bytes: arrayBuffer.byteLength });

    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    log("xlsx-read-ok", { sheets: workbook.SheetNames });

    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) throw new Error("Geen werkbladen in Excel");

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      blankrows: false,
    });
    log("sheet-to-json-ok", { rows: raw.length });
    if (raw.length === 0) throw new Error("Excel is leeg");

    const headers = Object.keys(raw[0]);
    const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(
        `Verwachte kopregels ontbreken: ${missing.join(", ")}. Gevonden: ${headers.join(", ")}`,
      );
    }

    const eisen: EisRow[] = [];
    const errors: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const objecttype = strOrNull(r["Objecttype"]);
      const eis_code = strOrNull(r["Klantnummer"]);
      const eistitel = strOrNull(r["Eistitel"]);
      const eistekst = strOrNull(r["Eistekst"]);
      if (!objecttype || !eis_code || !eistitel || !eistekst) {
        errors.push(`Rij ${i + 2}: verplichte velden ontbreken`);
        continue;
      }
      const brondocument = strOrNull(r["Brondocument"]);
      eisen.push({
        objecttype,
        eis_code,
        eistitel,
        eistekst,
        brondocument,
        bron_prefix: brondocument
          ? brondocument.trim().split(/\s+/)[0] ?? null
          : null,
        fase: strOrNull(r["Fase"]),
        verantwoordelijke_rol: strOrNull(r["Verantwoordelijke rol"]),
        verificatiemethode: strOrNull(r["Verificatiemethode"]),
        type_bewijsdocument: strOrNull(r["Type bewijsdocument"]),
        raw: {
          Bijlage: r["Bijlage"],
          Type: r["Type"],
          Scope: r["Scope"],
          "Titel verificatieplan": r["Titel verificatieplan"],
        },
      });
    }

    // Dedup binnen XLSX op (objecttype, eis_code) — eerste voorkomen wint
    const seen = new Set<string>();
    const dedupedEisen: EisRow[] = [];
    let duplicatesInFile = 0;
    for (const e of eisen) {
      const key = `${e.objecttype}||${e.eis_code}`;
      if (seen.has(key)) {
        duplicatesInFile++;
        errors.push(`Duplicaat (objecttype="${e.objecttype}", eis_code="${e.eis_code}") — overgeslagen`);
        continue;
      }
      seen.add(key);
      dedupedEisen.push(e);
    }
    log("dedup-done", {
      input: eisen.length,
      after_dedup: dedupedEisen.length,
      duplicates_skipped: duplicatesInFile,
    });

    if (dedupedEisen.length === 0) {
      throw new Error(
        `Geen valide rijen na dedup. Errors: ${errors.slice(0, 5).join("; ")}`,
      );
    }

    // Vervang eisen met dedup'd versie voor de rest van de pipeline
    const finalEisen = dedupedEisen;

    // Draft version row
    const fileName = data.storage_path.split("/").pop() ?? data.storage_path;
    const { data: versionRow, error: versionErr } = await supabaseAdmin
      .from("eisenpakket_versions")
      .insert({
        eisenpakket_id: data.eisenpakket_id,
        version_label: data.version_label,
        status: "draft",
        source_file: fileName,
        source_file_hash: data.source_file_hash ?? null,
        row_count: eisen.length,
        imported_by: userId,
      })
      .select("id")
      .single();

    if (versionErr || !versionRow) {
      log("FAIL version-insert", { error: versionErr?.message });
      throw new Error(
        `Kan version-rij niet aanmaken: ${versionErr?.message ?? "onbekend"}`,
      );
    }
    const version_id = versionRow.id;
    log("version-row-ok", { version_id, parse_errors: errors.length, valid_rows: eisen.length });

    try {
      // Embeddings batched
      const embeddings: number[][] = new Array(eisen.length);
      const totalBatches = Math.ceil(eisen.length / EMBEDDING_BATCH);
      for (let start = 0; start < eisen.length; start += EMBEDDING_BATCH) {
        const batchNum = Math.floor(start / EMBEDDING_BATCH) + 1;
        const batch = eisen.slice(start, start + EMBEDDING_BATCH);
        const inputs = batch.map((e) => `${e.eistitel}\n\n${e.eistekst}`);
        const tBatch = Date.now();
        const batchEmbeds = await ai.embed({
          input: inputs,
          dimensionality: EMBEDDING_DIM,
        });
        log(`embed-batch ${batchNum}/${totalBatches}`, {
          rows: batch.length,
          ms: Date.now() - tBatch,
        });
        for (let j = 0; j < batch.length; j++) {
          embeddings[start + j] = batchEmbeds[j];
        }
      }
      log("embeddings-done");

      // Insert
      let inserted = 0;
      const totalInsertBatches = Math.ceil(eisen.length / INSERT_BATCH);
      for (let start = 0; start < eisen.length; start += INSERT_BATCH) {
        const batchNum = Math.floor(start / INSERT_BATCH) + 1;
        const tBatch = Date.now();
        const batch = eisen.slice(start, start + INSERT_BATCH).map((e, idx) => ({
          eisenpakket_version_id: version_id,
          objecttype: e.objecttype,
          eis_code: e.eis_code,
          eistitel: e.eistitel,
          eistekst: e.eistekst,
          brondocument: e.brondocument,
          bron_prefix: e.bron_prefix,
          fase: e.fase,
          verantwoordelijke_rol: e.verantwoordelijke_rol,
          verificatiemethode: e.verificatiemethode,
          type_bewijsdocument: e.type_bewijsdocument,
          embedding: toVectorLiteral(embeddings[start + idx]),
          raw: e.raw as never,
        }));
        const { error: insertErr } = await supabaseAdmin
          .from("eisen")
          .insert(batch);
        if (insertErr) {
          log(`FAIL insert-batch ${batchNum}`, { error: insertErr.message });
          throw new Error(`Insert batch ${start}: ${insertErr.message}`);
        }
        inserted += batch.length;
        log(`insert-batch ${batchNum}/${totalInsertBatches}`, {
          rows: batch.length,
          ms: Date.now() - tBatch,
        });
      }
      log("inserts-done", { total: inserted });

      await supabaseAdmin
        .from("eisenpakket_versions")
        .update({ status: "active" })
        .eq("id", version_id);
      log("version-activated");

      await supabaseAdmin.from("audit_log").insert({
        action: "eisenpakket_import",
        resource_type: "eisenpakket_version",
        resource_id: version_id,
        user_id: userId,
        payload: {
          eisenpakket_id: data.eisenpakket_id,
          version_label: data.version_label,
          source_file: data.storage_path,
          row_count: inserted,
          parse_errors: errors.length,
          embedding_model: ai.embeddingModel,
        },
      });

      log("DONE", { total_ms: Date.now() - t0, inserted });
      return {
        version_id,
        row_count: eisen.length,
        inserted,
        skipped_duplicates: 0,
        embedding_model: ai.embeddingModel,
        parse_errors: errors.length,
        first_errors: errors.slice(0, 10),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("CAUGHT — rolling back", { error: msg });
      // Rollback draft version on failure
      await supabaseAdmin.from("eisen").delete().eq("eisenpakket_version_id", version_id);
      await supabaseAdmin.from("eisenpakket_versions").delete().eq("id", version_id);
      throw e;
    }
  });

// ============================================================================
// 2) Generate report section
// ============================================================================

const generateSchema = z.object({
  trace_id: z.string().uuid(),
  section_number: z.string().min(1).max(10),
});

interface SectionConfig {
  number: string;
  title: string;
  retrievalQuery: string;
  systemPrompt: string;
}

const SECTION_CONFIG: Record<string, SectionConfig> = {
  "3.1": {
    number: "3.1",
    title: "Projectdoel en scope",
    retrievalQuery:
      "projectdoel scope tracé aansluitpunten spanningsniveau stations begrenzing uitgangspunten",
    systemPrompt: SECTION_3_1_PROMPT(),
  },
};

export const generateReportSection = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const config = SECTION_CONFIG[data.section_number];
    if (!config) throw new Error(`Sectie ${data.section_number} niet ondersteund`);

    const ai = getAIProvider();

    // Trace + project (via RLS — checks toegang)
    const { data: trace, error: traceErr } = await supabase
      .from("traces")
      .select(
        `
        id, variant, length_m, project_id,
        project:projects (
          id, name, client, perceel, status, eisenpakket_version_id,
          eisenpakket_version:eisenpakket_versions (
            id, version_label,
            eisenpakket:eisenpakketten ( id, client, name )
          )
        ),
        start_station:stations!traces_start_station_id_fkey ( id, name, station_type, spanningsniveau_kv_primair ),
        eind_station:stations!traces_eind_station_id_fkey ( id, name, station_type, spanningsniveau_kv_primair )
        `,
      )
      .eq("id", data.trace_id)
      .single();

    if (traceErr || !trace) throw new Error(`Trace ${data.trace_id} niet gevonden`);
    const project = trace.project as unknown as {
      id: string;
      name: string;
      client: string | null;
      perceel: string | null;
      eisenpakket_version_id: string | null;
      eisenpakket_version: {
        id: string;
        version_label: string;
        eisenpakket: { id: string; client: string; name: string } | null;
      } | null;
    } | null;
    if (!project) throw new Error("Trace heeft geen project");
    if (!project.eisenpakket_version_id) {
      throw new Error("Project heeft geen eisenpakket gekoppeld.");
    }

    const { data: params } = await supabase
      .from("design_parameters")
      .select("*")
      .eq("project_id", project.id)
      .eq("is_active", true)
      .maybeSingle();

    // Embedding van retrieval query
    const [queryEmbedding] = await ai.embed({
      input: [config.retrievalQuery],
      dimensionality: EMBEDDING_DIM,
    });

    // Applicable eisen via RPC (SECURITY INVOKER, dus RLS toepassing user)
    const { data: applicable, error: applicableErr } = await supabase.rpc(
      "eisen_for_project",
      { p_project_id: project.id },
    );
    if (applicableErr) throw new Error(`eisen_for_project: ${applicableErr.message}`);
    if (!applicable || applicable.length === 0) {
      throw new Error(
        "Geen applicable eisen. Configureer eerst project_eisen_scope.",
      );
    }

    const ranked = applicable
      .map((e) => ({
        ...e,
        score: cosine(queryEmbedding, parseVector(e.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K_EISEN);

    const userPrompt = buildUserPrompt({
      section: config,
      project,
      trace,
      params,
      topEisen: ranked,
    });

    const gen = await ai.generate({
      system: config.systemPrompt,
      user: userPrompt,
      maxTokens: MAX_TOKENS,
    });
    const markdown = gen.text;

    // Citatie-validatie
    const eisCodesInContext = new Set(ranked.map((e) => e.eis_code));
    const paramKeysInContext = params ? Object.keys(params) : [];
    const eisMatches = [...markdown.matchAll(/\[EIS-([A-Z0-9\-]+(?:-[A-Z0-9]+)*)\]/g)];
    const paramMatches = [...markdown.matchAll(/\[PARAM-([a-z_]+)\]/g)];

    const eisCountMap = new Map<string, number>();
    for (const m of eisMatches) eisCountMap.set(m[1], (eisCountMap.get(m[1]) ?? 0) + 1);
    const paramCountMap = new Map<string, number>();
    for (const m of paramMatches) paramCountMap.set(m[1], (paramCountMap.get(m[1]) ?? 0) + 1);

    const warnings: Array<{ type: string; message: string }> = [];
    for (const [code] of eisCountMap) {
      if (!eisCodesInContext.has(code)) {
        warnings.push({
          type: "hallucinated_eis",
          message: `[EIS-${code}] geciteerd maar niet in retrieval-set.`,
        });
      }
    }
    for (const [key] of paramCountMap) {
      if (!paramKeysInContext.includes(key)) {
        warnings.push({
          type: "unknown_param",
          message: `[PARAM-${key}] bestaat niet in design_parameters.`,
        });
      }
    }

    const sentences = markdown.split(/(?<=[.!?])\s+/);
    const ungrounded = sentences.filter(
      (s) => s.trim().length > 30 && !/\[(EIS|PARAM|OVERGANG|CONTEXT)-/.test(s),
    );
    if (ungrounded.length > 0) {
      warnings.push({
        type: "ungrounded_sentences",
        message: `${ungrounded.length} zinnen zonder bron-tag.`,
      });
    }

    const eisRefs = [...eisCountMap.entries()].map(([code, count]) => {
      const hit = ranked.find((e) => e.eis_code === code);
      return {
        eis_code: code,
        eis_id: hit?.eis_id ?? null,
        count,
        brondocument: hit?.brondocument ?? null,
      };
    });
    const paramRefs = [...paramCountMap.entries()].map(([key, count]) => ({
      key,
      count,
    }));

    const sources = {
      bgt: [],
      eisen: eisRefs,
      params: paramRefs,
      retrieval_top_k: TOP_K_EISEN,
      retrieval_query: config.retrievalQuery,
      embedding_model: ai.embeddingModel,
      generation_model: gen.model,
    };

    const auditHash = await sha256(
      JSON.stringify({
        trace_id: data.trace_id,
        section_number: data.section_number,
        markdown,
        sources,
      }),
    );

    const { data: sectionRow, error: insertErr } = await supabaseAdmin
      .from("report_sections")
      .insert({
        trace_id: data.trace_id,
        report_type: "BTO",
        section_number: config.number,
        section_title: config.title,
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

    await supabaseAdmin.from("audit_log").insert({
      project_id: project.id,
      user_id: userId,
      action: "generate_section",
      resource_type: "report_section",
      resource_id: sectionRow.id,
      payload: {
        section_number: config.number,
        model: gen.model,
        embedding_model: ai.embeddingModel,
        eisen_cited: eisRefs.length,
        params_cited: paramRefs.length,
        warnings: warnings.length,
      },
    });

    return {
      section_id: sectionRow.id,
      markdown,
      model: gen.model,
      embedding_model: ai.embeddingModel,
      eis_refs: eisRefs,
      param_refs: paramRefs,
      warnings,
    };
  });

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function SECTION_3_1_PROMPT(): string {
  return `Je bent een senior engineering-consultant bij Vayu Solutions die rapport-secties
schrijft voor MS-kabel-tracé-ontwerpen ("Basis Trace Onderzoek" / BTO).

Je schrijft sectie 3.1 "Projectdoel en scope" van een BTO-rapport voor Liander.

# ABSOLUTE REGELS

1. **Elke feitelijke zin eindigt met minstens één bron-tag.**
   - [EIS-<eis_code>] voor een eis uit het eisenpakket
   - [PARAM-<key>] voor een ontwerpparameter
   - [CONTEXT-<veld>] voor project-metadata (bv. [CONTEXT-client])
   - [OVERGANG] voor pure overgangszinnen zonder feitelijke inhoud

2. **Nooit een eis citeren die niet in de EISEN-lijst hieronder staat.**
   Als je een eis niet kunt vinden die iets ondersteunt, schrijf dan:
   "Geen eis van toepassing op dit aspect in huidig eisenpakket."

3. **Geen getallen of specificaties verzinnen.** Alles feitelijks moet
   terug te voeren zijn op de gegeven input.

4. **Schrijf in het Nederlands.** Formeel, zakelijk, consultancy-register.
   Korte alineas. Geen marketing-toon.

5. **Structuur van sectie 3.1:**
   - Korte inleiding: wat is het projectdoel (1 alinea)
   - Scope: wat is binnen scope (bullet-lijst)
   - Uitgangspunten: welke ontwerpparameters gelden
   - Afbakening: wat valt expliciet BUITEN scope
   - Eisenpakket-referentie: welk pakket + versie wordt gevolgd

6. **Max 600 woorden.** Beknopt is beter.

7. **Als kritieke input ontbreekt**: schrijf EXPLICIET "Nog niet gedefinieerd
   — vereist aanvullende input" i.p.v. te verzinnen.

8. **Output is pure markdown** — geen uitleg ervoor of erna, geen meta-
   commentaar. Start direct met de inhoud.`;
}

function buildUserPrompt(input: {
  section: SectionConfig;
  project: {
    name: string;
    client: string | null;
    perceel: string | null;
    eisenpakket_version: {
      version_label: string;
      eisenpakket: { client: string; name: string } | null;
    } | null;
  };
  trace: {
    variant: string;
    length_m: number | null;
    start_station: { name: string; station_type: string; spanningsniveau_kv_primair: number } | null;
    eind_station: { name: string; station_type: string; spanningsniveau_kv_primair: number } | null;
  };
  params: Record<string, unknown> | null;
  topEisen: Array<{
    eis_code: string;
    objecttype: string;
    fase: string | null;
    brondocument: string | null;
    eistitel: string;
    eistekst: string;
  }>;
}): string {
  const { section, project, trace, params, topEisen } = input;
  const pakketNaam = project.eisenpakket_version?.eisenpakket
    ? `${project.eisenpakket_version.eisenpakket.client} / ${project.eisenpakket_version.eisenpakket.name}`
    : "onbekend";
  const versie = project.eisenpakket_version?.version_label ?? "onbekend";

  const eisenBlock = topEisen
    .map(
      (e, i) =>
        `${i + 1}. [EIS-${e.eis_code}] (${e.objecttype}, fase: ${e.fase ?? "n.v.t."}, bron: ${e.brondocument ?? "onbekend"})
   Titel: ${e.eistitel}
   Tekst: ${e.eistekst}`,
    )
    .join("\n\n");

  const paramsBlock = params
    ? Object.entries(params)
        .filter(
          ([k]) =>
            !["id", "project_id", "version", "created_at", "is_active", "created_by", "sources"].includes(k),
        )
        .map(([k, v]) => `- [PARAM-${k}]: ${JSON.stringify(v)}`)
        .join("\n")
    : "(Geen parameters gezet — sectie moet daar expliciet op wijzen)";

  const stationsBlock = [
    trace.start_station
      ? `- Start: ${trace.start_station.name} (${trace.start_station.station_type}, ${trace.start_station.spanningsniveau_kv_primair}kV)`
      : "- Start: NOG NIET GEKOPPELD",
    trace.eind_station
      ? `- Eind: ${trace.eind_station.name} (${trace.eind_station.station_type}, ${trace.eind_station.spanningsniveau_kv_primair}kV)`
      : "- Eind: NOG NIET GEKOPPELD",
  ].join("\n");

  return `Schrijf sectie **${section.number} ${section.title}** voor dit project.

# PROJECT-CONTEXT

- [CONTEXT-client]: ${project.client ?? "onbekend"}
- [CONTEXT-project_name]: ${project.name}
- [CONTEXT-perceel]: ${project.perceel ?? "n.v.t."}
- [CONTEXT-eisenpakket]: ${pakketNaam}, versie ${versie}
- [CONTEXT-trace_variant]: ${trace.variant}
- [CONTEXT-trace_length_m]: ${trace.length_m ?? "nog niet gesegmenteerd"}

# STATIONS (start/eind)

${stationsBlock}

# ONTWERPPARAMETERS (latest active versie)

${paramsBlock}

# EISEN DIE VAN TOEPASSING ZIJN (top-${TOP_K_EISEN}, gerankt op relevantie)

${eisenBlock}

---

Schrijf nu sectie ${section.number}. Onthoud: elke feitelijke zin eindigt met een bron-tag.`;
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
