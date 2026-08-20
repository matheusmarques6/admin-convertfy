-- =============================================================
-- email_blocks.block_type: CHECK aprende o vocabulário da biblioteca
-- (ago/2026 — incidente "text_format travado" / Luxe Lift)
--
-- A biblioteca de componentes ativa usa os tipos hero|body|products|
-- reviews|footer, e o Blueprint casa variantes usando o block_type da
-- variante. O CHECK de email_blocks era de uma era anterior e NÃO
-- aceitava 'reviews' nem 'body'.
--
-- Cadeia do incidente: reconcileBlocksAdditive fazia DELETE dos blocos
-- e o INSERT novo violava o CHECK (23514) → blocos zerados; o dispatch
-- engolia o erro (warn) e mandava payload SEM blocos ao n8n; a fase 2
-- rodava com copy_merge slots_total=0 e o text_format recebia o
-- documento inteiro sem contrato — o modelo morria por guard/truncado/
-- timeout. Auto-perpetuante: cada nova tentativa repetia o ciclo.
--
-- Fix: CHECK vira a UNIÃO do vocabulário legado (linhas existentes
-- continuam válidas) + os tipos da biblioteca. O código ganhou, na
-- mesma leva, sanitização de tipo desconhecido e restore best-effort
-- quando o INSERT do reconcile falha.
-- =============================================================

alter table public.email_blocks
  drop constraint if exists email_blocks_block_type_check;

alter table public.email_blocks
  add constraint email_blocks_block_type_check
  check (block_type = any (array[
    -- vocabulário legado (linhas existentes)
    'hero'::text, 'text'::text, 'coupon'::text, 'products'::text,
    'footer'::text, 'image'::text, 'cta'::text, 'divider'::text,
    'spacer'::text, 'social'::text, 'header'::text, 'headline'::text,
    'features'::text, 'social_proof'::text, 'testimonials'::text,
    'urgency'::text, 'comparison'::text, 'story'::text, 'letter'::text,
    -- tipos da biblioteca de componentes (Curador/Blueprint)
    'body'::text, 'reviews'::text
  ]));
