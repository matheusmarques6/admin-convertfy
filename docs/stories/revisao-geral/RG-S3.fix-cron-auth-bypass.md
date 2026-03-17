---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Done
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
Batch: 2 (apos Batch 1, combinar com RG-S8)
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

Quando `cronSecret` e `undefined` (env var nao setada), a condicao inteira e `false` e o request passa direto.

### Status dos outros cron endpoints (verificado na review)

| Cron | Padrao | Status |
|------|--------|--------|
| `sync-reports` | `!cronSecret \|\|` | CORRETO |
| `tracking-sync` | `!cronSecret \|\|` | CORRETO |
| `board-automation` | `!cronSecret \|\|` | CORRETO |
| `google-calendar-sync` | `!cronSecret \|\|` | CORRETO |
| `store-alerts-check` | `cronSecret &&` | **VULNERAVEL** |

**Apenas 1 de 5 crons e vulneravel** — os outros 4 ja usam o padrao correto.

### Padrao de referencia no codebase

`src/lib/api/n8n-auth.ts` ja tem `requireWebhookSecret()` que faz exatamente o padrao correto: rejeita quando secret ausente, usa `timingSafeEqual`, lanca `AppError`. Usar como modelo.

## Acceptance Criteria

### AC1: Fix store-alerts-check
- [x] Alterar logica para `if (!cronSecret || authHeader !== ...)` em `store-alerts-check`
- [x] Request sem CRON_SECRET configurado deve retornar 401

### AC2: Criar helper centralizado requireCronAuth
- [x] Criar `requireCronAuth(request)` em `src/lib/api/cron-auth.ts`
- [x] Modelar a partir de `requireWebhookSecret` em `n8n-auth.ts`
- [x] DEVE usar `crypto.timingSafeEqual` desde o inicio (resolve RG-S8 AC2 simultaneamente)
- [x] Lancar `AppError` ou retornar `NextResponse` de erro
- [x] Tratar caso de `byteLength` diferente (timingSafeEqual lanca se buffers tem tamanhos diferentes)

### AC3: Migrar todos os cron endpoints para o helper
- [x] `store-alerts-check` — fix + migrar
- [x] `sync-reports` — migrar para helper
- [x] `tracking-sync` — migrar para helper
- [x] `board-automation` — migrar para helper
- [x] `google-calendar-sync` — migrar para helper

### Referencia de implementacao

```typescript
// src/lib/api/cron-auth.ts
import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"

export function requireCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error("CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const expected = `Bearer ${cronSecret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)

  if (a.byteLength !== b.byteLength || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null // authenticated OK
}
```

## Arquivos Afetados

- `src/app/api/cron/store-alerts-check/route.ts` — fix principal
- `src/app/api/cron/sync-reports/route.ts` — migrar para helper
- `src/app/api/cron/tracking-sync/route.ts` — migrar para helper
- `src/app/api/cron/board-automation/route.ts` — migrar para helper
- `src/app/api/cron/google-calendar-sync/route.ts` — migrar para helper
- `src/lib/api/cron-auth.ts` — NOVO helper

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA. Apenas store-alerts-check e vulneravel (1/5).
- **Severidade:** CRITICAL — concordo. Em misconfiguracao, qualquer pessoa na internet pode triggerar alertas.
- **Nota:** Combinar com RG-S8 para evitar tocar nos mesmos 5 arquivos duas vezes.

### DBM
- **Impacto DB:** MEDIUM. Acessa metadados de store e alertas, nao credenciais.
- **Migration:** NAO necessaria.

### Arquiteto (Aria)
- **Aprovar.** Modelar de `n8n-auth.ts` (precedente no codebase). Incluir `timingSafeEqual` desde o inicio.
- **Atencao:** Cron handlers NAO usam `errorResponse()` — o helper deve retornar `NextResponse | null` em vez de lancar, ou adaptar o catch dos handlers.

### Dev (Dex)
- **Pronto.** ~45 linhas (helper + migracoes). Combinar com RG-S8.

## Implementacao (2026-03-17)

**Commit:** `7f438c9` — pushed to main
**Arquivos criados:**
- `src/lib/api/cron-auth.ts` — helper `requireCronAuth()` com `timingSafeEqual`

**Arquivos modificados:**
- `src/app/api/cron/store-alerts-check/route.ts` — fix do padrao vulneravel `cronSecret &&`
- `src/app/api/cron/sync-reports/route.ts` — migrado para helper
- `src/app/api/cron/tracking-sync/route.ts` — migrado para helper
- `src/app/api/cron/board-automation/route.ts` — migrado para helper
- `src/app/api/cron/google-calendar-sync/route.ts` — migrado para helper
- `src/app/api/tracking/debug-live/route.ts` — bonus: mesmo padrao encontrado durante audit

**O que foi feito:**
- Helper centralizado `requireCronAuth(request)` criado com `crypto.timingSafeEqual`
- Rejeita quando `CRON_SECRET` nao configurado (500), quando header ausente (401), quando secret invalido (401)
- Tratamento de `byteLength` diferente antes de `timingSafeEqual`
- Todos os 5 crons + tracking/debug-live migrados para o helper
- Padrao vulneravel `cronSecret &&` eliminado do codebase
- Combinado com RG-S8 (timingSafeEqual) conforme recomendado
- TypeScript compila limpo

**QA Gate:** PASS — vulnerabilidade de bypass corrigida, helper centralizado com timing-safe comparison.
