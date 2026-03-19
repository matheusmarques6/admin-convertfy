# Epic 56 — Security Hardening: Authorization & RLS Fixes

**Status:** Ready for Development
**Prioridade:** CRITICA
**Owner:** @dev (Dex)
**SM:** @sm (River)

---

## Contexto

Auditoria de seguranca (2026-03-19, doc: `docs/qa/security-audit-4vulns-2026-03-19.md`) encontrou 5 vulnerabilidades (4 originais + 1 descoberta pelo QA que expandiu a Vuln 1 para 7 tabelas).

O projeto usa Next.js 15 + Supabase, multi-tenant via `org_id`. Duas camadas de auth separadas:
- **Admin**: `profiles -> org_members -> orgs -> stores` (usa `requireStoreAccess`)
- **Portal**: `client_portal_users -> clients -> stores` (usa `getPortalUser()`)

**Todas as correcoes afetam APENAS o lado admin.** Portal nao e afetado — usa `adminClient`/`service_role` que bypassa RLS.

### O que JA esta correto
- Migration `20250215_fix_rls_using_true.sql` corrigiu ~50 policies legacy em 2025
- `requireStoreAccess()` existe e funciona em ~15 rotas
- `resolveOrgId()` funciona e e usado em rotas sem store_id
- `updateStoreCredentials()` tem defense-in-depth via `orgId` option (quando passado)
- Portal routes filtram por `client_id` no codigo aplicacional

### O que FALTA corrigir
1. **7 tabelas** com `USING(true)` que escaparam da migration de 2025
2. **OAuth authorize** sem validacao de ownership do store_id
3. **OAuth callback** sem passar `orgId` para `updateStoreCredentials()`
4. **Onboarding store-data** usa `adminClient` sem nenhum ownership check
5. **Integrations save** sem `requireStoreAccess` granular (so tem `resolveOrgId`)

---

## Stories

| # | Story | Fase | Tipo | Prioridade | Esforco | Dependencia |
|---|-------|------|------|------------|---------|-------------|
| 56.1 | Fix RLS USING(true) em 7 tabelas | P1 | Migration | HIGH | LOW | Nenhuma |
| 56.2 | OAuth authorize + requireStoreAccess | P0 | Codigo | HIGH | LOW-MEDIUM | Nenhuma |
| 56.3 | OAuth callback + orgId propagation | P0 | Codigo | HIGH | LOW | 56.2 |
| 56.4 | Onboarding store-data ownership check | P0 | Codigo | HIGH | MEDIUM | Nenhuma |
| 56.5 | Integrations save + requireStoreAccess | P2 | Codigo | MEDIUM | LOW | Nenhuma |

---

## Dependencias

```
56.1 (migration: 7 tabelas RLS) -------- independente
56.2 (OAuth authorize + store access) ---+
    |                                     |
    v                                     |
56.3 (OAuth callback + orgId) -----------+ [depende de 56.2]
56.4 (onboarding store-data) ------------ independente
56.5 (integrations save) ---------------- independente
```

### Ordem de execucao recomendada

1. **56.1** — Migration SQL, sem risco de quebrar nada (service_role bypassa RLS)
2. **56.2** — OAuth authorize, bloqueia ataques na origem
3. **56.3** — OAuth callback, complementa 56.2 com defense-in-depth
4. **56.4** — Onboarding store-data, corrige IDOR mais critico (PII exposure)
5. **56.5** — Integrations save, hardening incremental

> **56.2 e 56.4 podem ser paralelas** se devs diferentes implementarem. 56.3 DEVE vir apos 56.2.

---

## Metricas de Sucesso

| Metrica | Antes | Depois |
|---------|-------|--------|
| Tabelas com `USING(true)` para `TO authenticated` | 7 | 0 |
| OAuth routes validando store ownership | 0/4 | 4/4 |
| OAuth callbacks passando orgId | 0/2 | 2/2 |
| Onboarding store-data com ownership check | Nao | Sim |
| /api/integrations/save com requireStoreAccess | Nao | Sim |

---

## Referencia

- Auditoria completa: `docs/qa/security-audit-4vulns-2026-03-19.md`
- Migration precedente: `supabase/migrations/20250215_fix_rls_using_true.sql`
- Epic 18 (precedente de seguranca): `docs/stories/epic-18-multi-tenant-security.md`
- `requireStoreAccess`: `src/lib/api/require-store-access.ts`
- `resolveOrgId`: `src/lib/api/resolve-org.ts`

---

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-19 | @sm | Epic criado a partir de auditoria de seguranca (5 vulns) |
