CREATE OR REPLACE FUNCTION public.get_trace_map_data(p_trace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH tr AS (
    SELECT ST_AsGeoJSON(ST_Transform(geometry, 4326))::jsonb AS geom,
           ST_AsGeoJSON(ST_Transform(ST_Envelope(geometry), 4326))::jsonb AS bbox,
           id, start_station_id, eind_station_id
    FROM traces WHERE id = p_trace_id
  ),
  segs AS (
    SELECT jsonb_agg(jsonb_build_object(
      'type','Feature',
      'geometry', ST_AsGeoJSON(ST_Transform(geometry, 4326))::jsonb,
      'properties', jsonb_build_object(
         'sequence', sequence,
         'bgt_feature_type', bgt_feature_type,
         'bgt_type', bgt_type,
         'bgt_subtype', bgt_subtype,
         'bgt_lokaal_id', bgt_lokaal_id,
         'length_m', length_m
      )
    )) AS features
    FROM segments WHERE trace_id = p_trace_id AND bgt_lokaal_id IS NOT NULL
  ),
  sts AS (
    SELECT jsonb_agg(jsonb_build_object(
      'type','Feature',
      'geometry', ST_AsGeoJSON(ST_Transform(s.location, 4326))::jsonb,
      'properties', jsonb_build_object(
         'id', s.id, 'name', s.name, 'station_type', s.station_type,
         'role', CASE WHEN s.id = t.start_station_id THEN 'start'
                      WHEN s.id = t.eind_station_id  THEN 'eind' END
      )
    )) AS features
    FROM stations s
    JOIN tr t ON TRUE
    WHERE s.id = t.start_station_id OR s.id = t.eind_station_id
  )
  SELECT jsonb_build_object(
    'trace_geojson', (SELECT jsonb_build_object(
      'type','Feature','geometry', geom,
      'properties', jsonb_build_object('id', id)) FROM tr),
    'segments_geojson', jsonb_build_object(
      'type','FeatureCollection',
      'features', COALESCE((SELECT features FROM segs), '[]'::jsonb)),
    'stations_geojson', jsonb_build_object(
      'type','FeatureCollection',
      'features', COALESCE((SELECT features FROM sts), '[]'::jsonb)),
    'bbox_4326', (SELECT bbox FROM tr)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_trace_map_data(uuid) TO authenticated;