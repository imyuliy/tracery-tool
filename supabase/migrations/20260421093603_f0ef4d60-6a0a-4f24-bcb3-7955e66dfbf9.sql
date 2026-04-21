-- ============================================================================
-- De Tracémolen — gebundelde migraties 001-008 + seed (v2)
-- Bron: /backend/migrations/ op GitHub (canonieke locatie, principe #7)
-- v2-fix: auth.current_org_id() → public.current_org_id() (schema-prefix swap)
-- ============================================================================

-- === Extensions ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- === Organisaties & user profiles ==========================================
CREATE TABLE organizations (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            text NOT NULL,
    slug            text UNIQUE NOT NULL,
    plan            text DEFAULT 'trial'
                        CHECK (plan IN ('trial','pro','enterprise')),
    settings        jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE TABLE user_profiles (
    id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    org_id          uuid REFERENCES organizations ON DELETE RESTRICT,
    full_name       text,
    role            text DEFAULT 'engineer'
                        CHECK (role IN ('admin','engineer','reviewer','viewer')),
    avatar_url      text,
    created_at      timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, full_name)
    VALUES (new.id, new.raw_user_meta_data->>'full_name');
    RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM public.user_profiles WHERE id = auth.uid();
$$;

-- === Projects ==============================================================
CREATE TABLE projects (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
    name            text NOT NULL,
    client          text,
    perceel         text,
    bto_reference   text,
    scope_description text,
    budget_plafond_eur numeric(12,2),
    planning_plafond_weken int,
    description     text,
    status          text DEFAULT 'draft'
                        CHECK (status IN ('draft','analyzing','review','ready','archived')),
    bbox            geometry(Polygon, 28992),
    total_length_m  numeric(10,2),
    settings        jsonb DEFAULT '{}'::jsonb,
    created_by      uuid REFERENCES user_profiles,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_status ON projects(status) WHERE status != 'archived';
CREATE INDEX idx_projects_bbox_gist ON projects USING GIST(bbox);
CREATE INDEX idx_projects_bto ON projects(bto_reference) WHERE bto_reference IS NOT NULL;

-- === Traces ================================================================
CREATE TABLE traces (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      uuid NOT NULL REFERENCES projects ON DELETE CASCADE,
    variant         text NOT NULL,
    variant_label   text,
    source_format   text CHECK (source_format IN ('shp','kml','kmz','geojson','gpx','dwg','dxf','zip')),
    geometry        geometry(LineString, 28992) NOT NULL,
    length_m        numeric(10,2) GENERATED ALWAYS AS (ST_Length(geometry)) STORED,
    source_file     text,
    parameter_version_used int,
    peildatum       date DEFAULT CURRENT_DATE,
    analysis_status text DEFAULT 'pending'
                        CHECK (analysis_status IN ('pending','running','done','failed')),
    analysis_error  text,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (project_id, variant)
);

CREATE INDEX idx_traces_project ON traces(project_id);
CREATE INDEX idx_traces_geometry_gist ON traces USING GIST(geometry);

-- === Segments ==============================================================
CREATE TABLE segments (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id                uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    sequence                integer NOT NULL,
    km_start                numeric(8,3) NOT NULL,
    km_end                  numeric(8,3) NOT NULL,
    length_m                numeric(10,2) NOT NULL,
    bgt_type                text NOT NULL,
    bgt_subtype             text,
    bgt_fysiek_voorkomen    text,
    bgt_lokaal_id           text,
    bgt_niveau              integer DEFAULT 0,
    beheerder               text,
    beheerder_type          text,
    aanbevolen_techniek     text,
    warnings                jsonb DEFAULT '[]'::jsonb,
    impact                  jsonb DEFAULT '{}'::jsonb,
    geometry                geometry(LineString, 28992) NOT NULL,
    created_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_segments_trace ON segments(trace_id, sequence);
CREATE INDEX idx_segments_geometry_gist ON segments USING GIST(geometry);
CREATE INDEX idx_segments_bgt_type ON segments(bgt_type);
CREATE INDEX idx_segments_beheerder ON segments(beheerder);

-- === RLS migratie 002 ======================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own org"
    ON organizations FOR SELECT
    USING (id = public.current_org_id());

CREATE POLICY "users see own profile and org members"
    ON user_profiles FOR SELECT
    USING (id = auth.uid() OR org_id = public.current_org_id());

CREATE POLICY "users update own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "users see own org projects"
    ON projects FOR SELECT
    USING (org_id = public.current_org_id());

CREATE POLICY "engineers create projects in own org"
    ON projects FOR INSERT
    WITH CHECK (
        org_id = public.current_org_id()
        AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid()
              AND role IN ('admin','engineer')
        )
    );

CREATE POLICY "engineers update own org projects"
    ON projects FOR UPDATE
    USING (org_id = public.current_org_id());

CREATE POLICY "admins delete own org projects"
    ON projects FOR DELETE
    USING (
        org_id = public.current_org_id()
        AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "access traces via project"
    ON traces FOR ALL
    USING (project_id IN (
        SELECT id FROM projects WHERE org_id = public.current_org_id()
    ));

CREATE POLICY "access segments via trace"
    ON segments FOR ALL
    USING (trace_id IN (
        SELECT t.id FROM traces t
        JOIN projects p ON p.id = t.project_id
        WHERE p.org_id = public.current_org_id()
    ));

-- === Views migratie 003 ====================================================
CREATE OR REPLACE VIEW v_project_summary AS
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

CREATE OR REPLACE VIEW v_segment_detail AS
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

-- === Migratie 004: design_parameters =======================================
CREATE TABLE design_parameters (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id        uuid NOT NULL REFERENCES projects ON DELETE CASCADE,
    version           int  NOT NULL,
    is_active         boolean DEFAULT true,
    kabeltype                    text NOT NULL,
    sleufbreedte_m               numeric(4,2) NOT NULL CHECK (sleufbreedte_m > 0),
    sleufdiepte_m                numeric(4,2) NOT NULL CHECK (sleufdiepte_m > 0),
    werkstrook_m                 numeric(4,2) NOT NULL CHECK (werkstrook_m > 0),
    min_dekking_m                numeric(3,2) NOT NULL CHECK (min_dekking_m > 0),
    min_bocht_radius_m           numeric(5,2) NOT NULL CHECK (min_bocht_radius_m > 0),
    min_afstand_derden_m         numeric(3,2) NOT NULL CHECK (min_afstand_derden_m >= 0),
    min_vertic_afst_kruising_m   numeric(3,2) NOT NULL CHECK (min_vertic_afst_kruising_m >= 0),
    spanningsniveau_kv           int  NOT NULL CHECK (spanningsniveau_kv IN (10, 20, 50)),
    peildatum                    date NOT NULL,
    geplande_start               date,
    geplande_eind                date,
    nao_tarieflijst_versie       text NOT NULL,
    opslagfactor                 numeric(5,3) NOT NULL DEFAULT 1.000
                                   CHECK (opslagfactor BETWEEN 1.000 AND 1.500),
    risicotolerantie             text NOT NULL
                                   CHECK (risicotolerantie IN ('laag','middel','hoog')),
    sources                      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                   timestamptz DEFAULT now(),
    created_by                   uuid REFERENCES user_profiles,
    UNIQUE (project_id, version)
);

CREATE INDEX idx_params_project_active
    ON design_parameters(project_id) WHERE is_active = true;

CREATE RULE no_update_design_parameters AS
    ON UPDATE TO design_parameters DO INSTEAD NOTHING;
CREATE RULE no_delete_design_parameters AS
    ON DELETE TO design_parameters DO INSTEAD NOTHING;

ALTER TABLE design_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access params via project"
    ON design_parameters FOR ALL
    USING (project_id IN (
        SELECT id FROM projects WHERE org_id = public.current_org_id()
    ));

ALTER TABLE traces
    ADD CONSTRAINT fk_param_version
    FOREIGN KEY (project_id, parameter_version_used)
    REFERENCES design_parameters(project_id, version)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.trigger_reanalyze_on_params()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE design_parameters
    SET is_active = false
    WHERE project_id = NEW.project_id
      AND version < NEW.version
      AND is_active = true;

    UPDATE traces
    SET analysis_status = 'pending',
        analysis_error = 'Parameters gewijzigd naar v' || NEW.version
    WHERE project_id = NEW.project_id
      AND analysis_status IN ('done', 'failed');

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_parameters
    AFTER INSERT ON design_parameters
    FOR EACH ROW EXECUTE PROCEDURE public.trigger_reanalyze_on_params();

-- === Migratie 005: requirements RAG ========================================
CREATE TABLE requirements_documents (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          uuid NOT NULL REFERENCES organizations,
    client          text NOT NULL,
    project_id      uuid REFERENCES projects ON DELETE SET NULL,
    scope           text NOT NULL
                        CHECK (scope IN ('algemeen','raam','project','bestek')),
    title           text NOT NULL,
    version         text,
    document_type   text,
    valid_from      date,
    valid_to        date,
    storage_path    text NOT NULL,
    mime_type       text,
    page_count      int,
    parsed_at       timestamptz,
    parse_status    text DEFAULT 'pending'
                        CHECK (parse_status IN ('pending','parsed','failed')),
    parse_error     text,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_req_client_scope ON requirements_documents(client, scope);
CREATE INDEX idx_req_project ON requirements_documents(project_id)
    WHERE project_id IS NOT NULL;

CREATE TABLE requirements_chunks (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     uuid NOT NULL REFERENCES requirements_documents ON DELETE CASCADE,
    page_number     int,
    section_title   text,
    chunk_index     int NOT NULL,
    text            text NOT NULL,
    tokens          int,
    embedding       vector(1536),
    categorie       text CHECK (categorie IN (
        'diepte','materiaal','veiligheid','bestek','proces',
        'planning','veiligheid_NEN3140','algemeen'
    )),
    eis_id          text GENERATED ALWAYS AS ('EIS-' || chunk_index::text) STORED,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_chunks_document ON requirements_chunks(document_id);
CREATE INDEX idx_chunks_categorie ON requirements_chunks(categorie);
CREATE INDEX idx_chunks_embedding ON requirements_chunks
    USING hnsw (embedding vector_cosine_ops);

ALTER TABLE requirements_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access req-docs via org"
    ON requirements_documents FOR ALL
    USING (org_id = public.current_org_id());

CREATE POLICY "access req-chunks via document"
    ON requirements_chunks FOR ALL
    USING (document_id IN (
        SELECT id FROM requirements_documents WHERE org_id = public.current_org_id()
    ));

-- === Migratie 006: Liander BTO =============================================
CREATE TABLE klic_requests (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    klic_type       text CHECK (klic_type IN ('orientatie','regulier','calamiteit')),
    klic_reference  text,
    area            geometry(Polygon, 28992),
    status          text DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','received','processed','failed')),
    submitted_at    timestamptz,
    received_at     timestamptz,
    raw_response    jsonb,
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_klic_trace ON klic_requests(trace_id);

CREATE TABLE utilities (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    klic_request_id uuid REFERENCES klic_requests ON DELETE CASCADE,
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    medium          text NOT NULL,
    eigenaar        text NOT NULL,
    diameter_mm     integer,
    materiaal       text,
    diepte_m        numeric(5,2),
    geometry        geometry(Geometry, 28992),
    attributes      jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_utilities_trace ON utilities(trace_id);
CREATE INDEX idx_utilities_medium ON utilities(medium);
CREATE INDEX idx_utilities_eigenaar ON utilities(eigenaar);
CREATE INDEX idx_utilities_geometry_gist ON utilities USING GIST(geometry);

CREATE TABLE clashes (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    utility_id      uuid REFERENCES utilities ON DELETE SET NULL,
    segment_id      uuid REFERENCES segments ON DELETE SET NULL,
    km_position     numeric(8,3) NOT NULL,
    clash_type      text NOT NULL
                        CHECK (clash_type IN ('kruising','parallel','te_dichtbij')),
    min_distance_m  numeric(5,2),
    dekking_check   text CHECK (dekking_check IN ('ok','marginaal','niet_ok')),
    severity        text DEFAULT 'medium'
                        CHECK (severity IN ('low','medium','high','critical')),
    nen3140_klasse  text CHECK (nen3140_klasse IN (
        'spanningsloos_verplicht',
        'meldplicht_eigen_net',
        'keurmerk_personen_verplicht'
    )),
    geometry        geometry(Point, 28992) NOT NULL,
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_clashes_trace ON clashes(trace_id);
CREATE INDEX idx_clashes_severity ON clashes(severity)
    WHERE severity IN ('high','critical');

CREATE TABLE cadastral_parcels (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    brk_identifier  text NOT NULL,
    eigenaar        text,
    eigenaar_type   text,
    opstalrecht     boolean DEFAULT false,
    length_within_m numeric(10,2),
    geometry        geometry(Polygon, 28992) NOT NULL,
    contact_info    jsonb,
    notes           text,
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_parcels_trace ON cadastral_parcels(trace_id);
CREATE INDEX idx_parcels_type ON cadastral_parcels(eigenaar_type);

CREATE TABLE stakeholders (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    name            text NOT NULL,
    type            text NOT NULL,
    role            text,
    contact_email   text,
    contact_phone   text,
    contact_person  text,
    segment_count   integer,
    attributes      jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (trace_id, name, type)
);
CREATE INDEX idx_stakeholders_trace ON stakeholders(trace_id);

CREATE TABLE permits (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    permit_type     text NOT NULL,
    issuing_body    text NOT NULL,
    required        boolean DEFAULT true,
    status          text DEFAULT 'nodig'
                        CHECK (status IN ('nodig','aangevraagd','verleend','afgewezen','nvt')),
    lead_time_weeks integer,
    submitted_at    date,
    granted_at      date,
    reference       text,
    notes           text,
    geometry        geometry(Geometry, 28992),
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_permits_trace ON permits(trace_id);
CREATE INDEX idx_permits_status ON permits(status) WHERE status != 'verleend';

CREATE TABLE bestek_templates (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client            text NOT NULL,
    version           text NOT NULL,
    required_sections jsonb NOT NULL,
    optional_sections jsonb,
    created_at        timestamptz DEFAULT now(),
    UNIQUE (client, version)
);

ALTER TABLE klic_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE clashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadastral_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['klic_requests','utilities','clashes',
                           'cadastral_parcels','stakeholders','permits'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format(
            'CREATE POLICY "access %I via trace" ON %I FOR ALL
             USING (trace_id IN (
                SELECT tr.id FROM traces tr
                JOIN projects p ON p.id = tr.project_id
                WHERE p.org_id = public.current_org_id()))',
            t, t
        );
    END LOOP;
END $$;

ALTER TABLE bestek_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all authenticated users read bestek templates"
    ON bestek_templates FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- === Migratie 007: audit log + report_sections + exports + service_tokens ==
CREATE TABLE report_sections (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    report_type     text NOT NULL,
    section_number  text,
    section_title   text NOT NULL,
    content_md      text NOT NULL,
    sources         jsonb DEFAULT '{}'::jsonb,
    model           text,
    prompt_tokens   integer,
    completion_tokens integer,
    audit_hash      text NOT NULL,
    generated_at    timestamptz DEFAULT now(),
    edited_by_user  boolean DEFAULT false,
    user_edits      text,
    approved_by     uuid REFERENCES user_profiles,
    approved_at     timestamptz
);
CREATE INDEX idx_report_trace ON report_sections(trace_id, report_type);
CREATE INDEX idx_report_audit_hash ON report_sections(audit_hash);

ALTER TABLE report_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access report_sections via trace"
    ON report_sections FOR ALL
    USING (trace_id IN (
        SELECT tr.id FROM traces tr
        JOIN projects p ON p.id = tr.project_id
        WHERE p.org_id = public.current_org_id()
    ));

CREATE TABLE exports (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      uuid NOT NULL REFERENCES projects ON DELETE CASCADE,
    trace_id        uuid REFERENCES traces,
    export_type     text NOT NULL,
    storage_path    text NOT NULL,
    file_size_bytes bigint,
    manifest_hash   text,
    generated_by    uuid REFERENCES user_profiles,
    generated_at    timestamptz DEFAULT now(),
    expires_at      timestamptz
);
CREATE INDEX idx_exports_project ON exports(project_id, generated_at DESC);

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access exports via project"
    ON exports FOR ALL
    USING (project_id IN (
        SELECT id FROM projects WHERE org_id = public.current_org_id()
    ));

CREATE TABLE audit_log (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      uuid REFERENCES projects ON DELETE SET NULL,
    user_id         uuid REFERENCES user_profiles,
    service_token_id uuid,
    action          text NOT NULL,
    resource_type   text,
    resource_id     uuid,
    payload         jsonb DEFAULT '{}'::jsonb,
    ip_address      inet,
    user_agent      text,
    timestamp       timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_project ON audit_log(project_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp DESC);

CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own org audit"
    ON audit_log FOR SELECT
    USING (project_id IN (
        SELECT id FROM projects WHERE org_id = public.current_org_id()
    ));

CREATE TABLE service_tokens (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
    name            text NOT NULL,
    description     text,
    token_hash      text NOT NULL UNIQUE,
    scopes          text[] DEFAULT ARRAY['manifest:read'],
    last_used_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    created_by      uuid REFERENCES user_profiles,
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_service_tokens_org ON service_tokens(org_id);
CREATE INDEX idx_service_tokens_active ON service_tokens(id)
    WHERE revoked_at IS NULL;

ALTER TABLE service_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage own org service tokens"
    ON service_tokens FOR ALL
    USING (
        org_id = public.current_org_id()
        AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- === Migratie 008: stations ================================================
CREATE TABLE stations (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
    eigenaar        text NOT NULL,
    name            text NOT NULL,
    code            text,
    station_type    text NOT NULL CHECK (station_type IN (
        'MS_station','schakelstation','onderstation','klantstation'
    )),
    spanningsniveau_kv_primair   int NOT NULL,
    spanningsniveau_kv_secundair int,
    schakelinstallatie_merk      text,
    bouwjaar                     int,
    location                     geometry(Point, 28992) NOT NULL,
    adres                        text,
    attributes                   jsonb DEFAULT '{}'::jsonb,
    created_at                   timestamptz DEFAULT now()
);
CREATE INDEX idx_stations_org ON stations(org_id);
CREATE INDEX idx_stations_code ON stations(code) WHERE code IS NOT NULL;
CREATE INDEX idx_stations_location_gist ON stations USING GIST(location);

ALTER TABLE traces
    ADD COLUMN start_station_id uuid REFERENCES stations ON DELETE SET NULL,
    ADD COLUMN eind_station_id  uuid REFERENCES stations ON DELETE SET NULL;
CREATE INDEX idx_traces_start_station ON traces(start_station_id);
CREATE INDEX idx_traces_eind_station  ON traces(eind_station_id);

CREATE TABLE station_works (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    station_id      uuid NOT NULL REFERENCES stations ON DELETE RESTRICT,
    rol             text NOT NULL CHECK (rol IN ('start','eind')),
    categorie       text NOT NULL CHECK (categorie IN (
        'veld_nieuw','veld_aanpassen','kabeleindsluiting','trafo_werk',
        'beveiliging_automatisering','gebouwelijk','schakelen'
    )),
    omschrijving    text NOT NULL,
    geschatte_uren       numeric(5,1),
    geschatte_kosten_eur numeric(10,2),
    lead_time_weken      int,
    sta_code             text,
    vereist              boolean DEFAULT true,
    created_at           timestamptz DEFAULT now()
);
CREATE INDEX idx_station_works_trace ON station_works(trace_id);
CREATE INDEX idx_station_works_station ON station_works(station_id);
CREATE INDEX idx_station_works_categorie ON station_works(categorie);

CREATE TABLE switching_events (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        uuid NOT NULL REFERENCES traces ON DELETE CASCADE,
    station_id      uuid NOT NULL REFERENCES stations ON DELETE RESTRICT,
    event_type      text NOT NULL CHECK (event_type IN (
        'spanningsloos_maken','onder_spanning_brengen','herschakelen','noodschakeling'
    )),
    gepland_venster_start timestamptz,
    gepland_venster_eind  timestamptz,
    doorlooptijd_minuten  int,
    schakelbevoegdheid_vereist text CHECK (schakelbevoegdheid_vereist IN (
        'VIAG','BEI','ANSI','onbekend'
    )),
    n_min_1_impact  text CHECK (n_min_1_impact IN (
        'geen','acceptabel','klant_uit','niet_acceptabel'
    )),
    afgestemd_met   text,
    status          text DEFAULT 'concept' CHECK (status IN (
        'concept','afgestemd','goedgekeurd','uitgevoerd','afgeblazen'
    )),
    notes           text,
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_switching_trace ON switching_events(trace_id);
CREATE INDEX idx_switching_status ON switching_events(status)
    WHERE status != 'uitgevoerd';

ALTER TABLE design_parameters
    ADD COLUMN aansluitpunt_type_start text CHECK (aansluitpunt_type_start IN (
        'bestaand_veld','nieuw_veld','busbar_uitbreiding','klantaansluiting'
    )),
    ADD COLUMN aansluitpunt_type_eind  text CHECK (aansluitpunt_type_eind IN (
        'bestaand_veld','nieuw_veld','busbar_uitbreiding','klantaansluiting'
    )),
    ADD COLUMN n_min_1_eis text CHECK (n_min_1_eis IN ('geen','wenselijk','verplicht'));

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE switching_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access stations via org"
    ON stations FOR ALL
    USING (org_id = public.current_org_id());

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['station_works','switching_events'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format(
            'CREATE POLICY "access %I via trace" ON %I FOR ALL
             USING (trace_id IN (
                SELECT tr.id FROM traces tr
                JOIN projects p ON p.id = tr.project_id
                WHERE p.org_id = public.current_org_id()))',
            t, t
        );
    END LOOP;
END $$;

-- === Seed ==================================================================
INSERT INTO organizations (id, name, slug, plan)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Vayu Solutions (dev)',
    'vayu-dev',
    'trial'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO bestek_templates (client, version, required_sections)
VALUES (
    'Liander',
    '2025-H2',
    '[
        {"nr":"1.1","title":"Projectomschrijving","required":true},
        {"nr":"2.1","title":"Uitgangspunten en scope","required":true},
        {"nr":"3.1","title":"Trace op hoofdlijn","required":true},
        {"nr":"3.2","title":"Trace-omschrijving","required":true},
        {"nr":"3.3","title":"Dwarsprofiel en ondergrond","required":true},
        {"nr":"3.4","title":"Graaftechniek per segment","required":true},
        {"nr":"4.1","title":"Raakvlakken kabels en leidingen","required":true},
        {"nr":"4.2","title":"Kruisingen met water","required":true},
        {"nr":"5.1","title":"Benodigde vergunningen","required":true},
        {"nr":"6.1","title":"Stakeholders en beheerders","required":true},
        {"nr":"8.0","title":"Verkeersmaatregelen","required":true}
    ]'::jsonb
) ON CONFLICT (client, version) DO NOTHING;