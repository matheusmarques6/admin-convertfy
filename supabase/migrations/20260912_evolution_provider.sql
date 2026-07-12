-- ============================================================
-- Evolution API (Baileys) como segundo provider de WhatsApp
--
-- Adiciona 'evolution' ao CHECK de provider em crm_channels.
-- O restante do modelo é reaproveitado sem mudança:
--  - crm_webhook_events.source não tem CHECK (default 'whatsapp');
--    eventos da Evolution entram com source='evolution'
--  - crm_messages: content_type/status atuais cobrem tudo que o
--    conector Baileys produz (reações são skip na v1)
--  - estado da instância (connection_state, owner_jid, etc.) vive
--    no config JSONB do canal; external_id = instance_name
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD.
-- ============================================================

ALTER TABLE crm_channels DROP CONSTRAINT IF EXISTS crm_channels_provider_check;
ALTER TABLE crm_channels ADD CONSTRAINT crm_channels_provider_check
  CHECK (provider IN ('whatsapp_cloud', 'evolution', 'gmail', 'instagram_basic', 'facebook_page'));
