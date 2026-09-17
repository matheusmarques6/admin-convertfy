-- 01 · Estrutura: pipeline, 16 colunas, 16 campos de deal, parceiro Luan Souza. Idempotente. JÁ EXECUTADO em produção em 17/09/2026.
begin;
insert into pipelines (name, description, scope, category, color, layout, is_default, is_archived)
select 'Parceiro Luan · Black Friday 2026', 'Prospecção ativa da lista do parceiro Luan Souza (mentoria de dropshipping global) para BFCM 2026', 'sales', 'Comerciais', '#111111', 'kanban', false, false
where not exists (select 1 from pipelines where name = 'Parceiro Luan · Black Friday 2026' and not is_archived);

with p as (select id from pipelines where name = 'Parceiro Luan · Black Friday 2026' and not is_archived limit 1),
s(ord, name, stype, sla, descr, exitc) as (values
  (1, 'A · Aluno Luan', 'open'::stage_type, 24, 'Comprou a mentoria do Luan', 'Mensagem 1 enviada (depois da intro do Luan)'),
  (2, 'B · Fez call, não comprou', 'open'::stage_type, 48, 'Fez sessão estratégica e não fechou', 'Mensagem 1 enviada'),
  (3, 'C · Agendou, não fez call', 'open'::stage_type, 48, 'Agendou e não compareceu, esfriou ou perdeu antes da call', 'Mensagem 1 enviada'),
  (4, 'D · MQL sem conversa', 'open'::stage_type, 72, 'Só cadastro qualificado, nunca conversou', 'Mensagem 1 enviada'),
  (5, 'Aguardando liberação Luan', 'open'::stage_type, 168, 'Em negociação ativa com o Luan', 'Luan libera (vai para B) ou fecha (vai para A)'),
  (6, 'T1 · Abordado', 'open'::stage_type, 48, 'Mensagem 1 enviada', 'Respondeu ou 48h sem resposta'),
  (7, 'T2 · Follow-up com valor', 'open'::stage_type, 72, 'Mandou o ativo (calendário/checklist BF)', 'Respondeu ou 72h sem resposta'),
  (8, 'T3 · Último toque', 'open'::stage_type, 48, 'Mensagem de encerramento enviada', 'Respondeu ou 48h sem resposta'),
  (9, 'Respondeu · qualificar', 'open'::stage_type, 24, 'Respondeu qualquer toque', 'Maturidade da loja preenchida'),
  (10, 'Diagnóstico agendado', 'open'::stage_type, null, 'Call de 20 min marcada', 'Call feita ou no-show'),
  (11, 'Diagnóstico feito', 'open'::stage_type, 24, 'Call realizada', 'Proposta enviada'),
  (12, 'Proposta enviada', 'open'::stage_type, 48, 'Proposta enviada', 'Aceite ou recusa'),
  (13, 'Ganho', 'won'::stage_type, null, 'Contrato assinado', ''),
  (14, 'Nutrir · loja sem vendas', 'archived'::stage_type, null, 'Sem loja, em construção ou no ar sem vendas', ''),
  (15, 'Perdido · sem resposta', 'lost'::stage_type, null, '3 toques sem resposta', ''),
  (16, 'Perdido · sem interesse/fit', 'lost'::stage_type, null, 'Recusou, pediu pra sair ou sem fit', '')
)
insert into pipeline_stages (pipeline_id, name, "order", stage_type, sla_hours, description, exit_criteria)
select p.id, s.name, s.ord, s.stype, s.sla, s.descr, s.exitc from p, s
where not exists (select 1 from pipeline_stages x where x.pipeline_id = p.id and x.name = s.name);

with f(key, label, ftype, opts, pos) as (values
  ('segmento_parceiro', 'Segmento (lista parceiro)', 'select'::crm_custom_field_type, '["A · Aluno Luan", "B · Fez call, não comprou", "C · Agendou, não fez call", "D · MQL sem conversa", "Aguardando liberação Luan"]'::jsonb, 20),
  ('prioridade', 'Prioridade', 'select'::crm_custom_field_type, '["P1", "P2", "P3", "P4"]'::jsonb, 21),
  ('score_parceiro', 'Score (lista parceiro)', 'number'::crm_custom_field_type, '[]'::jsonb, 22),
  ('parceiro_etapa', 'Etapa no funil do parceiro', 'select'::crm_custom_field_type, '["Reunião", "Agendamento", "MQL"]'::jsonb, 23),
  ('parceiro_status', 'Status no CRM do parceiro', 'text'::crm_custom_field_type, '[]'::jsonb, 24),
  ('parceiro_qualificacao', 'Qualificação do parceiro', 'select'::crm_custom_field_type, '["SQL", "MQL", "Lead", "(vazio)"]'::jsonb, 25),
  ('parceiro_closer', 'Closer do parceiro', 'text'::crm_custom_field_type, '[]'::jsonb, 26),
  ('parceiro_ultima_interacao', 'Última interação no parceiro', 'date'::crm_custom_field_type, '[]'::jsonb, 27),
  ('angulo_abordagem', 'Ângulo de abordagem', 'text'::crm_custom_field_type, '[]'::jsonb, 28),
  ('alerta_dados', 'Alerta de dados', 'text'::crm_custom_field_type, '[]'::jsonb, 29),
  ('maturidade_loja', 'Maturidade da loja', 'select'::crm_custom_field_type, '["Sem loja", "Em construção", "No ar sem vendas", "Vendendo"]'::jsonb, 30),
  ('plataforma_loja', 'Plataforma da loja', 'select'::crm_custom_field_type, '["Shopify", "Nuvemshop", "Yampi", "Cartpanda", "WooCommerce", "Outra"]'::jsonb, 31),
  ('ferramenta_email_atual', 'Ferramenta de e-mail atual', 'select'::crm_custom_field_type, '["Nenhuma", "Klaviyo", "Omnisend", "Mailchimp", "Outra"]'::jsonb, 32),
  ('nicho', 'Nicho', 'text'::crm_custom_field_type, '[]'::jsonb, 33),
  ('tentativas_contato', 'Tentativas de contato', 'number'::crm_custom_field_type, '[]'::jsonb, 34),
  ('proximo_contato', 'Próximo contato', 'date'::crm_custom_field_type, '[]'::jsonb, 35)
)
insert into crm_custom_fields (org_id, entity_type, key, label, field_type, options, position)
select 'd1ae3cf9-558d-40cc-9272-4a5633894ef8', 'deal', f.key, f.label, f.ftype, f.opts, f.pos from f
where not exists (select 1 from crm_custom_fields c where c.org_id = 'd1ae3cf9-558d-40cc-9272-4a5633894ef8' and c.entity_type = 'deal' and c.key = f.key);

insert into crm_partners (name, partner_type, state, notes)
select 'Luan Souza', 'other', 'active', 'Luan Gabriel Souza (@oluanmsouza), mentoria de dropshipping global. Lista compartilhada em 17/09/2026 para prospecção BFCM 2026.'
where not exists (select 1 from crm_partners where name = 'Luan Souza');
commit;
