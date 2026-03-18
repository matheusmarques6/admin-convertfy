# Epic: API Klaviyo — Rate Limit & Compliance

## Contexto

Auditoria completa (Marco 2026) comparando nosso codebase com a documentacao oficial da Klaviyo revelou 9 achados iniciais + 5 recomendacoes da analise de freshness thresholds (AK-10 a AK-14). O principal: nosso rate limiter usa intervalo fixo de 1200ms para TODOS os endpoints, violando o tier XS da Reporting API.

> **Decisao chave**: Os dados do sistema DEVEM ser identicos ao dashboard Klaviyo.
> Por isso, mantemos `flow-values-reports` e `campaign-values-reports` (Reporting API)
> em vez de substituir por `metric-aggregates` (que diverge ate ~20%).

## Stories

| # | Story | Prioridade | Esforco | Fase |
|---|-------|-----------|---------|------|
| AK-1 | Tiered Rate Limiter (XS/S/XL) | P0 CRITICAL | LOW-MEDIUM | 1 |
| AK-4 | Serializar Promise.all no report-summary.ts | P0 CRITICAL | TRIVIAL | 1 |
| AK-6 | Freshness Threshold 7d: 0 → 1h | P0 CRITICAL | TRIVIAL | 1 |
| AK-3 | Remover delay redundante + cache-first summary | P1 HIGH | LOW | 2 |
| AK-5 | Remover additional-fields + Fallback Individual | P1 HIGH | LOW | 2 |
| AK-7 | SMS Stats por Canal | P1 HIGH | MEDIUM | 2 |
| AK-2 | Daily Report Quota Tracking | P1 HIGH | LOW | 2 |
| AK-8 | Upgrade Revision para Ultima Estavel | P2 MEDIUM | MEDIUM | 3 |
| AK-9 | Documentar Gap Reporting vs Metric Aggregates | P3 LOW | TRIVIAL | 3 |
| AK-10 | Relaxar Freshness Thresholds (Todos os Periodos) | P0 CRITICAL | TRIVIAL | 1 |
| AK-11 | Adicionar 12m ao CACHED_PERIODS (threshold 24h) | P1 HIGH | LOW | 2 |
| AK-12 | XS Budget Cap por Ciclo de Cron | P1 HIGH | LOW-MEDIUM | 2 |
| AK-13 | Write-Through Cache para Periodo 1d | P2 MEDIUM | LOW | 3 |
| AK-14 | Indicador de Data Settling no Portal | P3 LOW | LOW | 4 |

## Ordem de Execucao

### Fase 1 — Critical (P0)

> **AK-1 + AK-6 devem ser deployados juntos.**
> Com AK-6 (freshness 1h) + Epic 55 (freshness skip), apenas ~3-5 lojas/run precisam sync.
> 3-5 lojas x 3 calls XS x 4s = ~36-60s. Cabe folgado nos 240s.

1. **AK-4** (TRIVIAL) — serializar Promise.all, deploy imediato independente
2. **AK-6** (TRIVIAL) — freshness 7d 0→1h ┐
3. **AK-1** (LOW-MED) — tiered rate limiter ├─ DEPLOY JUNTOS
                                             ┘
4. **AK-10** (TRIVIAL) — relaxar TODOS os thresholds (7d→3h, 15d→4h, 30d→6h, 90d→12h). Deploy apos AK-6.

### Fase 2 — High (P1)

5. **AK-3** (LOW) — remover delay redundante (depende de AK-1)
6. **AK-5** (LOW) — remover additional-fields + fallback
7. **AK-7** (MEDIUM) — SMS stats por canal (bug de dados: SMS 100% perdido)
8. **AK-2** (LOW) — daily quota tracking (observabilidade preventiva)
9. **AK-11** (LOW) — adicionar 12m ao CACHED_PERIODS (depende de AK-10)
10. **AK-12** (LOW-MED) — XS budget cap por ciclo de cron (depende de AK-2 + AK-1)

### Fase 3 — Medium/Low (P2/P3)

11. **AK-8** (MEDIUM) — revision upgrade (verificar revision exata antes)
12. **AK-9** (TRIVIAL) — documentacao ADR (apos validar em producao)
13. **AK-13** (LOW) — write-through cache para 1d (independente)

### Fase 4 — Nice to Have (P3)

14. **AK-14** (LOW) — indicador de data settling no portal (frontend only)

## Dependencias

