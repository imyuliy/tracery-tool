import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  newProjectSchema,
  useCreateProject,
  type NewProjectInput,
} from "@/lib/projects";

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateProject();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewProjectInput>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { client: "Liander" },
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset({ client: "Liander" });
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isSubmitting) reset({ client: "Liander" });
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-ink">
            Nieuw project
          </DialogTitle>
          <DialogDescription className="font-sans">
            Geef de basisgegevens op. Stations, parameters en tracé voeg je in
            de volgende stap toe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Naam"
            error={errors.name?.message}
            required
          >
            <Input placeholder="bv. Aansluiting Datacenter Almere" {...register("name")} />
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
            <Input placeholder="BTO-2026-L-xxxx" {...register("bto_reference")} />
          </Field>

          <Field label="Beschrijving" error={errors.description?.message}>
            <Textarea
              rows={3}
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

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              className="bg-signal text-paper hover:bg-signal/90"
              disabled={isSubmitting}
            >
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
      <Label className="font-sans text-sm text-ink">
        {label}
        {required && <span className="text-signal"> *</span>}
      </Label>
      {children}
      {error && <p className="font-sans text-xs text-destructive">{error}</p>}
    </div>
  );
}
