-- ============================================================
-- SQL CONSOLIDADO — Delta Copy Master Workflow + Campaign Architect
--
-- INSTRUÇÕES:
--   1. Abra o Supabase Dashboard → SQL Editor
--   2. Cole TUDO deste arquivo num novo query
--   3. Clique em Run
--   4. Confira as mensagens NOTICE (pre-flight + pos-flight)
--
-- IDEMPOTENTE: pode rodar várias vezes — cada bloco verifica
-- existência antes de criar/alterar. Nada é destruído.
--
-- CONTEXTO:
--   Auditoria via SQL revelou que as migrations 20260720 e 20260723
--   foram criadas no repo mas NUNCA aplicadas no banco (o
--   20260724_campaign_copy_master_recovery mascarou parcialmente o
--   problema porque recria os mesmos CHECKs e recupera 1 das 2 rows).
--
--   Faltando atualmente:
--     • campaign_suggestions.audience_label, pilot_store_ids, design_task_id
--       (UPDATE em approveSuggestion crasha com PGRST204 sem design_task_id)
--     • CHECK tasks.source_type incluindo 'campaign_suggestion'
--     • CHECK campaign_ai_runs.kind incluindo 'copy_master'/'copy_parse'
--     • row email_agent_configs com agent_type='campaign_architect'
--
-- CONTÉM (cópia fiel das duas migrations):
--   PARTE 1 · 20260720_copy_master_workflow
--   PARTE 2 · 20260723_campaign_architect_agent
--
-- PRÉ-REQUISITOS (devem já estar aplicados):
--   - campaign_suggestions, campaign_ai_runs (epic Campaign Central)
--   - email_agent_configs (epic AE)
--   - tasks (epic Tasks)
--
-- COMPATÍVEL COM POSTGRES 14+ / SUPABASE
-- ============================================================

-- ── PRE-FLIGHT — estado atual ────────────────────────────────────────
DO $$
DECLARE
  has_design_task_id BOOLEAN;
  has_audience_label BOOLEAN;
  has_pilot_store_ids BOOLEAN;
  has_tasks_check_campaign BOOLEAN;
  has_campaign_ai_runs_copy_master BOOLEAN;
  has_campaign_architect_row BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_suggestions' AND column_name='design_task_id')
    INTO has_design_task_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_suggestions' AND column_name='audience_label')
    INTO has_audience_label;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_suggestions' AND column_name='pilot_store_ids')
    INTO has_pilot_store_ids;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='public.tasks'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%campaign_suggestion%')
    INTO has_tasks_check_campaign;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='campaign_ai_runs'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%copy_master%')
    INTO has_campaign_ai_runs_copy_master;
  SELECT EXISTS(SELECT 1 FROM email_agent_configs
    WHERE agent_type='campaign_architect' AND is_active=true)
    INTO has_campaign_architect_row;

  RAISE NOTICE '── PRE-FLIGHT (estado ANTES) ──';
  RAISE NOTICE 'campaign_suggestions.design_task_id .......... %', has_design_task_id;
  RAISE NOTICE 'campaign_suggestions.audience_label .......... %', has_audience_label;
  RAISE NOTICE 'campaign_suggestions.pilot_store_ids ......... %', has_pilot_store_ids;
  RAISE NOTICE 'tasks CHECK inclui ''campaign_suggestion'' .... %', has_tasks_check_campaign;
  RAISE NOTICE 'campaign_ai_runs CHECK inclui ''copy_master''.. %', has_campaign_ai_runs_copy_master;
  RAISE NOTICE 'email_agent_configs row ''campaign_architect''.. %', has_campaign_architect_row;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- ╔═════════════════════════════════════════════════════════════════╗
-- ║  PARTE 1 — 20260720_copy_master_workflow                        ║
-- ║  Refator do fluxo de geração de copy de campanha (F1+F2+F3)     ║
-- ╚═════════════════════════════════════════════════════════════════╝
-- ═══════════════════════════════════════════════════════════════════

