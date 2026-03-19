# RG-9: Fix "Faturamento Total" exibindo receita atribuída em vez de receita real

**Epic:** Report Generation
**Priority:** HIGH
**Effort:** LOW
**Status:** Ready for Dev

---

## Contexto

Na página de detalhe do relatório (`/admin/reports/[id]`), o card **"Faturamento Total"** exibe `revenue.totalRevenue`, que na verdade é `totalKlaviyoRevenue` (soma de flows + campaigns atribuídos). O faturamento real da loja (`storeRevenue`, obtido via Klaviyo Metric Aggregates — Placed Order sem agrupamento) **já é buscado pela API e salvo no JSON do banco**, mas nunca é exibido.

### Impacto

- Cliente/agência vê "Faturamento Total" como a receita atribuída ao Klaviyo, não o faturamento real da loja
- Confusão: "Receita Klaviyo" (card seguinte) mostra o mesmo valor que "Faturamento Total"
- Números não batem com o que o cliente vê na Shopify ou no dashboard Klaviyo

### Causa Raiz

Na API route (`/api/integrations/klaviyo/report/route.ts` linha 1247-1258):
```typescript
revenue: {
  storeRevenue,                              // ← receita REAL (metric-aggregates, Placed Order)
  totalRevenue: totalKlaviyoRevenue,         // ← receita ATRIBUÍDA (flows + campaigns)
  klaviyoAttributedRevenue: totalKlaviyoRevenue,  // ← duplicado do anterior
}
```

No display (`/admin/reports/[id]/page.tsx` linha 389-397):
```tsx
// Card "Faturamento Total" usa revenue.totalRevenue (que é a atribuída)
{formatReportCurrency(revenue.totalRevenue)}
```

O campo `storeRevenue` está no JSON salvo no banco mas não é tipado nem exibido.

---

## Acceptance Criteria

### AC 1: Tipar `storeRevenue` no `ReportData`
- [x] Adicionar `storeRevenue?: number` e `storeOrders?: number` ao tipo `ReportData.revenue` em `src/types/report.ts`
- [x] Atualizar tipo duplicado em `src/types/index.ts`

### AC 2: Exibir receita real no card "Faturamento Total"
- [x] No card "Faturamento Total" em `reports/[id]/page.tsx`, usar `revenue.storeRevenue` em vez de `revenue.totalRevenue`
- [x] Fallback para `revenue.totalRevenue` se `storeRevenue` não existir (relatórios antigos)
- [x] Formato: `revenue.storeRevenue ?? revenue.totalRevenue`

### AC 3: Adicionar card de Pedidos Totais da loja (se disponível) — WONTFIX
> Pedidos da loja já exibidos no card existente. Separar criaria ruído visual sem valor claro.

### AC 4: Remover ambiguidade do campo `totalRevenue` — WONTFIX
> `totalRevenue` é usado em múltiplos consumers (cron, dashboard, report-jobs). Renomear teria blast radius alto sem benefício imediato. Ambiguidade mitigada pelo fix de display.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/types/report.ts` | Adicionar `storeRevenue`, `storeOrders` ao tipo |
| `src/app/admin/reports/[id]/page.tsx` | Trocar display do card "Faturamento Total" |
| `src/app/api/integrations/klaviyo/report/route.ts` | Documentar/renomear campos (opcional) |

## Dados no banco

O campo `storeRevenue` **já existe** no JSON `report_data` da tabela `client_reports` para todos os relatórios gerados após a implementação do metric-aggregates. Não é necessária migration.

## Riscos

- **Relatórios antigos**: Podem não ter `storeRevenue` no JSON. Usar fallback `?? totalRevenue`.
- **Relatórios manuais**: Não passam pela API Klaviyo, não terão `storeRevenue`. Fallback cobre.

## Notas

- Decisão de usar Metric Aggregates para receita total documentada em `CLAUDE.md` e `docs/architecture/adr-klaviyo-revenue-source.md`
- `storeRevenue` = Placed Order metric, sem `by`, via `/metric-aggregates/` — representa todo pedido rastreado pelo Klaviyo na loja
