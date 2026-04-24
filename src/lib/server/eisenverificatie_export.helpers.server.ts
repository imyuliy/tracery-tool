// De Tracémolen — Sprint 5.2 DOCX export voor eisenverificatie.
// Genereert een rapport per objecttype met status-tabel en detail-blokken
// voor eisen met status 'voldoet_niet' of 'twijfelachtig'.
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
  throw new Error(
    "eisenverificatie_export.helpers.server.ts mag niet in de browser laden.",
  );
}

type SupabaseLike = SupabaseClient<Database>;

export interface EisenverificatieExportResult {
  url: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
}

const STATUS_COLORS: Record<string, string> = {
  voldoet: "22863A",
  twijfelachtig: "B08800",
  voldoet_niet: "CB2431",
  nvt: "959DA5",
  onbekend: "6F42C1",
};

// Plain labels — voor inline tekst (zonder symbolen, renderen netjes in vrije text).
const STATUS_LABELS: Record<string, string> = {
  voldoet: "Voldoet",
  twijfelachtig: "Twijfelachtig",
  voldoet_niet: "Voldoet niet",
  nvt: "N.v.t.",
  onbekend: "Onbekend",
};

// Cell-labels — gebruikt in status-cellen (witte tekst op gekleurde achtergrond),
// waar de symbolen wel goed renderen.
const STATUS_CELL_LABELS: Record<string, string> = {
  voldoet: "✓ Voldoet",
  twijfelachtig: "? Twijfelachtig",
  voldoet_niet: "✗ Voldoet niet",
  nvt: "– N.v.t.",
  onbekend: "? Onbekend",
};

const STATUS_ORDER = ["voldoet_niet", "twijfelachtig", "onbekend", "voldoet", "nvt"];

