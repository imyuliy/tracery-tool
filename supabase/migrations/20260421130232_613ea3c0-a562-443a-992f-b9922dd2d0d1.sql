-- De Tracémolen — migratie 010
-- Eisenpakketten als backbone van projecten.

-- === 1. Eisenpakketten (catalog-niveau) ===================================
CREATE TABLE eisenpakketten (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
    client          text NOT NULL,
    name            text NOT NULL,
    description     text,
    created_at      timestamptz DEFAULT now(),
    created_by      uuid REFERENCES user_profiles,
    UNIQUE (org_id, client, name)
);

CREATE INDEX idx_eisenpakketten_org ON eisenpakketten(org_id);
CREATE INDEX idx_eisenpakketten_client ON eisenpakketten(client);

-- === 2. Eisenpakket-versies (immutable snapshots) =========================
CREATE TABLE eisenpakket_versions (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    eisenpakket_id      uuid NOT NULL REFERENCES eisenpakketten ON DELETE CASCADE,
    version_label       text NOT NULL,
    status              text DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
    source_file         text,
    source_file_hash    text,
    row_count           integer,
    imported_at         timestamptz DEFAULT now(),
    imported_by         uuid REFERENCES user_profiles,
    notes               text,
    UNIQUE (eisenpakket_id, version_label)
);

CREATE INDEX idx_eisenpakket_versions_pakket ON eisenpakket_versions(eisenpakket_id);
CREATE INDEX idx_eisenpakket_versions_active ON eisenpakket_versions(eisenpakket_id)
    WHERE status = 'active';

CREATE RULE no_update_active_version AS ON UPDATE TO eisenpakket_versions
    WHERE OLD.status = 'active'
      AND (NEW.eisenpakket_id IS DISTINCT FROM OLD.eisenpakket_id
        OR NEW.version_label IS DISTINCT FROM OLD.version_label
        OR NEW.source_file IS DISTINCT FROM OLD.source_file
        OR NEW.source_file_hash IS DISTINCT FROM OLD.source_file_hash
        OR NEW.row_count IS DISTINCT FROM OLD.row_count)
    DO INSTEAD NOTHING;

CREATE RULE no_delete_active_version AS ON DELETE TO eisenpakket_versions
    WHERE OLD.status = 'active'
    DO INSTEAD NOTHING;

-- === 3. Eisen =============================================================
CREATE TABLE eisen (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    eisenpakket_version_id  uuid NOT NULL REFERENCES eisenpakket_versions ON DELETE CASCADE,
    objecttype              text NOT NULL,
    eis_code                text NOT NULL,
    eistitel                text NOT NULL,
    eistekst                text NOT NULL,
    brondocument            text,
    bron_prefix             text,
    fase                    text,
    verantwoordelijke_rol   text,
    verificatiemethode      text,
    type_bewijsdocument     text,
    embedding               vector(1536),
    raw                     jsonb DEFAULT '{}'::jsonb,
    created_at              timestamptz DEFAULT now(),
    UNIQUE (eisenpakket_version_id, objecttype, eis_code)
);

CREATE INDEX idx_eisen_version ON eisen(eisenpakket_version_id);
CREATE INDEX idx_eisen_objecttype ON eisen(eisenpakket_version_id, objecttype);
CREATE INDEX idx_eisen_fase ON eisen(fase) WHERE fase IS NOT NULL;
CREATE INDEX idx_eisen_bron_prefix ON eisen(bron_prefix) WHERE bron_prefix IS NOT NULL;
CREATE INDEX idx_eisen_eis_code ON eisen(eis_code);

CREATE INDEX idx_eisen_embedding ON eisen
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- === 4. Projecten koppelen aan eisenpakket-versie =========================
ALTER TABLE projects
    ADD COLUMN eisenpakket_version_id uuid REFERENCES eisenpakket_versions(id);

CREATE INDEX idx_projects_eisenpakket_version ON projects(eisenpakket_version_id)
    WHERE eisenpakket_version_id IS NOT NULL;

COMMENT ON COLUMN projects.eisenpakket_version_id IS 'Eisen-backbone: immutable koppeling naar eisenpakket-versie. UI forceert verplichte selectie bij project-creatie. Voor bestaande Sprint 2-projecten mag NULL blijven tot ze gemigreerd zijn.';

