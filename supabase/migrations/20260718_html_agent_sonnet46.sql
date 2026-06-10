-- ============================================================
-- HTML Agent — downgrade de modelo para Sonnet 4.6.
--
-- A arquitetura do email é decidida UPSTREAM pelo Montador (reference_html) +
-- Blueprint. O agente HTML é apenas um montador: rouba a estrutura do
-- reference_html, repinta com a identidade da loja e despeja a copy — não
-- arquiteta do zero. Logo, não precisa de Opus; Sonnet 4.6 dá conta com
-- custo muito menor (3/15 vs 15/75 por M tokens).
--
-- Mantém o system_prompt/user_template v3 atuais — só troca o model.
-- Idempotente.
-- ============================================================

UPDATE email_agent_configs
SET model = 'claude-sonnet-4-6'
WHERE agent_type = 'html' AND is_active = true;
