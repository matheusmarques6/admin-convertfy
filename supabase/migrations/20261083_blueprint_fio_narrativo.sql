-- 20261083 — Fase 3 do Estruturador: consumo do output (ADR
-- adr-estruturador-adaptativo).
--
-- `store_email_blueprints.fio_narrativo`: o fio que liga as posições da
-- estrutura decidida pelo Estruturador (modo 'on'). Persistido no blueprint
-- da loja porque é DALI que o consumidor lê (loadEffectiveBlueprint usa
-- select('*') — a coluna viaja sozinha até o payload do n8n e o EMAIL_IDEIA
-- do agente de imagem). NULL = geração sem Estruturador (outline) — todos os
-- consumidores caem no `messaging`, comportamento de antes.
alter table store_email_blueprints
  add column if not exists fio_narrativo text;