-- ── 1.1. Expandir agent_type pra incluir campaign_copy_master ────────
-- NOTA: usa a lista FINAL COMPLETA (com campaign_architect), não a lista
-- literal do 20260720. Motivo: o banco já tem uma linha campaign_architect
-- (liberada pelo recovery 20260724); recriar o CHECK sem ela violaria o
-- constraint (23514). A lista final é idempotente e cobre os 10 tipos reais.
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
      'campaign_architect','campaign_image','refiner'
    ));
END $$;

-- ── 1.2. Novas colunas em campaign_suggestions ───────────────────────
ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS audience_label TEXT,
  ADD COLUMN IF NOT EXISTS pilot_store_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS design_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_suggestions_design_task
  ON campaign_suggestions(design_task_id) WHERE design_task_id IS NOT NULL;

-- ── 1.3. Liberar source_type='campaign_suggestion' em tasks ──────────
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

-- ── 1.4. Seed do agent_type 'campaign_copy_master' v1 ────────────────
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

-- ── 1.5. Expandir kind em campaign_ai_runs ───────────────────────────
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

-- ═══════════════════════════════════════════════════════════════════
-- ╔═════════════════════════════════════════════════════════════════╗
-- ║  PARTE 2 — 20260723_campaign_architect_agent                    ║
-- ║  Arquiteto de Estrutura (framework Single Day)                  ║
-- ╚═════════════════════════════════════════════════════════════════╝
-- ═══════════════════════════════════════════════════════════════════

-- ── 2.1. Expandir CHECK do agent_type ────────────────────────────────
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
      'campaign_architect','campaign_image','refiner'
    ));
END $$;

-- ── 2.2. Seed do prompt v1 ───────────────────────────────────────────
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, version, is_active
)
SELECT
  'campaign_architect',
  'gpt-5-1',
  $SYS$<role>
Você é o Arquiteto de Estrutura de email do framework Single Day. Você NÃO escreve copy.
Você decide QUAIS blocos entram, em QUE ordem, e o que é FIXO / PREENCHER / DINÂMICO.
Seu output é um blueprint estruturado que outro agente vai preencher.
</role>

<inputs>
- {{briefing}}: perfil da marca (o que ela PODE entregar: frete, garantia, prova social, política de troca).
- {{ideia_campanha}}: a oferta (ex.: "24h, 24 produtos, X% OFF + acesso VIP acaba hoje").
- {{produtos}}: dados disponíveis pro grid (nome, preço de/por, prova social).
- {{blocos_disponiveis}}: enum de blocos permitidos — PREHEADER, URGENCY_BAR, HERO, CONTEXTO_URGENCIA, CTA_PRIMARIO, MECANICA, GRID_PRODUTOS, OBJECAO, TRANSPARENCIA, GARANTIA, ULTIMA_CHAMADA, CUPOM_REPETIDO_CTA, FOOTER_BENEFICIOS.
</inputs>

<score_function>
Pontue cada candidato de 0 a 15. Use isto também pra justificar a escolha.
1. Urgência tripla coberta (promo acaba + acesso/VIP acaba + estoque crítico) — 0–3
2. Arquitetura de conversão completa (gancho → contexto → prova → objeção → fecho) — 0–3
3. Razão de escala: quanto mais FIXO, melhor. Alvo: ≤3 campos PREENCHER abertos — 0–2
4. Lógica de ordem: cada bloco prepara o próximo (sem salto cognitivo) — 0–2
5. Cupom repetido ao menos 2x ao longo do email — 0–2
6. Footer com benefícios reais presente — 0–1
7. Aderência ao briefing: REMOVE qualquer bloco que dependa de algo que a marca NÃO entrega (frete grátis, garantia). Cada invenção = −2.
</score_function>

<process>
1. SEED: monte um blueprint inicial a partir de {{ideia_campanha}} + {{briefing}}.
2. APE — gere EXATAMENTE 3 candidatos distintos:
   - C1: enxuto (3 macro-seções: HERO / MECANICA+GRID / OBJECAO).
   - C2: completo (anatomia cheia de blocos).
   - C3: variação intermediária à sua escolha, otimizada pra esta oferta específica.
