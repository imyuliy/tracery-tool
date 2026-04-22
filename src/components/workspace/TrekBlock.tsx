// De Tracémolen — Sprint 4.6 trek-block (primary view).
import { ChevronRight, AlertTriangle, MapPin } from "lucide-react";
import type { ReactNode } from "react";

interface TrekRow {
  id: string;
  part_idx: number;
  start_km: number | string;
  end_km: number | string;
  length_m: number | string;
  segment_count: number;
  content_md: string;
  van_toepassing_eisen: string[] | null;
  aandacht_flag: boolean;
  aandacht_reden: string[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bgt_verdeling: any;
}

export function TrekBlock({
  trek,
  isExpanded,
  onToggleExpand,
  onTrekClick,
  isHighlighted,
}: {
  trek: TrekRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTrekClick: () => void;
  isHighlighted: boolean;
}) {
  const eisen = trek.van_toepassing_eisen ?? [];
  const reden = trek.aandacht_reden ?? [];
  const km0 = Number(trek.start_km).toFixed(3);
  const km1 = Number(trek.end_km).toFixed(3);
  const len = Math.round(Number(trek.length_m));

  return (
    <article
      className={`rounded-lg border p-4 shadow-sm transition-all ${
        isHighlighted
          ? "border-blood bg-blood/5 shadow-[0_0_12px_-4px_oklch(0.58_0.22_24/0.4)]"
          : "border-border bg-paper/50 hover:border-ink/30"
      }`}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onTrekClick}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <MapPin className="h-4 w-4 text-blood" />
          <h3 className="font-display text-sm font-semibold text-ink">
            Trek {trek.part_idx + 1}
          </h3>
          <span className="font-mono text-[11px] text-ink/60">
            km {km0} – {km1} · {len}m · {trek.segment_count} BGT
          </span>
        </button>
        {trek.aandacht_flag && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-blood/15 px-2 py-0.5 text-[10px] font-medium text-blood"
            title={reden.join("; ")}
          >
            <AlertTriangle className="h-3 w-3" />
            aandacht
          </span>
        )}
      </header>

      <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/85">
        {trek.content_md}
      </div>

      {eisen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {eisen.slice(0, 8).map((code) => (
            <button
              type="button"
              key={code}
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard?.writeText(code);
              }}
              title={`Kopieer ${code}`}
              className="inline-flex items-center rounded-full border border-ink/20 bg-bone px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/70 transition-colors hover:border-blood/40 hover:bg-blood/8 hover:text-blood"
            >
              {code}
            </button>
          ))}
          {eisen.length > 8 && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink/40">
              +{eisen.length - 8}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onToggleExpand}
        className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink/60 hover:text-ink"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        BGT-verdeling
      </button>

      {isExpanded && (
        <BgtBreakdown verdeling={trek.bgt_verdeling} />
      )}
    </article>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BgtBreakdown({ verdeling }: { verdeling: any }): ReactNode {
  if (!verdeling || typeof verdeling !== "object") return null;
  const entries = Object.entries(verdeling as Record<string, number>).sort(
    (a, b) => b[1] - a[1],
  );
  if (entries.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 rounded-md bg-ink/5 p-3">
      {entries.map(([k, v]) => (
        <li
          key={k}
          className="flex items-center justify-between font-mono text-[11px] text-ink/80"
        >
          <span>{k.replace(/_m$/, "")}</span>
          <span className="font-sans">{v}m</span>
        </li>
      ))}
    </ul>
  );
}
