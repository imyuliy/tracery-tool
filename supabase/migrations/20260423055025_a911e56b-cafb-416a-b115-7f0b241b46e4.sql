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
  WITH RECURSIVE
  -- 1. Originele lijnen → 28992 → losse aaneengesloten ketens
  base AS (
    SELECT (ST_Dump(ST_LineMerge(ST_Transform(geometry, 28992)))).geom AS g
    FROM traces WHERE id = p_trace_id
  ),
  chains AS (
    SELECT row_number() OVER (ORDER BY ST_Length(g) DESC) AS cid,
           g AS geom,
           ST_Length(g)::numeric AS len_m,
           ST_StartPoint(g) AS sp,
           ST_EndPoint(g) AS ep
    FROM base
    WHERE ST_GeometryType(g) = 'ST_LineString' AND ST_Length(g) > 0
  ),
  -- 2. Bepaal voor elke chain de "buurman" (volgende chain waarvan
  --    een endpoint binnen v_snap_tol van het einde van deze chain ligt
  --    en die nog niet als buurman van een andere chain is gekozen).
  --    Eenvoudige benadering: greedy nearest-neighbour zoeken via
  --    LATERAL ORDER BY distance.
  next_link AS (
    SELECT c1.cid AS from_cid,
           (SELECT c2.cid FROM chains c2
             WHERE c2.cid <> c1.cid
               AND ST_Distance(c1.ep, c2.sp) <= v_snap_tol
             ORDER BY ST_Distance(c1.ep, c2.sp) ASC
             LIMIT 1) AS to_cid
    FROM chains c1
  ),
  -- Zorg dat elke chain hooguit 1x als 'to_cid' verschijnt.
  next_link_unique AS (
    SELECT DISTINCT ON (to_cid) from_cid, to_cid
    FROM next_link
    WHERE to_cid IS NOT NULL
    ORDER BY to_cid, from_cid
  ),
  -- 3. Vind chain-clusters: chains zonder inkomende link zijn 'roots';
  --    we bouwen ketens van root → next → next → ...
  incoming AS (
    SELECT to_cid AS cid FROM next_link_unique
  ),
  roots AS (
    SELECT c.cid FROM chains c
    WHERE NOT EXISTS (SELECT 1 FROM incoming i WHERE i.cid = c.cid)
  ),
  walk AS (
    SELECT r.cid AS root_cid, r.cid AS cur_cid, 0 AS depth
    FROM roots r
    UNION ALL
    SELECT w.root_cid, nlu.to_cid, w.depth + 1
    FROM walk w
    JOIN next_link_unique nlu ON nlu.from_cid = w.cur_cid
  ),
  -- 4. Per cluster: order chains by depth; bin-pack op 400-500m.
  cluster_chains AS (
    SELECT w.root_cid, w.depth, c.cid, c.geom, c.len_m
    FROM walk w
    JOIN chains c ON c.cid = w.cur_cid
  ),
  -- 5. Greedy bin-pack binnen elke cluster
  --    via recursieve walk over depth.
  packed AS (
    SELECT root_cid, depth, cid, geom, len_m,
           1 AS bin_id,
           len_m AS bin_len
    FROM cluster_chains WHERE depth = 0
    UNION ALL
    SELECT cc.root_cid, cc.depth, cc.cid, cc.geom, cc.len_m,
      CASE
        WHEN (p.bin_len + cc.len_m) > 500 AND p.bin_len >= 200
          THEN p.bin_id + 1
        ELSE p.bin_id
      END,
      CASE
        WHEN (p.bin_len + cc.len_m) > 500 AND p.bin_len >= 200
          THEN cc.len_m
        ELSE p.bin_len + cc.len_m
      END
    FROM packed p
    JOIN cluster_chains cc
      ON cc.root_cid = p.root_cid AND cc.depth = p.depth + 1
  ),
  -- 6. Aggregate per (root_cid, bin_id) → 1 trek
  groups AS (
    SELECT root_cid, bin_id,
           ST_LineMerge(ST_Collect(geom ORDER BY depth)) AS geom,
           SUM(len_m)::numeric AS total_len,
           MIN(depth) AS first_depth
    FROM packed
    GROUP BY root_cid, bin_id
  ),
  ordered AS (
    SELECT (ROW_NUMBER() OVER (ORDER BY root_cid, bin_id))::int - 1 AS pidx,
           geom AS geom_28992,
           total_len AS len_m
    FROM groups
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