3. SCORE: rode a <score_function> nos 3. Registre a nota item a item.
4. OPRO — pegue o de maior nota e itere 1x: olhando o histórico de notas, edite SÓ os itens abaixo do teto. Re-pontue.
5. SELECIONE o blueprint final (maior nota pós-iteração). Empate → o de menos campos abertos.
</process>

<output_schema>
Responda SÓ com JSON válido, sem markdown, neste formato:
{
  "reasoning_selecao": "por que este candidato venceu, citando as notas",
  "score_final": <int 0-15>,
  "trajetoria": [{"candidato":"C1","nota":<int>},{"candidato":"C2","nota":<int>},{"candidato":"C3","nota":<int>},{"candidato":"vencedor_iterado","nota":<int>}],
  "blueprint": [
    {
      "ordem": <int>,
      "bloco": "<enum de blocos_disponiveis>",
      "tipo": "FIXO" | "PREENCHER" | "DINAMICO",
      "conteudo_fixo": "<texto literal se FIXO, senão null>",
      "instrucao_preenchimento": "<o que o redator deve cobrir se PREENCHER, senão null>",
      "constraints": ["<regras específicas deste bloco>"],
      "reasoning": "<por que este bloco entra aqui e neste tipo>"
    }
  ],
  "campos_abertos": <int — quantos blocos PREENCHER>,
  "removidos_por_briefing": ["<blocos cortados porque a marca não entrega>"]
}
</output_schema>

<regras>
- NÃO escreva copy de venda. Só estrutura + instruções de preenchimento.
- HERO é sempre FIXO (sub-headline data, headline evento, desconto, cupom, timer).
- GRID_PRODUTOS é sempre DINAMICO e sai como bloco/PNG próprio.
- Se {{briefing}} não confirma frete grátis ou garantia, esses blocos saem (e vão pra "removidos_por_briefing").
</regras>$SYS$,
  $USR$<briefing>
{{briefing}}
</briefing>

<ideia_campanha>
{{ideia_campanha}}
</ideia_campanha>

<produtos>
{{produtos}}
</produtos>

<blocos_disponiveis>
{{blocos_disponiveis}}
</blocos_disponiveis>

## Tarefa

Execute o <process> completo. Retorne APENAS o JSON do <output_schema>, sem markdown.$USR$,
  0.6,
  4000,
  '{
    "type": "object",
    "required": ["reasoning_selecao", "score_final", "trajetoria", "blueprint", "campos_abertos", "removidos_por_briefing"],
    "properties": {
      "reasoning_selecao": { "type": "string" },
      "score_final": { "type": "integer", "minimum": 0, "maximum": 15 },
      "trajetoria": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["candidato", "nota"],
          "properties": {
            "candidato": { "type": "string" },
            "nota": { "type": "integer" }
          }
        }
      },
      "blueprint": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["ordem", "bloco", "tipo"],
          "properties": {
            "ordem": { "type": "integer" },
            "bloco": { "type": "string" },
            "tipo": { "type": "string", "enum": ["FIXO", "PREENCHER", "DINAMICO"] },
            "conteudo_fixo": { "type": ["string", "null"] },
            "instrucao_preenchimento": { "type": ["string", "null"] },
            "constraints": { "type": "array", "items": { "type": "string" } },
            "reasoning": { "type": "string" }
          }
        }
      },
      "campos_abertos": { "type": "integer" },
      "removidos_por_briefing": { "type": "array", "items": { "type": "string" } }
    }
  }'::jsonb,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'campaign_architect' AND is_active = true
);

