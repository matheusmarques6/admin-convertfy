-- ============================================================
-- Agente component_test — teste ad-hoc de variante da biblioteca
-- (aba Componentes → card "Testar geração" → "Testar com IA").
--
-- Recebe o contexto da variante ({{variant_name}}, {{section}},
-- {{when_use}}, {{copy_guidance}}, {{output_schema_json}}) + um
-- {{briefing}} curto do operador (+ {{store_context}} opcional) e
-- devolve APENAS um JSON campo→valor respeitando max_len/required/
-- guidance de cada campo do output_schema. Não toca em emails reais.
--
-- Mesmo padrão idempotente de CHECKs das migrations 20260730/20260819.
-- ============================================================

-- 1. CHECK email_agent_configs.agent_type (+ 'component_test')
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
      'campaign_architect','campaign_image','refiner','component_test'
    ));
END $$;

-- 2. CHECK email_generation_runs.agent (+ 'component_test')
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
      'component_test'
    ));
END $$;

-- 3. Config default (ativa — modelo barato, saída pequena).
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT
  'component_test',
  'claude-sonnet-4-6',
  $SYS$Você gera a copy de UM bloco de email de e-commerce para teste rápido de uma variante da biblioteca de componentes.

Você recebe: o nome/seção da variante, o contexto de uso ("quando usar"), as orientações de copy, o schema de campos (key, label, type, max_len, required, example, guidance) e um briefing curto do operador.

Regras:
- Gere EXATAMENTE um valor para cada campo do schema (use a key como chave).
- Respeite max_len de cada campo (conte caracteres). Campos required nunca vazios.
- Siga a guidance específica de cada campo e as orientações de copy da variante.
- Campos type=url: gere uma URL plausível https. Campos type=image: gere um nome de arquivo descritivo (ex.: hero-blackfriday.jpg). Campos type=boolean: "true"/"false". Campos type=number: apenas dígitos.
- Escreva em português do Brasil, alinhado ao briefing.

Responda APENAS um objeto JSON {"key":"valor", ...}, sem markdown nem texto ao redor.$SYS$,
  $USR$<variante>
- nome: {{variant_name}}
- seção: {{section}}
- quando usar: {{when_use}}
- orientações de copy: {{copy_guidance}}
</variante>

<schema>
{{output_schema_json}}
</schema>

<loja>
{{store_context}}
</loja>

<briefing_de_teste>
{{briefing}}
</briefing_de_teste>

Gere agora o JSON campo→valor para o schema acima.$USR$,
  0.7,
  2048,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'component_test' AND is_active = true
);
