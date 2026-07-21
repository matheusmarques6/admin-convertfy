-- ============================================================
-- Blueprint híbrido (determinístico-primeiro com LLM fallback):
--   1. Novo agente 'subject' — mini-LLM barato que substitui a única
--      contribuição criativa de nível-email do Blueprint na rota
--      determinística (subject_hint + messaging adaptados à loja).
--   2. Toggle por org email_generation_settings.blueprint_mode:
--      'auto' (default) = determinístico quando skeleton OK + cobertura
--      100% das variantes; senão LLM fallback (comportamento atual).
--      'llm' força o fallback (kill-switch sem deploy);
--      'deterministic' força o builder (testes/rollout).
--
-- A config 'blueprint' PERMANECE ATIVA — é o LLM fallback vivo da rota B.
-- Padrão idempotente de CHECKs das migrations 20260730/20261006.
-- ============================================================

-- 1. CHECK email_agent_configs.agent_type (+ 'subject')
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
      'subject'
    ));
END $$;

-- 2. CHECK email_generation_runs.agent (+ 'subject')
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
      'component_test','subject'
    ));
END $$;

-- 3. Toggle do blueprint híbrido por org.
ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS blueprint_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (blueprint_mode IN ('auto','llm','deterministic'));

COMMENT ON COLUMN email_generation_settings.blueprint_mode IS
  'Rota do blueprint: auto = determinístico quando cobertura 100%, senão LLM; llm = força fallback; deterministic = força builder.';

-- 4. Config seed do agente 'subject' (ativa; Haiku, saída pequena).
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT
  'subject',
  'claude-haiku-4-5-20251001',
  $SYS$Você escreve a direção editorial de UM email de e-commerce.
Gere:
- subject_hint: sugestão de linha de assunto (≤55 caracteres, no idioma/tom da loja, sem emoji forçado).
- messaging: 2-3 frases de direção editorial do email (o ângulo/argumento central que a copy deve seguir), adaptadas à loja.
Responda APENAS JSON: {"subject_hint":"...","messaging":"..."}.$SYS$,
  $USR$LOJA: {{brand_name}} — NICHO: {{nicho}} — TOM DE VOZ: {{tom_voz}}
PERSONA: {{persona}}
FLOW: {{flow_type}} — EMAIL #{{email_number}}
OBJETIVO: {{outline_objective}}
DIRETRIZ: {{outline_guidance}}
TONS: {{tones}}
ORIENTAÇÕES DE COPY DOS BLOCOS: {{copy_guidance_resumo}}
TOP PRODUTOS: {{top_products}}

Gere o JSON agora.$USR$,
  0.7,
  400,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'subject' AND is_active = true
);
