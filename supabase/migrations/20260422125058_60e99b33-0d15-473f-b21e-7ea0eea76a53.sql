-- =========================================================================
-- 1. Project-fase-state
-- =========================================================================
ALTER TABLE projects
    ADD COLUMN phase_state text NOT NULL DEFAULT 'VO_fase_1'
        CHECK (phase_state IN (
            'VO_fase_1','VO_fase_2','VO_tollgate',
            'DO_fase_1','DO_fase_2','DO_tollgate',
            'UO_fase_1','UO_fase_2','UO_tollgate',
            'afgerond'
        ));

CREATE INDEX idx_projects_phase_state ON projects(phase_state);

COMMENT ON COLUMN projects.phase_state IS
    'Workflow-positie volgens Liander NuRijnland BTO-checklist. Promotie naar volgende staat gebeurt expliciet via UI-actie; elke promotie wordt gelogd in audit_log.';

CREATE OR REPLACE FUNCTION public.trg_projects_phase_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.phase_state IS DISTINCT FROM NEW.phase_state THEN
        INSERT INTO audit_log (
            project_id, user_id, action, resource_type, resource_id, payload
        ) VALUES (
            NEW.id,
            auth.uid(),
            'phase_promotion',
            'project',
            NEW.id,
            jsonb_build_object('from', OLD.phase_state, 'to', NEW.phase_state)
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER projects_phase_audit
    AFTER UPDATE OF phase_state ON projects
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_projects_phase_audit();

-- =========================================================================
-- 2. Segments-tabel uitbreiden voor BGT-herkomst
-- =========================================================================
ALTER TABLE segments
    ADD COLUMN IF NOT EXISTS bgt_feature_type text,
    ADD COLUMN IF NOT EXISTS bgt_attributes jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS bgt_fetched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_segments_bgt_lokaal_id
    ON segments(bgt_lokaal_id) WHERE bgt_lokaal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_segments_bgt_feature_type
    ON segments(bgt_feature_type) WHERE bgt_feature_type IS NOT NULL;

COMMENT ON COLUMN segments.bgt_lokaal_id IS
    'PDOK BGT lokaalID — natuurlijke sleutel voor citatie in AI-output.';

-- =========================================================================
-- 3. BGT-staging tabel (tijdelijke buffer voor PDOK-features)
-- =========================================================================
CREATE TABLE bgt_features_staging (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    lokaal_id       text NOT NULL,
    feature_type    text NOT NULL,
    bgt_type        text,
    bgt_subtype     text,
    geometry        geometry(Polygon, 28992) NOT NULL,
    attributes      jsonb DEFAULT '{}'::jsonb,
    fetched_at      timestamptz DEFAULT now(),
    UNIQUE (trace_id, lokaal_id)
);

CREATE INDEX idx_bgt_staging_trace ON bgt_features_staging(trace_id);
CREATE INDEX idx_bgt_staging_geom_gist ON bgt_features_staging USING GIST(geometry);
CREATE INDEX idx_bgt_staging_feature_type ON bgt_features_staging(feature_type);

ALTER TABLE bgt_features_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access bgt_staging via trace"
    ON bgt_features_staging FOR ALL
    USING (trace_id IN (
        SELECT tr.id FROM traces tr
        JOIN projects p ON p.id = tr.project_id
        WHERE p.org_id = public.current_org_id()
    ));

-- =========================================================================
-- 4. Hoofd-functie: segmenteer trace op basis van staging-features
-- =========================================================================
CREATE OR REPLACE FUNCTION public.segment_trace_by_bgt(p_trace_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_count integer;
    v_trace_length numeric;
BEGIN
    SELECT ST_Length(geometry) INTO v_trace_length
    FROM traces WHERE id = p_trace_id;

    IF v_trace_length IS NULL OR v_trace_length = 0 THEN
        RAISE EXCEPTION 'Trace % heeft geen of nul-lengte geometry', p_trace_id;
    END IF;

    DELETE FROM segments
    WHERE trace_id = p_trace_id
      AND bgt_lokaal_id IS NOT NULL;

    WITH intersections AS (
        SELECT
            b.lokaal_id,
            b.feature_type,
            b.bgt_type,
            b.bgt_subtype,
            b.attributes,
            (ST_Dump(ST_Intersection(t.geometry, b.geometry))).geom AS geom_part
        FROM traces t
        JOIN bgt_features_staging b ON b.trace_id = t.id
        WHERE t.id = p_trace_id
          AND ST_Intersects(t.geometry, b.geometry)
    ),
    line_parts AS (
        SELECT
            i.*,
            ST_Length(i.geom_part) AS len_m,
            ST_LineLocatePoint(
                (SELECT geometry FROM traces WHERE id = p_trace_id),
                ST_StartPoint(i.geom_part)
            ) AS fraction_start
        FROM intersections i
        WHERE ST_GeometryType(i.geom_part) = 'ST_LineString'
          AND ST_Length(i.geom_part) > 0.01
    ),
    ordered AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY fraction_start) AS seq,
            *
        FROM line_parts
    )
    INSERT INTO segments (
        trace_id, sequence, geometry, length_m,
        km_start, km_end,
        bgt_type, bgt_subtype, bgt_lokaal_id, bgt_feature_type,
        bgt_attributes, bgt_fetched_at
    )
    SELECT
        p_trace_id, seq, geom_part, len_m,
        fraction_start * v_trace_length / 1000.0,
        (fraction_start * v_trace_length + len_m) / 1000.0,
        bgt_type, bgt_subtype, lokaal_id, feature_type,
        attributes, now()
    FROM ordered;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.segment_trace_by_bgt(uuid) TO authenticated;

