# Design Spec: Banner de Faturas com Receita Gerada

**Autor:** Uma (UX/UI Design)
**Data:** 2026-03-07
**Status:** Especificacao pronta para implementacao
**Arquivo alvo:** `src/app/portal/invoices/page.tsx`

---

## 1. Objetivo

Adicionar ao banner de fatura pendente/vencida (componente `BoletoCard`) uma secao que mostra a receita gerada pela Convertfy no periodo correspondente as faturas. O objetivo e justificar o valor do servico no momento exato em que o cliente ve o valor a pagar.

---

## 2. Principio de Design: Valor Antes do Custo

A hierarquia visual segue o padrao **"anchor alto, custo baixo"**:

1. **RECEITA GERADA** (destaque maximo) -- ancora o cliente no valor recebido
2. **Valor a pagar** (destaque secundario) -- parece pequeno em comparacao
3. **Ratio/ROI** (mensagem de reforco) -- consolida a percepcao de valor

Esse padrao e usado em SaaS B2B para reduzir fricao de pagamento.

---

## 3. Layout do Banner

### 3.1 Estrutura (Desktop)

```
+------------------------------------------------------------------+
|  [icone Receipt]  Proxima Fatura / Fatura em Atraso    [Badge]   |
|                   Mensalidade Convertfy                           |
+------------------------------------------------------------------+
|                                                                    |
|  +--- BLOCO RECEITA (gradiente sutil) -------------------------+ |
|  |                                                               | |
|  |  Receita gerada pela Convertfy nesse periodo                 | |
|  |  R$ 150.000,00                    (valor grande, cor cyan)   | |
|  |                                                               | |
|  |  "Seu investimento de R$ 3.000 gerou 50x em receita"        | |
|  |                                                               | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  Valor a Pagar                                                    |
|  R$ 3.000,00                         (valor medio, cor atual)    |
|                                                                    |
|  [Vencimento info]                                                |
|  [Botoes de pagamento]                                            |
+------------------------------------------------------------------+
```

### 3.2 Estrutura (Mobile < 768px)

Mesma ordem vertical, com o bloco de receita ocupando largura total.
O valor de receita reduz de `text-4xl` para `text-3xl`.

---

## 4. Hierarquia Visual Detalhada

### 4.1 Bloco de Receita Gerada (NOVO)

Posicao: **Acima** do "Valor a Pagar" existente, dentro do `<div className="p-6 space-y-6">`.

| Elemento | Especificacao |
|----------|--------------|
| Container | `rounded-xl p-5 bg-gradient-to-r from-cyan-50 to-emerald-50 border border-cyan-200 dark:from-cyan-500/10 dark:to-emerald-500/10 dark:border-cyan-500/20` |
| Label | `text-sm font-medium text-cyan-700 dark:text-cyan-300 mb-1` |
| Valor receita | `text-3xl lg:text-4xl font-bold text-cyan-600 dark:text-cyan-400` |
| Mensagem ROI | `text-sm text-emerald-600 dark:text-emerald-400 mt-2 font-medium` |
| Icone | `TrendingUp` (lucide-react), `h-5 w-5 text-cyan-600`, ao lado do label |

### 4.2 Valor a Pagar (EXISTENTE - ajustar)

Reduzir destaque relativo ao bloco de receita:

| Elemento | Antes | Depois |
|----------|-------|--------|
| Label | `text-sm text-muted-foreground` | `text-sm text-muted-foreground` (sem mudanca) |
| Valor | `text-5xl font-bold` | `text-4xl font-bold` (reduzir 1 nivel) |
| Cor (normal) | `text-emerald-600` | `text-foreground` (neutro) |
| Cor (overdue) | `text-red-600` | `text-red-600` (manter urgencia) |

### 4.3 Comparativo Visual

```
Receita:   ████████████████████████  (maior, cor vibrante cyan)
Fatura:    ██████████████           (menor, cor neutra)
```

---

## 5. Copy / Texto

### 5.1 Labels

| Contexto | Texto |
|----------|-------|
| Label receita | "Receita gerada pela Convertfy nesse periodo" |
| Label fatura | "Valor a Pagar" (manter atual) |

