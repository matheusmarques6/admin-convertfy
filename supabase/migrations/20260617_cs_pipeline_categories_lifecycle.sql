-- ============================================================
-- Reorganiza categorias dos pipelines CS por lifecycle
-- ============================================================
-- Antes: categorias mistas e desbalanceadas (Operacoes=5 mistura tudo,
--   Acompanhamento=1, Calls=1, Configuracao=1, Renovacao=2)
-- Agora: agrupamento lifecycle-based, ~2-3 pipelines por grupo:
--
--   1. Onboarding       — Onboarding 30d
--   2. Saude            — Gestao de Carteira, Acompanhamento Semanal
--   3. Engajamento      — Calls Mensais, Feedback Mensal
--   4. Atendimento      — Tickets de Cliente, Implementacoes & Campanhas
--   5. Renovacao        — Renovacao de Contrato, Win-back
--   6. Configuracao     — Cadencias CS
--
-- A categoria 'Configuracao' fica visualmente segregada pois nao eh
-- workflow operacional, eh setting.

UPDATE pipelines SET category = 'Onboarding'   WHERE name = 'Onboarding 30d'             AND scope = 'cs';
UPDATE pipelines SET category = 'Saude'        WHERE name = 'Gestao de Carteira'         AND scope = 'cs';
UPDATE pipelines SET category = 'Saude'        WHERE name = 'Acompanhamento Semanal'     AND scope = 'cs';
UPDATE pipelines SET category = 'Engajamento'  WHERE name = 'Calls Mensais'              AND scope = 'cs';
UPDATE pipelines SET category = 'Engajamento'  WHERE name = 'Feedback Mensal'            AND scope = 'cs';
UPDATE pipelines SET category = 'Atendimento'  WHERE name = 'Tickets de Cliente'         AND scope = 'cs';
UPDATE pipelines SET category = 'Atendimento'  WHERE name = 'Implementacoes & Campanhas' AND scope = 'cs';
UPDATE pipelines SET category = 'Renovacao'    WHERE name = 'Renovacao de Contrato'      AND scope = 'cs';
UPDATE pipelines SET category = 'Renovacao'    WHERE name = 'Win-back'                   AND scope = 'cs';
UPDATE pipelines SET category = 'Configuracao' WHERE name = 'Cadencias CS'               AND scope = 'cs';
