-- Sprint 4.5 — Migratie 021: v_segment_with_context
-- Aggregeert per segment alle context binnen 5m buffer + auto-aandacht-detectie.
-- Gebruikt security_invoker zodat RLS van segments/bgt_features_staging geldt.

CREATE OR REPLACE VIEW public.v_segment_with_context
WITH (security_invoker = true)
AS
WITH nearby AS (
  SELECT
    s.id AS segment_id,
    s.trace_id,
    s.sequence,
    s.km_start,
    s.km_end,
    s.length_m,
    s.bgt_type,
    s.bgt_subtype,
    s.bgt_fysiek_voorkomen,
    s.bgt_lokaal_id,
    s.beheerder,
    s.beheerder_type,
    s.aanbevolen_techniek,
    s.geometry,
    -- Buurfeatures binnen 5m, gegroepeerd per type
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'feature_type', b.feature_type,
          'lokaal_id', b.lokaal_id,
          'bgt_type', b.bgt_type
        )
      ) FILTER (WHERE b.id IS NOT NULL AND b.lokaal_id <> COALESCE(s.bgt_lokaal_id, '')),
      '[]'::jsonb
    ) AS nearby_features,
    COUNT(DISTINCT b.id) FILTER (WHERE b.feature_type = 'pand') AS pand_count,
    COUNT(DISTINCT b.id) FILTER (WHERE b.feature_type = 'waterdeel') AS waterdeel_count,
    COUNT(DISTINCT b.id) FILTER (WHERE b.feature_type IN ('wegdeel','ondersteunendwegdeel')
                                 AND (b.lokaal_id <> COALESCE(s.bgt_lokaal_id, ''))) AS wegkruising_count
  FROM public.segments s
  LEFT JOIN public.bgt_features_staging b
    ON b.trace_id = s.trace_id
   AND ST_DWithin(b.geometry, s.geometry, 5.0)
  GROUP BY s.id
),
flagged AS (
  SELECT
    n.*,
    -- Auto-aandacht-flags op basis van buur-tellingen + segment-type
    (
      CASE WHEN n.waterdeel_count > 0 OR n.bgt_type = 'Waterdeel' THEN ARRAY['waterdeel'] ELSE ARRAY[]::text[] END
      || CASE WHEN n.pand_count > 0 THEN ARRAY['pand_nabij'] ELSE ARRAY[]::text[] END
      || CASE WHEN n.wegkruising_count > 0 THEN ARRAY['kruising_weg'] ELSE ARRAY[]::text[] END
      || CASE WHEN n.bgt_type = 'OndersteunendWaterdeel' THEN ARRAY['oever'] ELSE ARRAY[]::text[] END
    ) AS aandacht_flags_auto
  FROM nearby n
)
SELECT
  f.segment_id AS id,
  f.trace_id,
  f.sequence,
  f.km_start,
  f.km_end,
  f.length_m,
  f.bgt_type,
  f.bgt_subtype,
  f.bgt_fysiek_voorkomen,
  f.bgt_lokaal_id,
  f.beheerder,
  f.beheerder_type,
  f.aanbevolen_techniek,
  f.geometry,
  f.nearby_features,
  f.pand_count,
  f.waterdeel_count,
  f.wegkruising_count,
  f.aandacht_flags_auto,
  -- Mens-leesbare aandacht-reden (voor in narrative-prompt)
  CASE
    WHEN array_length(f.aandacht_flags_auto, 1) IS NULL THEN NULL
    ELSE array_to_string(
      ARRAY(
        SELECT CASE flag
          WHEN 'waterdeel' THEN 'water aanwezig'
          WHEN 'pand_nabij' THEN format('%s pand(en) binnen 5m', f.pand_count)
          WHEN 'kruising_weg' THEN format('%s wegkruising(en)', f.wegkruising_count)
          WHEN 'oever' THEN 'oever-segment'
          ELSE flag
        END
        FROM unnest(f.aandacht_flags_auto) AS flag
      ),
      '; '
    )
  END AS aandacht_reden_auto,
  lag(f.segment_id) OVER (PARTITION BY f.trace_id ORDER BY f.sequence) AS prev_segment_id,
  lead(f.segment_id) OVER (PARTITION BY f.trace_id ORDER BY f.sequence) AS next_segment_id
FROM flagged f;

COMMENT ON VIEW public.v_segment_with_context IS
  'Sprint 4.5: per-segment context (buurfeatures, panden, water, kruisingen) + auto-aandacht-flags. Gebruikt door Brondocument v1 narrative-generator om hallucinaties te voorkomen.';