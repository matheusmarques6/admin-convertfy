# CRM Convertfy

CRM nativo (nao paralelo) integrado ao admin-convertfy. Compartilha tabelas
`clients`, `client_stores` e `profiles` com o restante do produto — deals
referenciam clientes/lojas via FK, nunca duplicam dados.

## Escopos

| Scope | Pipelines | Uso |
|-------|-----------|-----|
| `sales` | Inbound, Outbound, Indicacoes | Aquisicao comercial |
| `cs` | Onboarding 30d, Gestao de Carteira, Feedback Mensal, Tickets, Implementacoes | Customer Success |
| `internal` | (futuro) | Operacional interno |

## Arquitetura

- **Tabelas estendidas**: `pipelines`, `pipeline_stages`, `deals` ganharam
  campos para CRM (scope, layout, stage_type, lead_id, status, lost/won_reason,
  position, etc).
- **Tabelas novas**: `crm_leads`, `crm_contacts`, `crm_partners`,
  `crm_deal_history`, `crm_deal_activities`, `crm_deal_tags`,
  `crm_health_history`.
- **Triggers**: stage change atualiza `last_stage_changed_at`, escreve em
  `crm_deal_history` e cria activity de timeline automaticamente.
- **API routes**: `/api/crm/{pipelines,deals,leads}/...` usando `createAdminClient`
  + Zod. Padrao identico ao restante do projeto (errorResponse/successResponse).

## Layouts de pipeline

- `kanban` — colunas por estagio, drag-and-drop linear (default).
- `state` — estagios paralelos como estados (ex: Gestao de Carteira tem
  ATIVO / EM_RISCO / CHURN_PREVISTO etc — uma loja move entre estados, nao
  avanca em sequencia).

## Design System

Tokens em `src/styles/crm-tokens.css` (prefixo `--crm-*` para nao colidir
com Tailwind do admin). Regras nao-negociaveis:

- Border-radius **4-6px** (nunca 8px).
- Brand **PRETO** (#1F1F1F), nunca azul/roxo.
- Densidade alta — cards 280px, table-row 36px, input/button 32px.
- Cinzas dominam (80% da UI), cores semanticas escassas (success/warning/
  danger/info usados pontualmente).
- Sem sombras grandes — borders, nao shadows.
- Tipografia: Geist (com Inter como fallback) + Geist Mono.

## Roadmap

| Fase | Status | Entrega |
|------|--------|---------|
| 1 — Fundacao | ✅ | Migrations + APIs + design tokens + sidebar + placeholders |
| 2 — Sales | ✅ | Kanban + ficha drawer + new deal/lead + dashboard sales + Cmd+K |
| 3 — Customer Success | ✅ | StateBoard + CS dashboard + health auto + NPS endpoint |
| 4 — Multiatendimento | ✅ | WhatsApp Cloud API webhook + inbox UI + channels admin |
| 5 — Automacao + IA | ✅ | DAG executor + AI Actions (Anthropic) + ReactFlow builder + trigger dispatch |
| 6 — BI snapshot-first | ✅ | Cron diario + 3 tabelas de snapshots + reports com 6 charts + export CSV |
| 7 — Polimento | ✅ | Atalhos g+letra + lead conversion wizard + lost reason dialog |

## Referencias

- `ARQUITETURA_CRM_CONVERTFY.md` — modelo de dados
- `PIPELINES_AGENCIA_CONVERTFY.md` — 8 pipelines pre-configurados
- `UI_UX_DESIGN_SYSTEM.md` — tokens e regras de UI
