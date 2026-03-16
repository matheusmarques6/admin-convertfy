# Epic 51 — Credential System Unification

## Objetivo

Unificar o sistema de credenciais (Klaviyo, Shopify, Meta, Google, etc.) para que toda leitura e escrita passe pelo `credentials.service.ts`, garantindo que mudancas feitas no portal do cliente reflitam automaticamente em todo o sistema (admin, cron jobs, agentes).

## Problema

A fundacao ja existe: tabela `client_stores` e fonte unica, `credentials.service.ts` tem `getStoreCredentials()` / `updateStoreCredentials()`. Porem:

- **6 endpoints de escrita** bypasam o service e fazem `encrypt()` direto — sem `validateCredentialField()`
- **16 endpoints de leitura** leem direto do banco sem `getStoreCredentials()`
- **`ENCRYPTED_FIELDS`** esta duplicado em 3 arquivos e diverge (crypto.ts falta `meta_access_token`)
- **Responses de API** vazam ciphertext (`enc:v1:...`) em POST/PUT de credenciais

### Incidente conhecido

Bug da BRINQUEMAIS (Story 16.6): API key com U+2022 bullet character entrou pelo portal porque o endpoint bypasava `validateCredentialField()`.

## Metricas Atuais

| Metrica | Valor |
|---------|-------|
| Leituras via service (centralizado) | 20 endpoints |
| Leituras diretas (descentralizado) | 16 endpoints |
| Escritas via service | 5 endpoints |
| Escritas diretas (bypasam validacao) | 6 endpoints |

## Stories

| Story | Titulo | Prioridade | Esforco |
|-------|--------|-----------|---------|
| 51.1 | Fix `meta_access_token` decryption + unificar `ENCRYPTED_FIELDS` | CRITICAL | LOW |
| 51.2 | Consolidar escritas no `updateStoreCredentials()` | HIGH | MEDIUM |
| 51.3 | Consolidar leituras no `getStoreCredentials()` | MEDIUM | MEDIUM |
| 51.4 | Sanitizar responses de credenciais | HIGH | LOW |
| 51.5 | Melhorias de robustez (error handling, validacao, key rotation docs) | LOW | LOW |

## Fases

### Phase 1 — Critical Fix (Story 51.1)
Fix do bug de decryption do `meta_access_token` e unificacao da lista de campos encriptados.

### Phase 2 — Write Consolidation (Story 51.2, 51.4)
Todos os endpoints de escrita passam pelo service. Responses sanitizadas.

### Phase 3 — Read Consolidation (Story 51.3)
Leituras que decriptam diretamente migram para o service. Batch read function criada.

### Phase 4 — Hardening (Story 51.5)
Error handling consistente, validacao de tamanho, documentacao de key rotation.

## Principio: O que NAO muda

- Sistema de requisicoes (fetch, Klaviyo/Shopify clients)
- Tabela `client_stores` (sem migration de schema)
- Encryption AES-256-GCM
- RLS policies
- Leituras para boolean flags (`!!field`) — aceitaveis como estao

## Cross-cutting

- Stories 51.1 e 51.2 devem ser executadas em ordem (51.1 primeiro)
- Story 51.4 pode ser feita em paralelo com qualquer outra
- Story 51.5 depende de 51.2 estar concluida

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-16 | @architect + @dev + @data-engineer + @qa | Epic criado a partir de analise completa do sistema de credenciais |
| 2026-03-16 | @qa + @data-engineer | QA review: PASS WITH CONCERNS. 14 concerns identificados, must-fix aplicados nas stories (C1, C2/C3, C3-DB, C6, C6-DB, C8-DB, C10) |
