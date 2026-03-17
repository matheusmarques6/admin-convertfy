---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Review
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
Batch: 1 (paralelo com S2, S6)
---

# Story RG-S1 — Fix Mass Assignment em Portal Users PATCH

## Story

**Como** engenheiro de seguranca,
**Quero** que o endpoint PATCH de portal-users valide campos permitidos antes de atualizar,
**Para que** um atacante autenticado nao consiga escalar privilegios ou hijackar portal users.

## Contexto

### Problema

O endpoint `PATCH /api/portal-users` aceita o body inteiro do request e passa diretamente para `.update(updateData)` sem validacao de campos:

```typescript
// src/app/api/portal-users/route.ts linhas 277-288
const body = await request.json()
const { id, ...updateData } = body
// ...
.update(updateData)  // Tudo que vier no body vai pro DB
```

O handler usa `adminClient` (linha 284), que bypassa TODAS as policies RLS da tabela `client_portal_users`. Mesmo a policy "Portal users can update own record" e anulada.

### Impacto

Um atacante autenticado com qualquer role (admin/manager/coo/cs) pode enviar campos arbitrarios:
- `{ id: "...", auth_user_id: "attacker-uuid" }` → hijack de portal user
- `{ id: "...", client_id: "outro-client" }` → acesso cross-tenant
- `{ id: "...", permissions: { manage_stores: true, ... } }` → escalacao de privilegio
- `{ id: "...", is_primary_contact: true }` → impersonar contato principal
- `{ id: "...", email: "attacker@evil.com" }` → hijack comunicacoes

### Classificacao OWASP

A01 - Broken Access Control (Mass Assignment)

## Acceptance Criteria

### AC1: Schema de validacao Zod para campos permitidos
- [x] Criar schema Zod com `.strict()` para campos permitidos: `id` (uuid), `name`, `phone`, `is_active`, `permissions`
- [x] Usar `parseAndValidate(request, schema)` que ja existe em `src/lib/api/errors.ts`
- [x] Rejeitar request com 400 se campos nao-permitidos forem enviados
- [x] Nunca usar spread operator do body diretamente no `.update()`

### AC2: Validar estrutura de permissions
- [x] Permissions deve ser `z.record(z.boolean()).optional()` — nao aceitar nested objects arbitrarios
- [x] Testar que permissions com valores nao-boolean sao rejeitados

### AC3: Testes de protecao
- [x] Testar que campos como `auth_user_id`, `client_id`, `role` sao rejeitados (400)
- [x] Testar que campos permitidos funcionam normalmente (200)
- [x] Testar que body vazio retorna 400
- [x] Testar que campos desconhecidos sao rejeitados (`.strict()`)

## Arquivos Afetados

- `src/app/api/portal-users/route.ts` — PATCH handler (linhas 277-288)

## Notas Tecnicas

- O POST handler no mesmo arquivo ja faz destructuring explicito dos campos (linhas 31-44) — seguir padrao similar
- `parseAndValidate` + `ZodError` handling ja existem em `src/lib/api/errors.ts` (linhas 175-185)
- Zod ja e dependencia do projeto (usado em 15+ arquivos)

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA. adminClient bypassa RLS, textbook OWASP A01.
- **Severidade:** CRITICAL — concordo.
- **Preocupacao:** Validar estrutura interna de `permissions` (JSONB), nao apenas permitir como pass-through.

### DBM
- **Impacto DB:** HIGH. Colunas em risco: `auth_user_id`, `client_id`, `permissions`, `email`, `is_primary_contact`.
- **Migration:** NAO necessaria. Fix e puramente app-layer.
- **Recomendacao extra:** Considerar trigger no PostgreSQL para impedir mudanca de `auth_user_id`/`client_id` apos INSERT (defense-in-depth).

### Arquiteto (Aria)
- **Aprovar.** Usar `parseAndValidate()` + `.strict()` do Zod. Padrao ja existe, zero invencao.
- **Nota adicional:** O handler DELETE neste mesmo arquivo tambem usa adminClient sem verificar se o portal user pertence a org — nao coberto por esta story mas vale investigar.

### Dev (Dex)
- **Pronto para implementar.** ~20 linhas. Zero dependencias externas.
- **Implementacao:** Schema Zod + `parseAndValidate` — drop-in, sem side effects.
