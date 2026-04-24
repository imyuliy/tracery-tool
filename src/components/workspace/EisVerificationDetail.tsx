// De Tracémolen — Sprint 5.3 EisVerificationDetail
// Detail-paneel voor één eisenverificatie: AI-onderbouwing + override-UI.
import { useEffect, useState } from "react";
import { Loader2, Save, RotateCcw, UserCheck, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trekLabel, useSetEisVerificationOverride, useTrekPlan } from "@/lib/workspace";

const STATUS_OPTIONS = [
  { value: "voldoet", label: "Voldoet" },
  { value: "twijfelachtig", label: "Twijfelachtig" },
  { value: "voldoet_niet", label: "Voldoet niet" },
  { value: "nvt", label: "N.v.t." },
  { value: "onbekend", label: "Onbekend" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EisVerificationDetail({ verification }: { verification: any }) {
  const v = verification;
  const override = useSetEisVerificationOverride();
  const { data: trekPlan = [] } = useTrekPlan(v?.trace_id ?? null);
  const trekNames = (Array.isArray(v?.geraakte_trek_idx) ? v.geraakte_trek_idx : [])
    .map((idx: number) => trekLabel(trekPlan, idx))
    .join(", ");

  const aiStatus: string = v.ai_status ?? "onbekend";
  const initial = v.override_status ?? aiStatus;

  const [draftStatus, setDraftStatus] = useState<string>(initial);
  const [draftReason, setDraftReason] = useState<string>(
    v.override_reason_md ?? "",
  );

  // Reset draft wanneer een andere eis wordt geselecteerd of override
  // serverside wijzigt.
  useEffect(() => {
    setDraftStatus(v.override_status ?? aiStatus);
    setDraftReason(v.override_reason_md ?? "");
  }, [v.id, v.override_status, aiStatus, v.override_reason_md]);

  const isDirty =
    draftStatus !== (v.override_status ?? aiStatus) ||
    draftReason !== (v.override_reason_md ?? "");
  const isOverride = draftStatus !== aiStatus;
  const reasonTooShort = isOverride && draftReason.trim().length < 10;
  const canSave = isDirty && (!isOverride || !reasonTooShort);

  const handleSave = () => {
    if (!canSave) return;
    override.mutate({
      verificationId: v.id,
      overrideStatus: isOverride ? draftStatus : null,
      reasonMd: isOverride ? draftReason.trim() : null,
    });
  };

  const handleClearOverride = () => {
    override.mutate({
      verificationId: v.id,
      overrideStatus: null,
      reasonMd: null,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Eis-header */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-ink/60">
            {v.eis?.eis_code ?? "—"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink/40">
            · {v.eis?.objecttype ?? "?"}
            {v.eis?.fase ? ` · ${v.eis.fase}` : ""}
          </span>
        </div>
        <h3 className="mt-1 font-display text-sm font-semibold text-ink">
          {v.eis?.eistitel ?? "—"}
        </h3>
        {v.eis?.eistekst && (
          <details className="mt-2">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-ink/60 hover:text-ink">
              Volledige eistekst
            </summary>
            <p className="mt-1.5 whitespace-pre-wrap font-sans text-xs text-ink/80">
              {v.eis.eistekst}
            </p>
          </details>
        )}
        {trekNames && (
          <p className="mt-1 font-mono text-[10px] text-ink/60">
            Geraakte treks: {trekNames}
          </p>
        )}
      </div>

      {/* AI-onderbouwing */}
      <div className="rounded-md border border-border bg-paper/50 p-3">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/60">
          <Bot className="h-3 w-3" />
          AI-onderbouwing · confidence{" "}
          {v.ai_confidence !== null && v.ai_confidence !== undefined
            ? `${Math.round(Number(v.ai_confidence) * 100)}%`
            : "—"}
        </div>
        <p className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink/90">
          {v.ai_onderbouwing_md ?? "—"}
        </p>
      </div>

      {/* Override-UI */}
      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/60">
          <UserCheck className="h-3 w-3" />
          Handmatige review
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
            Status
          </label>
          <Select value={draftStatus} onValueChange={setDraftStatus}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                  {o.value === aiStatus ? " (AI)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isOverride && (
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
              Motivatie (verplicht, min. 10 tekens)
            </label>
            <Textarea
              value={draftReason}
              onChange={(e) => setDraftReason(e.target.value)}
              placeholder="Waarom wijk je af van het AI-oordeel?"
              className="mt-1 min-h-[80px] text-xs"
            />
            {reasonTooShort && (
              <p className="mt-1 font-mono text-[10px] text-blood">
                Motivatie is nog {10 - draftReason.trim().length} tekens te kort.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canSave || override.isPending}
            onClick={handleSave}
            className="gap-1.5"
          >
            {override.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Opslaan
          </Button>
          {v.is_overridden && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={override.isPending}
              onClick={handleClearOverride}
              className="gap-1.5"
            >
              <RotateCcw className="h-3 w-3" />
              AI-status herstellen
            </Button>
          )}
        </div>

        {v.is_overridden && (
          <p className="font-mono text-[10px] text-ink/60">
            Gereviewed door{" "}
            {v.override_user?.full_name ?? "onbekende gebruiker"} op{" "}
            {v.override_at
              ? new Date(v.override_at).toLocaleDateString("nl-NL")
              : "—"}
          </p>
        )}
      </div>
    </div>
  );
}
