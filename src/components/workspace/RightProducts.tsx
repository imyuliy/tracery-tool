import { Loader2, Sparkles, Lock, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useExportBrondocumentV1,
  useGenerateSegmentScan,
  useGenerateTraceDescription,
  useProductCatalog,
  useSegmentDescriptions,
} from "@/lib/workspace";

const ENABLED_CODES = new Set(["trace_description", "brondocument_v1"]);

export function RightProducts({
  traceId,
}: {
  traceId: string | null;
}) {
  const { data: products = [], isLoading } = useProductCatalog();
  const generateDesc = useGenerateTraceDescription();
  const generateScan = useGenerateSegmentScan();
  const exportBrondoc = useExportBrondocumentV1();
  const { data: segDescriptions = [] } = useSegmentDescriptions(traceId);
  const hasScan = segDescriptions.length > 0;

  return (
    <aside className="glass flex h-full w-full flex-col overflow-hidden rounded-xl shadow-xl shadow-ink/10">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
          Producten
        </h2>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink/50">
          Artefacten op basis van actief tracé
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <p className="font-sans text-xs text-ink/50">Laden…</p>
        ) : (
          <TooltipProvider delayDuration={200}>
            <ul className="space-y-2">
              {products.map((p, idx) => {
                const enabled = ENABLED_CODES.has(p.code);
                const isActive = enabled && p.is_active !== false;

                if (p.code === "brondocument_v1" && isActive) {
                  return (
                    <li key={p.code} className="space-y-1.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={!traceId || generateScan.isPending}
                        onClick={() => traceId && generateScan.mutate(traceId)}
                        className="w-full justify-start gap-2.5 px-3"
                      >
                        <span className="font-mono text-[10px] text-paper/70">
                          0{idx + 1}
                        </span>
                        {generateScan.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span className="truncate text-xs">{p.name}</span>
                      </Button>
                      {hasScan && (
                        <div className="flex flex-col gap-1 pl-2">
                          <p className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
                            {segDescriptions.length} segmenten gescand
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!traceId || exportBrondoc.isPending}
                            onClick={() =>
                              traceId && exportBrondoc.mutate(traceId)
                            }
                            className="h-7 justify-start gap-1.5 text-[11px]"
                          >
                            {exportBrondoc.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            Download .docx
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                }

                if (p.code === "trace_description" && isActive) {
                  return (
                    <li key={p.code}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!traceId || generateDesc.isPending}
                        onClick={() => traceId && generateDesc.mutate(traceId)}
                        className="w-full justify-start gap-2.5 px-3"
                      >
                        <span className="font-mono text-[10px] text-ink/50">
                          0{idx + 1}
                        </span>
                        {generateDesc.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                        <span className="truncate text-xs">{p.name}</span>
                      </Button>
                    </li>
                  );
                }

                // Locked product (future sprint)
                return (
                  <li key={p.code}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled
                            className="w-full justify-start gap-2.5 px-3"
                          >
                            <span className="font-mono text-[10px] text-ink/50">
                              0{idx + 1}
                            </span>
                            <Lock className="h-3.5 w-3.5" />
                            <span className="truncate text-xs">{p.name}</span>
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        Beschikbaar in {p.sprint ?? "later sprint"}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        )}
      </div>
    </aside>
  );
}
