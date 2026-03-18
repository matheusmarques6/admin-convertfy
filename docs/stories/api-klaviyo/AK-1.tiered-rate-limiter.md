---
Prioridade: Critical
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Done
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "1 - Critical Fixes"
Esforco: LOW-MEDIUM
Deploy: "ATOMICO com AK-6 (obrigatorio)"
---

# Story AK-1 — Tiered Rate Limiter (XS/S/XL)

## Story

**Como** operador do sistema que sincroniza 42 lojas via Klaviyo API,
**Quero** que o rate limiter respeite os 5 tiers de rate limit da Klaviyo (XS, S, M, L, XL),
**Para que** nao violemos o limite steady de 2 req/min da Reporting API e nao desperdicemos throughput em endpoints de alto volume.

## Contexto

### Problema

O rate limiter atual (`rate-limiter.ts`) usa intervalo fixo de **1200ms para TODOS os endpoints** (~50 req/min). A Klaviyo tem 5 tiers com limites drasticamente diferentes:

| Tier | Burst (req/s) | Steady (req/min) | Endpoints |
|------|---------------|-------------------|-----------|
| **XS** | 1 | 15 | Reporting API (`*-values-reports`, `*-series-reports`), `metric-aggregates` |
| **S** | 3 | 60 | Flows, Campaigns, Lists, Segments, Accounts, Webhooks |
| **M** | 10 | 150 | Templates, Images, Metrics listing |
| **L** | 75 | 700 | Profiles, Events listing |
| **XL** | 350 | 3.500 | Events CRUD, Profiles CRUD, Catalog |

O intervalo de 1200ms (~50/min) **viola o steady limit de XS (15/min)** e **sub-utiliza XL (3500/min) por 70x**.

### Evidencia

Os `null` responses frequentes nos logs de producao (e.g., `klaviyo-sync.service.ts:505 "null response (likely rate-limited)"`) sao evidencia direta de violacao do tier XS.

### Dados

- Arquivo: `src/lib/integrations/klaviyo/rate-limiter.ts`
- Linha 22: `MIN_INTERVAL_MS = 1200`
- Sem classificacao por endpoint
- Queue key: API key string (todas as chamadas na mesma fila)

## Acceptance Criteria

### AK-1.1 — Classificador de endpoints por tier

- [x] Criar funcao `classifyEndpoint(path: string): RateTier` em `rate-limiter.ts`
- [x] Classificacao:
  - XS: paths contendo `-values-reports`, `-series-reports`, `metric-aggregates`
  - S: paths comecando com `/flows`, `/campaigns`, `/lists`, `/segments`, `/accounts`, `/webhooks`
  - M: paths comecando com `/templates`, `/images`, `/metrics` (GET listing)
  - L: paths comecando com `/profiles` (GET listing)
  - XL: paths de CRUD individual (events, profiles by id, catalog)
  - Default: S (conservador)
- [x] Exportar tipo `RateTier = 'XS' | 'S' | 'M' | 'L' | 'XL'`

### AK-1.2 — Intervalos por tier

- [x] Definir constante `TIER_INTERVALS`:
  - XS: 4000ms (~15 req/min — respeita steady 15/min)
  - S: 1200ms (~50 req/min — conservador dentro de 60/min)
  - M: 600ms (~100 req/min — conservador dentro de 150/min)
  - L: 350ms (~170 req/min — conservador dentro de 700/min)
  - XL: 200ms (~300 req/min — conservador dentro de 3500/min)
- [x] Remover constante `MIN_INTERVAL_MS = 1200` fixa

### AK-1.3 — Filas separadas por tier dentro de cada API key

- [x] Alterar a estrutura de filas: de `Map<apiKey, Queue>` para `Map<apiKey:tier, Queue>`
- [x] Cada combinacao API key + tier tem seu proprio intervalo e fila
- [x] Requests de tiers diferentes podem executar em paralelo (ex: um GET /flows [S] e um GET /events [XL] simultaneos)
- [x] Requests do mesmo tier para a mesma API key continuam serializados

### AK-1.4 — Atualizar `klaviyoRequest()` para passar o endpoint path

- [x] Tornar `endpoint` parametro **obrigatorio** em `enqueueKlaviyoRequest(apiKey, fn, endpoint)` — NAO opcional (evita misclassificacao silenciosa)
- [x] `klaviyoRequest()` em `client.ts:103` ja recebe `endpoint` como 2o param — basta propagar para `enqueueKlaviyoRequest()`. Impacto em callers externos: ZERO.
- [x] Usar `classifyEndpoint()` para determinar o tier
- [x] Selecionar a fila e intervalo corretos
- [x] Log do tier classificado para todo request (nao so debug) — permite detectar misclassificacoes em producao
- [x] Remover ou deprecar `MIN_REQUEST_INTERVAL = 1000` em `client.ts:60` — redundante apos tiered limiter

### AK-1.6 — Cleanup de Map entries

- [x] Apos `processQueue` esvaziar uma fila, agendar remocao do entry do Map apos 60s
- [x] Previne acumulo em warm functions (Vercel reusa funcoes entre invocacoes)
- [x] Adicionar TTL de 300s para `lastRequestTime` entries

### AK-1.5 — Testes unitarios

