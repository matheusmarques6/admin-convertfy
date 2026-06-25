-- =============================================
-- ROLES SIMPLIFICATION (Minimal) — PARTE 1/2: expansao do ENUM
-- =============================================
-- Adiciona os 4 valores novos ao ENUM org_role atual. NAO dropa o ENUM nem
-- altera a coluna org_members.role — isso evita o erro
--   "cannot alter type of a column used in a policy definition"
-- (ha ~15 policies RLS e 3 triggers que referenciam org_members.role com
-- literais antigos). O gating do app le a junction org_member_roles, entao o
-- ENUM manter os valores antigos e' inofensivo.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE nao pode ser USADO na mesma transacao
-- em que e' adicionado (Postgres recusa com "unsafe use of new value"). Por
-- isso o backfill que consome esses valores vive na PARTE 2/2
-- (20260802_roles_junction.sql), que roda numa transacao posterior.
--
-- Rode este arquivo PRIMEIRO e separadamente do 20260802.

ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'dev';
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'suporte';
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'implementacao';
-- 'coo' e 'designer' ja existem (20260301_add_coo_role / 20250125_02).
