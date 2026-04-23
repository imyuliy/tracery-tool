UPDATE product_catalog SET is_active = false WHERE code = 'trace_description';

INSERT INTO product_catalog (
  code, name, description, available_from_phase,
  is_active, sort_order, sprint
) VALUES (
  'brondocument',
  'Brondocument',
  'Per-trek narratief overzicht van BGT-raakvlakken, aandachtspunten en toepasselijke eisen. Bron voor Ontwerpnota, Materiaallijst en Begroting.',
  'VO_fase_1',
  true,
  1,
  'Sprint 4.5'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  sort_order = 1;