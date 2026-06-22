# n8n Flow — Campaign Copy Generation (Central de Campanhas)

Este flow gera a **copy de cada loja** das campanhas da Central. Substitui a geração interna
(que roda como _fallback_ quando o n8n não responde). **Sem dependência de Google Docs / Drive** —
toda a master e o contexto vêm no payload do webhook + no endpoint de contexto por loja.

> **Ponto-chave:** geração de **teste (piloto)** e de **produção (rollout)** usam **o MESMO
> webhook**. A única diferença é o campo `mode` (`"test"` | `"production"`) no payload — e o array
> `pilot_references`, que só vem preenchido em produção. O callback devolve o mesmo `mode`, e é ele
> que decide se a copy cai em `copy_results.test[store_id]` ou `copy_results.production[store_id]`.

---

## 1. Visão geral do fluxo

```
CopyPanel (admin)
   │  POST /api/admin/campaign-central/suggestions/{id}/generate-copy  { mode, store_ids }
   ▼
dispatchCampaignCopyToN8n()
   │  • marca cada loja como status="pending" em copy_results[mode]
   │  • cria job em campaign_copy_jobs (rastreio)
   │  • POST  →  N8N_CAMPAIGN_COPY_WEBHOOK_URL   (header x-webhook-secret)
   ▼
n8n (este flow)
   │  para cada loja em stores[]:
   │    1. GET  context_url_template (com {store_id})   → contexto da loja
   │    2. gera/adapta a copy no idioma da loja
   │    3. POST callback.url   (1 request por loja)
   ▼
POST /api/webhooks/n8n/campaign-copy   (1 por loja)
   │  grava em copy_results[mode][store_id], atualiza o job
   ▼
UI faz polling de 4s e mostra a copy (ou o erro) por loja
```

Se o n8n não devolver tudo em ~10min, o **watchdog** (cron) gera as lojas pendentes _inline_
(Anthropic direto) e marca o job como concluído — callbacks atrasados passam a ser descartados.

---

## 2. Entradas e saídas

**Trigger:** Webhook node recebe `POST` em `N8N_CAMPAIGN_COPY_WEBHOOK_URL` com header
`x-webhook-secret` (igual a `N8N_WEBHOOK_SECRET`).

**Contexto por loja:** HTTP Request `GET` no `context_url_template` (vem no payload), trocando
`{store_id}` pelo id de cada loja, com header `x-webhook-secret`.

**Saída:** HTTP Request `POST` para `callback.url` (vem no payload) com
`x-webhook-secret: {{callback.secret}}` — **um POST por loja** (streaming).

---

## 3. Payload de ENTRADA (admin → n8n)

Disparado em `campaign-copy-dispatch.service.ts:250-277`.

```json
{
  "event": "campaign_copy.requested",
  "timestamp": "2026-06-22T12:00:00.000Z",
  "job_id": "uuid",
  "suggestion_id": "uuid",
  "org_id": "uuid",
  "mode": "test",
  "callback": {
    "url": "https://app.convertfy.me/api/webhooks/n8n/campaign-copy",
    "secret": "••• (use no header x-webhook-secret do callback)"
  },
  "context_url_template": "https://app.convertfy.me/api/admin/campaign-central/stores/{store_id}/context",
  "master": {
    "subject": "Assunto da master",
    "preheader": "Preheader da master",
    "strategy": "Resumo da estratégia/ângulo",
    "blocks": [ /* EmailDraftBlock[] — estrutura do email a ser adaptado */ ]
  },
  "campaign": {
    "title": "Black Friday Antecipada",
    "type": "email",
    "angle": "primeiros compradores merecem desconto",
    "trigger": { "label": "...", "detail": "...", "source": "..." },
    "send_date": "2026-11-29"
  },
  "stores": [
    { "store_id": "uuid", "store_name": "Loja A", "language": "pt-BR", "country": "BR" }
  ],
  "pilot_references": [
    {
      "store_id": "uuid",
      "store_name": "Loja Piloto",
      "language": "pt-BR",
      "copy": { "subject": "...", "preheader": "...", "strategy": "...", "blocks": [] }
    }
  ]
}
```

| Campo | Observação |
|-------|------------|
| `mode` | `"test"` (piloto) ou `"production"` (rollout). **Deve ser ecoado no callback.** |
| `master` | Copy "mãe" da campanha — o flow adapta isso para cada loja (idioma/tom/produtos). |
| `stores[]` | Lojas que ESTE dispatch deve gerar. Itere sobre elas. |
| `pilot_references[]` | **Só vem preenchido em `mode:"production"`** — até 2 lojas piloto aprovadas (`quality:"good"`), para usar como _few-shot_ e manter o tom no rollout. Em `mode:"test"` vem `[]`. |
| `job_id` / `suggestion_id` | Devem ser ecoados em **todos** os callbacks. |

---

