---
Prioridade: Critical
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Done
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "1 - Critical Fixes"
Dependencias: "Nenhuma"
---

# Story AK-4 — Serializar Promise.all no report-summary.ts

## Story

**Como** operador do sistema,
**Quero** que as chamadas de reporting no `report-summary.ts` sejam serializadas em vez de paralelas,
**Para que** nao violemos o burst limit de 1 req/s da Reporting API e reduzamos os null responses.

## Contexto

### Problema

`report-summary.ts:102` dispara 2 report calls simultaneamente via `Promise.all`:

```typescript
const [campaignReport, flowReport] = await Promise.all([
  klaviyoRequest(apiKey, "/campaign-values-reports/", ...),
  klaviyoRequest(apiKey, "/flow-values-reports/", ...),
])
```

A Reporting API (tier XS) tem burst limit de **1 req/s**. O `Promise.all` envia ambos no mesmo instante, violando o burst limit. O rate limiter global serializa por fila, mas ambos entram na mesma fila com 1200ms de intervalo — o segundo request pode ser enviado antes do rate limiter ter chance de atrasar.

**NOTA**: O cron sync (`klaviyo-sync.service.ts:472`) ja foi corrigido para serializar. Esta story corrige o `report-summary.ts` que e usado pelo stores control panel (endpoint admin, nao cron).

### Evidencia

Null responses frequentes no log: `"both Klaviyo report requests returned null"` (report-summary.ts:126).

## Acceptance Criteria

### AK-4.1 — Serializar chamadas de report

- [x] Substituir `Promise.all` por chamadas sequenciais:
  ```typescript
  const campaignReport = await klaviyoRequest(apiKey, "/campaign-values-reports/", ...)
  const flowReport = await klaviyoRequest(apiKey, "/flow-values-reports/", ...)
  ```
- [x] Nao adicionar delay manual — o rate limiter (pos AK-1) cuida do intervalo
- [x] Manter toda a logica de null handling e fallback inalterada

### AK-4.2 — Teste

- [x] Verificar que ambos reports sao chamados sequencialmente (mock que confirma ordem)
- [x] Verificar que se o primeiro falha (null), o segundo ainda e tentado
- [x] Verificar que o retorno `KlaviyoRevenueSummary` e identico ao comportamento anterior

## Impacto Esperado

- Elimina violacao de burst para chamadas do admin panel
- Fix trivial (< 5 linhas de mudanca)
- Reducao imediata de null responses no stores control panel

## Arquivos Afetados

- `src/lib/integrations/klaviyo/report-summary.ts` — linha 102 (Promise.all → sequencial)

---

## Revisao Multi-Agente

### @dev — Anotacoes de Implementacao

- **Complexidade: TRIVIAL**. Literalmente trocar `Promise.all([a, b])` por `const a = await ...; const b = await ...;`.
- Nenhuma mudanca de interface, nenhuma mudanca de tipo, nenhum novo arquivo.
- **Pode ser feita AGORA** sem esperar AK-1 — e a story mais facil e de menor risco do epic.
- O unico cuidado: manter o `if (!campaignReport && !flowReport)` check identico.

### @qa — Anotacoes de Qualidade

- **Teste rapido**: Mock de `klaviyoRequest` que registra timestamps de chamada. Verificar que a segunda chamada ocorre APOS a primeira resolver.
- **Regressao zero**: A interface `KlaviyoRevenueSummary` nao muda. Nenhum caller precisa de ajuste.
- **Performance**: Latencia total sobe de max(report1, report2) para report1 + report2. Para o admin panel (nao cron), isso e aceitavel (de ~4s para ~8s).

### @data-engineer — Anotacoes de Dados

- **Sem impacto em dados**. Nenhuma mudanca em schema, persistencia, ou calculo de revenue.
- A unica mudanca observavel e que o log de timing vai mostrar chamadas sequenciais em vez de paralelas.

### @architect — Anotacoes Arquiteturais

- **Aprovado sem ressalvas**. Serializacao e o padrao correto para endpoints tier XS.
- **Futuro**: Quando AK-3 for implementada, este `Promise.all` desaparece inteiramente (substituido por 1 call metric-aggregates). Entao esta e uma fix intermediaria.
- **Nao over-engineer**: NAO adicionar retry logic ou delay manual aqui. O rate limiter global (AK-1) cuidara disso.

### @analyst — Anotacoes de Impacto

- **Quick win maximo**: Menor esforco, impacto imediato. Deploy first.
- **Metricas**: Monitorar null response rate no report-summary apos deploy. Expectativa: cair de ~20% para <5%.
- **UX**: O stores control panel ficara ~4s mais lento por loja selecionada. Aceitavel — melhor lento que com dados vazios.