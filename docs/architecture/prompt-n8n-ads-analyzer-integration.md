# Prompt: Integração n8n Analisador de ADS → Briefing (escopo final)

> Prompt para gerar a documentação de implementação. Use este arquivo
> como input para uma nova sessão Claude Code que vá escrever o ADR +
> plano técnico antes de codificar.

---

## Contexto

Workflow n8n **Analisador de ADS** (id `poXnErms4DlklW2v`, webhook path
`ads-analyze-convertfy`) é disparado pelo evento `client.created` do
admin-convertfy. Faz lookup do site na **TrendTrack API**, coleta dados
ricos e gera briefing em markdown via Claude Haiku 4.5 (OpenRouter).

Hoje termina em `Respond to Webhook` e **nada é persistido**. Queremos
mudar: n8n faz **callback assíncrono** para endpoints do admin, que
persistem nos campos **já existentes** da aba Contexto da loja
(`/admin/lojas/[id]` → aba Contexto).

### Regra inegociável de escopo

**Só usar áreas e campos que JÁ EXISTEM no admin.** Única exceção: a
seção "Operação & catálogo" (`tab-contexto.tsx:208`) vai ser editada
manualmente pelo usuário para listar Top Produtos — isso requer 1
tabela nova (`store_top_products`).

Se uma seção do output do n8n não tem destino existente, **não criar
nada novo** — os dados ficam no markdown do "Briefing completo
(gerado por IA)" e pronto.

### Decisões já tomadas

1. **Callback assíncrono**, não sync. Motivo: pipeline n8n leva
   30-120s e webhook síncrono sofre timeout do Vercel.
2. **Um endpoint por destino**, não monolito. Motivo: branches do n8n
   (`full` / `reduced-enriched` / `reduced`) produzem subconjuntos
   diferentes; endpoints independentes isolam falhas.
3. **Auth via `x-secret`** com `crypto.timingSafeEqual`, reaproveitando
   `requireWebhookSecret` em `src/lib/api/n8n-auth.ts`. Env:
   `N8N_WEBHOOK_SECRET` (já existe).
4. **Diferença de custo sync/async é desprezível** (~R$ 0,10 por
   briefing). Não revisitar.
5. **Idempotência por sobrescrita**: cada endpoint sobrescreve o
   estado atual. Sem tabela de tracking, sem histórico (exceto
   `store_briefings` que tem versionamento próprio).

---

## Mapeamento final n8n → admin

Estado atual da aba Contexto confirmado por screenshot e análise de
`src/components/stores/v2/tab-contexto.tsx`:

| # | Seção n8n | Dados (origem em `Juntar Tudo`) | Destino no admin | Status |
|---|---|---|---|---|
| 1 | **Snapshot** | Extraído do markdown do `AI Agent` (seção `## Snapshot`) — 2-3 linhas | Pesquisa → "01 Perfil da Marca" → campo "Tese da marca" (`client_stores.brand_thesis`) | ✅ Coluna existe |
| 2 | Stack & Maturidade | `shop.technologies[]`, `shop.platform`, `shop.shopifyPlus` | **Sem destino** — fica só no markdown do Briefing completo | ❌ Fora de escopo |
| 3 | Tráfego & Aquisição | `signals.monthlyVisits`, `shop.traffic.*`, `socialsGrowth` | **Sem destino** — fica só no markdown do Briefing completo | ❌ Fora de escopo |
| 4 | **Audiência** | `audience.gender`, `audience.age`, `audience.countries` (só mode `full`) | Pesquisa → "03 Cliente Ideal" → `client_stores.icp_persona` (texto inferido) + `client_stores.icp_demographics` (jsonb, merge) | ✅ Colunas existem |
| 5 | **Top Produtos** | `topProducts[]` (até 5: title, price, handle, rank) | Operação & catálogo (`tab-contexto.tsx:208`) — usuário vai editar a seção para listar produtos. Persistir em tabela **nova** `store_top_products` | ⚠️ Tabela a criar (única exceção) |
| 6 | **Estratégia Paga** | `signals.activeAds`, `metaPagesLinked`, `advertiserTopAds` | Pesquisa → "05 Review dos Anúncios" → `client_stores.ads_*` (`ads_score`, `ads_summary`, `ads_sub_scores`, `ads_strengths[]`, `ads_opportunities[]`, `ads_risks[]`) | ✅ Colunas existem |
| 7 | **Briefing markdown completo** | Output do `AI Agent` (markdown com todas as seções, inclusive Stack/Tráfego) | "Briefing completo (gerado por IA)" → tabela existente `store_briefings.briefing_data` | ✅ Tabela existe |

