DROP FUNCTION IF EXISTS public.delete_project_with_cleanup(uuid);

CREATE OR REPLACE FUNCTION public.delete_project_with_cleanup(
  p_project_id uuid
)
RETURNS TABLE (deleted boolean, project_name text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_org uuid;
  v_project_org uuid;
  v_project_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'Niet ingelogd'::text;
    RETURN;
  END IF;

  SELECT org_id INTO v_user_org
  FROM public.user_profiles WHERE id = v_user_id;

  IF v_user_org IS NULL THEN
    RETURN QUERY SELECT false, NULL::text,
      'Gebruiker heeft geen organisatie gekoppeld'::text;
    RETURN;
  END IF;

  SELECT org_id, name INTO v_project_org, v_project_name
  FROM public.projects WHERE id = p_project_id;

  IF v_project_org IS NULL THEN
    RETURN QUERY SELECT false, NULL::text,
      'Project niet gevonden'::text;
    RETURN;
  END IF;

  IF v_project_org <> v_user_org THEN
    RETURN QUERY SELECT false, v_project_name,
      'Geen toegang tot dit project'::text;
    RETURN;
  END IF;

  INSERT INTO public.audit_log (
    user_id, action, resource_type, resource_id, payload
  ) VALUES (
    v_user_id, 'delete_project', 'project', p_project_id,
    jsonb_build_object(
      'project_name', v_project_name,
      'project_org_id', v_project_org,
      'deleted_at', now()
    )
  );

  DELETE FROM public.projects WHERE id = p_project_id;

  RETURN QUERY SELECT true, v_project_name, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_project_with_cleanup(uuid) TO authenticated;

-- NOOP-marker: documenteert dat de zes Sprint 4.7-iteraties van
-- trace_parts_for_trace (055025–055222) bewust zijn gereviewed en
-- geconsolideerd in 20260423060845. Geen gedragsverandering.
SELECT 1;