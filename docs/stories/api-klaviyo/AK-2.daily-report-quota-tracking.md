---
Prioridade: High
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Done
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "2 - High Priority"
Esforco: LOW
Nota: "Rebaixado de P0 para P1 — cap nao atingido hoje, observabilidade preventiva"
---

# Story AK-2 — Daily Report Quota Tracking por API Key

## Story

**Como** operador do sistema,
**Quero** rastrear o numero de chamadas diarias a endpoints de reporting por API key,
**Para que** eu tenha visibilidade sobre o consumo do cap de 225/dia e possa evitar hard blocks.

## Contexto

### Problema

A Klaviyo impoe um limite diario para endpoints de reporting (`*-values-reports`, `*-series-reports`). O numero exato (~225) foi observado empiricamente mas **NAO esta confirmado na documentacao oficial** — pode variar por plano Klaviyo. O codebase nao rastreia esse consumo.

> **NOTA PRE-DEV**: O limite deve ser constante configuravel (`DAILY_REPORT_QUOTA_LIMIT = 225`), nao hardcoded, para ajustar conforme validacao.

### Calculo de Uso Diario Estimado

```
Por loja/periodo: 2 report calls (flow-values-reports + campaign-values-reports)
metric-aggregates: possivelmente tambem tier XS, +1 call

Com freshness skip (steady state):
  7d:  ~48 syncs/dia x 42 lojas x 2 = 4,032 report calls/dia (distribuidas em ~15 keys)
  15d: ~12 syncs/dia x 42 lojas x 2 = 1,008
  30d: ~6 syncs/dia x 42 lojas x 2  = 504
  90d: ~3 syncs/dia x 42 lojas x 2  = 252
  Total: ~5,796/dia distribuido em ~15 keys = ~386/key/dia

Limite: 225/key/dia
```

Estimativa sugere que keys com muitas lojas **provavelmente excedem** o cap de 225/dia.

### Mitigacao Atual

O Klaviyo retorna 429 com Retry-After quando o limite e excedido. O retry logic no `client.ts` trata isso, mas sem visibilidade do root cause.

## Acceptance Criteria

### AK-2.1 — Contador diario in-memory por API key

- [x] Criar `Map<string, { count: number, date: string }>` no `rate-limiter.ts` (key = API key hash suffix, value = contador + data UTC)
- [x] Incrementar a cada chamada a endpoint classificado como XS (reporting)
- [x] Reset automatico quando a data UTC muda
- [x] Exportar funcao `getReportQuotaUsage(apiKey: string): { used: number, limit: number, date: string }`

### AK-2.2 — Warning threshold

- [x] Quando contador atingir **180** (80% de 225): logar warning `[RateLimit] API key ...XXXX at 80% of daily report quota (180/225)`
- [x] Quando contador atingir **220** (98%): logar error `[RateLimit] API key ...XXXX approaching daily report limit (220/225) — skipping non-critical reports`

### AK-2.3 — Soft halt em 220

- [x] Quando contador >= 220: retornar `null` imediatamente para chamadas de reporting (sem fazer a request)
- [x] Marcar o motivo no log: `"daily quota exhausted"`
- [x] Cron deve tratar null como rate-limit (usar cache stale)
- [x] NAO fazer hard block — se o caller insistir (ex: user-triggered refresh), permitir com flag `force: true`

### AK-2.4 — Logging no final do cron run

- [x] No summary do cron (route.ts), incluir por API key group: `reportQuota: { used: N, limit: 225 }`
- [x] Se alguma key excedeu 180, incluir warning no summary JSON

### AK-2.5 — Testes

- [x] Testar reset do contador em mudanca de data
- [x] Testar soft halt em 220
- [x] Testar que `force: true` bypassa o halt
- [x] Testar log de warning em 180

## Observacoes

- O contador in-memory funciona porque o cron roda como uma unica function invocation que dura 240s
- Entre invocacoes (cold starts), o contador reseta — isso e ACEITAVEL porque o cap diario da Klaviyo tambem resets
- Para tracking cross-invocation (observabilidade de longo prazo), considerar persistir em `dashboard_cache` no futuro

## Arquivos Afetados

- `src/lib/integrations/klaviyo/rate-limiter.ts` — contador + soft halt
- `src/lib/integrations/klaviyo/client.ts` — passar info de quota ao caller
- `src/app/api/cron/sync-reports/route.ts` — logging no summary

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade: LOW**. Map in-memory com contador e reset por data UTC — trivial de implementar.
- Depende de AK-1: usar `classifyEndpoint()` para identificar quais chamadas sao XS (reporting).
- `getReportQuotaUsage()` deve retornar objeto imutavel (spread ou Object.freeze) para evitar mutacao acidental.
- O `force: true` flag pode ser passado via options no `enqueueKlaviyoRequest()`. Nao criar API separada.
- **Cuidado com cold starts**: No Vercel, cada invocacao do cron e um cold start. O contador reseta naturalmente — isso e aceitavel porque a Klaviyo tambem reseta o cap. Mas se duas invocacoes rodarem em paralelo (race condition no lock), cada uma tera seu proprio contador = 2x o consumo real sem visibilidade.

### @qa — Anotacoes de Qualidade

- **Teste essencial**: Simular 225 chamadas e verificar que a 221a retorna null com log "daily quota exhausted".
- **Teste de reset**: Mock de Date para simular mudanca de dia UTC e verificar que contador zera.
- **Teste de force**: Verificar que `force: true` bypassa o soft halt e faz a request.
- **Edge case**: Multiplas API keys — verificar que contadores sao independentes por key.
- **Observabilidade**: Verificar que warnings em 180 e 220 aparecem no log structured com campos parseaeis.

### @data-engineer — Anotacoes de Dados

- **Calculo revisado**: Com Epic 55 (freshness skip), estimativa real e menor que 386/key/dia. Muitos periodos serao skipped.
- **Persistencia futura**: Para tracking cross-invocation, considerar coluna `daily_report_count` em `klaviyo_sync_metadata` com reset por `sync_date`. NAO implementar agora — apenas preparar a interface para ser extensivel.
- **Dashboard**: Os logs structured (`reportQuota: { used, limit }`) podem alimentar alertas no Vercel Logs. Configurar alert quando `used > 180` aparecer em mais de 3 keys.

### @architect — Anotacoes Arquiteturais

- **Design adequado**: Contador in-memory e a abordagem correta para serverless com invocacoes curtas (240s). Persistencia adicionaria latencia desnecessaria.
- **Interface**: Exportar `ReportQuotaInfo = { used: number, limit: number, date: string, exhausted: boolean }` como tipo. Facilita consumo por outros modulos.
- **Soft halt vs hard halt**: Soft halt (retorna null) e correto. Hard halt (throw) quebraria callers que esperam graceful degradation.

### @analyst — Anotacoes de Impacto

- **Visibilidade**: Hoje temos ZERO insight sobre consumo diario. Mesmo que o cap nao esteja sendo atingido, ter o tracking e essencial para planejamento de capacidade.
- **Correlacao**: Cruzar `reportQuota.used` com `null_response_count` por key para identificar quais keys estao mais pressionadas.
- **Projecao**: Com 42 lojas e crescimento de ~5 lojas/mes, estimar quando o cap de 225/dia se tornara limitante (provavelmente em 80-100 lojas).
