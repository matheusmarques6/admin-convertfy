-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — fundações
--
-- Ciclo semanal de sugestões IA: o cron varre as lojas (dados locais já
-- sincronizados por sync-omnisend/sync-reports/crm-health-compute),
-- cruza com datas comemorativas por país + trends + benchmark interno
-- e gera sugestões de campanha que o COO aprova/rejeita na tela
-- /admin/campaigns/central.
--
-- Tabelas:
--   1. campaign_cycles        — um row por ciclo semanal (dom 22h BRT)
--   2. commemorative_dates    — catálogo global de datas por país
--   3. campaign_trends        — temas em alta capturados via web search
--   4. campaign_suggestions   — a fila que o COO aprova/rejeita
--   5. campaign_ai_runs       — telemetria das chamadas IA do módulo
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. campaign_cycles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number INT NOT NULL,
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'partial', 'failed')),
  triggered_by TEXT NOT NULL DEFAULT 'cron'
    CHECK (triggered_by IN ('cron', 'manual')),
  generated_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  -- Snapshot do contexto usado na geração (lojas escaneadas, datas na
  -- janela, lojas em atenção, benchmark) — auditoria do que a IA viu.
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, number)
);

CREATE INDEX IF NOT EXISTS idx_campaign_cycles_org_status
  ON campaign_cycles(org_id, status, created_at DESC);

-- ── 2. commemorative_dates (catálogo global, sem org) ────────────────
CREATE TABLE IF NOT EXISTS commemorative_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL CHECK (country IN ('BR', 'US', 'PT', 'UK', 'ES')),
  -- 'MM-DD'; datas móveis (ex: Mother's Day US) ganham year preenchido
  month_day TEXT NOT NULL CHECK (month_day ~ '^[0-1][0-9]-[0-3][0-9]$'),
  year INT,
  name TEXT NOT NULL,
  impact TEXT NOT NULL DEFAULT 'med' CHECK (impact IN ('high', 'med', 'low')),
  category TEXT CHECK (category IN ('seasonal', 'commercial', 'awareness', 'cultural')),
  note TEXT,
  tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_campaign_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commemorative_dates_unique
  ON commemorative_dates(country, month_day, COALESCE(year, 0));
CREATE INDEX IF NOT EXISTS idx_commemorative_dates_country
  ON commemorative_dates(country, month_day) WHERE is_active = true;

-- ── 3. campaign_trends ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES campaign_cycles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT,
  -- '+180%' — estimativa qualitativa citada pela fonte, não métrica exata
  delta_label TEXT,
  tag TEXT,
  niche TEXT,
  country TEXT,
  -- URLs/citações do web search que embasam a trend
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_trends_cycle
  ON campaign_trends(cycle_id);

-- ── 4. campaign_suggestions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES campaign_cycles(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'approved', 'dismissed')),
  type TEXT NOT NULL CHECK (type IN ('data', 'tema', 'email', 'performance', 'avulsa')),
  title TEXT NOT NULL,
  confidence INT CHECK (confidence BETWEEN 0 AND 100),
  -- { label, detail, source } — a evidência que gerou a sugestão
  trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
  trend_id UUID REFERENCES campaign_trends(id) ON DELETE SET NULL,
  commemorative_date_id UUID REFERENCES commemorative_dates(id) ON DELETE SET NULL,
  angle TEXT,
  subject TEXT,
  channel TEXT NOT NULL DEFAULT 'Email',
  -- [{ store_id, store_name, country }]
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_summary TEXT,
  -- Estimativa qualitativa da IA ("R$ 42k") — exibir sem prometer precisão
  est_revenue TEXT,
  low_perf BOOLEAN NOT NULL DEFAULT false,
  send_date DATE,
  -- Rascunho do construtor de email: { subject, preheader, strategy, blocks[] }
  email_draft JSONB,
  -- { test: { [store_id]: {...} }, production: { [store_id]: {...} } }
  copy_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Item criado no Kanban ao aprovar (permite undo enquanto copy_creation)
  pipeline_item_id UUID REFERENCES campaign_pipeline_items(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_suggestions_org_cycle
  ON campaign_suggestions(org_id, cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_suggestions_send_date
  ON campaign_suggestions(org_id, send_date) WHERE send_date IS NOT NULL;

-- ── 5. campaign_ai_runs (telemetria) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES campaign_cycles(id) ON DELETE SET NULL,
  suggestion_id UUID REFERENCES campaign_suggestions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('trends', 'suggestions', 'copy')),
  agent_config_id UUID REFERENCES email_agent_configs(id) ON DELETE SET NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'invalid_output')),
  input_vars JSONB,
  raw_output TEXT,
  parsed_output JSONB,
  error_message TEXT,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_cents INT DEFAULT 0,
  duration_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_ai_runs_cycle
  ON campaign_ai_runs(cycle_id, kind);