## 4. Endpoint de CONTEXTO por loja (n8n → admin)

`GET {context_url_template}` com `{store_id}` substituído, header `x-webhook-secret`.
Fonte: `src/app/api/admin/campaign-central/stores/[id]/context/route.ts`. Resposta:

```json
{
  "store_id": "uuid",
  "store_name": "Loja A",
  "store_url": "https://...",
  "platform": "shopify",
  "language": "pt-BR",
  "niche": "moda",
  "country": "BR",
  "currency": "BRL",
  "briefing": { "marca": { }, "briefing": { } },
  "pesquisa_diagnostico": "texto livre serializado…",
  "pesquisa_estruturada": {
    "brand": { "thesis", "about", "pillars", "presence" },
    "story": { "story", "milestones" },
    "icp":   { "persona", "demographics", "day_in_life", "motivations", "frictions" },
    "tone":  { "description", "do", "dont", "use_words", "avoid_words" },
    "ads":   { "score", "summary", "sub_scores", "strengths", "opportunities", "risks", "reviewed_at" }
  },
  "positioning": { "slogan", "diferencial", "persona", "tom_de_voz", "posicionamento_preco", "hashtags" },
  "brand_identity": { "logo_url", "primary_colors", "secondary_colors", "font_heading", "font_body", "voice" },
  "top_products": [
    { "rank": 1, "name": "Produto", "price": "199.00", "currency": "BRL", "image_url": "...", "url": "...", "external_id": "..." }
  ]
}
```

Use `language`/`tone`/`positioning`/`top_products` para adaptar a master ao idioma e à voz da loja.
É o **mesmo formato** do pipeline de email (familiaridade entre os dois flows).

---

## 5. Estrutura recomendada do flow

1. **Webhook (POST)** — recebe e valida o payload de entrada.
2. **Split In Batches** sobre `stores[]`.
3. **HTTP Request (GET)** no `context_url_template` da loja (`x-webhook-secret`) → contexto.
4. **Geração/adaptação da copy** — adapta `master` ao idioma/tom da loja usando o contexto.
   Em `mode:"production"`, use `pilot_references[]` como referência de qualidade/tom.
   > O **prompt e o modelo** são definição do time (fora do escopo deste documento). Como referência
   > funcional, a geração interna de _fallback_ (`generateCampaignCopy` em
   > `src/lib/services/campaign-central/campaign-copy.service.ts`) produz exatamente o mesmo formato
   > de saída esperado no callback.
5. **HTTP Request (POST)** para `callback.url` (`x-webhook-secret: callback.secret`) — **1 por loja**
   (ver §6). Em caso de erro na loja, mandar `status:"error"` + `error_message` e **seguir para as
   demais**.

---

## 6. Payload de VOLTA / callback (n8n → admin)

`POST {callback.url}`, header `x-webhook-secret`, **um request por loja**.
Validado por `campaignCopyCallbackSchema` (`src/lib/validations/campaign-central.ts:196-213`);
gravado em `src/app/api/webhooks/n8n/campaign-copy/route.ts:165-211`.

**Sucesso:**
```json
{
  "job_id": "uuid",
  "suggestion_id": "uuid",
  "store_id": "uuid",
  "mode": "test",
  "status": "success",
  "copy": {
    "subject": "Assunto adaptado (≤ ~50 chars recomendado)",
    "preheader": "Preheader adaptado (≤ ~90 chars)",
    "strategy": "Resumo opcional da estratégia",
    "blocks": [ /* EmailDraftBlock[] — min 1 bloco; `id` opcional (o servidor regenera) */ ]
  },
  "meta": { "model": "…", "tokens_input": 0, "tokens_output": 0, "duration_ms": 0 }
}
```

**Erro:**
```json
{
  "job_id": "uuid",
  "suggestion_id": "uuid",
  "store_id": "uuid",
  "mode": "test",
  "status": "error",
  "error_message": "descrição do que falhou nesta loja"
}
```