### Componentes UI alvo

- `pesquisa-section.tsx` — renderiza `brand_thesis` (item 1) e
  `icp_persona`/`icp_demographics` (item 4) sem mudança.
- `tab-contexto.tsx:208` (Operação & catálogo) — **única mudança de
  UI**: adicionar lista Top 5 Produtos abaixo dos KPIs existentes.
- `pesquisa-section.tsx` (pilar 05) — renderiza `ads_*` sem mudança.
- `store-briefing-view.tsx` — renderiza `store_briefings.briefing_data`
  sem mudança estrutural (verificar se aceita `raw_text` markdown ou
  precisa adaptação mínima).

---

## A tarefa

Você é arquiteto trabalhando no admin-convertfy. Entrega: **um ADR +
um plano de implementação**.

### 1. ADR (`docs/architecture/adr-n8n-ads-analyzer-callback.md`)

Estrutura Context → Decision → Consequences. Cubra:

- Por que callback assíncrono (3 linhas).
- Por que 5 endpoints (um por destino) e não monolito.
- Por que **descartar Stack e Tráfego** dos campos estruturados:
  registrar explicitamente que esses dados estão no markdown do
  Briefing completo e que criar campos novos foi rejeitado nesta
  fase (regra de escopo do usuário). Aceitar trade-off: para consumir
  Stack/Tráfego programaticamente no futuro, será necessário parsing
  do markdown ou nova fase de integração.
- Por que `store_top_products` é tabela nova e não JSONB em
  `client_stores`: produtos são entidades com identidade (rank, sku,
  handle); JSONB seria pior pra render e pra futuras queries.
- Idempotência por sobrescrita. Audiência usa **merge** no
  `icp_demographics` (jsonb) pra não perder campos preexistentes
  (`age_range`, `income`, etc.).
- Falha parcial: se um endpoint cai, os outros seguem. Estado parcial
  é aceitável.

### 2. Plano de implementação (`docs/architecture/n8n-ads-analyzer-integration-plan.md`)

#### 2.1 Migration única

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

RLS seguindo o padrão de
`supabase/migrations/20260220_store_onboarding_system.sql` (tabelas
relacionadas a `client_stores`).

**Sem outras alterações de schema.** Confirmar no ADR.

#### 2.2 Endpoints (5)

Todos sob `src/app/api/webhooks/n8n/ads-analyzer/*/route.ts`. Template:
`src/app/api/webhooks/n8n/briefing-generated/route.ts`. Auth:
`requireWebhookSecret` (helper existente). Validação: Zod.

Para cada endpoint, especificar: path, body schema, side-effect
(UPDATE/INSERT exato), respostas (200/400/401/404).

##### 1. `POST /api/webhooks/n8n/ads-analyzer/snapshot`
- Body: `{ store_id: uuid, snapshot_text: string }`
- Side-effect: `UPDATE client_stores SET brand_thesis = ? WHERE id = ?`
- Origem n8n: Code node novo que extrai a seção `## Snapshot` do
  markdown do `AI Agent` via regex/split.

##### 2. `POST /api/webhooks/n8n/ads-analyzer/audience`
- Body: `{ store_id: uuid, persona_text?: string, demographics:
  { gender?: object, age?: object, countries?: array } }`
- Side-effect:
  ```sql
  UPDATE client_stores
  SET icp_persona = coalesce(?, icp_persona),
      icp_demographics = coalesce(icp_demographics, '{}'::jsonb) || ?::jsonb
  WHERE id = ?
  ```
  (merge JSONB pra preservar `age_range`/`income`/etc.)
- Origem n8n: nó `Demografia`. `persona_text` é opcional — se o
  `AI Agent` produzir uma inferência de persona na seção "Audiência",
  passar; caso contrário, omitir e só persistir o JSONB.
- **Ler `pesquisa-section.tsx:60-99`** antes de definir o schema do
  JSONB pra confirmar quais chaves o `DemoFact` renderiza.

##### 3. `POST /api/webhooks/n8n/ads-analyzer/products`
- Body: `{ store_id: uuid, captured_at: string (ISO), products:
  Array<{ rank: number, title: string, price?: number, currency?:
  string, handle?: string, image_url?: string, external_id?: string }> }`
- Side-effect: transação `DELETE FROM store_top_products WHERE
  store_id = ?` + `INSERT` dos novos.
- Origem n8n: nó `Produtos` (linha 250 do JSON do workflow).

##### 4. `POST /api/webhooks/n8n/ads-analyzer/ads-review`
- Body: `{ store_id: uuid, ads_score: number (0-100), ads_summary:
  string, ads_sub_scores: Record<string, number>, ads_strengths:
  string[], ads_opportunities: string[], ads_risks: string[] }`
