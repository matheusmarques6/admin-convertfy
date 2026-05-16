# Prompt: Integração n8n Analisador de ADS → Admin Briefing

> Prompt para gerar a documentação de implementação da integração entre o
> workflow n8n `Analisador de ADS` e a área de briefing do admin-convertfy.
> Use este arquivo como input para uma nova sessão Claude Code que vá
> escrever o ADR + plano técnico antes de codificar.

---

## Contexto resumido

Existe um workflow n8n chamado **Analisador de ADS** (id `poXnErms4DlklW2v`,
webhook path `ads-analyze-convertfy`) que é disparado pelo evento
`client.created` do admin. Ele faz lookup do site da loja na **TrendTrack
API**, coleta dados ricos (signals, shop details, top produtos, redes
sociais, demografia, ads do anunciante, páginas Meta) e gera um briefing
em markdown via Claude Haiku 4.5 (OpenRouter).

Hoje o workflow termina em `Respond to Webhook` — o resultado é retornado
síncrono, mas **nada é persistido** no admin-convertfy. Queremos mudar
isso: o n8n deve fazer **callback assíncrono** via `POST` para
endpoints do admin, que persistem cada seção do briefing na área certa.

### Decisões já tomadas (não revisitar)

1. **Padrão assíncrono (callback)**, não síncrono via `Respond to Webhook`.
   Motivo: o pipeline n8n leva 30-120s (6-8 chamadas TrendTrack + LLM) e
   webhooks síncronos sofrem timeout do Vercel (10-60s). Diferença de
   custo entre sync/async é desprezível (~R$ 0,10 por briefing, dominado
   por Claude Haiku + TrendTrack — o POST extra é tráfego interno).

2. **Um endpoint por área do briefing**, não um único endpoint monolítico.
   Motivo: o n8n tem branches (mode `full`, `reduced-enriched`, `reduced`)
   que produzem subconjuntos diferentes de dados; cada branch pode chamar
   só os endpoints relevantes; falha em uma área não derruba as outras;
   reprocessamento granular fica trivial.

3. **Autenticação via header `x-secret`** com `crypto.timingSafeEqual`,
   seguindo o padrão de `src/app/api/webhooks/n8n/briefing-generated/route.ts`
   e `src/lib/api/n8n-auth.ts`. Variável de ambiente: `N8N_WEBHOOK_SECRET`.

---

## Arquitetura atual (mapeamento confirmado)

### Tabelas relevantes

| Tabela | Chave | Uso |
|---|---|---|
| `clients` | `id` | Cliente raiz (org-level) |
| `client_stores` | `id`, FK `client_id` | **Loja** — destino primário do briefing |
| `store_briefings` | `id`, FK `store_id` | Briefing JSONB versionado (já existe, schema em `supabase/migrations/20260220_store_onboarding_system.sql`) |
| `client_stores` (colunas Pesquisa) | mesmas | Pilares editoriais — `brand_*`, `store_*`, `icp_*`, `tone_*`, `ads_*` (migration `supabase/migrations/20260516000000_pesquisa_diagnostico.sql`) |
| `onboardings` | `id` | Onboarding step-flow (NÃO confundir com briefing — é outro escopo) |

**Briefing é por LOJA** (`client_stores.id`), não por cliente. O webhook
`client.created` que dispara o n8n manda `client.website` — o admin
precisa garantir que cada loja criada tenha um `client_stores` antes do
n8n callback chegar (provavelmente já tem; verificar).

### Áreas do briefing no admin

UI em `/admin/stores/[id]?tab=contexto`, componente
`src/components/stores/v2/tab-contexto.tsx`. Subdivide em:

| Área (UI) | Componente | Storage |
|---|---|---|
| Briefing operacional (7 campos) | `store-briefing-tab.tsx` + `store-briefing-view.tsx` | `store_briefings.briefing_data` JSONB |
| Pesquisa - Perfil da Marca | `pesquisa/pesquisa-section.tsx` + `editors/edit-marca.tsx` | `client_stores.brand_*` |
| Pesquisa - Sobre a Loja | `editors/edit-loja.tsx` | `client_stores.store_*` |
| Pesquisa - Cliente Ideal (ICP) | `editors/edit-icp.tsx` | `client_stores.icp_*` |
| Pesquisa - Tom de Comunicação | `editors/edit-tom.tsx` | `client_stores.tone_*` |
| Pesquisa - Review de Anúncios | `ads-review/regenerate` | `client_stores.ads_*` |

### Saída do n8n (Analisador de ADS)

Do nó `Juntar Tudo` (Code node), o JSON estruturado tem:

