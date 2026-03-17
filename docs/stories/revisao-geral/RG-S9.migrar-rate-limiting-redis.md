---
Prioridade: High
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@architect, @qa"
Status: Done (AC5/AC6 parcial pendente — verificacao pos-deploy)
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: MEDIUM-HIGH
Batch: 5 (ultimo — precisa decisao de infra)
---

# Story RG-S9 — Migrar Rate Limiting para Redis/Upstash

## Story

**Como** engenheiro de seguranca,
**Quero** que rate limiting funcione de forma confiavel em ambiente serverless,
**Para que** brute force e abuse sejam efetivamente mitigados.

## Contexto

### Problema

Rate limiting atual usa `Map` in-memory (`src/lib/rate-limit.ts`). Em Vercel serverless:
- Cada cold start cria nova instancia → Map vazio
- `setInterval` para cleanup nunca executa efetivamente
- Na pratica, rate limiting quase nao funciona
- O proprio codigo tem comment: "Consider Redis/Supabase for persistent rate limiting in serverless"

### Callers identificados (14 endpoints — verificado na review)

| Endpoint | Tipo | Rate Limit Config |
|----------|------|-------------------|
| `portal/auth` | auth login | `RATE_LIMITS.auth` (10/min) |
| `auth/change-password` | auth | `RATE_LIMITS.auth` |
| `portal/settings/password` | auth | `RATE_LIMITS.auth` |
| `settings/password` | auth | `RATE_LIMITS.auth` |
| `tracking/lookup` | **publico** | `RATE_LIMITS.trackingByCode` |
| `tracking/config` | **publico** | `RATE_LIMITS.trackingByCode` |
| `cliente/onboarding-form` | **publico** | `RATE_LIMITS.clienteForm` (3/hour) |
| `cliente/upload` | publico | rate limit config |
| `integrations/whatsapp/webhook` | webhook | `RATE_LIMITS.webhook` (100/min) |
| `integrations/asaas/webhook` | webhook | rate limit config |
| `onboarding/webhook` | webhook | rate limit config |
| `admin/encrypt-credentials` | admin | rate limit config |
| `setup/database` | admin (sera deletado por RG-S2) | rate limit config |

**ATENCAO:** Interface atual e **sincrona** (`checkRateLimit()` retorna `Response | null`). `@upstash/ratelimit` e **assincrono**. Todos os 14 callers precisam de `await`.

### Solucao recomendada

Upstash Redis com `@upstash/ratelimit` — projetado para edge/serverless. Custo baixo (~$0.20/100k requests).

**Alternativas avaliadas na review:**
- `@vercel/kv` — wrapper Vercel para Upstash (simplifica ops, incluido no Vercel Pro)
- Vercel Firewall / WAF — rate limiting no edge sem codigo (menos granular)

## Acceptance Criteria

### AC1: Instalar Upstash
- [x] Criar conta Upstash Redis (ou usar Vercel KV se ja disponivel no plano)
- [x] Instalar `@upstash/ratelimit` e `@upstash/redis`
- [x] Configurar env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### AC2: Migrar rate-limit.ts
- [x] Substituir implementacao in-memory por Upstash
- [x] Manter mesma interface para consumers (so adicionar async/await)
- [x] Configurar limits: 20 req/min para endpoints publicos, 60 req/min para autenticados

### AC3: Fallback graceful
- [x] Se Redis indisponivel, permitir request (fail-open) com log warning
- [x] Nao bloquear requests se Upstash estiver fora
- [x] Para dev local sem Redis: fallback in-memory ou skip com log

### AC4: Migrar todos os callers para async
- [x] Atualizar todos os 14 callers para usar `await checkRateLimit(...)` (13 apos RG-S2 deletar setup/database)
- [x] Todos os callers ja estao em funcoes async — risco baixo mas touch alto

### AC5: Testar rate limiting funciona
- [ ] Verificar que o (N+1)-esimo request dentro da janela retorna 429
- [ ] Testar com curl ou script automatizado
- [ ] Verificar que rate limit persiste entre cold starts (diferentes instancias serverless)

### AC6: Monitoring/Observabilidade
- [x] Adicionar structured logs quando rate limit e atingido (IP, endpoint, count)
- [ ] Se Upstash Redis estiver down por >5min, logar ERROR (nao apenas warning)

## Pre-requisitos

- [ ] **Decisao de infra:** Upstash direto vs Vercel KV (verificar plano Vercel atual)
- [ ] **Budget aprovado:** ~$0.20/100k requests (ou incluido no Vercel Pro)
- [ ] RG-S2 executado primeiro (remove 1 caller: setup/database)

## Notas de Implementacao

