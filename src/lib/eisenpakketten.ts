// Client-side helpers voor eisenpakketten + versies + scope.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { importEisenpakketXlsx } from "@/lib/server/eisenpakket.functions";

export type Eisenpakket = Database["public"]["Tables"]["eisenpakketten"]["Row"];
export type EisenpakketVersion =
  Database["public"]["Tables"]["eisenpakket_versions"]["Row"];

export const eisenpakkettenQueryOptions = () =>
  queryOptions({
    queryKey: ["eisenpakketten"],
    queryFn: async (): Promise<
      Array<Eisenpakket & { versions: EisenpakketVersion[] }>
    > => {
      const { data, error } = await supabase
        .from("eisenpakketten")
        .select("*, versions:eisenpakket_versions(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<
        Eisenpakket & { versions: EisenpakketVersion[] }
      >;
    },
  });

export const activeVersionsQueryOptions = () =>
  queryOptions({
    queryKey: ["eisenpakket_versions", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eisenpakket_versions")
        .select("id, version_label, row_count, eisenpakket:eisenpakketten(id, name, client)")
        .eq("status", "active")
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const versionObjecttypesQueryOptions = (versionId: string | null | undefined) =>
  queryOptions({
    queryKey: ["eisen_objecttypes", versionId],
    enabled: !!versionId,
    queryFn: async (): Promise<Array<{ objecttype: string; count: number }>> => {
      if (!versionId) return [];
      const { data, error } = await supabase
        .from("eisen")
        .select("objecttype")
        .eq("eisenpakket_version_id", versionId);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        counts.set(r.objecttype, (counts.get(r.objecttype) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([objecttype, count]) => ({ objecttype, count }))
        .sort((a, b) => a.objecttype.localeCompare(b.objecttype));
    },
  });

export function useCreateEisenpakket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; client: string; description?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Niet ingelogd");
      const { data: p } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("id", u.user.id)
        .single();
      if (!p?.org_id) throw new Error("Geen organisatie gekoppeld aan profiel");
      const { data, error } = await supabase
        .from("eisenpakketten")
        .insert({
          name: input.name.trim(),
          client: input.client.trim(),
          description: input.description?.trim() || null,
          org_id: p.org_id,
          created_by: u.user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eisenpakketten"] });
      toast.success("Eisenpakket aangemaakt");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useImportEisenpakketVersion(eisenpakketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; versionLabel: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Niet ingelogd");

      const hash = await sha256Hex(input.file);
      const ts = Date.now();
      const cleanName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const storagePath = `${eisenpakketId}/${ts}-${cleanName}`;

      const { error: upErr } = await supabase.storage
        .from("requirements")
        .upload(storagePath, input.file, {
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);

      const result = await importEisenpakketXlsx({
        data: {
          eisenpakket_id: eisenpakketId,
          version_label: input.versionLabel,
          storage_path: storagePath,
          source_file_hash: hash,
        },
      });
      return result;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["eisenpakketten"] });
      qc.invalidateQueries({ queryKey: ["eisenpakket_versions"] });
      if (r.skipped_duplicates > 0) {
        toast.info(r.message ?? "Bestand al geïmporteerd");
      } else {
        toast.success(`${r.inserted} eisen geïmporteerd`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