```
AK-4 (independente, fix imediato)
AK-6 (independente, mas deployar com AK-1)
AK-1 → AK-3 (delay so pode ser removido com tiered limiter ativo)
AK-1 → AK-2 (quota usa classifyEndpoint de AK-1)
AK-5 (independente — validar profile_count empiricamente antes)
AK-7 (independente — coluna channel JA EXISTE no schema)
AK-8 (independente — verificar revision exata no changelog Klaviyo)
AK-9 (depende de epic validado em producao)
AK-10 (independente, mas melhor apos AK-6 — mesma constante)
AK-10 → AK-11 (thresholds relaxados liberam budget para 12m)
AK-2 + AK-1 → AK-12 (budget cap usa getReportQuotaUsage + classifyEndpoint)
AK-13 (independente — write-through para 1d)
AK-14 (independente — frontend only, zero backend)
```

## Conflitos de Merge Conhecidos

| Arquivos | Stories | Risco | Mitigacao |
|----------|---------|-------|-----------|
| `rate-limiter.ts` | AK-1 + AK-2 | MEDIO | AK-1 primeiro, AK-2 rebasa |
| `report-summary.ts` | AK-4 + AK-3 | BAIXO | AK-4 primeiro, AK-3 depois |
| `klaviyo-sync.service.ts` | AK-3 + AK-7 | BAIXO | AK-3 primeiro, AK-7 depois |
| `data-status.ts` | AK-6 + AK-10 + AK-11 vs Epic 55.1 | ALTO | AK-6 primeiro, AK-10 depois, AK-11 por ultimo. Mesmo objeto PERIOD_FRESHNESS_THRESHOLDS |
| `report-summary.ts` | AK-13 + AK-4 + AK-3 | BAIXO | AK-4 primeiro, AK-3 depois, AK-13 independente (path diferente) |
| `sync-reports/route.ts` | AK-12 + AK-2 | BAIXO | AK-2 primeiro (tracking), AK-12 depois (budget cap usa tracking) |

## Verificacoes Pendentes (PRE-DEV)

- [ ] **Cap diario**: Nao confirmado em docs oficiais. Tornar constante configuravel.
- [ ] **Revision exata**: Verificar no changelog Klaviyo a ultima revision estavel.
- [ ] **profile_count**: Testar `/lists/` sem `additional-fields` — vem ou nao?
- [ ] **Coluna channel**: Confirmar que `klaviyo_campaign_metrics.channel` ja existe (migration 20250213).

## Calculo de Viabilidade (pos Fase 1 + AK-10)

```
Com AK-1 (tiered: XS=4s, S=1.2s, XL=200ms)
   + AK-6 (7d freshness 1h) + AK-10 (thresholds relaxados)
   + Epic 55 (freshness skip):

Steady state por cron run (cada 5 min) — thresholds AK-10:
  7d:  ~1 loja/run (42 lojas / 8 syncs/dia = ~5 lojas/h)
  15d: ~0-1 loja
  30d: ~0 lojas
  90d: ~0 lojas
  12m: ~0 lojas (AK-11, 1 sync/dia)

  Total: ~1-2 lojas x 3 calls XS x 4s = 12-24s
  + metadata (tier S/M): ~10-20s
  = TOTAL: ~25-45s (margem enorme dentro dos 240s)

Consumo diario por key (pos AK-10):
  ~120 calls XS/key/dia (vs ~270 antes) = 55% reducao
  Budget room: 225 - 120 = 105 calls/key de margem
```

## Impacto Esperado

- Eliminar ~90% dos null responses por rate limit
- Dados 100% consistentes com dashboard Klaviyo (Reporting API mantida)
- Capturar dados de SMS (atualmente 100% perdidos)
- 42/42 lojas processadas dentro do timeout

## Limite Arquitetural

O modelo de cron single-invocation (240s) e viavel para ~50-60 lojas com todas as otimizacoes.
Acima disso: queue-based workers ou invocacoes escalonadas.
Crescimento ~5 lojas/mes → limite em ~12 meses.

## Revisao QA — Gate Decision

**Status: PASS** (5 agentes revisaram, concerns resolvidos em 2026-03-18)
- Blocker "dados divergentes" resolvido: Reporting API mantida
- Blocker "deploy atomico" simplificado: AK-1 + AK-6 (nao mais 3 stories)
- Pendentes: verificacoes pre-dev listadas acima