-- ── updated_at triggers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION campaign_central_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS
$$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_campaign_cycles_updated ON campaign_cycles;
CREATE TRIGGER trg_campaign_cycles_updated
  BEFORE UPDATE ON campaign_cycles
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

DROP TRIGGER IF EXISTS trg_campaign_suggestions_updated ON campaign_suggestions;
CREATE TRIGGER trg_campaign_suggestions_updated
  BEFORE UPDATE ON campaign_suggestions
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

-- ── RLS (padrão campaign_pipeline_items: org isolation) ──────────────
ALTER TABLE campaign_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commemorative_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_cycles_org" ON campaign_cycles;
CREATE POLICY "campaign_cycles_org" ON campaign_cycles
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "campaign_trends_org" ON campaign_trends;
CREATE POLICY "campaign_trends_org" ON campaign_trends
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "campaign_suggestions_org" ON campaign_suggestions;
CREATE POLICY "campaign_suggestions_org" ON campaign_suggestions
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "campaign_ai_runs_org" ON campaign_ai_runs;
CREATE POLICY "campaign_ai_runs_org" ON campaign_ai_runs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

-- Catálogo global: leitura para autenticados, escrita só service_role
DROP POLICY IF EXISTS "commemorative_dates_read" ON commemorative_dates;
CREATE POLICY "commemorative_dates_read" ON commemorative_dates
  FOR SELECT TO authenticated USING (true);

-- Lock do cron (tabela cron_locks já existe — 20260228_cron_locks.sql)
INSERT INTO cron_locks (lock_name, is_running)
VALUES ('campaign_suggestions_cycle', false)
ON CONFLICT (lock_name) DO NOTHING;

