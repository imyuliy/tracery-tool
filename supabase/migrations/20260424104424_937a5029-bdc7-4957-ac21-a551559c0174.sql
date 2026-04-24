DROP FUNCTION IF EXISTS public.segments_with_part_idx(uuid);

CREATE OR REPLACE FUNCTION public.segments_with_part_idx(p_trace_id uuid)
 RETURNS TABLE(
   segment_id uuid,
   sequence integer,
   part_idx integer,
   bgt_feature_type text,
   bgt_type text,
   bgt_subtype text,
   beheerder text,
   km_start numeric,
   km_end numeric,
   length_m numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH parts AS (
        SELECT part_idx, part_geom_28992 AS geom
        FROM public.trace_parts_for_trace(p_trace_id)
    ),
    segs AS (
        SELECT
            s.id, s.sequence,
            s.bgt_feature_type, s.bgt_type, s.bgt_subtype, s.beheerder,
            s.km_start, s.km_end, s.length_m,
            ST_LineInterpolatePoint(ST_Transform(s.geometry, 28992), 0.5) AS midpoint
        FROM public.segments s
        WHERE s.trace_id = p_trace_id
    )
    SELECT
        segs.id, segs.sequence,
        (SELECT parts.part_idx FROM parts
         ORDER BY ST_Distance(parts.geom, segs.midpoint) LIMIT 1)::integer,
        segs.bgt_feature_type, segs.bgt_type, segs.bgt_subtype, segs.beheerder,
        segs.km_start, segs.km_end, segs.length_m
    FROM segs
    ORDER BY segs.sequence;
$function$;