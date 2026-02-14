# MAPEAMENTO COMPLETO DE PROBLEMAS - ADMIN CONVERTFY

## SUMARIO

| Categoria | Quantidade | Prioridade |
|-----------|-----------|------------|
| Botoes que nao funcionam | 18 | ALTA |
| Dados mockados/fake | 15+ | ALTA |
| Rotas faltantes | 15 | ALTA |
| Integracoes pendentes | 9 | MEDIA |
| **TOTAL** | **57+** | - |

---

# 1. BOTOES QUE NAO FUNCIONAM (18 elementos)

## 1.1 Pagina de Reunioes
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Agendar Reuniao" | `src/app/(dashboard)/meetings/page.tsx` | 61-64 | Sem `onClick` ou `href` |

**Codigo atual:**
```tsx
<Button>
  <Plus className="mr-2 h-4 w-4" />
  Agendar Reuniao
</Button>
```

**Correcao necessaria:**
```tsx
<Button asChild>
  <Link href="/meetings/new">
    <Plus className="mr-2 h-4 w-4" />
    Agendar Reuniao
  </Link>
</Button>
```

---

## 1.2 Pagina de Relatorios
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Novo Relatorio" (header) | `src/app/(dashboard)/reports/page.tsx` | 77-80 | Sem `onClick` ou `href` |
| Botao "Criar Relatorio" (card vazio) | `src/app/(dashboard)/reports/page.tsx` | 133-136 | Sem `onClick` ou `href` |

---

## 1.3 Pagina de Ferramentas (Tools)
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Gerar Comparativo" | `src/app/(dashboard)/tools/page.tsx` | 292-295 | Sem `onClick` |
| Botao "Gerar Relatorio PDF" | `src/app/(dashboard)/tools/page.tsx` | 351-354 | Sem `onClick` |
| Botao "Shopify" | `src/app/(dashboard)/tools/page.tsx` | 344 | Sem `onClick` |
| Botao "Facebook Ads" | `src/app/(dashboard)/tools/page.tsx` | 345 | Sem `onClick` |
| Botao "Google Ads" | `src/app/(dashboard)/tools/page.tsx` | 346 | Sem `onClick` |
| Botao "Klaviyo" | `src/app/(dashboard)/tools/page.tsx` | 347 | Sem `onClick` |
| Botao "Instagram" | `src/app/(dashboard)/tools/page.tsx` | 348 | Sem `onClick` |

---

## 1.4 Pagina de Automacoes
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Switch ativar/desativar | `src/app/(dashboard)/automations/page.tsx` | 223 | Sem `onCheckedChange` (read-only) |

**Codigo atual:**
```tsx
<Switch checked={automation.is_active} />
```

**Correcao necessaria:**
```tsx
<Switch
  checked={automation.is_active}
  onCheckedChange={(checked) => handleToggleAutomation(automation.id, checked)}
/>
```

---

## 1.5 Pagina de Detalhes do Cliente
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "More Options" | `src/app/(dashboard)/clients/[id]/page.tsx` | 123-125 | Sem menu dropdown |

---

## 1.6 Componente Dashboard Alerts
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Ver" reuniao | `src/components/dashboard/alerts.tsx` | 118-120 | Sem `onClick` |

---

## 1.7 Componente Pipeline Header
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Menu "Novo Pipeline" | `src/components/pipeline/pipeline-header.tsx` | 58-61 | Sem `onClick` |

---

## 1.8 Componente Pipeline Board
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Menu "Excluir" deal | `src/components/pipeline/pipeline-board.tsx` | 195-198 | Sem `onClick` |

---

## 1.9 Componente Client Meetings
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Agendar Reuniao" | `src/components/clients/client-meetings.tsx` | 36-39 | Sem `onClick` ou `href` |

---

## 1.10 Componente Client Reports
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Novo Relatorio" | `src/components/clients/client-reports.tsx` | 41-44 | Sem `onClick` |
| Botao "Criar Primeiro Relatorio" | `src/components/clients/client-reports.tsx` | 57-60 | Sem `onClick` |
| Botao "Ver" relatorio | `src/components/clients/client-reports.tsx` | 108-111 | Sem `onClick` |