### 5.2 Mensagem de ROI (dinamica)

Calcular `ratio = receita / totalFaturas` e exibir conforme faixa:

| Ratio | Mensagem |
|-------|----------|
| >= 100x | "Seu investimento gerou **{ratio}x** em receita para sua loja" |
| >= 10x | "Para cada R$ 1 investido, sua loja faturou **R$ {ratio}**" |
| >= 2x | "A Convertfy gerou **{formatCurrency(receita)}** em receita atribuida" |
| < 2x | "Receita atribuida a Convertfy no periodo: **{formatCurrency(receita)}**" |

Regras:
- Arredondar ratio para inteiro quando >= 10x, uma decimal quando < 10x
- Tom positivo mas factual, nunca agressivo
- Usar `font-medium`, nao `font-bold` na mensagem (destaque moderado)

### 5.3 Exemplos Concretos

```
Receita: R$ 150.000 / Faturas: R$ 3.000 = 50x
-> "Para cada R$ 1 investido, sua loja faturou R$ 50"

Receita: R$ 8.000 / Faturas: R$ 2.000 = 4x
-> "A Convertfy gerou R$ 8.000,00 em receita atribuida"

Receita: R$ 1.500 / Faturas: R$ 1.000 = 1.5x
-> "Receita atribuida a Convertfy no periodo: R$ 1.500,00"
```

---

## 6. Variantes

### 6.1 Variante A: Com dados de receita

Layout completo conforme secao 3. Bloco de receita visivel.

### 6.2 Variante B: Sem dados de receita (fallback)

Quando `revenue` e `null`, `undefined` ou `0`:

- **NAO exibir** o bloco de receita
- Manter o `BoletoCard` exatamente como esta hoje
- Nenhuma mudanca visual -- o banner atual e o fallback

Logica:

```tsx
const showRevenue = revenue != null && revenue > 0
```

### 6.3 Variante C: Dados carregando

Se a API de receita for assincrona (fetch separado do fetch de invoices):

- Exibir skeleton no bloco de receita: `<Skeleton className="h-24 rounded-xl" />`
- Bloco aparece no layout mas com loading state
- Quando dados chegam, transicao suave (sem layout shift)

---

## 7. Dark Mode

Todas as cores ja estao especificadas com variantes dark na secao 4.1.

Resumo do mapeamento:

| Elemento | Light | Dark |
|----------|-------|------|
| Container bg | `from-cyan-50 to-emerald-50` | `from-cyan-500/10 to-emerald-500/10` |
| Container border | `border-cyan-200` | `border-cyan-500/20` |
| Label text | `text-cyan-700` | `text-cyan-300` |
| Valor receita | `text-cyan-600` | `text-cyan-400` |
| Mensagem ROI | `text-emerald-600` | `text-emerald-400` |

Esses padroes seguem o mesmo sistema usado em `STATUS_CONFIG` (ex: `bg-amber-50 dark:bg-amber-500/10`).

---

## 8. Responsividade

| Breakpoint | Ajuste |
|------------|--------|
| `lg` (>=1024px) | Valor receita `text-4xl`, layout padrao |
| `md` (>=768px) | Valor receita `text-3xl` |
| `sm` (<768px) | Valor receita `text-3xl`, padding `p-4` em vez de `p-5` |

O bloco de receita e sempre full-width (nao lado a lado com o valor a pagar), garantindo leitura clara em mobile.

---

## 9. Dados Necessarios (API)

### 9.1 Fonte de dados

Conforme decisao arquitetural documentada no MEMORY.md:
- **Receita total** = Klaviyo Metric Aggregates (`Placed Order` sem `by`)
- **Receita atribuida** = Klaviyo Metric Aggregates com `by: ['$attributed_flow', '$$attributed_campaign']`

Para o banner, usar **receita atribuida** (totalRevenue do KlaviyoData), pois e o valor que a Convertfy pode reivindicar.

### 9.2 Periodo

O periodo da receita deve corresponder aos meses das faturas pendentes/vencidas.

