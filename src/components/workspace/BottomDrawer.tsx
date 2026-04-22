import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportDocx, useTraceDescription } from "@/lib/workspace";

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
  const { data: section } = useTraceDescription(traceId);
  const exportDocx = useExportDocx();

  const rendered = useMemo(() => {
    if (!section?.content_md) return null;
    return renderMarkdownWithPills(section.content_md, {
      highlightedLokaalId,
      onPillClick,
    });
  }, [section?.content_md, highlightedLokaalId, onPillClick]);

  return (
    <div
      className={`shrink-0 border-t border-border bg-card transition-all ${
        open ? "h-[260px]" : "h-9"
      }`}
    >
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 font-sans text-xs font-medium text-ink"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
          Tracé-omschrijving
          {section?.generated_at && (
            <span className="ml-2 font-sans text-[11px] text-muted-foreground">
              {new Date(section.generated_at).toLocaleString("nl-NL")}
            </span>
          )}
        </button>
        {section && traceId && (
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
        <div className="h-[calc(100%-2.25rem)] overflow-y-auto px-5 py-4">
          {!traceId ? (
            <p className="font-sans text-sm text-muted-foreground">
              Geen tracé.
            </p>
          ) : !section ? (
            <p className="font-sans text-sm text-muted-foreground">
              Nog geen tracé-omschrijving. Klik rechts op “Tracé-omschrijving”
              om er een te genereren.
            </p>
          ) : (
            <article className="prose prose-sm max-w-none font-sans text-sm leading-relaxed text-ink">
              {rendered}
            </article>
          )}
        </div>
      )}
    </div>
  );
}

// Lichte markdown-renderer: paragrafen + headings + onze [BGT-xxx]/[SEG-N] pills.
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
      const level = heading[1].length;
      const text = heading[2];
      const Tag = (`h${Math.min(level + 1, 5)}`) as keyof JSX.IntrinsicElements;
      return (
        <Tag key={i} className="mb-2 mt-3 font-display text-base font-semibold text-ink">
          {renderInline(text, opts)}
        </Tag>
      );
    }
    return (
      <p key={i} className="mb-3 text-ink">
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
  // Match [BGT-xxx] of [SEG-N]
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
        className={`mx-0.5 inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
          isActive
            ? "border-signal bg-signal/15 text-signal"
            : isBgt
              ? "border-cyan/30 bg-cyan/10 text-cyan hover:border-cyan/60"
              : "border-border bg-muted text-ink/80"
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
