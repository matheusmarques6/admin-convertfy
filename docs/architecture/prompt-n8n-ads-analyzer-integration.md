# Prompt: Integração n8n Analisador de ADS → Briefing (Top Produtos + Análise de Anúncios)

> Prompt para gerar a documentação de implementação. Use este arquivo
> como input para uma nova sessão Claude Code que vá escrever o ADR +
> plano técnico antes de codificar.

---

## Contexto

Workflow n8n **Analisador de ADS** (id `poXnErms4DlklW2v`, webhook path
`ads-analyze-convertfy`) é disparado pelo evento `client.created` do
admin-convertfy. Faz lookup do site na **TrendTrack API**, coleta dados
e gera briefing em markdown via Claude Haiku 4.5 (OpenRouter).

Hoje o workflow termina em `Respond to Webhook` e **nada é persistido**
no admin. Queremos mudar: o n8n faz **callback assíncrono** para
endpoints do admin, que persistem os dados nas áreas certas.

**Escopo desta integração é restrito a duas áreas do admin:**

1. **Top Produtos** — vai aparecer dentro da seção `Operação & catálogo`
   da aba Contexto (`src/components/stores/v2/tab-contexto.tsx:208`).
   Essa seção hoje só mostra KPIs (ticket médio, conversão, frete) e
   será editada para incluir uma lista de top 5 produtos vindos do
   TrendTrack.

2. **Análise de Anúncios** — popula as colunas `ads_*` de `client_stores`
   (pilar 5 da Pesquisa: `ads_score`, `ads_summary`, `ads_sub_scores`,
   `ads_strengths[]`, `ads_opportunities[]`, `ads_risks[]`). Já existe
   um endpoint de regeneração manual em
   `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts` —
   reusar o schema, não duplicar.

Outras seções do output do n8n (Snapshot, Stack, Tráfego, Audiência)
**não fazem parte deste escopo**. Se o n8n produzir esses dados, eles
são descartados por enquanto.

### Decisões já tomadas

1. **Callback assíncrono**, não sync via `Respond to Webhook`. Motivo:
   pipeline n8n leva 30-120s (6-8 chamadas TrendTrack + LLM) e webhook
   síncrono sofre timeout do Vercel.
2. **Um endpoint por área** (2 endpoints, não 1 monolito). Motivo: o
   n8n tem branches (`full` / `reduced-enriched` / `reduced`) — em
   `reduced`, só top produtos chega; em `reduced-enriched`, chega
   produtos + ads. Endpoints independentes simplificam isso e isolam
   falhas.
3. **Auth via header `x-secret`** com `crypto.timingSafeEqual`,
   reaproveitando o helper `requireWebhookSecret` em
   `src/lib/api/n8n-auth.ts`. Variável: `N8N_WEBHOOK_SECRET` (já existe
   no projeto).
4. **Diferença de custo entre sync/async é desprezível** (~R$ 0,10 por
   briefing, dominado por Claude Haiku + TrendTrack). Não revisitar.

---

## Mapeamento dos dados do n8n

Do nó `Juntar Tudo` (Code, linha 290 do JSON do workflow), o output
relevante para esta integração:

```jsonc
{
  "domain": "shopbellaluce.online",
  "mode": "full" | "reduced-enriched" | "reduced",
  "ids": { "shopId": "..." },

  // → endpoint /products
  "topProducts": [
    {
      "title": "...",
      "price": "...",
      "rank": 1,
      "handle": "...",
      "image": "..."  // se vier
      // qualquer outro campo de TrendTrack /v1/shops/{id}/products
    }
    // até 5 itens
  ],

  // → endpoint /ads-review (só nos modes que têm ads)
  "signals": { "activeAds": 12, "hasAdvertiser": true },
  "metaPagesLinked": [ /* páginas Meta do anunciante */ ],
  "advertiserTopAds": [ /* top 10 ads (creativos + copies) */ ]
}
```

O nó `AI Agent` também gera markdown com seção "Estratégia Paga". Para
o endpoint `/ads-review`, o n8n deve passar **tanto o JSON estruturado
quanto a análise textual** (o markdown da seção) — o endpoint persiste
ambos.

**O resto do payload (`shop`, `brandtracker`, `audience`,
`socialsGrowth`, `telemetry`) é ignorado nesta fase.** Documentar isso
explicitamente no ADR para evitar que alguém amplie o escopo sem
discutir.

---

## A tarefa

Você é arquiteto trabalhando no admin-convertfy. Entrega:

### 1. ADR (`docs/architecture/adr-n8n-ads-analyzer-callback.md`)

Estrutura Context → Decision → Consequences. Cubra:

- Por que callback assíncrono (resumir em 3 linhas — não refazer
  análise).
