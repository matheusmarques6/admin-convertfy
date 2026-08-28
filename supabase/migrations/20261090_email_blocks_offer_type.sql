-- =============================================================
-- 'offer' no CHECK de email_blocks.block_type.
--
-- A biblioteca tem 8 categorias (component-categories.ts): header, hero,
-- body, products, reviews, cta, offer, footer. A 20261074 acrescentou
-- 'body' e 'reviews' ao CHECK — no incidente Luxe Lift — e ESQUECEU
-- 'offer', a única que ficou de fora.
--
-- Consequência, medida no Welcome 1 da InnovaBay (28/08): todo bloco de
-- oferta nascia com block_type='text' (sanitizeBlockType degrada o que o
-- CHECK não aceita). O `copy_merge` casava bloco↔contrato comparando o
-- tipo do banco com o do blueprint — 'text' ≠ 'offer' → bloco sem
-- contrato → 12 campos de copy nunca escritos no HTML. O email de uma
-- loja de medidor de energia saiu com o texto de exemplo da variante
-- ("bags that honor your elegance through genuine leather"), e o run
-- reportou 31/31 mergeados, sem_lugar: [].
--
-- Sem backfill das linhas históricas: `email_blocks.fields` nelas está
-- correto e, com o merge lendo o contrato da própria linha, o block_type
-- deixa de decidir qualquer coisa sobre a copy. O reconcile grava o valor
-- certo na próxima geração.
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
    -- as 8 categorias da biblioteca (Curador/Blueprint) — completas
    'body'::text, 'reviews'::text, 'offer'::text
  ]));