export async function runExportEisenverificatieDocx(opts: {
  supabase: SupabaseLike;
  traceId: string;
  userId: string | null;
}): Promise<EisenverificatieExportResult> {
  const { supabase, traceId, userId } = opts;

  // Trace + project
  const { data: trace, error: traceErr } = await supabase
    .from("traces")
    .select(
      `id, variant_label, variant, length_m, project_id,
       project:projects (id, name, client, perceel, phase_state, eisenpakket_version_id)`,
    )
    .eq("id", traceId)
    .single();
  if (traceErr || !trace) throw new Error(`Trace ${traceId} niet gevonden`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = trace.project;

  // Eisenpakket-versie info
  let eisenpakketLabel = "—";
  if (project?.eisenpakket_version_id) {
    const { data: ver } = await supabase
      .from("eisenpakket_versions")
      .select(
        "version_label, eisenpakket:eisenpakketten(name, client)",
      )
      .eq("id", project.eisenpakket_version_id)
      .maybeSingle();
    if (ver) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ep: any = ver.eisenpakket;
      eisenpakketLabel = `${ep?.name ?? "Eisenpakket"} (${ver.version_label})`;
    }
  }

  // Verifications via effective-view (Sprint 5.3 — incl. override-velden)
  const { data: verifications, error: vErr } = await supabase
    .from("v_eis_verifications_effective")
    .select(
      `id, ai_status, ai_onderbouwing_md, ai_confidence,
       override_status, override_reason_md, override_at, is_overridden,
       effective_status,
       geraakte_trek_idx, verificatiemethode, generated_at, eis_id,
       eis:eisen(eis_code, eistitel, eistekst, objecttype, fase, brondocument),
       override_user:user_profiles!eis_verifications_override_by_fkey(full_name)`,
    )
    .eq("trace_id", traceId)
    .order("generated_at", { ascending: false });
  if (vErr) throw new Error(`Verifications: ${vErr.message}`);
  if (!verifications || verifications.length === 0) {
    throw new Error("Geen eisenverificaties gevonden — run eerst de verificatie.");
  }

  // Group per objecttype
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped = new Map<string, any[]>();
  for (const v of verifications) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e: any = v.eis;
    const ot = e?.objecttype ?? "Onbekend";
    const arr = grouped.get(ot) ?? [];
    arr.push(v);
    grouped.set(ot, arr);
  }
  // sort within each objecttype by status priority then eis_code
  for (const [k, arr] of grouped) {
    arr.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.effective_status);
      const bi = STATUS_ORDER.indexOf(b.effective_status);
      if (ai !== bi) return ai - bi;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ac: string = (a.eis as any)?.eis_code ?? "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc: string = (b.eis as any)?.eis_code ?? "";
      return ac.localeCompare(bc);
    });
    grouped.set(k, arr);
  }

  // Status summary obv effective_status
  const summary: Record<string, number> = {};
  for (const v of verifications)
    summary[v.effective_status ?? "onbekend"] =
      (summary[v.effective_status ?? "onbekend"] ?? 0) + 1;

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
      text: "Eisenverificatie",
      heading: HeadingLevel.HEADING_1,
    }),
    metaLine("Project", project?.name ?? "—"),
    metaLine("Opdrachtgever", project?.client ?? "—"),
    metaLine("Tracé-variant", trace.variant_label ?? trace.variant ?? "—"),
    metaLine("Eisenpakket", eisenpakketLabel),
    metaLine("Fase", phaseLabel(project?.phase_state)),
    metaLine("Gegenereerd", dateStr),
    new Paragraph({ text: "" }),
  );

  // Status summary table
  children.push(
    new Paragraph({
      text: "Status-samenvatting",
      heading: HeadingLevel.HEADING_2,
    }),
    buildSummaryTable(summary, verifications.length),
    new Paragraph({ text: "" }),
  );

  // Per objecttype
  const objecttypes = Array.from(grouped.keys()).sort();
  for (const ot of objecttypes) {
    const items = grouped.get(ot) ?? [];
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        text: `Objecttype: ${ot}`,
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${items.length} eisen verifieerd`,
            italics: true,
            color: "666666",
          }),
        ],
      }),
      new Paragraph({ text: "" }),
      buildVerificationTable(items),
      new Paragraph({ text: "" }),
    );

    // Detail-blokken voor problematische eisen (obv effective_status)
    const problematic = items.filter(
      (v) =>
        v.effective_status === "voldoet_niet" ||
        v.effective_status === "twijfelachtig",
    );
    if (problematic.length > 0) {
      children.push(
        new Paragraph({
          text: "Detail-onderbouwing (aandachtspunten)",
          heading: HeadingLevel.HEADING_3,
        }),
      );
      for (let pIdx = 0; pIdx < problematic.length; pIdx++) {
        const v = problematic[pIdx];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e: any = v.eis;
        if (pIdx > 0) {
          children.push(
            new Paragraph({ spacing: { before: 200, after: 80 } }),
          );
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${e?.eis_code ?? "—"} — ${e?.eistitel ?? "—"}  `,
                bold: true,
              }),
              new TextRun({
                text: `[${STATUS_LABELS[v.effective_status] ?? v.effective_status}]`,
                bold: true,
                color: STATUS_COLORS[v.effective_status] ?? "000000",
              }),
              ...(v.is_overridden
                ? [
                    new TextRun({
                      text: "  · Handmatig gereviewed",
                      italics: true,
                      color: "1F6FEB",
                    }),
                  ]
                : []),
            ],
          }),
        );
        if (e?.eistekst) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Eistekst: ", bold: true }),
                new TextRun({
                  text: String(e.eistekst).substring(0, 600),
                  italics: true,
                }),
              ],
            }),
          );
        }
        if (v.is_overridden) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ru: any = v.override_user;
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `AI-oordeel oorspronkelijk: ${STATUS_LABELS[v.ai_status] ?? v.ai_status}`,
                  italics: true,
                  color: "666666",
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "AI-onderbouwing: ", bold: true }),
                new TextRun({ text: v.ai_onderbouwing_md ?? "—", italics: true }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Handmatige review: ", bold: true }),
                new TextRun({
                  text: `door ${ru?.full_name ?? "onbekende gebruiker"} op ${
                    v.override_at
                      ? new Date(v.override_at).toLocaleString("nl-NL", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"
                  }`,
                }),
              ],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Override-motivatie: ", bold: true })],
            }),
            new Paragraph({ text: v.override_reason_md ?? "—" }),
          );
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "AI-onderbouwing: ", bold: true })],
            }),
            new Paragraph({ text: v.ai_onderbouwing_md ?? "—" }),
          );
        }
      }
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
    title: `Eisenverificatie — ${project?.name ?? ""}`,
    description: "Per-eis verificatierapport, gegroepeerd op objecttype",
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

  const filename = `eisenverificatie_${slugify(project?.name ?? "project")}_${Date.now()}.docx`;
  const storagePath = `${project?.id}/${traceId}/${filename}`;

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
    project_id: project?.id,
    trace_id: traceId,
    product_code: "eisenverificatie",
    phase_state_at_gen: project?.phase_state,
    status: "draft",
    generated_by: userId,
    storage_path: storagePath,
    file_size_bytes: buffer.byteLength,
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await supabaseAdmin.from("exports").insert({
    project_id: project?.id,
    trace_id: traceId,
    export_type: "eisenverificatie_docx",
    storage_path: storagePath,
    file_size_bytes: buffer.byteLength,
    generated_by: userId,
  });

  await supabaseAdmin.from("audit_log").insert({
    project_id: project?.id,
    user_id: userId,
    action: "export_eisenverificatie_docx",
    resource_type: "trace",
    resource_id: traceId,
    payload: {
      storage_path: storagePath,
      file_size_bytes: buffer.byteLength,
      eisen_count: verifications.length,
      status_summary: summary,
      overrides_count: verifications.filter((v) => v.is_overridden).length,
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

function cell(text: string, widthDxa?: number): TableCell {
  return new TableCell({
    borders: BORDERS,
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ text })],
  });
}

