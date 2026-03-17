---
Prioridade: Critical
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa, @analyst"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: MEDIUM
---

# Story RG-M1 — Padronizar Open Rate (opens/delivered everywhere)

## Story

**Como** agencia usando o admin-convertfy,
**Quero** que "open rate" tenha a mesma formula em todas as telas,
**Para que** eu nao veja numeros contraditórios ao comparar dashboard vs report.

## Contexto

### Problema

"Open rate" e calculado de formas diferentes dependendo da tela:

| Local | Formula | Exemplo (10k opens, 20k delivered, 2k clicks) |
|-------|---------|-----------------------------------------------|
| Report route (line 603) | `stats.click_to_open_rate` (clicks/opens) | **20%** |
| Dashboard cache (line 295) | `totalOpened / totalDelivered * 100` | **50%** |
| Sync service (line 596) | `(opened / delivered) * 100` | **50%** |
| Performance service (line 585-605) | `click_to_open_rate` da API | **20%** |

O label e "open rate" em todos os lugares, mas o numero pode ser 20% ou 50% dependendo da tela.

### Formula correta

`open_rate = opens / delivered * 100`

`click_to_open_rate` (clicks/opens) e uma metrica DIFERENTE e deve ter seu proprio campo.

## Acceptance Criteria

### AC1: Definir formula unica
- [ ] Criar utility `calculateOpenRate(opens: number, delivered: number): number` em `src/lib/utils/`
- [ ] Formula: `delivered > 0 ? (opens / delivered) * 100 : 0`
- [ ] Arredondar para 2 casas decimais

### AC2: Fix no report route
- [ ] `src/app/api/integrations/klaviyo/report/route.ts:603` — substituir `click_to_open_rate` por calculo de `opens/delivered`
- [ ] Se quiser manter click_to_open_rate, colocar em campo separado (nao sobrescrever openRate)

### AC3: Fix no performance service
- [ ] `src/lib/services/klaviyo-performance.service.ts:585-605` — usar `opens/delivered` em vez de `click_to_open_rate`
- [ ] Corrigir aggregacao de flow rates (line 473-483): nao usar `||` que sobrescreve com ultimo valor

### AC4: Verificar consistencia
- [ ] Dashboard, Report, Sync, Performance — todos devem usar a mesma formula
- [ ] Adicionar campo separado `clickToOpenRate` onde necessario

## Notas de Implementacao (pos-review)

- **Escopo real**: o problema esta concentrado no **report route** e **performance service**. Dashboard (line 295) e sync service (line 596) JA calculam corretamente `opens/delivered`.
- **Dados cached**: nao e necessario backfill. O proximo ciclo do cron corrigira automaticamente os valores em `store_revenue_summary` e `klaviyo_*_metrics`.
- **Overlap com RG-M4**: ambas stories tocam `klaviyo-performance.service.ts`. Coordenar — idealmente fazer M1 primeiro, M4 em seguida.

## Arquivos Afetados

- `src/lib/utils/` — novo utility
- `src/app/api/integrations/klaviyo/report/route.ts` — **foco principal**
- `src/lib/services/klaviyo-performance.service.ts` — **foco principal**
- `src/app/api/portal/dashboard/route.ts` (verificar — provavelmente ja correto)
- `src/lib/services/klaviyo-sync.service.ts` (verificar — provavelmente ja correto)
