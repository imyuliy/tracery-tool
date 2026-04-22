-- Sprint 4.6 — Migratie 027 + 028 (gecombineerd)
-- Trek-part aggregatie-niveau bovenop bestaande segment_descriptions.

-- ─────────────────────────────────────────────────────────────
-- 027: trek_part_descriptions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trek_part_descriptions (
    id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id                    uuid NOT NULL REFERENCES public.traces(id) ON DELETE CASCADE,

    -- Natuurlijke trek-identifier
    part_idx                    integer NOT NULL,     -- 0-based uit ST_Dump(ST_LineMerge)
    version                     integer NOT NULL DEFAULT 1,

    -- Geometrie-anchors (4326 voor map-rendering)
    start_point_4326            geometry(Point, 4326) NOT NULL,
    end_point_4326              geometry(Point, 4326) NOT NULL,
    start_km                    numeric(8,3) NOT NULL,
    end_km                      numeric(8,3) NOT NULL,
    length_m                    numeric(10,2) NOT NULL,

    -- Content
    content_md                  text NOT NULL,
    bgt_verdeling               jsonb NOT NULL DEFAULT '{}'::jsonb,
    segment_count               integer NOT NULL DEFAULT 0,

    -- Segment-referenties (detail-laag)
    segment_ids                 uuid[] NOT NULL DEFAULT '{}',

    -- Aggregatie over segmenten binnen deze trek
    van_toepassing_eisen        text[] NOT NULL DEFAULT '{}',
    aandacht_flag               boolean NOT NULL DEFAULT false,
    aandacht_reden              text[] NOT NULL DEFAULT '{}',

    -- Audit
    model                       text,
    prompt_tokens               integer,
    completion_tokens           integer,
    generated_at                timestamptz NOT NULL DEFAULT now(),
    generated_by                uuid REFERENCES public.user_profiles(id),
    reviewed_by                 uuid REFERENCES public.user_profiles(id),
    reviewed_at                 timestamptz,

    UNIQUE (trace_id, part_idx, version)
);

CREATE INDEX IF NOT EXISTS idx_trek_part_trace
    ON public.trek_part_descriptions(trace_id, version, part_idx);
CREATE INDEX IF NOT EXISTS idx_trek_part_aandacht
    ON public.trek_part_descriptions(trace_id)
    WHERE aandacht_flag = true;

ALTER TABLE public.trek_part_descriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access trek_part_descriptions via trace"
    ON public.trek_part_descriptions;
CREATE POLICY "access trek_part_descriptions via trace"
    ON public.trek_part_descriptions FOR ALL
    USING (trace_id IN (
        SELECT tr.id FROM public.traces tr
        JOIN public.projects p ON p.id = tr.project_id
        WHERE p.org_id = public.current_org_id()
    ))
    WITH CHECK (trace_id IN (
        SELECT tr.id FROM public.traces tr
        JOIN public.projects p ON p.id = tr.project_id
        WHERE p.org_id = public.current_org_id()
    ));

COMMENT ON TABLE public.trek_part_descriptions IS
    'Per-trek (MultiLineString-part) narrative-niveau. Aggregeert segment_descriptions binnen de trek. Primary view in BottomDrawer (Sprint 4.6).';

-- ─────────────────────────────────────────────────────────────
-- 028: SQL-helpers
-- ─────────────────────────────────────────────────────────────

-- Return alle natuurlijke parts van een tracé met geometry + km-positie.
CREATE OR REPLACE FUNCTION public.trace_parts_for_trace(p_trace_id uuid)
RETURNS TABLE (
    part_idx            integer,
    part_geom_28992     geometry(LineString, 28992),
    start_point_4326    geometry(Point, 4326),
    end_point_4326      geometry(Point, 4326),
    length_m            numeric,
    start_km            numeric,
    end_km              numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    WITH merged AS (
        SELECT ST_LineMerge(geometry) AS merged_geom
        FROM public.traces WHERE id = p_trace_id
    ),
    dumped AS (
        SELECT
            (ST_Dump(merged_geom)).path[1] - 1 AS part_idx,
            (ST_Dump(merged_geom)).geom AS part_geom
        FROM merged
    ),
    parts_with_meta AS (
        SELECT
            part_idx,
            part_geom,
            ST_Length(part_geom)::numeric AS len_m,
            COALESCE(
                SUM(ST_Length(part_geom)) OVER (
                    ORDER BY part_idx
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ),
                0
            )::numeric AS offset_m
        FROM dumped
    )
    SELECT
        part_idx::integer,
        part_geom::geometry(LineString, 28992),
        ST_Transform(ST_StartPoint(part_geom), 4326)::geometry(Point, 4326),
        ST_Transform(ST_EndPoint(part_geom), 4326)::geometry(Point, 4326),
        len_m AS length_m,
        (offset_m / 1000.0)::numeric AS start_km,
        ((offset_m + len_m) / 1000.0)::numeric AS end_km
    FROM parts_with_meta
    ORDER BY part_idx;
$$;

GRANT EXECUTE ON FUNCTION public.trace_parts_for_trace(uuid) TO authenticated;

-- Koppel elk segment aan de trek-part waar z'n midden-punt het dichtst bij ligt.
CREATE OR REPLACE FUNCTION public.segments_with_part_idx(p_trace_id uuid)
RETURNS TABLE (
    segment_id          uuid,
    sequence            integer,
    part_idx            integer,
    bgt_feature_type    text,
    bgt_subtype         text,
    length_m            numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    WITH parts AS (
        SELECT part_idx, part_geom_28992 AS geom
        FROM public.trace_parts_for_trace(p_trace_id)
    ),
    segs AS (
        SELECT
            s.id,
            s.sequence,
            s.bgt_feature_type,
            s.bgt_subtype,
            s.length_m,
            ST_LineInterpolatePoint(s.geometry, 0.5) AS midpoint
        FROM public.segments s
        WHERE s.trace_id = p_trace_id
    )
    SELECT
        segs.id,
        segs.sequence,
        (SELECT parts.part_idx
         FROM parts
         ORDER BY ST_Distance(parts.geom, segs.midpoint)
         LIMIT 1)::integer AS part_idx,
        segs.bgt_feature_type,
        segs.bgt_subtype,
        segs.length_m
    FROM segs
    ORDER BY segs.sequence;
$$;

GRANT EXECUTE ON FUNCTION public.segments_with_part_idx(uuid) TO authenticated;