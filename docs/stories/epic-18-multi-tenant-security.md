# Epic 18 — Multi-Tenant Security Hardening

**Status:** Ready for Development
**Prioridade:** CRITICA
**Owner:** @dev (Dex)
**SM:** @sm (River)

---

## Contexto

Auditoria de seguranca (2026-03-05) revelou vazamento de dados multi-tenant no portal do cliente. Tres problemas combinados permitem que portal users vejam dados de OUTROS clientes:

1. **11+ RLS policies legacy com `USING(true)`** em tabelas criticas anulam todas as policies hardened
2. **Portal routes usam `supabase` (user RLS)** para queries que dependem das bypass policies
3. **`dashboard_cache` SELECT permite cross-org** sem filtrar qual org

### O que JA esta correto
- API routes do portal filtram por `client_id` no codigo aplicacional
- `store_id` e validado contra lojas do cliente antes do uso
- Tabelas `klaviyo_*_metrics` e `store_revenue_summary` tem policies RLS corretas
- Policies hardened existem em `client_stores`, `clients`, `client_portal_users` (mas sao anuladas pelas legacy)

---

## Stories

| # | Story | Fase | Tipo | Prioridade | Dependencia |
|---|-------|------|------|------------|-------------|
| 18.1.1 | Fix Portal Auth + Invoices Routes | P0 | Codigo | CRITICA | Nenhuma |
| 18.1.2 | Drop Legacy Bypass RLS Policies Batch 1 | P0 | Migration | CRITICA | 18.1.1 deployada |
| 18.1.3 | Drop Bypass Policies Batch 2 | P0 | Migration | CRITICA | 18.1.1 deployada |
| 18.1.4 | Defense-in-Depth Portal Dashboard | P1 | Codigo + Migration | ALTA | P0 completo |
| 18.1.5 | Audit All Portal Routes Scoping | P1 | Codigo/Auditoria | ALTA | P0 completo |
| 18.1.6 | Hardening: Activity Table + Helpers | P2 | Migration + Codigo | MEDIA | P1 completo |

---

## Dependencias

```
18.1.1 (codigo - auth + invoices fix)
    |
    v [DEPLOY OBRIGATORIO]
18.1.2 (drop bypass batch 1: 12 policies, 6 tabelas) ---+
18.1.3 (drop bypass batch 2: charges, subscriptions, reports) ---+ [paralelo com 18.1.2]
    |
    v [P0 completo]
18.1.4 (defense-in-depth: org_id + dashboard_cache policy) ---+
18.1.5 (audit all portal routes) ---+ [paralelo com 18.1.4]
    |
    v [P1 completo]
18.1.6 (hardening: activity table + helper + tech debt)
```

**REGRA CRITICA:** 18.1.1 DEVE estar deployada em producao ANTES de executar 18.1.2 ou 18.1.3. Se as bypass policies forem removidas antes do fix de codigo, login portal e invoices QUEBRAM.

---

## Metricas de Sucesso

| Metrica | Antes | Depois |
|---------|-------|--------|
| Bypass policies em tabelas portal | 11+ | 0 |
| Portal routes com user RLS em tabelas sem policy | 2 (auth POST, invoices) | 0 |
| dashboard_cache cross-org leak | Sim | Nao |
| fetchKlaviyoFromCache com org_id | Nao | Sim |
| client_portal_activity funcional | Nao (tabela nao existe) | Sim |

---

## QA Review da Story 18.1 (plano original)

**Reviewer:** Quinn (QA Agent)
**Date:** 2026-03-05
**Verdict:** APROVADO COM RESSALVAS
- GAP-1: meetings/meeting_participants esquecidos -> incorporados em 18.1.2
- GAP-2: invoices route quebraria -> incorporado em 18.1.1
- GAP-3: integrations bypass nao tratada -> documentada em 18.1.5
- GAP-4: 50+ bypass policies admin-only -> futuro Story 18.2
- GAP-5: client_notification_preferences dead code -> documentado em 18.1.6
- GAP-6: client_portal_activity tabela nao existe -> criada em 18.1.6

---

## Riscos

- **R1:** Deploy sequencial obrigatorio (codigo antes de migration)
- **R2:** Rotas nao mapeadas podem quebrar apos drop de bypass policies
- **R3:** `dashboard_cache` JOIN com `client_portal_users` pode ser impactado (R6 do QA)
- **R4:** 50+ bypass policies em tabelas admin-only permanecem (escopo de Story 18.2 futura)
