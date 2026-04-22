import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  AlertTriangle,
  FileText,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useExportDocx,
  useSegmentDescriptions,
  useTraceDescription,
} from "@/lib/workspace";

type Tab = "trace" | "segments";

interface SegmentDescriptionRow {
  id: string;
  segment_id: string;
  trace_id: string;
  narrative_md: string;
  context_summary: string | null;
  ai_aandacht: boolean | null;
  ai_aandacht_reden: string | null;
  ai_voorgestelde_techniek: string | null;
  aandacht_flags: unknown;
  aandacht_reden: string | null;
  eisen_matches: unknown;
  generated_at: string;
  segments: {
    id: string;
    sequence: number;
    km_start: number;
    km_end: number;
    length_m: number;
    bgt_feature_type: string | null;
    bgt_lokaal_id: string | null;
    beheerder: string | null;
  };
}

interface EisMatch {
  eis_id: string;
  eis_code?: string;
  eistitel?: string;
  score?: number;
  source?: string;
}

export function BottomDrawer({
  traceId,
  highlightedLokaalId,
  onPillClick,
}: {
  traceId: string | null;
  highlightedLokaalId: string | null;
  onPillClick: (lokaalId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("trace");
  const { data: section } = useTraceDescription(traceId);
  const { data: segDescriptions = [] } = useSegmentDescriptions(traceId);
  const exportDocx = useExportDocx();

  const segmentCount = segDescriptions.length;

  return (
    <div
      className={`glass overflow-hidden rounded-xl shadow-xl shadow-ink/10 transition-all duration-300 ease-out ${
        open ? "h-[320px]" : "h-10"
      }`}
    >
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="group flex items-center gap-2 rounded-md px-1.5 py-1 font-sans text-xs font-medium text-ink transition-colors hover:bg-blood/8 hover:text-blood"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-blood" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-blood" />
            )}
          </button>
          <div className="flex items-center gap-1">
            <TabButton
              active={tab === "trace"}
              onClick={() => {
                setTab("trace");
                setOpen(true);
              }}
              icon={<FileText className="h-3 w-3" />}
              label="Tracé-omschrijving"
            />
            <TabButton
              active={tab === "segments"}
              onClick={() => {
                setTab("segments");
                setOpen(true);
              }}
              icon={<Layers className="h-3 w-3" />}
              label="Per-segment scan"
              badge={segmentCount > 0 ? segmentCount : undefined}
            />
          </div>
        </div>
        {tab === "trace" && section && traceId && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exportDocx.isPending}
            onClick={() =>
              exportDocx.mutate({ traceId, sectionId: section.id })
            }
            className="h-7 gap-1.5 text-xs"
          >
            {exportDocx.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            DOCX
          </Button>
        )}
      </div>
      {open && (
        <div className="h-[calc(100%-2.5rem)] overflow-hidden">
          {tab === "trace" ? (
            <TraceTab
              traceId={traceId}
              section={section ?? null}
              highlightedLokaalId={highlightedLokaalId}
              onPillClick={onPillClick}
            />
          ) : (
            <SegmentsTab
              traceId={traceId}
              rows={segDescriptions as SegmentDescriptionRow[]}
              highlightedLokaalId={highlightedLokaalId}
              onPillClick={onPillClick}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-[10px] uppercase tracking-wider transition-all ${
        active
          ? "bg-blood text-paper"
          : "text-ink/70 hover:bg-blood/10 hover:text-blood"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 font-mono text-[9px] ${
            active ? "bg-paper/20 text-paper" : "bg-blood/10 text-blood"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ───────────────────── Trace tab ─────────────────────
function TraceTab({
  traceId,
  section,
  highlightedLokaalId,
  onPillClick,
}: {
  traceId: string | null;
  section: { id: string; content_md: string; generated_at: string | null } | null;
  highlightedLokaalId: string | null;
  onPillClick: (lokaalId: string) => void;
}) {
  const rendered = useMemo(() => {
    if (!section?.content_md) return null;
    return renderMarkdownWithPills(section.content_md, {
      highlightedLokaalId,
      onPillClick,
    });
  }, [section?.content_md, highlightedLokaalId, onPillClick]);

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      {!traceId ? (
        <p className="font-sans text-sm text-ink/50">Geen tracé.</p>
      ) : !section ? (
        <p className="font-sans text-sm text-ink/50">
          Nog geen tracé-omschrijving. Klik rechts op &ldquo;Tracé-omschrijving&rdquo;
          om er een te genereren.
        </p>
      ) : (
        <>
          {section.generated_at && (
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink/40">
              Gegenereerd: {new Date(section.generated_at).toLocaleString("nl-NL")}
            </p>
          )}
          <article className="prose prose-sm max-w-none font-sans text-sm leading-relaxed text-ink">
            {rendered}
          </article>
        </>
      )}
    </div>
  );
}

// ───────────────────── Segments tab ─────────────────────
type SegmentFilter = "all" | "aandacht";

function SegmentsTab({
  traceId,
  rows,
  highlightedLokaalId,
  onPillClick,
}: {
  traceId: string | null;
  rows: SegmentDescriptionRow[];
  highlightedLokaalId: string | null;
  onPillClick: (lokaalId: string) => void;
}) {
  const [filter, setFilter] = useState<SegmentFilter>("all");
  const [search, setSearch] = useState("");

  // Sort by sequence
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (a.segments?.sequence ?? 0) - (b.segments?.sequence ?? 0),
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((r) => {
      if (filter === "aandacht" && !r.ai_aandacht) return false;
      if (q) {
        const hay =
          (r.narrative_md ?? "") +
          " " +
          (r.segments?.bgt_feature_type ?? "") +
          " " +
          (r.segments?.bgt_lokaal_id ?? "") +
          " " +
          (r.segments?.beheerder ?? "");
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sorted, filter, search]);

  // Auto-scroll to highlighted segment
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 4,
  });

  const aandachtCount = sorted.filter((r) => r.ai_aandacht).length;

  if (!traceId) {
    return (
      <p className="px-6 py-4 font-sans text-sm text-ink/50">Geen tracé.</p>
    );
  }
  if (sorted.length === 0) {
    return (
      <p className="px-6 py-4 font-sans text-sm text-ink/50">
        Nog geen scan. Klik rechts op &ldquo;Brondocument v1&rdquo; om de
        per-segment scan te starten.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Input
          placeholder="Zoek BGT-id, beheerder, eis…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 max-w-xs text-xs"
        />
        <div className="flex items-center gap-1">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label={`Alle (${sorted.length})`}
          />
          <FilterChip
            active={filter === "aandacht"}
            onClick={() => setFilter("aandacht")}
            label={`Aandacht (${aandachtCount})`}
            tone="warn"
          />
        </div>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink/40">
          {filtered.length} / {sorted.length}
        </span>
      </div>

      {/* Virtualized list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = filtered[vi.index];
            return (
              <div
                key={row.id}
                ref={virtualizer.measureElement}
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <SegmentCard
                  row={row}
                  highlightedLokaalId={highlightedLokaalId}
                  onPillClick={onPillClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "default" | "warn";
}) {
  const base =
    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-all";
  const styles = active
    ? tone === "warn"
      ? "border-blood bg-blood text-paper"
      : "border-ink bg-ink text-paper"
    : tone === "warn"
      ? "border-blood/40 bg-blood/8 text-blood hover:bg-blood/15"
      : "border-border bg-paper text-ink/70 hover:border-ink/40 hover:text-ink";
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {label}
    </button>
  );
}

function SegmentCard({
  row,
  highlightedLokaalId,
  onPillClick,
}: {
  row: SegmentDescriptionRow;
  highlightedLokaalId: string | null;
  onPillClick: (lokaalId: string) => void;
}) {
  const seg = row.segments;
  const isHighlighted =
    seg?.bgt_lokaal_id && seg.bgt_lokaal_id === highlightedLokaalId;
  const eisenMatches = Array.isArray(row.eisen_matches)
    ? (row.eisen_matches as EisMatch[])
    : [];
  const topMatches = eisenMatches.slice(0, 5);

  return (
    <div
      className={`mx-3 my-2 rounded-md border p-3 transition-all ${
        isHighlighted
          ? "border-blood bg-blood/5 shadow-[0_0_12px_-4px_oklch(0.58_0.22_24/0.4)]"
          : "border-border bg-paper hover:border-ink/30"
      }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-blood">
            #{seg?.sequence}
          </span>
          <span className="font-mono text-[10px] text-ink/60">
            {(seg?.km_start ?? 0).toFixed(2)}–{(seg?.km_end ?? 0).toFixed(2)} km
            <span className="text-ink/40">
              {" "}
              · {Math.round(seg?.length_m ?? 0)} m
            </span>
          </span>
          {seg?.bgt_feature_type && (
            <button
              type="button"
              onClick={() =>
                seg.bgt_lokaal_id && onPillClick(seg.bgt_lokaal_id)
              }
              className="rounded-full border border-ink/20 bg-paper px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/70 hover:border-ink/40"
            >
              {seg.bgt_feature_type}
            </button>
          )}
        </div>
        {row.ai_aandacht && (
          <div className="flex items-center gap-1 rounded-full bg-blood/10 px-2 py-0.5 text-blood">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-mono text-[9px] uppercase tracking-wider">
              Aandacht
            </span>
          </div>
        )}
      </div>

      {/* Narrative */}
      <div className="font-sans text-xs leading-relaxed text-ink/85">
        {renderInline(row.narrative_md ?? "", {
          highlightedLokaalId,
          onPillClick,
        })}
      </div>

      {/* Aandacht-reden */}
      {row.ai_aandacht && row.ai_aandacht_reden && (
        <p className="mt-2 border-l-2 border-blood/40 pl-2 font-sans text-[11px] italic text-ink/70">
          {row.ai_aandacht_reden}
        </p>
      )}

      {/* Voorgestelde techniek */}
      {row.ai_voorgestelde_techniek && (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50">
          Techniek:{" "}
          <span className="text-ink">{row.ai_voorgestelde_techniek}</span>
        </p>
      )}

      {/* Eisen-matches */}
      {topMatches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {topMatches.map((m) => (
            <span
              key={m.eis_id}
              title={`${m.eistitel ?? ""} — score ${(m.score ?? 0).toFixed(2)} (${m.source ?? "?"})`}
              className="inline-flex items-center rounded-full border border-ink/20 bg-bone px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/70"
            >
              {m.eis_code ?? m.eis_id.slice(0, 8)}
            </span>
          ))}
          {eisenMatches.length > topMatches.length && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink/40">
              +{eisenMatches.length - topMatches.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────── Markdown helpers ─────────────────────
function renderMarkdownWithPills(
  md: string,
  opts: {
    highlightedLokaalId: string | null;
    onPillClick: (lokaalId: string) => void;
  },
) {
  const blocks = md.split(/\n\n+/);
  return blocks.map((block, i) => {
    const heading = /^(#{1,4})\s+(.+)$/.exec(block.trim());
    if (heading) {
      const text = heading[2];
      return (
        <h3
          key={i}
          className="mb-2 mt-3 font-display text-base font-semibold uppercase tracking-wider text-ink"
        >
          {renderInline(text, opts)}
        </h3>
      );
    }
    return (
      <p key={i} className="mb-3 text-ink/85">
        {renderInline(block, opts)}
      </p>
    );
  });
}

function renderInline(
  text: string,
  opts: {
    highlightedLokaalId: string | null;
    onPillClick: (lokaalId: string) => void;
  },
) {
  const re = /\[(BGT-[A-Za-z0-9.\-_]+|SEG-\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const tag = m[1];
    const isBgt = tag.startsWith("BGT-");
    const id = tag.replace(/^BGT-|^SEG-/, "");
    const lokaalId = isBgt ? id : null;
    const isActive = lokaalId && lokaalId === opts.highlightedLokaalId;
    parts.push(
      <button
        key={`p-${key++}`}
        type="button"
        onClick={() => lokaalId && opts.onPillClick(lokaalId)}
        className={`mx-0.5 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
          isActive
            ? "border-blood bg-blood text-paper shadow-[0_0_12px_-2px_oklch(0.58_0.22_24/0.6)]"
            : isBgt
              ? "border-blood/40 bg-blood/8 text-blood hover:border-blood hover:bg-blood/15"
              : "border-border bg-paper text-ink/70 hover:border-ink/40 hover:text-ink"
        }`}
      >
        {tag}
      </button>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}