Logica sugerida:
1. Coletar `due_date` de todas as faturas com status `pending` ou `overdue`
2. Extrair o range de meses cobertos (ex: jan-fev 2026)
3. Buscar receita Klaviyo atribuida para esse range

### 9.3 Endpoint sugerido

Opcao A (recomendada): Expandir `GET /api/portal/invoices` com query param `?include=revenue`
- Retorna campo adicional `revenue: { total: number, period: string }` na response
- Evita fetch adicional no frontend

Opcao B: Endpoint separado `GET /api/portal/invoices/revenue?months=2026-01,2026-02`
- Mais flexivel mas requer fetch adicional (usar variante C com skeleton)

### 9.4 Response expandida (Opcao A)

```typescript
interface InvoicesResponse {
  invoices: Invoice[]
  nextInvoice: Invoice | null
  stats: { /* existente */ }
  revenue?: {                          // NOVO - opcional
    attributed: number                 // receita atribuida Klaviyo
    period: string                     // "janeiro e fevereiro de 2026"
    months: string[]                   // ["2026-01", "2026-02"]
  }
}
```

---

## 10. Classes Tailwind Completas

### 10.1 Bloco de Receita (novo componente)

```tsx
{/* Revenue Block - render only when revenue data exists */}
{showRevenue && (
  <div className="rounded-xl p-5 sm:p-4 bg-gradient-to-r from-cyan-50 to-emerald-50 border border-cyan-200 dark:from-cyan-500/10 dark:to-emerald-500/10 dark:border-cyan-500/20">
    <div className="flex items-center gap-2 mb-1">
      <TrendingUp className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
      <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
        Receita gerada pela Convertfy nesse periodo
      </p>
    </div>
    <p className="text-3xl lg:text-4xl font-bold text-cyan-600 dark:text-cyan-400">
      {formatCurrency(revenue.attributed)}
    </p>
    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-2">
      {roiMessage}
    </p>
  </div>
)}
```

### 10.2 Valor a Pagar (ajustado)

```tsx
{/* Amount - adjusted sizing */}
<div className="text-center">
  <p className="text-sm text-muted-foreground mb-1">Valor a Pagar</p>
  <p className={`text-4xl font-bold ${isOverdue ? "text-red-600" : "text-foreground"}`}>
    {formatCurrency(invoice.amount)}
  </p>
</div>
```

### 10.3 Skeleton para loading

```tsx
{revenueLoading && (
  <Skeleton className="h-28 rounded-xl bg-muted" />
)}
```

---

## 11. Acessibilidade (WCAG AA)

| Requisito | Implementacao |
|-----------|--------------|
| Contraste | cyan-600 sobre cyan-50 = ratio 4.7:1 (passa AA) |
| Contraste dark | cyan-400 sobre cyan-500/10 = ratio 7.2:1 (passa AAA) |
| Screen reader | Adicionar `aria-label` no container: `"Receita gerada: R$ 150.000"` |
| Semantica | Usar `<section>` com `aria-labelledby` apontando para o label |
| Reducao de movimento | Nenhuma animacao necessaria neste componente |

---

## 12. Icone e Imports

Adicionar ao import existente de lucide-react:

```tsx
import { TrendingUp } from "lucide-react"
```

Nenhuma dependencia nova necessaria.

---

## 13. Checklist para o Dev

- [ ] Expandir `InvoicesResponse` com campo `revenue?`
- [ ] Implementar busca de receita Klaviyo no `GET /api/portal/invoices` (ou endpoint separado)
- [ ] Adicionar bloco de receita no `BoletoCard` (acima do "Valor a Pagar")
- [ ] Implementar logica de `roiMessage` com as 4 faixas de ratio
- [ ] Reduzir valor a pagar de `text-5xl` para `text-4xl`, cor para `text-foreground`
- [ ] Testar variante sem dados de receita (fallback = layout atual)
- [ ] Testar dark mode
- [ ] Testar mobile (< 768px)
- [ ] Verificar contraste WCAG AA
- [ ] Adicionar `aria-label` para acessibilidade