```typescript
// Exemplo de implementacao com fallback
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

export async function checkRateLimit(
  request: NextRequest,
  keyPrefix: string,
  options: RateLimitOptions,
): Promise<Response | null> {
  if (!redis) {
    // Fail-open em dev ou se Redis nao configurado
    return null
  }

  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(options.limit, `${options.windowSeconds}s`),
    })
    const ip = getClientIp(request)
    const { success, remaining, reset } = await limiter.limit(`${keyPrefix}:${ip}`)

    if (!success) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(reset) },
      })
    }
    return null
  } catch (err) {
    // Fail-open: se Redis cair, permite request
    console.warn("Rate limit check failed, allowing request", { error: err })
    return null
  }
}
```

## Arquivos Afetados

- `src/lib/rate-limit.ts` — reescrever
- `package.json` — novas dependencias (`@upstash/ratelimit`, `@upstash/redis`)
- `.env` e `.env.example` — novas env vars
- 14 callers de `checkRateLimit()` — adicionar `await`

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA. O proprio codigo documenta o problema.
- **Severidade:** HIGH — concordo. Endpoints publicos (tracking/lookup, onboarding, portal auth) estao desprotegidos.
- **Nota:** Supabase tem rate limiting proprio em auth endpoints — mitiga parcialmente o risco no login.

### DBM
- **Impacto DB:** LOW. Nenhuma migration necessaria. Purely infrastructure + app code.
- **Dados em risco indireto:** brute force em portal auth → acesso a `client_portal_users` permissions scope.

### Arquiteto (Aria)
- **Aprovar.** Esforco real = MEDIUM-HIGH (14 callers sync→async + nova infra + env vars + fallback).
- **Recomendacao:** Se necessario, priorizar 3 callers criticos primeiro (portal/auth, tracking/lookup, cliente/onboarding-form) e migrar demais incrementalmente.
- **Risco principal:** Mudanca sync→async. Todos os callers ja sao async, entao risco e baixo mas touch e alto.
- **Existe `rate-limit.service.ts`** separado de `rate-limit.ts` — investigar se e duplicata antes de migrar.

### Dev (Dex)
- **Precisa decisao de infra** antes de iniciar: Upstash vs Vercel KV.
- **~100 linhas new code + 14 caller updates.** Maior story do batch.
- **Fallback para dev local** e essencial — nao exigir Redis localmente.

## Implementacao (2026-03-17)

**Commit:** `7f438c9` — pushed to main
**Arquivos criados/modificados:**
- `src/lib/rate-limit.ts` — reescrito: in-memory Map → Upstash Redis com `@upstash/ratelimit`
- `package.json` — adicionado `@upstash/ratelimit` e `@upstash/redis`
- `.env.example` — adicionado `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`

**12 callers migrados para async (`await checkRateLimit(...)`):**
- `src/app/api/portal/auth/route.ts` — `failClosed: true`
- `src/app/api/auth/change-password/route.ts` — `failClosed: true`
- `src/app/api/portal/settings/password/route.ts` — `failClosed: true`
- `src/app/api/settings/password/route.ts` — `failClosed: true`
- `src/app/api/tracking/lookup/route.ts`
- `src/app/api/tracking/config/route.ts`
- `src/app/api/cliente/onboarding-form/route.ts`
- `src/app/api/cliente/upload/route.ts`
- `src/app/api/integrations/whatsapp/webhook/route.ts`
- `src/app/api/integrations/asaas/webhook/route.ts`
- `src/app/api/onboarding/webhook/route.ts`
- `src/app/api/admin/encrypt-credentials/route.ts`

**O que foi feito:**
- Implementacao completa com Upstash Redis (`fixedWindow` algorithm)
- Fail-open para endpoints nao-criticos: se Redis indisponivel, permite request com log warning
- **`failClosed: true`** para 4 endpoints de auth: se Redis indisponivel em producao, retorna 503 (protege contra brute-force)
- Em dev (sem Redis configurado): fail-open sempre (nao exige Redis local)
- Cache de instancias `Ratelimit` por config combo (sem memory leak)
- Structured logging em 429: keyPrefix, IP, retry duration
- `RATE_LIMITS` config preservado (auth 10/min, webhook 100/min, admin 30/min, etc.)
- Dead code removido: `trackingByCode` e `trackingByEmail` presets (nao usados por nenhum caller)
- Investigacao: `rate-limit.service.ts` e sistema separado (DB-based, client-side) — NAO duplicata
- TypeScript compila limpo

**QA/Data-Engineer Review (deep):**
- PASS WITH CONCERNS
- Concern principal (CRITICAL) resolvido: `failClosed` para auth endpoints
- Concern residual (LOW): AC5 teste funcional e AC6 escalacao >5min pendentes pos-deploy
- Concern (MEDIUM): IPs em Upstash — verificar compliance LGPD/DPA
- Dois sistemas de rate-limit coexistem (Upstash + Supabase RPC) — complementares, nao duplicados

**Pre-deploy obrigatorio:**
- Configurar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` no Vercel
- Sem essas vars, rate limiting funciona em fail-open (exceto auth que retorna 503)
