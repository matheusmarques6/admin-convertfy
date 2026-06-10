-- Adiciona status intermediário 'image_done' entre 'rendering' e 'qa_running'.
-- Permite split do phase2 em duas rotas HTTP (image em uma, html+qa em outra)
-- pra caber no maxDuration=300s da Vercel.
--
-- Espelha o CHECK constraint atual de 20260530_agent_email_generation.sql
-- (com legacy in_progress/approved/live mantidos por retrocompat Epic 8/9).

DO $$
BEGIN
  -- Drop constraint atual e recria com 'image_done' adicionado
  ALTER TABLE email_flow_emails DROP CONSTRAINT IF EXISTS email_flow_emails_status_check;

  ALTER TABLE email_flow_emails
    ADD CONSTRAINT email_flow_emails_status_check
    CHECK (status IN (
      'draft',
      'in_progress',              -- legacy, mantido por retrocompat
      'pending',                  -- agendado para gerar
      'copy_generating',
      'copy_generating_recovery', -- fallback in-process apos watchdog
      'copy_ready',
      'rendering',
      'image_done',               -- NOVO: imagem gerada, aguardando fase HTML+QA (split AE-X)
      'qa_running',
      'ready',
      'failed',
      'approved',                 -- legacy, mantido
      'live'                      -- legacy, mantido
    ));
END $$;

COMMENT ON COLUMN email_flow_emails.status IS
  'Status do pipeline AE. Ver docs/architecture/adr-agent-email-generation.md. '
  'image_done = imagem gerada com sucesso, aguardando fase HTML+QA (split AE-X).';
