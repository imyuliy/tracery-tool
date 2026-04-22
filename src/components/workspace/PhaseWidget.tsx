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
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-sans text-xs font-medium text-ink transition-colors hover:border-ink/40"
      >
        <span className="h-2 w-2 rounded-full bg-signal" />
        Fase: {PHASE_LABELS[phaseKey]}
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fase promoten</DialogTitle>
            <DialogDescription>
              Kies de doelfase. In Sprint 5 worden hier validatie-gates aan
              toegevoegd. Nu zonder controles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
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
              className="bg-signal text-paper hover:bg-signal/90"
            >
              Promoten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
