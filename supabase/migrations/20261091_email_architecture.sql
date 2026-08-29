-- =============================================================
-- Arquitetura dos Emails — a régua sai do código e ganha o guia
-- "o e-mail não deve".
--
-- Contexto: as abas "Blueprints" e "Estrutura geral" do hub de geração
-- editam o MESMO par (flow_type, email_number) em dois lugares. A tela
-- nova ("Arquitetura dos Emails") funde as duas e passa a desenhar
-- também a RÉGUA — quantos e-mails cada fluxo tem, com que nome e em
-- que intervalo. Hoje isso é constante de código (DEFAULT_EMAILS em
-- `flow-seed.service.ts`), então mudar a régua de um fluxo exige deploy.
--
-- Duas mudanças, as duas aditivas:
--
-- 1. `email_outline_templates.restrictions` — o terceiro guia editorial
--    da maquete ("O e-mail não deve"), uma restrição por linha. Os dois
--    primeiros já existem: `objective` (a intenção) e `guidance` (o que
--    o e-mail deve fazer).
--
-- 2. `email_flow_templates` — a régua por fluxo. Nasce semeada com os
--    34 e-mails de DEFAULT_EMAILS, byte a byte, para que ligar a leitura
--    pela tabela não mude o comportamento de nenhuma loja nova.
--
-- Semântica preservada do seed: editar a régua vale para lojas geradas
-- DAQUI PRA FRENTE. `email_flow_emails` de lojas existentes não é tocado
-- (é o mesmo contrato que a UI antiga já anunciava para os blueprints).
-- =============================================================

-- ── 1. O guia que faltava ──────────────────────────────────────

alter table public.email_outline_templates
  add column if not exists restrictions text;

comment on column public.email_outline_templates.restrictions is
  'Restrições editoriais deste e-mail, uma por linha ("O e-mail não deve").
   Complementa objective (intenção) e guidance (o que deve fazer). Viaja no
   estrutura_geral do payload de copy e no contexto do Montador.';

-- ── 2. A régua da sequência ────────────────────────────────────

create table if not exists public.email_flow_templates (
  id            uuid primary key default gen_random_uuid(),
  flow_type     text    not null,
  email_number  integer not null check (email_number >= 1),
  -- Nome do e-mail na régua. Vira `email_flow_emails.name` no seed.
  name          text    not null,
  -- Intervalo desde o gatilho do fluxo. 0 = imediato; nos transacionais
  -- (shipping_stages) o disparo é por evento e o valor não é usado.
  delay_hours   integer not null default 0 check (delay_hours >= 0),
  -- Remover um e-mail na tela DESATIVA (não apaga): o histórico de qual
  -- régua gerou quais lojas continua legível, e reativar é um clique.
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (flow_type, email_number)
);

comment on table public.email_flow_templates is
  'Régua de e-mails por fluxo (nome + intervalo), editável em
   /admin/settings/email-generation?tab=architecture. Fonte do seed de
   email_flow_emails; DEFAULT_EMAILS (flow-seed.service.ts) segue como
   fallback quando a tabela está vazia. Alterações valem para lojas
   geradas a partir de agora.';

create index if not exists idx_email_flow_templates_flow
  on public.email_flow_templates (flow_type, email_number)
  where is_active;

-- Seed: os 34 e-mails de DEFAULT_EMAILS, idênticos. `on conflict do
-- nothing` mantém a migration reexecutável e nunca sobrescreve régua já
-- editada na tela.
insert into public.email_flow_templates (flow_type, email_number, name, delay_hours) values
  ('welcome', 1, 'Welcome 1', 0),
  ('welcome', 2, 'Welcome 2', 24),
  ('welcome', 3, 'Welcome 3', 48),
  ('welcome', 4, 'Welcome 4', 96),
  ('welcome', 5, 'Welcome 5', 120),
  ('welcome', 6, 'Welcome 6', 144),
  ('welcome', 7, 'Welcome 7', 168),
  ('welcome', 8, 'Welcome 8', 192),
  ('site_abandoned', 1, 'Site Abandoned 1', 1),
  ('browse_abandonment', 1, 'Browse Abandoned 1', 1),
  ('browse_abandonment', 2, 'Browse Abandoned 2', 24),
  ('browse_abandonment', 3, 'Browse Abandoned 3', 48),
  ('browse_abandonment', 4, 'Browse Abandoned 4', 72),
  ('browse_abandonment', 5, 'Browse Abandoned 5', 120),
  ('abandoned_cart', 1, 'Carrinho Abandonado 1', 1),
  ('abandoned_cart', 2, 'Carrinho Abandonado 2', 4),
  ('abandoned_cart', 3, 'Carrinho Abandonado 3', 24),
  ('abandoned_cart', 4, 'Carrinho Abandonado 4', 48),
  ('abandoned_cart', 5, 'Carrinho Abandonado 5', 72),
  ('abandoned_cart', 6, 'Carrinho Abandonado 6', 96),
  ('abandoned_cart', 7, 'Carrinho Abandonado 7', 120),
  ('abandoned_cart', 8, 'Carrinho Abandonado 8', 168),
  ('upsell', 1, 'Upsell 1', 24),
  ('upsell', 2, 'Upsell 2', 72),
  ('upsell', 3, 'Upsell 3', 168),
  ('upsell', 4, 'Upsell 4', 336),
  ('win_back', 1, 'Winback 1', 0),
  ('win_back', 2, 'Winback 2', 168),
  ('win_back', 3, 'Winback 3', 336),
  ('shipping_stages', 1, 'Pedido Pago', 0),
  ('shipping_stages', 2, 'Pedido em separação', 0),
  ('shipping_stages', 3, 'Pedido em coleta', 0),
  ('shipping_stages', 4, 'Atraso na Entrega', 0),
  ('shipping_stages', 5, 'Pedido Enviado', 0)
on conflict (flow_type, email_number) do nothing;

-- ── RLS ────────────────────────────────────────────────────────
-- Regra da casa (incidente ago/2026): toda policy declara `TO` explícito.
-- A tabela é catálogo global do pipeline — leitura para autenticado,
-- escrita só pelo service role (a rota /api/admin/email-architecture usa
-- createAdminClient e valida admin/owner/dev antes).

alter table public.email_flow_templates enable row level security;

drop policy if exists email_flow_templates_read on public.email_flow_templates;
create policy email_flow_templates_read
  on public.email_flow_templates
  for select
  to authenticated
  using (true);
