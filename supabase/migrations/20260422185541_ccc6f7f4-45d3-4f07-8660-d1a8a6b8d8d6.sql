-- Sprint 4.5 — Migratie 020: segment_descriptions
-- Per-segment narrative + eisen-matches voor Brondocument v1.
-- v2-velden (ai_aandacht, ai_aandacht_reden, ai_voorgestelde_techniek)
-- worden nu al aangemaakt zodat Sprint 5 zonder schema-migratie kan starten.

CREATE TABLE IF NOT EXISTS public.segment_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES public.traces(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,

  -- v1: factuele beschrijving op basis van BGT + context
  narrative_md TEXT NOT NULL,
  context_summary TEXT,                 -- korte 1-zin samenvatting voor lijst-weergave

  -- Eisen-matching (Laag 1 regels + Laag 2 pgvector)
  eisen_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
                                        -- [{ eis_code, eistitel, score, reason, layer: 'rule'|'vector'|'both' }]

  -- Aandachtspunten (auto-detectie via view + AI-bevestiging)
  aandacht_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
                                        -- ['waterdeel','pand','kruising','ondiep']
  aandacht_reden TEXT,                  -- mens-leesbare reden (1 zin)

  -- v2-voorbereiding (NULL in v1, gevuld in Sprint 5)
  ai_aandacht BOOLEAN,
  ai_aandacht_reden TEXT,
  ai_voorgestelde_techniek TEXT,

  -- Audit
  model TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  generation_run_id UUID,               -- groepeert alle segments uit dezelfde run
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  UNIQUE (segment_id, generation_run_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_descriptions_trace
  ON public.segment_descriptions(trace_id);
CREATE INDEX IF NOT EXISTS idx_segment_descriptions_segment
  ON public.segment_descriptions(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_descriptions_run
  ON public.segment_descriptions(generation_run_id);
CREATE INDEX IF NOT EXISTS idx_segment_descriptions_trace_generated
  ON public.segment_descriptions(trace_id, generated_at DESC);

-- RLS: trace → project → org membership
ALTER TABLE public.segment_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segment_descriptions_select_org_member"
ON public.segment_descriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE t.id = segment_descriptions.trace_id
      AND up.org_id = p.org_id
  )
);

CREATE POLICY "segment_descriptions_insert_org_member"
ON public.segment_descriptions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE t.id = segment_descriptions.trace_id
      AND up.org_id = p.org_id
  )
);

CREATE POLICY "segment_descriptions_update_org_member"
ON public.segment_descriptions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE t.id = segment_descriptions.trace_id
      AND up.org_id = p.org_id
  )
);

CREATE POLICY "segment_descriptions_delete_org_member"
ON public.segment_descriptions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.traces t
    JOIN public.projects p ON p.id = t.project_id
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE t.id = segment_descriptions.trace_id
      AND up.org_id = p.org_id
  )
);

COMMENT ON TABLE public.segment_descriptions IS
  'Sprint 4.5: per-segment factuele narrative + eisen-matches + aandacht-flags voor Brondocument v1. v2-velden (ai_aandacht*) zijn voorbereid voor Sprint 5.';