- Por que 2 endpoints (um por área) e não 1.
- Escopo restrito a Top Produtos + Análise de Anúncios. Outras seções
  do payload ficam fora — registrar como "out of scope nesta fase, a
  reavaliar quando houver demanda explícita".
- Idempotência: cada endpoint usa `(store_id, captured_at)` ou
  upsert simples sobrescrevendo o registro atual da loja. Não precisa
  histórico nesta fase (decisão explícita — registrar trade-off:
  perde-se snapshot temporal, ganha-se simplicidade).
- Tratamento de falha: se um endpoint falhar, o outro segue. Não há
  estado "global" do run — cada área é independente.

### 2. Plano de implementação (`docs/architecture/n8n-ads-analyzer-integration-plan.md`)

#### 2.1 Migration

Nova tabela `store_top_products`:

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
  external_id text,           -- id do produto no TrendTrack/Shopify
  source text not null default 'trendtrack',
  captured_at timestamptz not null default now(),

  unique (store_id, rank)     -- só um produto por rank por loja
);

create index idx_stp_store on store_top_products(store_id, rank);
```

RLS: mesma policy de outras tabelas relacionadas a `client_stores`
(verificar `supabase/migrations/20260220_store_onboarding_system.sql`
e seguir o padrão).

**Não criar nova tabela para análise de anúncios** — reusar
`client_stores.ads_*` que já existe.

#### 2.2 Endpoints

##### `POST /api/webhooks/n8n/ads-analyzer/products`

- **Auth:** header `x-secret` validado com `requireWebhookSecret`.
- **Body (Zod):**
  ```ts
  {
    store_id: string (uuid),
    captured_at: string (ISO timestamp),
    products: Array<{
      rank: number,
      title: string,
      price?: number,
      currency?: string,
      handle?: string,
      image_url?: string,
      external_id?: string
    }>
  }
  ```
- **Comportamento:** transação que `DELETE FROM store_top_products
  WHERE store_id = ?` e `INSERT` os novos. Garantir atomicidade.
- **Respostas:** 200 com `{ inserted: number }`, 401 secret inválido,
  400 schema inválido, 404 store_id não existe.

##### `POST /api/webhooks/n8n/ads-analyzer/ads-review`

- **Auth:** mesmo padrão.
- **Body (Zod):**
  ```ts
  {
    store_id: string (uuid),
    captured_at: string (ISO timestamp),
    ads_score: number (0-100),
    ads_summary: string,
    ads_sub_scores: Record<string, number>,
    ads_strengths: string[],
    ads_opportunities: string[],
    ads_risks: string[],
    raw_meta_pages?: object[],     // metaPagesLinked do n8n (snapshot)
    raw_top_ads?: object[]         // advertiserTopAds do n8n (snapshot)
  }
  ```
- **Comportamento:** `UPDATE client_stores SET ads_* = ?, ads_updated_at
  = now() WHERE id = ?`. Schema deve **conferir exatamente** com o que
  já existe — ler
  `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts` antes
  de propor o payload. Se as colunas `raw_meta_pages` / `raw_top_ads`
  não existirem em `client_stores`, ou descartar esses campos ou
  adicionar via migration (decidir e justificar).
- **Respostas:** 200 com `{ updated: true }`, 401, 400, 404.

Para cada endpoint, especificar também: pasta exata
(`src/app/api/webhooks/n8n/ads-analyzer/products/route.ts`), template a
copiar (`src/app/api/webhooks/n8n/briefing-generated/route.ts`).

#### 2.3 Resolução de `store_id`

O webhook do n8n é disparado com `client.id` e `client.website`. O n8n
**não conhece** o `client_stores.id` (loja). Decisão arquitetural a
documentar:

- **Opção A:** o admin já cria `client_stores` antes de disparar o n8n,
  e passa o `store_id` no body do webhook. Mais limpo. **Recomendado.**
- **Opção B:** o n8n recebe só `client_id` + `website` e os endpoints
  resolvem o `store_id` via `SELECT id FROM client_stores WHERE
  client_id = ? AND website = ?`. Mais frágil (depende da unicidade do
  website).

Confirmar com o time qual é o fluxo atual de criação de loja (existe um
`client_stores` row quando o evento `client.created` dispara?). Listar
como pergunta aberta no ADR se não houver certeza.

#### 2.4 Mudanças no workflow n8n

Listar nó por nó:

- Após o nó `Produtos` (linha 250 do JSON do workflow), adicionar um
  `HTTP Request` que chama `/api/webhooks/n8n/ads-analyzer/products`
  com o payload do nó. Mapeamento de campos TrendTrack → admin no
  body.
- Após o `AI Agent` (linha 437), adicionar um `HTTP Request` que chama
  `/api/webhooks/n8n/ads-analyzer/ads-review` — mas **só no branch
  `Tem Advertiser`** do Switch (linha 302). Se não tem ads, esse
  endpoint não é chamado.
- Credenciais: criar um Header Auth no n8n com nome `x-secret` e valor
  vindo do env `N8N_WEBHOOK_SECRET` (mesmo secret usado em
  `/api/webhooks/n8n/briefing-generated`).
- Retry no nó: 3 tentativas, backoff 2s/8s/32s, `continueOnFail: true`
  para que falha num callback não derrube o workflow inteiro.
- O `Respond to Webhook` final pode ser removido ou mantido só
  retornando `{ ok: true }` para debug.

#### 2.5 Mudanças na UI

`src/components/stores/v2/tab-contexto.tsx:208` — seção "Operação &
catálogo":

- Manter o grid de KPIs existente.
- Adicionar abaixo dele uma lista de Top Produtos vinda de uma nova
  API `GET /api/admin/stores/[id]/top-products` que retorna o array
  de `store_top_products`.
- Layout: lista simples (rank · imagem 40x40 · título · preço) — sem
  edição inline nesta fase (dados vêm do n8n, são read-only).
- Se vazio: empty state "Top produtos serão preenchidos após análise
  inicial".

Para Análise de Anúncios não precisa mudança de UI — a Pesquisa já
renderiza `ads_*` via `pesquisa-section.tsx`.

#### 2.6 Segurança

- Validar `x-secret` em todos os endpoints (helper já existe).
- Sanitizar strings do payload antes de inserir (cuidado com XSS no
  `title` do produto — quando renderizar na UI, escapar).
- Não logar `raw_top_ads` em produção (pode conter PII de páginas Meta).

#### 2.7 Plano de rollout

1. Migration `store_top_products` + GET endpoint de leitura para a UI.
2. Endpoints de callback (`/products` e `/ads-review`) — escrever
   testes de integração seguindo o padrão do projeto.
3. Atualizar workflow n8n em staging com os HTTP Requests novos.
4. Smoke test: criar loja com website válido, validar que produtos e
   ads chegam.
5. Atualizar UI da seção "Operação & catálogo".
6. Deploy.

### 3. Checklist de aceitação

- [ ] Migration aplicada, tabela `store_top_products` existe com RLS.
- [ ] `POST /api/webhooks/n8n/ads-analyzer/products` retorna 401 sem
      secret, 400 com body inválido, 200 com upsert correto.
- [ ] `POST /api/webhooks/n8n/ads-analyzer/ads-review` idem,
      atualizando `client_stores.ads_*`.
- [ ] Re-chamar o mesmo endpoint com mesmo `store_id` sobrescreve, não
      duplica.
- [ ] Workflow n8n em staging dispara os dois callbacks com sucesso.
- [ ] Loja no mode `reduced` (sem ads) só recebe produtos, sem erro.
- [ ] UI da seção "Operação & catálogo" renderiza top 5 produtos.
- [ ] Empty state aparece quando ainda não há produtos.

---

## Regras de qualidade da entrega

- **Não escrever código** ainda — apenas documentação.
- **Citar arquivos existentes** com `path:line` ao referenciar padrões.
- **Não inflar escopo:** o usuário foi explícito que esta integração é
  só para Top Produtos + Análise de Anúncios. Se você vir oportunidade
  em outra área (ex: salvar `signals` em algum lugar), registre como
  "fora de escopo desta fase" no ADR e siga em frente.
- **Não inventar** colunas que não existem em `client_stores`. Antes de
  propor o schema do payload de `/ads-review`, ler a migration
  `supabase/migrations/20260516000000_pesquisa_diagnostico.sql` e o
  endpoint `regenerate/route.ts` para casar exatamente.
- **Português brasileiro**, tom técnico direto, sem floreios, sem
  emojis.
- Mencionar os nós exatos do n8n quando relevante: `Juntar Tudo`,
  `AI Agent`, `Produtos`, `Switch` (`Tem Advertiser`).

### Arquivos para ler primeiro

- `docs/architecture/n8n-api-integration.md` (padrão de integração n8n
  já estabelecido)
- `src/app/api/webhooks/n8n/briefing-generated/route.ts` (template do
  endpoint de callback)
- `src/lib/api/n8n-auth.ts` (helper `requireWebhookSecret`)
- `src/app/api/admin/stores/[id]/ads-review/regenerate/route.ts`
  (schema canônico do ads-review)
- `supabase/migrations/20260516000000_pesquisa_diagnostico.sql`
  (colunas `ads_*` em `client_stores`)
- `src/components/stores/v2/tab-contexto.tsx` (seção "Operação &
  catálogo" linha 208 — onde a UI de produtos vai entrar)
- `src/components/stores/v2/pesquisa/pesquisa-section.tsx` (como a
  Pesquisa renderiza `ads_*` hoje)

Entregue os dois arquivos (`adr-*.md` e `*-plan.md`) no final, prontos
para code review.