- Side-effect: `UPDATE client_stores SET ads_score = ?, ads_summary =
  ?, ads_sub_scores = ?, ads_strengths = ?, ads_opportunities = ?,
  ads_risks = ?, ads_updated_at = now() WHERE id = ?`
- **Ler
  `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts`
  antes** — schema deve casar exatamente. Não inventar campos
  (`raw_meta_pages`, `raw_top_ads` foram cogitados antes — **descartar**
  porque colunas não existem e regra de escopo proíbe criar).
- Origem n8n: só dispara no branch `Tem Advertiser` do Switch
  (linha 302 do JSON). Requer Code node que rode parsing/score sobre
  `advertiserTopAds` e `metaPagesLinked` (ou esse parsing pode ser
  feito pelo `AI Agent` num prompt dedicado, e o n8n só forward).

##### 5. `POST /api/webhooks/n8n/ads-analyzer/briefing-markdown`
- Body: `{ store_id: uuid, raw_text: string, mode: 'full' |
  'reduced-enriched' | 'reduced', generated_at: string }`
- Side-effect:
  1. `UPDATE store_briefings SET status = 'archived' WHERE store_id =
     ? AND status = 'current'`
  2. `INSERT INTO store_briefings (store_id, briefing_data,
     generated_by, status, generated_at, version)` com
     `briefing_data = { raw_text, mode }`, `generated_by =
     'n8n:ads-analyzer'`, `status = 'current'`, `version` = max+1.
- **Ler `src/types/onboarding.ts:186-240`** (`BriefingData`,
  `StoreBriefing`) e
  `src/components/onboarding/store-briefing-view.tsx:43-113`. Definir
  se `raw_text` cai em `briefing_data.raw_text` (compatível com o
  schema atual, que já tem esse campo) — confirmar e usar essa rota.

#### 2.3 Resolução de `store_id`

O webhook do n8n recebe `client.id` + `client.website`. **Não conhece**
`client_stores.id`. Decisão a documentar:

- **Opção A (recomendado):** o admin já tem `client_stores` criado
  quando dispara `client.created` — passar `store_id` no body do
  webhook do n8n. Endpoints recebem direto.
- **Opção B:** endpoints resolvem via `SELECT id FROM client_stores
  WHERE client_id = ? AND website = ?` (frágil).

**Investigar fluxo atual** de criação de loja no admin antes de
decidir. Se ambíguo, registrar como questão aberta no ADR.

#### 2.4 Mudanças no workflow n8n

Pontos de inserção dos novos `HTTP Request`:

| Após nó | Endpoint | Condição |
|---|---|---|
| `AI Agent` | `/snapshot` (extrair seção via Code node) | sempre |
| `Demografia` | `/audience` | branch `full` |
| `Produtos` | `/products` | sempre |
| (parsing dedicado) | `/ads-review` | branch `Tem Advertiser` |
| `AI Agent` | `/briefing-markdown` (markdown completo) | sempre |

Credenciais: criar Header Auth no n8n com `x-secret` = valor do env
`N8N_WEBHOOK_SECRET`. Cada HTTP Request: retry 3x, backoff 2s/8s/32s,
`continueOnFail: true`.

O `Respond to Webhook` final pode ser removido ou mantido só
retornando `{ ok: true }` pra debug.

Detalhar no plano: como o n8n vai gerar o payload do `/ads-review`
(parsing do `advertiserTopAds` + `metaPagesLinked` em
`ads_strengths/opportunities/risks/sub_scores`). Opções:
- (a) Prompt extra no `AI Agent` que retorna JSON estruturado pra esses
  campos.
- (b) Code node JS no n8n com heurísticas.

Recomendar (a) — mais qualitativo. Justificar.

#### 2.5 Mudança de UI (única)

`src/components/stores/v2/tab-contexto.tsx:208` — seção "Operação &
catálogo":

- Manter o grid de 8 KPIs existente (ticket médio, conversão,
  faturamento médio, margem, recorrência, frete médio, prazo, cobertura).
- Adicionar **abaixo** dos KPIs uma lista Top 5 Produtos consumida de
  novo endpoint `GET /api/admin/stores/[id]/top-products`.
- Layout: lista simples (rank · imagem 40x40 · título · preço · CTA
  externo para o handle se vier).
- Read-only (dados vêm do n8n, não editáveis na UI).
- Empty state: "Top produtos serão preenchidos após análise inicial."

**Nenhuma outra seção da UI muda.** As demais áreas (Pesquisa,
Briefing completo) já renderizam os campos que vão ser populados.

