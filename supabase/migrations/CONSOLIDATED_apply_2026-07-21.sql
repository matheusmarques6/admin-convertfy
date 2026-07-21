-- ============================================================
-- CONSOLIDADO 2026-07-21 — aplicar UMA vez no SQL Editor do Supabase.
-- Reúne as migrations pendentes de componentes + formulários.
-- Todas idempotentes: rodar de novo não causa erro.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- >>> 20260721_form_conversion_tracking.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- CRM Convertfy — Form Conversion Tracking (Meta CAPI + Google gtag)
--
-- Habilita disparo de eventos de conversao quando um lead se
-- cadastra num formulario publico:
--   - Meta Conversions API (server-side, evento "Lead" + custom
--     "Lead qualificado" condicional)
--   - Google Ads gtag (client-side; so armazena config aqui)
--
-- Mudancas:
--   1. crm_forms            + colunas de config de pixel/token
--   2. crm_form_submissions + fbc/fbp/fbclid/gclid (click ids)
--   3. crm_conversion_events (fila duravel + log de envio server-side)
--
-- Idempotente: pode rodar multiplas vezes sem erro.
-- Depende de: crm_forms, crm_form_submissions, crm_leads,
--             organizations, org_members (ja existentes).
-- ============================================================

-- ── 1. crm_forms: config de tracking ─────────────────────────────
-- facebook_pixel_id / google_ads_id / google_analytics_id ja existem
-- (20260512_crm_forms.sql). Aqui adicionamos o token da CAPI (cifrado
-- na aplicacao via src/lib/crypto.ts — NUNCA exposto ao browser), o
-- test event code, o label de conversao do gtag e a config estruturada.

ALTER TABLE crm_forms
  ADD COLUMN IF NOT EXISTS meta_capi_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_conversion_label TEXT,
  ADD COLUMN IF NOT EXISTS tracking_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_forms.meta_capi_token IS
  'Access token da Meta Conversions API. Cifrado em repouso (enc:v1:) via src/lib/crypto.ts. Nunca retornar ao cliente — API expoe apenas has_meta_capi_token boolean.';
COMMENT ON COLUMN crm_forms.tracking_config IS
  'Config estruturada nao-secreta: { meta:{enabled,browser_pixel}, google:{enabled}, qualified_lead:{enabled,event_name,logic,rules:[{field_id,operator,value}]} }';

-- ── 2. crm_form_submissions: click ids p/ matching ───────────────
-- fbc/fbp (cookies do Meta), fbclid (Meta), gclid (Google). Capturados
-- no browser e enviados no submit; alimentam o user_data da CAPI.

ALTER TABLE crm_form_submissions
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT;

-- ── 3. crm_conversion_events: fila duravel + log ─────────────────
-- Cada evento server-side (Meta CAPI) vira uma linha. Enviado inline
-- best-effort no submit; o que falhar fica pending/failed e o cron
-- /api/cron/conversion-dispatch reprocessa com retry. Idempotente por
-- (submission_id, platform, event_name).

