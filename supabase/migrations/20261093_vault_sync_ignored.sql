-- =============================================================
-- `ignored` no vault_sync_runs — faxina do vault não é nota pulada.
--
-- A aba Conhecimento mostrava "Notas puladas no último sync (1) —
-- _INDEX.md — caminho fora do padrão do vault". Nenhuma nota tinha
-- falhado: o sync varre TODO .md sob a base e o classificador exige
-- {pasta}/{flow}/{arquivo}, então o índice do Obsidian (na raiz) caía em
-- skipped_invalid toda vez.
--
-- Esse card responde a "editei uma nota e não valeu". Listar nele um
-- arquivo que nunca seria nota treina a pessoa a ignorar o card — e aviso
-- que se ignora não é aviso. Agora a faxina (raiz da base, .obsidian/,
-- templates) sai do lote antes do download e cai AQUI: contada, visível
-- como linha discreta na tela, sem alerta.
--
-- Continua reportado como pulado o erro de arquivamento de verdade:
-- `estruturas/x.md` sem a pasta do flow, subpasta a mais, pasta com nome
-- errado. É para isso que o card existe.
-- =============================================================

ALTER TABLE public.vault_sync_runs
  ADD COLUMN IF NOT EXISTS ignored jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.vault_sync_runs.ignored IS
  'Arquivos .md que não são área de nota (índice do vault, .obsidian/, templates): ignorados de propósito, nunca alerta. Erro de arquivamento continua em skipped_invalid.';
