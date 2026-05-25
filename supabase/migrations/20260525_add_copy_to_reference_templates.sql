-- Adiciona campo copy à tabela email_reference_templates
ALTER TABLE email_reference_templates ADD COLUMN IF NOT EXISTS copy TEXT;
