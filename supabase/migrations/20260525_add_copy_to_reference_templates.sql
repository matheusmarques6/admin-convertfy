-- Adiciona campos copy e email_number à tabela email_reference_templates
ALTER TABLE email_reference_templates ADD COLUMN IF NOT EXISTS copy TEXT;
ALTER TABLE email_reference_templates ADD COLUMN IF NOT EXISTS email_number INTEGER;
