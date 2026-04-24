// De Tracémolen — Sprint 5.3 TrekEisenPanel
// 3e BottomDrawer-tab: per geselecteerde trek de bijbehorende eisen
// met klik-door-naar-detail (override-UI in EisVerificationDetail).
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  MinusCircle,
  UserCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useEisVerifications } from "@/lib/workspace";
import { EisVerificationDetail } from "./EisVerificationDetail";

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  voldoet: CheckCircle2,
  twijfelachtig: AlertCircle,
  voldoet_niet: XCircle,
  nvt: MinusCircle,
  onbekend: HelpCircle,
};

const STATUS_STYLE: Record<string, string> = {
  voldoet: "text-green-700 bg-green-50 border-green-200",
  twijfelachtig: "text-amber-700 bg-amber-50 border-amber-200",
  voldoet_niet: "text-red-700 bg-red-50 border-red-200",
  nvt: "text-gray-600 bg-gray-50 border-gray-200",
  onbekend: "text-purple-700 bg-purple-50 border-purple-200",
};

const STATUS_ICON_COLOR: Record<string, string> = {
  voldoet: "text-green-700",
  twijfelachtig: "text-amber-700",
  voldoet_niet: "text-red-700",
  nvt: "text-gray-500",
  onbekend: "text-purple-700",
};

const STATUS_LABEL: Record<string, string> = {
  voldoet: "Voldoet",
  twijfelachtig: "Twijfel",
  voldoet_niet: "Voldoet niet",
  nvt: "N.v.t.",
  onbekend: "Onbekend",
};

const STATUS_ORDER = [
  "voldoet_niet",
  "twijfelachtig",
  "onbekend",
  "voldoet",
  "nvt",
];

interface Props {
  traceId: string | null;
  selectedTrekIdx: number | null;
}

export function TrekEisenPanel({ traceId, selectedTrekIdx }: Props) {
  const { data: verifications = [], isLoading } = useEisVerifications(traceId);
  const [selectedVerificationId, setSelectedVerificationId] = useState<
    string | null
  >(null);

  // Filter: eisen die deze trek raken, anders alle
  const filtered = useMemo(() => {
    if (!verifications.length) return [];
    if (selectedTrekIdx === null) return verifications;
    return verifications.filter((v) => {
      const arr = Array.isArray(v.geraakte_trek_idx) ? v.geraakte_trek_idx : [];
      return arr.includes(selectedTrekIdx);
    });
  }, [verifications, selectedTrekIdx]);

  const ordered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.effective_status ?? "onbekend");
      const bi = STATUS_ORDER.indexOf(b.effective_status ?? "onbekend");
      if (ai !== bi) return ai - bi;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ac = ((a.eis as any)?.eis_code ?? "") as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bc = ((b.eis as any)?.eis_code ?? "") as string;
      return ac.localeCompare(bc);
    });
  }, [filtered]);

  const selectedVerification = useMemo(
    () =>
      verifications.find((v) => v.id === selectedVerificationId) ?? null,
    [verifications, selectedVerificationId],
  );

  if (isLoading) {
    return (
      <p className="px-4 py-3 font-sans text-xs text-ink/50">Eisen laden…</p>
    );
  }
  if (!verifications.length) {
    return (
      <div className="px-4 py-3 font-sans text-xs text-ink/60">
        Nog geen eisenverificatie gerund. Gebruik de knop{" "}
        <em>Eisenverificatie genereren</em> rechts.
      </div>
    );
  }
  if (!ordered.length) {
    return (
      <div className="px-4 py-3 font-sans text-xs text-ink/60">
        Geen eisen gekoppeld aan trek {selectedTrekIdx !== null ? selectedTrekIdx + 1 : "?"} —
        alle {verifications.length} eisen staan bij andere treks.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Linker lijst */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border md:max-w-[360px]">
        <div className="sticky top-0 z-10 border-b border-border bg-paper/95 px-3 py-2 backdrop-blur">
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
            {selectedTrekIdx !== null
              ? `Trek ${selectedTrekIdx + 1}`
              : "Alle treks"}
            {" · "}
            {ordered.length} eisen
          </p>
        </div>
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {ordered.map((v) => {
            const status = v.effective_status ?? "onbekend";
            const Icon = STATUS_ICON[status] ?? HelpCircle;
            const isActive = v.id === selectedVerificationId;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const eis: any = v.eis;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelectedVerificationId(v.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    "hover:bg-blood/5",
                    isActive && "bg-blood/10",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 flex-shrink-0",
                      STATUS_ICON_COLOR[status],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-ink/60">
                        {eis?.eis_code ?? "—"}
                      </span>
                      {v.is_overridden && (
                        <UserCheck
                          className="h-3 w-3 text-blue-600"
                          aria-label="Handmatig gereviewed"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-sans text-xs font-medium text-ink">
                      {eis?.eistitel ?? "—"}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1 font-mono text-[9px] uppercase tracking-wider",
                        STATUS_STYLE[status],
                      )}
                    >
                      {STATUS_LABEL[status] ?? status}
                    </Badge>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Rechter detail */}
      <div className="hidden min-w-0 flex-1 overflow-y-auto md:block">
        {selectedVerification ? (
          <EisVerificationDetail verification={selectedVerification} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <p className="font-sans text-xs text-ink/50">
              Kies een eis links om details te zien.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
