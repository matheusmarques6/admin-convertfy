-- Pesquisa & Diagnóstico · Pilar 3 (Cliente Ideal) — blocos analíticos avançados
-- Expande o ICP com 5 blocos novos do redesign da aba Contexto:
--   consciência (Schwartz), starving crowd, mecanismo único, objeções e vocabulário.
-- Todos nullable — preenchimento via n8n (webhook /api/webhooks/n8n/icp), edição
-- manual (PATCH /api/admin/stores/[id]/context) ou regeneração com IA (objeções).

alter table client_stores add column if not exists icp_awareness jsonb;
alter table client_stores add column if not exists icp_starving_crowd jsonb;
alter table client_stores add column if not exists icp_unique_mechanism jsonb;
alter table client_stores add column if not exists icp_objections jsonb;
alter table client_stores add column if not exists icp_vocabulary jsonb;

comment on column client_stores.icp_awareness is
  'jsonb {dominant, levels:[{key,label,pct}] (5 buckets Schwartz, soma 100), copy_implication} — Nível de consciência do tráfego';
comment on column client_stores.icp_starving_crowd is
  'jsonb {verdict, scores:[{key,label,value(0-5),note}] (4 eixos), total(0-20)} — Starving Crowd';
comment on column client_stores.icp_unique_mechanism is
  'jsonb {headline, body} — Mecanismo único (body aceita **negrito** markdown-leve)';
comment on column client_stores.icp_objections is
  'jsonb array [{objection, treatment}] — 5 objeções principais e como tratar';
comment on column client_stores.icp_vocabulary is
  'jsonb array [{type:Dor|Desejo|Objeção|Marca, channel, quote}] — vocabulário literal da cliente';
