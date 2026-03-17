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

### Endpoints protegidos (que nao estao realmente protegidos)

- Portal auth (login)
- Tracking lookup (endpoint publico)
- Onboarding form (endpoint publico)

### Solucao recomendada

Upstash Redis com `@upstash/ratelimit` — projetado para edge/serverless. Custo baixo (~$0.20/100k requests).

## Acceptance Criteria

### AC1: Instalar Upstash
- [ ] Criar conta Upstash Redis (ou usar Vercel KV)
- [ ] Instalar `@upstash/ratelimit` e `@upstash/redis`
- [ ] Configurar env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### AC2: Migrar rate-limit.ts
- [ ] Substituir implementacao in-memory por Upstash
- [ ] Manter mesma interface/API para consumers
- [ ] Configurar limits: 20 req/min para endpoints publicos, 60 req/min para autenticados

### AC3: Fallback graceful
- [ ] Se Redis indisponivel, permitir request (fail-open) com log warning
- [ ] Nao bloquear requests se Upstash estiver fora

## Arquivos Afetados

- `src/lib/rate-limit.ts` — reescrever
- `package.json` — novas dependencias
- `.env` — novas env vars
