-- ════════════════════════════════════════════════════════════════════
-- Câmbio: histórico POR DIA
-- ════════════════════════════════════════════════════════════════════
--
-- O que existia: `exchange_rate_cache`, UMA linha (`key='latest'`) com
-- validade de 1 h, sobrescrita a cada busca. Serve para converter "agora"
-- e não guarda nada.
--
-- O efeito disso no dashboard: a receita de 90 dias de uma loja em EUR
-- era convertida INTEIRA pela cotação de hoje. Duas consequências:
--
--  1. **erro de valor** — o real oscila; o mês fechado convertido pela
--     cotação de hoje não é o que a loja faturou naqueles dias;
--  2. **o número não é reprodutível** — o MESMO período, aberto amanhã,
--     dá um total diferente. Relatório que muda sozinho não fecha com
--     nada e ninguém consegue auditar.
--
-- Esta tabela guarda a cotação de cada dia (uma linha por dia, ~1 KB),
-- para converter a receita de cada dia pela taxa DAQUELE dia.
--
-- Limite declarado: o provedor gratuito (open.er-api.com) não serve
-- histórico. Portanto o histórico começa no dia em que isto entrar no
-- ar — para trás, a conversão continua sendo pela cotação mais próxima
-- que tivermos, e o app DIZ que é aproximada em vez de fingir precisão.

CREATE TABLE IF NOT EXISTS exchange_rate_daily (
  -- Dia da cotação em UTC. PK: uma cotação por dia, idempotente.
  day DATE PRIMARY KEY,
  -- Sempre 'BRL' hoje. A coluna existe para o dia em que a casa
  -- consolidar em outra moeda — sem ela, "rates" seria ambíguo.
  base TEXT NOT NULL DEFAULT 'BRL',
  -- { "USD": 0.195077, "EUR": 0.167817, ... } = 1 BRL = X moeda.
  -- Guardamos no formato do provedor, cru: derivar na leitura é
  -- reversível, gravar já derivado esconde o que ele respondeu.
  rates JSONB NOT NULL,
  provider TEXT,
  -- Quando o PROVEDOR atualizou (≠ de quando nós buscamos). O feed
  -- gratuito atualiza uma vez por dia; sem este campo não dá para
  -- distinguir "cotação de hoje" de "cotação de ontem lida hoje".
  provider_updated_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE exchange_rate_daily IS
  'Cotacao por dia (1 BRL = X moeda). Existe para converter a receita de cada dia pela taxa daquele dia — a tabela exchange_rate_cache so guarda a cotacao corrente.';

-- Busca típica: "a taxa do dia D, ou a mais recente ANTES de D".
CREATE INDEX IF NOT EXISTS idx_exchange_rate_daily_day_desc
  ON exchange_rate_daily (day DESC);

ALTER TABLE exchange_rate_daily ENABLE ROW LEVEL SECURITY;

-- Cotação de moeda é dado público de referência — não pertence a org
-- nenhuma e não há nada a vazar. Ainda assim declara `TO authenticated`
-- (regra da casa): a anon key do browser não lê pelo /rest/v1.
DROP POLICY IF EXISTS "exchange_rate_daily_select" ON exchange_rate_daily;
CREATE POLICY "exchange_rate_daily_select" ON exchange_rate_daily
  FOR SELECT TO authenticated USING (true);

-- Escrita é só do service role (cron + serviço de câmbio), que bypassa RLS.
