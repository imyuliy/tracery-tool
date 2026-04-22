import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  newProjectSchema,
  useCreateProject,
  type NewProjectInput,
} from "@/lib/projects";
import {
  activeVersionsQueryOptions,
  versionObjecttypesQueryOptions,
} from "@/lib/eisenpakketten";

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateProject();
  const { data: versions = [] } = useQuery(activeVersionsQueryOptions());

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NewProjectInput>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { client: "Liander", scope_objecttypes: [] },
  });

  const versionId = watch("eisenpakket_version_id");
  const scopeSelected = watch("scope_objecttypes") ?? [];
  const { data: objecttypes = [] } = useQuery(
    versionObjecttypesQueryOptions(versionId),
  );

  const allSelected = useMemo(
    () =>
      objecttypes.length > 0 &&
      scopeSelected.length === objecttypes.length,
    [objecttypes, scopeSelected],
  );

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset({ client: "Liander", scope_objecttypes: [] });
    onOpenChange(false);
  });

  const toggleAll = () => {
    setValue(
      "scope_objecttypes",
      allSelected ? [] : objecttypes.map((o) => o.objecttype),
      { shouldValidate: true },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isSubmitting)
          reset({ client: "Liander", scope_objecttypes: [] });
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-popover text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-ink">
            Nieuw project
          </DialogTitle>
          <DialogDescription className="font-sans text-ink/60">
            Geef de basisgegevens op en koppel het project aan een
            eisenpakket-versie. Stations, parameters en tracé voeg je daarna toe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Naam" error={errors.name?.message} required>
            <Input
              placeholder="bv. Aansluiting Datacenter Almere"
              {...register("name")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Opdrachtgever" error={errors.client?.message} required>
              <Input {...register("client")} />
            </Field>
            <Field label="Perceel" error={errors.perceel?.message}>
              <Input placeholder="bv. Liander-N" {...register("perceel")} />
            </Field>
          </div>

          <Field label="BTO-referentie" error={errors.bto_reference?.message}>
            <Input
              placeholder="BTO-2026-L-xxxx"
              {...register("bto_reference")}
            />
          </Field>

          <Field label="Beschrijving" error={errors.description?.message}>
            <Textarea
              rows={2}
              placeholder="Korte scope-omschrijving (optioneel)"
              {...register("description")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Budget-plafond (EUR)"
              error={errors.budget_plafond_eur?.message}
            >
              <Input
                type="number"
                inputMode="decimal"
                placeholder="bv. 500000"
                {...register("budget_plafond_eur")}
              />
            </Field>
            <Field
              label="Planning-plafond (weken)"
              error={errors.planning_plafond_weken?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                placeholder="bv. 26"
                {...register("planning_plafond_weken")}
              />
            </Field>
          </div>

          <div className="rounded-md border border-border bg-paper/70 p-3">
            <Field
              label="Eisenpakket-versie"
              error={errors.eisenpakket_version_id?.message}
              required
            >
              {versions.length === 0 ? (
                <p className="font-sans text-xs text-ink/60">
                  Nog geen actieve versies.{" "}
                  <Link
                    to="/admin/eisenpakketten"
                    className="text-blood transition-colors hover:text-ember hover:underline"
                  >
                    Importeer er eerst één
                  </Link>
                  .
                </p>
              ) : (
                <Controller
                  control={control}
                  name="eisenpakket_version_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setValue("scope_objecttypes", [], {
                          shouldValidate: true,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kies versie…" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => {
                          const ep = (v.eisenpakket ?? null) as {
                            client: string;
                            name: string;
                          } | null;
                          const label = ep
                            ? `${ep.client} / ${ep.name} — ${v.version_label} (${v.row_count ?? 0} eisen)`
                            : `${v.version_label} (${v.row_count ?? 0} eisen)`;
                          return (
                            <SelectItem key={v.id} value={v.id}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>

            {versionId && objecttypes.length > 0 && (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="font-sans text-sm text-ink">
                    Scope: objecttypen *
                  </Label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="font-mono text-[10px] uppercase tracking-wider text-blood transition-colors hover:text-ember hover:underline"
                  >
                    {allSelected ? "Niets selecteren" : "Alles selecteren"}
                  </button>
                </div>
                <Controller
                  control={control}
                  name="scope_objecttypes"
                  render={({ field }) => (
                    <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border bg-paper p-2">
                      {objecttypes.map((o) => {
                        const checked = field.value?.includes(o.objecttype);
                        return (
                          <label
                            key={o.objecttype}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 font-sans text-xs text-ink/80 transition-colors hover:bg-blood/10 hover:text-ink"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                const next = c
                                  ? [...(field.value ?? []), o.objecttype]
                                  : (field.value ?? []).filter(
                                      (x) => x !== o.objecttype,
                                    );
                                field.onChange(next);
                              }}
                            />
                            <span className="truncate">
                              {o.objecttype}
                            </span>
                            <span className="ml-auto text-ink/40">
                              {o.count}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.scope_objecttypes?.message && (
                  <p className="mt-1 font-sans text-xs text-destructive">
                    {errors.scope_objecttypes.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Aanmaken…" : "Project aanmaken"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-sans text-sm text-ink/80">
        {label}
        {required && <span className="text-blood"> *</span>}
      </Label>
      {children}
      {error && <p className="font-sans text-xs text-destructive">{error}</p>}
    </div>
  );
}
