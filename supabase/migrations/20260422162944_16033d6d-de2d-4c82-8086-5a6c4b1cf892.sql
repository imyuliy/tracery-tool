-- RPC die een MultiLineString WKT (in EPSG:4326) op een bestaande trace zet,
-- transformeert naar EPSG:28992 (RD New) en length_m berekent.
CREATE OR REPLACE FUNCTION public.set_trace_geometry_from_wkt_4326(
  p_trace_id uuid,
  p_wkt text
)
RETURNS TABLE (trace_id uuid, length_m numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom_28992 geometry;
  v_length numeric;
BEGIN
  -- Parse + transform
  v_geom_28992 := ST_Transform(ST_GeomFromText(p_wkt, 4326), 28992);

  IF v_geom_28992 IS NULL THEN
    RAISE EXCEPTION 'WKT kon niet worden geparsed';
  END IF;

  v_length := ST_Length(v_geom_28992);

  UPDATE public.traces
     SET geometry = v_geom_28992,
         length_m = v_length,
         analysis_status = 'pending',
         analysis_error = NULL
   WHERE id = p_trace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trace % niet gevonden of geen rechten', p_trace_id;
  END IF;

  RETURN QUERY SELECT p_trace_id, v_length;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_trace_geometry_from_wkt_4326(uuid, text) TO authenticated, service_role;