# Architecture: Refund Processing

**Data**: 2026-03-15
**Status**: Proposta (revisada por Architect + QA)
**Autor**: Aria (Architect)
**Revisores**: Aria (Architect), Quinn (QA)

---

## 1. Contexto e Estado Atual

### O que ja existe

| Componente | Estado | Detalhes |
|---|---|---|
| `invoices.status` enum | Suporta `refunded` | Enum: pending, paid, overdue, cancelled, refunded |
| `client_charges.status` CHECK | **NAO suporta** `refunded` | CHECK: pending, paid, overdue, cancelled |
| `unified_invoices` VIEW | Funciona, mas assimetria documentada | UNION ALL de invoices + client_charges |
| `AsaasService.refundPayment()` | Implementado | Suporta full e partial refund |
| `mapAsaasStatusToInternal()` | Mapeamento completo | REFUNDED -> refunded, REFUND_REQUESTED -> pending, REFUND_IN_PROGRESS -> pending |
| Webhook PAYMENT_REFUNDED | Handler ativo | Atualiza `invoices.status` para 'refunded' |
| Webhook handler | **NAO trata refund parcial** | Seta status mas nao registra valor devolvido |
| API endpoint refund | **NAO existe** | Nenhuma rota para trigger manual |
| UI de refund | **NAO existe** | Nem admin nem portal |

### Fluxos de Pagamento Existentes

```
Admin UI (charges-manager.tsx)
    |
    v
POST /api/integrations/asaas/charges   --> Asaas API --> cria payment
    |                                                        |
    v                                                        v
INSERT invoices (status: pending)            Webhook PAYMENT_RECEIVED
                                                   |
                                                   v
                                          UPDATE invoices (status: paid)
```

---

## 2. Data Flow: Cenarios de Refund

### 2.1 Refund Total via Asaas (admin trigger)

```
Admin clica "Reembolsar"
    |
    v
POST /api/integrations/asaas/refund
    |
    |--> Valida: auth, org_id, invoice existe, status = paid
    |--> Busca asaas_id da invoice
    |--> AsaasService.refundPayment(asaas_id)
    |--> INSERT refunds (status: requested, source: asaas)
    |--> INSERT activities (type: refund_initiated)
    |
    v
Retorna 200 {refund_id, status: requested}
    |
    v (assincrono, segundos/minutos depois)
Webhook PAYMENT_REFUNDED chega
    |
    |--> UPDATE invoices.status = 'refunded'
    |--> UPDATE refunds.status = 'processed', processed_at = NOW()
    |--> INSERT activities (type: refund_completed)
```

### 2.2 Refund Parcial via Asaas

```
Admin clica "Reembolso Parcial" -> informa valor
    |
    v
POST /api/integrations/asaas/refund
    body: { invoice_id, amount: 50.00 }
    |
    |--> Valida: amount <= invoice.amount - total_already_refunded
    |--> AsaasService.refundPayment(asaas_id, amount)
    |--> INSERT refunds (amount: 50.00, status: requested, source: asaas)
    |
    v
Webhook PAYMENT_REFUNDED chega
    |
    |--> Checa total refunded (via refund_summaries) vs original amount
    |--> Se total_refunded == amount: invoices.status = 'refunded'
    |--> Se total_refunded < amount: invoices.status permanece 'paid'
    |--> UPDATE refunds.status = 'processed'
```

**Nota**: NAO existe status `partially_refunded` (ver ADR-2). O frontend calcula o estado parcial a partir de `refund_total > 0 AND refund_total < amount` na view `unified_invoices`.

### 2.3 Refund Manual (cobrancas locais)

```
Admin clica "Marcar como Reembolsado" (pix_direto, wise, boleto)
    |
    v
POST /api/financial/refund
    body: { charge_id, amount, reason, source: 'manual' }
    |
    |--> Valida: auth, org_id, charge existe, status = paid
    |--> UPDATE client_charges.status = 'refunded'
    |--> INSERT refunds (status: processed, source: manual)
    |--> INSERT activities (type: refund_manual)
```

---

## 3. Database Changes

### 3.1 Migration: Adicionar `refunded` ao CHECK de client_charges

