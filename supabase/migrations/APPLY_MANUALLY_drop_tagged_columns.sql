-- F7 do endereçamento sem placeholder (plano de 20/08) — DROP das colunas
-- do épico Taguedor.
--
-- Pré-condições (por isso é APPLY_MANUALLY, código primeiro / DROP por
-- último):
--   1. F2-F6 em produção: nenhum caminho lê html_tagged/tagging_status/
--      tagging_meta (o merge ancora pelo example do schema e pelos tokens
--      de atributo do HTML autorado).
--   2. Uma geração real pós-deploy confirmada OK (gate manual do plano).
--
-- Estado no banco no dia do corte: 0 variantes com tagging_status
-- 'approved' e 0 com html_tagged não-nulo relevante — as colunas nunca
-- chegaram a ser consumidas em produção; não há backup a fazer.
--
-- `email_blocks.fields` NÃO é tocado: `tag` residual dentro do jsonb é
-- simplesmente ignorado na leitura e o re-reconcile lazy (sameFields por
-- key/example) reescreve o snapshot na próxima geração de cada email.

alter table email_component_variants
  drop column if exists html_tagged,
  drop column if exists tagging_status,
  drop column if exists tagging_meta;
