# n8n Callbacks — Endpoints da aba Contexto

Referência completa dos endpoints que recebem dados de workflows n8n
e populam as áreas da aba **Contexto** (`/admin/lojas/[id]`) de uma
loja. Cada endpoint corresponde a **uma área específica da UI**, com
o schema do payload alinhado ao componente que renderiza a área.

> **Importante**: o nome `ads-analyzer` refere-se exclusivamente à
> área "05 Review dos Anúncios". Não é um namespace genérico para
> workflows do n8n.

---

## Convenções comuns

| | |
|---|---|
| Method | `POST` |
| Content-Type | `application/json` |
| Auth | Header `x-webhook-secret: ${N8N_WEBHOOK_SECRET}` (timing-safe compare) |
| Validação | Zod schema dedicado por rota |
| Idempotência | Sobrescrita (exceção: `briefing-markdown` versiona, `competitors` preserva manuais) |
| Códigos | `200` OK · `400` body inválido · `401` secret ausente/errado · `404` `store_id` inexistente · `500` erro interno |

### Helper de auth (referência)

```ts
// src/lib/api/n8n-auth.ts
requireWebhookSecret(request)  // lança AppError(401) se inválido
```

### Configuração no n8n

Criar **uma** credencial Header Auth e reaproveitar nos HTTP Request
nodes:

```
Header name:  x-webhook-secret
Header value: {{ $env.N8N_WEBHOOK_SECRET }}
```

Em cada HTTP Request:
- Method: POST
- Body: JSON (conforme schema da área)
- Continue on Fail: ✅ (uma falha não derruba o workflow inteiro)
- Retry: 3x · backoff 2s/8s/32s

---

## Resumo: endpoint × destino × UI

| Endpoint | Área da UI | Coluna(s) no banco | Componente renderizador |
|---|---|---|---|
| `POST /api/webhooks/n8n/brand` | 01 Perfil da Marca | `client_stores.brand_thesis`, `brand_about`, `brand_pillars`, `brand_presence` | `pesquisa-section.tsx` (área 01) |
| `POST /api/webhooks/n8n/store-story` | 02 Sobre a loja | `client_stores.store_story`, `store_milestones` | `pesquisa-section.tsx` (área 02) |
| `POST /api/webhooks/n8n/icp` | 03 Cliente Ideal | `client_stores.icp_persona`, `icp_demographics`, `icp_day_in_life`, `icp_motivations`, `icp_frictions` | `pesquisa-section.tsx` (área 03) |
| `POST /api/webhooks/n8n/tone` | 04 Tom de Comunicação | `client_stores.tone_description`, `tone_do`, `tone_dont`, `tone_use_words`, `tone_avoid_words` | `pesquisa-section.tsx` (área 04) |
| `POST /api/webhooks/n8n/ads-analyzer` | 05 Review dos Anúncios | `client_stores.ads_*` (`score`, `summary`, `sub_scores`, `strengths`, `opportunities`, `risks`, `reviewed_at`) | `pesquisa-section.tsx` (área 05) |
| `POST /api/webhooks/n8n/top-products` | Operação & catálogo | `store_top_products` (tabela) | `tab-contexto.tsx` (seção "Operação") |
| `POST /api/webhooks/n8n/competitors` | Concorrência | `client_competitors` (preserva `source='manual'`) | `tab-contexto.tsx` (seção "Concorrência") |
| `POST /api/webhooks/n8n/briefing-markdown` | Briefing completo (IA) | `store_briefings.briefing_data` (versionado) | `store-briefing-tab.tsx` |
| `POST /api/webhooks/n8n/pesquisa-completa` | — (gatilho) | — (dispara Architect + geração de email) | — |

---

## 1. `POST /api/webhooks/n8n/brand` — Perfil da Marca

Popula 4 campos da área "01 Perfil da Marca" da seção Pesquisa.

**Body:**
```ts
{
  store_id: string (uuid),
  thesis: string,                          // 10..500 chars — pull-quote
  about: string,                           // 40..4000 chars — parágrafos (\n\n)
  pillars: Array<{                         // exatamente 3 itens
    number: string,                        // ex: "01", "02", "03"
    label: string,                         // 1..60 chars
    text: string,                          // 1..500 chars
  }>,
  presence?: string | null,                // 0..2000 chars — opcional
}
```