-- ── Seed: datas comemorativas ────────────────────────────────────────
-- BR: migrado de src/components/dashboard/commemorative-dates-card.tsx
INSERT INTO commemorative_dates (country, month_day, name, impact, category, note, tips, best_campaign_types) VALUES
  ('BR', '01-01', 'Ano Novo', 'med', 'seasonal', 'Renovação e recomeço — bom para reativação.', '["Campanhas de ano novo, vida nova com descontos de renovação", "Flows de reativação de clientes inativos", "Promover lançamentos de coleção"]', '["Reativação", "Lançamento de coleção"]'),
  ('BR', '02-14', 'Valentine''s Day (Internacional)', 'low', 'commercial', 'Público internacional e e-commerces que vendem fora.', '["Campanhas para público internacional", "Gift guides para presentes românticos", "Cupons especiais para casais"]', '["Gift Guide", "Promocional"]'),
  ('BR', '03-08', 'Dia da Mulher', 'med', 'awareness', 'Forte em moda, beleza e autocuidado.', '["Campanhas de empoderamento feminino", "Descontos em categorias femininas", "Colaborações com influenciadoras"]', '["Awareness", "Promocional"]'),
  ('BR', '03-15', 'Dia do Consumidor', 'high', 'commercial', 'A "Black Friday do primeiro semestre".', '["Mega descontos estilo Black Friday", "Semana do consumidor (estender 7 dias)", "Ofertas relâmpago por email", "Recuperação de carrinho agressiva"]', '["Mega Sale", "Flash Sale", "Recuperação de carrinho"]'),
  ('BR', '04-21', 'Tiradentes', 'low', 'cultural', 'Feriado prolongado — lazer e viagens.', '["Aproveitar feriado prolongado para campanhas", "Promover produtos para lazer e viagens"]', '["Feriado", "Promocional"]'),
  ('BR', '05-01', 'Dia do Trabalho', 'low', 'cultural', 'Feriado prolongado.', '["Campanhas para feriado prolongado", "Descontos para quem trabalha duro merece"]', '["Feriado", "Promocional"]'),
  ('BR', '05-11', 'Dia das Mães', 'high', 'commercial', 'Segunda maior data do varejo brasileiro.', '["Gift guides por faixa de preço", "Campanhas emocionais com storytelling", "Frete grátis ou expresso para entrega a tempo", "Flows de carrinho abandonado mais agressivos"]', '["Gift Guide", "Emocional", "Last Minute"]'),
  ('BR', '06-12', 'Dia dos Namorados', 'high', 'commercial', 'Pico de vendas de moda, joias e presentes no Brasil.', '["Kits de presentes para casais", "Campanhas com contagem regressiva", "Personalização de produtos", "Segmentar por gênero para sugestões de presentes"]', '["Gift Guide", "Countdown", "Segmentada"]'),
  ('BR', '06-24', 'São João', 'med', 'cultural', 'Festas juninas — regional (NE forte).', '["Temática junina para campanhas", "Descontos em categorias sazonais"]', '["Sazonal", "Temática"]'),
  ('BR', '07-20', 'Dia do Amigo', 'low', 'commercial', 'Indicação e compras em dupla.', '["Campanhas de indicação traga um amigo", "Descontos para compras em dupla", "Flows de referral marketing"]', '["Referral", "Promocional"]'),
  ('BR', '08-10', 'Dia dos Pais', 'high', 'commercial', 'Gift guides convertem bem 7-10 dias antes.', '["Gift guides para diferentes perfis de pai", "Campanhas de last-minute com entrega rápida", "Kits especiais e combos"]', '["Gift Guide", "Last Minute", "Combo"]'),
  ('BR', '09-07', 'Independência do Brasil', 'med', 'cultural', 'Semana Brasil com descontos especiais.', '["Semana Brasil com descontos especiais", "Campanhas patrióticas", "Promover produtos nacionais"]', '["Semana Brasil", "Promocional"]'),
  ('BR', '10-12', 'Dia das Crianças', 'med', 'commercial', 'Pais comprando para filhos.', '["Campanhas para pais comprarem para filhos", "Segmentar clientes que compraram brinquedos", "Frete grátis para presentes infantis"]', '["Segmentada", "Gift Guide"]'),
  ('BR', '10-31', 'Halloween', 'low', 'seasonal', 'Temática dark/divertida.', '["Temática dark/divertida para campanhas", "Descontos assustadoramente bons", "Coleções temáticas"]', '["Temática", "Promocional"]'),
  ('BR', '11-25', 'Black Friday', 'high', 'commercial', 'Maior data do varejo — teasers 2 semanas antes.', '["Esquentar com teasers 2 semanas antes", "VIP early access para clientes fiéis", "Flows de carrinho abandonado máximos", "Campanhas de contagem regressiva", "Segmentar por histórico de compra"]', '["Teaser", "VIP Access", "Mega Sale", "Countdown"]'),
  ('BR', '11-28', 'Cyber Monday', 'high', 'commercial', 'Extensão digital da Black Friday.', '["Extensão de Black Friday online", "Descontos exclusivos digitais", "Push final para vendas do período"]', '["Flash Sale", "Digital Only"]'),
  ('BR', '12-25', 'Natal', 'high', 'commercial', 'Urgência de entrega + gift guides.', '["Campanhas de presente com urgência de entrega", "Gift guides por faixa de preço", "Flows de recomendação baseados em histórico", "Mensagens de agradecimento pós-compra"]', '["Gift Guide", "Last Minute", "Agradecimento"]'),
  ('BR', '12-31', 'Réveillon', 'med', 'seasonal', 'Liquidação de fim de ano.', '["Liquidação de fim de ano", "Campanhas de agradecimento pelo ano", "Teasers para coleção do próximo ano"]', '["Liquidação", "Teaser"]')
ON CONFLICT DO NOTHING;

