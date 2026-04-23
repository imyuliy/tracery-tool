CREATE OR REPLACE FUNCTION public.trace_parts_for_trace(p_trace_id uuid)
RETURNS TABLE (
    part_idx integer,
    part_geom_28992 geometry(LineString, 28992),
    start_point_4326 geometry(Point, 4326),
    end_point_4326 geometry(Point, 4326),
    length_m numeric,
    start_km numeric,
    end_km numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH RECURSIVE
raw_parts AS (
    SELECT
        row_number() OVER (ORDER BY COALESCE((d).path[1], 1)) - 1 AS raw_idx,
        (d).geom::geometry(LineString, 28992) AS geom,
        ST_Length((d).geom)::numeric AS raw_len
    FROM (
        SELECT ST_Dump(ST_CollectionExtract(ST_Multi(geometry), 2)) AS d
        FROM public.traces
        WHERE id = p_trace_id
    ) src
),
split_parts AS (
    SELECT
        rp.raw_idx,
        piece_no - 1 AS split_idx,
        ST_LineSubstring(
            rp.geom,
            ((piece_no - 1)::numeric / cfg.piece_count::numeric)::double precision,
            (piece_no::numeric / cfg.piece_count::numeric)::double precision
        )::geometry(LineString, 28992) AS geom,
        ST_Length(
            ST_LineSubstring(
                rp.geom,
                ((piece_no - 1)::numeric / cfg.piece_count::numeric)::double precision,
                (piece_no::numeric / cfg.piece_count::numeric)::double precision
            )
        )::numeric AS len_m
    FROM raw_parts rp
    CROSS JOIN LATERAL (
        SELECT GREATEST(
            1,
            CASE
                WHEN rp.raw_len <= 500 THEN 1
                ELSE CEIL(rp.raw_len / 450.0)::integer
            END
        ) AS piece_count
    ) cfg
    CROSS JOIN LATERAL generate_series(1, cfg.piece_count) AS piece_no
),
ordered_pieces AS (
    SELECT
        row_number() OVER (ORDER BY raw_idx, split_idx) AS seq_no,
        raw_idx,
        split_idx,
        geom,
        len_m
    FROM split_parts
),
oriented AS (
    SELECT
        op.seq_no,
        op.raw_idx,
        op.split_idx,
        op.geom,
        op.len_m,
        ST_StartPoint(op.geom)::geometry(Point, 28992) AS start_pt,
        ST_EndPoint(op.geom)::geometry(Point, 28992) AS end_pt,
        1 AS chain_id
    FROM ordered_pieces op
    WHERE op.seq_no = 1

    UNION ALL

    SELECT
        op.seq_no,
        op.raw_idx,
        op.split_idx,
        CASE
            WHEN ST_Distance(prev.end_pt, ST_StartPoint(op.geom)) <= ST_Distance(prev.end_pt, ST_EndPoint(op.geom))
                THEN op.geom
            ELSE ST_Reverse(op.geom)::geometry(LineString, 28992)
        END AS geom,
        op.len_m,
        CASE
            WHEN ST_Distance(prev.end_pt, ST_StartPoint(op.geom)) <= ST_Distance(prev.end_pt, ST_EndPoint(op.geom))
                THEN ST_StartPoint(op.geom)::geometry(Point, 28992)
            ELSE ST_StartPoint(ST_Reverse(op.geom))::geometry(Point, 28992)
        END AS start_pt,
        CASE
            WHEN ST_Distance(prev.end_pt, ST_StartPoint(op.geom)) <= ST_Distance(prev.end_pt, ST_EndPoint(op.geom))
                THEN ST_EndPoint(op.geom)::geometry(Point, 28992)
            ELSE ST_EndPoint(ST_Reverse(op.geom))::geometry(Point, 28992)
        END AS end_pt,
        CASE
            WHEN LEAST(
                ST_Distance(prev.end_pt, ST_StartPoint(op.geom)),
                ST_Distance(prev.end_pt, ST_EndPoint(op.geom))
            ) <= 2
                THEN prev.chain_id
            ELSE prev.chain_id + 1
        END AS chain_id
    FROM oriented prev
    JOIN ordered_pieces op ON op.seq_no = prev.seq_no + 1
),
packed AS (
    SELECT
        o.seq_no,
        o.raw_idx,
        o.split_idx,
        o.geom,
        o.len_m,
        o.start_pt,
        o.end_pt,
        o.chain_id,
        1 AS group_id,
        o.len_m AS acc_len
    FROM oriented o
    WHERE o.seq_no = 1

    UNION ALL

    SELECT
        o.seq_no,
        o.raw_idx,
        o.split_idx,
        o.geom,
        o.len_m,
        o.start_pt,
        o.end_pt,
        o.chain_id,
        CASE
            WHEN o.chain_id <> p.chain_id THEN p.group_id + 1
            WHEN p.acc_len >= 400 AND (p.acc_len + o.len_m) > 500 THEN p.group_id + 1
            ELSE p.group_id
        END AS group_id,
        CASE
            WHEN o.chain_id <> p.chain_id THEN o.len_m
            WHEN p.acc_len >= 400 AND (p.acc_len + o.len_m) > 500 THEN o.len_m
            ELSE p.acc_len + o.len_m
        END AS acc_len
    FROM packed p
    JOIN oriented o ON o.seq_no = p.seq_no + 1
),
group_points AS (
    SELECT
        p.group_id,
        p.seq_no,
        (dp).path[1] AS point_idx,
        (dp).geom::geometry(Point, 28992) AS point_geom,
        p.len_m
    FROM packed p
    CROSS JOIN LATERAL ST_DumpPoints(p.geom) dp
),
grouped AS (
    SELECT
        group_id,
        ST_MakeLine(point_geom ORDER BY seq_no, point_idx)::geometry(LineString, 28992) AS geom,
        SUM(DISTINCT len_m) AS total_len_m
    FROM group_points
    GROUP BY group_id
),
numbered AS (
    SELECT
        row_number() OVER (ORDER BY group_id) - 1 AS part_idx,
        geom,
        total_len_m,
        COALESCE(
            SUM(total_len_m) OVER (
                ORDER BY group_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
        ) AS offset_m
    FROM grouped
)
SELECT
    n.part_idx::integer,
    n.geom,
    ST_Transform(ST_StartPoint(n.geom), 4326)::geometry(Point, 4326),
    ST_Transform(ST_EndPoint(n.geom), 4326)::geometry(Point, 4326),
    n.total_len_m,
    (n.offset_m / 1000.0)::numeric,
    ((n.offset_m + n.total_len_m) / 1000.0)::numeric
FROM numbered n
ORDER BY n.part_idx;
$$;

GRANT EXECUTE ON FUNCTION public.trace_parts_for_trace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.segments_with_part_idx(p_trace_id uuid)
RETURNS TABLE (
    segment_id uuid,
    sequence integer,
    part_idx integer,
    bgt_feature_type text,
    bgt_subtype text,
    length_m numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
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
        (
            SELECT parts.part_idx
            FROM parts
            ORDER BY ST_Distance(parts.geom, segs.midpoint)
            LIMIT 1
        )::integer AS part_idx,
        segs.bgt_feature_type,
        segs.bgt_subtype,
        segs.length_m
    FROM segs
    ORDER BY segs.sequence;
$$;

GRANT EXECUTE ON FUNCTION public.segments_with_part_idx(uuid) TO authenticated;