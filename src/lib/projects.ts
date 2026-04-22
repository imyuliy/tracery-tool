import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectStatus = NonNullable<Project["status"]>;

export const PROJECT_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Concept", tone: "bg-bone/10 text-bone/80 border-border" },
  analyzing: { label: "Analyseren", tone: "bg-blood/15 text-blood border-blood/40" },
  review: { label: "Review", tone: "bg-ember/15 text-ember border-ember/40" },
  ready: { label: "Klaar", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  archived: { label: "Gearchiveerd", tone: "bg-bone/5 text-bone/40 border-border" },
};

export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["projects", id],
    queryFn: async (): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

export const newProjectSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(120),
  client: z.string().trim().min(1, "Opdrachtgever is verplicht").max(80),
  perceel: z.string().trim().max(120).optional().or(z.literal("")),
  bto_reference: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  budget_plafond_eur: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Number(v)), "Geen geldig getal"),
  planning_plafond_weken: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), "Hele weken (>0)"),
  eisenpakket_version_id: z
    .string()
    .uuid("Kies een eisenpakket-versie"),
  scope_objecttypes: z
    .array(z.string())
    .min(1, "Kies minstens één objecttype voor de scope"),
});

export type NewProjectInput = z.infer<typeof newProjectSchema>;

export function useCreateProject() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: NewProjectInput) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Niet ingelogd");

      const { data: profile, error: profileErr } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("id", userData.user.id)
        .single();
      if (profileErr) throw profileErr;
      if (!profile.org_id) {
        throw new Error(
          "Je profiel is nog niet gekoppeld aan een organisatie. Vraag een admin om je toe te voegen.",
        );
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: input.name.trim(),
          client: input.client.trim(),
          perceel: input.perceel?.trim() || null,
          bto_reference: input.bto_reference?.trim() || null,
          description: input.description?.trim() || null,
          budget_plafond_eur: input.budget_plafond_eur
            ? Number(input.budget_plafond_eur)
            : null,
          planning_plafond_weken: input.planning_plafond_weken
            ? Number(input.planning_plafond_weken)
            : null,
          org_id: profile.org_id,
          status: "draft",
          created_by: userData.user.id,
          eisenpakket_version_id: input.eisenpakket_version_id,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Insert scope rows
      const scopeRows = input.scope_objecttypes.map((objecttype) => ({
        project_id: data.id,
        objecttype,
      }));
      const { error: scopeErr } = await supabase
        .from("project_eisen_scope")
        .insert(scopeRows);
      if (scopeErr) throw scopeErr;

      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project aangemaakt");
      navigate({ to: "/projects/$projectId", params: { projectId: id } });
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Aanmaken mislukt");
    },
  });
}

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "zojuist";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} uur geleden`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} dag${day > 1 ? "en" : ""} geleden`;
  return d.toLocaleDateString("nl-NL", { year: "numeric", month: "short", day: "numeric" });
}