```sql
ALTER TABLE client_charges
  DROP CONSTRAINT IF EXISTS client_charges_status_check;

ALTER TABLE client_charges
  ADD CONSTRAINT client_charges_status_check
  CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'refunded'));
```

**Impacto**: A VIEW `unified_invoices` nao precisa mudar por causa disso -- ela ja faz `cc.status` como TEXT. Apenas o CHECK bloqueava o valor 'refunded'.

### 3.2 Nova tabela: `refunds`

```sql
CREATE TABLE refunds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Referencia polimorfica: ou invoice ou client_charge
  -- RESTRICT: nao permite deletar invoice/charge com refunds
  invoice_id  UUID REFERENCES invoices(id) ON DELETE RESTRICT,
  charge_id   UUID REFERENCES client_charges(id) ON DELETE RESTRICT,

  -- Denormalizado para RLS (evita JOIN em toda policy check)
  -- RESTRICT: nao permite deletar client com refunds
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  -- Detalhes do refund
  amount      DECIMAL(10,2) NOT NULL,
  reason      TEXT NOT NULL,
  notes       TEXT,

  -- Origem: 'asaas' (via API) ou 'manual' (cobranca local)
  source      TEXT NOT NULL CHECK (source IN ('asaas', 'manual')),

  -- Asaas refund ID (NULL para refunds manuais)
  asaas_refund_id TEXT,

  -- Status: requested -> processed | failed
  status      TEXT NOT NULL DEFAULT 'processed'
              CHECK (status IN ('requested', 'processed', 'failed')),

  -- Quem processou (NULL para webhooks sem trigger admin)
  -- RESTRICT: nao permite deletar user que processou refund
  processed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  processed_at TIMESTAMPTZ,

  -- Exatamente um parent deve ser preenchido
  CONSTRAINT refunds_exactly_one_parent CHECK (
    (invoice_id IS NOT NULL AND charge_id IS NULL) OR
    (invoice_id IS NULL AND charge_id IS NOT NULL)
  ),

  CONSTRAINT refunds_amount_positive CHECK (amount > 0)
);
```

**Protecoes DB-level**:
- Trigger `check_refund_total_limit()`: impede que soma dos refunds exceda valor original (usa `SELECT FOR UPDATE` no parent para serializar)
- Trigger `check_refund_client_consistency()`: valida que `client_id` corresponde ao parent
- `ON DELETE RESTRICT` em todas as FKs financeiras (audit trail nao pode ser apagado)

### 3.3 Views auxiliares

**`refund_summaries`** (agregacao por charge/invoice):
- `refund_count`, `total_refunded`, `total_pending`, `last_refund_at`
- Usa `security_invoker = true` para respeitar RLS

**`unified_invoices`** (atualizada com colunas de refund):
- `refund_total` = soma de refunds processados (0 se nenhum)
- `net_amount` = `amount - refund_total`
- Calculados dinamicamente via LEFT JOIN em `refund_summaries` (sem colunas denormalizadas)
- Usa `security_invoker = true` para respeitar RLS

### 3.4 RLS Policies

| Policy | Tabela | Tipo | Quem | Condicao |
|---|---|---|---|---|
| Access refunds by client | refunds | SELECT | authenticated | `can_access_client(client_id) AND has_feature('view_financial')` |
| Admin can manage refunds | refunds | ALL | authenticated | Org-scoped: `org_members.role IN ('owner', 'manager')` + `is_active = true` via join em `clients` |
| Portal users can view own refunds | refunds | SELECT | authenticated | `has_feature('view_financial') AND client_id IN (client_portal_users)` |

**IMPORTANTE**: A policy de admin usa join org-scoped (NAO usa `is_admin()` global) para garantir isolamento multi-tenant.

---

## 4. API Design

### 4.1 POST /api/integrations/asaas/refund

**Proposito**: Refund de pagamento Asaas (full ou partial).

