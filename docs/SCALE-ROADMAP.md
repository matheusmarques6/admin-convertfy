# Admin Convertfy — Scale Roadmap

> O que falta criar para chegar na estrutura de escala desejada.
> Cada item detalha: o que é, por que precisa, arquitetura sugerida, arquivos a criar, e dependências.
> Atualizado: 2026-02-19

---

## Índice

1. [Visão Geral da Escala](#1-visão-geral-da-escala)
2. [EPIC 1: Dashboard — Resultado Total](#2-epic-1-dashboard--resultado-total)
3. [EPIC 2: Onboarding Completo](#3-epic-2-onboarding-completo)
4. [EPIC 3: Sistema de Copy (Campanhas)](#4-epic-3-sistema-de-copy-campanhas)
5. [EPIC 4: Board Inteligente](#5-epic-4-board-inteligente)
6. [EPIC 5: Reuniões Completas](#6-epic-5-reuniões-completas)
7. [EPIC 6: Relatórios de Escala](#7-epic-6-relatórios-de-escala)
8. [EPIC 7: Equipe — Config por Agente](#8-epic-7-equipe--config-por-agente)
9. [EPIC 8: Portal do Cliente — Evolução](#9-epic-8-portal-do-cliente--evolução)
10. [Mapa de Dependências](#10-mapa-de-dependências)
11. [Novas Tabelas Necessárias](#11-novas-tabelas-necessárias)
12. [Ordem de Execução Recomendada](#12-ordem-de-execução-recomendada)

---

## 1. Visão Geral da Escala

### Estado Atual
A plataforma tem uma base sólida:
- Multi-tenant com RLS
- Integrações Klaviyo/Shopify/Asaas/Wise funcionando
- Credenciais encriptadas (AES-256-GCM)
- Dashboard com dados reais
- Campanhas com performance real
- Board kanban funcional
- Portal do cliente básico

### Estado Desejado
Uma plataforma completa de gestão de agência de email marketing que:
- Mostra quanto a Convertfy gera para cada cliente (KPI central)
- Onboarda clientes com formulário detalhado + briefing automático
- Gerencia copywriting de campanhas com workflow completo
- Board alimentado automaticamente por processos
- Reuniões integradas com lojas e clientes
- Relatórios ricos e exportáveis
- Cada agente tem board personalizado por função

### Gap = 8 Epics detalhadas abaixo

---

## 2. EPIC 1: Dashboard — Resultado Total

### Objetivo
Banner atravessando a tela mostrando o **total de receita que a Convertfy gerou para todos os clientes** no período selecionado. UX premium.

### O que precisa
1. **API**: Novo endpoint que soma `conversion_value` do Klaviyo de todas as lojas
2. **Componente**: Banner full-width com animação, seletor de período, breakdown por loja
3. **Cache**: Dados devem ser cacheados (são caros — 2 API calls por loja)

### Arquitetura Sugerida

#### Novo endpoint
```
GET /api/dashboard/total-results?period=30d
```

**Lógica**:
1. Buscar todas as lojas ativas com Klaviyo configurado
2. Para cada loja (parallel): chamar `getKlaviyoRevenueForStore(storeId, period)`
3. Somar todos os `conversion_value`
4. Retornar total + breakdown por loja
5. Cachear resultado (TTL: 30min para 30d, 5min para 7d)

**Response**:
```typescript
{
  total_generated: number       // Soma de toda receita Klaviyo
  total_store_revenue: number   // Soma de toda receita Shopify
  percentage: number            // (total_generated / total_store_revenue) * 100
  period: string
  by_store: Array<{
    store_id: string
    store_name: string
    client_name: string
    klaviyo_revenue: number
    total_revenue: number
    percentage: number
  }>
  cached_at: string
}
```

#### Novo componente
```
src/components/dashboard/total-results-banner.tsx
```

**Design UX**:
- Full-width card com gradient background
- Número grande animado (count-up animation)
- Seletor de período (7d, 15d, 30d, 90d, custom)
- Mini-breakdown: top 5 lojas com bar chart horizontal
- Click em loja → navega para `/stores/[id]`
- Skeleton loading enquanto carrega
- Refresh button

#### Arquivos a criar/modificar
| Arquivo | Ação |
|---------|------|
| `src/app/api/dashboard/total-results/route.ts` | CRIAR — endpoint |
| `src/components/dashboard/total-results-banner.tsx` | CRIAR — componente |
| `src/app/(dashboard)/dashboard/page.tsx` | MODIFICAR — adicionar banner no topo |

### Dependências
- `src/lib/integrations/klaviyo/report-summary.ts` (já existe `getKlaviyoRevenueForStore`)
- `src/lib/integrations/shopify/report.ts` (já existe `getShopifyReportForStore`)
- Cache table ou in-memory cache

---

## 3. EPIC 2: Onboarding Completo

### Objetivo
Sistema completo de onboarding com: formulário de dados da loja, briefing automático, tutoriais por etapa, cards de status.

### Sub-features

#### 2A: Formulário de Dados da Loja
**O que é**: Formulário com 15+ campos coletando dados do negócio do cliente.

**Campos**:
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Nome da Loja | text | Sim |
| URL da Loja | url | Sim |
| Plataforma | select (Shopify, WooCommerce, Nuvemshop, Tray, Dupla Estrutura, Outros) | Sim |
| Código de Colaborador | text | Sim |
| Nicho da Loja | text | Sim |
| Tipo de Frete | select (Grátis, Fixo, Personalizado) | Sim |
| País da Loja | select | Sim |
| Idioma da Loja | select | Sim |
| Público Alvo | textarea | Sim |
| Sensibilidade (preço vs qualidade) | select/slider | Sim |
| Algo específico a acrescentar | textarea | Não |
| Logo sem fundo | file upload | Não |
| Norte para o design | file upload / textarea | Não |
| Manual de marca | file upload | Não |

**Nova tabela**: `store_onboarding_data`
```sql
CREATE TABLE store_onboarding_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  org_id UUID REFERENCES organizations(id),
  -- Campos do formulário
  store_name TEXT NOT NULL,
  store_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  collaborator_code TEXT,
  niche TEXT,
  shipping_type TEXT, -- 'free', 'fixed', 'custom'
  country TEXT,
  language TEXT,
  target_audience TEXT,
  price_sensitivity TEXT, -- 'price', 'quality', 'balanced'
  additional_notes TEXT,
  logo_url TEXT,
  design_direction TEXT,
  brand_manual_url TEXT,
  -- Meta
  filled_by UUID REFERENCES profiles(id),
  filled_at TIMESTAMPTZ,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Arquivos a criar**:
| Arquivo | Propósito |
|---------|-----------|
| `src/components/onboarding/store-onboarding-form.tsx` | Formulário multi-step |
| `src/app/api/onboarding/store-data/route.ts` | CRUD dos dados |
| `src/app/portal/onboarding/form/page.tsx` | Página do formulário (portal) |
| `src/app/(dashboard)/onboarding/[id]/form/page.tsx` | Página do formulário (admin) |

**UX do formulário**:
- Multi-step wizard (3 etapas: Dados Básicos → Público & Marca → Arquivos)
- Progress bar no topo
- Save parcial (pode sair e voltar)
- Indicador de preenchimento (check verde / X vermelho) visível do admin
- Editável a qualquer momento

#### 2B: Card de Loja após Preenchimento
**O que é**: Quando o cliente preenche o formulário, aparece um card com nome + URL da loja.

**Comportamento**:
- Card no dashboard do onboarding (admin e portal)
- Mostra: nome da loja, URL, platform badge, status de preenchimento
- Click → redireciona para `/stores/[id]` com dados da loja
- Ao lado: nome do cliente vinculado (click → `/clients/[id]`)

**Dados mostrados no card da loja**:
- Status da loja (ativo/inativo/onboarding)
- Fase do onboarding (progress %)
- Dashboard mini: Klaviyo revenue, Shopify revenue se disponível
- Quanto a Convertfy gerou para a loja
- Data do último feedback
- Link para o cliente

#### 2C: Briefing Automático da Loja
**O que é**: Geração automática de briefing baseado nos dados do formulário.

**Seções do Briefing**:
1. Dados da Loja (extraído do formulário)
2. Código de Colaborador
3. Materiais e Identidade Visual (logos, manual de marca)
4. Foco das Campanhas (derivado de nicho + público + sensibilidade)
5. Público (target audience + sensibilidade)
6. Detalhes Adicionais (conceito, políticas)
7. Resumo de Performance (Facebook, GA — quando disponível)
8. Perfil da Marca (derivado dos dados)
9. Análise de Anúncios (quando disponível)

**Nova tabela**: `store_briefings`
```sql
CREATE TABLE store_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,
  onboarding_data_id UUID REFERENCES store_onboarding_data(id),
  briefing_data JSONB NOT NULL, -- Structured briefing content
  version INTEGER DEFAULT 1,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by TEXT, -- 'auto' or user_id
  status TEXT DEFAULT 'current', -- 'current', 'archived'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Lógica de geração**:
- Quando formulário é salvo → gerar briefing automaticamente
- Briefing é JSON estruturado renderizado em seções
- Botão "Refazer" com duas opções:
  1. "Mudar dados do formulário" → abre form → ao salvar, gera novo briefing
  2. "Continuar e refazer" → regenera com mesmos dados (útil quando template muda)
- Quando dados do form mudam e salvam → briefing é regenerado automaticamente

**Arquivos a criar**:
| Arquivo | Propósito |
|---------|-----------|
| `src/components/onboarding/store-briefing.tsx` | Renderiza briefing |
| `src/components/onboarding/briefing-generator.ts` | Lógica de geração |
| `src/app/api/onboarding/briefing/route.ts` | API de geração/fetch |

#### 2D: Tutoriais Contextuais
**O que é**: Quando o cliente responde o formulário, tutoriais aparecem de acordo com a etapa do onboarding.

**Implementação sugerida**:
- Tabela `onboarding_tutorials` com: step_key, title, content (markdown ou URL), media_url
- Componente `TutorialCard` que aparece na lateral ou como modal
- Filtra tutoriais baseado no `current_step` do onboarding
- Pode ser vídeo embed, texto com imagens, ou link externo

**Arquivos a criar**:
| Arquivo | Propósito |
|---------|-----------|
| `src/components/onboarding/tutorial-card.tsx` | Card de tutorial |
| `src/app/api/onboarding/tutorials/route.ts` | CRUD tutoriais |

---

## 4. EPIC 3: Sistema de Copy (Campanhas)

### Objetivo
Sistema completo de copywriting para campanhas com formulário, workflow teste/produção, integração com design.

### Sub-features

#### 3A: Formulário de Nova Copy
**Campos**:
| Campo | Tipo | Fonte |
|-------|------|-------|
| Campanha | select (existente) ou "Criar nova" | `campaigns` table |
| Lojas que serão enviadas | multi-select | `client_stores` do client |
| Cupom de Campanha | text | Manual |
| Data | date (auto-preenche da campanha) | `campaigns.scheduled_date` |
| Estrutura de Email | url (link do docs) | Manual |
| Tipo | radio (Teste / Produção) | Manual |

**Nova tabela**: `campaign_copies`
```sql
CREATE TABLE campaign_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  org_id UUID REFERENCES organizations(id),
  -- Copy data
  store_ids UUID[] NOT NULL, -- Array de stores
  coupon_code TEXT,
  scheduled_date DATE,
  email_structure_url TEXT,
  copy_type TEXT NOT NULL, -- 'test', 'production'
  copy_content TEXT, -- O conteúdo da copy (rich text)
  docs_url TEXT, -- Link para Google Docs gerado
  -- Workflow
  status TEXT DEFAULT 'draft', -- 'draft', 'review', 'approved', 'sent_to_design'
  created_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### 3B: Integração com Design
**Lógica**:
- Quando copy marcada como "Produção" → status muda para `sent_to_design`
- Na aba "Copy" de campanhas: pastas por campanha
- Dentro da pasta: lojas com nome da campanha
- Click → redireciona para o docs_url da copy
- Designer vê todas as copies "sent_to_design" em sua view do board

#### 3C: View de Copy na Campanha
**Arquivo existente**: `src/app/(dashboard)/campaigns/page.tsx` (tab "Copy" mostra "Em breve")
**Ação**: Substituir placeholder por:
- Lista de copies agrupadas por campanha (accordion/folders)
- Dentro: cards por loja com status badge
- Botão "Nova Copy" abre formulário
- Filtros: por campanha, por loja, por status

**Arquivos a criar**:
| Arquivo | Propósito |
|---------|-----------|
| `src/components/campaigns/copy-view.tsx` | View principal de copies |
| `src/components/campaigns/copy-form-modal.tsx` | Formulário de nova copy |
| `src/components/campaigns/copy-card.tsx` | Card individual de copy |
| `src/app/api/campaigns/copies/route.ts` | CRUD de copies |

---

## 5. EPIC 4: Board Inteligente

### Objetivo
Board que é alimentado automaticamente por processos do sistema, configurável por função do agente.

### Sub-features

#### 4A: Alimentação Automática
**Eventos que criam tasks automaticamente**:
| Evento | Task gerada | Tipo | Assignee |
|--------|-------------|------|----------|
| Novo onboarding criado | "Iniciar onboarding: {store_name}" | onboarding | assigned_to do onboarding |
| Reunião agendada | "Reunião: {title}" | meeting | participantes |
| Campaign copy para produção | "Design: {campaign} - {store}" | campaign | designer da org |
| Feedback atrasado | "Feedback atrasado: {store}" | deadline | responsável pela loja |
| Novo relatório pendente | "Gerar relatório: {store}" | request | CS responsável |
| Contrato expirando | "Renovar contrato: {client}" | deadline | owner do client |

**Implementação**:
- Criar `src/lib/services/task-automation.service.ts`
- Funções para cada trigger
- Chamar nos API routes relevantes (onboarding, meetings, campaigns, etc.)
- Ou usar Database triggers/webhooks

#### 4B: Config por Função
**O que é**: Cada role (CS, Designer, SDR, Closer, Admin) tem sugestões pré-preenchidas de quais eventos alimentam seu board.

**Nova tabela**: `board_config`
```sql
CREATE TABLE board_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id UUID REFERENCES org_members(id),
  -- Event sources
  show_onboarding_tasks BOOLEAN DEFAULT false,
  show_meeting_tasks BOOLEAN DEFAULT true,
  show_campaign_tasks BOOLEAN DEFAULT false,
  show_feedback_tasks BOOLEAN DEFAULT false,
  show_report_tasks BOOLEAN DEFAULT false,
  show_contract_tasks BOOLEAN DEFAULT false,
  -- Calendar
  calendar_view_mode TEXT DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly'
  show_personal_events BOOLEAN DEFAULT true,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Defaults por role**:
| Role | Onboarding | Meetings | Campaigns | Feedback | Reports | Contracts |
|------|-----------|----------|-----------|----------|---------|-----------|
| CS | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Designer | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| SDR | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Closer | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

#### 4C: Calendário Multi-View
**O que é**: Toggle mensal/semanal/diário + eventos pessoais.

**Implementação**:
- Refatorar `board-calendar-view.tsx` para aceitar `viewMode` prop
- Adicionar toggle buttons no header
- Para cada view: renderizar grid diferente
- Permitir criar "evento pessoal" (tipo nota/reminder, não reunião)

**Arquivos a criar/modificar**:
| Arquivo | Ação |
|---------|------|
| `src/lib/services/task-automation.service.ts` | CRIAR — serviço de auto-criação |
| `src/app/api/board/config/route.ts` | CRIAR — config do board |
| `src/components/board/board-config-dialog.tsx` | CRIAR — dialog de config |
| `src/components/board/board-calendar-view.tsx` | MODIFICAR — multi-view |
| `src/components/board/task-board-with-calendar.tsx` | MODIFICAR — integrar config |

---

## 6. EPIC 5: Reuniões Completas

### Objetivo
Sistema de reuniões com UX completo: criação com loja+cliente, conclusão com notas, visibilidade para participantes.

### Sub-features

#### 5A: Seletor de Cliente com Loja
**O que é**: Ao criar reunião, o seletor de cliente mostra `{loja} - {primeiro_nome} {segundo_nome}`.

**Implementação**:
- Componente combobox que busca lojas com join em clients
- Exibe: `Store Name — Cliente Nome` (loja é principal)
- Ao selecionar: preenche `client_id` e `store_id` na reunião
- Adicionar campo `store_id` na tabela `meetings` (se não existir)

#### 5B: Concluir Reunião + Anexar
**O que é**: Ao ver reunião em lista, click → dialog com opção "Concluir" + campo para notas/anexo.

**Flow**:
1. Click na reunião → abre detail view
2. Botão "Concluir Reunião"
3. Dialog: textarea notas + upload de anexo(s)
4. Ao salvar: status = 'completed', notes = texto, attachments salvos
5. Notificação para todos os participantes (criar `notification` entry ou usar activities)
6. Se reunião tem `store_id` → atualizar `client_stores.last_feedback_date`

#### 5C: Visibilidade no Portal
**O que é**: Cliente vê suas reuniões no portal com notas pós-reunião.

**Implementação**:
- Portal page `/portal/meetings`
- Filtrar: `meetings WHERE client_id = current_client.id`
- Mostrar: title, date, status, notas (se completed)
- Próxima reunião com destaque

**Arquivos a criar/modificar**:
| Arquivo | Ação |
|---------|------|
| `src/components/meetings/client-store-selector.tsx` | CRIAR — combobox loja+cliente |
| `src/components/meetings/complete-meeting-dialog.tsx` | CRIAR — dialog de conclusão |
| `src/app/portal/meetings/page.tsx` | CRIAR — portal meetings view |
| `src/app/api/meetings/route.ts` | MODIFICAR — add store_id, completion flow |
| `src/components/meetings/meeting-dialog.tsx` | MODIFICAR — incluir novo seletor |

---

## 7. EPIC 6: Relatórios de Escala

### Objetivo
Relatórios ricos com mais dados, melhor visual, geração manual, export, templates.

### Sub-features

#### 6A: Report Detail Component
**O que é**: View completa de um relatório com seções visuais.

**Seções**:
1. **Header**: Loja, Cliente, Período, Data de geração
2. **Revenue Overview**: Total, Klaviyo-attributed, Campaigns, Flows, SMS (cards + chart)
3. **Email Performance**: Delivery rate, Open rate, Click rate, Bounce, Unsub (gauge charts)
4. **Top Campaigns**: Table com top 10 por revenue (sortable)
5. **Top Flows**: Table com top 10 por revenue
6. **Account Health**: Subscribers, Lists, Active Flows, Engaged segment
7. **Tendência**: Line chart mostrando revenue nos últimos 6 meses (se há reports históricos)

#### 6B: Geração Manual
**O que é**: Botão para gerar relatório de uma loja específica.

**Flow**:
1. Click "Gerar Relatório" (na lista de lojas pendentes ou na página da loja)
2. Selecionar período (7d, 15d, 30d, 90d)
3. API busca dados Klaviyo + Shopify em tempo real
4. Salva em `client_reports` com report_data JSON
5. Redireciona para visualização

#### 6C: Export PDF
**Implementação**: Usar `html2canvas` + `jsPDF` ou `@react-pdf/renderer`
- Botão "Exportar PDF" no detail view
- Gera PDF com logo da org (branding dinâmico)

**Arquivos a criar**:
| Arquivo | Propósito |
|---------|-----------|
| `src/components/reports/report-detail.tsx` | View completa do relatório |
| `src/components/reports/report-charts.tsx` | Charts de performance |
| `src/components/reports/report-export.tsx` | Lógica de export PDF |
| `src/app/api/reports/generate/route.ts` | Geração manual |
| `src/app/(dashboard)/reports/[id]/page.tsx` | Página de detalhe |

---

## 8. EPIC 7: Equipe — Config por Agente

### Objetivo
Configurar o que alimenta o board de cada agente, sugestões por função.

### Implementação
- Tab "Board Config" no perfil do membro da equipe (dentro de `/team`)
- Toggle switches para cada fonte de evento
- Pre-fill baseado na role
- Salvar em `board_config` table (ver EPIC 4)

**Arquivos a criar**:
| Arquivo | Propósito |
|---------|-----------|
| `src/components/team/agent-board-config.tsx` | Config panel |
| `src/app/api/team/board-config/route.ts` | CRUD config |

---

## 9. EPIC 8: Portal do Cliente — Evolução

### Objetivo
Quando cliente loga pela primeira vez: dados → formulário → onboarding → tutoriais.

### Flow Completo
```
Login (primeira vez)
  ↓
Detectar: tem store_onboarding_data preenchido?
  ├─ NÃO → Redirecionar para /portal/onboarding/form
  │         ↓
  │    Preencher formulário (15+ campos)
  │         ↓
  │    Salvar → Gerar briefing automático
  │         ↓
  │    Criar client_onboarding com status=in_progress
  │         ↓
  │    Redirecionar para /portal/onboarding (com tutoriais)
  │
  └─ SIM → Redirecionar para /portal/dashboard
             ↓
        Mostrar: cards de lojas, status onboarding, reuniões, etc.
```

### Componentes Necessários no Portal
1. **Store Card** no dashboard: nome + URL, click → dados da loja
2. **Onboarding Progress**: barra de progresso + etapa atual
3. **Reuniões**: próxima + historial
4. **Tutoriais**: contextuais por etapa

**Arquivos a criar/modificar**:
| Arquivo | Ação |
|---------|------|
| `src/app/portal/onboarding/form/page.tsx` | CRIAR — formulário |
| `src/components/portal/store-card.tsx` | CRIAR — card de loja |
| `src/components/portal/onboarding-progress.tsx` | CRIAR — progress view |
| `src/app/portal/layout.tsx` | MODIFICAR — redirect logic |
| `src/middleware.ts` | MODIFICAR — first login detection |

---

## 10. Mapa de Dependências

```
EPIC 2 (Onboarding) ─────────────────┐
  ├─ 2A: Formulário                   │
  ├─ 2B: Cards (depende de 2A)        │
  ├─ 2C: Briefing (depende de 2A)     │
  └─ 2D: Tutoriais                    │
                                      │
EPIC 8 (Portal) ──────────────────────┤ (depende de EPIC 2)
  └─ Flow first-login → form → onb   │
                                      │
EPIC 1 (Dashboard Total) ────────── Independente
                                      │
EPIC 3 (Copy System) ──────────────── Independente (usa campaigns existente)
                                      │
EPIC 4 (Board Inteligente) ───────────┤
  ├─ 4A: Auto-tasks (depende de       │
  │       EPIC 2, 3, 5 para triggers) │
  ├─ 4B: Config (depende de EPIC 7)   │
  └─ 4C: Calendar multi-view          │
                                      │
EPIC 5 (Reuniões) ──────────────── Independente
                                      │
EPIC 6 (Relatórios) ──────────────── Independente
                                      │
EPIC 7 (Equipe Config) ──────────── Independente (mas alimenta EPIC 4)
```

### Ordem de dependências
```
Fase 1 (paralelo): EPIC 1 + EPIC 2A + EPIC 5 + EPIC 6
Fase 2 (paralelo): EPIC 2B/2C/2D + EPIC 3 + EPIC 7
Fase 3 (sequencial): EPIC 4 (precisa de 2, 3, 5, 7)
Fase 4 (sequencial): EPIC 8 (precisa de 2 completo)
```

---

## 11. Novas Tabelas Necessárias

| Tabela | EPIC | Campos principais |
|--------|------|-------------------|
| `store_onboarding_data` | 2 | store_id, campos do formulário (15+), is_complete |
| `store_briefings` | 2 | store_id, briefing_data (JSONB), version, status |
| `onboarding_tutorials` | 2 | step_key, title, content, media_url, order |
| `campaign_copies` | 3 | campaign_id, store_ids[], copy_type, status, docs_url |
| `board_config` | 4/7 | org_member_id, show_*_tasks booleans, calendar_view |
| `meeting_attachments` | 5 | meeting_id, file_url, file_name, uploaded_by |

### Alterações em tabelas existentes
| Tabela | Alteração | EPIC |
|--------|-----------|------|
| `meetings` | ADD `store_id UUID REFERENCES client_stores(id)` | 5 |
| `meetings` | ADD `completion_notes TEXT` | 5 |
| `meetings` | ADD `completed_at TIMESTAMPTZ` | 5 |
| `tasks` | ADD `source_type TEXT` (manual, auto_onboarding, auto_meeting, etc) | 4 |
| `tasks` | ADD `source_id UUID` (reference to source entity) | 4 |

---

## 12. Ordem de Execução Recomendada

### Fase 1 — Fundações (1-2 semanas)
**Paralelo**, sem dependências entre si:

| EPIC | Story | Estimativa |
|------|-------|------------|
| **1** | Dashboard Resultado Total (API + componente) | 2 dias |
| **2A** | Formulário de Onboarding (tabela + form + API) | 3 dias |
| **5A** | Seletor loja+cliente em reuniões | 1 dia |
| **5B** | Concluir reunião + notas | 1 dia |
| **6A** | Report detail component | 2 dias |
| **6B** | Geração manual de relatório | 1 dia |

### Fase 2 — Features Core (1-2 semanas)
Depende da Fase 1:

| EPIC | Story | Estimativa |
|------|-------|------------|
| **2B** | Cards de loja pós-onboarding | 1 dia |
| **2C** | Briefing automático (geração + view) | 3 dias |
| **2D** | Tutoriais contextuais | 2 dias |
| **3A** | Formulário de Copy | 2 dias |
| **3B** | View de Copy em campanhas | 2 dias |
| **7** | Config board por agente | 2 dias |
| **6C** | Export PDF | 1 dia |

### Fase 3 — Inteligência (1 semana)
Depende das Fases 1 e 2:

| EPIC | Story | Estimativa |
|------|-------|------------|
| **4A** | Auto-tasks (triggers) | 3 dias |
| **4B** | Board config integration | 1 dia |
| **4C** | Calendário multi-view | 2 dias |
| **3C** | Integração Copy → Design | 2 dias |

### Fase 4 — Portal Evolution (1 semana)
Depende do EPIC 2 completo:

| EPIC | Story | Estimativa |
|------|-------|------------|
| **8** | First-login flow | 1 dia |
| **8** | Portal store cards | 1 dia |
| **8** | Portal reuniões | 1 dia |
| **8** | Portal onboarding + tutoriais | 2 dias |
| **5C** | Portal meetings view | 1 dia |

### Total Estimado: 4-6 semanas
(Com equipe/agentes trabalhando em paralelo nas fases)

---

## Observações Finais

### O que NÃO está neste roadmap (FUTURO)
- N8N integration (decidido como futuro)
- Google Calendar sync
- WhatsApp integration
- Automações de email (flows do Klaviyo são geridos no Klaviyo)
- Facebook/Google Ads performance (mencionado no briefing mas depende de APIs externas)
- A/B testing de campanhas

### Princípios de Implementação
1. **Dados reais primeiro** — sempre conectar com APIs reais, nunca mock
2. **Cache agressivo** — dados de Klaviyo/Shopify são caros, cachear no mínimo 5min
3. **Skeleton first** — todo componente deve ter loading state
4. **Multi-tenant always** — toda query filtra por org_id
5. **Encrypt sensitive** — credenciais sempre com AES-256-GCM

---

*Documento gerado por Orion (AIOS Master) — 2026-02-19*
*— Orion, orquestrando o sistema 🎯*