**Renderização na UI:**
- `thesis` → quote-block grande no topo da seção
- `about` → parágrafos separados por `\n\n`
- `pillars[]` → 3 tiles na coluna direita (`PillarTile`)
- `presence` → parágrafo extra após `about`

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/brand \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-8297-4b25-8bde-d3cf90b13ffb",
    "thesis": "Vintage curado é mais que tendência: é identidade.",
    "about": "A Karm nasceu em 2021...\n\nHoje atende +50k clientes...",
    "pillars": [
      { "number": "01", "label": "Curadoria", "text": "Cada peça é selecionada manualmente." },
      { "number": "02", "label": "Origem", "text": "Trabalhamos só com fornecedores nacionais." },
      { "number": "03", "label": "Atemporal", "text": "Estética que atravessa décadas." }
    ],
    "presence": "Presença forte em Instagram e TikTok."
  }'
```

---

## 2. `POST /api/webhooks/n8n/store-story` — Sobre a loja

Popula a história da loja + marcos da operação (área "02 Sobre a loja").

**Body:**
```ts
{
  store_id: string (uuid),
  story: string,                           // 80..6000 chars — 3 parágrafos
  milestones: Array<{                      // 1..20 itens
    year: string,                          // ex: "2021", "ago/24"
    event: string,                         // 1..300 chars
    highlight?: boolean,                   // destaca a linha
    muted?: boolean,                       // esmaece a linha
  }>,
}
```

**Renderização:**
- `story` → parágrafos separados por `\n\n`
- `milestones[]` → tabela `FactRow` na coluna direita (ano + evento)

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/store-story \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "story": "Fundada em 2021 por Maria...\n\nEm 2023 abriu loja física...\n\nHoje opera 100% online.",
    "milestones": [
      { "year": "2021", "event": "Fundação no Instagram" },
      { "year": "2023", "event": "Abertura da loja física", "highlight": true },
      { "year": "2025", "event": "Migração para 100% online" }
    ]
  }'
```

---

## 3. `POST /api/webhooks/n8n/icp` — Cliente Ideal

Popula persona principal + demografia + dia-na-vida + motivações + fricções.

**Body:**
```ts
{
  store_id: string (uuid),
  persona: {                               // objeto fixo
    name: string,                          // 1..60 — ex: "Aline"
    age: string,                           // 1..40 — ex: "32 anos"
    city: string,                          // 1..80 — ex: "São Paulo - SP"
    monogram: string,                      // 1..4 — ex: "AL"
  },
  demographics: {                          // qualitativa (texto livre por campo)
    age_range: string,                     // ex: "30-40 anos"
    income: string,                        // ex: "R$ 8-15k"
    education: string,                     // ex: "Superior completo"
    occupation: string,                    // ex: "Designer freelancer"
    religion: string,                      // ex: "Sem religião"
  },
  day_in_life: string,                     // 80..4000 chars — 3 parágrafos
  motivations: Array<string>,              // 2..12 chips positivos
  frictions: Array<string>,                // 2..12 chips de hesitação
}
```

**Renderização:**
- `persona` → avatar circular com `monogram` + nome + "32 anos · São Paulo - SP"
- `demographics` → strip horizontal com 5 células (`DemoFact`)
- `day_in_life` → prose com parágrafos
- `motivations` → card verde "O que ela quer" (`MotivCard`)
- `frictions` → card amarelo "O que a faz hesitar"

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/icp \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "persona": { "name": "Aline", "age": "32 anos", "city": "São Paulo - SP", "monogram": "AL" },
    "demographics": {
      "age_range": "30-40 anos", "income": "R$ 8-15k",
      "education": "Superior completo", "occupation": "Designer freelancer",
      "religion": "Sem religião"
    },
    "day_in_life": "Acorda às 7h...\n\nAlmoço entre reuniões...\n\nNoite no Instagram.",
    "motivations": ["Peças únicas", "Sustentabilidade", "Apoiar marcas brasileiras"],
    "frictions": ["Preço acima da média", "Medo de tamanho errado", "Frete demorado"]
  }'
