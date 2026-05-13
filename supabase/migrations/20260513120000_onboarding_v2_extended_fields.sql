-- Extende onboardings com campos comerciais coletados na criacao manual
-- ou herdados do deal.won (sprint final - inclui plano, MRR, WhatsApp,
-- idioma, vertical, source/origem do onboarding, expiracao do form token).

ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS mrr_value NUMERIC(10,2);
ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS client_whatsapp TEXT;
ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt-BR';
ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS vertical TEXT;
ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
  CHECK (source IN ('manual','deal_won','referral','migration'));
ALTER TABLE public.onboardings ADD COLUMN IF NOT EXISTS form_token_expires_at TIMESTAMPTZ
  DEFAULT (NOW() + INTERVAL '30 days');

COMMENT ON COLUMN public.onboardings.plan IS 'Plano contratado: Essencial / Pro / Premium ou custom';
COMMENT ON COLUMN public.onboardings.mrr_value IS 'Valor MRR mensal em BRL pra mostrar no card';
COMMENT ON COLUMN public.onboardings.client_whatsapp IS 'WhatsApp do cliente (E.164 ou nacional)';
COMMENT ON COLUMN public.onboardings.language IS 'Idioma principal da loja (pt-BR/en-US/es)';
COMMENT ON COLUMN public.onboardings.vertical IS 'Vertical/nicho (e-commerce/moda/suplementos/etc)';
COMMENT ON COLUMN public.onboardings.source IS 'Como esse onboarding entrou na pipeline';
COMMENT ON COLUMN public.onboardings.form_token_expires_at IS 'Token do form expira em (default 30 dias)';

UPDATE public.onboardings
SET form_token_expires_at = COALESCE(form_token_expires_at, NOW() + INTERVAL '30 days'),
    language = COALESCE(language, 'pt-BR'),
    source = COALESCE(source, 'manual')
WHERE form_token_expires_at IS NULL OR language IS NULL OR source IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboardings_source ON public.onboardings(source);
CREATE INDEX IF NOT EXISTS idx_onboardings_vertical ON public.onboardings(vertical) WHERE vertical IS NOT NULL;
