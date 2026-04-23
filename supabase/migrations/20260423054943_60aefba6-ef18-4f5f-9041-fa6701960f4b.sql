CREATE OR REPLACE FUNCTION public.trace_parts_for_trace(p_trace_id uuid)
RETURNS TABLE(
  part_idx integer,
  part_geom_28992 geometry,
  start_point_4326 geometry,
  end_point_4326 geometry,
  length_m numeric,
  start_km numeric,
  end_km numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- 1. Originele geometrie naar 28992
  raw AS (
    SELECT ST_Transform(geometry, 28992) AS g
    FROM traces WHERE id = p_trace_id
  ),
  -- 2. Snap aan zichzelf met 5m tolerantie zodat bijna-rakende endpoints
  --    fysiek samenvallen, dan node-en en mergen.
  snapped AS (
    SELECT ST_LineMerge(ST_Node(ST_Snap(g, g, 5.0))) AS merged
    FROM raw
  ),
  -- 3. Dump tot losse aaneengesloten ketens
  base AS (
    SELECT (ST_Dump(merged)).geom AS g FROM snapped
  ),
  chains AS (
    SELECT row_number() OVER (ORDER BY ST_Length(g) DESC) AS chain_id,
           g AS chain_geom,
           ST_Length(g)::numeric AS chain_len
    FROM base
    WHERE ST_GeometryType(g) = 'ST_LineString' AND ST_Length(g) > 0
  ),
  -- 4. Lange ketens splitsen naar ~450m parts; korte blijven 1.
  chain_split AS (
    SELECT chain_id, chain_geom, chain_len,
           GREATEST(1, ROUND(chain_len / 450.0)::int) AS n_parts
    FROM chains
  ),
  parts_raw AS (
    SELECT cs.chain_id, gs.i AS sub_idx,
           ST_LineSubstring(cs.chain_geom,
             (gs.i - 1)::float / cs.n_parts,
             gs.i::float / cs.n_parts) AS part_geom,
           cs.chain_len / cs.n_parts AS part_len
    FROM chain_split cs
    CROSS JOIN LATERAL generate_series(1, cs.n_parts) AS gs(i)
  ),
  ordered AS (
    SELECT (ROW_NUMBER() OVER (ORDER BY chain_id, sub_idx))::int - 1 AS pidx,
           part_geom AS geom_28992,
           part_len::numeric AS len_m
    FROM parts_raw
  ),
  with_km AS (
    SELECT pidx, geom_28992, len_m,
      SUM(len_m) OVER (ORDER BY pidx ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_total
    FROM ordered
  )
  SELECT
    w.pidx, w.geom_28992,
    ST_Transform(ST_StartPoint(w.geom_28992), 4326),
    ST_Transform(ST_EndPoint(w.geom_28992), 4326),
    ROUND(w.len_m::numeric, 1),
    ROUND(COALESCE(w.prev_total, 0)::numeric / 1000.0, 3),
    ROUND((COALESCE(w.prev_total, 0) + w.len_m)::numeric / 1000.0, 3)
  FROM with_km w
  ORDER BY w.pidx;
END;
$$;