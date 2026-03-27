# Analise Completa de UI/UX - Portal Admin Convertfy

**Data:** 2026-03-20
**Objetivo:** Mapear o estado atual do design, usabilidade, hierarquia de paginas e arquitetura de informacao do portal admin para identificar oportunidades de melhoria.

---

## 1. Visao Geral da Arquitetura

### Stack Tecnica
| Item | Tecnologia |
|------|-----------|
| Framework | Next.js (App Router) |
| UI Library | Tailwind CSS + shadcn/ui (Radix primitives) |
| Icones | Lucide React |
| Graficos | Recharts v3.5 |
| Tema | next-themes (light/dark com class strategy) |
| Fonte | Geist Variable Font |
| State | Zustand (pipeline/board) + React hooks |
| Auth | Supabase Auth |

### Cor Primaria da Marca
- **Convertfy Blue:** `#05AFF2` (cyan vibrante)
- **Blue Deep:** `#0284C7`
- **Gradiente:** `135deg, #0284C7 → #05AFF2`
- **Dark Background:** `#141C26`

---

## 2. Mapa Completo de Paginas

### 2.1 Autenticacao (5 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Login | `/login` | Formulario email/senha |
| Registro | `/register` | Criacao de conta |
| Esqueci Senha | `/forgot-password` | Recuperacao via email |
| Resetar Senha | `/reset-password` | Nova senha via token |
| Alterar Senha | `/change-password` | Alteracao autenticada |

### 2.2 Admin - Principal (4 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard Principal | `/admin/dashboard` | Visao geral: reunioes, atividades, tarefas, calendario, onboardings, alertas |
| Dashboard Operacional | `/admin/dashboard/operational` | Dashboard filtrado por agente (lojas atribuidas) |
| Notificacoes | `/admin/notifications` | Lista de notificacoes com status read/unread |
| Ferramentas | `/admin/tools` | IA (gerador de assuntos/copy) + calculadoras (ROAS, benchmark) |

### 2.3 Admin - Gestao CRM (10 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Lista de Clientes | `/admin/clients` | Tabela com filtros por status/saude, stats cards, paginacao |
| Detalhe do Cliente | `/admin/clients/[id]` | Header + tabs (Overview, Pedidos, Reports, Atividades, Contatos) |
| Editar Cliente | `/admin/clients/[id]/edit` | Formulario completo com integracao Asaas |
| Novo Cliente | `/admin/clients/new` | Formulario de criacao |
| Lista de Lojas | `/admin/stores` | Tabs: Lojas + Alertas |
| Detalhe da Loja | `/admin/stores/[id]` | Integracoes, onboarding, briefing, reports |
| Pipeline | `/admin/pipeline` | Kanban de deals (drag-drop entre estagios) |
| Board de Tarefas | `/admin/board` | Kanban + calendario (6 colunas: Pending→Cancelled) |
| Reunioes | `/admin/meetings` | Calendario + lista, integracao Google Calendar |
| Nova Reuniao | `/admin/meetings/new` | Formulario de agendamento |

### 2.4 Admin - Marketing (2 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Campanhas | `/admin/campaigns` | 3 views: Calendario, Performance, Copy |
| Automacoes | `/admin/automations` | Grid de cards com triggers e acoes |

### 2.5 Admin - Operacional (4 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Financeiro | `/admin/financial` | 4 tabs: Analise, Cobrancas, Assinaturas, Wise |
| Reports | `/admin/reports` | Lista de reports gerados + lojas pendentes |
| Report Jobs | `/admin/report-jobs` | Historico de geracao com status e retry |
| Report Detalhe | `/admin/report-jobs/[id]` | Detalhe do job individual |

### 2.6 Admin - Time (2 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Equipe | `/admin/team` | Tabela de membros: roles, features, store access |
| Onboarding | `/admin/onboarding` | Board drag-drop de fases do onboarding |

### 2.7 Admin - Configuracoes (10 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Settings Hub | `/admin/settings` | Grid de cards organizados por grupo |
| Perfil | `/admin/settings/profile` | Dados pessoais |
| Empresa | `/admin/settings/company` | Dados da organizacao |
| Notificacoes | `/admin/settings/notifications` | Preferencias de notificacao |
| Aparencia | `/admin/settings/appearance` | Tema light/dark |
| Usuarios | `/admin/settings/users` | Gerenciamento de usuarios |
| Permissoes | `/admin/settings/permissions` | Controle de acesso |
| Campos Custom | `/admin/settings/custom-fields` | Campos personalizados |
| Tags | `/admin/settings/tags` | Gerenciamento de tags |
| Templates Email | `/admin/settings/email-templates` | Templates de email |
| Integracoes | `/admin/settings/integrations` | APIs e conectores |

