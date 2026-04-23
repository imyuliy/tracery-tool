import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const deleteProjectSchema = z.object({
  project_id: z.string().uuid(),
});

export const deleteProjectCascade = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteProjectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, org_id")
      .eq("id", data.project_id)
      .maybeSingle();

    if (projectError) {
      throw new Error(`Project check mislukt: ${projectError.message}`);
    }

    if (!project?.id) {
      throw new Error("Project niet gevonden of niet toegankelijk.");
    }

    const { data: userProfile, error: profileError } = await context.supabase
      .from("user_profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Profiel check mislukt: ${profileError.message}`);
    }

    if (!userProfile?.org_id || userProfile.org_id !== project.org_id) {
      throw new Error("Je mag dit project niet verwijderen.");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", data.project_id);

    if (deleteError) {
      throw new Error(`Project verwijderen mislukt: ${deleteError.message}`);
    }

    await supabaseAdmin.from("audit_log").insert({
      project_id: data.project_id,
      user_id: context.userId,
      action: "delete_project",
      resource_type: "project",
      resource_id: data.project_id,
      payload: { deleted_via: "server_fn" },
    });

    return { id: data.project_id };
  });