```typescript
// Request
POST /api/integrations/asaas/refund
{
  invoice_id: string       // UUID da invoice local
  amount?: number          // Se omitido = full refund
  reason: string           // Obrigatorio
}

// Response 200
{
  refund_id: string        // UUID do refunds record
  status: "requested"      // Aguarda webhook do Asaas
  original_amount: number
  refund_amount: number
}

// Errors
// 400 - Invoice nao encontrada, status != paid, valor invalido, sem asaas_id
// 403 - Sem permissao (org_id mismatch)
// 409 - Ja reembolsada totalmente
// 502 - Asaas API falhou
```

### 4.2 POST /api/financial/refund

**Proposito**: Refund manual de cobrancas locais (sem gateway).

```typescript
// Request
POST /api/financial/refund
{
  charge_id: string        // UUID da client_charge
  amount?: number          // Se omitido = full refund
  reason: string           // Obrigatorio
}

// Response 200
{
  refund_id: string
  status: "processed"      // Manual = imediato
  original_amount: number
  refund_amount: number
}
```

### 4.3 GET /api/financial/refunds

**Proposito**: Listar historico de refunds (admin).

```typescript
// Request
GET /api/financial/refunds?client_id=xxx&status=processed&page=1&limit=20

// Response 200
{
  refunds: Refund[]
  total: number
  page: number
}
```

**Nota**: Portal acessa refund info via `unified_invoices` (refund_total + net_amount). Nao precisa de endpoint separado.

---

## 5. Service Layer

### 5.1 Novo: `src/lib/services/refund.service.ts`

Responsabilidades:
- Validar pre-condicoes (status, amounts, org scope)
- Orquestrar chamada Asaas + insert refunds + update invoice
- Processar webhook de refund completado
- Serializar operacoes concorrentes (a nivel de service, complementando o trigger DB)

```typescript
interface RefundService {
  // Admin trigger: refund via Asaas
  initiateAsaasRefund(params: {
    invoiceId: string
    orgId: string
    userId: string
    amount?: number  // undefined = full
    reason: string
  }): Promise<{ refundId: string; status: string }>

  // Admin trigger: manual refund (local charges)
  processManualRefund(params: {
    chargeId: string
    orgId: string
    userId: string
    amount?: number
    reason: string
  }): Promise<{ refundId: string; status: string }>

  // Webhook callback: Asaas confirma refund
  handleAsaasRefundWebhook(params: {
    asaasPaymentId: string
    refundedValue: number
  }): Promise<void>

  // Query: refunds por org
  listRefunds(params: {
    orgId: string
    clientId?: string
    status?: string
    page?: number
    limit?: number
  }): Promise<{ refunds: Refund[]; total: number }>
}
```

### 5.2 Alteracoes no Webhook Handler

O webhook handler atual (`src/app/api/integrations/asaas/webhook/route.ts`) precisa de ajustes no case `PAYMENT_REFUNDED`:

```typescript
case "PAYMENT_REFUNDED":
  await handlePaymentEvent(payload)      // ja existe - atualiza invoice.status
  await handleRefundCompletion(payload)   // NOVO - atualiza refunds + checa total
  break
```

A funcao `handleRefundCompletion`:
1. Busca `refunds` com `invoice_id` da invoice encontrada e `status = 'requested'`
2. Atualiza para `status = 'processed'`, seta `processed_at`
3. Checa `refund_summaries.total_refunded` vs `invoices.amount` para determinar se totalmente refundado
4. Se refund veio do Asaas diretamente (sem trigger do admin), cria record retroativamente com `source = 'asaas'` e `processed_by = null`
5. Idempotencia via `asaas_refund_id` UNIQUE index (INSERT ... ON CONFLICT DO NOTHING)

---

## 6. UI Components

### 6.1 Admin: Botao de Refund no ChargesManager

**Localizacao**: `src/components/financial/charges-manager.tsx`

No DropdownMenu de acoes de cada cobranca, adicionar:

```
[Acoes v]
  - Ver Detalhes
  - Cancelar Cobranca     (ja existe)
  - Reembolsar             (NOVO - so aparece se status = paid)
  - Reembolso Parcial      (NOVO - so aparece se status = paid)
```

### 6.2 Admin: Dialog de Refund

**Novo componente**: `src/components/financial/refund-dialog.tsx`

