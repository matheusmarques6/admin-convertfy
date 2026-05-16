# Prompt: Integração n8n Analisador de ADS → Briefing (todas as seções)

> Prompt para gerar a documentação de implementação. Use este arquivo
> como input para uma nova sessão Claude Code que vá escrever o ADR +
> plano técnico antes de codificar.

---

## Contexto

Workflow n8n **Analisador de ADS** (id `poXnErms4DlklW2v`, webhook path
`ads-analyze-convertfy`) é disparado pelo evento `client.created` do
admin-convertfy. Faz lookup do site na **TrendTrack API**, coleta dados
ricos (signals, shop details, top produtos, redes sociais, demografia,
ads do anunciante, páginas Meta) e gera briefing em markdown via Claude
Haiku 4.5 (OpenRouter).

Hoje o workflow termina em `Respond to Webhook` e **nada é persistido**
no admin. Queremos mudar: o n8n faz **callback assíncrono** para
endpoints do admin, que persistem **cada seção do briefing na área
correta da aba Contexto** da loja
(`src/components/stores/v2/tab-contexto.tsx`).

### Decisões já tomadas (não revisitar)

1. **Callback assíncrono**, não sync via `Respond to Webhook`. Motivo:
   pipeline n8n leva 30-120s (6-8 chamadas TrendTrack + LLM) e webhook
   síncrono sofre timeout do Vercel.
2. **Um endpoint por seção do briefing**, não monolito. Motivo: o n8n
   tem branches (`full` / `reduced-enriched` / `reduced`) que produzem
   subconjuntos diferentes dos dados; endpoints independentes isolam
   falhas e permitem reprocessamento granular.
3. **Auth via header `x-secret`** com `crypto.timingSafeEqual`,
   reaproveitando `requireWebhookSecret` em `src/lib/api/n8n-auth.ts`.
   Variável: `N8N_WEBHOOK_SECRET` (já existe).
4. **Diferença de custo entre sync/async é desprezível** (~R$ 0,10 por
   briefing, dominado por Claude Haiku + TrendTrack). Não revisitar.
5. **Idempotência por sobrescrita**: cada endpoint sobrescreve o estado
   atual da loja (não há tabela de tracking, não há histórico
   versionado nesta fase — exceção: `store_briefings` que já tem
   versionamento próprio). Aceitar trade-off: perde-se snapshot
   temporal das outras seções.

---

## Mapeamento das seções do n8n → áreas do admin

Resultado da análise do código atual em
`claude/store-data-briefing-integration-IDfaB`:

| # | Seção n8n | Dados (origem em `Juntar Tudo`) | Destino no admin | Status |
|---|---|---|---|---|
| 1 | **Snapshot** | Markdown gerado pelo `AI Agent` — 2-3 linhas com posicionamento e momento da marca | `client_stores.brand_thesis` (text) | ✅ Coluna existe (`20260516_pesquisa_diagnostico.sql:7`) |
| 2 | **Stack & Maturidade** | `shop.technologies[]`, `shop.platform`, `shop.shopifyPlus` | **Criar** `client_stores.tech_stack` (jsonb) ou tabela `store_technologies` | ⚠️ Destino ausente |
| 3 | **Tráfego & Aquisição** | `signals.monthlyVisits`, `shop.traffic.sources`, `shop.traffic.topCountries`, `socialsGrowth` | **Criar** `client_stores.traffic_metrics` (jsonb) — ou colunas separadas: `monthly_visits int`, `traffic_sources jsonb`, `top_countries text[]`, `socials_growth_30d jsonb` | ⚠️ Destino ausente |
| 4 | **Audiência** | `audience.gender`, `audience.age`, `audience.countries` (só mode `full`) | `client_stores.icp_demographics` (jsonb — estender com `gender` e `countries`) | ⚠️ Parcial — coluna existe mas precisa estender schema do JSONB |
| 5 | **Top Produtos** | `topProducts[]` (até 5 itens com title, price, handle, rank) | **Criar** tabela `store_top_products` | ⚠️ Destino ausente |
| 6 | **Estratégia Paga** | `signals.activeAds`, `metaPagesLinked`, `advertiserTopAds` + markdown da seção do AI Agent | `client_stores.ads_*` (pilar 5 da Pesquisa) | ✅ Colunas existem |
| 7 | **Briefing markdown completo** | Output completo do nó `AI Agent` | `store_briefings.briefing_data` (jsonb) — campo `raw_text` ou seção dedicada | ✅ Tabela existe (`20260220_store_onboarding_system.sql`) |

