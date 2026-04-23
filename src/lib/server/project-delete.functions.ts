import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const deleteProjectSchema = z.object({ project_id: z.string().uuid() });

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

    const { data: traces, error: traceErr } = await supabaseAdmin
      .from("traces")
      .select("id, source_file")
      .eq("project_id", data.project_id);
    if (traceErr) throw new Error(traceErr.message);

    const { data: exportsRows, error: exportErr } = await supabaseAdmin
      .from("exports")
      .select("storage_path")
      .eq("project_id", data.project_id);
    if (exportErr) throw new Error(exportErr.message);

    const { data: artifactRows, error: artifactErr } = await supabaseAdmin
      .from("project_artifacts")
      .select("storage_path")
      .eq("project_id", data.project_id);
    if (artifactErr) throw new Error(artifactErr.message);

    const { data: requirementRows, error: reqErr } = await supabaseAdmin
      .from("requirements_documents")
      .select("storage_path")
      .eq("project_id", data.project_id);
    if (reqErr) throw new Error(reqErr.message);

    const tracePaths = (traces ?? [])
      .map((trace) => trace.source_file)
      .filter((path): path is string => Boolean(path));

    const exportPaths = [...new Set([
      ...(exportsRows ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path)),
      ...(artifactRows ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path)),
    ])];

    const requirementPaths = (requirementRows ?? [])
      .map((row) => row.storage_path)
      .filter((path): path is string => Boolean(path));

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

    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
      "delete_project_with_cleanup",
      { p_project_id: data.project_id },
    );
    if (rpcErr) throw new Error(rpcErr.message);

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!result?.deleted || result?.rows_affected !== 1) {
      throw new Error(result?.reason ?? "Project kon niet worden verwijderd");
    }

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
