-- Sprint 4.5: add brondocument_v1 product code
INSERT INTO public.product_catalog (code, name, description, available_from_phase, sprint, sort_order, is_active)
VALUES (
  'brondocument_v1',
  'Brondocument v1',
  'Per-segment BGT-narratief met eisen-matching (regels + pgvector). Levert .docx met executive summary, per-km-tabellen en eisen cross-reference.',
  'VO_fase_1',
  'Sprint 4.5',
  15,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  sprint = EXCLUDED.sprint;