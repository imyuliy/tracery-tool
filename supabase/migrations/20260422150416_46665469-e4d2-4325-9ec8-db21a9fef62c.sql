-- 013_bgt_staging_multipolygon.sql
-- PDOK levert vlakken soms als Polygon, soms als MultiPolygon. De kolom
-- accepteerde alleen Polygon, waardoor ST_Multi() in de insert-functie crashte
-- met "Geometry type (MultiPolygon) does not match column type (Polygon)".
-- We promoveren de kolom naar MultiPolygon en converteren bestaande rijen.

ALTER TABLE public.bgt_features_staging
  ALTER COLUMN geometry TYPE geometry(MultiPolygon, 28992)
  USING ST_Multi(geometry);