#### 2.6 Endpoint de leitura para a UI

`GET /api/admin/stores/[id]/top-products` retornando array de
`store_top_products` ordenado por `rank`. Auth via Supabase JWT
(padrão das demais rotas em `src/app/api/admin/stores/[id]/*`).

#### 2.7 Segurança

- Validar `x-secret` em todos os 5 endpoints.
- Sanitizar strings do payload (XSS em `title` de produto, `summary` de
  ads, markdown completo). Sanitização no render via DOMPurify ou
  equivalente (verificar o que o projeto já usa em
  `store-briefing-view.tsx`).
- Não logar payloads completos em produção (PII potencial em
  `advertiserTopAds`).

#### 2.8 Plano de rollout

1. Migration `store_top_products` + RLS.
2. Endpoints na ordem: `/products`, `/ads-review`, `/snapshot`,
   `/audience`, `/briefing-markdown`. Teste de integração por
   endpoint.
3. Workflow n8n em staging com os 5 HTTP Requests novos.
4. Smoke test: criar loja com `mode=full`, validar os 5 callbacks
   chegando.
5. UI: editar `tab-contexto.tsx:208` para listar Top Produtos +
   endpoint de leitura.
6. Deploy.

### 3. Checklist de aceitação

- [ ] Migration aplicada, `store_top_products` com RLS.
- [ ] 5 endpoints retornam 401 sem secret, 400 com body inválido,
      200 com efeito correto, 404 se `store_id` inexistente.
- [ ] Re-chamada idempotente: mesmo payload, mesmo estado final.
- [ ] `/audience` faz merge no `icp_demographics` sem perder chaves
      preexistentes (`age_range`, `income`, etc.).
- [ ] Workflow n8n em staging dispara os 5 callbacks em mode `full`.
- [ ] Mode `reduced` ignora `/audience` e `/ads-review` sem erro.
- [ ] Mode `reduced-enriched` dispara `/ads-review` mas pula
      `/audience`.
- [ ] Falha em um endpoint não impede os outros (testar 500 simulado
      em `/products`).
- [ ] Seção "Operação & catálogo" mostra top 5 produtos.
- [ ] Empty state aparece se ainda não houver produtos.
- [ ] `brand_thesis` (Snapshot), `icp_persona`+`icp_demographics`
      (Audiência), `ads_*` (Estratégia Paga) aparecem renderizados na
      Pesquisa sem mudança de código nos componentes.
- [ ] Briefing completo renderiza o markdown vindo do `AI Agent`.

---

## Regras de qualidade da entrega

- **Não escrever código** ainda — apenas documentação.
- **Citar arquivos existentes** com `path:line` ao referenciar padrões.
- **Não inventar** colunas, tabelas ou áreas de UI. A única exceção
  permitida é a tabela `store_top_products`. Qualquer outra criação é
  violação da regra de escopo.
- **Português brasileiro**, tom técnico direto, sem floreios, sem
  emojis.
- Nomes exatos dos nós n8n: `Juntar Tudo` (linha 290 do JSON),
  `AI Agent` (linha 437), `Produtos` (linha 250), `Demografia`,
  `Advertiser Ads`, `Switch` (`Tem Advertiser`), `Detalhes da Loja`,
  `Redes Sociais`.
- Se descobrir que Stack ou Tráfego têm destinos existentes que eu não
  vi, sinalize claramente no ADR — mas **não crie campos novos por
  iniciativa própria**.

### Arquivos para ler primeiro

- `docs/architecture/n8n-api-integration.md`
- `src/app/api/webhooks/n8n/briefing-generated/route.ts` (template)
- `src/lib/api/n8n-auth.ts` (`requireWebhookSecret`)
- `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts`
  (schema canônico do ads-review)
- `supabase/migrations/20260516000000_pesquisa_diagnostico.sql`
  (colunas Pesquisa em `client_stores`)
- `supabase/migrations/20260220_store_onboarding_system.sql`
  (`store_briefings`)
- `src/components/stores/v2/tab-contexto.tsx` (aba Contexto inteira —
  só a seção `tab-contexto.tsx:208` muda)
- `src/components/stores/v2/pesquisa/pesquisa-section.tsx` (renderiza
  Pesquisa — não muda, mas serve de referência pro schema de
  `icp_demographics`)
- `src/components/onboarding/store-briefing-view.tsx` (renderiza
  briefing JSONB — verifica suporte a `raw_text`)
- `src/types/onboarding.ts` (`StoreBriefing` / `BriefingData`)

Entregue os dois arquivos (`adr-*.md` e `*-plan.md`) prontos para code
review.
