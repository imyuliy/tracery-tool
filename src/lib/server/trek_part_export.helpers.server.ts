// De Tracémolen — Sprint 4.6 DOCX export per trek-hiërarchie.
// Genereert Brondocument-trek waarin elke trek een H2 is met daaronder
// de segmenten die in die trek vallen (gegroepeerd, ipv één lange tabel).
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
import type { Database } from "@/integrations/supabase/types";

if (typeof window !== "undefined") {
  throw new Error("trek_part_export.helpers.server.ts mag niet in de browser laden.");
}

type SupabaseLike = SupabaseClient<Database>;

export interface TrekExportResult {
  url: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
}

export async function runExportTrekHierarchyDocx(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<TrekExportResult> {
  const { supabase, traceId, userId } = opts;

  const { data: trace, error: traceErr } = await supabase
    .from("traces")
    .select(
      `id, variant_label, variant, length_m, project_id,
       project:projects (id, name, client, perceel, phase_state)`,
    )
    .eq("id", traceId)
    .single();
  if (traceErr || !trace) throw new Error(`Trace ${traceId} niet gevonden`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = trace.project;

  // Treks
  const { data: treks, error: trekErr } = await supabase
    .from("trek_part_descriptions")
    .select("*")
    .eq("trace_id", traceId)
    .eq("version", 1)
    .order("part_idx", { ascending: true });
  if (trekErr) throw new Error(`Treks: ${trekErr.message}`);
  if (!treks || treks.length === 0) {
    throw new Error("Geen trek-omschrijvingen. Draai eerst de scan.");
  }

  // Segment-mappings (om per trek de segmenten op te halen)
  const { data: mapRows, error: mErr } = await supabase.rpc(
    "segments_with_part_idx",
    { p_trace_id: traceId },
  );
  if (mErr) throw new Error(`segment-mapping: ${mErr.message}`);
  const partOfSegment = new Map<string, number>();
  for (const r of (mapRows ?? []) as Array<{
    segment_id: string;
    part_idx: number;
  }>) {
    partOfSegment.set(r.segment_id, r.part_idx);
  }

  // Segment-descriptions
  const { data: descs, error: dErr } = await supabase
    .from("segment_descriptions")
    .select(
      `id, segment_id, narrative_md, ai_aandacht, ai_aandacht_reden,
       ai_voorgestelde_techniek, eisen_matches,
       segment:segments (sequence, km_start, km_end, length_m,
         bgt_feature_type, bgt_subtype, beheerder, bgt_lokaal_id)`,
    )
    .eq("trace_id", traceId);
  if (dErr) throw new Error(`Descriptions: ${dErr.message}`);

  const descsByPart = new Map<number, typeof descs>();
  for (const d of descs ?? []) {
    const idx = partOfSegment.get(d.segment_id);
    if (idx === undefined) continue;
    const arr = descsByPart.get(idx) ?? [];
    arr.push(d);
    descsByPart.set(idx, arr);
  }
  // Sort segments per trek by sequence
  for (const [k, arr] of descsByPart) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arr.sort(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) =>
        Number(a.segment?.sequence ?? 0) - Number(b.segment?.sequence ?? 0),
    );
    descsByPart.set(k, arr);
  }

  const dateStr = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  // Cover
  children.push(
    new Paragraph({
      text: "Brondocument — per trek",
      heading: HeadingLevel.HEADING_1,
    }),
    metaLine("Project", project.name ?? "—"),
    metaLine("Opdrachtgever", project.client ?? "—"),
    metaLine("Tracé-variant", trace.variant_label ?? trace.variant ?? "—"),
    metaLine("Fase", phaseLabel(project.phase_state)),
    metaLine("Gegenereerd", dateStr),
    new Paragraph({ text: "" }),
  );

  // Samenvatting
  const totalLen = treks.reduce((s, t) => s + Number(t.length_m), 0);
  const aandachtTreks = treks.filter((t) => t.aandacht_flag).length;
  children.push(
    new Paragraph({
      text: "Samenvatting",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: `Het tracé bestaat uit ${treks.length} natuurlijke trekken met een totale lengte van ${Math.round(totalLen)}m. ${aandachtTreks} trekken zijn als aandachtspunt gemarkeerd.`,
    }),
    new Paragraph({ text: "" }),
    buildTrekIndex(treks),
    new Paragraph({ text: "" }),
  );

  // Per trek
  for (const trek of treks) {
    const segDescs = descsByPart.get(trek.part_idx) ?? [];
    const km0 = Number(trek.start_km).toFixed(3);
    const km1 = Number(trek.end_km).toFixed(3);
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        text: `Trek ${trek.part_idx + 1}  (km ${km0} – ${km1}, ${Math.round(Number(trek.length_m))}m)`,
        heading: HeadingLevel.HEADING_2,
      }),
    );

    // Trek-narratief
    children.push(
      new Paragraph({ text: trek.content_md || "(geen narratief)" }),
      new Paragraph({ text: "" }),
    );

    // BGT-verdeling
    const bgt = (trek.bgt_verdeling ?? {}) as Record<string, number>;
    const bgtEntries = Object.entries(bgt).sort((a, b) => b[1] - a[1]);
    if (bgtEntries.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "BGT-verdeling: ", bold: true }),
            new TextRun({
              text: bgtEntries
                .map(([k, v]) => `${k.replace(/_m$/, "")} ${v}m`)
                .join(", "),
            }),
          ],
        }),
      );
    }

    // Aandacht
    if (trek.aandacht_flag && trek.aandacht_reden && trek.aandacht_reden.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Aandachtspunten: ", bold: true }),
            new TextRun({ text: trek.aandacht_reden.join("; ") }),
          ],
        }),
      );
    }

    // Eisen-union
    if (trek.van_toepassing_eisen && trek.van_toepassing_eisen.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Van toepassing eisen: ", bold: true }),
            new TextRun({ text: trek.van_toepassing_eisen.join(", ") }),
          ],
        }),
      );
    }

    children.push(new Paragraph({ text: "" }));

    // Segmenten binnen trek
    if (segDescs.length > 0) {
      children.push(
        new Paragraph({
          text: `Segmenten (${segDescs.length})`,
          heading: HeadingLevel.HEADING_3,
        }),
        buildTrekSegmentTable(segDescs),
      );
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "(geen gemapte BGT-segmenten in deze trek)",
              italics: true,
            }),
          ],
        }),
      );
    }
  }

  // Footer
  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Gegenereerd door De Tracémolen — ${dateStr}`,
          italics: true,
          size: 18,
          color: "888888",
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "De Tracémolen",
    title: `Brondocument trek-hiërarchie — ${project.name ?? ""}`,
    description: "Per-trek narratief met onderliggende BGT-segmenten",
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

  const filename = `brondocument-treks_${slugify(project.name ?? "project")}_${Date.now()}.docx`;
  const storagePath = `${project.id}/${traceId}/${filename}`;

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
    trace_id: traceId,
    product_code: "brondocument_v1",
    phase_state_at_gen: project.phase_state,
    status: "draft",
    generated_by: userId,
    storage_path: storagePath,
    file_size_bytes: buffer.byteLength,
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await supabaseAdmin.from("exports").insert({
    project_id: project.id,
    trace_id: traceId,
    export_type: "brondocument_treks_docx",
    storage_path: storagePath,
    file_size_bytes: buffer.byteLength,
    generated_by: userId,
  });

  await supabaseAdmin.from("audit_log").insert({
    project_id: project.id,
    user_id: userId,
    action: "export_brondocument_treks_docx",
    resource_type: "trace",
    resource_id: traceId,
    payload: {
      storage_path: storagePath,
      file_size_bytes: buffer.byteLength,
      trek_count: treks.length,
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
// Helpers
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
    DO: "DO",
    UO: "UO",
    Realisatie: "Realisatie",
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

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text: string): TableCell {
  return new TableCell({
    borders: BORDERS,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ text })],
  });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: BORDERS,
    shading: { fill: "F1ECE6", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({ children: [new TextRun({ text, bold: true })] }),
    ],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTrekIndex(treks: any[]): Table {
  const header = new TableRow({
    children: ["Trek", "km-bereik", "Lengte", "Segmenten", "Aandacht"].map(
      headerCell,
    ),
  });
  const rows = treks.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) =>
      new TableRow({
        children: [
          cell(`Trek ${t.part_idx + 1}`),
          cell(
            `${Number(t.start_km).toFixed(3)} – ${Number(t.end_km).toFixed(3)}`,
          ),
          cell(`${Math.round(Number(t.length_m))}m`),
          cell(String(t.segment_count ?? 0)),
          cell(t.aandacht_flag ? "⚠" : ""),
        ],
      }),
  );
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [header, ...rows],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTrekSegmentTable(rows: any[]): Table {
  const header = new TableRow({
    children: ["#", "km", "BGT-type", "Beschrijving", "Aandacht"].map(headerCell),
  });
  const dataRows = rows.map((d) => {
    const seg = d.segment ?? {};
    const aandacht = d.ai_aandacht;
    return new TableRow({
      children: [
        cell(String(seg.sequence ?? "?")),
        cell(
          `${Number(seg.km_start ?? 0).toFixed(0)}–${Number(seg.km_end ?? 0).toFixed(0)}m`,
        ),
        cell(seg.bgt_feature_type ?? "—"),
        cell((d.narrative_md ?? "").substring(0, 280)),
        cell(aandacht ? "⚠" : ""),
      ],
    });
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [header, ...dataRows],
  });
}
