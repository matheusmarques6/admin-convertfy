---
Prioridade: High
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@architect, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: MEDIUM
---

# Story RG-A1 — AuthContext Unificado (Eliminar Queries Duplicadas)

## Story

**Como** desenvolvedor,
**Quero** um AuthContext unico que faca um fetch de auth info e exponha metodos de check,
**Para que** rotas nao gastem 4-5 queries de DB so em autenticacao.

## Contexto

### Problema

3 abstraccoes de auth fazem queries independentes:
- `requireRole` → `profiles.select("role")`
- `getPermissionContext` → `profiles.select("role")` + `org_members.select("role")`
- `requireFeature` → chama `getPermissionContext` (2 queries) + busca `org_members.id` DE NOVO (3a query) + busca features (4a query)

Uma rota com `requireFeature` gasta 4-5 queries antes de qualquer logica de negocio. Com ~20-50ms por query no Supabase, sao 100-250ms so em auth.

### Proposta

```typescript
interface AuthContext {
  user: User
  profile: { id: string; role: string }
  orgMember: { id: string; role: string; org_id: string } | null
  isAdmin(): boolean
  isOrgOwner(): boolean
  hasFeature(feature: string): Promise<boolean>
  canAccessStore(storeId: string): Promise<boolean>
  resolveOrgId(): string | null
}

// Uso:
const ctx = await getAuthContext(supabase)
if (!ctx.isAdmin() && !await ctx.hasFeature("view_financial")) {
  return errorResponse(request, new ForbiddenError(), "client-charges")
}
```

## Acceptance Criteria

### AC1: Criar AuthContext
- [ ] Criar `src/lib/api/auth-context.ts`
- [ ] Fetch unico: user + profile + org_member em uma query (ou JOIN)
- [ ] Cache features em memoria dentro do context (lazy load)
- [ ] Expor metodos: `isAdmin()`, `isOrgOwner()`, `hasFeature()`, `canAccessStore()`, `resolveOrgId()`

### AC2: Migrar abstraccoes existentes
- [ ] `requireRole` → wrapper sobre AuthContext
- [ ] `requireFeature` → wrapper sobre AuthContext
- [ ] `getPermissionContext` → wrapper sobre AuthContext
- [ ] `resolveOrgId` (5 copias) → usar `ctx.resolveOrgId()`

### AC3: Migracao gradual
- [ ] Migrar 3-5 rotas criticas como prova de conceito
- [ ] Manter abstraccoes antigas como wrappers (nao quebrar rotas existentes)
- [ ] Documentar padrao para rotas novas

## Arquivos Afetados

- `src/lib/api/auth-context.ts` — NOVO
- `src/lib/api/errors.ts` — requireAuth/requireRole como wrappers
- `src/lib/api/check-permission.ts` — refatorar para usar AuthContext
- `src/lib/api/resolve-org.ts` — refatorar para usar AuthContext
