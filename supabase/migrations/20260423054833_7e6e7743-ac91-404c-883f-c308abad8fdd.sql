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
  WITH RECURSIVE base AS (
    SELECT (ST_Dump(ST_LineMerge(ST_Transform(geometry, 28992)))).geom AS g
    FROM traces WHERE id = p_trace_id
  ),
  numbered AS (
    SELECT row_number() OVER () AS rn, g, ST_Length(g)::numeric AS len_m,
           ST_StartPoint(g) AS sp, ST_EndPoint(g) AS ep
    FROM base
    WHERE ST_GeometryType(g) = 'ST_LineString'
  ),
  walk AS (
    SELECT rn, g, len_m, sp, ep,
           1 AS group_id,
           len_m AS acc_len,
           ep AS group_end
    FROM numbered WHERE rn = 1
    UNION ALL
    SELECT n.rn, n.g, n.len_m, n.sp, n.ep,
      CASE
        WHEN ST_Distance(w.group_end, n.sp) > 2 THEN w.group_id + 1
        WHEN (w.acc_len + n.len_m) > 500 AND w.acc_len >= 200 THEN w.group_id + 1
        ELSE w.group_id
      END,
      CASE
        WHEN ST_Distance(w.group_end, n.sp) > 2 THEN n.len_m
        WHEN (w.acc_len + n.len_m) > 500 AND w.acc_len >= 200 THEN n.len_m
        ELSE w.acc_len + n.len_m
      END,
      n.ep
    FROM walk w
    JOIN numbered n ON n.rn = w.rn + 1
  ),
  grouped AS (
    SELECT group_id,
           ST_LineMerge(ST_Collect(g ORDER BY rn)) AS merged_geom,
           SUM(len_m) AS total_len,
           MIN(rn) AS first_rn
    FROM walk
    GROUP BY group_id
  ),
  ordered AS (
    SELECT (ROW_NUMBER() OVER (ORDER BY first_rn))::int - 1 AS pidx,
           merged_geom AS geom_28992,
           total_len::numeric AS len_m
    FROM grouped
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