### 2.8 Portal do Cliente (14 paginas)
| Pagina | Rota | Descricao |
|--------|------|-----------|
| Login Cliente | `/client/login` | Acesso do cliente |
| Dashboard | `/client/dashboard` | Metricas do cliente |
| Lojas | `/client/stores` | Lojas do cliente |
| Nova Loja | `/client/stores/new` | Adicionar loja |
| Detalhe Loja | `/client/stores/[id]` | Detalhe da loja |
| Analytics | `/client/analytics` | Dados analiticos |
| Campanhas | `/client/campaigns` | Campanhas do cliente |
| Flows | `/client/flows` | Automacoes Klaviyo |
| Faturas | `/client/invoices` | Cobrancas e faturas |
| Integracoes | `/client/integrations` | Conexoes ativas |
| Configuracoes | `/client/settings` | Preferencias |
| Alterar Senha | `/client/change-password` | Seguranca |
| Onboarding | `/client/onboarding` | Processo inicial |
| Tracking | `/client/tracking` | Rastreamento |

**Total: ~47 paginas unicas**

---

## 3. Hierarquia de Navegacao (Sidebar Admin)

```
PRINCIPAL
├── Dashboard (/admin/dashboard)
├── Dashboard Operacional (/admin/dashboard/operational)  [agentes]
│
GESTAO (CRM)
├── Clientes (/admin/clients)
│   ├── → Novo Cliente (/admin/clients/new)
│   └── → Detalhe (/admin/clients/[id])
│       └── → Editar (/admin/clients/[id]/edit)
├── Lojas (/admin/stores)
│   └── → Detalhe (/admin/stores/[id])
├── Pipeline (/admin/pipeline)
├── Board (/admin/board)
├── Reunioes (/admin/meetings)
│   └── → Nova Reuniao (/admin/meetings/new)
│
MARKETING
├── Campanhas (/admin/campaigns)
├── Automacoes (/admin/automations)
│   ├── → Nova (/admin/automations/new)
│   └── → Detalhe (/admin/automations/[id])
│
OPERACIONAL
├── Financeiro (/admin/financial)
├── Reports (/admin/reports)
│   ├── → Novo (/admin/reports/new)
│   └── → Detalhe (/admin/reports/[id])
├── Report Jobs (/admin/report-jobs)
│   └── → Detalhe (/admin/report-jobs/[id])
├── Equipe (/admin/team)
├── Onboarding (/admin/onboarding)
│
RODAPE
├── Ferramentas (/admin/tools)
├── Configuracoes (/admin/settings)
│   ├── Perfil, Empresa, Notificacoes, Aparencia
│   ├── Usuarios, Permissoes
│   ├── Campos Custom, Tags, Templates Email
│   └── Integracoes
├── Notificacoes (/admin/notifications)
└── Toggle Tema + Menu Usuario
```

---

## 4. Fluxos de Navegacao entre Paginas

### Fluxo Principal: Cliente
```
Lista Clientes → Detalhe Cliente → Tab Overview → Ver Lojas → Detalhe Loja
                                 → Tab Pedidos → Ver pedidos da loja
                                 → Tab Reports → Ver reports gerados
                                 → Tab Atividades → Historico
                                 → Editar Cliente → Salvar → Volta Detalhe
```

### Fluxo Pipeline → Cliente
```
Pipeline (Kanban) → Arrastar deal → Clique no deal → Ver cliente vinculado
```

### Fluxo Board → Tarefas
```
Board (Kanban) → Arrastar tarefa entre colunas → Clicar tarefa → Ver detalhes
                                                                → Ver cliente/loja vinculada
```

### Fluxo Reports
```
Reports Lista → Gerar Report (via Painel de Lojas) → Stores → Selecionar Loja → Gerar
             → Report Jobs → Acompanhar Status → Download CSV
             → Report Detalhe → Ver/Editar → Publicar
```

### Fluxo Financeiro
```
Financeiro → Tab Analise → Metricas + Graficos
           → Tab Cobrancas → Gerenciar faturas → Vincular cliente
           → Tab Assinaturas → Gerenciar recorrencia
           → Tab Wise → Reconciliacao de pagamentos
```

