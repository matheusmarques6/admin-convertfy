---
Prioridade: High
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@architect, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: MEDIUM-HIGH
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

### AC4: Testar rate limiting funciona (pos-review)
- [ ] Verificar que o (N+1)-esimo request dentro da janela retorna 429
- [ ] Testar com curl ou script automatizado

### AC5: Monitoring/Observabilidade (pos-review)
- [ ] Adicionar structured logs quando rate limit e atingido (IP, endpoint, count)
- [ ] Se Upstash Redis estiver down por >5min, logar ERROR (nao apenas warning)

## Notas de Implementacao (pos-review)

- **Alternativa ao Upstash**: `@vercel/kv` simplifica integracao se ja estiver no Vercel
- **Interface atual e sync**: `@upstash/ratelimit` e async — todos os callers precisam ser ajustados
- **Prioridade**: Architect recomenda mover para inicio do Sprint 3 ou Sprint 2 (protege endpoints publicos)
- **Nova dependencia**: adiciona custo operacional (conta Upstash ~$0.20/100k req ou Vercel KV incluido no Pro)

## Arquivos Afetados

- `src/lib/rate-limit.ts` — reescrever
- `package.json` — novas dependencias
- `.env` e `.env.example` — novas env vars
- Todos os callers de `rateLimit()` — adaptar para async
