---
Prioridade: High
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: LOW
---

# Story RG-B2 — Fix orgId Empty String em portal-auth

## Story

**Como** desenvolvedor,
**Quero** que `resolvePortalClient` retorne `null` em vez de `""` quando orgId nao esta disponivel,
**Para que** queries downstream nao filtrem por `org_id = ""` (que nunca retorna nada).

## Contexto

### Problema

```typescript
// src/lib/api/portal-auth.ts:71
const orgId = stores[0]?.org_id ?? ""
```

Quando um client nao tem stores, `orgId` e `""` (empty string). Empty string e truthy em JS, entao downstream:

```typescript
if (orgId) query.eq("org_id", orgId)  // Filtra por org_id = "" — nunca match!
```

Dados que deveriam ser visiveis ficam invisiveis.

## Acceptance Criteria

### AC1: Fix
- [ ] Alterar para `const orgId = stores[0]?.org_id ?? null`
- [ ] Ou usar `const orgId = stores[0]?.org_id || null` (trata "" como falsy)

### AC2: Verificar downstream
- [ ] Grep por usos de `ctx.orgId` no portal — todos devem tratar `null` corretamente
- [ ] `fetchKlaviyoFromCache` e outros: `if (orgId)` check ja funciona com `null`

## Arquivos Afetados

- `src/lib/api/portal-auth.ts:71`