-- US
INSERT INTO commemorative_dates (country, month_day, name, impact, category, note, tips, best_campaign_types) VALUES
  ('US', '02-14', 'Valentine''s Day', 'high', 'commercial', 'Major gifting holiday — jewelry, flowers, fashion.', '["Gift guides by price range", "Countdown campaigns", "Last-minute shipping deadlines"]', '["Gift Guide", "Countdown"]'),
  ('US', '05-10', 'Mother''s Day', 'high', 'commercial', 'Second Sunday of May (móvel — revisar por ano).', '["Gift guides", "Emotional storytelling", "Express shipping cutoffs"]', '["Gift Guide", "Emocional"]'),
  ('US', '06-21', 'Father''s Day', 'high', 'commercial', 'Third Sunday of June (móvel — revisar por ano). Gift guides convertem 7-10 dias antes.', '["Gift guides by persona", "Bundles and combos"]', '["Gift Guide", "Combo"]'),
  ('US', '07-04', 'Independence Day', 'med', 'cultural', 'Summer sale — liquidações de verão.', '["Summer sale", "Patriotic themes"]', '["Mega Sale", "Sazonal"]'),
  ('US', '09-01', 'Labor Day', 'med', 'commercial', 'First Monday of September (móvel). Fim do verão = clearance.', '["End of summer clearance", "Long weekend sale"]', '["Liquidação", "Promocional"]'),
  ('US', '10-31', 'Halloween', 'med', 'seasonal', 'Forte em casa, fantasia e doces.', '["Themed collections", "Spooky-good discounts"]', '["Temática", "Promocional"]'),
  ('US', '11-26', 'Thanksgiving', 'high', 'cultural', 'Quarta quinta de novembro (móvel). Abre o ciclo BF/CM.', '["Gratitude campaigns", "BF early access"]', '["Teaser", "VIP Access"]'),
  ('US', '11-27', 'Black Friday', 'high', 'commercial', 'Maior data do varejo US (móvel — sexta após Thanksgiving).', '["Teasers 2 weeks before", "VIP early access", "Countdown campaigns"]', '["Mega Sale", "Countdown", "VIP Access"]'),
  ('US', '12-25', 'Christmas', 'high', 'commercial', 'Shipping deadlines + gift guides.', '["Gift guides by price", "Shipping deadline urgency", "E-gift cards last minute"]', '["Gift Guide", "Last Minute"]')
ON CONFLICT DO NOTHING;

-- PT
INSERT INTO commemorative_dates (country, month_day, name, impact, category, note, tips, best_campaign_types) VALUES
  ('PT', '05-03', 'Dia da Mãe', 'high', 'commercial', 'Primeiro domingo de maio (móvel — revisar por ano).', '["Gift guides", "Campanhas emocionais"]', '["Gift Guide", "Emocional"]'),
  ('PT', '06-13', 'Santo António', 'med', 'cultural', 'Santos Populares — forte em Lisboa.', '["Temática popular", "Campanhas regionais Lisboa"]', '["Sazonal", "Temática"]'),
  ('PT', '11-27', 'Black Friday', 'high', 'commercial', 'Segue o calendário US (móvel).', '["Teasers antecipados", "Countdown"]', '["Mega Sale", "Countdown"]'),
  ('PT', '12-25', 'Natal', 'high', 'commercial', 'Urgência de entrega + gift guides.', '["Gift guides", "Prazos de entrega"]', '["Gift Guide", "Last Minute"]')
ON CONFLICT DO NOTHING;

-- UK
INSERT INTO commemorative_dates (country, month_day, name, impact, category, note, tips, best_campaign_types) VALUES
  ('UK', '03-15', 'Mother''s Day (Mothering Sunday)', 'high', 'commercial', 'Móvel (3 semanas antes da Páscoa) — revisar por ano.', '["Gift guides", "Free delivery offers"]', '["Gift Guide", "Promocional"]'),
  ('UK', '06-21', 'Father''s Day', 'high', 'commercial', 'Third Sunday of June (móvel). Gift guides convertem 7-10 dias antes.', '["Gift guides by price (£25/£50/£100)", "Menswear collection CTA"]', '["Gift Guide", "Segmentada"]'),
  ('UK', '11-27', 'Black Friday', 'high', 'commercial', 'Segue o calendário US (móvel).', '["Teasers", "VIP early access"]', '["Mega Sale", "VIP Access"]'),
  ('UK', '12-25', 'Christmas', 'high', 'commercial', 'Shipping deadlines críticos.', '["Gift guides", "Last posting dates urgency"]', '["Gift Guide", "Last Minute"]'),
  ('UK', '12-26', 'Boxing Day', 'high', 'commercial', 'Maior dia de liquidação do ano no UK.', '["Clearance sale", "New year teasers"]', '["Liquidação", "Flash Sale"]')
ON CONFLICT DO NOTHING;