```

---

## 4. `POST /api/webhooks/n8n/tone` — Tom de Comunicação

Popula descrição do tom + frases-exemplo + glossário de palavras.

**Body:**
```ts
{
  store_id: string (uuid),
  description: string,                     // 60..2000 chars — parágrafos
  do_phrases: Array<string>,               // 2..12 (a UI mostra primeiras 4)
  dont_phrases: Array<string>,             // 2..12 (a UI mostra primeiras 4)
  use_words: Array<string>,                // 2..40 — glossário positivo
  avoid_words: Array<string>,              // 2..40 — glossário negativo
}
```

**Renderização:**
- `description` → prose
- `do_phrases[].slice(0,4)` → card verde "Como falamos" com check
- `dont_phrases[].slice(0,4)` → card vermelho "Como nunca falamos" com X
- `use_words[]` + `avoid_words[]` → glossário (`WordList`) ao fim

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/tone \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "description": "Fala próxima, sem formalidade. Usa gírias com moderação...",
    "do_phrases": ["Encontrei esse aqui pra você", "Olha que peça", "Vai amar"],
    "dont_phrases": ["Adquira já", "Não perca!", "Última chance"],
    "use_words": ["curado", "garimpado", "atemporal", "único"],
    "avoid_words": ["barato", "imperdível", "promoção", "liquidação"]
  }'
```

---

## 5. `POST /api/webhooks/n8n/ads-analyzer` — Review dos Anúncios

Popula score + análise dos ads (área "05 Review dos Anúncios"). Backend
seta `ads_reviewed_at = now()` automaticamente.

**Body:**
```ts
{
  store_id: string (uuid),
  score: number,                           // 0..100 — score geral (gauge grande)
  summary: string,                         // 40..2000 chars — abaixo do gauge
  sub_scores: {                            // 5 barras de progresso
    strategy: number,                      // 0..100
    creatives: number,
    targeting: number,
    diversification: number,
    tracking: number,
  },
  strengths: Array<{                       // 1..8 itens — verde
    what: string,                          // 2..160 — título
    body: string,                          // 10..800 — explicação
  }>,
  opportunities: Array<{ what, body }>,    // 1..8 itens — amarelo
  risks: Array<{ what, body }>,            // 0..8 itens — vermelho
}
```

**Renderização:**
- `score` → `ScoreGauge` circular (260px)
- `summary` → texto centrado abaixo do gauge
- `sub_scores` → 5 barras de progresso com labels traduzidas:
  Estratégia · Criativos · Segmentação · Diversificação · Tracking & dados
- `strengths/opportunities/risks` → `ReviewBlock` (3 cards verticais
  com tom diferente)

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/ads-analyzer \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "score": 72,
    "summary": "Boa estratégia mas pouca diversificação criativa.",
    "sub_scores": { "strategy": 80, "creatives": 65, "targeting": 70, "diversification": 55, "tracking": 90 },
    "strengths": [
      { "what": "Hook forte", "body": "Primeiros 3 segundos capturam atenção em 8 de 10 criativos." }
    ],
    "opportunities": [
      { "what": "Variar criativos", "body": "85% dos ads usam o mesmo formato carrossel..." }
    ],
    "risks": [
      { "what": "Dependência de Meta", "body": "98% do investimento em Facebook/Instagram." }
    ]
  }'
