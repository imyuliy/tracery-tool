// De Tracémolen — Sprint 5.2 server-helper: per-eis verificatie via AI.
// Roept de eis_verification_context RPC aan, batcht de eisen door Lovable AI
// en schrijft eis_verifications-records terug.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAIProvider } from "./ai-provider.server";

if (typeof window !== "undefined") {
  throw new Error(
    "eisenverificatie.helpers.server.ts mag niet in de browser laden.",
  );
}

type SupabaseLike = SupabaseClient<Database>;

const EIS_BATCH_SIZE = 10;
const MAX_CONCURRENT_BATCHES = 3;
const MODEL = "google/gemini-2.5-flash";

export type EisVerificationStatus =
  | "voldoet"
  | "twijfelachtig"
  | "voldoet_niet"
  | "nvt"
  | "onbekend";

const VALID_STATUSES: ReadonlySet<EisVerificationStatus> = new Set([
  "voldoet",
  "twijfelachtig",
  "voldoet_niet",
  "nvt",
  "onbekend",
]);

interface EisContextRow {
  eis_id: string;
  eis_code: string;
  eistitel: string;
  eistekst: string;
  objecttype: string;
  fase: string | null;
  verificatiemethode: string | null;
  brondocument: string | null;
  hit_count: number;
  geraakte_trek_idx: number[];
  geraakte_segment_ids: string[];
  sample_narratives: string[];
  bgt_verdeling_agg: Record<string, number>;
}

interface AIVerificationResult {
  eis_code: string;
  status: EisVerificationStatus;
  onderbouwing_md: string;
  confidence: number;
}

export interface EisVerificationRunResult {
  trace_id: string;
  eisen_verified: number;
  status_summary: Record<string, number>;
}