-- ── POS-FLIGHT — verificação final ───────────────────────────────────
DO $$
DECLARE
  has_design_task_id BOOLEAN;
  has_audience_label BOOLEAN;
  has_pilot_store_ids BOOLEAN;
  has_tasks_check_campaign BOOLEAN;
  has_campaign_ai_runs_copy_master BOOLEAN;
  has_campaign_ai_runs_copy_parse BOOLEAN;
  has_campaign_copy_master_row BOOLEAN;
  has_campaign_architect_row BOOLEAN;
  has_campaign_architect_check BOOLEAN;
  missing TEXT := '';
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_suggestions' AND column_name='design_task_id')
    INTO has_design_task_id;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_suggestions' AND column_name='audience_label')
    INTO has_audience_label;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_suggestions' AND column_name='pilot_store_ids')
    INTO has_pilot_store_ids;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='public.tasks'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%campaign_suggestion%')
    INTO has_tasks_check_campaign;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='campaign_ai_runs'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%copy_master%')
    INTO has_campaign_ai_runs_copy_master;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='campaign_ai_runs'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%copy_parse%')
    INTO has_campaign_ai_runs_copy_parse;
  SELECT EXISTS(SELECT 1 FROM email_agent_configs
    WHERE agent_type='campaign_copy_master' AND is_active=true)
    INTO has_campaign_copy_master_row;
  SELECT EXISTS(SELECT 1 FROM email_agent_configs
    WHERE agent_type='campaign_architect' AND is_active=true)
    INTO has_campaign_architect_row;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='email_agent_configs'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%campaign_architect%')
    INTO has_campaign_architect_check;

  RAISE NOTICE '── POS-FLIGHT (estado DEPOIS) ──';
  RAISE NOTICE 'campaign_suggestions.design_task_id .......... %', has_design_task_id;
  RAISE NOTICE 'campaign_suggestions.audience_label .......... %', has_audience_label;
  RAISE NOTICE 'campaign_suggestions.pilot_store_ids ......... %', has_pilot_store_ids;
  RAISE NOTICE 'tasks CHECK inclui ''campaign_suggestion'' .... %', has_tasks_check_campaign;
  RAISE NOTICE 'campaign_ai_runs CHECK inclui ''copy_master''.. %', has_campaign_ai_runs_copy_master;
  RAISE NOTICE 'campaign_ai_runs CHECK inclui ''copy_parse''... %', has_campaign_ai_runs_copy_parse;
  RAISE NOTICE 'email_agent_configs CHECK inclui ''campaign_architect''. %', has_campaign_architect_check;
  RAISE NOTICE 'email_agent_configs row ''campaign_copy_master''.. %', has_campaign_copy_master_row;
  RAISE NOTICE 'email_agent_configs row ''campaign_architect'' .... %', has_campaign_architect_row;

  IF NOT has_design_task_id           THEN missing := missing || ' campaign_suggestions.design_task_id'; END IF;
  IF NOT has_audience_label           THEN missing := missing || ' campaign_suggestions.audience_label'; END IF;
  IF NOT has_pilot_store_ids          THEN missing := missing || ' campaign_suggestions.pilot_store_ids'; END IF;
  IF NOT has_tasks_check_campaign     THEN missing := missing || ' tasks.source_type_check(campaign_suggestion)'; END IF;
  IF NOT has_campaign_ai_runs_copy_master THEN missing := missing || ' campaign_ai_runs.kind_check(copy_master)'; END IF;
  IF NOT has_campaign_ai_runs_copy_parse  THEN missing := missing || ' campaign_ai_runs.kind_check(copy_parse)'; END IF;
  IF NOT has_campaign_architect_check     THEN missing := missing || ' email_agent_configs.agent_type_check(campaign_architect)'; END IF;
  IF NOT has_campaign_copy_master_row     THEN missing := missing || ' email_agent_configs.row(campaign_copy_master)'; END IF;
  IF NOT has_campaign_architect_row       THEN missing := missing || ' email_agent_configs.row(campaign_architect)'; END IF;

  IF missing = '' THEN
    RAISE NOTICE '✅ Delta aplicado com sucesso. Tudo OK.';
  ELSE
    RAISE EXCEPTION 'Delta INCOMPLETO. Faltando:%', missing;
  END IF;
END $$;