```

---

## 6. `POST /api/webhooks/n8n/top-products` — Operação & Catálogo

Substitui atomicamente a lista de top produtos da loja em
`store_top_products`. Usado pelo card "Top 5 produtos" abaixo dos
KPIs de operação.

**Body:**
```ts
{
  store_id: string (uuid),
  captured_at?: string (ISO 8601),         // default: now()
  products: Array<{                        // 1..50 itens
    rank: number,                          // 1..50 (único por loja)
    title: string,                         // 1..500
    price?: number | null,
    currency?: string | null,              // ex: "BRL"
    handle?: string | null,                // slug do produto na loja
    image_url?: string | null,             // URL completa
    external_id?: string | null,           // ID no TrendTrack
  }>,
}
```

**Comportamento:**
- DELETE `store_top_products WHERE store_id = ?`
- INSERT bulk dos novos
- `source = 'trendtrack'` (default)

**Renderização:** `tab-contexto.tsx` mostra os 5 primeiros (`?limit=5`)
como lista numerada com imagem 32×32 + título + preço alinhado à
direita. Endpoint de leitura: `GET /api/admin/stores/[id]/top-products`.

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/top-products \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "captured_at": "2026-05-18T12:00:00Z",
    "products": [
      { "rank": 1, "title": "Vestido Vintage Lily", "price": 289.90, "currency": "BRL", "handle": "vestido-lily", "image_url": "https://cdn.shopify.com/...", "external_id": "tt_001" },
      { "rank": 2, "title": "Calça Wide Leg 70s", "price": 199.90, "currency": "BRL" }
    ]
  }'
```

---

## 7. `POST /api/webhooks/n8n/competitors` — Concorrência

Sincroniza concorrentes vindos do n8n (origem TrendTrack ou outro)
**preservando concorrentes manuais**. A diferenciação é feita pela
coluna `client_competitors.source` (`'manual'` vs `'trendtrack'`).

**Body:**
```ts
{
  store_id: string (uuid),
  competitors: Array<{                     // 0..20 itens
    name: string,                          // 1..160
    url?: string | null,
    posicionamento?: "popular" | "similar" | "premium" | null,
    notas?: string | null,                 // 0..2000
  }>,
}
```

**Comportamento:**
- DELETE `client_competitors WHERE store_id = ? AND source = 'trendtrack'`
- INSERT dos novos com `source = 'trendtrack'`
- `source = 'manual'` (criados pela UI) **nunca são tocados**

**Renderização:** cards 3-colunas em `tab-contexto.tsx` (seção
"Concorrência"). Manuais e automáticos aparecem misturados.

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/competitors \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "competitors": [
      { "name": "Vintage Joy", "url": "https://vintagejoy.com.br", "posicionamento": "similar", "notas": "Sortimento parecido, preços 15% maiores." },
      { "name": "Garimpa", "url": "https://garimpa.com.br", "posicionamento": "popular" }
    ]
  }'
```

---

## 8. `POST /api/webhooks/n8n/briefing-markdown` — Briefing completo

Persiste o markdown final do briefing (saída completa do AI Agent)
versionando em `store_briefings`.

**Body:**
```ts
{
  store_id: string (uuid),
  markdown: string,                        // min 200 chars — markdown completo
  mode: "full" | "reduced" | "reduced-enriched",
  generated_at?: string (ISO 8601),        // default: now()
  model_used?: string,                     // ex: "claude-haiku-4-5"
  tokens_used?: number,
}
```

**Comportamento (versionamento):**
1. UPDATE `store_briefings SET status = 'archived' WHERE store_id = ? AND status = 'current'`
2. INSERT novo registro com `status = 'current'`, `generated_by = 'n8n:briefing-markdown'`
3. Metadados (`mode`, `model_used`, `tokens_used`) ficam dentro do
   `briefing_data` jsonb pois a tabela não tem colunas dedicadas.
4. **Dedup:** se o `markdown` for idêntico ao `current` do n8n, é no-op (não
   arquiva, não insere). `version = max(version)+1`.

> Este endpoint **não dispara** a geração de email. O gatilho do Architect +
> copy é o `pesquisa-completa` (seção 9).

**Estrutura final de `briefing_data`:**
```json
{
  "markdown": "# Briefing — Karm 1\n\n## Snapshot\n...",
  "mode": "full",
  "model_used": "claude-haiku-4-5",
  "tokens_used": 4231
}
```

**Renderização:** `store-briefing-tab.tsx` lê `briefing_data.markdown`
e renderiza com React-Markdown.

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/briefing-markdown \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "store_id": "5b33926a-...",
    "markdown": "# Briefing — Karm 1\n\n## Snapshot\nLoja de vintage...",
    "mode": "full",
    "generated_at": "2026-05-18T13:42:00Z",
    "model_used": "claude-haiku-4-5",
    "tokens_used": 4231
  }'
```

