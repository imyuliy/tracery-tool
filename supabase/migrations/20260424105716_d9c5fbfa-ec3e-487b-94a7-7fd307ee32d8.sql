-- 1) eis_verifications tabel
CREATE TABLE IF NOT EXISTS public.eis_verifications (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id                uuid NOT NULL REFERENCES public.traces(id) ON DELETE CASCADE,
    eis_id                  uuid NOT NULL REFERENCES public.eisen(id) ON DELETE CASCADE,
    eisenpakket_version_id  uuid NOT NULL REFERENCES public.eisenpakket_versions(id) ON DELETE CASCADE,
    version                 integer NOT NULL DEFAULT 1,

    status                  text NOT NULL CHECK (status IN
                              ('voldoet', 'twijfelachtig', 'voldoet_niet', 'nvt', 'onbekend')),
    onderbouwing_md         text NOT NULL,
    verificatiemethode      text,
    geraakte_trek_idx       integer[] NOT NULL DEFAULT '{}',
    geraakte_segment_ids    uuid[] NOT NULL DEFAULT '{}',
    confidence              numeric(3,2),

    model                   text,
    prompt_tokens           integer,
    completion_tokens       integer,
    generated_at            timestamptz NOT NULL DEFAULT now(),
    generated_by            uuid REFERENCES public.user_profiles(id),
    reviewed_by             uuid REFERENCES public.user_profiles(id),
    reviewed_at             timestamptz,

    UNIQUE (trace_id, eis_id, version)
);

CREATE INDEX IF NOT EXISTS idx_eis_verifications_trace
  ON public.eis_verifications(trace_id, version);
CREATE INDEX IF NOT EXISTS idx_eis_verifications_eis
  ON public.eis_verifications(eis_id);
CREATE INDEX IF NOT EXISTS idx_eis_verifications_status
  ON public.eis_verifications(trace_id, status);

ALTER TABLE public.eis_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eis_verifications_select ON public.eis_verifications;
CREATE POLICY eis_verifications_select ON public.eis_verifications
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.traces t
        JOIN public.projects p ON p.id = t.project_id
        WHERE t.id = eis_verifications.trace_id
          AND p.org_id = public.current_org_id()
    ));

DROP POLICY IF EXISTS eis_verifications_insert ON public.eis_verifications;
CREATE POLICY eis_verifications_insert ON public.eis_verifications
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.traces t
        JOIN public.projects p ON p.id = t.project_id
        WHERE t.id = eis_verifications.trace_id
          AND p.org_id = public.current_org_id()
    ));

DROP POLICY IF EXISTS eis_verifications_update ON public.eis_verifications;
CREATE POLICY eis_verifications_update ON public.eis_verifications
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.traces t
        JOIN public.projects p ON p.id = t.project_id
        WHERE t.id = eis_verifications.trace_id
          AND p.org_id = public.current_org_id()
    ));

DROP POLICY IF EXISTS eis_verifications_delete ON public.eis_verifications;
CREATE POLICY eis_verifications_delete ON public.eis_verifications
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.traces t
        JOIN public.projects p ON p.id = t.project_id
        WHERE t.id = eis_verifications.trace_id
          AND p.org_id = public.current_org_id()
    ));

