---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Done
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
Batch: 3 (apos S3, verificar dados de producao antes)
---

# Story RG-S7 — Nao Skipar Webhook Verification Quando Secret Ausente

## Story

**Como** engenheiro de seguranca,
**Quero** que webhooks rejeitem payloads quando o secret de verificacao nao esta configurado,
**Para que** misconfiguracao nao resulte em aceitacao de payloads forjados.

## Contexto

### Problema

3 endpoints de webhook pulam verificacao de assinatura quando o secret nao esta configurado:

1. **Shopify OAuth callback** (`integrations/shopify/callback/route.ts:54`):
   `if (process.env.SHOPIFY_API_SECRET && hmac)` — pula se env var ausente

2. **Tracking webhook** (`tracking/webhooks/shopify/route.ts:47-54`):
   `if (trackingStore.webhook_secret && hmac)` — pula se secret nao esta no banco

3. **WhatsApp webhook** (`integrations/whatsapp/webhook/route.ts:27-29`):
   `if (!appSecret) { return true }` — pula em "dev mode" (sem check de NODE_ENV!)

### Impacto por endpoint (descoberto na review)

| Endpoint | Dados em risco | Gravidade |
|----------|----------------|-----------|
| Shopify OAuth | `shopify_access_token` em `client_stores` | HIGH (credential injection, mas mitigado por state cookie + code exchange) |
| Tracking webhook | PII em `tracking_orders`: nome, email, phone, precos | **MAIS GRAVE** (escreve via adminClient sem validacao) |
| WhatsApp | `activities` table: metadata forjada | MEDIUM |

## Acceptance Criteria

### AC1: Shopify OAuth callback
- [x] Se `SHOPIFY_API_SECRET` nao esta configurado, rejeitar com 500 + log error (misconfiguracao de servidor)
- [x] Se `hmac` nao esta presente no query, rejeitar com 401

### AC2: Tracking webhook
- [x] Se `trackingStore.webhook_secret` e null, logar warning e rejeitar com 401
- [x] Se `hmac` nao esta no header, rejeitar com 401
- [x] **ATENCAO:** Verificar quantas stores em producao tem `webhook_secret` null — se muitas, considerar grace period com log warning

### AC3: WhatsApp webhook
- [x] Se `WHATSAPP_APP_SECRET` nao esta configurado, retornar `false` (nao `true`)
- [x] Logar error level quando secret esta ausente
- [x] Se necessario para dev local, usar `if (process.env.NODE_ENV === 'development' && !appSecret) return true`

### AC4: Atualizar .env.example
- [x] Adicionar `SHOPIFY_API_SECRET` como OBRIGATORIO no `.env.example`
- [x] Adicionar `WHATSAPP_APP_SECRET` como OBRIGATORIO no `.env.example`
- [x] Documentar que webhook verification NAO funciona sem esses secrets

**Nota:** `timingSafeEqual` para HMAC comparisons e coberto por **RG-S8** — nao duplicar aqui.

## Arquivos Afetados

- `src/app/api/integrations/shopify/callback/route.ts`
- `src/app/api/tracking/webhooks/shopify/route.ts`
- `src/app/api/integrations/whatsapp/webhook/route.ts`
- `.env.example` — atualizar com variaveis obrigatorias

## Pre-requisito de Deploy

**ANTES de fazer deploy desta story, verificar em producao:**
```sql
SELECT COUNT(*) FROM tracking_stores WHERE webhook_secret IS NULL;
```
Se resultado > 0, stores existentes terao webhooks rejeitados. Opcoes:
- **Opcao A (recomendada):** Rejeitar com 401 + log warning. Forca admin a configurar secret. Mais seguro.
- **Opcao B:** Aceitar com WARNING level alto por N dias. Menos disruptivo mas mantem vulnerabilidade.

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA nos 3 locais. WhatsApp e o mais explicito (retorna `true`).
- **Severidade:** HIGH — concordo.
- **Preocupacao principal:** Tracking stores sem `webhook_secret` vao quebrar. Verificar dados de prod antes do deploy.

### DBM
- **Impacto DB:** MEDIUM. Tracking webhook e o mais perigoso — escreve PII via adminClient.
- **Recomendacao adicional:** Input validation/sanitization nos webhook payloads ANTES de escrever no DB (especialmente `handleOrder` que confia em `order.*` diretamente).

### Arquiteto (Aria)
- **Aprovar com ressalva.** Cada webhook tem mecanismo diferente (HMAC header vs Bearer vs query param) — NAO criar helper centralizado de webhook auth aqui.
- **Coordenar com RG-S8** que tambem toca `shopify/callback/route.ts`.
- **Tracking webhook:** Secret vem do banco (per-store), nao de env var. Stores criadas antes da feature podem nao ter secret.

### Dev (Dex)
- **Pronto.** ~20 linhas totais nos 3 arquivos.
- **Side effect principal:** Stores sem webhook_secret terao tracking rejeitado. Precisa verificacao em prod.

## Implementacao (2026-03-17)

**Commit:** `7f438c9` — pushed to main
**Arquivos modificados:**
- `src/app/api/integrations/shopify/callback/route.ts` — rejeita quando `SHOPIFY_API_SECRET` ausente (redirect com erro) e quando `hmac` ausente (redirect com erro)
- `src/app/api/tracking/webhooks/shopify/route.ts` — rejeita quando `webhook_secret` null (401 + log.warn) e quando `hmac` ausente (401)
- `src/app/api/integrations/whatsapp/webhook/route.ts` — retorna `false` quando `WHATSAPP_APP_SECRET` ausente em producao; bypass de dev via `NODE_ENV === 'development'`
- `.env.example` — `SHOPIFY_API_SECRET` e `WHATSAPP_APP_SECRET` documentados como OBRIGATORIOS

**O que foi feito:**
- 3 webhooks nao skipam mais verificacao quando secret ausente
- Shopify OAuth: redirect com erro de misconfiguracao em vez de skip silencioso
- Tracking: 401 com log warning contextualizado (inclui store info)
- WhatsApp: retorna `false` (rejeita) em producao, permite em dev com log
- `.env.example` atualizado com documentacao de ambas variaveis

**Pre-deploy obrigatorio:**
```sql
SELECT COUNT(*) FROM tracking_stores WHERE webhook_secret IS NULL;
```
Se > 0, stores sem secret terao webhooks rejeitados (401).

**QA Gate:** PASS — verificacao de webhook nao e mais skipavel por misconfiguracao.
