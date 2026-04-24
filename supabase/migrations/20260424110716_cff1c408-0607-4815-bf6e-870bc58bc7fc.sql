ALTER TABLE public.eis_verifications
  ADD COLUMN IF NOT EXISTS override_status text
    CHECK (override_status IS NULL OR override_status IN
      ('voldoet', 'twijfelachtig', 'voldoet_niet', 'nvt', 'onbekend')),
  ADD COLUMN IF NOT EXISTS override_reason_md text,
  ADD COLUMN IF NOT EXISTS override_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS override_at timestamptz;

ALTER TABLE public.eis_verifications
  DROP CONSTRAINT IF EXISTS eis_verifications_override_consistent;
ALTER TABLE public.eis_verifications
  ADD CONSTRAINT eis_verifications_override_consistent CHECK (
    (override_status IS NULL AND override_reason_md IS NULL AND override_by IS NULL AND override_at IS NULL)
    OR
    (override_status IS NOT NULL AND override_reason_md IS NOT NULL
     AND char_length(btrim(override_reason_md)) >= 10)
  );

CREATE INDEX IF NOT EXISTS idx_eis_verifications_override
  ON public.eis_verifications(trace_id) WHERE override_status IS NOT NULL;

CREATE OR REPLACE VIEW public.v_eis_verifications_effective
  WITH (security_invoker = true) AS
SELECT
  ev.id,
  ev.trace_id,
  ev.eis_id,
  ev.eisenpakket_version_id,
  ev.version,
  ev.status AS ai_status,
  ev.onderbouwing_md AS ai_onderbouwing_md,
  ev.confidence AS ai_confidence,
  ev.override_status,
  ev.override_reason_md,
  ev.override_by,
  ev.override_at,
  COALESCE(ev.override_status, ev.status) AS effective_status,
  CASE WHEN ev.override_status IS NOT NULL THEN true ELSE false END AS is_overridden,
  ev.verificatiemethode,
  ev.geraakte_trek_idx,
  ev.geraakte_segment_ids,
  ev.generated_at,
  ev.generated_by,
  ev.model
FROM public.eis_verifications ev;

CREATE OR REPLACE FUNCTION public.set_eis_verification_override(
  p_verification_id uuid,
  p_override_status text,
  p_reason_md text
) RETURNS public.eis_verifications
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_record public.eis_verifications;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;

  IF p_override_status IS NOT NULL
     AND p_override_status NOT IN ('voldoet','twijfelachtig','voldoet_niet','nvt','onbekend') THEN
    RAISE EXCEPTION 'Ongeldige override-status: %', p_override_status;
  END IF;

  IF p_override_status IS NOT NULL AND (p_reason_md IS NULL OR char_length(btrim(p_reason_md)) < 10) THEN
    RAISE EXCEPTION 'Override vereist een motivatie van minimaal 10 tekens';
  END IF;

  UPDATE public.eis_verifications
     SET override_status = p_override_status,
         override_reason_md = CASE WHEN p_override_status IS NULL THEN NULL ELSE p_reason_md END,
         override_by = CASE WHEN p_override_status IS NULL THEN NULL ELSE v_user_id END,
         override_at = CASE WHEN p_override_status IS NULL THEN NULL ELSE now() END
   WHERE id = p_verification_id
  RETURNING * INTO v_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification % niet gevonden of geen rechten', p_verification_id;
  END IF;

  INSERT INTO public.audit_log (project_id, user_id, action, resource_type, resource_id, payload)
  SELECT p.id, v_user_id,
    CASE WHEN p_override_status IS NULL THEN 'eis_verification_override_clear'
         ELSE 'eis_verification_override_set' END,
    'eis_verification', v_record.id,
    jsonb_build_object(
      'ai_status', v_record.status,
      'override_status', p_override_status,
      'reason', p_reason_md
    )
  FROM public.traces t JOIN public.projects p ON p.id = t.project_id
  WHERE t.id = v_record.trace_id;

  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_eis_verification_override(uuid, text, text) TO authenticated;