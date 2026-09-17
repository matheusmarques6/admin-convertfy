-- 99 · Rollback completo do import do parceiro Luan. DESTRUTIVO: só rodar com confirmação do Bruno.
begin;
delete from crm_deal_activities where deal_id in (select id from deals where source = 'parceiro:luan-souza')
   or lead_id in (select id from crm_leads where source = 'parceiro:luan-souza');
delete from deals where source = 'parceiro:luan-souza';
delete from crm_leads where source = 'parceiro:luan-souza';
delete from pipeline_stages where pipeline_id in (select id from pipelines where name = 'Parceiro Luan · Black Friday 2026');
delete from pipelines where name = 'Parceiro Luan · Black Friday 2026';
-- campos e parceiro são reaproveitáveis; descomente se quiser remover
-- delete from crm_custom_fields where org_id = 'd1ae3cf9-558d-40cc-9272-4a5633894ef8' and entity_type = 'deal'
--   and key in ('segmento_parceiro','prioridade','score_parceiro','parceiro_etapa','parceiro_status','parceiro_qualificacao','parceiro_closer','parceiro_ultima_interacao','angulo_abordagem','alerta_dados','maturidade_loja','plataforma_loja','ferramenta_email_atual','nicho','tentativas_contato','proximo_contato');
-- delete from crm_partners where name = 'Luan Souza';
commit;