- [x] Testar `classifyEndpoint()` para cada tier com paths reais
- [x] Testar que dois requests XS na mesma key tem intervalo >= 4000ms
- [x] Testar que requests de tiers diferentes podem rodar em paralelo
- [x] Testar default para paths desconhecidos = S

## Impacto Esperado

- Reporting API: de ~50 req/min para ~15 req/min (elimina violacoes 429)
- Metadata endpoints: de ~50 req/min para ~100-300 req/min (2-6x mais rapido)
- Pre-fetch de flowNames/campNames: significativamente mais rapido

## Riscos

- **CRITICO — Deploy sem AK-6 pode estressar o cron**: Com XS a 4s/call e 7d syncing a cada run (threshold=0), o cron fica lento. AK-6 (threshold 7d → 1h) reduz drasticamente o volume de calls por run. Com AK-6 + Epic 55 (freshness skip), apenas ~3-5 lojas/run precisam sync = ~36-60s de reports. Viavel. Ver README do epic.
- Aumentar throughput de endpoints XL pode expor outros rate limits nao documentados
- Mitigacao: manter intervalos conservadores (50% do burst limit)
- Warm function reuse no Vercel: `lastRequestTime` persiste entre invocacoes. Adicionar TTL de 300s para entries no Map.

## Arquivos Afetados

- `src/lib/integrations/klaviyo/rate-limiter.ts` — refatoracao principal
- `src/lib/integrations/klaviyo/client.ts` — passar endpoint path
- Testes: `src/lib/integrations/klaviyo/rate-limiter.test.ts` (novo)

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade real: LOW-MEDIUM**. A refatoracao do `processQueue` para suportar filas por `apiKey:tier` e straightforward, mas precisa manter backward-compat com callers existentes.
- `enqueueKlaviyoRequest()` hoje recebe `(apiKey, fn)`. Adicionar `endpoint` como 3o param opcional com default tier S para nao quebrar callers que nao passam.
- `classifyEndpoint()` deve usar regex simples — nao over-engineer. Paths da Klaviyo sao estaveis.
- **Cuidado**: o `lastRequestTime` precisa ser per `apiKey:tier`, nao so per `apiKey`. Sem isso, um request XL vai bloquear requests S desnecessariamente.
- Sugestao: extrair `TIER_CONFIG` como const object para facilitar ajustes futuros sem mexer na logica.

### @qa — Anotacoes de Qualidade

- **Teste critico**: Verificar que requests XS realmente esperam 4000ms entre si. Mock de `Date.now()` e essencial.
- **Teste de regressao**: Garantir que callers existentes que NAO passam endpoint continuam funcionando (default S).
- **Teste de integracao**: Simular sequencia real do cron — flow-values-reports (XS) seguido de GET /flows (S) — confirmar que a fila S nao espera o intervalo XS.
- **Edge case**: API key identica com 50+ requests enfileirados — verificar que nao ha memory leak (queues limpas apos processamento).
- Metricas de sucesso: null responses no cron devem cair >80% apos deploy.

### @data-engineer — Anotacoes de Dados

- **Observabilidade**: Adicionar log structured com `{ tier, interval, queueDepth, apiKeyHash }` para cada request processado. Isso permite dashboard de rate limit usage em Vercel Logs.
- **Impacto no cron**: Com XS a 4000ms, cada report call leva 4s. Para 42 lojas x 4 periodos x 2 reports = 336 calls XS = ~22 min so em reports. Isso EXCEDE o timeout de 240s do cron.
- **Conclusao**: AK-1 sozinha NAO resolve o throughput. Depende de AK-3 (consolidar 3→1 call) e Epic 55 (skip fresh periods) para ser viavel dentro do timeout.
- Sugestao: logar `tierDistribution` no summary do cron para validar a classificacao em producao.

### @architect — Anotacoes Arquiteturais

- **Design OK**: Filas separadas por tier e a abordagem correta. Alternativa (fila unica com prioridade) seria mais complexa sem beneficio.
- **Escalabilidade**: O design com `Map<string, Queue[]>` funciona para 42 lojas. Para 200+, considerar rate limiter com token bucket (mais sofisticado, melhor burst handling).
- **API surface**: `classifyEndpoint()` deve ser exportada e pura (sem side effects) para facilitar testes e reuso em AK-2.
- **Risco de acoplamento**: NAO fazer o rate limiter depender de config externa (DB, env vars). Os tiers sao definidos pela Klaviyo e mudam raramente — hardcode com const e suficiente.
- **Decisao**: Manter rate limiter stateless entre invocacoes (sem persistencia). O cron roda como single invocation, entao state in-memory e adequado.

### @analyst — Anotacoes de Impacto

- **ROI**: Esta e a story de maior impacto do epic. Os null responses por rate limit afetam diretamente a qualidade dos dados exibidos no dashboard.
- **Metricas pre/pos**: Medir `null_response_rate` nos logs antes e depois do deploy. Target: de ~30% para <5%.
- **Risco de negocio**: Se o tiered limiter for muito conservador (intervalos altos demais), o cron nao vai processar todas as lojas no timeout. Precisa balancear compliance vs throughput.
- **Dependencia critica**: Confirmar com @data-engineer que o calculo de 22 min para reports XS e realista. Se for, AK-3 (consolidacao) se torna pre-requisito pratico, nao apenas P1.
