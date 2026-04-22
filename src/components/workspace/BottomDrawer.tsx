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
      className={`glass overflow-hidden rounded-xl shadow-2xl shadow-black/40 transition-all duration-300 ease-out ${
        open ? "h-[260px]" : "h-10"
      }`}
    >
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group flex items-center gap-2 rounded-md px-2 py-1 font-sans text-xs font-medium text-bone transition-colors hover:bg-blood/10"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-blood transition-transform" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-blood transition-transform" />
          )}
          <span className="font-display uppercase tracking-wider">
            Tracé-omschrijving
          </span>
          {section?.generated_at && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-bone/50">
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
        <div className="h-[calc(100%-2.5rem)] overflow-y-auto px-6 py-4">
          {!traceId ? (
            <p className="font-sans text-sm text-bone/50">
              Geen tracé.
            </p>
          ) : !section ? (
            <p className="font-sans text-sm text-bone/50">
              Nog geen tracé-omschrijving. Klik rechts op &ldquo;Tracé-omschrijving&rdquo;
              om er een te genereren.
            </p>
          ) : (
            <article className="prose prose-sm max-w-none font-sans text-sm leading-relaxed text-bone">
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
      const text = heading[2];
      return (
        <h3 key={i} className="mb-2 mt-3 font-display text-base font-semibold uppercase tracking-wider text-bone">
          {renderInline(text, opts)}
        </h3>
      );
    }
    return (
      <p key={i} className="mb-3 text-bone/90">
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
            ? "border-blood bg-blood text-bone shadow-[0_0_12px_-2px_oklch(0.60_0.22_24/0.7)]"
            : isBgt
              ? "border-blood/40 bg-blood/10 text-blood hover:border-blood hover:bg-blood/20"
              : "border-border bg-ink/40 text-bone/70 hover:border-bone/40 hover:text-bone"
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
