-- 014_segment_bgt_type_fallback.sql
-- segments.bgt_type is NOT NULL, maar sommige BGT-collecties leveren geen
-- 'functie'/'bgt_type' property (bv. pand, overigbouwwerk). Coalesce naar
-- feature_type zodat de insert niet meer crasht.

CREATE OR REPLACE FUNCTION public.segment_trace_by_bgt(p_trace_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count integer;
    v_trace_length numeric;
BEGIN
    SELECT ST_Length(geometry) INTO v_trace_length
    FROM traces WHERE id = p_trace_id;

    IF v_trace_length IS NULL OR v_trace_length = 0 THEN
        RAISE EXCEPTION 'Trace % heeft geen of nul-lengte geometry', p_trace_id;
    END IF;

    DELETE FROM segments
    WHERE trace_id = p_trace_id
      AND bgt_lokaal_id IS NOT NULL;

    WITH intersections AS (
        SELECT
            b.lokaal_id,
            b.feature_type,
            b.bgt_type,
            b.bgt_subtype,
            b.attributes,
            (ST_Dump(ST_Intersection(t.geometry, b.geometry))).geom AS geom_part
        FROM traces t
        JOIN bgt_features_staging b ON b.trace_id = t.id
        WHERE t.id = p_trace_id
          AND ST_Intersects(t.geometry, b.geometry)
    ),
    line_parts AS (
        SELECT
            i.*,
            ST_Length(i.geom_part) AS len_m,
            ST_LineLocatePoint(
                (SELECT geometry FROM traces WHERE id = p_trace_id),
                ST_StartPoint(i.geom_part)
            ) AS fraction_start
        FROM intersections i
        WHERE ST_GeometryType(i.geom_part) = 'ST_LineString'
          AND ST_Length(i.geom_part) > 0.01
    ),
    ordered AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY fraction_start) AS seq,
            *
        FROM line_parts
    )
    INSERT INTO segments (
        trace_id, sequence, geometry, length_m,
        km_start, km_end,
        bgt_type, bgt_subtype, bgt_lokaal_id, bgt_feature_type,
        bgt_attributes, bgt_fetched_at
    )
    SELECT
        p_trace_id, seq, geom_part, len_m,
        fraction_start * v_trace_length / 1000.0,
        (fraction_start * v_trace_length + len_m) / 1000.0,
        COALESCE(bgt_type, feature_type, 'onbekend'),
        bgt_subtype, lokaal_id, feature_type,
        attributes, now()
    FROM ordered;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;