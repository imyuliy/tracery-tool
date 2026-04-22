-- Sprint 4.5 — Migratie 022: backfill legacy projects + eisenpakket NOT NULL
-- Stap 1: backfill — bestaande projecten zonder pakket koppelen aan Liander v1 2025.
WITH default_version AS (
  SELECT ev.id AS version_id
  FROM public.eisenpakket_versions ev
  JOIN public.eisenpakketten e ON e.id = ev.eisenpakket_id
  WHERE e.client = 'Liander' AND e.name = 'NuRijnland'
  ORDER BY ev.imported_at DESC NULLS LAST
  LIMIT 1
)
UPDATE public.projects p
SET eisenpakket_version_id = (SELECT version_id FROM default_version)
WHERE p.eisenpakket_version_id IS NULL
  AND EXISTS (SELECT 1 FROM default_version);

-- Stap 2: eisenpakket_version_id wordt verplicht voor nieuwe projecten.
-- Alleen toepassen als alle bestaande rows nu gevuld zijn.
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.projects WHERE eisenpakket_version_id IS NULL;

  IF null_count = 0 THEN
    ALTER TABLE public.projects
      ALTER COLUMN eisenpakket_version_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on projects.eisenpakket_version_id: % rows still NULL', null_count;
  END IF;
END $$;

COMMENT ON COLUMN public.projects.eisenpakket_version_id IS
  'Sprint 4.5: verplicht. Bepaalt welke eisen voor dit project gelden bij Brondocument-generatie.';