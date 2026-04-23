-- 1) Fix exports.trace_id to cascade so deleting a trace (or project) doesn't fail
ALTER TABLE public.exports
  DROP CONSTRAINT IF EXISTS exports_trace_id_fkey;
ALTER TABLE public.exports
  ADD CONSTRAINT exports_trace_id_fkey
  FOREIGN KEY (trace_id) REFERENCES public.traces(id) ON DELETE CASCADE;

-- 2) Allow engineers/admins of the org to delete their own org projects.
-- Bestaande policy "admins delete own org projects" beperkt delete tot admins.
-- We vervangen door een bredere check: org-member met rol admin OF engineer.
DROP POLICY IF EXISTS "admins delete own org projects" ON public.projects;

CREATE POLICY "org engineers delete own org projects"
ON public.projects
FOR DELETE
USING (
  org_id = current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = ANY (ARRAY['admin','engineer'])
  )
);