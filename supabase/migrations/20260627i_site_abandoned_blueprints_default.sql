-- ============================================================
-- Site abandoned blueprints — composição padrão universal (1 email)
--
-- Define a estrutura `blocks` JSONB do email único do flow
-- site_abandoned como template default que toda loja nova herda via
-- `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de site abandonment do produto.
--
-- E1 — Site Abandoned (6 blocos): hero + coupon + products + features
-- (trust badges) + text + footer.
--
-- UPSERT (ON CONFLICT DO UPDATE) só toca os campos relevantes
-- (objective, messaging, subject_hint, blocks, updated_at) — preserva
-- image_brief, image_aspect, image_mode e image_overlay_reserve_bottom
-- se já tiverem sido setados em migrations anteriores.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — Site Abandoned (6 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'site_abandoned', 1,
  'Reengajar visitante que saiu do site sem interagir. Tom convidativo + incentivo via cupom.',
  'Hero com tom de \"sentimos sua falta\" + cupom + produtos + trust badges + texto de fechamento.',
  'Sentimos sua falta — volta a dar uma olhada',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero convidativo com produto ou lifestyle da marca","needs_image":true},
    {"type":"coupon","label":"Cupom","purpose":"Cupom incentivo pra voltar e fechar a compra","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Best-sellers ou produtos navegados/recomendados","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança (frete, garantia, troca)","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto de fechamento amigável + tom da marca","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();
