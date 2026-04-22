import { Loader2, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useGenerateTraceDescription,
  useProductCatalog,
} from "@/lib/workspace";

export function RightProducts({
  traceId,
}: {
  traceId: string | null;
}) {
  const { data: products = [], isLoading } = useProductCatalog();
  const generate = useGenerateTraceDescription();

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-ink">Producten</h2>
        <p className="mt-0.5 font-sans text-xs text-muted-foreground">
          Genereer artefacten op basis van het actieve tracé.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <p className="font-sans text-xs text-muted-foreground">Laden…</p>
        ) : (
          <TooltipProvider delayDuration={200}>
            <ul className="space-y-2">
              {products.map((p) => {
                const enabled = p.code === "trace_description";
                const isActive = enabled && p.is_active !== false;
                const handleClick = () => {
                  if (!traceId) return;
                  generate.mutate(traceId);
                };
                const button = (
                  <Button
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    disabled={!isActive || !traceId || generate.isPending}
                    onClick={handleClick}
                    className={`w-full justify-start gap-2 ${
                      isActive ? "bg-signal text-paper hover:bg-signal/90" : ""
                    }`}
                  >
                    {isActive ? (
                      generate.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    <span className="truncate text-xs">{p.name}</span>
                  </Button>
                );
                if (isActive) {
                  return <li key={p.code}>{button}</li>;
                }
                return (
                  <li key={p.code}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>{button}</div>
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
