import { Loader2, Sparkles, Lock, Download, Eye, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  useExportBrondocumentV1,
  useExportEisenverificatieDocx,
  useExportTrekDocx,
  useEisVerifications,
  useGenerateSegmentScan,
  useGenerateTrekParts,
  useProductCatalog,
  useRunEisenverificatie,
  useSegmentDescriptions,
  useSegmentTrace,
  useTrekParts,
} from "@/lib/workspace";

// Sprint 5.2: brondocument + eisenverificatie zijn actief.
const ENABLED_CODES = new Set(["brondocument", "eisenverificatie"]);

export function RightProducts({
  traceId,
}: {
  traceId: string | null;
}) {
  const { data: products = [], isLoading } = useProductCatalog();
  const generateScan = useGenerateSegmentScan();
  const generateTrekParts = useGenerateTrekParts();
  const segment = useSegmentTrace();
  const exportBrondoc = useExportBrondocumentV1();
  const exportTrekDoc = useExportTrekDocx();
  const runEisen = useRunEisenverificatie();
  const exportEisen = useExportEisenverificatieDocx();
  const { data: segDescriptions = [] } = useSegmentDescriptions(traceId);
  const { data: trekParts = [] } = useTrekParts(traceId);
  const { data: verifications = [] } = useEisVerifications(traceId);
  const hasScan = segDescriptions.length > 0;
  const hasTreks = trekParts.length > 0;
  const hasVerifications = verifications.length > 0;

  // Sprint 4.7: één brondocument-knop die zowel scan als treks idempotent
  // start, op basis van wat er al in de DB staat.
  const handleBrondocument = async () => {
    if (!traceId) {
      toast.error("Geen actieve tracé.");
      return;
    }
    try {
      // 1) BGT-segmentatie — vereist voor zowel scan als treks.
      const segRes = await supabase
        .from("segments")
        .select("id", { count: "exact", head: true })
        .eq("trace_id", traceId)
        .not("bgt_lokaal_id", "is", null);
      const segmentCount = segRes.count ?? 0;

      const scanRes = await supabase
        .from("segment_descriptions")
        .select("id", { count: "exact", head: true })
        .eq("trace_id", traceId);
      const treksRes = await supabase
        .from("trek_part_descriptions")
        .select("id", { count: "exact", head: true })
        .eq("trace_id", traceId)
        .eq("version", 1);
      const scanCount = scanRes.count ?? 0;
      const treksCount = treksRes.count ?? 0;

      if (segmentCount === 0) {
        await segment.mutateAsync(traceId);
      }
      if (scanCount === 0) {
        await generateScan.mutateAsync({ traceId });
      }
      if (treksCount === 0) {
        await generateTrekParts.mutateAsync(traceId);
      }
      if (segmentCount > 0 && scanCount > 0 && treksCount > 0) {
        toast.message("Brondocument bestaat al — bekijk in de drawer onderaan.");
      }
    } catch (e) {
      console.error("[RightProducts] brondocument error", e);
      toast.error(
        e instanceof Error ? e.message : "Brondocument-flow faalde",
      );
    }
  };

  const brondocLabel = !hasScan
    ? "Brondocument genereren (volledige scan)"
    : !hasTreks
      ? "Treks afmaken"
      : "Brondocument bekijken";
  const brondocPending =
    segment.isPending || generateScan.isPending || generateTrekParts.isPending;

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

                if (p.code === "brondocument" && isActive) {
                  return (
                    <li key={p.code} className="space-y-1.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={!traceId || brondocPending}
                        onClick={handleBrondocument}
                        className="w-full justify-start gap-2.5 px-3"
                      >
                        <span className="font-mono text-[10px] text-paper/70">
                          0{idx + 1}
                        </span>
                        {brondocPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : hasScan && hasTreks ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span className="truncate text-xs">{brondocLabel}</span>
                      </Button>
                      {hasScan && (
                        <div className="flex flex-col gap-1 pl-2">
                          <p className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
                            {segDescriptions.length} segmenten
                            {hasTreks ? ` · ${trekParts.length} treks` : ""}
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
                            Per-segment .docx
                          </Button>
                          {hasTreks && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!traceId || exportTrekDoc.isPending}
                              onClick={() =>
                                traceId && exportTrekDoc.mutate(traceId)
                              }
                              className="h-7 justify-start gap-1.5 text-[11px]"
                            >
                              {exportTrekDoc.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              Per-trek .docx
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                }

                // Locked / dead products
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
