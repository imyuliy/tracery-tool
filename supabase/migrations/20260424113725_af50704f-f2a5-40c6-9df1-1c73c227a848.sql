
CREATE TABLE IF NOT EXISTS public.trek_plan (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id        uuid NOT NULL REFERENCES public.traces(id) ON DELETE CASCADE,
  part_idx        integer NOT NULL,
  display_name    text NOT NULL,
  notes           text,
  source          text NOT NULL DEFAULT 'deterministic'
                    CHECK (source IN ('deterministic', 'manual_rename')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.user_profiles(id),
  UNIQUE (trace_id, part_idx),
  CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS idx_trek_plan_trace
  ON public.trek_plan(trace_id, part_idx);

ALTER TABLE public.trek_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY trek_plan_select ON public.trek_plan
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = trek_plan.trace_id
      AND p.org_id = public.current_org_id()
  ));

CREATE POLICY trek_plan_insert ON public.trek_plan
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = trek_plan.trace_id
      AND p.org_id = public.current_org_id()
  ));

CREATE POLICY trek_plan_update ON public.trek_plan
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = trek_plan.trace_id
      AND p.org_id = public.current_org_id()
  ));

CREATE POLICY trek_plan_delete ON public.trek_plan
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = trek_plan.trace_id
      AND p.org_id = public.current_org_id()
  ));

-- ── 1.1 trek_plan_ensure ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trek_plan_ensure(p_trace_id uuid)
RETURNS SETOF public.trek_plan
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.trek_plan (trace_id, part_idx, display_name, source)
  SELECT
    p_trace_id,
    tp.part_idx,
    'Trek ' || (tp.part_idx + 1)::text,
    'deterministic'
  FROM public.trace_parts_for_trace(p_trace_id) tp
  ON CONFLICT (trace_id, part_idx) DO NOTHING;

  RETURN QUERY
    SELECT * FROM public.trek_plan
    WHERE trace_id = p_trace_id
    ORDER BY part_idx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trek_plan_ensure(uuid) TO authenticated;

-- ── 1.2 trek_plan_rename ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trek_plan_rename(
  p_trek_plan_id uuid,
  p_new_name text
) RETURNS public.trek_plan
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_record public.trek_plan;
  v_user_id uuid := auth.uid();
  v_clean_name text := btrim(p_new_name);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;

  IF v_clean_name = '' OR char_length(v_clean_name) > 80 THEN
    RAISE EXCEPTION 'Trek-naam moet 1-80 tekens zijn (na whitespace-trim)';
  END IF;

  UPDATE public.trek_plan
     SET display_name = v_clean_name,
         source = CASE
           WHEN source = 'deterministic'
                AND v_clean_name <> 'Trek ' || (part_idx + 1)::text
           THEN 'manual_rename'
           ELSE source
         END,
         updated_at = now(),
         updated_by = v_user_id
   WHERE id = p_trek_plan_id
  RETURNING * INTO v_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trek-plan % niet gevonden of geen rechten', p_trek_plan_id;
  END IF;

  INSERT INTO public.audit_log (project_id, user_id, action, resource_type, resource_id, payload)
  SELECT p.id, v_user_id, 'trek_rename', 'trek_plan', v_record.id,
    jsonb_build_object('part_idx', v_record.part_idx, 'new_name', v_clean_name)
  FROM public.traces t JOIN public.projects p ON p.id = t.project_id
  WHERE t.id = v_record.trace_id;

  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trek_plan_rename(uuid, text) TO authenticated;

-- ── 1.3 v_trek_plan_labels ──────────────────────────────────────
CREATE OR REPLACE VIEW public.v_trek_plan_labels
  WITH (security_invoker = true) AS
SELECT
  tp.trace_id,
  tp.part_idx,
  tp.id AS trek_plan_id,
  tp.display_name
FROM public.trek_plan tp;
