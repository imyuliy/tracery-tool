import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
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
import { KABEL_TYPES, useDesignParameters } from "@/lib/project-detail";

const today = () => new Date().toISOString().slice(0, 10);

const paramsSchema = z
  .object({
    kabeltype: z.enum(KABEL_TYPES),
    sleufbreedte_m: z
      .string()
      .refine((v) => Number(v) >= 0.01 && Number(v) <= 2.0, "0.01 – 2.00 m"),
    sleufdiepte_m: z
      .string()
      .refine((v) => Number(v) >= 0.01 && Number(v) <= 3.0, "0.01 – 3.00 m"),
    werkstrook_m: z
      .string()
      .refine((v) => Number(v) >= 0.01 && Number(v) <= 10.0, "0.01 – 10.00 m"),
    spanningsniveau_kv: z.enum(["10", "20", "50"]),
    risicotolerantie: z.enum(["laag", "middel", "hoog"]),
    peildatum: z.string().min(1, "Verplicht"),
    nao_tarieflijst_versie: z.string().trim().min(1, "Verplicht"),
  })
  .refine(
    (v) =>
      Number(v.werkstrook_m) >= Number(v.sleufbreedte_m) / 2 + 0.5,
    {
      message: "Werkstrook moet ≥ sleufbreedte/2 + 0.5 m zijn",
      path: ["werkstrook_m"],
    },
  );

type ParamsInput = z.infer<typeof paramsSchema>;