Regras do receiver:
- `job_id` + `suggestion_id` + `mode` precisam **bater com o job** original (senão `400`).
- `status:"success"` **exige** `copy` (senão `400`).
- `copy.blocks` segue o tipo `EmailDraftBlock` (`type` ∈ image/heading/text/offer/button/divider/footer/products`; `headline`/`sub`/`value`/`caption`/`columns`/`items` conforme o tipo). `id` pode ser omitido.
- `meta` é opcional (telemetria — vai para `campaign_ai_runs`).

---

## 7. Roteamento teste vs produção (onde cada copy cai)

O receiver usa `mode` + `store_id` do callback para escrever no lugar certo:

| `mode` do callback | Onde grava |
|--------------------|------------|
| `"test"` | `campaign_suggestions.copy_results.test[store_id]` |
| `"production"` | `campaign_suggestions.copy_results.production[store_id]` |

Por isso **o callback precisa devolver o mesmo `mode`** que veio no payload de entrada. Cada loja
é um request independente — a ordem não importa e uma loja não afeta a outra.

---

## 8. Erros, timeout e fallback inline

- **Falha por loja** não derruba as outras — mande `status:"error"` para a loja que falhou e siga.
- **Watchdog** (`src/app/api/cron/campaign-copy-watchdog/route.ts`, cron a cada 5min): se o job ficar
  parado por mais de `WATCHDOG_CAMPAIGN_COPY_TIMEOUT_MIN` (default **10min**), ele é promovido a
  `fallback_inline` e as lojas ainda `pending` são geradas **inline** (Anthropic direto).
- Depois do fallback, **callbacks atrasados do n8n são descartados** (`route.ts:119-132`) para evitar
  corrida com o run inline.
- **Timeout sugerido por loja no n8n:** ~60s.

---

## 9. Status no app + polling

`copy_results[mode][store_id].status`:

- `pending` — dispatch saiu, aguardando o n8n (UI mostra spinner).
- `success` — callback recebido (UI mostra a copy + permite marcar **"Boa"**).
- `error` — callback de erro (UI mostra o `error_message`).

A UI (`copy-panel.tsx:184-225`) **relê a sugestão a cada 4s** até nenhuma loja ficar `pending`.
Não há SSE/WebSocket — é polling simples.

---

## 10. Segurança & idempotência

- **Auth:** header `x-webhook-secret` comparado com `N8N_WEBHOOK_SECRET` via `timingSafeEqual`
  (`src/lib/api/n8n-auth.ts`). Vale para o **callback** e para o **endpoint de contexto**.
- **Idempotência:** um callback `success` **não sobrescreve** uma copy já marcada `quality:"good"`
  pelo COO (`route.ts:151-163`) — re-disparos são seguros. Re-callback após erro sobrescreve
  normalmente (recovery).

---

## 11. Variáveis de ambiente

| Var | Uso | Default |
|-----|-----|---------|
| `N8N_CAMPAIGN_COPY_WEBHOOK_URL` | URL do webhook de dispatch (admin → n8n). **Sem ela, não dispara** (o watchdog acaba gerando inline). | — |
| `N8N_WEBHOOK_SECRET` | Secret do header `x-webhook-secret` (dispatch, callback e contexto). | — |
| `NEXT_PUBLIC_APP_URL` | Hostname para montar `callback.url` e `context_url_template` (fallback: `VERCEL_URL`). | `http://localhost:3000` |
| `WATCHDOG_CAMPAIGN_COPY_TIMEOUT_MIN` | Minutos até o watchdog promover um job travado para fallback inline. | `10` |
| `WATCHDOG_CAMPAIGN_COPY_BATCH` | Máximo de jobs processados por tick do watchdog. | `5` |

---

## 12. Checklist de teste E2E

1. Configurar `N8N_CAMPAIGN_COPY_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET` + `NEXT_PUBLIC_APP_URL`.
2. No CopyPanel, selecionar 2-3 lojas piloto e **gerar piloto** (`mode:"test"`).
3. Conferir que o n8n recebeu o payload, fez `GET` no contexto de cada loja, e fez `POST` no callback
   por loja → `copy_results.test[store_id]` populado, status `success`.
4. Marcar pelo menos 1 loja como **"Boa"** (`quality:"good"`).
5. **Gerar rollout** (`mode:"production"`) → conferir que `pilot_references` chegou preenchido no
   payload e que `copy_results.production[store_id]` populou.
6. Forçar timeout (n8n offline) e validar o **fallback inline**: o job vira `fallback_inline` e a copy
   é gerada mesmo assim (telemetria `generated_via:"inline_fallback"` em `campaign_ai_runs`).

---

## 13. Referências (código)

| O quê | Arquivo |
|-------|---------|
| Dispatch + payload de ida | `src/lib/services/campaign-central/campaign-copy-dispatch.service.ts:91-357` (payload `:250-277`) |
| Endpoint disparado pela UI | `src/app/api/admin/campaign-central/suggestions/[id]/generate-copy/route.ts` |
| Endpoint de contexto da loja | `src/app/api/admin/campaign-central/stores/[id]/context/route.ts` |
| Callback (persistência) | `src/app/api/webhooks/n8n/campaign-copy/route.ts:52-283` |
| Schema Zod do callback | `src/lib/validations/campaign-central.ts:196-213` |
| Auth do webhook | `src/lib/api/n8n-auth.ts` |
| Watchdog / fallback inline | `src/app/api/cron/campaign-copy-watchdog/route.ts` · `src/lib/services/campaign-central/campaign-copy.service.ts` |
| Polling da UI | `src/components/campaign-central/copy-panel.tsx:184-225` |
| Tipos (`CopyResultEntry`, `EmailDraftBlock`) | `src/types/campaign-central.ts` |
