---
Prioridade: Low
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Reviewed
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
Batch: 2 (combinar com RG-S3)
---

# Story RG-S8 — timingSafeEqual em Todos HMAC/Secret Comparisons

## Story

**Como** engenheiro de seguranca,
**Quero** que todas as comparacoes de secrets usem `crypto.timingSafeEqual`,
**Para que** timing attacks nao possam vazar informacao sobre os secrets.

## Contexto

### Estado atual das comparacoes (verificado na review)

| Local | Mecanismo | Timing-safe? |
|-------|-----------|--------------|
| `n8n-auth.ts` (requireWebhookSecret) | `timingSafeEqual` | SIM |
| `whatsapp/webhook` | `timingSafeEqual` | SIM |
| `tracking/webhooks/shopify` | `timingSafeEqual` | SIM |
| **`shopify/callback` (HMAC)** | `!==` (linha 70) | **NAO** |
| **5x cron routes** | `!==` (Bearer token) | **NAO** |

### Severidade real (pos-review)

**DOWNGRADE de MEDIUM para LOW.** Timing attacks em HMAC sao extremamente dificeis na pratica:
- Network jitter domina sobre diferencas de timing em comparacao de strings
- Infra Vercel adiciona jitter significativo
- Fix e best-practice hardening, nao exploit prático

Porem, ainda vale implementar como defense-in-depth.

## Acceptance Criteria

### AC1: Fix Shopify OAuth HMAC
- [x] Trocar `calculatedHmac !== hmac` por:
  ```typescript
  const a = Buffer.from(calculatedHmac, 'hex')
  const b = Buffer.from(hmac, 'hex')
  if (a.byteLength !== b.byteLength || !crypto.timingSafeEqual(a, b))
  ```

### AC2: Cron auth (coberto por RG-S3)
- [x] Se `requireCronAuth` helper criado em RG-S3 ja usa `timingSafeEqual` — DONE
- [x] Se nao, garantir que o helper use `timingSafeEqual`

### AC3: Audit completo
- [x] Grep por `!==.*secret`, `!==.*hmac`, `!==.*token` em todo o codebase
- [x] Garantir que TODAS as comparacoes de secrets usam timing-safe
- [x] Confirmar que nenhum novo `!==` apareceu desde a auditoria

## Notas Tecnicas

- `timingSafeEqual` lanca se buffers tem tamanhos diferentes — SEMPRE verificar `byteLength` antes
- Para HMAC hex-encoded, usar `Buffer.from(value, 'hex')` para decodificar
- Para Bearer tokens, usar `Buffer.from(value)` (UTF-8 default)
- NAO criar helper generico para HMAC — `timingSafeEqual` do Node crypto e suficiente e idiomatico

## Arquivos Afetados

- `src/app/api/integrations/shopify/callback/route.ts` — HMAC comparison
- `src/lib/api/cron-auth.ts` — helper requireCronAuth (criado em RG-S3)

## Dependencias

- **Depende de RG-S3** para o helper de cron auth (AC2)
- **Coordenar com RG-S7** que tambem toca `shopify/callback/route.ts`
- **Recomendacao:** Implementar S3 + S8 como uma unica PR

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA. HMAC Shopify e 5 crons usam `!==`.
- **Severidade:** DOWNGRADE para LOW. Best-practice, nao praticamente exploravel em rede.
- **Nota:** Combinar com RG-S3 para evitar tocar nos mesmos 5 cron arquivos duas vezes.

### DBM
- **Impacto DB:** NENHUM. Purely application-layer crypto concern.

### Arquiteto (Aria)
- **Aprovar.** Se RG-S3 fizer o helper com timingSafeEqual, esta story se reduz a 1 fix no Shopify HMAC.
- **NAO criar helper generico** — `crypto.timingSafeEqual` e suficiente inline.

### Dev (Dex)
- **Pronto.** ~15 linhas. Se combinado com RG-S3, a maioria ja esta coberta.
- **Atencao:** `byteLength` check obrigatorio antes de `timingSafeEqual`.
