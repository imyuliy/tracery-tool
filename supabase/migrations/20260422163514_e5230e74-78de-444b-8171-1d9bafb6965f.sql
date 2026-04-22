DROP FUNCTION IF EXISTS public.set_trace_geometry_from_wkt_4326(uuid, text);

CREATE OR REPLACE FUNCTION public.set_trace_geometry_from_wkt_4326(
  p_trace_id uuid,
  p_wkt text
)
RETURNS TABLE (trace_id uuid, length_m numeric, geom_type text, num_geoms integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom_4326 geometry;
  v_geom_28992 geometry;
  v_merged geometry;
  v_length numeric;
  v_type text;
  v_n integer;
BEGIN
  v_geom_4326 := ST_GeomFromText(p_wkt, 4326);
  IF v_geom_4326 IS NULL THEN
    RAISE EXCEPTION 'WKT kon niet worden geparsed';
  END IF;

  v_geom_28992 := ST_Transform(v_geom_4326, 28992);

  BEGIN
    v_merged := ST_LineMerge(v_geom_28992);
    IF v_merged IS NOT NULL AND NOT ST_IsEmpty(v_merged) THEN
      v_geom_28992 := v_merged;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_length := ST_Length(v_geom_28992);
  v_type := ST_GeometryType(v_geom_28992);
  v_n := ST_NumGeometries(v_geom_28992);

  UPDATE public.traces
     SET geometry = v_geom_28992,
         length_m = v_length,
         analysis_status = 'pending',
         analysis_error = NULL
   WHERE id = p_trace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trace % niet gevonden of geen rechten', p_trace_id;
  END IF;

  RETURN QUERY SELECT p_trace_id, v_length, v_type, COALESCE(v_n, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_trace_geometry_from_wkt_4326(uuid, text) TO authenticated, service_role;