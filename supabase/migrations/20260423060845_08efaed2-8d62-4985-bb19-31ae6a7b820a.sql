-- Sprint 4.7.1: Treks chronologisch ordenen langs tracé (op sequence van eerste segment)
-- en segment-mapping verbeteren zodat aangrenzende sequences bij elkaar blijven.

CREATE OR REPLACE FUNCTION public.trace_parts_for_trace(p_trace_id uuid)
 RETURNS TABLE(part_idx integer, part_geom_28992 geometry, start_point_4326 geometry, end_point_4326 geometry, length_m numeric, start_km numeric, end_km numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT (ST_Dump(ST_LineMerge(ST_Transform(geometry, 28992)))).geom AS g
    FROM traces WHERE id = p_trace_id
  ),
  chains AS (
    SELECT row_number() OVER (ORDER BY ST_Length(g) DESC) AS cid,
           g, ST_Length(g)::numeric AS len_m
    FROM base
    WHERE ST_GeometryType(g) = 'ST_LineString' AND ST_Length(g) > 1
  ),
  chain_split AS (
    SELECT cid, g, len_m,
           GREATEST(1, ROUND(len_m / 450.0)::int) AS n_parts
    FROM chains
  ),
  parts_raw AS (
    SELECT cs.cid, gs.i AS sub_idx,
           ST_LineSubstring(cs.g,
             (gs.i - 1)::float / cs.n_parts,
             gs.i::float / cs.n_parts) AS part_geom,
           cs.len_m / cs.n_parts AS part_len
    FROM chain_split cs
    CROSS JOIN LATERAL generate_series(1, cs.n_parts) AS gs(i)
  ),
  -- Bepaal voor elke trek de minimale sequence van segmenten die het dichtst bij liggen.
  -- Dit ordent treks chronologisch langs het tracé (KML-volgorde).
  parts_with_seq AS (
    SELECT
      pr.cid, pr.sub_idx, pr.part_geom, pr.part_len,
      COALESCE((
        SELECT MIN(s.sequence)
        FROM segments s
        WHERE s.trace_id = p_trace_id
          AND ST_DWithin(s.geometry, ST_Transform(pr.part_geom, 4326), 0.0005)
      ), 999999) AS min_seq
    FROM parts_raw pr
  ),
  ordered AS (
    SELECT (ROW_NUMBER() OVER (ORDER BY min_seq, cid, sub_idx))::int - 1 AS pidx,
           part_geom AS geom_28992,
           part_len::numeric AS len_m
    FROM parts_with_seq
  ),
  with_km AS (
    SELECT pidx, geom_28992, len_m,
      SUM(len_m) OVER (ORDER BY pidx ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_total
    FROM ordered
  )
  SELECT w.pidx, w.geom_28992,
    ST_Transform(ST_StartPoint(w.geom_28992), 4326),
    ST_Transform(ST_EndPoint(w.geom_28992), 4326),
    ROUND(w.len_m::numeric, 1),
    ROUND(COALESCE(w.prev_total, 0)::numeric / 1000.0, 3),
    ROUND((COALESCE(w.prev_total, 0) + w.len_m)::numeric / 1000.0, 3)
  FROM with_km w ORDER BY w.pidx;
END;
$function$;