CREATE TABLE IF NOT EXISTS crm_conversion_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id UUID REFERENCES crm_forms(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES crm_form_submissions(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,

  -- Plataforma de destino. Google e client-side (gtag), entao hoje a
  -- fila server-side carrega so 'meta'; 'google' fica reservado.
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),

  -- 'Lead' (padrao) ou o custom (ex. 'Lead qualificado').
  event_name TEXT NOT NULL,
  -- Dedup com o pixel do browser (fbq eventID).
  event_id TEXT,

  -- Payload ja montado e com PII HASHEADA (sem token, sem PII crua).
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  -- Resposta do provedor (events_received, fbtrace_id, messages).
  response JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Idempotencia: nao duplica no retry quando ha submission. Parcial pra
-- nao bloquear linhas sem submission (submission_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_conversion_events_dedup
  ON crm_conversion_events(submission_id, platform, event_name)
  WHERE submission_id IS NOT NULL;

-- Varredura do cron (pending/failed mais antigos primeiro).
CREATE INDEX IF NOT EXISTS idx_crm_conversion_events_status
  ON crm_conversion_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_conversion_events_org
  ON crm_conversion_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_conversion_events_form
  ON crm_conversion_events(form_id);

-- ── 4. RLS ───────────────────────────────────────────────────────
-- Leitura/escrita restrita ao org_id do user (mesmo padrao das demais
-- tabelas CRM). Submit e cron usam service_role e bypassam RLS.

ALTER TABLE crm_conversion_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_conversion_events_org" ON crm_conversion_events;
CREATE POLICY "crm_conversion_events_org" ON crm_conversion_events
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  );

-- ── 5. updated_at trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION crm_conversion_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_conversion_events_updated_at ON crm_conversion_events;
CREATE TRIGGER trg_crm_conversion_events_updated_at
  BEFORE UPDATE ON crm_conversion_events
  FOR EACH ROW EXECUTE FUNCTION crm_conversion_events_updated_at();

-- ── 6. Grants ────────────────────────────────────────────────────

GRANT ALL ON crm_conversion_events TO service_role;

-- ── 7. Comentarios ───────────────────────────────────────────────

COMMENT ON TABLE crm_conversion_events IS
  'Fila duravel + log de eventos de conversao server-side (Meta CAPI). Idempotente por (submission_id, platform, event_name). Processada inline no submit e reprocessada pelo cron /api/cron/conversion-dispatch.';

-- ─────────────────────────────────────────────────────────────
-- >>> 20261003_component_variant_dimensions.sql
-- ─────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════
-- Biblioteca de componentes — novas dimensões do editor de variantes
-- (maquete "Geração de Emails" · aba Componentes)
--
-- Adiciona a `email_component_variants`:
--   • objectives/tones  — novas dimensões de matching (substituem
--     niche_affinity/positioning/mood; as antigas ficam DEPRECADAS e
--     serão dropadas em migration futura, após validação do novo
--     matching em produção)
--   • when_use / when_not_use / copy_guidance — contexto para a IA
--     (Curador escolhe melhor; Copy escreve melhor)
--   • long_description — notas de implementação (Outlook quirks etc.);
--     `description` continua sendo a descrição curta
--   • product_slots — nº de produtos que o bloco comporta (grade 2x2 = 4)
--   • output_schema — campos que a IA gera para o bloco:
--     [{key,label,type,max_len,required,example,guidance}] com
--     type ∈ text_short|text_long|number|url|image|boolean
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS objectives TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS when_use TEXT,
  ADD COLUMN IF NOT EXISTS when_not_use TEXT,
  ADD COLUMN IF NOT EXISTS copy_guidance TEXT,
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS product_slots INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_schema JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_ecv_objectives
  ON email_component_variants USING GIN (objectives);
CREATE INDEX IF NOT EXISTS idx_ecv_tones
  ON email_component_variants USING GIN (tones);

-- Backfill mood (4 chaves EN do briefing) → tones (6 rótulos PT da maquete).
-- Objectives não têm origem equivalente — ficam '{}' (wildcard no matching).
UPDATE email_component_variants
SET tones = (
  SELECT COALESCE(array_agg(DISTINCT t), '{}')
  FROM (
    SELECT CASE m
      WHEN 'formal'    THEN 'Premium'
      WHEN 'casual'    THEN 'Descontraído'
      WHEN 'afetivo'   THEN 'Amigável'
      WHEN 'divertido' THEN 'Descontraído'
    END AS t
    FROM unnest(mood) AS m
  ) s
  WHERE t IS NOT NULL
)
WHERE tones = '{}' AND mood <> '{}';

COMMENT ON COLUMN email_component_variants.objectives IS
  'Objetivos de email compatíveis (rótulos PT, ex. Promoção/Boas-vindas). Vazio = wildcard.';
COMMENT ON COLUMN email_component_variants.tones IS
  'Tons compatíveis (rótulos PT, ex. Urgente/Premium). Vazio = wildcard.';
COMMENT ON COLUMN email_component_variants.output_schema IS
  'Campos que a IA gera para este bloco: [{key,label,type,max_len,required,example,guidance}].';
COMMENT ON COLUMN email_component_variants.niche_affinity IS
  'DEPRECADO (jul/2026): substituído por objectives/tones. Remoção futura.';
COMMENT ON COLUMN email_component_variants.positioning IS
  'DEPRECADO (jul/2026): substituído por objectives/tones. Remoção futura.';
COMMENT ON COLUMN email_component_variants.mood IS
  'DEPRECADO (jul/2026): substituído por objectives/tones. Remoção futura.';

-- ─────────────────────────────────────────────────────────────
-- >>> 20261004_assembler_chooser_objectives_tones.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Curador (assembler_chooser) escolhe pelas NOVAS dimensões.
--
-- A migration 20261003 substituiu niche_affinity/positioning/mood por
-- objectives/tones e adicionou quando_usar/quando_nao_usar/product_slots
-- às variantes. O JSON de candidatos ({{candidates_json}}) agora expõe
-- esses campos — este UPDATE alinha o system prompt da config ATIVA do
-- Curador ao novo contrato (padrão UPDATE in-place das migrations
-- 20260723/20260730). Contrato de saída inalterado:
-- [{"block_index":N,"variant_id":"..."}]. Idempotente.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = $SYS$Você é o Curador de Componentes de email. Para CADA posição da sequência do email, escolha UMA variante da biblioteca — a que melhor serve ao objetivo do email e à identidade da loja — usando o NOME, a DESCRIÇÃO e os metadados de cada variante: quando_usar / quando_nao_usar (contexto de uso escrito pelo time), objectives (objetivos de email compatíveis), tones (tons compatíveis), density e product_slots. Você NÃO recebe o HTML das variantes; decide pela descrição e pelo contexto.

Regras:
- Uma escolha por block_index da sequência. Use APENAS variant_id presente nas opções daquela posição.
- Respeite quando_nao_usar: se o contexto do email bate com um "quando NÃO usar", prefira outra variante da posição.
- Prefira variantes cujos objectives/tones batem com o objetivo do outline e o tom de voz da loja.
- Para posições de produtos, considere product_slots (quantos produtos o bloco comporta).
- Se a descrição estiver vazia, decida pelo nome + metadados.
- Não invente variant_id.

Responda APENAS um array JSON, sem markdown nem texto ao redor:
[{"block_index": 0, "variant_id": "..."}, {"block_index": 1, "variant_id": "..."}]$SYS$
WHERE agent_type = 'assembler_chooser' AND is_active = true;

-- ─────────────────────────────────────────────────────────────
-- >>> 20261005_generation_settings_pipeline_fields.sql
-- ─────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════
-- Configurações do pipeline de geração (maquete EG · aba Configurações)
-- + índice da listagem global da aba Geradas.
--
-- email_generation_settings ganha os parâmetros globais do pipeline:
--   • qa_vision_enabled  — NULL = respeita env EMAIL_QA_VISION_ENABLED
--     (rollout seguro); true/false = override explícito da UI
--   • refiner_enabled    — kill-switch do Refinador Tipográfico (além da
--     ausência de config ativa, que continua desligando)
--   • max_blocks_per_email — clamp da estrutura gerada por email
--   • default_model      — fallback quando NÃO há config ativa do agente
--   • usd_brl_rate       — override do câmbio nos logs (NULL = cotação online)
--   • cost_alert_usd     — alerta por execução acima deste custo
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS qa_vision_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS refiner_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_blocks_per_email INT NOT NULL DEFAULT 9
    CHECK (max_blocks_per_email BETWEEN 3 AND 15),
  ADD COLUMN IF NOT EXISTS default_model TEXT,
  ADD COLUMN IF NOT EXISTS usd_brl_rate NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS cost_alert_usd NUMERIC(8,2);

-- Listagem global "Geradas" (emails que passaram pelo pipeline, mais
-- recentes primeiro) — índice parcial para não varrer emails sem geração
-- nem estourar statement timeout (precedente: fix 57014 nos gen-logs).
CREATE INDEX IF NOT EXISTS idx_efe_generated_recent
  ON email_flow_emails (updated_at DESC)
  WHERE generation_batch_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- >>> 20261006_component_test_agent.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- >>> 20261021_form_submissions_click_ids.sql
-- ─────────────────────────────────────────────────────────────
-- Click IDs de plataformas de ads nas respostas do formulário público.
-- gclid (Google Ads) e fbclid (Meta Ads) chegam na URL mesmo quando a
-- campanha não tem UTMs manuais — sem eles a origem paga fica invisível.
-- Idempotente: seguro re-rodar.

ALTER TABLE crm_form_submissions ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE crm_form_submissions ADD COLUMN IF NOT EXISTS fbclid TEXT;

COMMENT ON COLUMN crm_form_submissions.gclid IS 'Google Ads click ID capturado na URL da página do formulário/landing';
COMMENT ON COLUMN crm_form_submissions.fbclid IS 'Meta Ads click ID capturado na URL da página do formulário/landing';

-- ─────────────────────────────────────────────────────────────
-- >>> 20261022_component_variant_rendered_html.sql
-- ─────────────────────────────────────────────────────────────
-- Campo próprio para o exemplo real do email renderizado, colado
-- manualmente na aba "HTML renderizado" do editor de variantes.
-- Independente de `html` (o HTML do componente usado pelo pipeline).

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS rendered_html TEXT;

COMMENT ON COLUMN email_component_variants.rendered_html IS
  'Exemplo real do email renderizado, colado manualmente no editor (aba HTML renderizado). Não é usado pelo pipeline.';

-- Recarrega o cache de schema do PostgREST (resolve PGRST204 imediatamente)
NOTIFY pgrst, 'reload schema';
