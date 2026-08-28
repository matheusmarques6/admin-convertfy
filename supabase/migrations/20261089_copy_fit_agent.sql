-- ============================================================
-- Encurtador de copy (agente 'copy_fit').
--
-- Os limites de caractere CHEGAM ao n8n: `buildBlockCopySchema` monta
-- blocks[].schema.campos.{key}.max_caracteres para todo campo de copy
-- (conferido no payload do batch cc71e995: 40 de 40). O n8n é que não os
-- respeita — entre 20 e 27/08, TODO run de copy voltou com estouro (74
-- campos em 27/08, 56 em 24/08, 37 em 23/08), e a copy longa atravessava
-- o copy_merge e vazava da caixa no email renderizado.
--
-- `findFieldDeviations` já media tudo isso e gravava em
-- parsed_output.desvios do run `copy` — "observabilidade apenas", e nada
-- lia o campo. Este agente fecha o laço: reescreve SÓ os campos que
-- estouraram, respeitando o limite, antes da fase 2.
--
-- Quem decide o que entra é o CÓDIGO (`aceitarReescrita` em
-- src/lib/email-workspace/copy-fit.ts): a saída do modelo é proposta.
-- Fail-open — falha mantém a copy original e nunca derruba a geração.
--
-- Kill-switch sem deploy: email_generation_settings.copy_fit_mode
--   'on'  (default) → encurta quando houver campo acima do limite
--   'off'           → comportamento anterior (estouro passa, mas agora
--                     aparece no Estúdio e na tela do email)
--
-- email_generation_runs NÃO tem mais CHECK de `agent` (verificado em
-- produção em 28/08) — o run 'copy_fit' não precisa de alteração lá.
-- ============================================================

-- 1. CHECK email_agent_configs.agent_type (+ copy_fit)
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
      'component_tagger',
      'merge_verifier',
      'estruturador',
      'copy_fit'
    ));
END $$;

-- 2. Kill-switch por org.
ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS copy_fit_mode TEXT NOT NULL DEFAULT 'on'
    CHECK (copy_fit_mode IN ('on', 'off'));

COMMENT ON COLUMN email_generation_settings.copy_fit_mode IS
  'Encurtador de copy: on = reescreve os campos acima do max_len antes da fase 2; off = deixa passar (o estouro segue visível no Estúdio e na tela do email).';

-- 3. Config seed do agente (ativa; Haiku — reescrita curta e bem
--    especificada, mesma escolha do mini-LLM 'subject').
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT
  'copy_fit',
  'claude-haiku-4-5-20251001',
  $SYS$Você encurta copy de email de e-commerce que passou do limite da caixa onde ela será exibida.

REGRAS
- Reescreva CADA campo recebido para caber em max_caracteres. O limite é o tamanho real do slot no HTML: passar dele faz o texto vazar da caixa.
- Preserve a MENSAGEM: o argumento central, os números, os nomes de produto e a chamada para ação continuam. Corte redundância, adjetivo decorativo e frase de apoio — nunca o fato.
- Mantenha o MESMO IDIOMA e o mesmo tom do texto original.
- Não use reticências nem corte a frase no meio: entregue frase inteira e bem terminada.
- Não invente informação que não esteja no texto original.
- Respeite min_caracteres quando existir.

SAÍDA
Responda APENAS JSON, sem comentário nem cerca de código:
{"campos":{"<id>":"<texto reescrito>"}}
Use exatamente os `id` recebidos, um por campo. Não inclua campo que você não reescreveu.$SYS$,
  $USR$LOJA: {{brand_name}} — TOM DE VOZ: {{tom_voz}}

CONTRATO DOS CAMPOS (label, limite e orientação de cada um):
{{contrato_json}}

COPY ATUAL (o que precisa encurtar, com o tamanho de agora):
{{copy_atual_json}}

Devolva o JSON agora.$USR$,
  0.4,
  1500,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'copy_fit' AND is_active = true
);
