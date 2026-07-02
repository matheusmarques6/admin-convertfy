# Documentação de Arquitetura — admin-convertfy

## Specs do sistema (gerados 2026-07-02)

| Documento | Conteúdo |
|---|---|
| [system-overview.md](./system-overview.md) | **Visão geral**: o que é o sistema, stack, camadas, auth/RBAC, cache, async, env vars, segurança, deploy |
| [data-model.md](./data-model.md) | **Modelo de dados**: ~220 tabelas em 11 domínios, relações, padrões (versionamento, event sourcing, filas, RLS) |
| [design-system.md](./design-system.md) | **Design system**: tokens (cores/tipografia/radius/motion), regras não-negociáveis, 61 componentes UI, temas, áreas visuais |
| [frontend-map.md](./frontend-map.md) | **Frontend**: áreas (admin 3 workspaces, portal, público, tracking), navegação, padrões (SWR, RHF+Zod), UX global |
| [integracoes-consumidas.md](./integracoes-consumidas.md) | **APIs consumidas**: Shopify, Klaviyo, Omnisend, Asaas, Meta/WhatsApp/Instagram, Google, Wise, n8n, Anthropic/OpenRouter/OpenAI, Resend, tracking multi-carrier |
| [../api/README.md](../api/README.md) | **APIs expostas**: mapeamento das ~330 rotas (auth, params, rate limit) + lacunas para API pública |

## ADRs e decisões

- [adr-agent-email-generation.md](./adr-agent-email-generation.md) — Epic AE (geração de emails por agentes)
- [adr-klaviyo-revenue-source.md](./adr-klaviyo-revenue-source.md) — receita total via Metric Aggregates vs Reporting API

## Pipelines e operação

- [pipeline-geracao-emails.md](./pipeline-geracao-emails.md) — pipeline dos 8 agentes
- [inventario-agentes-ia.md](./inventario-agentes-ia.md) — inventário de todos os agentes de IA
- [fallbacks-geracao-emails.md](./fallbacks-geracao-emails.md) — fallbacks do pipeline
- [n8n-api-integration.md](./n8n-api-integration.md) — contrato com o n8n
- [cache-strategy.md](./cache-strategy.md) — estratégia de cache multi-camada
- [agent-email-generation-setup.md](./agent-email-generation-setup.md) / [pending-migrations](./agent-email-generation-pending-migrations.md) — setup do Epic AE
- [onboarding-board-sync.md](./onboarding-board-sync.md) — sync onboarding↔board
- [refund-processing-architecture.md](./refund-processing-architecture.md) — reembolsos
- [diagnostico-performance-2026-07.md](./diagnostico-performance-2026-07.md) — diagnóstico de performance

## Documentação relacionada

- `docs/crm/` — CRM nativo (design system do CRM, fases)
- `docs/email-generation/` — Epic AE detalhado
- `docs/integrations/` — guias de integração
- `docs/prd/`, `docs/stories/`, `docs/specs/` — requisitos e histórias