```
+----------------------------------------------+
|  Reembolsar Cobranca                         |
|                                              |
|  Cliente: Loja XYZ                           |
|  Valor Original: R$ 500,00                   |
|  Ja Reembolsado: R$ 0,00                     |
|                                              |
|  Tipo:                                       |
|  (*) Reembolso Total                         |
|  ( ) Reembolso Parcial                       |
|                                              |
|  [Valor: R$ ___________]  (se parcial)       |
|                                              |
|  Motivo: *                                   |
|  [________________________]                  |
|  [________________________]                  |
|                                              |
|  [!] Esta acao nao pode ser desfeita.        |
|  O valor sera devolvido ao cliente via Asaas.|
|                                              |
|         [Cancelar]  [Confirmar Reembolso]    |
+----------------------------------------------+
```

### 6.3 Portal: Status "Reembolsada" na Lista de Faturas

**Arquivo**: `src/app/client/invoices/page.tsx`

1. Adicionar config no `STATUS_CONFIG`:
```typescript
refunded: {
  label: "Reembolsada",
  color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
  dotColor: "bg-violet-500",
  icon: RotateCcw,
}
```

2. Na card da fatura reembolsada:
   - Badge "Reembolsada"
   - Se parcial (refund_total > 0 AND refund_total < amount): "Reembolsado: R$ 50,00 de R$ 500,00"
   - Sem botoes de pagamento (PIX, boleto)

### 6.4 Admin: Metricas de Refund no Dashboard Financeiro

No `BillingMetrics` (`src/components/dashboard/billing-metrics.tsx`), adicionar card:

```
[Reembolsos (30d)]
R$ 1.250,00
3 reembolsos
```

---

## 7. Security

### 7.1 Autorizacao

| Operacao | Quem | Como |
|---|---|---|
| Trigger refund (Asaas) | Admin/Owner da org com `view_financial` | `requireAuth()` + `resolveOrgId()` + feature gate |
| Trigger refund (manual) | Admin/Owner da org com `view_financial` | Idem |
| Ver refund status | Admin/Owner da org | Via `refunds` com RLS org-scoped |
| Ver refund status | Portal user | Via `unified_invoices` (refund_total + net_amount) |
| Listar historico refunds | Admin/Owner da org | GET /api/financial/refunds com org scope |

### 7.2 Validacoes Criticas

1. **Double-refund prevention**: Trigger DB `check_refund_total_limit()` com `SELECT FOR UPDATE` no parent
2. **Status gate**: So permitir refund se status = 'paid'
3. **Org isolation**: RLS usa join org-scoped (NAO `is_admin()` global)
4. **Reason obrigatorio**: Audit trail exige motivo
5. **Amount bounds**: `amount > 0 AND amount <= (original - already_refunded)` (trigger + app layer)
6. **Client consistency**: Trigger valida `client_id` denormalizado

### 7.3 Rate Limiting

Refund e operacao sensivel. Aplicar rate limit mais restrito:

```typescript
const REFUND_RATE_LIMIT = { windowMs: 60_000, max: 5 }  // 5 refunds/minuto por org
```

### 7.4 Audit Trail

Toda operacao de refund gera:
1. **Record em `refunds`**: amount, reason, source, processed_by, processed_at
2. **Entry em `activities`**: refund_initiated, refund_completed, refund_failed
   - Metadata: `{ refund_id, amount, reason, processed_by }`

---

## 8. Edge Cases

### 8.1 Refund de invoice sem asaas_id

Bloquear `POST /api/integrations/asaas/refund` - retornar 400 "Esta fatura nao possui cobranca Asaas vinculada. Use reembolso manual."

### 8.2 Refund de charge vinculada a subscription

A subscription (`client_subscriptions`) continua ativa. O refund afeta apenas a cobranca individual. NAO cancelar a subscription automaticamente.

Aviso no dialog: "Esta cobranca pertence a assinatura [nome]. O reembolso nao cancela a assinatura."

### 8.3 Invoice ja refunded (double-click)

Retornar HTTP 409:
```json
{ "error": "Esta fatura ja foi totalmente reembolsada" }
```

### 8.4 Partial refund + subsequent full refund