### Fluxo Campanhas
```
Campanhas → View Calendario → Clicar dia → Ver campanhas do dia → Detalhe campanha
          → View Performance → Metricas por campanha
          → View Copy → Gerar copy com IA → Criar tarefa
          → Sincronizar com Klaviyo
```

### Fluxo Onboarding
```
Onboarding → Board de fases → Arrastar entre fases → Completar → Agenda feedback (30 dias)
           → Vinculado a Loja → Ver detalhe loja
```

---

## 5. Design System Atual

### 5.1 Paleta de Cores

**Cores Semanticas:**
| Cor | Hex | Uso |
|-----|-----|-----|
| Primary | `#3B82F6` (blue-500) | CTAs, links, elementos interativos |
| Convertfy Blue | `#05AFF2` | Brand, gradientes, portal do cliente |
| Success | `#10B981` (emerald) | Status positivo, growth |
| Warning | `#FBBF24` (amber) | Alertas, atencao |
| Destructive | `#F87171` (red) | Erros, exclusao, churn |
| Info | `#06B6D4` (cyan) | Informativo |
| MRR | `#8B5CF6` (violet) | Metricas financeiras |
| Muted | `hsl(214 20% 94%)` | Backgrounds secundarios |

**Sidebar:**
| Elemento | Cor |
|----------|-----|
| Background | `#0d1117` (escuro) |
| Texto muted | `#b0b8c1` |
| Texto hover | `#e6edf3` |
| Icones | `#b0b8c1` |
| Labels | `#6e7681` |

### 5.2 Tipografia
- **Fonte:** Geist Variable Font (sans-serif moderna)
- **Escala:** 11px (2xs) → 36px (4xl)
- **Pesos:** Regular 400, Medium 500, Semibold 600, Bold 700

### 5.3 Espacamento e Layout
- **Base unit:** 4px
- **Container max:** 1400px (2xl)
- **Card padding:** 24px (p-6)
- **Grid gaps:** 12-16px (gap-3/4)
- **Border radius base:** 8px (0.5rem)

### 5.4 Sombras
- Cards usam `shadow-sm` no light mode
- Sem sombra no dark mode (visual limpo)

### 5.5 Componentes Chave
| Componente | Padrao |
|-----------|--------|
| Cards | `rounded-lg border bg-card shadow-sm` |
| GlowCards | Barra colorida no topo + glow sutil |
| Botoes | 7 variantes (default, destructive, outline, secondary, ghost, link, gradient) |
| Badges | `rounded-full` com cores semanticas |
| Tabelas | Bordas horizontais, hover bg-muted |
| Tabs | Inline com bg-muted e active state |
| Modals | Dialog com overlay |
| Kanban | Colunas com drag-drop |

### 5.6 Padroes de Interface
- **Drag-and-drop:** Pipeline, Board, Onboarding
- **Tabs:** Campanhas (3 views), Financeiro (4 tabs), Stores (2 tabs), Reports
- **Modals:** Campanhas (detalhe, quick, full form), confirmacoes
- **Filtros:** Status tabs + search + dropdown filters (Clientes, Reports)
- **Paginacao:** Cursor-based (Reports) e offset-based (Clientes)
- **Real-time:** Notificacoes auto-fetch, Report Jobs refresh 15s

---

## 6. Analise de Usabilidade - Pontos Fortes

### O que funciona bem:
1. **Sidebar consistente** - Navegacao clara com agrupamento logico (Principal, Gestao, Marketing, Operacional)
2. **Permission-based UI** - Elementos ocultos baseado em permissoes (nao desabilitados)
3. **Dark mode completo** - Suporte total com CSS variables
4. **Componentes padronizados** - shadcn/ui garante consistencia
5. **Cards semanticos (GlowCard)** - Barra colorida no topo comunica status visualmente
6. **Drag-drop intuitivo** - Pipeline, Board e Onboarding usam kanban nativo
7. **Multi-tenant** - Isolamento de dados por organizacao no server-side
8. **Integracao Asaas** - Criacao automatica de clientes no sistema financeiro

---

## 7. Analise de Usabilidade - Problemas Identificados

### 7.1 Arquitetura de Informacao

