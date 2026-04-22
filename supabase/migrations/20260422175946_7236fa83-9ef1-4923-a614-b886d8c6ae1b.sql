-- Fix: set_trace_geometry_from_wkt_4326 mag length_m niet meer updaten,
-- want traces.length_m is een GENERATED column (ST_Length(geometry)).
-- Eerdere versie crashte met "column length_m can only be updated to DEFAULT".
-- Tegelijk: ST_LineMerge probeert losse parts te verbinden; bij Liander-KML
-- (62 niet-verbonden placemarks) blijft het een MultiLineString — dat is OK,
-- segment_trace_by_bgt accepteert beide via ST_Dump.

CREATE OR REPLACE FUNCTION public.set_trace_geometry_from_wkt_4326(
    p_trace_id uuid,
    p_wkt text
)
RETURNS TABLE(trace_id uuid, length_m numeric, geom_type text, num_geoms integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_geom_4326 geometry;
    v_geom_28992 geometry;
BEGIN
    -- Parse WKT als 4326.
    v_geom_4326 := ST_GeomFromText(p_wkt, 4326);
    IF v_geom_4326 IS NULL THEN
        RAISE EXCEPTION 'Ongeldige WKT: kon niet parsen als geometry';
    END IF;

    -- Probeer aaneengesloten LineStrings te mergen; multi blijft multi als ze
    -- niet topologisch verbonden zijn (Liander: 62 losse secties).
    v_geom_4326 := ST_LineMerge(v_geom_4326);

    -- Transformeer naar Rijksdriehoek (28992) voor meter-nauwkeurige lengte.
    v_geom_28992 := ST_Transform(v_geom_4326, 28992);

    -- length_m is een GENERATED column — niet meer expliciet schrijven.
    UPDATE public.traces
       SET geometry = v_geom_28992,
           analysis_status = 'pending',
           analysis_error = NULL
     WHERE id = p_trace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trace % niet gevonden', p_trace_id;
    END IF;

    RETURN QUERY
    SELECT
        p_trace_id,
        ST_Length(v_geom_28992)::numeric,
        ST_GeometryType(v_geom_28992)::text,
        ST_NumGeometries(v_geom_28992)::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_trace_geometry_from_wkt_4326(uuid, text) TO authenticated;