Se invoice de R$ 500 teve refund parcial de R$ 200:
- `refund_summaries.total_refunded = 200`
- Status permanece `paid` (NAO existe status `partially_refunded`)
- Proximo refund pode ser de ate R$ 300 (trigger DB valida)
- Quando `total_refunded == amount`, status muda para `refunded`

### 8.5 Webhook chega antes do response da API

Mitigacao:
- `handleRefundCompletion` usa `INSERT ... ON CONFLICT (asaas_refund_id) DO NOTHING` para idempotencia
- Se nao encontra `refunds` com status `requested`, cria record diretamente com `status = 'processed'`
- Trigger `check_refund_total_limit()` com `SELECT FOR UPDATE` serializa operacoes concorrentes

### 8.6 Asaas retorna erro no refund

Cenarios comuns:
- Payment ja refunded no lado Asaas
- Saldo insuficiente na conta Asaas
- Payment em status que nao permite refund

Tratamento: catch no service, insert `refunds` com `status = 'failed'`, retornar erro claro ao admin.

### 8.7 Refund de cobranca Wise

Wise nao tem API de refund integrada. O admin marca manualmente como reembolsado via `POST /api/financial/refund`. O reembolso real acontece fora do sistema (transferencia manual no Wise).

### 8.8 Deletar invoice/charge/client com refunds

`ON DELETE RESTRICT` impede delecao. A aplicacao deve informar o admin que nao e possivel deletar registros com historico de refund. Soft-delete pode ser considerado no futuro.

---

## 9. Decisoes Arquiteturais (ADR)

### ADR-1: Tabela separada `refunds` vs colunas na invoice

**Decisao**: Tabela separada.

**Motivo**: Uma invoice pode ter multiplos refunds parciais. Colunas nao modelam historico. Tabela separada permite audit trail completo, tracking por quem processou, e query de metricas independente.

### ADR-2: Nao criar status `partially_refunded`

**Decisao**: Manter os status atuais. Usar `refund_total > 0 AND status != 'refunded'` como indicador de refund parcial.

**Motivo**: Alterar enum em invoices e CHECK em client_charges novamente traz risco de migration. O frontend pode derivar o estado a partir de `refund_total` vs `amount` (disponivel na `unified_invoices`). Menos mudancas = menos risco.

### ADR-3: Dois endpoints separados (Asaas vs manual) em vez de um generico

**Decisao**: Dois endpoints separados.

**Motivo**: O fluxo Asaas e assincrono (chama API, espera webhook), o manual e sincrono (marca imediatamente). Unificar criaria complexidade desnecessaria com branching interno. Endpoints separados sao mais claros e testaveis.

### ADR-4: Portal nao dispara refunds

**Decisao**: Portal e read-only para refunds.

**Motivo**: Refund envolve movimentacao financeira. Apenas admin deve ter essa capacidade. Se no futuro precisar de "solicitar refund" pelo portal, criar fluxo de request -> approval separado.

### ADR-5: ON DELETE RESTRICT em dados financeiros

**Decisao**: Todas as FKs na tabela `refunds` usam `ON DELETE RESTRICT`.

**Motivo**: Dados financeiros com implicacoes de compliance e audit trail nao devem ser deletados silenciosamente. `CASCADE` apagaria registros de refund sem aviso. `RESTRICT` forca a aplicacao a lidar com os refunds antes de qualquer delecao.

### ADR-6: Calculo dinamico de totais (sem colunas denormalizadas)

**Decisao**: `refund_total` e `net_amount` sao calculados dinamicamente via `refund_summaries` VIEW, expostos na `unified_invoices`. NAO adicionar colunas `refunded_amount` nas tabelas `invoices` ou `client_charges`.

**Motivo**: Coluna denormalizada cria risco de dessincronizacao com a tabela `refunds`. View garante single source of truth. Se performance for um problema (medir com EXPLAIN ANALYZE), considerar materializar no futuro.

### ADR-7: RLS org-scoped (sem is_admin() global)

**Decisao**: Policies de refund usam join em `clients -> org_members` para validar org membership, NAO usam `is_admin()` global.

