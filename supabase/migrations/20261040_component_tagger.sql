-- ============================================================
-- Taguedor de Variantes (component_tagger) — modelo "exemplo pronto +
-- schema" da biblioteca de componentes.
--
-- Contexto (Luxe Lift, jul/2026): as variantes são cadastradas como
-- exemplos PRONTOS (frases/imagens reais no HTML, sem {{PLACEHOLDER}});
-- o output_schema referencia essas frases no campo `example` e a key do
-- campo É o nome do placeholder em potência. O taguedor converte
-- exemplo→placeholder UMA vez por variante (no cadastro/batch), gera
-- `html_tagged` como proposta PENDENTE e o designer revisa/edita/aprova
-- na aba Componentes. Só a versão APROVADA é consumida pelo pipeline.
--
-- 1. Colunas novas em email_component_variants.
-- 2. CHECKs de agente (+'component_tagger').
-- 3. Seed da config do agente (GLM-5.2; prompt vazio → default in-code).
-- ============================================================

-- 1. Proposta tagueada + estado + relatório por campo.
ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS html_tagged TEXT,
  ADD COLUMN IF NOT EXISTS tagging_status TEXT
    CHECK (tagging_status IN ('pending','approved')),
  ADD COLUMN IF NOT EXISTS tagging_meta JSONB;

COMMENT ON COLUMN email_component_variants.html_tagged IS
  'HTML da variante com os exemplos substituídos por {{UPPER(key)}} (proposta do taguedor, editável). O pipeline consome APENAS quando tagging_status=approved; senão usa html (comportamento atual).';
COMMENT ON COLUMN email_component_variants.tagging_status IS
  'NULL = taguedor nunca rodou · pending = proposta aguardando revisão · approved = html_tagged em uso pelo pipeline.';
COMMENT ON COLUMN email_component_variants.tagging_meta IS
  '{model, generated_at, fields:[{key, placeholder, anchored_by: exact|fuzzy|inference|existing_tag|not_found, note}], issues[]} — relatório do taguedor por campo (campos por inferência merecem atenção extra na revisão).';

-- 2a. CHECK email_agent_configs.agent_type (+'component_tagger')
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_agent_configs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs
    ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler','assembler_chooser',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect','campaign_image','refiner','component_test',
      'subject',
      'hero_section','text_format','image_format','color_format',
      'component_tagger'
    ));
END $$;

-- 2b. CHECK email_generation_runs.agent (+'component_tagger')
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_generation_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs
    ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN (
      'seed','copy','image','html','qa','blueprint','assembler',
      'copy_dispatch','assembler_chooser','campaign_image','refiner',
      'component_test','subject',
      'hero_section','text_format','image_format','color_format',
      'component_tagger'
    ));
END $$;

-- 3. Seed da config (prompt vazio → DEFAULT in-code do chain; editável na
--    aba Agentes). Temperatura baixa: tarefa mecânica de substituição.
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT 'component_tagger', 'z-ai/glm-5.2', '', '', 0.1, 32768, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'component_tagger' AND is_active = true
);
