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
DECLARE
  v_snap_tol numeric := 5.0;
BEGIN
  RETURN QUERY
  WITH
  base AS (
    SELECT (ST_Dump(ST_LineMerge(ST_Transform(geometry, 28992)))).geom AS g
    FROM traces WHERE id = p_trace_id
  ),
  chains AS (
    SELECT row_number() OVER (ORDER BY ST_Length(g) DESC) AS cid,
           g AS geom,
           ST_Length(g)::numeric AS len_m
    FROM base
    WHERE ST_GeometryType(g) = 'ST_LineString' AND ST_Length(g) > 0
  ),
  -- Cluster chains die binnen v_snap_tol van elkaar liggen
  clustered AS (
    SELECT cid, geom, len_m,
      ST_ClusterDBSCAN(geom, eps := v_snap_tol, minpoints := 1)
        OVER () AS cluster_id
    FROM chains
  ),
  -- Per cluster: totale lengte en geometrie samen
  cluster_agg AS (
    SELECT cluster_id,
           SUM(len_m)::numeric AS total_len,
           ST_LineMerge(ST_Collect(geom)) AS merged_geom
    FROM clustered
    GROUP BY cluster_id
  ),
  -- Voor elke cluster: bepaal aantal parts (~450m elk)
  -- en splits via ST_LineSubstring als het een single LineString is.
  -- Voor MultiLineString: dump per sub-line en split die.
  cluster_lines AS (
    SELECT
      ca.cluster_id,
      ca.total_len,
      (ST_Dump(ca.merged_geom)).geom AS sub_geom
    FROM cluster_agg ca
  ),
  cluster_lines_with_len AS (
    SELECT
      cluster_id,
      total_len AS cluster_total_len,
      sub_geom,
      ST_Length(sub_geom)::numeric AS sub_len,
      row_number() OVER (PARTITION BY cluster_id ORDER BY ST_Length(sub_geom) DESC) AS sub_idx
    FROM cluster_lines
    WHERE ST_GeometryType(sub_geom) = 'ST_LineString' AND ST_Length(sub_geom) > 0
  ),
  -- Splits elke sub_geom in n parts proportioneel aan eigen lengte
  split_targets AS (
    SELECT
      cluster_id, cluster_total_len, sub_geom, sub_len, sub_idx,
      GREATEST(1, ROUND(sub_len / 450.0)::int) AS n_parts
    FROM cluster_lines_with_len
  ),
  parts_raw AS (
    SELECT
      st.cluster_id,
      st.sub_idx,
      gs.i AS part_in_sub,
      ST_LineSubstring(
        st.sub_geom,
        (gs.i - 1)::float / st.n_parts,
        gs.i::float / st.n_parts
      ) AS part_geom,
      st.sub_len / st.n_parts AS part_len
    FROM split_targets st
    CROSS JOIN LATERAL generate_series(1, st.n_parts) AS gs(i)
  ),
  ordered AS (
    SELECT
      (ROW_NUMBER() OVER (ORDER BY cluster_id, sub_idx, part_in_sub))::int - 1 AS pidx,
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