---

## 1.11 Componente Client Contracts
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Novo Contrato" | `src/components/clients/client-contracts.tsx` | 94-97 | Sem `onClick` |

---

## 1.12 Componente Header (Notificacoes)
| Elemento | Arquivo | Linha | Problema |
|----------|---------|-------|----------|
| Botao "Marcar todas como lidas" | `src/components/layout/header.tsx` | 124-126 | Sem `onClick` |
| Menu "Ver todas as notificacoes" | `src/components/layout/header.tsx` | 139-141 | Sem `onClick` |

---

# 2. DADOS MOCKADOS / FAKE (15+ itens)

## 2.1 DADOS CRITICOS (Alto Impacto)

### Dashboard Charts - Dados Completamente Fake
**Arquivo:** `src/components/dashboard/charts.tsx`

| Linha | Variavel | Dados |
|-------|----------|-------|
| 23-31 | `revenueData` | Array com 6 meses de receita/custos fake |
| 33-38 | `clientsData` | Contagem de clientes por status fake |
| 40-46 | `pipelineData` | Valores de pipeline por stage fake |

**Comentario no codigo:** `// Mock data - will be replaced with real data from Supabase`

**Exemplo de dado fake:**
```typescript
const revenueData = [
  { month: "Jan", receita: 45000, custos: 32000, lucro: 13000 },
  { month: "Fev", receita: 52000, custos: 35000, lucro: 17000 },
  // ...
]
```

**Deveria ser:**
```typescript
const revenueData = await supabase
  .from('invoices')
  .select('amount, payment_date')
  .eq('status', 'paid')
  .gte('payment_date', sixMonthsAgo)
```

---

### Recent Activity - Timeline Completamente Fake
**Arquivo:** `src/components/dashboard/recent-activity.tsx`
**Linhas:** 16-77

```typescript
const activities = [
  {
    id: 1,
    type: "client_created",
    description: "Novo cliente cadastrado: Loja Premium",
    user: "Joao Silva",
    time: "2 min atras",
    // ... dados fake
  },
]
```

**Deveria buscar da tabela `activities`:**
```typescript
const { data } = await supabase
  .from('activities')
  .select('*, user:profiles(*), client:clients(*)')
  .order('created_at', { ascending: false })
  .limit(10)
```

---

### Tools Page - IA Mockada com setTimeout
**Arquivo:** `src/app/(dashboard)/tools/page.tsx`

| Linha | Funcao | Problema |
|-------|--------|----------|
| 39-51 | `generateEmailSubjects()` | usa `setTimeout` retornando dados fake |
| 54-74 | `generateAdCopy()` | usa `setTimeout` retornando texto fake |

**Codigo atual:**
```typescript
async function generateEmailSubjects() {
  setIsGeneratingSubjects(true)
  // Simulate API call
  setTimeout(() => {
    setEmailSubjects([
      "Recupere seu carrinho abandonado com 10% OFF",
      // ... textos hardcoded
    ])
  }, 1500)
}
```

**Deveria chamar OpenAI:**
```typescript
async function generateEmailSubjects() {
  const response = await fetch('/api/ai/generate-subjects', {
    method: 'POST',
    body: JSON.stringify({ prompt: emailPrompt })
  })
  const data = await response.json()
  setEmailSubjects(data.subjects)
}
```

---

## 2.2 VALORES HARDCODED (Medio Impacto)

### Reports Page - Numero Fixo
**Arquivo:** `src/app/(dashboard)/reports/page.tsx`
**Linha:** 116

```tsx
<p className="text-2xl font-bold">3</p>  // Deveria ser contagem real
```

### Financial Page - Variacoes Percentuais Fake
**Arquivo:** `src/app/(dashboard)/financial/page.tsx`
**Linhas:** 73-74, 83-84

```typescript
change: "+8.2%",   // Hardcoded
positive: true,
// ...
change: "+12.5%", // Hardcoded
positive: true,
```

---

## 2.3 CONFIGURACOES DUPLICADAS (Baixo Impacto - Refatorar)

