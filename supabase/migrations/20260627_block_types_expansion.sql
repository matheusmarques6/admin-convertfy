-- ============================================================
-- Block types expansion — Epic AE
--
-- Adiciona 9 novos tipos a `email_blocks.block_type` pra cobrir os
-- formatos de email que aparecem na lista do user (welcome 1-8 Ozoric):
--
--   header         — cabeçalho do email com logo
--   headline       — título isolado destacado (manchete)
--   features       — strip horizontal de features com ícones
--   social_proof   — contadores, ratings, badges de avaliação
--   testimonials   — cards de depoimento (autor + quote)
--   urgency        — bloco de escassez/expiração
--   comparison     — tabela comparativa (nós vs eles)
--   story          — card de história da marca com CTA interno
--   letter         — texto longo em formato carta pessoal
--
-- Os 10 tipos existentes (hero/text/coupon/products/footer/image/cta/
-- divider/spacer/social) continuam aceitos — apenas estendemos.
--
-- Idempotente: DROP IF EXISTS antes do ADD garante que rerodar a
-- migration não falha. Não impacta rows existentes (todas estão entre
-- os 10 originais).
--
-- Sem impacto na produção (Fase 2 LLM aceita qualquer string). Preview
-- interno (`renderEmailHtml`) recebe casos novos no commit que segue.
-- ============================================================

ALTER TABLE email_blocks
  DROP CONSTRAINT IF EXISTS email_blocks_block_type_check;

ALTER TABLE email_blocks
  ADD CONSTRAINT email_blocks_block_type_check
  CHECK (block_type IN (
    -- Tipos originais (Epic 8/9 Klaviyo workspace)
    'hero',
    'text',
    'coupon',
    'products',
    'footer',
    'image',
    'cta',
    'divider',
    'spacer',
    'social',
    -- Tipos novos (expansão Ozoric 2026-06)
    'header',
    'headline',
    'features',
    'social_proof',
    'testimonials',
    'urgency',
    'comparison',
    'story',
    'letter'
  ));
