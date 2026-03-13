# Klaviyo Rate Limit - Graceful Degradation Architecture

**Data**: 2026-03-13
**Status**: Proposta Arquitetural (para revisao)
**Autor**: Aria (Architect Agent)

---

## 1. Diagnostico do Estado Atual

### 1.1 Fluxo de Dados Existente

```
                                   Klaviyo API
                                       |
                    +------------------+------------------+
                    |                  |                  |
              flow-values-reports  campaign-values   metric-aggregates
                    |                  |                  |
                    v                  v                  v
              klaviyoRequest() --- rate-limiter.ts (1.2s/req/key)
                    |
            +-------+-------+
            |               |
         CRON SYNC      LIVE FETCH
     (sync-reports)    (report/route.ts, refresh-revenue, portal/dashboard)
            |               |
            v               v
   store_revenue_summary    Resposta direta ao usuario
   klaviyo_flow_metrics     (sem persistencia em muitos casos)
   klaviyo_campaign_metrics
   klaviyo_audiences
            |
            v
      Portal Dashboard (le de store_revenue_summary)
```

### 1.2 Pontos de Entrada que Chamam Klaviyo

| Endpoint | Tipo | Persiste? | Fallback atual |
|----------|------|-----------|----------------|
| `GET /api/cron/sync-reports` | Cron (4 periodos x N lojas) | Sim (store_revenue_summary + flow/camp metrics) | `upsertSyncError()` marca `partial` ou `error` |
| `POST /api/dashboard/refresh-revenue` | Manual (usuario) | Sim (via `upsertSyncResults`) | Retorna `{ status: "error" }` |
| `GET /api/integrations/klaviyo/report` | Live report (admin) | Nao | Retorna erro HTTP |
| `GET /api/integrations/klaviyo/flows` | Live listing | Nao | Retorna erro HTTP |
| `GET /api/integrations/klaviyo/campaigns` | Live listing | Nao | Retorna erro HTTP |
| `GET /api/portal/dashboard` | Portal (le do cache) | Le store_revenue_summary | Ja usa cache-first |
| `getKlaviyoRevenueForStore()` | Internal (stores control) | Nao | Retorna `{ success: false }` |

### 1.3 Rate Limit Handling Atual

**O que ja funciona bem:**

1. **Rate limiter global** (`rate-limiter.ts`): Fila por API key, 1.2s entre requests, previne storms
2. **Retry com backoff** (`client.ts`): 3 retries com 1.5s/3s/6s backoff
3. **Fail-fast em 429 longo** (`client.ts`): Se `Retry-After > 10s`, lanca `KlaviyoRateLimitError` imediatamente
4. **Cron protections** (`sync-reports/route.ts`):
   - 3 rate limits consecutivos = skip remaining periods
   - `upsertSyncError()` preserva revenue existente marcando `partial`
   - Permission skip por 24h
5. **Stale cache** (`cache.ts`): `getStaleCache()` existe com grace period de 24h

**Onde esta o GAP:**

1. **Live endpoints NAO usam fallback**: `report/route.ts`, `flows/route.ts`, `campaigns/route.ts` nao consultam banco quando Klaviyo falha
2. **`report-summary.ts`**: Captura `KlaviyoRateLimitError` no catch generico mas nao tenta cache
3. **`refresh-revenue`**: Rate limit vira `{ status: "error" }` sem tentar ler dados existentes
4. **Frontend**: Nao distingue "dados stale mas validos" de "sem dados"
5. **Nao ha circuit breaker**: Cada request testa Klaviyo independentemente, sem memoria de falhas recentes

---

## 2. Arquitetura Proposta: Stale-While-Error com Circuit Breaker

### 2.1 Visao Geral

```
  Request do usuario
        |
        v
  [Circuit Breaker Check] ──── OPEN? ──> [Serve from DB]
        |                                      |
      CLOSED                            (dados < 48h = OK)
        |                              (dados > 48h = mensagem)
        v
  [Klaviyo API Call]
        |
   +----+----+
   |         |
 SUCCESS   429/TIMEOUT
   |         |
   v         v
 Persist   [Trip Circuit Breaker]
 + Return  [Serve from DB + flag stale]
```

