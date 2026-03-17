# Revisao Geral — Auditoria Completa do Codebase

**Data:** 2026-03-17
**Agentes envolvidos:** QA, Dev, Architect, Data Engineer, Analyst, SM, PO

Auditoria completa do codebase por 7 agentes especializados.
~100 achados organizados em 3 sprints de correcao.

---

## Sprint 1 — Seguranca & Estabilidade (URGENTE)

| Story | Titulo | Severidade | Esforco |
|-------|--------|-----------|---------|
| RG-S1 | Fix mass assignment em portal-users PATCH | CRITICAL | LOW |
| RG-S2 | Remover exec_sql RPC e debug endpoint | CRITICAL | LOW |
| RG-S3 | Fix cron auth bypass em store-alerts-check | CRITICAL | LOW |
| RG-D1 | Fix USING(true) em 6 tabelas | CRITICAL | MEDIUM |
| RG-D2 | Adicionar SET search_path em SECURITY DEFINER functions | CRITICAL | LOW |
| RG-D3 | Fix is_org_owner() deprecado em policies e helpers | HIGH | MEDIUM |
| RG-S5 | Validar store_id ownership em integrations/save | HIGH | LOW |
| RG-S6 | Adicionar requireRole no DELETE clients/manage | HIGH | LOW |
| RG-S7 | Nao skipar webhook verification quando secret ausente | HIGH | LOW |

## Sprint 2 — Metricas & Bugs

| Story | Titulo | Severidade | Esforco |
|-------|--------|-----------|---------|
| RG-M1 | Padronizar open rate (opens/delivered everywhere) | CRITICAL | MEDIUM |
| RG-M2 | Cap recovery rate em 100% + fix weighted averages | HIGH | LOW |
| RG-M3 | Fix timezone hardcoded no portal dashboard | HIGH | LOW |
| RG-M4 | Fix click rate unit inconsistency (decimal vs %) | MEDIUM | MEDIUM |
| RG-B1 | Tornar delete+insert transacional em sync-persistence | HIGH | MEDIUM |
| RG-B2 | Fix orgId empty string em portal-auth | HIGH | LOW |
| RG-B3 | Distinguir encryption error de missing key no cron | HIGH | LOW |
| RG-B4 | Fix self-fetch HTTP anti-pattern em portal store report | HIGH | MEDIUM |

## Sprint 3 — Refatoracao & Tech Debt

| Story | Titulo | Severidade | Esforco |
|-------|--------|-----------|---------|
| RG-A1 | AuthContext unificado (eliminar queries duplicadas) | HIGH | MEDIUM |
| RG-A2 | Extrair services das API routes gigantes | HIGH | HIGH |
| RG-A3 | Eliminar resolveOrgId duplicados + padronizar responses | MEDIUM | LOW |
| RG-D4 | Adicionar indexes nas FKs faltando + paginacao | MEDIUM | LOW |
| RG-S8 | timingSafeEqual em todos HMAC/secret comparisons | MEDIUM | LOW |
| RG-S9 | Migrar rate limiting para Redis/Upstash | HIGH | MEDIUM |
