# Epic: API Klaviyo — Rate Limit & Compliance

## Contexto

Auditoria completa (Marco 2026) comparando nosso codebase com a documentacao oficial da Klaviyo revelou 9 achados. O principal: nosso rate limiter usa intervalo fixo de 1200ms para TODOS os endpoints, violando o tier XS da Reporting API.

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

## Ordem de Execucao

### Fase 1 — Critical (P0)

> **AK-1 + AK-6 devem ser deployados juntos.**
> Com AK-6 (freshness 1h) + Epic 55 (freshness skip), apenas ~3-5 lojas/run precisam sync.
> 3-5 lojas x 3 calls XS x 4s = ~36-60s. Cabe folgado nos 240s.

1. **AK-4** (TRIVIAL) — serializar Promise.all, deploy imediato independente
2. **AK-6** (TRIVIAL) — freshness 7d 0→1h ┐
3. **AK-1** (LOW-MED) — tiered rate limiter ├─ DEPLOY JUNTOS
                                             ┘

### Fase 2 — High (P1)

4. **AK-3** (LOW) — remover delay redundante (depende de AK-1)
5. **AK-5** (LOW) — remover additional-fields + fallback
6. **AK-7** (MEDIUM) — SMS stats por canal (bug de dados: SMS 100% perdido)
7. **AK-2** (LOW) — daily quota tracking (observabilidade preventiva)

### Fase 3 — Medium/Low (P2/P3)

8. **AK-8** (MEDIUM) — revision upgrade (verificar revision exata antes)
9. **AK-9** (TRIVIAL) — documentacao ADR (apos validar em producao)

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
```

## Conflitos de Merge Conhecidos

| Arquivos | Stories | Risco | Mitigacao |
|----------|---------|-------|-----------|
| `rate-limiter.ts` | AK-1 + AK-2 | MEDIO | AK-1 primeiro, AK-2 rebasa |
| `report-summary.ts` | AK-4 + AK-3 | BAIXO | AK-4 primeiro, AK-3 depois |
| `klaviyo-sync.service.ts` | AK-3 + AK-7 | BAIXO | AK-3 primeiro, AK-7 depois |
| `data-status.ts` | AK-6 vs Epic 55.1 | MEDIO | Coordenar — mesmo arquivo |

## Verificacoes Pendentes (PRE-DEV)

- [ ] **Cap diario**: Nao confirmado em docs oficiais. Tornar constante configuravel.
- [ ] **Revision exata**: Verificar no changelog Klaviyo a ultima revision estavel.
- [ ] **profile_count**: Testar `/lists/` sem `additional-fields` — vem ou nao?
- [ ] **Coluna channel**: Confirmar que `klaviyo_campaign_metrics.channel` ja existe (migration 20250213).

## Calculo de Viabilidade (pos Fase 1)

```
Com AK-1 (tiered: XS=4s, S=1.2s, XL=200ms)
   + AK-6 (7d freshness 1h)
   + Epic 55 (freshness skip):

Steady state por cron run (cada 5 min):
  7d:  ~2 lojas precisam sync (42 / 24 syncs/dia)
  15d: ~1 loja
  30d: ~0-1 loja
  90d: ~0 lojas

  Total: ~3-5 lojas x 3 calls XS x 4s = 36-60s
  + metadata (tier S/M): ~10-20s
  = TOTAL: ~50-80s (bem dentro dos 240s)
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
