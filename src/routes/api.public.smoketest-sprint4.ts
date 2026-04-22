// Sprint 4 — End-to-end smoke-test endpoint.
//
// POST /api/public/smoketest-sprint4
// Header: x-smoketest-secret: <SMOKETEST_SECRET env-var>
// Body: { "trace_id": "uuid" } — bestaand tracé hergebruiken
//   OF: { "seed": true, "project_id": "uuid" } — seedt zelf een Utrecht-tracé
//
// Voert achter elkaar uit (~30-60s):
//   1. segmentTraceByBgt
//   2. generateTraceDescription
//   3. exportTraceDescriptionDocx
//
// Retourneert: alle 3 responses + DB-asserts + signed URL.
//
// Auth: shared secret only. Geen user-context — gebruikt service-role admin
// client als beide `supabase` (RLS bypass) en `userId=null` voor audit-rijen.
//
// SECURITY: deze route is ALLEEN bedoeld voor smoke-tests. De `x-smoketest-secret`
// moet random + 32+ chars zijn. Niet gebruiken voor user-facing logic.
//
// TODO(Sprint 5): remove smoketest bypass, replace with user-JWT auth.
// Deze route is een tijdelijk alternatief auth-pad voor invoke-server-function
// tijdens Sprint 4-verificatie. De productie server-fns in trace.functions.ts
// behouden requireSupabaseAuth — die middleware wordt NIET vervangen door deze
// secret. Deze route hergebruikt alleen de helpers in trace.helpers.server.ts.
import { createFileRoute } from "@tanstack/react-router";
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

interface SmokeRequest {
  trace_id?: string;
  seed?: boolean;
  project_id?: string;
}

export const Route = createFileRoute("/api/public/smoketest-sprint4")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-smoketest-secret");
        const expected = process.env.SMOKETEST_SECRET;
        if (!expected) {
          return jsonError(500, "SMOKETEST_SECRET niet geconfigureerd");
        }
        if (!secret || secret !== expected) {
          return jsonError(401, "Invalid smoketest secret");
        }

        let body: SmokeRequest;
        try {
          body = (await request.json()) as SmokeRequest;
        } catch {
          return jsonError(400, "Invalid JSON body");
        }

        const t0 = Date.now();
        const log = (msg: string) =>
          console.log(`[smoketest] +${Date.now() - t0}ms ${msg}`);

        // 1. Trace bepalen (bestaand of seed).
        let traceId = body.trace_id;
        let seeded = false;
        if (!traceId) {
          if (!body.seed || !body.project_id) {
            return jsonError(
              400,
              "Verwacht trace_id, OF { seed: true, project_id }",
            );
          }
          log("seeding trace");
          const seedRes = await seedTrace(body.project_id);
          if (!seedRes.ok) return jsonError(500, seedRes.error);
          traceId = seedRes.trace_id;
          seeded = true;
        }

        // We gebruiken supabaseAdmin als "supabase" voor de helpers — RLS bypass
        // is acceptabel voor smoke-tests want secret-protected.
        const supabase = supabaseAdmin as unknown as SupabaseClient<Database>;
        const userId: string | null = null;
        const result: Record<string, unknown> = {
          trace_id: traceId,
          seeded,
          steps: {} as Record<string, unknown>,
          asserts: {} as Record<string, unknown>,
          timings_ms: {} as Record<string, number>,
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
          (result.steps as Record<string, unknown>).segment = seg;
          (result.timings_ms as Record<string, number>).segment = Date.now() - tA;
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

          (result.asserts as Record<string, unknown>).post_segment = {
            staged_count: stagedRow.count ?? 0,
            segmented_with_bgt_count: segmentedRow.count ?? 0,
            v_trace_bgt_summary_rows: summary.data ?? [],
            audit_actions: (auditRows.data ?? []).map(
              (r) => r.action,
            ),
          };

          // 4. generateTraceDescription
          const tB = Date.now();
          log("generateTraceDescription start");
          const gen = await runGenerateTraceDescription({
            supabase,
            traceId: traceId!,
            userId,
          });
          (result.steps as Record<string, unknown>).generate = {
            section_id: gen.section_id,
            artifact_id: gen.artifact_id,
            content_md_chars: gen.content_md.length,
            content_md_first_2000_chars: gen.content_md.slice(0, 2000),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sources_summary: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              bgt_segment_cite_count: (gen.sources as any).bgt_segments?.length,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              total_length_m: (gen.sources as any).total_length_m,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              generation_model: (gen.sources as any).generation_model,
            },
            warnings: gen.warnings,
          };
          (result.timings_ms as Record<string, number>).generate =
            Date.now() - tB;
          log(`generateTraceDescription done (${gen.warnings.length} warnings)`);

          // 5. DB-asserts (post-generate)
          const sectionRow = await supabaseAdmin
            .from("report_sections")
            .select(
              "id, section_title, model, sources, audit_hash, generated_at",
            )
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
          const sources = sectionRow.data?.sources as any;
          (result.asserts as Record<string, unknown>).post_generate = {
            report_section: {
              section_title: sectionRow.data?.section_title,
              model: sectionRow.data?.model,
              audit_hash: sectionRow.data?.audit_hash,
              bgt_cite_count: sources?.bgt_segments?.length ?? 0,
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
          (result.steps as Record<string, unknown>).export = exp;
          (result.timings_ms as Record<string, number>).export = Date.now() - tC;
          log(`exportTraceDescriptionDocx done (${exp.size_bytes} bytes)`);

          // 7. DOCX-validatie (magic bytes check)
          const dlRes = await fetch(exp.url);
          const dlOk = dlRes.ok;
          const dlBytes = dlOk
            ? new Uint8Array(await dlRes.arrayBuffer())
            : new Uint8Array();
          const isPkZip =
            dlBytes.length >= 4 &&
            dlBytes[0] === 0x50 &&
            dlBytes[1] === 0x4b &&
            (dlBytes[2] === 0x03 || dlBytes[2] === 0x05 || dlBytes[2] === 0x07) &&
            (dlBytes[3] === 0x04 || dlBytes[3] === 0x06 || dlBytes[3] === 0x08);
          (result.asserts as Record<string, unknown>).docx_validation = {
            signed_url_status: dlRes.status,
            content_type: dlRes.headers.get("content-type"),
            content_length: dlRes.headers.get("content-length"),
            downloaded_bytes: dlBytes.length,
            is_pkzip_magic: isPkZip,
            size_matches: dlBytes.length === exp.size_bytes,
          };

          (result.timings_ms as Record<string, number>).total = Date.now() - t0;
          result.success = true;
          return Response.json(result, { status: 200 });
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          (result as Record<string, unknown>).success = false;
          (result as Record<string, unknown>).error = {
            message: err.message,
            stack: err.stack,
          };
          (result.timings_ms as Record<string, number>).total = Date.now() - t0;
          return Response.json(result, { status: 500 });
        }
      },
    },
  },
});

async function seedTrace(
  projectId: string,
): Promise<{ ok: true; trace_id: string } | { ok: false; error: string }> {
  // Direct insert via PostgREST — geometry verstuurd als EWKT (PostGIS parst dat).
  // length_m is een generated column, dus niet meegeven.
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

function jsonError(status: number, message: string) {
  return Response.json({ success: false, error: message }, { status });
}
