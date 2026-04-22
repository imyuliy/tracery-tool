-- 012_fix_staging_dedupe.sql
-- Defense-in-depth: zelfs als de caller per ongeluk duplicates per lokaal_id
-- meestuurt (bijv. dezelfde lokaal_id onder twee PDOK feature_types), mag de
-- INSERT niet meer crashen op ON CONFLICT DO UPDATE met
-- "command cannot affect row a second time". We dedupen daarom binnen de
-- functie zelf met DISTINCT ON (lokaal_id) in een CTE — first wins op input-
-- volgorde via WITH ORDINALITY.

CREATE OR REPLACE FUNCTION public.bgt_staging_insert_batch(
  p_trace_id uuid,
  p_features jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH raw AS (
    SELECT
      f.value AS feat,
      f.ordinality AS ord
    FROM jsonb_array_elements(p_features) WITH ORDINALITY AS f(value, ordinality)
  ),
  parsed AS (
    SELECT
      (feat->>'lokaal_id')        AS lokaal_id,
      (feat->>'feature_type')     AS feature_type,
      NULLIF(feat->>'bgt_type', '')    AS bgt_type,
      NULLIF(feat->>'bgt_subtype', '') AS bgt_subtype,
      (feat->>'geometry_wkt')     AS geometry_wkt,
      COALESCE(feat->'attributes', '{}'::jsonb) AS attributes,
      ord
    FROM raw
  ),
  deduped AS (
    SELECT DISTINCT ON (lokaal_id)
      lokaal_id, feature_type, bgt_type, bgt_subtype, geometry_wkt, attributes
    FROM parsed
    WHERE lokaal_id IS NOT NULL
      AND geometry_wkt IS NOT NULL
    ORDER BY lokaal_id, ord
  ),
  ins AS (
    INSERT INTO public.bgt_features_staging (
      trace_id, lokaal_id, feature_type, bgt_type, bgt_subtype, geometry, attributes
    )
    SELECT
      p_trace_id,
      d.lokaal_id,
      d.feature_type,
      d.bgt_type,
      d.bgt_subtype,
      ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(d.geometry_wkt, 28992)), 3)),
      d.attributes
    FROM deduped d
    ON CONFLICT (trace_id, lokaal_id) DO UPDATE
      SET feature_type = EXCLUDED.feature_type,
          bgt_type     = EXCLUDED.bgt_type,
          bgt_subtype  = EXCLUDED.bgt_subtype,
          geometry     = EXCLUDED.geometry,
          attributes   = EXCLUDED.attributes,
          fetched_at   = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN COALESCE(v_inserted, 0);
END;
$$;