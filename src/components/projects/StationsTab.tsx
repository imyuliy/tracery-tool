import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATION_TYPES,
  useProjectStations,
  type Station,
} from "@/lib/project-detail";

const stationSchema = z.object({
  name: z.string().trim().min(1, "Naam verplicht").max(120),
  code: z.string().trim().max(50).optional().or(z.literal("")),
  station_type: z.enum([
    "MS_station",
    "schakelstation",
    "onderstation",
    "klantaansluiting",
  ]),
  spanningsniveau_kv_primair: z
    .string()
    .min(1, "Verplicht")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "Geen geldig getal"),
  eigenaar: z.string().trim().min(1, "Eigenaar verplicht").max(120),
  rd_x: z
    .string()
    .min(1, "X verplicht")
    .refine((v) => !Number.isNaN(Number(v)), "Geen geldig getal"),
  rd_y: z
    .string()
    .min(1, "Y verplicht")
    .refine((v) => !Number.isNaN(Number(v)), "Geen geldig getal"),
});

type StationInput = z.infer<typeof stationSchema>;

export function StationsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectStations(projectId);

  if (isLoading) {
    return <div className="font-sans text-sm text-muted-foreground">Laden…</div>;
  }

  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-muted-foreground">
        Definieer het start- en eind-station. Pas zodra beide gekoppeld zijn aan
        de meest recente trace, kan de status uit <em>concept</em> komen
        (principe&nbsp;#11).
      </p>

      {!data?.traceId && (
        <Card className="border-cyan/30 bg-cyan/5 p-4 font-sans text-sm text-ink">
          Upload eerst een tracé in de tab <strong>Tracé</strong>; daarna kun je
          stations koppelen.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StationForm
          title="Start-station"
          projectId={projectId}
          traceId={data?.traceId ?? null}
          field="start_station_id"
          existing={data?.start ?? null}
        />
        <StationForm
          title="Eind-station"
          projectId={projectId}
          traceId={data?.traceId ?? null}
          field="eind_station_id"
          existing={data?.end ?? null}
        />
      </div>
    </div>
  );
}

function StationForm({
  title,
  projectId,
  traceId,
  field,
  existing,
}: {
  title: string;
  projectId: string;
  traceId: string | null;
  field: "start_station_id" | "eind_station_id";
  existing: Station | null;
}) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<StationInput>({
    resolver: zodResolver(stationSchema),
    defaultValues: {
      name: existing?.name ?? "",
      code: existing?.code ?? "",
      station_type: (existing?.station_type as StationInput["station_type"]) ?? "MS_station",
      spanningsniveau_kv_primair: existing
        ? String(existing.spanningsniveau_kv_primair)
        : "20",
      eigenaar: existing?.eigenaar ?? "Liander",
      rd_x: "",
      rd_y: "",
    },
  });

  const stationType = watch("station_type");

  const onSubmit = handleSubmit(async (values) => {
    if (!traceId) {
      toast.error("Upload eerst een tracé voor je stations koppelt.");
      return;
    }
    setSubmitting(true);
    try {
      // Org_id ophalen.
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Niet ingelogd");
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("id", userData.user.id)
        .single();
      if (!profile?.org_id) throw new Error("Geen organisatie gekoppeld");

      // PostGIS POINT in RD-New EPSG:28992.
      const wkt = `SRID=28992;POINT(${Number(values.rd_x)} ${Number(values.rd_y)})`;

      const { data: station, error: insErr } = await supabase
        .from("stations")
        .insert({
          name: values.name.trim(),
          code: values.code?.trim() || null,
          station_type: values.station_type,
          spanningsniveau_kv_primair: Number(values.spanningsniveau_kv_primair),
          eigenaar: values.eigenaar.trim(),
          location: wkt,
          org_id: profile.org_id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const update =
        field === "start_station_id"
          ? { start_station_id: station.id }
          : { eind_station_id: station.id };
      const { error: updErr } = await supabase
        .from("traces")
        .update(update)
        .eq("id", traceId);
      if (updErr) throw updErr;

      toast.success(`${title} gekoppeld`);
      qc.invalidateQueries({ queryKey: ["project-stations", projectId] });
      qc.invalidateQueries({ queryKey: ["traces", projectId] });
      reset({ ...values, rd_x: "", rd_y: "" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Card className="border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
        {existing && (
          <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-sans text-xs text-cyan">
            Gekoppeld
          </span>
        )}
      </div>

      {existing && (
        <div className="mb-4 rounded-md border border-border bg-paper/50 p-3 font-sans text-xs text-muted-foreground">
          Huidig: <strong className="text-ink">{existing.name}</strong>
          {existing.code ? ` (${existing.code})` : ""} · {existing.eigenaar} ·{" "}
          {existing.spanningsniveau_kv_primair} kV
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <Row label="Naam" error={errors.name?.message}>
          <Input {...register("name")} placeholder="bv. OS Almere-Zuid" />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Code" error={errors.code?.message}>
            <Input {...register("code")} placeholder="bv. ALM-12" />
          </Row>
          <Row label="Type" error={errors.station_type?.message}>
            <Select
              value={stationType}
              onValueChange={(v) =>
                setValue("station_type", v as StationInput["station_type"])
              }
            >
              <SelectTrigger className="bg-paper">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row
            label="Primair (kV)"
            error={errors.spanningsniveau_kv_primair?.message}
          >
            <Input
              type="number"
              {...register("spanningsniveau_kv_primair")}
            />
          </Row>
          <Row label="Eigenaar" error={errors.eigenaar?.message}>
            <Input {...register("eigenaar")} />
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="X (RD-New, m)" error={errors.rd_x?.message}>
            <Input type="number" step="0.01" {...register("rd_x")} placeholder="155000" />
          </Row>
          <Row label="Y (RD-New, m)" error={errors.rd_y?.message}>
            <Input type="number" step="0.01" {...register("rd_y")} placeholder="463000" />
          </Row>
        </div>
        <p className="font-sans text-xs text-muted-foreground">
          EPSG:28992. Map-picker volgt in Sprint 3.
        </p>
        <Button
          type="submit"
          disabled={submitting || !traceId}
          className="w-full bg-ink text-paper hover:bg-ink/90"
        >
          {submitting ? "Opslaan…" : existing ? "Vervangen" : "Koppelen"}
        </Button>
      </form>
    </Card>
  );
}

function Row({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="font-sans text-xs text-ink">{label}</Label>
      {children}
      {error && <p className="font-sans text-xs text-destructive">{error}</p>}
    </div>
  );
}
