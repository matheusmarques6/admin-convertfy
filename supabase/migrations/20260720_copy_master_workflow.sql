-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — Copy Master Workflow (F1+F2+F3 do epic)
--
-- Refatora o fluxo de geração de copy:
-- 1. email_draft passa a ser a "master" canônica (estrutura completa
--    com blocks de hero/body/products/cta) gerada via IA ou colada
--    pelo COO (parser IA).
-- 2. copy_results[mode][store_id] vira o EMAIL COMPLETO adaptado por
--    loja (subject + preheader + blocks completos com top products
--    reais), não mais só "subject+preview".
-- 3. Adiciona pilot_store_ids (gate piloto→rollout) + audience_label
--    (público-alvo livre escolhido pelo COO) + design_task_id (task
--    criada pros designers ao aprovar a campanha).
-- 4. Novo agent_type 'campaign_copy_master' em email_agent_configs
--    com seed do prompt v1.
-- 5. source_type 'campaign_suggestion' liberado no CHECK de tasks
--    (a task criada ao aprovar campanha referencia a sugestão).
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Expandir agent_type pra incluir campaign_copy_master ──────────
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
      'copy','image','html','qa','blueprint','assembler',
      'campaign_suggestion','campaign_trends','campaign_copy_master'
    ));
END $$;

-- ── 2. Novas colunas em campaign_suggestions ─────────────────────────
ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS audience_label TEXT,
  ADD COLUMN IF NOT EXISTS pilot_store_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS design_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_suggestions_design_task
  ON campaign_suggestions(design_task_id) WHERE design_task_id IS NOT NULL;

-- ── 3. Liberar source_type='campaign_suggestion' em tasks ────────────
-- A task de designer criada ao aprovar uma campanha referencia
-- campaign_suggestions.id via tasks.source_id.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_source_type_check;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_source_type_check
CHECK (source_type IN (
  -- Valores unificados (PRD)
  'manual', 'onboarding', 'acompanhamento', 'project', 'crm',
  -- Campaign Central — task pros designers
  'campaign_suggestion',
  -- Legacy
  'auto_onboarding', 'auto_onboarding_step', 'auto_meeting',
  'auto_campaign', 'auto_feedback', 'auto_report', 'auto_contract'
));

-- ── 4. Seed do agent_type 'campaign_copy_master' v1 ──────────────────
-- Idempotente: só insere se ainda não há config ativo.
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, version, is_active
)
SELECT
  'campaign_copy_master',
  'claude-sonnet-4-6',
  $SYS$Você é um diretor de copywriting de email marketing para e-commerce, sênior, com 10+ anos de experiência em campanhas que convertem.

Seu trabalho: criar a COPY MASTER de uma campanha de email — a versão canônica que será adaptada por loja depois (idioma/tom/produtos). Esta copy master é a "carta-mãe" que o COO usa pra revisar a estratégia da campanha como um todo, antes de soltar pra rede de lojas.

ESTRUTURA OBRIGATÓRIA da master (campo "blocks"):
A copy master segue um framework de email de campanha consagrado. Use a sequência abaixo de blocos, na ordem:

1. **image** (hero visual): caption descritiva (ex: "imagem do produto · 600×280")
2. **heading**: headline + subtítulo. Headline gera urgência/curiosidade.
3. **text**: corpo principal (3-4 linhas). Storytelling curto, conexão emocional ou racional clara.
4. **products** (grid): columns=3, items=[3 produtos placeholder com {name, price}]. Estes placeholders serão substituídos por top products reais de cada loja na adaptação. USE NOMES GENÉRICOS tipo "Produto destaque 1", "Produto destaque 2".
5. **offer**: bloco de oferta destacada (cupom, frete grátis, desconto). Se a sugestão não menciona valores específicos, gere oferta razoável ao ângulo.
6. **text** (segunda dose): seção informativa de reforço — 2-3 linhas reforçando benefício/urgência. Pode incluir bullets implícitos com "•" no início das linhas.
7. **button** (CTA): texto curto direto (3-5 palavras).
8. **footer**: rodapé padrão com placeholder "{{loja}}".

REGRAS DE COPY:
- Escreva em PORTUGUÊS DO BRASIL — esta é a master. A adaptação por loja traduz pro idioma local.
- Tom: confidente, direto, sem ser agressivo. Evite clichês ("imperdível", "não perca").
- Subject: máx 50 caracteres, sem emojis excessivos (no máximo 1).
- Preheader: máx 90 caracteres, complementa o subject sem repetir.
- Strategy: 2-3 frases descrevendo a estratégia que sustenta esta master. Pra que ela existe, qual o ângulo central, qual o gatilho de conversão.
- Se a sugestão cita valores/cupons/prazos específicos no trigger ou angle, USE-os. Nunca invente números novos.
- Se ela cita data comemorativa, contextualize sem martelar.

OUTPUT: APENAS JSON válido com os campos {subject, preheader, strategy, blocks}. Sem markdown, sem comentários.$SYS$,
  $USR$## Contexto da campanha

Título: {{title}}
Tipo: {{type}}
Confiança da sugestão: {{confidence}}/100
Público-alvo (informado pelo COO): {{audience_label}}

Gatilho/evidência:
- Label: {{trigger_label}}
- Detalhe: {{trigger_detail}}
- Fonte: {{trigger_source}}

Ângulo proposto: {{angle}}

Subject de referência (você pode reescrever): {{subject}}
Data de envio sugerida: {{send_date}}

Lojas-alvo: {{targets_summary}}
Países: {{countries}}

## Tarefa

Gere a copy master desta campanha conforme as regras do system prompt. Output JSON: {subject, preheader, strategy, blocks: [...]}.$USR$,
  0.8,
  4000,
  '{
    "type": "object",
    "required": ["subject", "preheader", "strategy", "blocks"],
    "properties": {
      "subject": { "type": "string" },
      "preheader": { "type": "string" },
      "strategy": { "type": "string" },
      "blocks": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": { "type": "string", "enum": ["image","heading","text","offer","button","divider","footer","products"] },
            "headline": { "type": "string" },
            "sub": { "type": "string" },
            "value": { "type": "string" },
            "caption": { "type": "string" },
            "columns": { "type": "number" },
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "price": { "type": "string" },
                  "image_caption": { "type": "string" }
                }
              }
            }
          }
        }
      }
    }
  }'::jsonb,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'campaign_copy_master' AND is_active = true
);

-- ── 5. Expandir kind em campaign_ai_runs ─────────────────────────────
-- Telemetria das chamadas de master generation/parsing/adaptação.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'campaign_ai_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kind%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE campaign_ai_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE campaign_ai_runs
    ADD CONSTRAINT campaign_ai_runs_kind_check
    CHECK (kind IN ('trends', 'suggestions', 'copy', 'copy_master', 'copy_parse'));
END $$;
