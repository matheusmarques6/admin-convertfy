# Epic 20 - Gerador de Campanhas (Copy Generation)

**Status:** Ready
**Prioridade:** P1 (Feature nova - Portal)
**Sprint:** Backlog

---

## Contexto

O portal precisa de uma feature para gerar copies de campanhas de email marketing automaticamente via n8n. O fluxo e: o usuario do portal cria uma campanha selecionando lojas, o sistema dispara um webhook para o n8n que gera as copies e retorna via callback. O frontend faz polling de status a cada 5s para mostrar o progresso em tempo real.

A feature vive como sub-aba "Gerar Copies" em `/portal/campaigns/gerar`.

## Arquitetura

### Banco de Dados
- `campaign_generations` (id, client_id, name, date, reference_doc_url, drive_folder_id, drive_folder_url, status, created_at, updated_at)
- `campaign_generation_stores` (id, generation_id, store_id, status, version, error_message, generated_at, created_at)
- Status campanha: `draft | processing | done`
- Status loja: `pending | generating | done | error`

### API Routes
- `POST /api/campaigns/generate` - Cria campanha + dispara webhook n8n
- `POST /api/campaigns/webhook-callback` - Recebe callback do n8n (valida x-webhook-secret)
- `GET /api/campaigns/generate/[id]` - Polling de status

### Seguranca
- webhook-callback valida `x-webhook-secret` contra `N8N_WEBHOOK_SECRET`
- Queries filtram por `client_id` do portal user (multi-tenant)
- `adminClient` para writes (contorna RLS)

### Env vars
- `N8N_CAMPAIGNS_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` (ja existente — usado para montar callback_url)

### Definition of Done (por story)
- [ ] Typecheck passa: `npm run typecheck`
- [ ] Lint passa: `npm run lint`
- [ ] Testes TDD passam (quando aplicavel): `npm run test`
- [ ] Story checklist marcada
- [ ] Env vars registradas em `.env.example` (se novas)

## Stories

| Story | Titulo | Prioridade | Status | Fase |
|-------|--------|------------|--------|------|
| 20.1 | Zod Schemas para Campaign Generation | P0 | Ready | Schemas |
| 20.2 | Migrations Supabase (tabelas + indices) | P0 | Ready | DB |
| 20.3 | POST /api/campaigns/generate (criar + regenerar + webhook n8n) | P0 | Ready | API |
| 20.4 | POST /api/campaigns/webhook-callback (callback n8n) | P0 | Ready | API |
| 20.5 | GET /api/campaigns/generate/[id] (polling status) | P0 | Ready | API |
| 20.6 | Componente Seletor de Lojas com filtros | P1 | Ready | UI |
| 20.7 | Formulario de criacao de campanha | P1 | Ready | UI |
| 20.8 | Historico de campanhas com expand de lojas | P1 | Ready | UI |
| 20.9 | Polling de status + toasts + modal adicionar lojas | P1 | Ready | UI |

## Dependencias entre Stories

```
20.1 (schemas) --> 20.3, 20.4, 20.5
20.2 (migrations) --> 20.3, 20.4, 20.5
20.3 + 20.4 + 20.5 (APIs) --> 20.7, 20.8, 20.9
20.6 (seletor lojas) --> 20.7
20.7 (formulario) --> 20.8, 20.9
```

## Testes TDD (ja escritos)

| Arquivo de Teste | Cobertura | Story |
|------------------|-----------|-------|
| `src/lib/schemas/campaign-generation.test.ts` | 18 testes — schemas Zod generate + callback | 20.1 |
| `src/app/api/campaigns/generate/route.test.ts` | 20 testes — validacao, auth, criacao, regeneracao, webhook dispatch | 20.3 |
| `src/app/api/campaigns/webhook-callback/route.test.ts` | 13 testes — seguranca, validacao, all done, partial errors | 20.4 |
| `src/app/api/campaigns/generate/[id]/route.test.ts` | 6 testes — auth, success responses, polling | 20.5 |

## Metricas de Sucesso

- [ ] Todos os 57 testes TDD passando (18 + 20 + 13 + 6)
- [ ] Usuario portal consegue criar campanha e ver status em tempo real
- [ ] Webhook n8n recebe payload correto e callback atualiza status
- [ ] Multi-tenant isolation: usuario so ve campanhas do proprio client
- [ ] Regeneracao incrementa version e dispara novo webhook

---

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-03-05 | Epic criado com 9 stories baseado em PRD + testes TDD | @sm |
