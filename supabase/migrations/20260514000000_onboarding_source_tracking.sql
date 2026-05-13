-- Onboarding source tracking — Bruno (CEO) pediu:
-- 1. Atrelar assinatura existente do cliente (nao recriar plano/mrr)
-- 2. Origem rica: canal (instagram/social_selling/indicacao/deal_won/etc),
--    quem indicou (FK cliente), pipeline CRM de origem
-- 3. Tudo pra alimentar dashboard comercial (origem dos leads/onboardings)

ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS subscription_id UUID
  REFERENCES client_subscriptions(id) ON DELETE SET NULL;

ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS source_channel TEXT;
-- Valores aceitos (sem enum pra deixar flexivel):
-- 'indicacao', 'deal_won', 'instagram', 'social_selling', 'paid_ads',
-- 'organic', 'event', 'partner', 'migration', 'manual', 'other'

ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS referred_by_client_id UUID
  REFERENCES clients(id) ON DELETE SET NULL;
-- Apontamento opcional: quem indicou (so faz sentido se source_channel='indicacao')

ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS source_pipeline_id UUID
  REFERENCES pipelines(id) ON DELETE SET NULL;
-- Apontamento opcional: qual pipeline CRM o lead estava antes de virar onboarding

ALTER TABLE onboardings ADD COLUMN IF NOT EXISTS source_notes TEXT;
-- Detalhes adicionais (ex: nome da campanha, hashtag de tracking, etc)

-- Indices pra relatorios
CREATE INDEX IF NOT EXISTS idx_onboardings_subscription
  ON onboardings(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onboardings_source_channel
  ON onboardings(source_channel) WHERE source_channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onboardings_referred_by
  ON onboardings(referred_by_client_id) WHERE referred_by_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onboardings_source_pipeline
  ON onboardings(source_pipeline_id) WHERE source_pipeline_id IS NOT NULL;

COMMENT ON COLUMN onboardings.subscription_id IS
  'FK pra client_subscriptions. Quando atrelada, mrr_value/plan vem dela em vez de manual.';
COMMENT ON COLUMN onboardings.source_channel IS
  'Canal de origem do onboarding (indicacao, deal_won, instagram, social_selling, paid_ads, organic, event, partner, migration, manual, other). Usado em relatorios comerciais.';
COMMENT ON COLUMN onboardings.referred_by_client_id IS
  'Cliente que indicou (quando source_channel=indicacao). Permite calcular indicacoes por cliente.';
COMMENT ON COLUMN onboardings.source_pipeline_id IS
  'Pipeline CRM de origem (quando o lead veio de outra pipeline antes). Permite metricas de conversao por pipeline.';
