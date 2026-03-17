---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
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

### Impacto

Um atacante autenticado com qualquer role (admin/manager/coo/cs) pode enviar campos arbitrarios:
- `{ id: "...", auth_user_id: "attacker-uuid" }` → hijack de portal user
- `{ id: "...", client_id: "outro-client" }` → acesso cross-tenant
- `{ id: "...", permissions: { manage_stores: true, ... } }` → escalacao de privilegio

### Classificacao OWASP

A01 - Broken Access Control (Mass Assignment)

## Acceptance Criteria

### AC1: Schema de validacao Zod para campos permitidos
- [ ] Criar schema Zod com campos permitidos: `name`, `phone`, `is_active`, `permissions`
- [ ] Rejeitar request com 400 se campos nao-permitidos forem enviados
- [ ] Nunca usar spread operator do body diretamente no `.update()`

### AC2: Testes de protecao
- [ ] Testar que campos como `auth_user_id`, `client_id`, `role` sao rejeitados
- [ ] Testar que campos permitidos funcionam normalmente
- [ ] Testar que body vazio retorna 400

## Arquivos Afetados

- `src/app/api/portal-users/route.ts` — PATCH handler (linhas 277-288)

## Notas Tecnicas

O endpoint `POST /api/admin/portal-users/route.ts` ja usa Zod validation — seguir o mesmo padrao.