```jsonc
{
  "capturedAt": "ISO timestamp",
  "domain": "shopbellaluce.online",
  "mode": "full" | "reduced-enriched" | "reduced",
  "ids": { "shopId", "brandtrackerId", "advertiserId" },
  "signals": { "hasShop", "hasAdvertiser", "hasBrandtracker", "activeAds", "monthlyVisits" },
  "shop": { "domain", "platform", "shopifyPlus", "technologies[]", "traffic", "trustpilot", "socials" },
  "brandtracker": { "kpis", "lastUpdatedAt" } | null,
  "audience": { "gender", "age", "countries" } | null,
  "topProducts": [ /* até 5 produtos */ ],
  "socialsGrowth": [ /* histórico 30d */ ] | null,
  "metaPagesLinked": [ /* páginas Meta */ ] | null,
  "advertiserTopAds": [ /* top 10 ads */ ] | null,
  "telemetry": { "creditsRemaining", "totalCostThisBriefing" }
}
```

E do nó `AI Agent`, o markdown final com seções: Snapshot, Stack &
Maturidade, Tráfego & Aquisição, Audiência (só `full`), Catálogo,
Estratégia Paga (omitida se sem ads).

---

## A tarefa: gerar a documentação

Você é arquiteto de software trabalhando no admin-convertfy. Sua entrega
é um **ADR + plano de implementação** que descreve, com precisão
suficiente para outro dev pegar e implementar sem ambiguidade:

### 1. ADR (`docs/architecture/adr-n8n-ads-analyzer-callback.md`)

Estrutura: Context → Decision → Consequences. Cubra:

- Por que callback assíncrono e não sync (resumir custo, timeout,
  resiliência — não refazer a análise, só registrar a decisão).
- Por que múltiplos endpoints (um por área) e não um monolito.
- Como funcionará idempotência (sugestão: o n8n manda `execution_id` +
  `store_id`; o endpoint usa upsert com `ON CONFLICT (store_id,
  execution_id, section)` ou versiona via tabela própria).
- Trade-off explícito: se uma área falhar, as outras seguem — aceitamos
  estado parcial e a UI precisa lidar com isso.
- Janela de retry no n8n: 3 tentativas com backoff (2s, 8s, 32s) por
  endpoint.

### 2. Plano de implementação (`docs/architecture/n8n-ads-analyzer-integration-plan.md`)

#### 2.1 Tabela de tracking

Nova tabela `store_intel_runs` (ou nome melhor — propor 2 opções):

```sql
id uuid pk
store_id uuid fk client_stores(id) on delete cascade
execution_id text not null  -- $execution.id do n8n
mode text not null check (mode in ('full', 'reduced-enriched', 'reduced'))
status text not null check (status in ('running', 'partial', 'completed', 'failed'))
started_at timestamptz not null default now()
completed_at timestamptz
sections_received jsonb not null default '[]'::jsonb  -- ['snapshot', 'stack', ...]
telemetry jsonb  -- creditsRemaining, totalCostThisBriefing
error_log jsonb default '[]'::jsonb  -- array de erros por seção
raw_payload jsonb  -- snapshot bruto do "Juntar Tudo" pra reprocessamento offline
created_at timestamptz default now()
updated_at timestamptz default now()

unique (store_id, execution_id)
```

Justificar cada coluna. Definir RLS. Definir índices
(`store_id`, `status`, `(store_id, completed_at desc)`).

#### 2.2 Endpoints a criar

Cada endpoint deve ser documentado com: path, método, headers obrigatórios,
body schema (Zod-style), código de resposta, side-effects (qual tabela/coluna
escreve), e mapeamento campo n8n → coluna admin.

Lista mínima (propor mais se fizer sentido):

| Endpoint | Origem n8n (mode) | Destino |
|---|---|---|
| `POST /api/webhooks/n8n/ads-analyzer/start` | Sempre | Cria row em `store_intel_runs` com `status=running`; retorna `run_id` |
| `POST /api/webhooks/n8n/ads-analyzer/shop` | `Detalhes da Loja` → Juntar Tudo | Persiste `client_stores.platform`, `shopify_plus`, `technologies`, monta `store_*` |
| `POST /api/webhooks/n8n/ads-analyzer/traffic` | `shop.traffic` + `socialsGrowth` | Nova coluna ou tabela `store_traffic_intel` (decidir e justificar) |
| `POST /api/webhooks/n8n/ads-analyzer/products` | `Produtos` | Tabela `store_top_products` (id, store_id, rank, title, price, handle, captured_at) |
| `POST /api/webhooks/n8n/ads-analyzer/audience` | `Demografia` (só `full`) | `client_stores.icp_demographics` + nova coluna `icp_countries` se necessário |
| `POST /api/webhooks/n8n/ads-analyzer/brand-kpis` | `Rastreamento de Marca` (só `full`) | Nova tabela `store_brand_kpis` (snapshot histórico) |
| `POST /api/webhooks/n8n/ads-analyzer/ads` | `Advertiser Ads` + `metaPagesLinked` (só `reduced-enriched`) | `client_stores.ads_*` (reaproveitar schema do ads-review existente) |
| `POST /api/webhooks/n8n/ads-analyzer/briefing-markdown` | `AI Agent` (markdown final) | `store_briefings.briefing_data.raw_text` ou nova coluna `executive_summary` |
| `POST /api/webhooks/n8n/ads-analyzer/complete` | Final do workflow | Atualiza `store_intel_runs.status = completed` ou `partial`, salva `telemetry` |

