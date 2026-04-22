import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  usePromotePhase,
  type PhaseState,
} from "@/lib/workspace";

export function PhaseWidget({
  projectId,
  current,
}: {
  projectId: string;
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const phaseKey = (PHASE_ORDER.includes(current as PhaseState)
    ? (current as PhaseState)
    : "VO_fase_1") satisfies PhaseState;
  const [target, setTarget] = useState<PhaseState>(phaseKey);
  const promote = usePromotePhase(projectId);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTarget(phaseKey);
          setOpen(true);
        }}
        className="group inline-flex items-center gap-2 rounded-full border border-border bg-ink/40 px-3.5 py-1.5 font-sans text-xs font-medium text-bone transition-all hover:border-blood hover:bg-blood/15 hover:shadow-[0_0_16px_-4px_oklch(0.60_0.22_24/0.6)]"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blood" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-bone/60">
          Fase
        </span>
        <span className="font-display font-semibold">{PHASE_LABELS[phaseKey]}</span>
        <ChevronRight className="h-3 w-3 text-bone/50 transition-transform group-hover:translate-x-0.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-overlay-strong text-bone">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wider">
              Fase promoten
            </DialogTitle>
            <DialogDescription className="text-bone/60">
              Kies de doelfase. In Sprint 5 worden hier validatie-gates aan
              toegevoegd. Nu zonder controles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase tracking-widest text-bone/50">
              Doelfase
            </label>
            <Select value={target} onValueChange={(v) => setTarget(v as PhaseState)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHASE_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PHASE_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={async () => {
                await promote.mutateAsync(target);
                setOpen(false);
              }}
              disabled={promote.isPending || target === phaseKey}
            >
              Promoten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
