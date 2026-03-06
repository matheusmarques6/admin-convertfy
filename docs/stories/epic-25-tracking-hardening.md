# Epic 25 — Tracking System Hardening: Security, Reliability & Performance

## Metadados

| Campo      | Valor                                      |
|------------|--------------------------------------------|
| Prioridade | Critica                                    |
| Sprint     | Atual                                      |
| Epic       | Tracking / Security / Performance          |
| Status     | Ready for Dev                              |
| Origem     | Auditoria conjunta Arquiteto + Dev + QA    |

---

## Contexto

Auditoria completa do sistema de tracking (widget embeddable + API lookup + provider chain) identificou **13 issues** categorizadas por 3 agentes (Arquiteto, Dev, QA). A issue mais critica e uma **vulnerabilidade de injection em endpoint publico** que permite extração de PII dentro da loja.

### Arquivos principais afetados

- `src/app/api/tracking/lookup/route.ts` — endpoint publico do widget
- `src/lib/tracking/carriers.ts` — engine multi-carrier
- `src/lib/services/tracking.service.ts` — servico de sync 17track
- `src/lib/rate-limit.ts` — rate limiting in-memory
- `src/app/api/script/widget.js/route.ts` — widget JS embeddable

---

## Stories

| Story | Titulo | Severidade | Status |
|-------|--------|------------|--------|
| 25.1 | Fix PostgREST filter injection + sanitizacao | CRITICAL | Ready for Dev |
| 25.2 | Global timeout budget + circuit breaker providers | CRITICAL | Ready for Dev |
| 25.3 | Batch N+1 queries no lookup endpoint | HIGH | Ready for Dev |
| 25.4 | Correios/Cainiao circuit breaker + TrackingMore v4 | MEDIUM | Ready for Dev |
| 25.5 | Dead code cleanup + attachShadow guard | LOW | Ready for Dev |
| 25.6 | Unit tests para tracking system | HIGH | Ready for Dev |

---

## Priorizacao

| Fase | Stories | Justificativa |
|------|---------|---------------|
| **Imediato** | 25.1 (inclui testes 25.6.1) | Vulnerabilidade de seguranca + testes de regressao obrigatorios |
| **Sprint 1** | 25.2, 25.3 | Performance e reliability — timeout cascade + N+1 |
| **Sprint 2** | 25.4, 25.6 (restante) | External APIs + cobertura de testes |
| **Sprint 3** | 25.5 | Cleanup e polish |

### Notas de priorizacao (QA + Dev review)

- **25.1 + 25.6.1 juntas**: O fix de seguranca mais critico NAO deve ir pra producao sem testes de regressao para sanitizacao
- **25.2**: O parametro `globalTimeoutMs` tem default, NAO e breaking change para os 3 callers existentes
- **25.4**: Env vars (`CORREIOS_ENABLED`, `CAINIAO_ENABLED`) sao o kill switch primario; circuit breaker in-memory e best-effort (reseta em cold start)
