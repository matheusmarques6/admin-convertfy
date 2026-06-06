-- ============================================================
-- email_blocks.needs_image — Epic AE
--
-- Conecta o checkbox "imagem" (needs_image) do blueprint editor ao
-- pipeline real de geração de imagem (phase2-runner Step 1).
--
-- Antes desta coluna, o flag `needs_image` vivia apenas no blueprint
-- (email_blueprints.blocks JSONB) e em memória durante o seed — nunca
-- era persistido em email_blocks. O renderizador ativo selecionava
-- blocos por block_type IN ('hero','custom') hardcoded, ignorando o
-- checkbox. Com esta coluna, a seleção passa a ser por needs_image.
--
-- Idempotente. Sem backfill: DEFAULT false + sem regeneração automática
-- ⇒ emails já gerados não mudam.
-- ============================================================

ALTER TABLE email_blocks
  ADD COLUMN IF NOT EXISTS needs_image BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN email_blocks.needs_image IS
  'Se true, o pipeline gera uma imagem de fundo IA para este bloco (texto sobreposto pelo agente HTML). Derivado de email_blueprints.blocks[].needs_image no seed.';
