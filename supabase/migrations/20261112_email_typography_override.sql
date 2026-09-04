-- 20261112 — ajuste de tipografia POR E-MAIL.
--
-- A tipografia de uma peça é decidida em dois lugares hoje, os dois fora do
-- alcance de quem revisa: `normalizeFonts` carimba a fonte cadastrada na
-- montagem, e o agente de Tipografia corrige por cima no STEP 3.5. Quem abre
-- o e-mail no Workspace e vê que o preço ficou pequeno não tem o que fazer
-- na tela.
--
-- POR QUE NÃO É `store_brand_identity`: aquela tabela é a identidade da
-- marca — versionada, com `confirmed_at` que abre o GATE 2 da fase 2, e lida
-- por todo mundo (imagem, HTML, montagem). Ajustar a fonte de UM e-mail não
-- pode criar versão nova da identidade nem pedir re-aprovação, e não pode
-- vazar para as outras peças. Decisão do owner em 04/09: "só este e-mail".
--
-- FORMA:
--   {
--     "fontes": { "heading": "Sora", "heading_weight": "700",
--                 "body": "Inter", "body_weight": "400" } | null,
--     "ops": [ { "item": 14, "familia": "...", "peso": 700, "tamanho_px": 40,
--                "caixa": "alta", "tracking": "0.06em", "motivo": "..." } ],
--     "atualizado_em": "2026-09-04T...", "atualizado_por": "<uuid>"
--   }
--
-- O QUE SOBREVIVE A UM RE-RENDER: só `fontes`. Elas são escolha de FAMÍLIA e
-- são relidas na montagem e no prompt do tipógrafo. As `ops` endereçam por
-- ÍNDICE do inventário, e um re-render regera o documento — o item 14 deixa
-- de ser o mesmo elemento. Replay por índice depois disso escreveria no
-- lugar errado com cara de sucesso; por isso elas ficam guardadas como
-- registro do que a pessoa fez (e do que o tipógrafo deve respeitar na
-- próxima geração), não como script de replay.
--
-- Nenhum CHECK novo em `email_generation_runs.agent`: `typography` já foi
-- liberado na 20261110, e a rota de "Repensar" reusa esse mesmo nome.

alter table public.email_flow_emails
  add column if not exists typography_override jsonb;

comment on column public.email_flow_emails.typography_override is
  'Ajuste de tipografia desta peça, feito na tela (modo Editar). NÃO é identidade da marca: store_brand_identity é versionada e aprovada, e vale para tudo. Só `fontes` sobrevive a um re-render; `ops` endereçam por índice do inventário e viram registro, não replay.';

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'email_flow_emails'
   and column_name = 'typography_override';
