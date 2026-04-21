-- ============================================================================
-- Migratie 009 — Sprint 2 aanpassingen + security-fixes + storage-buckets
-- Synchroniseer naar /backend/migrations/009_sprint2_adjustments.sql (principe #7)
-- ============================================================================

-- === Sprint 2: geometry nullable ===========================================
-- In Sprint 2 kennen we de geometry nog niet vóór backend-analyse.
-- Placeholder LineStrings zouden de data besmetten; NULL is netter.
-- Wordt weer NOT NULL zodra de Python-backend de geometry vult.
ALTER TABLE traces ALTER COLUMN geometry DROP NOT NULL;

-- === Security: views met security_invoker ==================================
DROP VIEW IF EXISTS v_project_summary;
CREATE VIEW v_project_summary
WITH (security_invoker = true) AS
SELECT
    p.id,
    p.name,
    p.client,
    p.perceel,
    p.bto_reference,
    p.status,
    p.created_at,
    p.budget_plafond_eur,
    p.planning_plafond_weken,
    COUNT(DISTINCT t.id) AS variant_count,
    MAX(t.length_m) AS longest_variant_m
FROM projects p
LEFT JOIN traces t ON t.project_id = p.id
GROUP BY p.id;

DROP VIEW IF EXISTS v_segment_detail;
CREATE VIEW v_segment_detail
WITH (security_invoker = true) AS
SELECT
    s.*,
    LAG(s.id) OVER (PARTITION BY s.trace_id ORDER BY s.sequence) AS prev_segment_id,
    LEAD(s.id) OVER (PARTITION BY s.trace_id ORDER BY s.sequence) AS next_segment_id,
    CASE
        WHEN s.bgt_type = 'Waterdeel' THEN 'watergang'
        WHEN s.bgt_type = 'Wegdeel' AND s.bgt_subtype = 'rijbaan' THEN 'rijbaan'
        ELSE s.bgt_type
    END AS display_name
FROM segments s;

-- spatial_ref_sys RLS skip: Lovable migration-runner heeft geen owner-rechten
-- op die PostGIS-systeemtabel. Bekend Supabase issue, geen security-impact
-- (read-only EPSG-referentie-data).

-- === Storage buckets (private) =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('traces', 'traces', false, 52428800, NULL),
    ('requirements', 'requirements', false, 52428800, NULL),
    ('exports', 'exports', false, 104857600, NULL)
ON CONFLICT (id) DO NOTHING;

-- === Storage policies ======================================================
-- Pad-conventie: bucket/{project_id}/...
-- Toegang via project->org check.

CREATE POLICY "traces: read own org"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'traces'
        AND (storage.foldername(name))[1]::uuid IN (
            SELECT id FROM public.projects WHERE org_id = public.current_org_id()
        )
    );

CREATE POLICY "traces: insert own org"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'traces'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1]::uuid IN (
            SELECT id FROM public.projects WHERE org_id = public.current_org_id()
        )
    );

CREATE POLICY "traces: delete own org"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'traces'
        AND (storage.foldername(name))[1]::uuid IN (
            SELECT id FROM public.projects WHERE org_id = public.current_org_id()
        )
    );

CREATE POLICY "requirements: read authenticated"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'requirements'
        AND auth.uid() IS NOT NULL
    );

CREATE POLICY "requirements: insert authenticated"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'requirements'
        AND auth.uid() IS NOT NULL
    );

CREATE POLICY "exports: read own org"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'exports'
        AND (storage.foldername(name))[1]::uuid IN (
            SELECT id FROM public.projects WHERE org_id = public.current_org_id()
        )
    );

CREATE POLICY "exports: insert authenticated"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'exports'
        AND auth.uid() IS NOT NULL
    );