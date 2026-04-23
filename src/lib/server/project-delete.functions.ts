import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const deleteProjectSchema = z.object({ project_id: z.string().uuid() });

async function listAllPaths(bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(folder: string) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(folder, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const item of data ?? []) {
      const itemPath = folder ? `${folder}/${item.name}` : item.name;
      if (item.metadata) {
        paths.push(itemPath);
      } else {
        await walk(itemPath);
      }
    }
  }

  await walk(prefix);
  return paths;
}

export const deleteProjectDeep = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteProjectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .select("org_id")
      .eq("id", context.userId)
      .single();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile?.org_id) throw new Error("Gebruiker heeft geen organisatie gekoppeld");

    const { data: project, error: projectErr } = await supabaseAdmin
      .from("projects")
      .select("id, name, org_id")
      .eq("id", data.project_id)
      .single();
    if (projectErr) throw new Error(projectErr.message);
    if (!project) throw new Error("Project niet gevonden");
    if (project.org_id !== profile.org_id) {
      throw new Error("Geen toegang tot dit project");
    }

    const [tracePaths, exportPaths, requirementPaths] = await Promise.all([
      listAllPaths("traces", data.project_id),
      listAllPaths("exports", data.project_id),
      listAllPaths("requirements", data.project_id),
    ]);

    const storageCleanup = await Promise.allSettled([
      tracePaths.length
        ? supabaseAdmin.storage.from("traces").remove(tracePaths)
        : Promise.resolve({ data: [], error: null }),
      exportPaths.length
        ? supabaseAdmin.storage.from("exports").remove(exportPaths)
        : Promise.resolve({ data: [], error: null }),
      requirementPaths.length
        ? supabaseAdmin.storage.from("requirements").remove(requirementPaths)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of storageCleanup) {
      if (result.status === "rejected") {
        throw new Error("Opschonen van projectbestanden mislukt");
      }
      if (result.value?.error) {
        throw new Error(result.value.error.message);
      }
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "delete_project",
      resource_type: "project",
      resource_id: data.project_id,
      payload: { project_name: project.name },
    });

    const { data: deletedRows, error: deleteErr } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", data.project_id)
      .select("id");
    if (deleteErr) throw new Error(deleteErr.message);
    if (!deletedRows || deletedRows.length !== 1) {
      throw new Error("DELETE raakte 0 rijen — mogelijk trigger/constraint/FK-probleem");
    }
    const result = { rows_affected: deletedRows.length };

    return {
      deleted: true,
      project_id: data.project_id,
      project_name: project.name,
      rows_affected: result.rows_affected,
      cleaned: {
        traces: tracePaths.length,
        exports: exportPaths.length,
        requirements: requirementPaths.length,
      },
    };
  });
