# Epic 50 — Refund Processing

## Resumo

Sistema completo de reembolso (full e parcial) para cobranças Asaas e cobranças locais (pix_direto, wise, boleto, cartao). Inclui tabela `refunds` com audit trail, triggers DB para prevenir double-refund, endpoints de API para trigger via Asaas e manual, handler de webhook para confirmacao assincrona, UI admin com dialog de reembolso, exibicao no portal do cliente, e card de metricas no dashboard.

## Documentacao de Referencia

- **Arquitetura**: `docs/architecture/refund-processing-architecture.md`
- **Migration**: `supabase/migrations/20260315_add_refund_support.sql`

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia | Fase |
|-------|--------|------------|---------|-------------|------|
| 50.1 | DB migration: add refunded to client_charges + create refunds table + triggers + update VIEWs | Alta | Baixo | - | 1 |
| 50.2 | RefundService: core logic (initiate, manual, webhook handler) | Alta | Medio | 50.1 | 1 |
| 50.3 | API endpoint: POST /api/integrations/asaas/refund | Alta | Baixo | 50.2 | 2 |
| 50.4 | API endpoint: POST /api/financial/refund (manual) | Alta | Baixo | 50.2 | 2 |
| 50.5 | API endpoint: GET /api/financial/refunds (list) | Media | Baixo | 50.1, 50.2 | 2 |
| 50.6 | Webhook: update handler para refund completion | Alta | Baixo | 50.2 | 1 |
| 50.7 | UI Admin: RefundDialog + integracao no ChargesManager | Media | Medio | 50.3, 50.4 | 3 |
| 50.8 | UI Portal: status refunded + display refund_total/net_amount | Media | Baixo | 50.1 | 3 |
| 50.9 | Dashboard: refund metrics card | Baixa | Baixo | 50.5 | 3 |

## Fases de Implementacao

```
Fase 1 (fundacao):  50.1 -> 50.2 -> 50.6
Fase 2 (APIs):      50.3, 50.4, 50.5 (paralelo — todas dependem de 50.2 ou 50.1)
Fase 3 (UI):        50.7, 50.8, 50.9 (paralelo)
```

## Dependencias (grafo)

```
50.1 ──┬──> 50.2 ──┬──> 50.3 ──┐
       │           ├──> 50.4 ──┤──> 50.7
       │           ├──> 50.5 ──┼──> 50.9
       │           └──> 50.6   │
       └──> 50.8               │
```

## ADRs Relevantes (ver arquitetura completa)

1. **ADR-1**: Tabela separada `refunds` (nao colunas na invoice) — suporta multiplos refunds parciais
2. **ADR-2**: Sem status `partially_refunded` — frontend deriva de `refund_total` vs `amount`
3. **ADR-3**: Dois endpoints separados (Asaas async vs manual sync) — complexidades distintas
4. **ADR-4**: Portal read-only para refunds — admin-only trigger
5. **ADR-5**: ON DELETE RESTRICT em dados financeiros — audit trail inviolavel
6. **ADR-6**: Calculo dinamico via VIEW (sem colunas denormalizadas) — single source of truth
7. **ADR-7**: RLS org-scoped (sem is_admin() global) — isolamento multi-tenant

## Arquivos Impactados (overview)

### Novos
- `supabase/migrations/20260315_add_refund_support.sql` (ja existe)
- `src/lib/services/refund.service.ts`
- `src/app/api/integrations/asaas/refund/route.ts`
- `src/app/api/financial/refund/route.ts`
- `src/app/api/financial/refunds/route.ts`
- `src/components/financial/refund-dialog.tsx`

### Alterados
- `src/app/api/integrations/asaas/webhook/route.ts`
- `src/components/financial/charges-manager.tsx`
- `src/app/client/invoices/page.tsx`
- `src/app/api/portal/invoices/route.ts`
- `src/components/dashboard/billing-metrics.tsx`

## Criterios de Aceitacao Transversais

- [ ] Refund total Asaas funciona end-to-end (trigger -> webhook -> status atualizado)
- [ ] Refund parcial registra valor e permite refunds subsequentes
- [ ] Trigger DB impede refund_total > original_amount (com concorrencia)
- [ ] Refund manual (local charges) marca status imediatamente
- [ ] Portal exibe status "Reembolsada" com refund_total/net_amount
- [ ] Historico de refunds acessivel no admin
- [ ] Double-refund prevention funciona (trigger + app layer)
- [ ] RLS org-scoped impede cross-org access a refunds
- [ ] ON DELETE RESTRICT impede delecao de registros com refunds
- [ ] Activity log registra todas operacoes de refund (refund_initiated, refund_manual, refund_completed, refund_failed)
- [ ] Webhook idempotente via asaas_refund_id UNIQUE index

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-15 | @sm | Epic criado com 9 stories baseado na arquitetura revisada por Aria + Quinn |