Para cada endpoint, descrever também: o que fazer se `store_id` não
existir (404 vs criação lazy via `domain` lookup), e como tratar
duplicatas (deve ser idempotente — mesma execution_id + section = no-op
ou update).

#### 2.3 Alterações no workflow n8n

Listar nó por nó o que muda:

- Logo após `IDS` (se `hasShop=true`), inserir HTTP Request →
  `/start` para criar o `run`.
- Após cada nó de dado (`Detalhes da Loja`, `Produtos`, `Demografia`,
  etc.), inserir HTTP Request para o endpoint correspondente.
- Após `AI Agent`, chamar `/briefing-markdown`.
- Antes do `Respond to Webhook` (que vira opcional, só pra debug),
  chamar `/complete`.
- Cada HTTP Request deve usar a credencial de header `x-secret` com o
  valor de `N8N_CALLBACK_SECRET` (env do n8n).
- Configurar retry no nó: 3 tentativas, backoff exponencial.
- Branch de erro global → endpoint `/error` que marca o run como
  `failed` com a mensagem.

#### 2.4 Mudanças na UI

- `tab-contexto.tsx` deve mostrar um banner "Análise inicial em
  andamento..." enquanto `store_intel_runs.status = running` (polling
  cada 5s OU realtime via Supabase channel).
- Quando `completed`, badge "Análise concluída" + timestamp; quando
  `partial`, mostrar quais seções faltaram + botão "reprocessar".
- Botão "Forçar nova análise" que chama o webhook do n8n manualmente
  (`POST` para o webhook do n8n com o `store_id`).

#### 2.5 Variáveis de ambiente

Listar todas, com exemplo e onde configurar:

- `N8N_WEBHOOK_SECRET` (já existe — reusar)
- `N8N_ADS_ANALYZER_WEBHOOK_URL` (novo — usado pelo botão "forçar
  análise")

#### 2.6 Segurança

- Validação `x-secret` em todos os endpoints — usar helper existente
  `requireWebhookSecret` de `src/lib/api/n8n-auth.ts`.
- Rate limiting? (Avaliar — provavelmente desnecessário pois é
  internal-only com secret, mas registrar a decisão.)
- Sanitização do markdown (DOMPurify no front antes de renderizar).
- Não logar o `raw_payload` em produção (PII potencial — emails de
  customers nos top products).

#### 2.7 Plano de rollout

1. Migration da tabela `store_intel_runs` (+ índices + RLS).
2. Endpoints (TDD: escrever um teste de integração por endpoint usando
   o pattern existente do projeto).
3. Atualizar workflow n8n em ambiente de staging.
4. Smoke test: criar uma loja de teste e validar que todas as seções
   chegam.
5. Atualizar UI.
6. Deploy + observabilidade (Supabase logs + log estruturado nos
   endpoints).

### 3. Checklist de aceitação

Lista de critérios verificáveis que confirmam que a integração está
pronta:

- [ ] Criar uma loja com `website` válido dispara o n8n.
- [ ] `store_intel_runs` recebe row com `status=running` em <5s.
- [ ] Em modo `full`, todas as 7 seções chegam e status vira
      `completed`.
- [ ] Em modo `reduced`, status vira `partial` (sem brandtracker/ads).
- [ ] Re-disparar com mesmo `execution_id` não duplica dados.
- [ ] Falha em uma seção (ex: simular 500 em `/products`) não impede
      as outras de completarem.
- [ ] UI mostra estado em tempo real.
- [ ] Markdown renderiza sem XSS.

---

## Regras de qualidade da entrega

- **Não escrever código** ainda — apenas documentação.
- **Citar arquivos existentes** com `path:line` quando referenciar
  padrões do projeto.
- **Não inventar** colunas/endpoints que o projeto não tem — se algo
  for ambíguo, listar como "decisão pendente" no final do ADR.
- **Português brasileiro**, tom técnico direto, sem floreios.
- **Markdown limpo**, sem emojis.
- Mencionar o workflow n8n exato (`poXnErms4DlklW2v`,
  `ads-analyze-convertfy`) e nomes dos nós (`Juntar Tudo`,
  `AI Agent`, etc.) quando relevante.

Comece lendo:
- `docs/architecture/n8n-api-integration.md` (padrão existente)
- `src/app/api/webhooks/n8n/briefing-generated/route.ts` (template do endpoint)
- `src/lib/api/n8n-auth.ts` (helper de auth)
- `supabase/migrations/20260220_store_onboarding_system.sql` (schema referência)
- `supabase/migrations/20260516000000_pesquisa_diagnostico.sql` (colunas pesquisa)
- `src/components/stores/v2/tab-contexto.tsx` (UI atual)

E o JSON do workflow original em
`/root/.claude/uploads/a333f6e8-82ba-4076-a0bc-c4e677f59525/93f32644-Analisador_de_ADS.json`
(se disponível) ou pedir ao usuário.

Entregue os dois arquivos no final.