-- =========================================================================
-- 4b. Helper: bbox van trace in EPSG:28992
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trace_bbox_28992(
    p_trace_id uuid,
    p_buffer_m numeric DEFAULT 10
)
RETURNS TABLE (xmin numeric, ymin numeric, xmax numeric, ymax numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    WITH env AS (
        SELECT ST_Envelope(ST_Buffer(geometry, p_buffer_m)) AS env
        FROM traces WHERE id = p_trace_id
    )
    SELECT
        ST_XMin(env)::numeric,
        ST_YMin(env)::numeric,
        ST_XMax(env)::numeric,
        ST_YMax(env)::numeric
    FROM env;
$$;

GRANT EXECUTE ON FUNCTION public.trace_bbox_28992(uuid, numeric) TO authenticated;

-- =========================================================================
-- 4c. Helper: batched insert van BGT-features uit JSON-array
-- =========================================================================
CREATE OR REPLACE FUNCTION public.bgt_staging_insert_batch(
    p_trace_id uuid,
    p_features jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    INSERT INTO bgt_features_staging (
        trace_id, lokaal_id, feature_type, bgt_type, bgt_subtype,
        geometry, attributes
    )
    SELECT
        p_trace_id,
        (f->>'lokaal_id'),
        (f->>'feature_type'),
        (f->>'bgt_type'),
        (f->>'bgt_subtype'),
        ST_GeomFromText(f->>'geometry_wkt', 28992),
        COALESCE(f->'attributes', '{}'::jsonb)
    FROM jsonb_array_elements(p_features) AS f
    ON CONFLICT (trace_id, lokaal_id) DO UPDATE SET
        feature_type = EXCLUDED.feature_type,
        bgt_type = EXCLUDED.bgt_type,
        bgt_subtype = EXCLUDED.bgt_subtype,
        geometry = EXCLUDED.geometry,
        attributes = EXCLUDED.attributes,
        fetched_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bgt_staging_insert_batch(uuid, jsonb) TO authenticated;

-- =========================================================================
-- 5. Hulp-view: segmentatie-overzicht per trace
-- =========================================================================
CREATE OR REPLACE VIEW v_trace_bgt_summary
    WITH (security_invoker = true) AS
SELECT
    s.trace_id,
    s.bgt_feature_type,
    s.bgt_type,
    s.bgt_subtype,
    COUNT(*) AS segment_count,
    SUM(s.length_m) AS total_length_m,
    ROUND(
        (SUM(s.length_m) / NULLIF(SUM(SUM(s.length_m)) OVER (PARTITION BY s.trace_id), 0) * 100)::numeric,
        1
    ) AS pct_of_trace
FROM segments s
WHERE s.bgt_lokaal_id IS NOT NULL
GROUP BY s.trace_id, s.bgt_feature_type, s.bgt_type, s.bgt_subtype;

-- =========================================================================
-- 6. Producten-registry
-- =========================================================================
CREATE TABLE product_catalog (
    code            text PRIMARY KEY,
    name            text NOT NULL,
    description     text,
    available_from_phase text NOT NULL,
    is_active       boolean DEFAULT false,
    sort_order      integer NOT NULL,
    sprint          text
);

INSERT INTO product_catalog (code, name, description, available_from_phase, is_active, sort_order, sprint) VALUES
    ('trace_description',  'Tracé-omschrijving',        'BGT-gegronde narrative van wat het tracé kruist.',
     'VO_fase_1', true,  1, 'Sprint 4'),
    ('eisenverificatie',   'Eisenverificatie',          'Lijst toepasselijke eisen + voldoet/afwijking-status.',
     'VO_fase_1', false, 2, 'Sprint 5'),
    ('ontwerpnota_vo',     'Ontwerpnota VO',            'Consultancy-narrative voor Voorlopig Ontwerp.',
     'VO_fase_2', false, 3, 'Sprint 5'),
    ('materiaallijst',     'Materiaallijst',            'Materialen per segment: kabel, moffen, buizen.',
     'VO_fase_2', false, 4, 'Sprint 6'),
    ('blokschema',         'Blokschema',                'Schematisch een-lijn-schema start-eind.',
     'VO_fase_1', false, 5, 'Sprint 6'),
    ('begroting',          'Begroting & uitvoeringsraming', 'Kosten-calculatie per BGT-type + graaf/boor-methode.',
     'VO_fase_2', false, 6, 'Sprint 7'),
    ('ontwerpnota_do',     'Ontwerpnota DO',            'Uitgebreide DO-narrative incl. belastbaarheid + boorplan.',
     'DO_fase_2', false, 7, 'Sprint 7'),
    ('oplegnotitie',       'Oplegnotitie',              'Korte samenvatting + afwijkingen t.o.v. standaard.',
     'DO_fase_2', false, 8, 'Sprint 8'),
    ('design_manifest',    'Design-manifest (JSON)',    'Machine-leesbare state voor downstream-tools / AI-agents.',
     'VO_fase_1', false, 9, 'Sprint 8'),
    ('projectdossier_zip', 'Projectdossier (ZIP)',      'Alle artefacten + manifest + BGT + parameters in één bundle.',
     'VO_fase_2', false, 10, 'Sprint 9');

ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all authenticated users read product catalog"
    ON product_catalog FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- =========================================================================
-- 7. Project-artefacten
-- =========================================================================
CREATE TABLE project_artifacts (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          uuid NOT NULL REFERENCES projects ON DELETE CASCADE,
    trace_id            uuid REFERENCES traces ON DELETE SET NULL,
    product_code        text NOT NULL REFERENCES product_catalog(code),
    storage_path        text,
    file_size_bytes     bigint,
    mime_type           text,
    report_section_id   uuid REFERENCES report_sections ON DELETE SET NULL,
    phase_state_at_gen  text NOT NULL,
    model               text,
    parameters_version  integer,
    status              text DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'approved', 'superseded')),
    approved_by         uuid REFERENCES user_profiles,
    approved_at         timestamptz,
    superseded_by       uuid REFERENCES project_artifacts(id),
    generated_by        uuid REFERENCES user_profiles,
    generated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_artifacts_project ON project_artifacts(project_id, product_code);
CREATE INDEX idx_artifacts_trace ON project_artifacts(trace_id);
CREATE INDEX idx_artifacts_status ON project_artifacts(status) WHERE status != 'superseded';

ALTER TABLE project_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access artifacts via project"
    ON project_artifacts FOR ALL
    USING (project_id IN (
        SELECT id FROM projects WHERE org_id = public.current_org_id()
    ));

-- =========================================================================
-- 8. Seed: bestaande projecten op VO_fase_1
-- =========================================================================
UPDATE projects SET phase_state = 'VO_fase_1' WHERE phase_state IS NULL;