// Sprint 4 — Smoke-test orchestrator (server-only).
//
// Wordt aangeroepen door:
//   - POST /api/public/smoketest-sprint4 (secret-protected, voor CLI)
//   - GET  /api/public/smoketest-sprint4-trigger (env-secret, voor invoke-server-function)
//
// TODO(Sprint 5): VERWIJDER dit bestand zodra UI-flow + user-JWT auth Sprint 5 staat.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  runSegmentTraceByBgt,
  runGenerateTraceDescription,
  runExportTraceDescriptionDocx,
} from "@/lib/server/trace.helpers.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const UTRECHT_LINESTRING_28992 =
  "LINESTRING(136183 456205, 136280 456250, 136370 456290, 136455 456210, 136520 456085)";

export interface SmokeRequest {
  trace_id?: string;
  seed?: boolean;
  project_id?: string;
}

export interface SmokeResult {
  success: boolean;
  trace_id?: string;
  seeded?: boolean;
  steps?: Record<string, unknown>;
  asserts?: Record<string, unknown>;
  timings_ms?: Record<string, number>;
  error?: { message: string; stack?: string };
}

export async function runSmoketestSprint4(
  body: SmokeRequest,
): Promise<SmokeResult> {
  const t0 = Date.now();
  const log = (msg: string) =>
    console.log(`[smoketest] +${Date.now() - t0}ms ${msg}`);

  let traceId = body.trace_id;
  let seeded = false;
  if (!traceId) {
    if (!body.seed || !body.project_id) {
      return {
        success: false,
        error: { message: "Verwacht trace_id, OF { seed: true, project_id }" },
      };
    }
    log("seeding trace");
    const seedRes = await seedTrace(body.project_id);
    if (!seedRes.ok) {
      return { success: false, error: { message: seedRes.error } };
    }
    traceId = seedRes.trace_id;
    seeded = true;
  }

  const supabase = supabaseAdmin as unknown as SupabaseClient<Database>;
  const userId: string | null = null;
  const result: SmokeResult = {
    success: false,
    trace_id: traceId,
    seeded,
    steps: {},
    asserts: {},
    timings_ms: {},
  };

  try {
    // 2. segmentTraceByBgt
    const tA = Date.now();
    log("segmentTraceByBgt start");
    const seg = await runSegmentTraceByBgt({
      supabase,
      traceId: traceId!,
      userId,
    });
    result.steps!.segment = seg;
    result.timings_ms!.segment = Date.now() - tA;
    log(`segmentTraceByBgt done (${seg.segment_count} segments)`);

    // 3. DB-asserts (post-segment)
    const stagedRow = await supabaseAdmin
      .from("bgt_features_staging")
      .select("id", { count: "exact", head: true })
      .eq("trace_id", traceId!);
    const segmentedRow = await supabaseAdmin
      .from("segments")
      .select("id", { count: "exact", head: true })
      .eq("trace_id", traceId!)
      .not("bgt_lokaal_id", "is", null);
    const summary = await supabaseAdmin
      .from("v_trace_bgt_summary")
      .select("*")
      .eq("trace_id", traceId!)
      .order("total_length_m", { ascending: false });
    const auditRows = await supabaseAdmin
      .from("audit_log")
      .select("action, timestamp, payload")
      .eq("resource_id", traceId!)
      .order("timestamp", { ascending: false })
      .limit(5);

    result.asserts!.post_segment = {
      staged_count: stagedRow.count ?? 0,
      segmented_with_bgt_count: segmentedRow.count ?? 0,
      v_trace_bgt_summary_rows: summary.data ?? [],
      audit_actions: (auditRows.data ?? []).map((r) => r.action),
    };

    // 4. generateTraceDescription
    const tB = Date.now();
    log("generateTraceDescription start");
    const gen = await runGenerateTraceDescription({
      supabase,
      traceId: traceId!,
      userId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = gen.sources as any;
    result.steps!.generate = {
      section_id: gen.section_id,
      artifact_id: gen.artifact_id,
      content_md_chars: gen.content_md.length,
      content_md_first_2000_chars: gen.content_md.slice(0, 2000),
      sources_summary: {
        bgt_segment_cite_count: sources?.bgt_segments?.length,
        total_length_m: sources?.total_length_m,
        generation_model: sources?.generation_model,
      },
      warnings: gen.warnings,
    };
    result.timings_ms!.generate = Date.now() - tB;
    log(`generateTraceDescription done (${gen.warnings.length} warnings)`);

    // 5. DB-asserts (post-generate)
    const sectionRow = await supabaseAdmin
      .from("report_sections")
      .select("id, section_title, model, sources, audit_hash, generated_at")
      .eq("id", gen.section_id)
      .single();
    const artifactRow = gen.artifact_id
      ? await supabaseAdmin
          .from("project_artifacts")
          .select(
            "id, product_code, status, phase_state_at_gen, model, storage_path",
          )
          .eq("id", gen.artifact_id)
          .single()
      : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secSources = sectionRow.data?.sources as any;
    result.asserts!.post_generate = {
      report_section: {
        section_title: sectionRow.data?.section_title,
        model: sectionRow.data?.model,
        audit_hash: sectionRow.data?.audit_hash,
        bgt_cite_count: secSources?.bgt_segments?.length ?? 0,
      },
      project_artifact: artifactRow?.data ?? null,
    };

    // 6. exportTraceDescriptionDocx
    const tC = Date.now();
    log("exportTraceDescriptionDocx start");
    const exp = await runExportTraceDescriptionDocx({
      supabase,
      traceId: traceId!,
      sectionId: gen.section_id,
      userId,
    });
    result.steps!.export = exp;
    result.timings_ms!.export = Date.now() - tC;
    log(`exportTraceDescriptionDocx done (${exp.size_bytes} bytes)`);

    // 7. DOCX-validatie
    const dlRes = await fetch(exp.url);
    const dlOk = dlRes.ok;
    const dlBytes = dlOk
      ? new Uint8Array(await dlRes.arrayBuffer())
      : new Uint8Array();
    const isPkZip =
      dlBytes.length >= 4 &&
      dlBytes[0] === 0x50 &&
      dlBytes[1] === 0x4b &&
      (dlBytes[2] === 0x03 ||
        dlBytes[2] === 0x05 ||
        dlBytes[2] === 0x07) &&
      (dlBytes[3] === 0x04 ||
        dlBytes[3] === 0x06 ||
        dlBytes[3] === 0x08);
    result.asserts!.docx_validation = {
      signed_url_status: dlRes.status,
      content_type: dlRes.headers.get("content-type"),
      content_length: dlRes.headers.get("content-length"),
      downloaded_bytes: dlBytes.length,
      is_pkzip_magic: isPkZip,
      size_matches: dlBytes.length === exp.size_bytes,
    };

    result.timings_ms!.total = Date.now() - t0;
    result.success = true;
    return result;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    result.success = false;
    result.error = { message: err.message, stack: err.stack };
    result.timings_ms!.total = Date.now() - t0;
    return result;
  }
}

async function seedTrace(
  projectId: string,
): Promise<{ ok: true; trace_id: string } | { ok: false; error: string }> {
  const insertRes = await supabaseAdmin
    .from("traces")
    .insert({
      project_id: projectId,
      variant: "smoketest_sprint4",
      variant_label: "Smoketest Sprint 4 — Utrecht centrum",
      analysis_status: "pending",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geometry: `SRID=28992;${UTRECHT_LINESTRING_28992}` as any,
    })
    .select("id")
    .single();
  if (insertRes.error) {
    return { ok: false, error: `Seed insert: ${insertRes.error.message}` };
  }
  return { ok: true, trace_id: insertRes.data.id };
}
