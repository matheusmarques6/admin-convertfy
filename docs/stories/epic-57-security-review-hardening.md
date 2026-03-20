# Epic 57 — Security Review Hardening

**Origem:** Security review completa realizada em 2026-03-20 (4 agentes em paralelo: auth/middleware, crypto/credentials, injection/input, data exposure/headers).

**Postura geral:** FORTE — sem vulnerabilidades de exploração imediata, mas vários pontos de endurecimento necessários.

## Stories

| Story | Título | Severidade | Esforço | Status |
|-------|--------|------------|---------|--------|
| 57.1 | Remover senha temporária da response do reset-password | CRITICAL | LOW | Ready for Dev |
| 57.2 | Meta access token via header (não URL) | HIGH | LOW | Ready for Dev |
| 57.3 | Validar tamanho da ENCRYPTION_KEY | HIGH | LOW | Ready for Dev |
| 57.4 | Passar orgId no getStoreCredentials do revalidate | HIGH | LOW | Ready for Dev |
| 57.5 | Adicionar Content-Security-Policy header | HIGH | MEDIUM | Ready for Dev |
| 57.6 | Bundle: rate limit failClosed + OAuth error sanitization + user enumeration | MEDIUM | LOW | Ready for Dev |
| 57.7 | Sanitizar logs de erros (crypto + callbacks externos) | MEDIUM | LOW | Ready for Dev |

## Ordem de Execução

1. **57.1** (critical, sem dependências)
2. **57.3 + 57.4** (em paralelo, ambos LOW effort)
3. **57.2** (isolado, só Meta callback)
4. **57.6 + 57.7** (em paralelo, MEDIUM bundle)
5. **57.5** (CSP requer teste cuidadoso)

## Fora de Escopo

- Achados LOW (portal-users/me sem requireAuth explícito, encrypt() direto em portal/integrations, meta_access_token docs) — não justificam stories separadas, podem ser corrigidos oportunisticamente.
- WhatsApp webhook dev-mode skip — risco aceitável, documentar.
