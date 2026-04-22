import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { TopNav } from "@/components/nav/TopNav";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Instellingen — De Tracémolen" },
      {
        name: "description",
        content: "Organisatie- en accountinstellingen voor De Tracémolen.",
      },
    ],
  }),
  component: SettingsPage,
});

const ORG_NAME = "Vayu Solutions";

function SettingsPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <TopNav />

        <main className="mx-auto max-w-6xl px-6 py-12">
          <p className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
            Configuratie
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
            Instellingen
          </h1>
          <p className="mt-2 font-sans text-base text-ink/60">
            MVP-1 · alleen organisatie-weergave.
          </p>

          <Card className="mt-8 max-w-xl border-border bg-paper p-6 backdrop-blur-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blood/10 ring-1 ring-blood/30">
                <Building2 className="h-5 w-5 text-blood" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                  Organisatie
                </p>
                <p className="mt-1 font-display text-xl text-ink">{ORG_NAME}</p>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </RequireAuth>
  );
}
