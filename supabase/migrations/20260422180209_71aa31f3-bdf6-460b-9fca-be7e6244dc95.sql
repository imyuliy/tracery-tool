DROP VIEW IF EXISTS public.v_project_summary;
ALTER TABLE public.traces DROP COLUMN length_m;
ALTER TABLE public.traces ALTER COLUMN geometry TYPE geometry(Geometry, 28992) USING geometry::geometry(Geometry, 28992);
ALTER TABLE public.traces ADD COLUMN length_m numeric GENERATED ALWAYS AS (ST_Length(geometry)) STORED;

CREATE VIEW public.v_project_summary AS
SELECT p.id, p.name, p.client, p.perceel, p.bto_reference, p.status, p.created_at,
       p.budget_plafond_eur, p.planning_plafond_weken,
       count(DISTINCT t.id) AS variant_count,
       max(t.length_m) AS longest_variant_m
  FROM public.projects p
  LEFT JOIN public.traces t ON t.project_id = p.id
 GROUP BY p.id;

CREATE OR REPLACE FUNCTION public.segment_trace_by_bgt(p_trace_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_count integer;
    v_total_length numeric;
BEGIN
    SELECT ST_Length(geometry) INTO v_total_length FROM public.traces WHERE id = p_trace_id;
    IF v_total_length IS NULL OR v_total_length = 0 THEN
        RAISE EXCEPTION 'Trace % heeft geen of nul-lengte geometry', p_trace_id;
    END IF;
    DELETE FROM public.segments WHERE trace_id = p_trace_id AND bgt_lokaal_id IS NOT NULL;
    WITH trace_parts AS (
        SELECT (ST_Dump(geometry)).path[1] AS part_idx, (ST_Dump(geometry)).geom AS part_geom
        FROM public.traces WHERE id = p_trace_id
    ),
    parts_with_offset AS (
        SELECT part_idx, part_geom, ST_Length(part_geom) AS part_length,
            COALESCE(SUM(ST_Length(part_geom)) OVER (ORDER BY part_idx ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS offset_m
        FROM trace_parts
    ),
    intersections AS (
        SELECT b.lokaal_id, b.feature_type, b.bgt_type, b.bgt_subtype, b.attributes,
            tp.part_idx, tp.part_geom, tp.part_length, tp.offset_m,
            (ST_Dump(ST_Intersection(tp.part_geom, b.geometry))).geom AS geom_part
        FROM parts_with_offset tp
        JOIN public.bgt_features_staging b ON b.trace_id = p_trace_id
        WHERE ST_Intersects(tp.part_geom, b.geometry)
    ),
    line_parts AS (
        SELECT i.*, ST_Length(i.geom_part) AS len_m,
            (ST_LineLocatePoint(i.part_geom, ST_StartPoint(i.geom_part)) * i.part_length + i.offset_m) / 1000.0 AS km_start
        FROM intersections i
        WHERE ST_GeometryType(i.geom_part) = 'ST_LineString' AND ST_Length(i.geom_part) > 0.01
    ),
    ordered AS (SELECT ROW_NUMBER() OVER (ORDER BY km_start) AS seq, * FROM line_parts)
    INSERT INTO public.segments (trace_id, sequence, geometry, length_m, km_start, km_end, bgt_type, bgt_subtype, bgt_lokaal_id, bgt_feature_type, bgt_attributes, bgt_fetched_at)
    SELECT p_trace_id, seq, geom_part, len_m, km_start, km_start + (len_m / 1000.0),
        COALESCE(bgt_type, feature_type, 'onbekend'), bgt_subtype, lokaal_id, feature_type, attributes, now()
    FROM ordered;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.segment_trace_by_bgt(uuid) TO authenticated;