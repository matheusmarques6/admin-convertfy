---
Prioridade: High
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "2 - High Priority"
Esforco: LOW
Dependencias: "AK-1 (tiered limiter), AK-4 (serializar report-summary)"
---

# Story AK-3 — Eliminar REPORT_API_DELAY_MS Redundante + Otimizar report-summary.ts

## Story

**Como** operador do sistema,
**Quero** que o delay manual de 300ms entre report calls no cron seja removido (o tiered rate limiter ja cuida do spacing), e que o `report-summary.ts` use a mesma fonte de dados do Klaviyo UI,
**Para que** o sistema seja mais rapido sem violar rate limits e os dados sejam 100% consistentes com o dashboard nativo do Klaviyo.

## Contexto

### Decisao Arquitetural: Manter Reporting API

> **Os dados do nosso sistema DEVEM ser identicos aos do dashboard Klaviyo.**
> A Reporting API (`flow-values-reports`, `campaign-values-reports`) usa a mesma logica de atribuicao do Klaviyo UI (revenue atribuida pela data de ENVIO da mensagem).
> O `metric-aggregates` usa data do EVENTO (Placed Order) — diverge ate ~20% para periodos curtos.
> **Decisao: NAO substituir Reporting API por Metric Aggregates para flow/campaign breakdown.**

### O que sobra para otimizar

1. **REPORT_API_DELAY_MS = 300**: Delay manual entre report calls no cron (`klaviyo-sync.service.ts:476`). Com AK-1 (tiered rate limiter com 4s para XS), esse delay e redundante — o rate limiter ja aplica o intervalo correto. Remove-lo economiza ~0.9s por loja/periodo (3 calls x 300ms).

2. **report-summary.ts com 2 report calls**: O stores control panel busca `campaignRevenue` e `flowRevenue` via 2 report calls separados. Pos AK-4, eles ja sao serializados. Nenhuma mudanca estrutural necessaria, mas podemos otimizar se os dados ja estiverem no cache.

3. **Calculo de viabilidade do cron**: Com AK-1 + AK-6 + Epic 55 (freshness skip):
   - Steady state: ~3-5 lojas por cron run precisam sync
   - 3-5 lojas x 3 calls XS x 4s = **36-60s** de report calls
   - Bem dentro do timeout de 240s
   - A consolidacao de 3→1 calls **NAO e necessaria** para throughput

### Fonte de dados final (pos-epic)

| Dado | Fonte | Match Klaviyo UI? |
|------|-------|------------------|
| Revenue por flow | `flow-values-reports` | SIM (100%) |
| Revenue por campaign | `campaign-values-reports` | SIM (100%) |
| Revenue total da loja | `metric-aggregates` (sem `by`) | N/A (calculo proprio) |
| Orders total | `metric-aggregates` (sem `by`) | N/A (calculo proprio) |

## Acceptance Criteria

### AK-3.1 — Remover REPORT_API_DELAY_MS

- [x] Em `klaviyo-sync.service.ts`, remover a constante `REPORT_API_DELAY_MS = 300`
- [x] Remover os 3 `await sleep(REPORT_API_DELAY_MS)` entre report calls (linhas ~508, 540, e apos metric-aggregates)
- [x] Atualizar comentario: o tiered rate limiter (AK-1) agora cuida do spacing entre calls XS
- [x] O rate limiter garante 4s entre calls XS — nenhum delay manual necessario

### AK-3.2 — Cache-first para report-summary.ts (opcional)

- [x] Antes de chamar a Klaviyo API, verificar se `store_revenue_summary` tem dados frescos para o periodo
- [x] Se cache fresco (< freshness threshold): retornar dados do cache sem chamar API
- [x] Se cache stale: chamar API normalmente (pos AK-4, ja serializado)
- [x] Isso elimina chamadas desnecessarias quando o operador abre varias lojas no admin panel

### AK-3.3 — Documentar decisao de fonte de dados

- [ ] Adicionar comentario em `klaviyo-sync.service.ts` explicando:
  - `flow-values-reports` e `campaign-values-reports` sao mantidos porque usam a mesma atribuicao do Klaviyo UI
  - `metric-aggregates` e usado APENAS para receita total e orders (nao para breakdown)
  - NAO substituir por metric-aggregates — causa divergencia de ate 20% para periodos curtos

### AK-3.4 — Testes

- [ ] Verificar que remocao de `REPORT_API_DELAY_MS` nao causa mais null responses (rate limiter cuida)
- [ ] Verificar que cache-first em report-summary retorna dados identicos
- [ ] Verificar que dados de flow/campaign continuam identicos ao Klaviyo UI

## Impacto Esperado

- Economia de ~0.9s por loja/periodo no cron (3 sleeps de 300ms removidos)
- Menos chamadas API no admin panel (cache-first)
- Dados 100% consistentes com dashboard Klaviyo
- Codigo mais limpo (sem delay manual redundante)

## Riscos

- BAIXO: Se AK-1 nao estiver deployada, a remocao do delay pode causar rate limit. Por isso AK-1 e pre-requisito.
- NENHUM risco de divergencia de dados — Reporting API mantida.

## Arquivos Afetados

- `src/lib/services/klaviyo-sync.service.ts` — remover delays + documentar decisao
- `src/lib/integrations/klaviyo/report-summary.ts` — cache-first (opcional)

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade revisada: LOW** (era MEDIUM quando propunha substituir reports por aggregates).
- A remocao dos `sleep(300)` e trivial — 3 linhas deletadas.
- O cache-first em report-summary e opcional mas facil: verificar `store_revenue_summary` antes de chamar API. O padrao ja existe no stale-cache fallback (linhas 166-195 do report-summary.ts).
- **IMPORTANTE**: So deployar APOS AK-1 estar ativa. Sem tiered limiter, a remocao dos delays pode piorar rate limiting.

### @qa — Anotacoes de Qualidade

- **Dados identicos ao Klaviyo**: Este era o BLOCKER principal. Resolvido — Reporting API mantida.
- **Teste de regressao**: Comparar output do cron antes e depois da remocao dos delays. Metricas devem ser identicas.
- **Performance**: Medir tempo total do cron antes/depois. Expectativa: ~1s mais rapido por loja/periodo.

### @data-engineer — Anotacoes de Dados

- **ZERO impacto em schema ou integridade de dados**. Nenhuma migration necessaria.
- A fonte de dados nao muda — flow/campaign metrics continuam vindo da Reporting API, exatamente como hoje.
- A migration de `data_source` column proposta anteriormente **nao e mais necessaria** (nao ha troca de fonte).

### @architect — Anotacoes Arquiteturais

- **Decisao correta**: Consistencia de dados > otimizacao de calls. O throughput e resolvido por AK-1 + AK-6 + Epic 55, sem precisar trocar a fonte de dados.
- **Deploy atomico revisado**: AK-1 + AK-6 continuam como bloco. AK-3 nao e mais co-requisito — pode ir apos AK-1.
- **Cleanup**: Com os delays removidos, o codigo fica mais limpo e o controle de rate limit fica 100% no `rate-limiter.ts` (single responsibility).

### @analyst — Anotacoes de Impacto

- **Risco de divergencia eliminado**: Esta era a principal preocupacao de negocio. Com Reporting API mantida, os dados batem 100% com o Klaviyo.
- **ROI**: Esforco LOW, beneficio de performance (marginal) + limpeza de codigo. O beneficio principal e a DECISAO documentada de nao trocar a fonte — evita que futuro dev quebre a consistencia.
- **Consequencia no README**: O deploy atomico agora e AK-1 + AK-6 (apenas 2, nao 3). AK-3 pode ir depois, independente.