-- ============================================================
-- Gestao de Carteira: layout state -> kanban
-- ============================================================
-- A pipeline foi seedada em 20260507 como layout='state' (state-board)
-- pra refletir que cada loja vive em UMA etapa. Mas visualmente o
-- state-board render colunas todas com a mesma cor pale-green (porque
-- o STATE_COLORS hardcoded em state-board.tsx so reconhece os nomes
-- ATIVO/EM_RISCO/etc, nao os nomes daqui — SAUDAVEL/ATENCAO/RISCO/...).
--
-- Visualmente fica feio: 6 colunas vazias e iguais, sem contraste.
--
-- Solucao: trocar pra layout='kanban' que segue o styling padrao
-- (igual Calls Mensais, Onboarding, Renovacao, etc.). A semantica
-- 'cada loja vive em UMA etapa' continua valida — basta nao criar
-- mais que 1 deal por (pipeline, store), o que o sync ja garante.
-- ============================================================

UPDATE pipelines
   SET layout = 'kanban'
 WHERE name = 'Gestao de Carteira'
   AND scope = 'cs';