export async function runEisVerification(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<EisVerificationRunResult> {
  const { supabase, traceId, userId } = opts;

  // 1) Trace → project → eisenpakket_version_id
  const { data: trace, error: traceErr } = await supabase
    .from("traces")
    .select("id, project:projects(id, eisenpakket_version_id)")
    .eq("id", traceId)
    .single();
  if (traceErr || !trace) {
    throw new Error(`Trace ${traceId} niet gevonden`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = trace.project;
  const versionId: string | undefined = project?.eisenpakket_version_id;
  if (!versionId) {
    throw new Error("Geen eisenpakket gekoppeld aan dit project");
  }

  // 2) Context-RPC
  const { data: contextRows, error: ctxErr } = await supabase.rpc(
    "eis_verification_context",
    { p_trace_id: traceId },
  );
  if (ctxErr) throw new Error(`Context-RPC faalde: ${ctxErr.message}`);
  if (!contextRows || contextRows.length === 0) {
    throw new Error(
      "Geen eisen in scope — controleer project_eisen_scope of run eerst de scan.",
    );
  }

  const rows = contextRows as unknown as EisContextRow[];

  // 3) Verwijder bestaande verifications voor deze trace
  const { error: delErr } = await supabaseAdmin
    .from("eis_verifications")
    .delete()
    .eq("trace_id", traceId);
  if (delErr) throw new Error(`Cleanup faalde: ${delErr.message}`);

  // 4) Batchen + parallel door AI
  const batches: EisContextRow[][] = [];
  for (let i = 0; i < rows.length; i += EIS_BATCH_SIZE) {
    batches.push(rows.slice(i, i + EIS_BATCH_SIZE));
  }
  const allResults: AIVerificationResult[] = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const slice = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    const batchResults = await Promise.all(slice.map((b) => verifyBatch(b)));
    for (const r of batchResults) allResults.push(...r);
  }

  // 5) Insert
  const codeToRow = new Map(rows.map((r) => [r.eis_code, r]));
  const inserts = allResults
    .map((r) => {
      const row = codeToRow.get(r.eis_code);
      if (!row) return null;
      return {
        trace_id: traceId,
        eis_id: row.eis_id,
        eisenpakket_version_id: versionId,
        version: 1,
        status: r.status,
        onderbouwing_md: r.onderbouwing_md,
        verificatiemethode: row.verificatiemethode,
        geraakte_trek_idx: row.geraakte_trek_idx ?? [],
        geraakte_segment_ids: row.geraakte_segment_ids ?? [],
        confidence: clampConfidence(r.confidence),
        model: MODEL,
        generated_by: userId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (inserts.length === 0) {
    throw new Error("AI-batches gaven geen geldige resultaten terug.");
  }

  const { error: insErr } = await supabaseAdmin
    .from("eis_verifications")
    .insert(inserts);
  if (insErr) throw new Error(`Insert faalde: ${insErr.message}`);

  return {
    trace_id: traceId,
    eisen_verified: inserts.length,
    status_summary: summarizeStatus(allResults),
  };
}

function clampConfidence(c: unknown): number | null {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function summarizeStatus(results: AIVerificationResult[]) {
  return results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
}

async function verifyBatch(
  batch: EisContextRow[],
): Promise<AIVerificationResult[]> {
  const provider = getAIProvider();

  const input = batch.map((r) => ({
    eis_code: r.eis_code,
    eistitel: r.eistitel,
    eistekst: (r.eistekst ?? "").substring(0, 1200),
    objecttype: r.objecttype,
    fase: r.fase,
    verificatiemethode: r.verificatiemethode,
    hit_count: r.hit_count,
    geraakte_treks: r.geraakte_trek_idx,
    bgt_verdeling_m: r.bgt_verdeling_agg,
    voorbeeld_narratives: (r.sample_narratives ?? []).slice(0, 3),
  }));

  const system = `Je bent een technisch verificatie-assistent voor MS-kabel-tracé-ontwerpen.
Per eis krijg je:
- de eistekst en het objecttype
- of het tracé deze eis expliciet raakt (hit_count, geraakte_treks)
- de BGT-verharding-verdeling in meters van de geraakte treks
- enkele voorbeeld-narratives uit de segmenten waar de eis is gekoppeld

Bepaal per eis:
- status:
  • 'voldoet' als ontwerp volledig aan eis voldoet obv de context
  • 'twijfelachtig' als er indicaties zijn dat het voldoet maar onderbouwing dun is
  • 'voldoet_niet' als context expliciet tegen eis ingaat (bv. eis "geen gestuurde boring onder asfalt" maar tracé gaat onder asfaltweg met voorgestelde techniek gestuurde boring)
  • 'nvt' als hit_count = 0 EN geen enkele trek dit objecttype raakt
  • 'onbekend' als info ontbreekt voor een oordeel

- onderbouwing_md (max 250 woorden, Nederlands, technisch, neutraal):
  • expliciet noemen welke treks geraakt zijn (bv. "trek 2 en 4")
  • verwijzen naar BGT-verharding waar relevant ("~120 m gesloten verharding")
  • bij 'voldoet_niet' of 'twijfelachtig' concrete risico of conflict benoemen
  • bij 'nvt' kort aangeven waarom (geen van toepassing)

- confidence: 0.0–1.0. 1.0 = zeer zeker, 0.5 = redelijk zeker, 0.2 = speculatief.

Antwoord ALLEEN met geldige JSON in dit exacte schema:
{"results":[{"eis_code":"...","status":"...","onderbouwing_md":"...","confidence":0.85}, ...]}
Géén markdown-code-fences, géén toelichting buiten het JSON-object.`;

  const userPrompt = JSON.stringify({ eisen: input }, null, 2);

  let resp;
  try {
    resp = await provider.generate({
      system,
      user: userPrompt,
      maxTokens: 2500,
    });
  } catch (e) {
    console.warn(
      `[eisenverificatie] AI-call faalde voor batch (${batch.length} eisen): ${e instanceof Error ? e.message : String(e)}`,
    );
    return fallbackBatch(batch);
  }

  return parseBatchResponse(resp.text, batch);
}

function parseBatchResponse(
  text: string,
  batch: EisContextRow[],
): AIVerificationResult[] {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Probeer eerste {...} of [...] block te extracten
    const match = stripped.match(/[\[{][\s\S]*[\]}]/);
    if (!match) {
      console.warn("[eisenverificatie] respons bevat geen JSON");
      return fallbackBatch(batch);
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.warn(
        `[eisenverificatie] JSON-parse faalde: ${e instanceof Error ? e.message : e}`,
      );
      return fallbackBatch(batch);
    }
  }

  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : isObj(parsed) && Array.isArray((parsed as Record<string, unknown>).results)
      ? ((parsed as Record<string, unknown>).results as unknown[])
      : isObj(parsed) && Array.isArray((parsed as Record<string, unknown>).eisen)
        ? ((parsed as Record<string, unknown>).eisen as unknown[])
        : [];

  const out: AIVerificationResult[] = [];
  for (const item of arr) {
    if (!isObj(item)) continue;
    const r = item as Record<string, unknown>;
    const status = r.status;
    if (typeof status !== "string" || !VALID_STATUSES.has(status as EisVerificationStatus)) continue;
    const eisCode = typeof r.eis_code === "string" ? r.eis_code : null;
    const onderbouwing =
      typeof r.onderbouwing_md === "string" ? r.onderbouwing_md : "";
    const conf = typeof r.confidence === "number" ? r.confidence : Number(r.confidence ?? 0);
    if (!eisCode || !onderbouwing) continue;
    out.push({
      eis_code: eisCode,
      status: status as EisVerificationStatus,
      onderbouwing_md: onderbouwing,
      confidence: Number.isFinite(conf) ? conf : 0,
    });
  }

  // Vul ontbrekende eisen aan met fallback (zodat alle records bestaan)
  const seen = new Set(out.map((o) => o.eis_code));
  for (const b of batch) {
    if (!seen.has(b.eis_code)) {
      out.push(fallbackResult(b));
    }
  }
  return out;
}

function fallbackBatch(batch: EisContextRow[]): AIVerificationResult[] {
  return batch.map(fallbackResult);
}

function fallbackResult(r: EisContextRow): AIVerificationResult {
  return {
    eis_code: r.eis_code,
    status: "onbekend",
    onderbouwing_md:
      "_AI-respons kon niet worden geparsed of AI-call faalde — handmatige review nodig._",
    confidence: 0,
  };
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