| Config | Arquivos | Recomendacao |
|--------|----------|--------------|
| `statusLabels` (clientes) | `clients-table.tsx:58`, `[id]/page.tsx:19` | Centralizar em `/constants` |
| `statusConfig` (invoices) | `client-financial.tsx:21`, `financial/page.tsx:60` | Centralizar |
| `statusConfig` (meetings) | `meetings/page.tsx:41`, `client-meetings.tsx:15` | Centralizar |
| `triggerLabels` | `automations/page.tsx:48` | Mover para `/constants` |
| `months` | `reports/page.tsx:33` | Usar `Intl.DateTimeFormat` |

---

# 3. ROTAS FALTANTES (15 rotas)

## 3.1 Rotas de Autenticacao

| Rota | Referenciada em | Linha | Acao |
|------|-----------------|-------|------|
| `/forgot-password` | `src/app/(auth)/login/page.tsx` | 117 | Criar pagina de recuperacao de senha |

**Arquivo esperado:** `src/app/(auth)/forgot-password/page.tsx`

---

## 3.2 Rotas de Clientes

| Rota | Referenciada em | Linha | Acao |
|------|-----------------|-------|------|
| `/clients/[id]/edit` | `clients/[id]/page.tsx`, `clients-table.tsx` | 118, 234 | Criar pagina de edicao |

**Arquivo esperado:** `src/app/(dashboard)/clients/[id]/edit/page.tsx`

---

## 3.3 Rotas de Automacoes

| Rota | Referenciada em | Linha | Acao |
|------|-----------------|-------|------|
| `/automations/[id]` | `automations/page.tsx` | 188 | Criar pagina de edicao |

**Arquivo esperado:** `src/app/(dashboard)/automations/[id]/page.tsx`

---

## 3.4 Rotas de Reunioes

| Rota | Referenciada em | Linha | Acao |
|------|-----------------|-------|------|
| `/meetings/new` | `quick-actions.tsx` | 22 | Criar pagina de agendamento |

**Arquivo esperado:** `src/app/(dashboard)/meetings/new/page.tsx`

---

## 3.5 Rotas de Relatorios

| Rota | Referenciada em | Linha | Acao |
|------|-----------------|-------|------|
| `/reports/new` | `quick-actions.tsx` | 28 | Criar pagina de criacao |

**Arquivo esperado:** `src/app/(dashboard)/reports/new/page.tsx`

---

## 3.6 Rotas de Configuracoes (10 subpaginas)

| Rota | Descricao | Complexidade |
|------|-----------|--------------|
| `/settings/profile` | Perfil do usuario | Media |
| `/settings/company` | Dados da empresa | Media |
| `/settings/notifications` | Preferencias de notificacao | Baixa |
| `/settings/appearance` | Tema e aparencia | Baixa |
| `/settings/users` | Gestao de usuarios | Alta |
| `/settings/permissions` | Permissoes por cargo | Alta |
| `/settings/custom-fields` | Campos personalizados | Media |
| `/settings/tags` | Gestao de tags | Baixa |
| `/settings/email-templates` | Templates de email | Media |
| `/settings/integrations` | Painel de integracoes | Alta |

**Arquivos esperados:**
```
src/app/(dashboard)/settings/
├── profile/page.tsx
├── company/page.tsx
├── notifications/page.tsx
├── appearance/page.tsx
├── users/page.tsx
├── permissions/page.tsx
├── custom-fields/page.tsx
├── tags/page.tsx
├── email-templates/page.tsx
└── integrations/page.tsx
```

---

# 4. INTEGRACOES PENDENTES (9 integracoes)

## 4.1 ASAAS (Pagamentos) - PRIORIDADE ALTA

**Variaveis de ambiente:**
```env
ASAAS_API_KEY=
ASAAS_WEBHOOK_SECRET=
NEXT_PUBLIC_ASAAS_ENVIRONMENT=sandbox
```

**Referencias no codigo:**
- `types/index.ts:69` - Campo `asaas_id` na interface Invoice
- `supabase/migrations:94` - Coluna `asaas_id` na tabela invoices

