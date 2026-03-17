---
Prioridade: Medium
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa, @analyst"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: MEDIUM
---

# Story RG-M4 — Fix Click Rate Unit Inconsistency (Decimal vs %)

## Story

**Como** desenvolvedor manutendo o sistema de metricas,
**Quero** que click rate e outras rates estejam sempre em porcentagem (0-100),
**Para que** novos consumidores nao tenham que adivinhar se o valor e decimal ou percentual.

## Contexto

### Problema

A API Klaviyo retorna `click_rate` como decimal (0.035 = 3.5%). O codigo as vezes multiplica por 100, as vezes nao:

- `klaviyo-performance.service.ts:605`: `Math.round(m.clickRate * 100 * 100) / 100` (converte decimal → %)
- `klaviyo-performance.service.ts:639`: `(campaignClickRateSum / rateCount) * 100` (soma decimais, depois converte)
- `klaviyo-sync.service.ts:597`: `(clicked / delivered) * 100` (calcula direto em %)

O campo `click_rate` contem unidades diferentes dependendo de qual service o populou.

### Tambem afeta

- `totalRevenue` em `report-summary.ts` — e na verdade "attributed revenue" (campaign + flow), naming ambiguo
- `liveFlows` sempre == `totalFlows` em performance service (draft/manual nao filtrados)

## Acceptance Criteria

### AC1: Padronizar rates em porcentagem
- [ ] Documentar convencao: TODOS os campos `*_rate` e `*Rate` sao porcentagem (0-100)
- [ ] Converter no ponto de entrada (onde API Klaviyo retorna decimal)
- [ ] Calcular de counts quando possivel (mais confiavel)

### AC2: Fix performance service
- [ ] Garantir que click_rate acumulado e consistente antes da media
- [ ] Flow rate aggregation: usar soma de counts em vez de `||` overwrite (line 473-483)

### AC3: Fix naming ambiguo
- [ ] Renomear `KlaviyoRevenueSummary.totalRevenue` para `attributedRevenue`
- [ ] Fix `liveFlows`: filtrar por `status === "live"` (excluir draft/manual)

## Arquivos Afetados

- `src/lib/services/klaviyo-performance.service.ts`
- `src/lib/integrations/klaviyo/report-summary.ts`