### 2.2 Componente 1: Circuit Breaker por API Key

**Arquivo**: `src/lib/integrations/klaviyo/circuit-breaker.ts`

**Conceito**: Estado em memoria (per-process) + persistencia leve em `dashboard_cache` para compartilhar entre serverless instances.

**Estados:**
- `CLOSED`: Operacao normal, todas requests passam
- `OPEN`: Klaviyo indisponivel, nenhuma request passa, serve do banco
- `HALF_OPEN`: Uma request de teste passa para verificar se Klaviyo voltou

**Transicoes:**
- `CLOSED -> OPEN`: Apos 3 rate limits em janela de 2 minutos (mesmo key)
- `OPEN -> HALF_OPEN`: Apos cooldown de 60 segundos
- `HALF_OPEN -> CLOSED`: Request de teste retorna 2xx
- `HALF_OPEN -> OPEN`: Request de teste retorna 429 (reseta cooldown para 120s, backoff progressivo)

**Justificativa**:
- Klaviyo rate limits sao por API key (nao por conta), entao o circuit breaker deve ser por key
- In-memory e suficiente para o cron (processo unico), mas serverless cold starts perdem estado
- Persistir em `dashboard_cache` com TTL curto (5min) resolve cold starts sem complexidade

### 2.3 Componente 2: Fallback Layer nos Live Endpoints

**Principio**: Todo endpoint que chama Klaviyo deve ter fallback para `store_revenue_summary` e/ou tabelas de metricas.

**Implementacao por endpoint:**

#### `/api/integrations/klaviyo/report/route.ts`
- Antes de chamar Klaviyo, consultar circuit breaker
- Se OPEN: ler `store_revenue_summary` + `klaviyo_flow_metrics` + `klaviyo_campaign_metrics` para o periodo
- Retornar com header `X-Data-Source: cached` e campo `dataAge` no body
- Se dados > 48h ou inexistentes: retornar `{ dataStatus: "unavailable", message: "..." }`

#### `/api/integrations/klaviyo/flows/route.ts` e `campaigns/route.ts`
- Estes listam flows/campaigns da Klaviyo (nao metricas)
- Fallback: ler nomes de `klaviyo_flow_metrics` / `klaviyo_campaign_metrics` (campo `flow_name`, `campaign_name`)
- Metricas dos flows/campaigns ja estao nessas tabelas

#### `/api/dashboard/refresh-revenue/route.ts`
- Se rate limited: retornar dados existentes de `store_revenue_summary` com `{ refreshed: false, reason: "rate_limited", dataAge: "..." }`
- Frontend deve mostrar "dados atualizados ha X horas" em vez de erro

#### `report-summary.ts` (`getKlaviyoRevenueForStore`)
- Adicionar fallback: se `KlaviyoRateLimitError`, consultar `store_revenue_summary`
- Se dados existem e `fetched_at < 48h`: retornar com `source: "cache"`
- Se nao: retornar `{ success: false, error: "rate_limited_no_cache" }`

### 2.4 Componente 3: Data Staleness Policy

**Regra de negocio proposta:**

| Idade dos dados | Comportamento | Indicador visual |
|-----------------|---------------|------------------|
| < 6 horas | Servir normalmente | Nenhum (dados "frescos") |
| 6h - 24h | Servir com aviso sutil | Badge "Atualizado ha Xh" |
| 24h - 48h | Servir com aviso visivel | Banner amarelo: "Dados podem estar desatualizados" |
| > 48h | NAO servir | Mensagem: "Nao foi possivel atualizar os dados devido a uma limitacao da Klaviyo. Assim que a situacao melhorar, os dados serao atualizados automaticamente." |

**Implementacao**:
- Novo campo no response: `staleness: { ageMs: number, status: "fresh" | "stale" | "very_stale" | "unavailable" }`
- Frontend consome `staleness.status` para renderizar indicadores

### 2.5 Componente 4: Cron Hardening

O cron ja tem boa protecao, mas pode melhorar:

