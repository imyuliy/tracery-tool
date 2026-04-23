DROP FUNCTION IF EXISTS public.delete_project_with_cleanup(uuid);

CREATE OR REPLACE FUNCTION public.delete_project_with_cleanup(
  p_project_id uuid
)
RETURNS TABLE (deleted boolean, project_name text, reason text, rows_affected integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_org uuid;
  v_project_org uuid;
  v_project_name text;
  v_rows integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'Niet ingelogd'::text, 0;
    RETURN;
  END IF;

  SELECT org_id INTO v_user_org FROM public.user_profiles WHERE id = v_user_id;

  SELECT org_id, name INTO v_project_org, v_project_name
  FROM public.projects WHERE id = p_project_id;

  IF v_project_org IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'Project niet gevonden'::text, 0;
    RETURN;
  END IF;

  IF v_user_org IS NULL OR v_project_org <> v_user_org THEN
    RETURN QUERY SELECT false, v_project_name,
      'Geen toegang tot dit project'::text, 0;
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
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN QUERY SELECT false, v_project_name,
      'DELETE raakte 0 rijen — mogelijk trigger/constraint/FK-probleem'::text, 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_project_name, NULL::text, v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_project_with_cleanup(uuid) TO authenticated;