**O que implementar:**
- [ ] Criar `src/lib/asaas/client.ts` - Cliente da API
- [ ] Criar `src/lib/asaas/types.ts` - Tipos
- [ ] Criar `src/app/api/asaas/create-charge/route.ts` - Criar cobranca
- [ ] Criar `src/app/api/webhooks/asaas/route.ts` - Receber webhooks
- [ ] Sincronizar status de pagamento automaticamente

---

## 4.2 OPENAI (IA) - PRIORIDADE ALTA

**Variaveis de ambiente:**
```env
OPENAI_API_KEY=
```

**Referencias no codigo:**
- `tools/page.tsx:39-75` - Funcoes mockadas com setTimeout

**O que implementar:**
- [ ] Criar `src/lib/openai/client.ts` - Cliente OpenAI
- [ ] Criar `src/app/api/ai/generate-subjects/route.ts`
- [ ] Criar `src/app/api/ai/generate-copy/route.ts`
- [ ] Remover setTimeout e usar API real

---

## 4.3 GOOGLE CALENDAR - PRIORIDADE MEDIA

**Variaveis de ambiente:**
```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

**Referencias no codigo:**
- `types/index.ts:91` - Campo `google_event_id` em Meeting
- `supabase/migrations:119` - Coluna `google_event_id`

**O que implementar:**
- [ ] OAuth flow com Google
- [ ] Criar eventos no Calendar ao agendar reuniao
- [ ] Sincronizacao bidirecional
- [ ] Preencher campo `google_event_id`

---

## 4.4 WHATSAPP BUSINESS - PRIORIDADE MEDIA

**Variaveis de ambiente:**
```env
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

**O que implementar:**
- [ ] Cliente WhatsApp API
- [ ] Enviar mensagens via template
- [ ] Webhook de confirmacao
- [ ] Executor de acao de automacao

---

## 4.5 META ADS - PRIORIDADE BAIXA

**Variaveis de ambiente:**
```env
META_APP_ID=
META_APP_SECRET=
```

**O que implementar:**
- [ ] OAuth com Meta
- [ ] Importar metricas de campanhas
- [ ] Dashboard de performance

---

## 4.6 GOOGLE ADS - PRIORIDADE BAIXA

**O que implementar:**
- [ ] OAuth com Google Ads
- [ ] Importar metricas
- [ ] Relatorios de ROAS

---

## 4.7 KLAVIYO - PRIORIDADE BAIXA

**Variaveis de ambiente:**
```env
KLAVIYO_API_KEY=
```

**O que implementar:**
- [ ] Cliente Klaviyo API
- [ ] Sincronizar contatos
- [ ] Importar metricas de email

---

## 4.8 SHOPIFY - PRIORIDADE BAIXA

**Referencias:**
- Tabela `client_stores` existe mas nao e usada
- Interface `ClientStore` definida

**O que implementar:**
- [ ] OAuth com Shopify
- [ ] Sincronizar dados de lojas
- [ ] Importar metricas de vendas

---

## 4.9 INSTAGRAM - PRIORIDADE BAIXA

**O que implementar:**
- [ ] OAuth com Instagram Graph API
- [ ] Importar metricas de contas

---

# ORDEM DE EXECUCAO RECOMENDADA

## Sprint 1: Botoes e Rotas Criticas
1. [ ] Fazer botoes funcionarem (18 itens)
2. [ ] Criar `/clients/[id]/edit`
3. [ ] Criar `/meetings/new`
4. [ ] Criar `/automations/[id]`

## Sprint 2: Remover Dados Fake
1. [ ] Dashboard charts com dados reais
2. [ ] Recent activity do Supabase
3. [ ] Remover setTimeout da Tools page

## Sprint 3: Integracoes Core
1. [ ] Integrar Asaas (pagamentos)
2. [ ] Integrar OpenAI (IA)

## Sprint 4: Settings e Rotas Secundarias
1. [ ] Criar `/settings/profile`
2. [ ] Criar `/settings/integrations`
3. [ ] Criar demais settings

## Sprint 5: Integracoes Adicionais
1. [ ] Google Calendar
2. [ ] WhatsApp Business
3. [ ] Meta Ads

---

*Documento gerado em 26/01/2026*