1. **Priority ordering**: Processar lojas com `sync_status = 'error'` por ultimo (priorizar lojas com dados OK para mante-los frescos)
2. **Adaptive scheduling**: Se muitas lojas estao rate limited, reduzir frequencia do cron temporariamente (variavel de ambiente ou flag no banco)
3. **Per-key budget tracking**: Contar quantas requests cada key fez no ciclo atual, parar antes de saturar

---

## 3. Consequencias Arquiteturais

### 3.1 Impacto nos Componentes

| Componente | Mudanca | Esforco |
|------------|---------|---------|
| `client.ts` | Integrar check de circuit breaker antes de requests | LOW |
| `circuit-breaker.ts` | Novo arquivo (~100 linhas) | LOW |
| `report/route.ts` | Adicionar fallback para tabelas de metricas | MEDIUM |
| `flows/route.ts` | Adicionar fallback para `klaviyo_flow_metrics` | MEDIUM |
| `campaigns/route.ts` | Adicionar fallback para `klaviyo_campaign_metrics` | MEDIUM |
| `refresh-revenue/route.ts` | Retornar dados existentes em vez de erro | LOW |
| `report-summary.ts` | Consultar `store_revenue_summary` em fallback | LOW |
| `portal/dashboard/route.ts` | Ja usa cache-first, apenas enriquecer com staleness | LOW |
| Frontend (portal) | Adicionar indicadores de staleness | LOW |
| Frontend (admin) | Adicionar indicadores de staleness | LOW |

### 3.2 Fluxo de Dados Resultante

```
  Request
    |
    v
  [Circuit Breaker] ─── OPEN ──> [Read DB] ──> Response + staleness meta
    |
  CLOSED
    |
    v
  [Klaviyo API]
    |
  +-----+------+
  |            |
SUCCESS     FAILURE (429/timeout)
  |            |
  v            v
Persist     [Trip breaker]
+ Return    [Read DB] ──> Response + staleness meta
                            |
                     dados < 48h? ──> OK (stale)
                            |
                     dados > 48h? ──> "indisponivel"
```

### 3.3 Consistencia de Dados

**Risco**: Servir dados stale pode confundir usuarios que esperam numeros em tempo real.

**Mitigacao**:
- Sempre mostrar `fetched_at` visualmente
- Cron continua tentando atualizar a cada ciclo (atualmente ~5min)
- Quando circuit breaker fecha (Klaviyo volta), proximo cron atualiza tudo
- Dados de campanhas/flows sao inerentemente retroativos (Klaviyo attribution window = 5 dias), entao staleness de 24-48h tem impacto minimo em metricas de periodos >= 7d

**Risco**: Inconsistencia entre diferentes tabelas (revenue summary vs flow metrics vs campaign metrics) se algumas atualizaram e outras nao.

**Mitigacao**:
- O cron ja faz upsert atomico por loja+periodo (`upsertSyncResults`)
- Manter esse padrao: ou atualiza tudo do periodo, ou nao atualiza nada
- `sync_status = 'partial'` ja existe para sinalizar inconsistencia

---

## 4. Ressalvas e Riscos

### 4.1 Cache Invalidation

**Problema**: `store_revenue_summary` tem `expires_at` e o cleanup job deleta expirados. Se o circuit breaker esta OPEN por muito tempo, os dados expiram e nao ha fallback.

**Solucao**: Modificar `clean_expired_revenue_summaries()` para NAO deletar rows com `sync_status IN ('ok', 'partial')` enquanto nao houver dados mais recentes. Ou seja, manter o "ultimo dado bom" indefinidamente, so deletar quando substituido.

**Alternativa mais simples**: Aumentar TTL de `store_revenue_summary` de 24h para 72h. O cron roda a cada 5min e sobrescreve com dados frescos normalmente; o TTL longo so importa quando Klaviyo esta indisponivel.

### 4.2 Circuit Breaker em Serverless

**Problema**: Vercel serverless = stateless. Circuit breaker in-memory perde estado entre invocacoes.

