# Epic 17 — Portal: Dados Zerados no Refresh (Data Persistence & Reliability)

## Contexto

O portal do cliente apresenta um problema critico onde dados de Dashboard, Campanhas e Flows
aparecem zerados ou nao carregam ao acessar ou dar refresh (F5). A investigacao revelou uma
cascata de falhas em multiplas camadas (DB, Backend, Frontend, Auth) que se combinam para
produzir o sintoma.

## Problema

Ao dar F5 no portal:
1. State React zera (useState in-memory)
2. Novo fetch dispara, mas pode receber dados vazios por:
   - Cache vazio no banco + live fetch em cooldown/timeout
   - org_id NULL nas tabelas de metricas Klaviyo (RLS bloquearia se nao fosse adminClient)
   - Race condition entre layout auth e pagina fetchData
   - localStorage com storeId invalido ou vazio
   - API retornando 200 OK com dados vazios em vez de erro

## Stories

| Story | Titulo | Severidade | Camada |
|-------|--------|------------|--------|
| 17.1 | Fix org_id NULL em klaviyo_campaign/flow_metrics | CRITICO | DB |
| 17.2 | Resolver race condition layout vs paginas do portal | CRITICO | Frontend |
| 17.3 | Implementar cache de dados no portal (SWR) | ALTO | Frontend |
| 17.4 | Robustecer fallback cache miss + live fetch no portal dashboard | ALTO | Backend |
| 17.5 | Validar e sanitizar storeId do localStorage | MEDIO | Frontend |
| 17.6 | Retornar erros explicitos em vez de 200 OK com dados vazios | MEDIO | Backend |
| 17.7 | Renovar sessao em API routes do portal | BAIXO | Auth |

## Dependencias entre Stories

```
17.1 (DB)  ────────────────────────────────────────── independente
17.6 (Backend) ────────────────────────────────────── independente
17.2 (Frontend) ───────────────────────────────────── independente
17.5 (Frontend) ───── recomendado apos 17.2 ────────  (usa PortalContext)
17.4 (Backend) ────── depende de 17.6 ──────────────  (precisa error codes)
17.3 (Frontend) ───── BLOQUEADA por 17.2 ───────────  (precisa PortalContext)
17.7 (Auth) ───────── apos 17.2 e 17.3 ────────────  (soft dependency)
```

## Ordem de Execucao Recomendada

1. **17.1** (DB) — Corrige dados corrompidos, previne futuras insercoes sem org_id
2. **17.6** (Backend) — Erros explicitos facilitam debug das proximas stories
3. **17.2** (Frontend) — Elimina a causa mais frequente de dados zerados
4. **17.5** (Frontend) — Valida storeId antes de qualquer fetch
5. **17.4** (Backend) — Melhora resiliencia quando cache esta vazio
6. **17.3** (Frontend) — Cache client-side para UX sem flicker
7. **17.7** (Auth) — Hardening para sessoes longas

## Metricas de Sucesso

- [ ] Portal carrega dados corretamente apos F5 em 100% dos casos
- [ ] Nenhum row com org_id NULL em klaviyo_campaign_metrics / klaviyo_flow_metrics
- [ ] Tempo de carregamento do portal < 2s (cache hit) / < 10s (cache miss)
- [ ] Erros de API retornam status HTTP correto (4xx/5xx), nunca 200 com dados vazios