| # | Problema | Impacto | Paginas Afetadas |
|---|---------|---------|-----------------|
| 1 | **Reports e Report Jobs separados na navegacao** - O usuario precisa entender a diferenca entre "Reports" (lista de reports) e "Report Jobs" (historico de geracao). Sao conceitos interligados mas aparecem como itens independentes. | Confusao na navegacao | `/reports`, `/report-jobs` |
| 2 | **Dashboard Operacional como rota separada** - Seria melhor como uma tab ou toggle dentro do dashboard principal, em vez de uma rota distinta. | Fragmentacao | `/dashboard`, `/dashboard/operational` |
| 3 | **Ferramentas (Tools) escondidas no rodape** - Geradores de IA e calculadoras sao features de valor mas ficam em posicao de baixa visibilidade. | Baixa descoberta | `/tools` |
| 4 | **Settings com 10 sub-paginas** - Muitas opcoes de configuracao que poderiam ser consolidadas em menos telas. | Fragmentacao | `/settings/*` (10 paginas) |
| 5 | **Onboarding esta em "Operacional" mas e fortemente ligado a Lojas** - O fluxo de onboarding e por loja, mas fica separado na hierarquia. | Desconexao logica | `/onboarding`, `/stores/[id]` |

### 7.2 Consistencia Visual