-- 2) Context-RPC voor AI-verificatie
CREATE OR REPLACE FUNCTION public.eis_verification_context(p_trace_id uuid)
 RETURNS TABLE(
   eis_id                  uuid,
   eis_code                text,
   eistitel                text,
   eistekst                text,
   objecttype              text,
   fase                    text,
   verificatiemethode      text,
   brondocument            text,
   hit_count               integer,
   geraakte_trek_idx       integer[],
   geraakte_segment_ids    uuid[],
   sample_narratives       text[],
   bgt_verdeling_agg       jsonb
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH proj AS (
        SELECT t.project_id, p.eisenpakket_version_id
        FROM traces t JOIN projects p ON p.id = t.project_id
        WHERE t.id = p_trace_id
    ),
    scope_eisen AS (
        SELECT e.*
        FROM eisen e
        JOIN proj ON e.eisenpakket_version_id = proj.eisenpakket_version_id
        JOIN project_eisen_scope s
          ON s.project_id = proj.project_id
         AND s.objecttype = e.objecttype
         AND s.in_scope = true
    ),
    seg_hits AS (
        SELECT
            (m->>'eis_id')::uuid AS eis_id,
            sd.segment_id,
            sd.narrative_md,
            seg.sequence
        FROM segment_descriptions sd
        JOIN segments seg ON seg.id = sd.segment_id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sd.eisen_matches, '[]'::jsonb)) m
        WHERE sd.trace_id = p_trace_id
          AND m ? 'eis_id'
    ),
    trek_hits AS (
        SELECT
            unnest(tpd.van_toepassing_eisen) AS eis_code,
            tpd.part_idx,
            tpd.bgt_verdeling
        FROM trek_part_descriptions tpd
        WHERE tpd.trace_id = p_trace_id
    ),
    seg_agg AS (
        SELECT eis_id,
               COUNT(*)::integer AS hit_count,
               array_agg(DISTINCT segment_id) AS seg_ids,
               array_agg(narrative_md ORDER BY sequence)
                 FILTER (WHERE narrative_md IS NOT NULL) AS narratives
        FROM seg_hits
        GROUP BY eis_id
    ),
    trek_idx_agg AS (
        SELECT eis_code,
               array_agg(DISTINCT part_idx ORDER BY part_idx) AS trek_idx
        FROM trek_hits
        GROUP BY eis_code
    ),
    trek_bgt_agg AS (
        SELECT th.eis_code,
               jsonb_object_agg(bgt_key, bgt_total) AS bgt_dist
        FROM (
            SELECT
                th.eis_code,
                kv.key AS bgt_key,
                SUM(
                    CASE
                        WHEN jsonb_typeof(kv.value) = 'number'
                            THEN (kv.value)::text::numeric
                        WHEN jsonb_typeof(kv.value) = 'object'
                            THEN COALESCE((kv.value->>'length_m')::numeric, 0)
                        ELSE 0
                    END
                )::numeric AS bgt_total
            FROM trek_hits th,
                 LATERAL jsonb_each(COALESCE(th.bgt_verdeling, '{}'::jsonb)) kv
            GROUP BY th.eis_code, kv.key
        ) th
        GROUP BY th.eis_code
    )
    SELECT
        se.id,
        se.eis_code,
        se.eistitel,
        se.eistekst,
        se.objecttype,
        se.fase,
        se.verificatiemethode,
        se.brondocument,
        COALESCE(sa.hit_count, 0),
        COALESCE(ti.trek_idx, ARRAY[]::integer[]),
        COALESCE(sa.seg_ids, ARRAY[]::uuid[]),
        COALESCE(
            (SELECT array_agg(n)
             FROM unnest(sa.narratives) WITH ORDINALITY AS t(n, ord)
             WHERE ord <= 5),
            ARRAY[]::text[]
        ),
        COALESCE(tba.bgt_dist, '{}'::jsonb)
    FROM scope_eisen se
    LEFT JOIN seg_agg sa ON sa.eis_id = se.id
    LEFT JOIN trek_idx_agg ti ON ti.eis_code = se.eis_code
    LEFT JOIN trek_bgt_agg tba ON tba.eis_code = se.eis_code
    ORDER BY se.objecttype, se.eis_code;
$function$;

GRANT EXECUTE ON FUNCTION public.eis_verification_context(uuid) TO authenticated;

-- 3) Activeer product in product_catalog
INSERT INTO public.product_catalog
  (code, name, description, available_from_phase, is_active, sort_order, sprint)
VALUES (
  'eisenverificatie',
  'Eisenverificatie',
  'Per-eis status (voldoet / twijfelachtig / voldoet niet / n.v.t.) met AI-onderbouwing, gegroepeerd op objecttype. Exporteert als DOCX.',
  'VO_fase_1',
  true,
  20,
  'sprint-5.2'
)
ON CONFLICT (code) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  sprint = EXCLUDED.sprint;