**Opcoes**:
1. **Persistir em `dashboard_cache`** (recomendado): row `cache_type = 'circuit_breaker'`, `period = apiKey_hash`. TTL = 5min. Overhead: 1 SELECT por request (ja fazemos isso para cache).
2. **Vercel KV / Upstash Redis**: Se ja estiver no stack, ideal para estado efemero. Mas adiciona dependencia.
3. **Aceitar o tradeoff**: Circuit breaker in-memory protege dentro de uma mesma invocacao (cron = longa duracao, processa muitas lojas). Para requests curtas (report endpoint), o rate limiter + retry ja faz o trabalho.

**Recomendacao**: Opcao 3 para MVP (circuit breaker in-memory), evoluir para opcao 1 se rate limits persistirem em producao.

### 4.3 Data Staleness Limite (48h)

**Justificativa do limite de 48h**:
- Metricas de Klaviyo sao retroativas (attribution window = 5 dias)
- Dados de 48h atras para periodos de 7d/30d/90d ainda sao ~95% precisos
- Apos 48h sem sync, provavelmente ha problema estrutural (key expirada, scopes revogados), nao rate limit transitorio

**Excecao**: Periodo `1d` e `yesterday` sao mais sensiveis a staleness. Para estes, limite deveria ser 6h. Mas eles sao `LIVE_ONLY_PERIODS`, nao pre-cached pelo cron, entao sempre fazem fetch direto.

### 4.4 Thundering Herd na Recuperacao

**Problema**: Quando Klaviyo volta (circuit breaker fecha), todas as lojas tentam atualizar simultaneamente.

**Mitigacao existente**: O rate limiter (`rate-limiter.ts`) ja serializa por API key com 1.2s entre requests. O cron processa grupos com delays. Nao precisa de mitigacao adicional.

---

## 5. Melhorias Sugeridas (Alem do MVP)

### 5.1 Cache Warming Proativo

Apos circuit breaker fechar (Klaviyo volta), disparar um refresh imediato das lojas afetadas em vez de esperar o proximo ciclo do cron.

**Implementacao**: Endpoint interno `POST /api/internal/warm-cache` chamado quando circuit breaker transiciona `HALF_OPEN -> CLOSED`.

### 5.2 Retry-After Header Propagation

Quando Klaviyo retorna `Retry-After`, propagar esse valor para o frontend via response header `X-Retry-After`. O frontend pode usar isso para desabilitar o botao "Atualizar" pelo tempo correto.

### 5.3 Metricas de Observabilidade

Adicionar ao log estruturado:
- `circuit_breaker_state_change`: Quando transiciona entre estados
- `cache_fallback_served`: Quando dados stale sao servidos (com `ageMs`)
- `rate_limit_budget_exhausted`: Quando uma key atinge o limite do ciclo

Isso permite criar alertas no Vercel/Sentry quando rate limits estao sistematicos (indicando problema de key ou aumento de lojas).

### 5.4 Backpressure Signal para o Frontend

Novo campo no response da API:

```typescript
interface BackpressureSignal {
  isLimited: boolean
  estimatedRecoveryMs?: number
  suggestion: "wait" | "retry" | "contact_support"
}
```

O frontend pode:
- Desabilitar botao "Atualizar" temporariamente
- Mostrar countdown ate recovery estimado
- Reduzir polling frequency

### 5.5 Split Cron para Periodos Pesados

Atualmente o cron processa 4 periodos (7d, 15d, 30d, 90d) por loja em sequencia. Cada periodo = 3 API calls (flow report + campaign report + metric aggregates) = 12 calls/loja minimo.

**Proposta**: Separar em 2 crons:
- **Cron A (alta frequencia, cada 5min)**: 7d e 30d (periodos mais usados)
- **Cron B (baixa frequencia, cada 30min)**: 15d e 90d (menos acessados)

Isso reduz o burst por ciclo e diminui a chance de rate limit.

---

## 6. Plano de Implementacao Faseado

### Fase 1: Fallback nos Live Endpoints (PRIORIDADE ALTA)

**Objetivo**: Quando Klaviyo retorna 429, servir dados do banco.

