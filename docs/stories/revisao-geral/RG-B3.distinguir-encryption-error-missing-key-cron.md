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

# Story RG-B3 — Distinguir Encryption Error de Missing Key no Cron

## Story

**Como** engenheiro de infraestrutura,
**Quero** que erros de encryption sejam logados como ERROR (nao silenciados),
**Para que** uma `ENCRYPTION_KEY` misconfigured nao faca o cron silenciosamente skipar todas as lojas.

## Contexto

### Problema

```typescript
// src/app/api/cron/sync-reports/route.ts:505-507
} catch {
  skippedNoKey.push(store.store_name)
}
```

`getStoreCredentials()` pode lancar:
- `NotFoundError` — store nao existe (race condition, OK skipar)
- Error de decryption — `ENCRYPTION_KEY` incorreta/ausente

Ambos sao silenciados e tratados como "sem API key". Se `ENCRYPTION_KEY` estiver errada, TODAS as lojas sao skipadas sem nenhum log de erro. O unico sintoma seria todas as lojas no array `skippedNoKey`.

## Acceptance Criteria

### AC1: Catch especifico
- [ ] Catch `NotFoundError` → ok, skip store (como hoje)
- [ ] Catch errors de decryption (ex: "Invalid key length", "Unsupported state") → log ERROR + nao skipar silenciosamente
- [ ] Se > 50% das stores falham com encryption error, abortar cron e retornar 500 com mensagem clara

### AC2: decryptCredentialsJson robustez
- [ ] Wrap `JSON.parse` em try/catch dentro de `decryptCredentialsJson` (crypto.ts:85-94)
- [ ] Retornar `{}` com log de warning em caso de dados corrompidos (em vez de crash)

## Arquivos Afetados

- `src/app/api/cron/sync-reports/route.ts:505-507`
- `src/lib/crypto.ts:85-94`
