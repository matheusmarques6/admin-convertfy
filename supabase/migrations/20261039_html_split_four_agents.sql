-- ============================================================
-- Split do agente HTML em 4 agentes sequenciais (corte seco):
--   hero_section  → monta a hero a partir da variante escolhida pelo
--                   Montador (html + rendered_html como gold reference)
--   text_format   → posiciona a copy do n8n no documento inteiro
--   image_format  → posiciona as imagens geradas (JSON de ops)
--   color_format  → cores do email + cor/formatação dos botões (substitui
--                   o Refinador; JSON de ops replace, fail-open)
--
-- 1-2. CHECKs de agente (+4 valores; 'html' e 'refiner' PERMANECEM —
--      runs históricos referenciam ambos).
-- 3.   store_email_references.slot_map — a escolha do Curador/Montador
--      salva POR PARTE do email (pedido do usuário).
-- 4.   email_flow_emails.html_pipeline_stage — último step da cadeia
--      CONCLUÍDO ('hero'|'text'|'image'); permite resume após kill.
-- 5.   Seeds das 4 configs (GLM-5.2, prompt vazio → default in-code).
-- 6.   Corte seco: desativa as configs 'html' e 'refiner' (não deleta).
-- 7.   REGRA DOS MARCADORES DE BLOCO no prompt ativo do Montador
--      (referências novas ganham <!-- cfy:block:i:section:start/end -->).
--
-- Padrão idempotente de CHECKs das migrations 20260730/20261006/20261022.
-- ============================================================

-- 1. CHECK email_agent_configs.agent_type (+4)
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
      'hero_section','text_format','image_format','color_format'
    ));
END $$;

-- 2. CHECK email_generation_runs.agent (+4)
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
      'hero_section','text_format','image_format','color_format'
    ));
END $$;

-- 3. Escolha do Curador/Montador salva por parte do email.
ALTER TABLE store_email_references
  ADD COLUMN IF NOT EXISTS slot_map JSONB;

COMMENT ON COLUMN store_email_references.slot_map IS
  '[{block_index, section, label, variant_id|null, variant_name|null}] — escolha do Curador/Montador por parte do email (missing → variant_id null). Fonte primária do agente hero_section pra resolver a variante da hero.';

-- 4. Último step da cadeia de formatação CONCLUÍDO (resume do watchdog).
ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS html_pipeline_stage TEXT
    CHECK (html_pipeline_stage IN ('hero','text','image'));

COMMENT ON COLUMN email_flow_emails.html_pipeline_stage IS
  'Último step da cadeia Hero→Texto→Imagem→Cores CONCLUÍDO (NULL = nenhum/terminado). Permite ao watchdog retomar a fase 2 do ponto exato sem re-rodar steps prontos. NÃO é status — o status segue rendering durante toda a cadeia.';

-- 5. Seeds das 4 configs (prompt vazio → o chain usa o DEFAULT in-code;
--    editar na aba Agentes sobrescreve). GLM-5.2 roteia via OpenRouter.
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT 'hero_section', 'z-ai/glm-5.2', '', '', 0.3, 16384, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs WHERE agent_type = 'hero_section' AND is_active = true
);

INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT 'text_format', 'z-ai/glm-5.2', '', '', 0.3, 65536, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs WHERE agent_type = 'text_format' AND is_active = true
);

INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT 'image_format', 'z-ai/glm-5.2', '', '', 0.2, 8192, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs WHERE agent_type = 'image_format' AND is_active = true
);

INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT 'color_format', 'z-ai/glm-5.2', '', '', 0.3, 16384, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs WHERE agent_type = 'color_format' AND is_active = true
);

-- 6. Corte seco: o runtime não invoca mais 'html' nem 'refiner'.
--    Rollback = reativar (rows preservadas com histórico de versões).
UPDATE email_agent_configs
SET is_active = false
WHERE agent_type IN ('html', 'refiner')
  AND is_active = true;

-- 7. REGRA DOS MARCADORES DE BLOCO no prompt ativo do Montador.
--    Idempotente via sentinela ('cfy:block').
--    SYNC CONTRACT: o mesmo texto vive em DEFAULT_ASSEMBLER_SYSTEM
--    (src/lib/agents/architect/component-assembler.service.ts).
UPDATE email_agent_configs
SET system_prompt = system_prompt || $MARKERS$

REGRA DOS MARCADORES DE BLOCO: envolva CADA bloco do documento com um par de comentários HTML exatamente neste formato: <!-- cfy:block:{block_index}:{section}:start --> imediatamente ANTES do bloco e <!-- cfy:block:{block_index}:{section}:end --> imediatamente DEPOIS (ex.: <!-- cfy:block:1:hero:start --> ... <!-- cfy:block:1:hero:end -->). Use o block_index e a section EXATOS de <componentes_escolhidos>/<blocos_sem_variante>. Exatamente UM par por bloco, na ordem dos blocos, sem aninhamento. Estes marcadores e a nota obrigatória dos blocos sem variante são os ÚNICOS comentários permitidos além dos que já existem dentro do HTML das variantes.$MARKERS$
WHERE agent_type = 'assembler'
  AND is_active = true
  AND system_prompt NOT LIKE '%cfy:block%';