CREATE OR REPLACE FUNCTION trg_projects_eisenpakket_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.eisenpakket_version_id IS NOT NULL
       AND NEW.eisenpakket_version_id IS DISTINCT FROM OLD.eisenpakket_version_id THEN
        RAISE EXCEPTION
            'eisenpakket_version_id is immutable op project %: kan niet wijzigen van % naar %',
            OLD.id, OLD.eisenpakket_version_id, NEW.eisenpakket_version_id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER projects_eisenpakket_immutable
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION trg_projects_eisenpakket_immutable();

-- === 5. Project-scope (welke objecttypen + fases) =========================
CREATE TABLE project_eisen_scope (
    project_id      uuid NOT NULL REFERENCES projects ON DELETE CASCADE,
    objecttype      text NOT NULL,
    fases           text[] NOT NULL DEFAULT ARRAY['Ontwerp','VO','DO','UO','Ontwerp modulaire bouwsteen']::text[],
    in_scope        boolean NOT NULL DEFAULT true,
    notes           text,
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (project_id, objecttype)
);

CREATE INDEX idx_project_eisen_scope_project ON project_eisen_scope(project_id)
    WHERE in_scope = true;

-- === 6. Coverage-view =====================================================
CREATE OR REPLACE VIEW v_eisen_coverage
    WITH (security_invoker = true) AS
SELECT
    rs.trace_id,
    rs.report_type,
    rs.section_number,
    rs.section_title,
    jsonb_array_length(COALESCE(rs.sources->'eisen','[]'::jsonb)) AS aantal_eisen_geciteerd,
    rs.sources->'eisen' AS eisen_refs,
    rs.generated_at,
    rs.approved_at
FROM report_sections rs;

-- === 7. RLS ===============================================================
ALTER TABLE eisenpakketten ENABLE ROW LEVEL SECURITY;
ALTER TABLE eisenpakket_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eisen ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_eisen_scope ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access eisenpakketten via org"
    ON eisenpakketten FOR ALL
    USING (org_id = public.current_org_id());

CREATE POLICY "access eisenpakket_versions via pakket"
    ON eisenpakket_versions FOR ALL
    USING (eisenpakket_id IN (
        SELECT id FROM eisenpakketten WHERE org_id = public.current_org_id()
    ));

CREATE POLICY "access eisen via version"
    ON eisen FOR ALL
    USING (eisenpakket_version_id IN (
        SELECT v.id FROM eisenpakket_versions v
        JOIN eisenpakketten p ON p.id = v.eisenpakket_id
        WHERE p.org_id = public.current_org_id()
    ));

CREATE POLICY "access project_eisen_scope via project"
    ON project_eisen_scope FOR ALL
    USING (project_id IN (
        SELECT id FROM projects WHERE org_id = public.current_org_id()
    ));

-- === 8. Helper-functie: applicable eisen voor een project =================
CREATE OR REPLACE FUNCTION public.eisen_for_project(p_project_id uuid)
RETURNS TABLE (
    eis_id                  uuid,
    objecttype              text,
    eis_code                text,
    eistitel                text,
    eistekst                text,
    brondocument            text,
    fase                    text,
    embedding               vector(1536)
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        e.id,
        e.objecttype,
        e.eis_code,
        e.eistitel,
        e.eistekst,
        e.brondocument,
        e.fase,
        e.embedding
    FROM eisen e
    JOIN projects p ON p.eisenpakket_version_id = e.eisenpakket_version_id
    JOIN project_eisen_scope ps
        ON ps.project_id = p.id
       AND ps.objecttype = e.objecttype
       AND ps.in_scope = true
       AND (e.fase IS NULL OR e.fase = ANY(ps.fases))
    WHERE p.id = p_project_id;
$$;

GRANT EXECUTE ON FUNCTION public.eisen_for_project(uuid) TO authenticated;

COMMENT ON FUNCTION public.eisen_for_project(uuid) IS 'Return alle eisen die van toepassing zijn voor een project, gefilterd op eisenpakket-versie, objecttype-scope en fase.';