### Componentes UI que vão renderizar

- Snapshot → `pesquisa-section.tsx` (campo "Tese da marca")
- Stack → seção a criar no `tab-contexto.tsx` (ou estender "Operação &
  catálogo" linha 208)
- Tráfego → seção nova "Tráfego & aquisição" no `tab-contexto.tsx`
- Audiência → `pesquisa-section.tsx` (pilar ICP, já renderiza
  `icp_demographics` via `DemoFact`)
- Top Produtos → editar "Operação & catálogo"
  (`tab-contexto.tsx:208`) para listar os produtos abaixo dos KPIs
- Estratégia Paga → `pesquisa-section.tsx` (pilar 5, já renderiza)
- Briefing markdown → `store-briefing-view.tsx` (renderização atual de
  `BriefingData` precisa acomodar `raw_text` markdown)

---

## A tarefa

Você é arquiteto trabalhando no admin-convertfy. Entrega: **um ADR + um
plano de implementação**.

### 1. ADR (`docs/architecture/adr-n8n-ads-analyzer-callback.md`)

Estrutura Context → Decision → Consequences. Cubra:

- Por que callback assíncrono (resumo em 3 linhas).
- Por que 7 endpoints (um por seção) e não monolito.
- Por que cada destino foi escolhido — em especial:
  - Stack/Tráfego: justificar `jsonb` em `client_stores` vs tabela
    auxiliar. Argumento a favor de jsonb: dados são "fotos" do estado
    atual, consultados sempre junto da loja; não precisa join.
    Argumento a favor de tabela auxiliar: snapshot histórico. **Tomar
    decisão** (recomendado: jsonb por simplicidade nesta fase).
  - Audiência: como estender `icp_demographics` sem quebrar o que já
    está lá (`age_range`, `income`, `education`, `occupation`,
    `religion`). Proposta: adicionar `gender`, `countries` como novas
    chaves no mesmo JSONB.
- Idempotência por sobrescrita (não há versionamento nesta fase,
  exceto em `store_briefings`).
- Como falha parcial é tratada — se um endpoint cai, os outros seguem.
  Estado parcial é aceitável e a UI mostra empty state em campos
  ausentes.

### 2. Plano de implementação (`docs/architecture/n8n-ads-analyzer-integration-plan.md`)

#### 2.1 Migrations

##### Migration A — colunas novas em `client_stores`

```sql
alter table client_stores
  add column if not exists tech_stack jsonb,
  add column if not exists traffic_metrics jsonb;

-- icp_demographics já existe, mas documentar que passa a receber
-- chaves novas: gender, countries (sem alter table — é jsonb)
```

##### Migration B — tabela `store_top_products`

```sql
create table store_top_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references client_stores(id) on delete cascade,
  rank int not null check (rank between 1 and 50),
  title text not null,
  price numeric,
  currency text,
  handle text,
  image_url text,
  external_id text,
  source text not null default 'trendtrack',
  captured_at timestamptz not null default now(),

  unique (store_id, rank)
);

create index idx_stp_store on store_top_products(store_id, rank);
```

RLS em ambas seguindo o padrão de outras tabelas relacionadas a
`client_stores` (verificar
`supabase/migrations/20260220_store_onboarding_system.sql` e
`supabase/migrations/20260516000000_pesquisa_diagnostico.sql`).

#### 2.2 Endpoints

Todos sob `src/app/api/webhooks/n8n/ads-analyzer/*/route.ts`. Todos
usam o template de `src/app/api/webhooks/n8n/briefing-generated/route.ts`:
auth `x-secret` via `requireWebhookSecret`, validação Zod, retorno
padronizado.

Para cada endpoint, especificar: path, body schema Zod, side-effect
(UPDATE/INSERT exato), respostas (200/400/401/404).

##### 1. `POST /api/webhooks/n8n/ads-analyzer/snapshot`
- Body: `{ store_id, snapshot_text: string }`
- Side-effect: `UPDATE client_stores SET brand_thesis = ? WHERE id = ?`
- Origem n8n: extrair seção "Snapshot" do markdown do `AI Agent` (ou
  passar pelo n8n um Code node que faz o split por `## Snapshot`).

##### 2. `POST /api/webhooks/n8n/ads-analyzer/tech-stack`
- Body: `{ store_id, platform: string, shopify_plus: boolean,
  technologies: string[], categorized?: { crm_email?: string[],
  page_builders?: string[], reviews?: string[], others?: string[] } }`
- Side-effect: `UPDATE client_stores SET tech_stack = ? WHERE id = ?`
- Origem n8n: campos `shop.platform`, `shop.shopifyPlus`,
  `shop.technologies`. Categorização opcional pode ser feita pelo
  `AI Agent` ou inferida via lista de heurísticas.

##### 3. `POST /api/webhooks/n8n/ads-analyzer/traffic`
- Body: `{ store_id, monthly_visits: number, sources: { direct?:
  number, organic?: number, paid_search?: number, social?: number,
  referral?: number }, top_countries: Array<{ country: string,
  percentage: number }>, socials_growth_30d?: object }`
- Side-effect: `UPDATE client_stores SET traffic_metrics = ?
  WHERE id = ?`
- Origem n8n: `signals.monthlyVisits`, `shop.traffic`, `socialsGrowth`.

##### 4. `POST /api/webhooks/n8n/ads-analyzer/audience`
- Body: `{ store_id, gender: object, age: object, countries: array }`
- Side-effect: merge no `icp_demographics` existente —
  `UPDATE client_stores SET icp_demographics =
  coalesce(icp_demographics, '{}') || ? WHERE id = ?`
- Origem n8n: nó `Demografia` (só dispara no branch `full`).
- **Ler `pesquisa-section.tsx:69-75` antes** — confirmar o formato que
  o `DemoFact` espera para `age_range` etc. e propor o schema do
  merge sem quebrar campos preexistentes.

##### 5. `POST /api/webhooks/n8n/ads-analyzer/products`
- Body: `{ store_id, captured_at, products: Array<{ rank, title,
  price?, currency?, handle?, image_url?, external_id? }> }`
- Side-effect: transação `DELETE FROM store_top_products WHERE
  store_id = ?` + `INSERT` dos novos.
- Origem n8n: nó `Produtos`.

##### 6. `POST /api/webhooks/n8n/ads-analyzer/ads-review`
- Body: `{ store_id, ads_score, ads_summary, ads_sub_scores,
  ads_strengths, ads_opportunities, ads_risks, raw_meta_pages?,
  raw_top_ads? }`
- Side-effect: `UPDATE client_stores SET ads_* = ?, ads_updated_at =
  now() WHERE id = ?`
- **Ler `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts`
  antes** — schema deve casar exatamente. Se `raw_meta_pages` /
  `raw_top_ads` não existirem como colunas, decidir: descartar ou
  adicionar via migration.
- Origem n8n: só dispara no branch `Tem Advertiser` do Switch.

##### 7. `POST /api/webhooks/n8n/ads-analyzer/briefing-markdown`
- Body: `{ store_id, raw_text: string, mode: 'full' |
  'reduced-enriched' | 'reduced', generated_at: string,
  telemetry?: { credits_remaining?: number, total_cost?: number } }`
- Side-effect: `INSERT INTO store_briefings (store_id, briefing_data,
  generated_by, status, ...)` — usar o padrão já existente, marcando
  `generated_by = 'n8n:ads-analyzer'`. Arquivar versões anteriores
  (`status = 'archived'`) seguindo o padrão da tabela.
- Origem n8n: output do nó `AI Agent`.
- **Ler `src/types/onboarding.ts:186-240`** (`BriefingData` /
  `StoreBriefing`) e `store-briefing-view.tsx:43-113` — definir se o
  markdown vai em `briefing_data.raw_text` (compatível com schema
  atual) ou se cria-se um campo dedicado.

#### 2.3 Resolução de `store_id`

O webhook do n8n é disparado com `client.id` e `client.website`. O n8n
**não conhece** o `client_stores.id` (loja). Decisão a documentar:

- **Opção A (recomendado):** o admin cria `client_stores` antes de
  disparar o n8n e passa o `store_id` no body do webhook inicial. Os
  endpoints recebem `store_id` direto.
- **Opção B:** o n8n recebe só `client_id` + `website` e os endpoints
  resolvem via `SELECT id FROM client_stores WHERE client_id = ? AND
  website = ?` (frágil, depende de unicidade).

**Investigar** o fluxo atual de criação de loja no admin antes de
decidir. Se já existe `client_stores` quando `client.created` dispara,
adotar Opção A. Caso contrário, registrar como questão aberta no ADR.

#### 2.4 Mudanças no workflow n8n

Listar nó por nó. O fluxo atual está em
`/root/.claude/uploads/a333f6e8-82ba-4076-a0bc-c4e677f59525/93f32644-Analisador_de_ADS.json`
(se disponível) — caso contrário, pedir ao usuário.

Pontos de inserção dos novos `HTTP Request`:

| Após nó | Endpoint a chamar | Condição |
|---|---|---|
| `Detalhes da Loja` | `/tech-stack` | sempre |
| `Detalhes da Loja` | `/traffic` (parte estática: monthly_visits, sources, countries) | sempre |
| `Produtos` | `/products` | sempre |
| `Redes Sociais` | `/traffic` (atualização: enriquece `socials_growth_30d`) | sempre |
| `Demografia` | `/audience` | só branch `full` |
| `Advertiser Ads` | `/ads-review` (após parsing pelo AI Agent ou diretamente com dados brutos) | só branch `Tem Advertiser` |
| `AI Agent` | `/snapshot` (extraindo seção do markdown) | sempre |
| `AI Agent` | `/briefing-markdown` (markdown completo) | sempre |

Alternativa a considerar e justificar: ao invés do n8n fazer N HTTP
Requests, ter um único Code node final que monta um payload
multi-seção e chama um único endpoint `/finalize` que dispatcha
internamente. **Não recomendado** (perde o ganho de isolamento de
falhas), mas registrar.

Credenciais: criar Header Auth no n8n com `x-secret` = valor do env
`N8N_WEBHOOK_SECRET`. Retry: 3 tentativas, backoff 2s/8s/32s,
`continueOnFail: true` em cada HTTP Request.

#### 2.5 Mudanças na UI

Por área, especificar arquivo, ponto de inserção e comportamento:

- **`tab-contexto.tsx:208` ("Operação & catálogo"):** adicionar lista
  Top 5 Produtos abaixo dos KPIs (rank · imagem 40x40 · título ·
  preço). Empty state: "Top produtos serão preenchidos após análise
  inicial." Read-only.
- **`tab-contexto.tsx` (nova seção "Stack & maturidade"):** renderizar
  `tech_stack` categorizado (CRM/Email, Page Builders, Reviews,
  Outros). Empty state.
- **`tab-contexto.tsx` (nova seção "Tráfego & aquisição"):** KPIs
  (visitas/mês, top country) + breakdown das sources (barra simples)
  + indicador de momentum dos socials (crescimento/estagnação/queda).
- **`pesquisa-section.tsx`:** já renderiza `brand_thesis` e
  `icp_demographics` — apenas confirmar que renderizam corretamente
  os novos campos vindos do n8n (gender, countries).
- **`store-briefing-view.tsx`:** acomodar `raw_text` markdown na
  visualização do briefing completo (renderizar com
  `react-markdown` ou similar; sanitizar com DOMPurify).
- **Não precisa banner de progresso** — UI mostra empty state quando
  vazio e atualiza no próximo refresh. (Se quiser realtime, é
  follow-up.)

#### 2.6 Endpoints de leitura para a UI

Para Top Produtos: `GET /api/admin/stores/[id]/top-products` retornando
o array de `store_top_products` ordenado por `rank`.

Para o resto, os dados estão em `client_stores` e já são lidos pelos
endpoints existentes da Pesquisa/Contexto — verificar e listar quais
queries precisam ser estendidas para retornar os campos novos
(`tech_stack`, `traffic_metrics`).

#### 2.7 Segurança

- Validar `x-secret` em todos os endpoints (helper já existe).
- Sanitizar strings do payload (XSS em `title` de produto, `summary`
  de ads, markdown completo). Sanitização no render via DOMPurify.
- Não logar `raw_top_ads` nem `raw_meta_pages` em produção (PII).
- Rate limit não é crítico (auth via secret), mas registrar
  inertizar volume esperado (~1 disparo por loja criada por dia).

#### 2.8 Plano de rollout

1. Migrations (A e B) com RLS.
2. Endpoints na ordem: `/products`, `/ads-review` (áreas mais maduras),
   `/snapshot`, `/audience` (reuso de colunas existentes),
   `/tech-stack`, `/traffic`, `/briefing-markdown`. Teste de integração
   por endpoint.
3. Atualizar workflow n8n em staging.
4. Smoke test: criar loja com `mode=full`, validar 7 callbacks.
5. UI: editar "Operação & catálogo" → adicionar seções "Stack" e
   "Tráfego" → renderizar `raw_text` em store-briefing-view.
6. Deploy.

### 3. Checklist de aceitação

- [ ] Migrations aplicadas, `tech_stack` e `traffic_metrics` em
      `client_stores`, tabela `store_top_products` com RLS.
- [ ] Cada um dos 7 endpoints retorna 401 sem secret, 400 com body
      inválido, 200 com efeito correto, 404 se `store_id` inexistente.
- [ ] Re-chamada idempotente: mesmo payload, mesmo estado final
      (sobrescreve, não duplica).
- [ ] Workflow n8n em staging dispara os 7 callbacks com sucesso em
      mode `full`.
- [ ] Mode `reduced` (sem ads/audiência) ignora os 2 endpoints
      correspondentes sem erro.
- [ ] Mode `reduced-enriched` dispara ads-review mas pula audiência.
- [ ] Falha em um endpoint não impede os outros (testar com 500
      simulado em `/products` — o resto completa).
- [ ] UI da seção "Operação & catálogo" mostra top 5 produtos.
- [ ] UI mostra Stack e Tráfego com dados do TrendTrack.
- [ ] Briefing markdown completo renderiza em
      `store-briefing-view.tsx` sem XSS.

---

## Regras de qualidade da entrega

- **Não escrever código** ainda — apenas documentação.
- **Citar arquivos existentes** com `path:line` ao referenciar padrões.
- **Não inventar** colunas/tabelas que não existem. Antes de propor
  schema de endpoint, ler a migration relevante e os componentes UI
  para casar os tipos.
- **Português brasileiro**, tom técnico direto, sem floreios, sem
  emojis.
- Mencionar nós exatos do n8n: `Juntar Tudo` (linha 290 do JSON do
  workflow), `AI Agent` (linha 437), `Produtos` (linha 250),
  `Demografia`, `Advertiser Ads`, `Switch` (`Tem Advertiser`,
  `tem brandtracker`), `Detalhes da Loja`, `Redes Sociais`.
- Não inflar escopo além das 7 seções listadas. Se o n8n produzir
  outros dados (ex: `brandtracker.kpis`, `socials.facebook.followers`
  histórico longo), registrar como "fora de escopo desta fase" no ADR
  e seguir.

### Arquivos para ler primeiro

- `docs/architecture/n8n-api-integration.md` (padrão estabelecido)
- `src/app/api/webhooks/n8n/briefing-generated/route.ts` (template do
  callback)
- `src/lib/api/n8n-auth.ts` (helper `requireWebhookSecret`)
- `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts`
  (schema canônico do ads-review)
- `supabase/migrations/20260516000000_pesquisa_diagnostico.sql`
  (colunas Pesquisa em `client_stores`)
- `supabase/migrations/20260220_store_onboarding_system.sql`
  (`store_briefings`)
- `src/components/stores/v2/tab-contexto.tsx` (aba Contexto inteira)
- `src/components/stores/v2/pesquisa/pesquisa-section.tsx` (renderiza
  Pesquisa)
- `src/components/onboarding/store-briefing-view.tsx` (renderiza
  briefing JSONB)
- `src/types/onboarding.ts` (tipos `StoreBriefing` e `BriefingData`)

Entregue os dois arquivos (`adr-*.md` e `*-plan.md`) prontos para code
review.
