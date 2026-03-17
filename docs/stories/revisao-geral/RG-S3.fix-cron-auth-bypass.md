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

# Story RG-S3 — Fix Cron Auth Bypass em store-alerts-check

## Story

**Como** engenheiro de seguranca,
**Quero** que todos os cron endpoints rejeitem requests quando CRON_SECRET nao esta configurado,
**Para que** misconfiguracao de env vars nao resulte em endpoints abertos.

## Contexto

### Problema

Em `store-alerts-check/route.ts`, a verificacao do CRON_SECRET e condicional:

```typescript
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
```

Quando `cronSecret` e `undefined` (env var nao setada), a condicao inteira e `false` e o request passa direto. Outros cron endpoints (sync-reports, board-automation, tracking-sync) ja usam a logica correta.

### Padrao correto (ja usado em outros crons)

```typescript
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
```

## Acceptance Criteria

### AC1: Fix store-alerts-check
- [ ] Alterar logica para `if (!cronSecret || authHeader !== ...)` em `store-alerts-check`
- [ ] Request sem CRON_SECRET configurado deve retornar 401

### AC2: Padronizar todos os cron endpoints
- [ ] Auditar TODOS os cron endpoints para verificar mesma logica
- [ ] Crons a verificar: `sync-reports`, `tracking-sync`, `board-automation`, `google-calendar-sync`, `store-alerts-check`
- [ ] Todos devem usar `if (!cronSecret || authHeader !== ...)`

### AC3: Considerar helper centralizado
- [ ] Criar `requireCronAuth(request)` em `src/lib/api/` para reutilizar em todos os crons
- [ ] Migrar todos os cron endpoints para usar o helper

## Arquivos Afetados

- `src/app/api/cron/store-alerts-check/route.ts` — fix principal
- `src/app/api/cron/*/route.ts` — padronizar todos
- `src/lib/api/` — novo helper `requireCronAuth`
