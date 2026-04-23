-- Drop bestaande DELETE policies op projects
DROP POLICY IF EXISTS "admins delete projects" ON public.projects;
DROP POLICY IF EXISTS "engineers delete own org projects" ON public.projects;
DROP POLICY IF EXISTS "org engineers delete own org projects" ON public.projects;
DROP POLICY IF EXISTS "delete projects within own org" ON public.projects;

-- Nieuwe simpele org-scoped DELETE policy
CREATE POLICY "delete projects within own org"
  ON public.projects
  FOR DELETE
  USING (org_id = public.current_org_id());