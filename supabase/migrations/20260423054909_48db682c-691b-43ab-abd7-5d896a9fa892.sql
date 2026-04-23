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
  WITH RECURSIVE
  -- 1. Per-trace lijnen mergen tot maximaal aaneengesloten ketens
  base AS (
    SELECT (ST_Dump(ST_LineMerge(ST_Transform(geometry, 28992)))).geom AS g
    FROM traces WHERE id = p_trace_id
  ),
  -- 2. Elke chain krijgt een chain_id; lengte berekenen
  chains AS (
    SELECT row_number() OVER (ORDER BY ST_Length(g) DESC) AS chain_id,
           g AS chain_geom,
           ST_Length(g)::numeric AS chain_len
    FROM base
    WHERE ST_GeometryType(g) = 'ST_LineString'
  ),
  -- 3. Lange ketens splitsen in 400-500m parts via ST_LineSubstring
  --    Korte ketens (<500m) worden 1 part.
  -- Bereken hoeveel parts elke chain nodig heeft (target ~450m)
  chain_split AS (
    SELECT
      chain_id,
      chain_geom,
      chain_len,
      GREATEST(1, ROUND(chain_len / 450.0)::int) AS n_parts
    FROM chains
  ),
  -- 4. Genereer parts via series
  parts_raw AS (
    SELECT
      cs.chain_id,
      gs.i AS sub_idx,
      cs.n_parts,
      ST_LineSubstring(
        cs.chain_geom,
        (gs.i - 1)::float / cs.n_parts,
        gs.i::float / cs.n_parts
      ) AS part_geom,
      cs.chain_len / cs.n_parts AS part_len
    FROM chain_split cs
    CROSS JOIN LATERAL generate_series(1, cs.n_parts) AS gs(i)
  ),
  ordered AS (
    SELECT
      (ROW_NUMBER() OVER (ORDER BY chain_id, sub_idx))::int - 1 AS pidx,
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
    w.pidx,
    w.geom_28992,
    ST_Transform(ST_StartPoint(w.geom_28992), 4326),
    ST_Transform(ST_EndPoint(w.geom_28992), 4326),
    ROUND(w.len_m::numeric, 1),
    ROUND(COALESCE(w.prev_total, 0)::numeric / 1000.0, 3),
    ROUND((COALESCE(w.prev_total, 0) + w.len_m)::numeric / 1000.0, 3)
  FROM with_km w
  ORDER BY w.pidx;
END;
$$;