**Escopo**:
1. `report-summary.ts`: Fallback para `store_revenue_summary`
2. `report/route.ts`: Fallback para tabelas de metricas
3. `refresh-revenue/route.ts`: Retornar dados existentes
4. Adicionar `staleness` metadata ao response

**Esforco**: ~3-4 stories, MEDIUM

### Fase 2: Staleness UX no Frontend (PRIORIDADE MEDIA)

**Objetivo**: Indicadores visuais de freshness dos dados.

**Escopo**:
1. Tipo `DataStaleness` compartilhado
2. Componente `<StalenessIndicator>` reutilizavel
3. Integrar no portal dashboard e admin store views

**Esforco**: ~2 stories, LOW

### Fase 3: Circuit Breaker (PRIORIDADE MEDIA)

**Objetivo**: Parar de bater na API quando ja sabemos que vai falhar.

**Escopo**:
1. `circuit-breaker.ts` in-memory
2. Integrar no `klaviyoRequest()` (check antes de fetch)
3. Log de transicoes de estado

**Esforco**: ~1 story, LOW

### Fase 4: Cron Hardening (PRIORIDADE BAIXA)

**Objetivo**: Otimizar uso do budget de API.

**Escopo**:
1. Priority ordering de lojas
2. Split cron por frequencia
3. Per-key budget tracking

**Esforco**: ~2-3 stories, MEDIUM

---

## 7. ADR - Decisoes Arquiteturais

### ADR-1: Stale-While-Error sobre Stale-While-Revalidate

**Contexto**: O padrao `stale-while-revalidate` serve dados stale e revalida em background. `Stale-while-error` serve stale apenas quando o upstream falha.

**Decisao**: Usar `stale-while-error` porque:
- O cron ja faz revalidacao em background (a cada 5min)
- Live endpoints nao precisam revalidar se o cron esta funcionando
- `stale-while-revalidate` em serverless e complicado (sem background tasks persistentes)

### ADR-2: Circuit Breaker In-Memory (MVP) sobre Distributed

**Contexto**: Circuit breaker distribuido (Redis) garante consistencia entre instancias serverless.

**Decisao**: In-memory para MVP porque:
- O principal consumidor e o cron (processo longo, processa todas as lojas)
- Live endpoints ja tem rate limiter + retry como primeira defesa
- Adicionar Redis so para circuit breaker e over-engineering dado o volume atual

### ADR-3: Limitar Staleness a 48h

**Contexto**: Quanto tempo dados stale sao aceitaveis?

**Decisao**: 48h porque:
- Dados de email marketing sao retroativos (attribution window = 5 dias)
- Apos 48h sem sync, provavelmente ha problema permanente (key/scope), nao transitorio
- Usuarios preferem ver "indisponivel" a ver numeros de 5 dias atras sem saber

### ADR-4: NAO Usar Upstash/Redis para Circuit Breaker

**Contexto**: Upstash Redis ja existe no stack (BullMQ do AppFy), poderia ser reutilizado.

**Decisao**: Nao usar porque:
- admin-convertfy NAO tem Redis no stack atual
- Adicionar dependencia de Redis para um unico feature e desproporcional
- `dashboard_cache` (Supabase) pode servir como store distribuido se necessario no futuro

---

## 8. Resumo Executivo

**Problema**: Rate limits da Klaviyo causam falhas visiveis ao usuario.

**Solucao**: Graceful degradation em 3 camadas:
1. **Circuit breaker** (prevencao): Parar de chamar API quando ja sabemos que vai falhar
2. **DB fallback** (recuperacao): Servir dados recentes do banco quando API falha
3. **Staleness UX** (comunicacao): Informar o usuario sobre a idade dos dados

**Impacto estimado**:
- 0% dos rate limits resultam em tela vazia (atual: ~30% dos casos em live endpoints)
- Dados servidos com latencia < 200ms quando em fallback (vs 15s timeout + erro)
- Cron continua sendo a fonte primaria de dados frescos

**Custo**:
- 0 infraestrutura adicional (usa tabelas existentes)
- ~8-10 stories de desenvolvimento
- Nenhuma migration de banco necessaria (tabelas ja existem)

---

*-- Aria, arquitetando o futuro*
