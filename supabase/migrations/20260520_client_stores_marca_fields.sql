-- Colunas da aba Contexto (Marca, Operação, Lista) que estavam no Zod do
-- endpoint /api/admin/stores/[id]/context mas não tinham migration rastreada.
-- Também adiciona brand_manual_url e research_doc_url (CTAs do design).
-- Todas idempotentes — seguro rodar mesmo se já foram aplicadas via dashboard.

-- ── Marca & Identidade visual ─────────────────────────────────────────
alter table client_stores add column if not exists slogan text;
alter table client_stores add column if not exists diferencial text;
alter table client_stores add column if not exists persona text;
alter table client_stores add column if not exists tom_de_voz text;
alter table client_stores add column if not exists posicionamento_preco text;
alter table client_stores add column if not exists hashtags text[];
alter table client_stores add column if not exists cores jsonb;       -- [{name, hex, use}]
alter table client_stores add column if not exists fontes jsonb;      -- {titulo, corpo}
alter table client_stores add column if not exists additional_notes text;
alter table client_stores add column if not exists brand_manual_url text;
alter table client_stores add column if not exists research_doc_url text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_stores_tom_de_voz_check') then
    alter table client_stores add constraint client_stores_tom_de_voz_check
      check (tom_de_voz is null or tom_de_voz in ('formal','casual','afetivo','divertido'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_stores_posicionamento_preco_check') then
    alter table client_stores add constraint client_stores_posicionamento_preco_check
      check (posicionamento_preco is null or posicionamento_preco in ('popular','medio','premium'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_stores_recorrencia_check') then
    alter table client_stores add constraint client_stores_recorrencia_check
      check (recorrencia is null or recorrencia in ('compra-unica','assinatura','mista'));
  end if;
end $$;

-- ── Operação & catálogo ───────────────────────────────────────────────
alter table client_stores add column if not exists ticket_medio_cents int;
alter table client_stores add column if not exists taxa_conversao numeric(7,4);
alter table client_stores add column if not exists faturamento_medio_cents bigint;
alter table client_stores add column if not exists margem_media numeric(5,4);
alter table client_stores add column if not exists recorrencia text;
alter table client_stores add column if not exists sazonalidade text[];
alter table client_stores add column if not exists frete_medio_cents int;
alter table client_stores add column if not exists frete_prazo text;
alter table client_stores add column if not exists frete_cobertura text;
alter table client_stores add column if not exists frete_gratis_acima_cents int;
alter table client_stores add column if not exists pagamento_split jsonb;  -- {pix, cartao, boleto}
alter table client_stores add column if not exists devolucao_politica text;
alter table client_stores add column if not exists marketplaces text[];

-- ── Lista & engajamento ───────────────────────────────────────────────
alter table client_stores add column if not exists lista_total int;
alter table client_stores add column if not exists lista_engajados_30 int;
alter table client_stores add column if not exists lista_engajados_60 int;
alter table client_stores add column if not exists lista_engajados_90 int;
alter table client_stores add column if not exists lista_crescimento_mensal numeric(7,4);
alter table client_stores add column if not exists sms_consent_pct numeric(5,4);

-- ── Materiais externos ────────────────────────────────────────────────
alter table client_stores add column if not exists figma_onboarding_url text;
alter table client_stores add column if not exists figma_emails_url text;
alter table client_stores add column if not exists drive_folder_url text;

comment on column client_stores.cores is 'jsonb array [{name, hex, use?}] — paleta da marca conforme aplicada no site';
comment on column client_stores.fontes is 'jsonb {titulo, corpo} — família tipográfica para títulos e corpo';
comment on column client_stores.brand_manual_url is 'URL pública (PDF) do manual da marca exibido como CTA "Manual" na seção Marca';
comment on column client_stores.research_doc_url is 'URL pública do documento de pesquisa exibido como CTA "Documento de pesquisa"';
