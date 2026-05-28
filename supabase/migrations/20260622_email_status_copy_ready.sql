-- Adicionar status 'copy_ready' ao state machine de email_flow_emails
-- Permite que o n8n marque um email como "copy pronta, aguardando designer / geração de imagem+html"
-- entre 'in_progress' e 'ready'.

ALTER TABLE email_flow_emails
  DROP CONSTRAINT IF EXISTS email_flow_emails_status_check;

ALTER TABLE email_flow_emails
  ADD CONSTRAINT email_flow_emails_status_check
  CHECK (status IN ('draft', 'in_progress', 'copy_ready', 'ready', 'approved', 'live'));
