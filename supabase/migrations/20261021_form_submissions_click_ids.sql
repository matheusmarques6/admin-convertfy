-- Click IDs de plataformas de ads nas respostas do formulário público.
-- gclid (Google Ads) e fbclid (Meta Ads) chegam na URL mesmo quando a
-- campanha não tem UTMs manuais — sem eles a origem paga fica invisível.
-- Idempotente: seguro re-rodar.

ALTER TABLE crm_form_submissions ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE crm_form_submissions ADD COLUMN IF NOT EXISTS fbclid TEXT;

COMMENT ON COLUMN crm_form_submissions.gclid IS 'Google Ads click ID capturado na URL da página do formulário/landing';
COMMENT ON COLUMN crm_form_submissions.fbclid IS 'Meta Ads click ID capturado na URL da página do formulário/landing';