---

## 9. `POST /api/webhooks/n8n/pesquisa-completa` — Gatilho da geração de email

Sinal explícito de que a **Pesquisa & Diagnóstico** (5 pilares: marca/loja/ICP/
tom/ads) terminou. **Deve ser o ÚLTIMO passo** do workflow de pesquisa, chamado
depois de `brand` + `store-story` + `icp` + `tone` + `ads-analyzer`.

Dispara, em background (`after`), o `dispatchEmailCopyWebhook`:
1. **Architect** — Montador monta o HTML de referência + Blueprint extrai a
   estrutura, ambos usando a Pesquisa & Diagnóstico serializada
   (`pesquisaToFullText`). Grava `store_email_references` + `store_email_blueprints`.
2. Seed/reconcile dos blocks da blueprint.
3. POST do payload rico (com `pesquisa_diagnostico`) ao `N8N_EMAIL_COPY_WEBHOOK_URL`
   → emails `draft → in_progress`.

**Idempotência:** não re-dispara se a loja já tem um batch em andamento/concluído
(emails fora de `draft`/`failed`) — retorna `{ ok:false, reason:"batch_in_progress" }`.

**Body:**
```ts
{
  store_id: string (uuid),
}
```

**Resposta:** `200 { store_id, triggered: true }` (o disparo roda em background;
falha do dispatch não derruba o 200).

**Exemplo cURL:**
```bash
curl -X POST https://admin.convertfy.com.br/api/webhooks/n8n/pesquisa-completa \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $N8N_WEBHOOK_SECRET" \
  -d '{ "store_id": "5b33926a-..." }'
```

---

## Formato de erro padronizado

Todos os endpoints retornam erros no formato:

```json
{
  "error": "Dados inválidos",
  "code": "VALIDATION_ERROR",
  "details": {
    "thesis": ["String must contain at least 10 character(s)"]
  }
}
```

| HTTP | Quando |
|---|---|
| `400` | Body não passa pelo Zod schema. `details` contém erros por campo. |
| `401` | Header `x-webhook-secret` ausente ou diferente do env. |
| `404` | `store_id` não encontrado em `client_stores`. |
| `500` | Erro de banco ou inesperado. Detalhe gravado no logger; resposta genérica para o cliente. |

## Tabela de logging

Cada endpoint loga sucesso com prefixo curto identificando a área:

```
[n8n:brand] persisted             { store_id: "..." }
[n8n:store-story] persisted       { store_id: "...", milestones: 3 }
[n8n:icp] persisted               { store_id: "..." }
[n8n:tone] persisted              { store_id: "..." }
[n8n:ads-analyzer] persisted      { store_id: "...", score: 72 }
[n8n:top-products] persisted      { store_id: "...", inserted: 5 }
[n8n:competitors] persisted       { store_id: "...", inserted: 2 }
[n8n:briefing-markdown] persisted { store_id: "...", briefing_id: "...", mode: "full" }
```

Erros via `errorResponse(...)` com mesmo prefixo no `context`.

## Verificação manual

```bash
# 1. Sem secret → 401
curl -X POST https://.../api/webhooks/n8n/brand -d '{}'

# 2. Body vazio → 400 com details Zod
curl -X POST https://.../api/webhooks/n8n/brand \
  -H "x-webhook-secret: $SECRET" -d '{}'

# 3. store_id inexistente → 404
curl -X POST https://.../api/webhooks/n8n/brand \
  -H "x-webhook-secret: $SECRET" \
  -d '{"store_id": "00000000-0000-0000-0000-000000000000", ...}'

# 4. Payload válido → 200
curl -X POST https://.../api/webhooks/n8n/brand \
  -H "x-webhook-secret: $SECRET" \
  -d '@./examples/brand.json'

# 5. Re-chamada com mesmo store_id → 200, sobrescreve
```

Para `briefing-markdown`: cada POST cria um novo registro e arquiva o
anterior. Histórico fica acessível filtrando por `status = 'archived'`.

Para `competitors`: criar um competitor manual via UI antes, postar no
endpoint, verificar que o manual continua presente.

---

*Última atualização: 2026-05-18*
