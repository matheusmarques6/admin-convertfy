-- Pesquisa & Diagnóstico — substitui Briefing estratégico em /admin/stores/[id]?tab=contexto
-- Documento editorial em 5 pilares (marca, loja, ICP, tom, anúncios) que guia
-- copywriting, briefings e estratégia. Todos os campos nullable — preenchimento
-- gradual via UI ou assistente IA.

-- 1. Perfil da Marca
alter table client_stores add column if not exists brand_thesis text;
alter table client_stores add column if not exists brand_about text;
alter table client_stores add column if not exists brand_pillars jsonb;
alter table client_stores add column if not exists brand_presence text;

-- 2. Sobre a loja
alter table client_stores add column if not exists store_story text;
alter table client_stores add column if not exists store_milestones jsonb;

-- 3. Cliente Ideal (ICP)
alter table client_stores add column if not exists icp_persona jsonb;
alter table client_stores add column if not exists icp_demographics jsonb;
alter table client_stores add column if not exists icp_day_in_life text;
alter table client_stores add column if not exists icp_motivations text[];
alter table client_stores add column if not exists icp_frictions text[];

-- 4. Tom de Comunicação
alter table client_stores add column if not exists tone_description text;
alter table client_stores add column if not exists tone_do text[];
alter table client_stores add column if not exists tone_dont text[];
alter table client_stores add column if not exists tone_use_words text[];
alter table client_stores add column if not exists tone_avoid_words text[];

-- 5. Review dos Anúncios
alter table client_stores add column if not exists ads_score numeric(3,1);
alter table client_stores add column if not exists ads_summary text;
alter table client_stores add column if not exists ads_sub_scores jsonb;
alter table client_stores add column if not exists ads_strengths jsonb;
alter table client_stores add column if not exists ads_opportunities jsonb;
alter table client_stores add column if not exists ads_risks jsonb;
alter table client_stores add column if not exists ads_reviewed_at timestamptz;
alter table client_stores add column if not exists ads_reviewed_by uuid references auth.users(id);

-- Comentários pra documentar o schema
comment on column client_stores.brand_thesis is 'Pesquisa & Diagnóstico · Pilar 1 · Pull-quote da marca';
comment on column client_stores.brand_pillars is 'jsonb array [{number, label, text}] — 3 pilares-conceito';
comment on column client_stores.store_milestones is 'jsonb array [{year, event, highlight?, muted?}] — marcos da operação';
comment on column client_stores.icp_persona is 'jsonb {name, age, city, monogram} — persona principal';
comment on column client_stores.icp_demographics is 'jsonb {age_range, income, education, occupation, religion}';
comment on column client_stores.ads_sub_scores is 'jsonb {strategy, creatives, targeting, diversification, tracking} — cada 0-10';
comment on column client_stores.ads_strengths is 'jsonb array [{what, body}] — pontos fortes da operação de mídia';
comment on column client_stores.ads_opportunities is 'jsonb array [{what, body}] — oportunidades de melhoria';
comment on column client_stores.ads_risks is 'jsonb array [{what, body}] — riscos a monitorar';
