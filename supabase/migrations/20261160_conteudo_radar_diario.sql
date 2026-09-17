-- Radar editorial diário: a procedência de CADA assunto, não só do painel.
--
-- O rodapé de "Em alta" dizia se a busca na internet está configurada lendo o
-- ambiente AGORA. Com o painel alimentado por um botão isso bastava: a linha
-- e a leitura aconteciam no mesmo minuto. Com um cron diário deixa de bastar
-- — uma rodada de três dias atrás pode ter acontecido sem provedor de busca,
-- e o rodapé de hoje diria que ela teve fato externo.
--
-- `fonte = 'interno'` é esse caso: o assunto saiu do contexto da casa, sem
-- busca. Ele não tem `fonte_url` — e é exatamente igual, na tela, ao assunto
-- cujo link foi REMOVIDO por `verificarFontes` (o modelo citou uma URL que a
-- busca não serviu). Os dois pedem ações diferentes de quem lê, então a
-- coluna passa a distinguir.
--
-- A tabela está VAZIA em produção (0 linhas), então não há backfill: nenhuma
-- linha existente precisa ser reclassificada.

ALTER TABLE conteudo_trends
  DROP CONSTRAINT IF EXISTS conteudo_trends_fonte_check;

ALTER TABLE conteudo_trends
  ADD CONSTRAINT conteudo_trends_fonte_check
  CHECK (fonte IN ('web', 'manual', 'interno'));

COMMENT ON COLUMN conteudo_trends.fonte IS
  'Procedência: web = ConvertIA com busca na internet (link conferido contra o que a busca serviu); interno = rodou sem busca, do contexto da casa; manual = alguém digitou. NÃO existe fonte de API de trends aqui porque não existe essa integração.';

-- A varredura de validade filtra por (org, ativo) e ordena por gerado_em; o
-- índice existente começa por score, então serve o prefixo mas não a ordem.
-- Numa tabela de dezenas de linhas por org isso é irrelevante para o plano —
-- o índice existe para a leitura do PAINEL, que lê a rodada mais recente.
CREATE INDEX IF NOT EXISTS idx_conteudo_trends_rodada
  ON conteudo_trends(org_id, gerado_em DESC);