function headerCell(text: string, widthDxa?: number): TableCell {
  return new TableCell({
    borders: BORDERS,
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    shading: { fill: "F1ECE6", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({ children: [new TextRun({ text, bold: true })] }),
    ],
  });
}

function statusCell(status: string, widthDxa?: number): TableCell {
  const fill = STATUS_COLORS[status] ?? "959DA5";
  const label = STATUS_CELL_LABELS[status] ?? status;
  return new TableCell({
    borders: BORDERS,
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    shading: { fill, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, color: "FFFFFF" })],
      }),
    ],
  });
}

function buildSummaryTable(
  summary: Record<string, number>,
  total: number,
): Table {
  const rows: TableRow[] = [
    new TableRow({
      children: ["Status", "Aantal", "Percentage"].map((t) => headerCell(t)),
    }),
  ];
  for (const status of STATUS_ORDER) {
    const count = summary[status] ?? 0;
    if (count === 0) continue;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    rows.push(
      new TableRow({
        children: [
          statusCell(status),
          cell(String(count)),
          cell(`${pct}%`),
        ],
      }),
    );
  }
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          borders: BORDERS,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Totaal", bold: true })],
            }),
          ],
        }),
        cell(String(total)),
        cell("100%"),
      ],
    }),
  );
  return new Table({
    width: { size: 6000, type: WidthType.DXA },
    rows,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildVerificationTable(items: any[]): Table {
  // 7 kolommen, sum = 9026 dxa
  const widths = [1000, 2700, 1500, 800, 1100, 1100, 826];
  const headerRow = new TableRow({
    children: [
      "Eis-code",
      "Titel",
      "Status",
      "Confidence",
      "Treks",
      "Verificatie",
      "Review",
    ].map((t, i) => headerCell(t, widths[i])),
  });
  const dataRows = items.map((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e: any = v.eis ?? {};
    const treks = Array.isArray(v.geraakte_trek_idx) ? v.geraakte_trek_idx : [];
    const trekStr =
      treks.length === 0
        ? "—"
        : treks.map((i: number) => i + 1).join(", ");
    const conf =
      v.ai_confidence === null || v.ai_confidence === undefined
        ? "—"
        : `${Math.round(Number(v.ai_confidence) * 100)}%`;
    return new TableRow({
      children: [
        cell(e.eis_code ?? "—", widths[0]),
        cell(String(e.eistitel ?? "—").substring(0, 220), widths[1]),
        statusCell(v.effective_status, widths[2]),
        cell(conf, widths[3]),
        cell(trekStr, widths[4]),
        cell(String(v.verificatiemethode ?? "—").substring(0, 80), widths[5]),
        cell(v.is_overridden ? "✓ Handmatig" : "AI", widths[6]),
      ],
    });
  });
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}
