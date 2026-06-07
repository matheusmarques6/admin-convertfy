-- Backfill: corrige `needs_image` nos blocos hero já semeados.
--
-- Os welcome flows (e demais emails semeados por SQL) tiveram seus
-- `email_blocks` criados sem setar `needs_image`, caindo no DEFAULT false da
-- coluna. Como a fase 2 só gera imagem para blocos com `needs_image=true`
-- (phase2-runner: WHERE needs_image=true), o hero nunca recebia imagem de
-- fundo — o agente HTML montava o container de background com gradiente +
-- texto por cima, mas sem url() (placeholder cinza).
--
-- O hero é o bloco de imagem consistente em todas as blueprints (os demais
-- ficam needs_image:false). Corrigir o flag aqui destrava a geração da imagem
-- no próximo rerender da fase 2. Idempotente — só toca nos que ainda estão
-- false. A lógica de reconcileBlocksAdditive passa a backfillar o flag também,
-- evitando recorrência em novos seeds/reconciliações.

UPDATE email_blocks
SET needs_image = true
WHERE block_type = 'hero'
  AND needs_image = false;