export function ParametersTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: versions, isLoading } = useDesignParameters(projectId);
  const [submitting, setSubmitting] = useState(false);

  const latest = versions?.[0];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ParamsInput>({
    resolver: zodResolver(paramsSchema),
    defaultValues: {
      kabeltype: (latest?.kabeltype as (typeof KABEL_TYPES)[number]) ?? "Al_240mm2",
      sleufbreedte_m: latest ? String(latest.sleufbreedte_m) : "0.4",
      sleufdiepte_m: latest ? String(latest.sleufdiepte_m) : "0.8",
      werkstrook_m: latest ? String(latest.werkstrook_m) : "1.5",
      spanningsniveau_kv: (latest
        ? String(latest.spanningsniveau_kv)
        : "20") as "10" | "20" | "50",
      risicotolerantie: (latest?.risicotolerantie as "laag" | "middel" | "hoog") ?? "middel",
      peildatum: latest?.peildatum ?? today(),
      nao_tarieflijst_versie:
        latest?.nao_tarieflijst_versie ?? "NAO-2026-Q1",
    },
  });

  const kabeltype = watch("kabeltype");
  const spanning = watch("spanningsniveau_kv");
  const risico = watch("risicotolerantie");

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const newVersion = (versions?.[0]?.version ?? 0) + 1;

      const { error } = await supabase.from("design_parameters").insert({
        project_id: projectId,
        version: newVersion,
        kabeltype: values.kabeltype,
        sleufbreedte_m: Number(values.sleufbreedte_m),
        sleufdiepte_m: Number(values.sleufdiepte_m),
        werkstrook_m: Number(values.werkstrook_m),
        spanningsniveau_kv: Number(values.spanningsniveau_kv),
        peildatum: values.peildatum,
        nao_tarieflijst_versie: values.nao_tarieflijst_versie.trim(),
        // MVP-1 verplichte numerieke defaults (Sprint 3 uitbreiden):
        min_dekking_m: 0.8,
        min_bocht_radius_m: 1.5,
        min_afstand_derden_m: 0.3,
        min_vertic_afst_kruising_m: 0.3,
        opslagfactor: 1.0,
        risicotolerantie: values.risicotolerantie,
        is_active: true,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;

      toast.success(`Parameter-versie ${newVersion} opgeslagen`);
      qc.invalidateQueries({ queryKey: ["design-parameters", projectId] });
      qc.invalidateQueries({ queryKey: ["traces", projectId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card p-6">
        <h3 className="mb-1 font-display text-lg font-semibold text-ink">
          Ontwerpparameters
        </h3>
        <p className="mb-5 font-sans text-sm text-muted-foreground">
          Submit maakt een nieuwe versie aan. De DB-trigger deactiveert oudere
          versies en zet alle traces terug op <em>pending</em>.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Kabeltype" error={errors.kabeltype?.message}>
              <Select
                value={kabeltype}
                onValueChange={(v) =>
                  setValue("kabeltype", v as (typeof KABEL_TYPES)[number])
                }
              >
                <SelectTrigger className="bg-paper">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KABEL_TYPES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Spanningsniveau" error={errors.spanningsniveau_kv?.message}>
              <Select
                value={spanning}
                onValueChange={(v) =>
                  setValue("spanningsniveau_kv", v as "10" | "20" | "50")
                }
              >
                <SelectTrigger className="bg-paper">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 kV</SelectItem>
                  <SelectItem value="20">20 kV</SelectItem>
                  <SelectItem value="50">50 kV</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Sleufbreedte (m)" error={errors.sleufbreedte_m?.message}>
              <Input type="number" step="0.01" {...register("sleufbreedte_m")} />
            </Field>
            <Field label="Sleufdiepte (m)" error={errors.sleufdiepte_m?.message}>
              <Input type="number" step="0.01" {...register("sleufdiepte_m")} />
            </Field>
            <Field
              label="Werkstrook (m)"
              error={errors.werkstrook_m?.message}
              hint="≥ sleufbreedte/2 + 0.5"
            >
              <Input type="number" step="0.01" {...register("werkstrook_m")} />
            </Field>
            <Field label="Peildatum" error={errors.peildatum?.message}>
              <Input type="date" {...register("peildatum")} />
            </Field>
            <Field
              label="NAO-tarieflijst versie"
              error={errors.nao_tarieflijst_versie?.message}
            >
              <Input {...register("nao_tarieflijst_versie")} />
            </Field>
            <Field label="Risicotolerantie" error={errors.risicotolerantie?.message}>
              <Select
                value={risico}
                onValueChange={(v) =>
                  setValue("risicotolerantie", v as "laag" | "middel" | "hoog")
                }
              >
                <SelectTrigger className="bg-paper">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="laag">Laag</SelectItem>
                  <SelectItem value="middel">Middel</SelectItem>
                  <SelectItem value="hoog">Hoog</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="bg-ink text-paper hover:bg-ink/90"
          >
            {submitting
              ? "Opslaan…"
              : `Versie ${(versions?.[0]?.version ?? 0) + 1} opslaan`}
          </Button>
        </form>
      </Card>

      <Card className="border-border bg-card p-6">
        <h3 className="mb-4 font-display text-lg font-semibold text-ink">
          Versie-historie
        </h3>
        {isLoading ? (
          <p className="font-sans text-sm text-muted-foreground">Laden…</p>
        ) : !versions || versions.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground">
            Nog geen parameter-versies opgeslagen.
          </p>
        ) : (
          <ol className="space-y-3">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-3 border-l-2 border-border pl-4"
              >
                {v.is_active ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-cyan" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-ink">
                      Versie {v.version}
                    </span>
                    {v.is_active && (
                      <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-sans text-xs text-cyan">
                        actief
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                    {v.kabeltype.replace("_", " ")} · {v.spanningsniveau_kv}&nbsp;kV
                    · sleuf {v.sleufbreedte_m}×{v.sleufdiepte_m}&nbsp;m · werkstrook{" "}
                    {v.werkstrook_m}&nbsp;m · peil {v.peildatum} ·{" "}
                    {v.nao_tarieflijst_versie}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="font-sans text-sm text-ink">{label}</Label>
      {children}
      {hint && !error && (
        <p className="font-sans text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="font-sans text-xs text-destructive">{error}</p>}
    </div>
  );
}
