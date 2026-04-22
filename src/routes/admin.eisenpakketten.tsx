import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload, Plus, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { TopNav } from "@/components/nav/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  eisenpakkettenQueryOptions,
  useCreateEisenpakket,
  useImportEisenpakketVersion,
  type Eisenpakket,
  type EisenpakketVersion,
} from "@/lib/eisenpakketten";

export const Route = createFileRoute("/admin/eisenpakketten")({
  head: () => ({
    meta: [
      { title: "Eisenpakketten — De Tracémolen" },
      { name: "description", content: "Beheer eisenpakketten en versies." },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(eisenpakkettenQueryOptions()),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <Card className="max-w-md border-destructive/30 bg-card p-6">
          <h2 className="font-display text-xl text-ink">Fout bij laden</h2>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            {error.message}
          </p>
          <Button className="mt-4" onClick={() => router.invalidate()}>
            Opnieuw
          </Button>
        </Card>
      </div>
    );
  },
  component: () => (
    <RequireAuth>
      <AdminEisenpakkettenPage />
    </RequireAuth>
  ),
});

function AdminEisenpakkettenPage() {
  const { data: pakketten = [] } = useQuery(eisenpakkettenQueryOptions());
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          to="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>

        <div className="mb-8 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
              Eisenpakketten
            </h1>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              Backbone van elk project — upload een .xlsx om een nieuwe versie aan te maken.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuw pakket
          </Button>
        </div>

        {pakketten.length === 0 ? (
          <Card className="border-dashed border-border bg-card p-10 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl text-ink">
              Nog geen eisenpakketten
            </h3>
            <p className="mx-auto mt-1 max-w-md font-sans text-sm text-muted-foreground">
              Maak een pakket aan (bv. "Liander / NuRijnland") en upload de
              eisen-Excel als eerste versie.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pakketten.map((p) => (
              <PakketCard key={p.id} pakket={p} versions={p.versions ?? []} />
            ))}
          </div>
        )}

        <CreatePakketDialog open={createOpen} onOpenChange={setCreateOpen} />
      </main>
    </div>
  );
}

function PakketCard({
  pakket,
  versions,
}: {
  pakket: Eisenpakket;
  versions: EisenpakketVersion[];
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const sorted = [...versions].sort(
    (a, b) =>
      new Date(b.imported_at ?? 0).getTime() -
      new Date(a.imported_at ?? 0).getTime(),
  );

  return (
    <Card className="border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg text-ink">{pakket.name}</h3>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
              {pakket.client}
            </span>
          </div>
          {pakket.description && (
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              {pakket.description}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="h-4 w-4" />
          Versie uploaden
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {sorted.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground">
            Nog geen versies — upload een .xlsx.
          </p>
        ) : (
          sorted.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-paper px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {v.status === "active" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                <span className="font-sans text-sm font-medium text-ink">
                  {v.version_label}
                </span>
                <span className="font-sans text-xs text-muted-foreground">
                  {v.row_count ?? 0} eisen · {v.status}
                </span>
              </div>
              <span className="font-sans text-xs text-muted-foreground">
                {v.imported_at
                  ? new Date(v.imported_at).toLocaleDateString("nl-NL")
                  : "—"}
              </span>
            </div>
          ))
        )}
      </div>

      <UploadVersionDialog
        eisenpakketId={pakket.id}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </Card>
  );
}

function CreatePakketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateEisenpakket();
  const [name, setName] = useState("");
  const [client, setClient] = useState("Liander");
  const [description, setDescription] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name, client, description });
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Nieuw eisenpakket
          </DialogTitle>
          <DialogDescription>
            Geef het pakket een naam (bv. "NuRijnland") en de opdrachtgever.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Opdrachtgever *</Label>
            <Input value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Naam *</Label>
            <Input
              placeholder="bv. NuRijnland"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Beschrijving</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !name.trim() || !client.trim()}
            className="bg-signal text-paper hover:bg-signal/90"
          >
            {create.isPending ? "Aanmaken…" : "Aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadVersionDialog({
  eisenpakketId,
  open,
  onOpenChange,
}: {
  eisenpakketId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const importMut = useImportEisenpakketVersion(eisenpakketId);
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");

  const submit = async () => {
    if (!file || !versionLabel.trim()) return;
    await importMut.mutateAsync({ file, versionLabel: versionLabel.trim() });
    setFile(null);
    setVersionLabel("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Versie uploaden
          </DialogTitle>
          <DialogDescription>
            Upload de .xlsx. Verplichte kolommen: Objecttype, Klantnummer,
            Eistitel, Eistekst, Brondocument, Fase. Embeddings (1536 dim) worden
            automatisch gegenereerd.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Versie-label *</Label>
            <Input
              placeholder="bv. v2025.1 of NuRijnland-2025-04"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Excel-bestand *</Label>
            <Input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="font-sans text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
          {importMut.isPending && (
            <p className="font-sans text-xs text-muted-foreground">
              Bezig met uploaden, parsen en embeddings genereren — dit kan 1-3
              minuten duren bij ~2000 eisen…
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importMut.isPending}
          >
            Annuleren
          </Button>
          <Button
            onClick={submit}
            disabled={importMut.isPending || !file || !versionLabel.trim()}
            className="bg-signal text-paper hover:bg-signal/90"
          >
            {importMut.isPending ? "Importeren…" : "Importeren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
