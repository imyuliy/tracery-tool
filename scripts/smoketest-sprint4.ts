#!/usr/bin/env bun
// Sprint 4 — End-to-end commandline smoke-test.
//
// Roept POST /api/public/smoketest-sprint4 aan op een live deploy, valideert
// de DOCX (magic bytes + content-type + size), en print de zes rapport-blokken
// die in de Sprint 4 spec gevraagd worden.
//
// Usage:
//   SMOKETEST_SECRET=xxx \
//   SMOKETEST_BASE_URL=https://tracery-tool.lovable.app \
//   bun run scripts/smoketest-sprint4.ts <trace_id>
//
//   Of seeden:
//   bun run scripts/smoketest-sprint4.ts --seed <project_id>
//
// Exit code: 0 als alle asserts groen, 1 anders.

const BASE_URL = process.env.SMOKETEST_BASE_URL ?? "https://tracery-tool.lovable.app";
const SECRET = process.env.SMOKETEST_SECRET;

if (!SECRET) {
  console.error("FOUT: SMOKETEST_SECRET env-var ontbreekt.");
  process.exit(2);
}

const args = process.argv.slice(2);
let body: Record<string, unknown>;
if (args[0] === "--seed" && args[1]) {
  body = { seed: true, project_id: args[1] };
} else if (args[0] && args[0].length === 36) {
  body = { trace_id: args[0] };
} else {
  console.error(
    "Usage:\n  bun run scripts/smoketest-sprint4.ts <trace_id>\n  bun run scripts/smoketest-sprint4.ts --seed <project_id>",
  );
  process.exit(2);
}

const url = `${BASE_URL}/api/public/smoketest-sprint4`;
console.log(`→ POST ${url}`);
console.log(`  body: ${JSON.stringify(body)}`);
console.log(`  (kan 30-90s duren door PDOK + Lovable AI...)\n`);

const tStart = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-smoketest-secret": SECRET,
  },
  body: JSON.stringify(body),
});

let payload: Record<string, unknown>;
try {
  payload = (await res.json()) as Record<string, unknown>;
} catch {
  console.error(`HTTP ${res.status} — geen JSON response`);
  process.exit(1);
}

const elapsed = Date.now() - tStart;
console.log(`← HTTP ${res.status} in ${elapsed}ms\n`);

if (!res.ok || !payload.success) {
  console.error("✗ Smoke-test gefaald");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

// ============================================================================
// Rapport-blokken zoals user vroeg
// ============================================================================

const steps = payload.steps as Record<string, any>;
const asserts = payload.asserts as Record<string, any>;
const timings = payload.timings_ms as Record<string, number>;

console.log("════════════════════════════════════════════════════════════════");
console.log(" BLOK 1 — trace_id + length_m");
console.log("════════════════════════════════════════════════════════════════");
console.log(`trace_id: ${payload.trace_id}`);
console.log(`seeded:   ${payload.seeded}`);
console.log(`segments: ${steps.segment?.segment_count}`);
console.log(`features: ${steps.segment?.features_fetched}`);

console.log("\n════════════════════════════════════════════════════════════════");
console.log(" BLOK 2 — segmentTraceByBgt response (ruwe JSON)");
console.log("════════════════════════════════════════════════════════════════");
console.log(JSON.stringify(steps.segment, null, 2));

console.log("\n════════════════════════════════════════════════════════════════");
console.log(" BLOK 3 — v_trace_bgt_summary rijen");
console.log("════════════════════════════════════════════════════════════════");
console.table(asserts.post_segment?.v_trace_bgt_summary_rows ?? []);
console.log(
  `staged: ${asserts.post_segment?.staged_count} | gesegmenteerd_met_bgt: ${asserts.post_segment?.segmented_with_bgt_count}`,
);
console.log(`audit_actions: ${JSON.stringify(asserts.post_segment?.audit_actions)}`);

console.log("\n════════════════════════════════════════════════════════════════");
console.log(" BLOK 4 — eerste 2000 chars content_md (incl. [BGT-]/[SEG-] tags)");
console.log("════════════════════════════════════════════════════════════════");
console.log(steps.generate?.content_md_first_2000_chars ?? "(geen content)");
console.log(`\n[total chars: ${steps.generate?.content_md_chars}]`);
console.log(`[bgt cites: ${steps.generate?.sources_summary?.bgt_segment_cite_count}]`);
console.log(`[model: ${steps.generate?.sources_summary?.generation_model}]`);

console.log("\n════════════════════════════════════════════════════════════════");
console.log(" BLOK 5 — warnings array uit generate-response");
console.log("════════════════════════════════════════════════════════════════");
console.log(JSON.stringify(steps.generate?.warnings ?? [], null, 2));

console.log("\n════════════════════════════════════════════════════════════════");
console.log(" BLOK 6 — DOCX signed URL + curl -I equivalent");
console.log("════════════════════════════════════════════════════════════════");
console.log(`URL:          ${steps.export?.url}`);
console.log(`filename:     ${steps.export?.filename}`);
console.log(`size_bytes:   ${steps.export?.size_bytes}`);
console.log(`HTTP:         ${asserts.docx_validation?.signed_url_status}`);
console.log(`content-type: ${asserts.docx_validation?.content_type}`);
console.log(`content-len:  ${asserts.docx_validation?.content_length}`);
console.log(`PK-zip magic: ${asserts.docx_validation?.is_pkzip_magic ? "✓" : "✗"}`);
console.log(`size match:   ${asserts.docx_validation?.size_matches ? "✓" : "✗"}`);

console.log("\n════════════════════════════════════════════════════════════════");
console.log(" TIMINGS");
console.log("════════════════════════════════════════════════════════════════");
console.table(timings);

// ============================================================================
// Asserts
// ============================================================================

const failures: string[] = [];
const seg = steps.segment ?? {};
if (!(seg.features_fetched > 0)) failures.push("features_fetched == 0");
if (!(seg.segment_count > 0)) failures.push("segment_count == 0");
if (!(asserts.post_segment?.staged_count > 0))
  failures.push("staged_count == 0");
if (!(asserts.post_segment?.segmented_with_bgt_count > 0))
  failures.push("geen segmenten met bgt_lokaal_id");
if (!(steps.generate?.content_md_chars > 200))
  failures.push("content_md te kort");
if (!(steps.generate?.sources_summary?.bgt_segment_cite_count >= 3))
  failures.push("te weinig BGT-citaties (<3)");
if (asserts.docx_validation?.signed_url_status !== 200)
  failures.push("DOCX URL niet 200");
if (!asserts.docx_validation?.is_pkzip_magic)
  failures.push("DOCX magic bytes incorrect");
if (!asserts.docx_validation?.size_matches)
  failures.push("DOCX size mismatch");

console.log("\n════════════════════════════════════════════════════════════════");
if (failures.length === 0) {
  console.log(" ✓ ALLE ASSERTS GROEN");
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(0);
} else {
  console.log(` ✗ ${failures.length} ASSERTS GEFAALD:`);
  for (const f of failures) console.log(`   - ${f}`);
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(1);
}