| # | Problema | Impacto | Local |
|---|---------|---------|-------|
| 6 | **Duas cores primarias conflitantes** - `#3B82F6` (UI components) vs `#05AFF2` (brand/portal). A marca usa cyan mas a UI usa blue padrao. | Identidade visual diluida | Global |
| 7 | **GlowCard vs Card padrao** - Mistura de cards com barra colorida e cards simples sem criterio claro de quando usar cada um. | Inconsistencia visual | Dashboards, listas |
| 8 | **Sidebar escura (#0d1117) desconectada do tema** - A sidebar tem cores hardcoded que nao mudam entre light/dark, criando contraste diferente em cada modo. | Experiencia inconsistente | Layout admin |

### 7.3 Fluxos do Usuario

| # | Problema | Impacto | Fluxo |
|---|---------|---------|-------|
| 9 | **Gerar report exige navegar para Lojas** - O botao "Gerar via Painel de Lojas" na pagina de Reports redireciona para outra secao. O usuario perde contexto. | Fluxo quebrado | Reports → Stores → Gerar |
| 10 | **Campanhas com 3 views diferentes em tabs** - Calendario, Performance e Copy sao views muito distintas agrupadas. Copy (geracao de conteudo) nao e uma "view" de campanha. | Sobrecarga cognitiva | `/campaigns` |
| 11 | **Editar cliente requer navegacao: Lista → Detalhe → Editar** - 3 cliques para chegar a edicao. Nao ha edicao inline ou acesso rapido. | Friccao | Clientes |
| 12 | **Sem breadcrumbs consistentes** - Algumas paginas tem breadcrumb, outras nao. Navegacao de volta inconsistente. | Desorientacao | Diversas |

### 7.4 Densidade de Informacao

| # | Problema | Impacto | Pagina |
|---|---------|---------|--------|
| 13 | **Dashboard principal com 6 secoes simultaneas** - Reunioes, atividades, tarefas, calendario, onboardings e alertas tudo na mesma tela. Muito para processar. | Sobrecarga | `/dashboard` |
| 14 | **Detalhe do cliente com 5 tabs** - Overview, Pedidos, Reports, Atividades, Contatos. Muita informacao fragmentada em tabs. | Navegacao excessiva | `/clients/[id]` |
| 15 | **Financeiro com 4 tabs heterogeneas** - Analise, Cobrancas, Assinaturas, Wise sao modulos muito diferentes agrupados. | Complexidade | `/financial` |

### 7.5 Responsividade e Mobile

| # | Problema | Impacto | Local |
|---|---------|---------|-------|
| 16 | **Kanban boards nao sao ideais em mobile** - Pipeline e Board usam scroll horizontal que e dificil de operar em telas pequenas. | UX mobile ruim | `/pipeline`, `/board` |
| 17 | **Sidebar oculta em mobile** - Sem indicacao visual clara de como acessar a navegacao. | Navegabilidade | Layout admin |

---

## 8. Mapa de Conexoes entre Paginas

```
                    ┌─────────────┐
                    │  Dashboard  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼─────┐ ┌───▼────┐
        │ Clientes │ │  Board   │ │Reunioes│
        └─────┬────┘ └────┬─────┘ └───┬────┘
              │            │           │
        ┌─────▼────┐      │           │
        │  Lojas   │◄─────┘           │
        └─────┬────┘                  │
              │                       │
     ┌────────┼────────┐              │
     │        │        │              │
┌────▼───┐ ┌─▼──────┐ ┌▼──────────┐  │
│Pipeline│ │Reports │ │Onboarding │  │
└────────┘ └───┬────┘ └───────────┘  │
               │                     │
          ┌────▼─────┐               │
          │Report Jobs│              │
          └──────────┘               │
                                     │
        ┌────────────┐               │
        │ Campanhas  │◄──────────────┘
        └─────┬──────┘
              │
        ┌─────▼──────┐
        │ Automacoes │
        └────────────┘

LATERAL:
┌───────────┐     ┌──────────┐
│Financeiro │     │  Equipe  │
└───────────┘     └──────────┘
       │                │
       └───►  Clientes ◄┘ (ambos referenciam clientes)

┌──────────────┐
│Configuracoes │→ Perfil, Empresa, Usuarios, Permissoes,
└──────────────┘  Campos Custom, Tags, Templates, Integracoes
```

---

## 9. Resumo por Area

### Dashboard
- **Estado:** Funcional mas sobrecarregado
- **Metricas mostradas:** Reunioes proximas, atividades recentes, tarefas ativas, calendario semanal, onboardings, alertas
- **Falta:** KPIs de alto nivel (MRR, churn rate, total de clientes ativos), graficos de tendencia

### CRM (Clientes + Lojas)
- **Estado:** Mais maduro, com filtros e paginacao
- **Pontos fortes:** Health score visual, status tabs, integracao Asaas
- **Falta:** Busca global rapida, edicao inline, bulk actions

### Pipeline
- **Estado:** Funcional com drag-drop
- **Pontos fortes:** Kanban visual intuitivo
- **Falta:** Metricas de conversao entre estagios, valor total por estagio visivel

### Marketing (Campanhas + Automacoes)
- **Estado:** Feature-rich mas complexo
- **Pontos fortes:** Calendario visual, sync Klaviyo, geracao de copy
- **Falta:** Metricas de performance integradas, view unificada

### Financeiro
- **Estado:** Funcional com 4 modulos
- **Pontos fortes:** Metricas, graficos, integracao Wise
- **Falta:** Dashboard financeiro resumido antes das tabs

### Reports
- **Estado:** Funcional mas fluxo fragmentado
- **Pontos fortes:** Historico, retry em falhas
- **Falta:** Geracao direta sem sair da pagina, preview inline

---

## 10. Recomendacoes Prioritarias para Redesign

### Alta Prioridade
1. **Unificar cor primaria** - Decidir entre `#3B82F6` e `#05AFF2` e usar consistentemente
2. **Redesenhar Dashboard** - Adicionar KPIs de alto nivel + reduzir densidade
3. **Consolidar Reports + Report Jobs** em uma unica pagina com tabs
4. **Adicionar breadcrumbs consistentes** em todas as paginas
5. **Melhorar fluxo de geracao de reports** sem sair da pagina

### Media Prioridade
6. **Mover Tools para posicao mais visivel** na sidebar
7. **Adicionar atalhos/quick actions** no Dashboard (ex: novo cliente, nova reuniao)
8. **Separar Copy Generator** de Campanhas (e uma ferramenta, nao uma view)
9. **Consolidar Settings** - reduzir de 10 para ~5 paginas
10. **Melhorar mobile** - views alternativas para Kanban em telas pequenas

### Baixa Prioridade
11. **Adicionar onboarding tour** para novos usuarios do admin
12. **Busca global** (Command Palette ja existe, mas precisa ser mais visivel)
13. **Notificacoes inline** no header em vez de pagina separada
14. **Graficos de tendencia** em mais paginas (clientes, pipeline)

---

## 11. Metricas Atuais do Sistema

| Metrica | Valor |
|---------|-------|
| Total de paginas admin | ~33 |
| Total de paginas client portal | ~14 |
| Total de paginas auth | 5 |
| Profundidade maxima de navegacao | 4 niveis (Clients → Detail → Edit → Save) |
| Componentes UI compartilhados | ~25 (shadcn/ui) |
| Componentes custom | ~40+ (dashboard, layout, domain-specific) |
| Breakpoints responsivos | 5 (sm, md, lg, xl, 2xl) |
| Features com permissao | ~10 flags distintos |

---

*Este documento serve como baseline para o redesign do portal admin. Todas as melhorias devem ser priorizadas com base no impacto ao usuario e alinhamento com os objetivos de negocio da Convertfy.*
