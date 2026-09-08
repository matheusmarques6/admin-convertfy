-- Assinatura duplicada: fecha as três portas que criavam a segunda linha.
--
-- Sintoma relatado: vincular loja no perfil do cliente duplicava a
-- assinatura, e criar o onboarding às vezes duplicava também.
--
-- Medido em 08/09: TRÊS escritores gravam em `client_subscriptions` e
-- nenhum deles compartilha chave de idempotência com os outros.
--
--   1. POST /api/crm/deals/[id]/billing (fechamento da venda) — insere
--      SEM checar nada e SEM gravar `asaas_subscription_id`. É a origem
--      dos 5 pares medidos: Frederico (28/08 pelo onboarding + 31/08
--      pelo fechamento, R$ 10.000 nos dois), João Paulo (02/09 + 03/09,
--      R$ 3.500 nos dois), e as de Camila, Danilo e Thiago, que nascem
--      sem `asaas_subscription_id` e por isso NÃO são fundidas com a
--      assinatura do Asaas na tela — dois cards para uma assinatura só.
--   2. createOnboarding (onboarding-pipeline.service) — "existe? senão
--      insere" pelo par (client_id, asaas_subscription_id).
--   3. POST /api/client-subscriptions — o mesmo "existe? senão insere".
--
-- Os dois últimos já checam, mas checar sem UNIQUE perde a corrida: é
-- exatamente o caso de `invoices.asaas_id` (migration 20261119), onde
-- três escritores fazendo "existe? senão insere" duplicavam a fatura e
-- o `.single()` do sync passava a inserir uma terceira a cada rodada.
--
-- Aqui o índice é ainda mais necessário porque o `.maybeSingle()` dos
-- dois escritores ESTOURA quando já existe duplicata (PGRST116): uma
-- vez duplicado, vincular loja e criar onboarding falham para sempre,
-- e o remédio manual não é óbvio.

-- 1. A venda é a chave de idempotência do fechamento.
--
-- O valor NÃO serve: o JMJC tem duas assinaturas legítimas de R$ 3.500
-- (MRR 7.000) para três lojas Boxer Shop, e João Paulo tem duas de
-- R$ 3.500 para duas lojas. Reusar por valor faria a segunda venda não
-- gerar assinatura nenhuma — e receita que SOME é pior que receita
-- duplicada, porque a duplicada pelo menos aparece na tela.
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS source_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

COMMENT ON COLUMN client_subscriptions.source_deal_id IS
  'Venda que gerou esta assinatura (fechamento do negócio). Única por deal: reabrir o WonDealDialog reusa em vez de criar outra.';

-- Backfill: as assinaturas que o fechamento criou carregam o título do
-- negócio nas notas ('Gerada no fechamento do negócio "X"'). Só casa
-- quando o par (cliente, título) identifica UM negócio — vínculo errado
-- é pior que nenhum, porque faria o próximo fechamento reusar a
-- assinatura de outra venda.
UPDATE client_subscriptions s
SET source_deal_id = d.id
FROM deals d
WHERE s.source_deal_id IS NULL
  AND s.notes = 'Gerada no fechamento do negócio "' || d.title || '"'
  AND d.client_id = s.client_id
  AND (
    SELECT count(*) FROM deals d2
    WHERE d2.client_id = s.client_id AND d2.title = d.title
  ) = 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_subscriptions_source_deal
  ON client_subscriptions (source_deal_id)
  WHERE source_deal_id IS NOT NULL;

-- 2. O espelho local de uma assinatura do Asaas é UM.
--
-- Global, não por cliente: a assinatura do Asaas pertence a um cliente
-- só, e por (client_id, asaas_subscription_id) duas linhas de clientes
-- diferentes apontando para a mesma assinatura passariam — o que é
-- justamente o erro de vínculo que se quer impedir.
--
-- Verificado antes de criar: hoje há 0 duplicatas por este par, então o
-- índice entra sem limpeza.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_subscriptions_asaas
  ON client_subscriptions (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;
