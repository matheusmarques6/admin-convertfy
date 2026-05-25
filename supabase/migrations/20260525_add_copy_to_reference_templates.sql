-- Adiciona campos copy, email_number e image_map à tabela email_reference_templates
ALTER TABLE email_reference_templates ADD COLUMN IF NOT EXISTS copy TEXT;
ALTER TABLE email_reference_templates ADD COLUMN IF NOT EXISTS email_number INTEGER;
ALTER TABLE email_reference_templates ADD COLUMN IF NOT EXISTS image_map JSONB DEFAULT '[]';