**Motivo**: `is_admin()` verifica `profiles.role = 'admin'` sem scoping por org, permitindo que admin de Org A acesse dados de Org B. Issue previamente identificado em auditorias de seguranca. A policy org-scoped garante isolamento multi-tenant.

---

## 10. Epic/Story Breakdown

### Epic 50: Refund Processing

| Story | Titulo | Esforco | Dependencia |
|---|---|---|---|
| **50.1** | DB migration: add refunded to client_charges + create refunds table + triggers + update VIEWs | LOW | -- |
| **50.2** | RefundService: core logic (initiate, manual, webhook handler) | MED | 50.1 |
| **50.3** | API endpoint: POST /api/integrations/asaas/refund | LOW | 50.2 |
| **50.4** | API endpoint: POST /api/financial/refund (manual) | LOW | 50.2 |
| **50.5** | API endpoint: GET /api/financial/refunds (list) | LOW | 50.1 |
| **50.6** | Webhook: update handler para refund completion | LOW | 50.2 |
| **50.7** | UI Admin: RefundDialog + integracao no ChargesManager | MED | 50.3, 50.4 |
| **50.8** | UI Portal: status refunded + display refund_total/net_amount | LOW | 50.1 |
| **50.9** | Dashboard: refund metrics card | LOW | 50.5 |

### Ordem de implementacao recomendada

```
Fase 1 (fundacao):  50.1 -> 50.2 -> 50.6
Fase 2 (API):       50.3, 50.4, 50.5 (paralelo)
Fase 3 (UI):        50.7, 50.8, 50.9 (paralelo)
```

### Criterios de aceitacao transversais

- [ ] Refund total Asaas funciona end-to-end (trigger -> webhook -> status atualizado)
- [ ] Refund parcial registra valor e permite refunds subsequentes
- [ ] Trigger DB impede refund_total > original_amount (com concorrencia)
- [ ] Refund manual (local charges) marca status imediatamente
- [ ] Portal exibe status "Reembolsada" com refund_total/net_amount
- [ ] Historico de refunds acessivel no admin
- [ ] Activity log registra todas operacoes de refund
- [ ] Double-refund prevention funciona (trigger + app layer)
- [ ] RLS org-scoped impede cross-org access a refunds
- [ ] ON DELETE RESTRICT impede delecao de registros com refunds
- [ ] Webhook idempotente via asaas_refund_id UNIQUE index

---

## 11. Arquivos Impactados

### Novos
- `supabase/migrations/20260315_add_refund_support.sql`
- `src/lib/services/refund.service.ts`
- `src/app/api/integrations/asaas/refund/route.ts`
- `src/app/api/financial/refund/route.ts`
- `src/app/api/financial/refunds/route.ts`
- `src/components/financial/refund-dialog.tsx`

### Alterados
- `src/app/api/integrations/asaas/webhook/route.ts` (add handleRefundCompletion)
- `src/components/financial/charges-manager.tsx` (add refund action)
- `src/app/client/invoices/page.tsx` (add refunded status config + display)
- `src/app/api/portal/invoices/route.ts` (add refunded stats + refund_total)
- `src/components/dashboard/billing-metrics.tsx` (add refund metrics card)

### Nao alterados (confirmacao)
- `src/lib/integrations/asaas.ts` - `refundPayment()` ja existe, nenhuma mudanca necessaria
- `src/lib/integrations/types.ts` - AsaasPaymentStatus ja inclui REFUNDED
- `src/app/api/portal/invoices/status/route.ts` - Nao precisa mostrar refunds no banner

---

## 12. Performance Considerations

A `unified_invoices` VIEW agora faz LEFT JOIN na `refund_summaries` (que faz GROUP BY na tabela `refunds`). Para orgs com muitas cobrancas, isso pode impactar performance.

**Recomendacoes**:
1. Medir com `EXPLAIN ANALYZE` no endpoint `GET /api/portal/invoices` apos deploy
2. Se degradar, considerar materializar `refund_total` como coluna (reverter ADR-6)
3. Os indexes parciais em `refunds` (invoice_id, charge_id) minimizam o custo do JOIN

---

*-- Aria + Quinn, arquitetura revisada*
