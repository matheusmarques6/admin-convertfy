# n8n Flow — Campaign Copy Generation (Central de Campanhas)

Este flow gera a **copy de cada loja** das campanhas da Central. Substitui a geração interna
(que roda como _fallback_ quando o n8n não responde). **Sem dependência de Google Docs / Drive** —
toda a master e o contexto vêm no payload do webhook + no endpoint de contexto por loja.

> **Ponto-chave:** geração de **teste (piloto)** e de **produção** usam **o MESMO webhook**. A
> única diferença é o campo `mode` (`"test"` | `"production"`) no payload — e o array
> `pilot_references`, que só vem preenchido em produção. O callback devolve o mesmo `mode`, e é ele
> que decide se a copy cai em `copy_results.test[store_id]` ou `copy_results.production[store_id]`.
>
> **Quem dispara cada `mode`:** o **teste** é disparado manualmente no CopyPanel ("Gerar copy"). A
> **produção NÃO é mais um botão manual** — ela é disparada **automaticamente quando o COO aprova a
> campanha**: `approveSuggestion()` chama `dispatchCampaignCopyToN8n({ mode: "production" })` para
> **todas as lojas-alvo**, usando as copies de teste `quality:"good"` como `pilot_references`. Ver
> `src/lib/services/campaign-central/suggestion-approval.service.ts`. Se o dispatch falhar (n8n
> fora), a aprovação não é revertida — o watchdog gera o fallback inline.

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
    "blocks": [ { "type": "text", "value": "A ESTRUTURA/copy inteira num único bloco de texto" } ]
  },
  "brief": {
    "structure": "A 'Estrutura & tom da copy' do COO — o TEMA a seguir (placeholders [NÚMERO]/[NOME]/… intactos)",
    "sections": [
      { "tag": "HERO", "instructions": "Abertura com gancho" },
      { "tag": "REVIEW", "instructions": "Depoimentos verificados" }
    ],
    "tone": "Tom de voz desejado (ou null)",
    "constraints": "Restrições (ou null)",
    "must_include": "O que a copy deve incluir (ou null)"
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
| `master` | Conteúdo "mãe" a adaptar para cada loja (idioma/tom). **`master.blocks` vem como UM único bloco `text` com a estrutura/copy inteira** (mantém os marcadores `## SEÇÃO`; ver §6 para o formato de volta). Quando `brief.structure` existe, `master` reflete essa estrutura literal (subject/preheader/strategy vêm vazios — você os gera). |
| `brief` | A **"Estrutura & tom da copy" do COO** — o TEMA mestre. **SIGA-A À RISCA:** mesmas seções, mesma ordem. Preencha placeholders (`[NÚMERO]`, `[NOME]`, `[Texto do depoimento…]`) com dados reais quando houver; senão mantenha o placeholder. **NÃO invente seções (grid de produtos, ofertas) que não estão na estrutura.** |
| `brief.sections` | Seções extraídas da estrutura (`[{ "tag": "HERO", "instructions": "…" }]`) — o contrato das seções esperadas. **Gere a copy seção a seção e devolva cada uma marcada com `## TAG`** (ver §6). Vazio quando a estrutura não usa `## SEÇÃO`. |
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

Use `language`/`tone`/`positioning` para adaptar ao idioma e à voz da loja. **`top_products` só deve ser usado se a estrutura/`brief` pedir um bloco de produtos** — NÃO monte um grid de produtos por conta própria quando a estrutura do COO não tem um.
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
    "blocks": [
      { "type": "heading", "headline": "Novidades que combinam com você" },
      { "type": "text", "value": "Selecionamos peças pensando no seu estilo." },
      { "type": "products", "columns": 3, "items": [
          { "name": "Vestido Lia", "price": "R$ 189", "image_caption": "Vestido midi off-white" }
      ]},
      { "type": "button", "value": "Ver coleção" }
    ]
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
- **`copy.subject` é obrigatório e não pode ser vazio** (o admin valida `min(1)`). Como
  `master.subject` chega **vazio** quando há `brief.structure`, **é o n8n que gera** o `subject`
  (≤ ~50 chars) e o `preheader` (≤ ~90 chars) a partir da estrutura/tema. No nó que monta o
  callback ("Preparador"), mapeie `copy.subject`/`copy.preheader` **do output do modelo** — nunca
  de `master.*` (que vem vazio).
  > ⚠️ **Rede de segurança (jun/2026):** se o `subject` ainda vier vazio, o admin **não rejeita
  > mais** — deriva um assunto provisório da 1ª linha da copy (`deriveSubjectFromCopy`) e loga
  > `campaign_copy.subject_derived`. Isso destrava a UI, mas o assunto sai pior; **o n8n deve
  > mandar o subject pronto.** Só continua `400` se a copy vier sem texto algum.
- `copy.blocks` — **use BLOCOS TIPADOS** (o admin **preserva** o tipo e os campos). Tipos e campos:
  - `heading` → `headline` (+ `sub` opcional)
  - `text` → `value`
  - `products` → `columns` (2 ou 3) + `items: [{ name, price, image_caption }]`
  - `button` → `value`
  - também aceitos: `image` (`caption`), `offer` (`value`), `divider`, `footer`
  - `id` é opcional (o servidor regenera). O campo `section` opcional rotula o bloco numa seção
    (HERO/REVIEW/FOOTER…, os mesmos `tag` de `brief.sections`) — a UI mostra o rótulo acima do bloco.
  - **Fallback (compat):** se o n8n mandar só texto, ainda funciona — UM bloco
    `{ "type": "text", "value": "## HERO\n…\n## REVIEW\n…" }` é fatiado por seção pelos marcadores
    `## NOME`. Mas o formato **preferido agora é blocos tipados**.
  - ⚠️ Nos `value`/`headline`, mantenha os placeholders entre colchetes (`[NÚMERO]`, `[NOME]`,
    `[LOGO]`) quando ainda não houver dado real.
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

## 8. Webhook de conclusão da produção (Copy → Design)

Depois de mandar **todos** os callbacks por loja da §6 de um lote de **produção**, o n8n faz **UM
único POST final** sinalizando que a geração de copy da campanha inteira terminou. Esse sinal é o
que **avança o card do board de Copy → Design** sem ninguém clicar "Concluir copy" no admin.

> **Só em produção.** O lote de **teste** (piloto) **não** dispara este webhook — teste não move o
> board. Se o n8n chamar com `mode:"test"`, o admin responde `200` e ignora (no-op).

**Endpoint:** `POST /api/webhooks/n8n/campaign-copy-complete`
Validado por `campaignCopyCompleteSchema`; handler em
`src/app/api/webhooks/n8n/campaign-copy-complete/route.ts`.

**Quando chamar:** uma vez, ao concluir o último callback por loja do lote de **produção** (todas as
lojas de `stores[]` já tiveram o callback da §6 enviado, com sucesso ou erro).

**Payload:**
```json
{
  "job_id": "uuid",
  "suggestion_id": "uuid",
  "org_id": "uuid",
  "mode": "production"
}
```

| Campo | Observação |
|-------|------------|
| `job_id` | O mesmo `job_id` do payload de entrada da §3 (rastreio). |
| `suggestion_id` | O mesmo `suggestion_id` ecoado nos callbacks. |
| `org_id` | O mesmo `org_id` do payload de entrada. |
| `mode` | **Precisa ser `"production"`** para mover o board. `"test"` → no-op `200`. |

**Auth:** header `x-webhook-secret` (igual a `N8N_WEBHOOK_SECRET`) — o mesmo dos demais webhooks.

**Efeito (idempotente):**
1. **Garante as tasks de design "estrutura"** — rede de segurança. Em geral já foram criadas na
   aprovação da campanha (`approveSuggestion → instantiateCampaignStage`); re-instanciar é no-op.
2. **Avança o board Copy → Design** — seta `prod_stage = 1` em todas as `target_stores` do
   pipeline item. O board deriva a coluna do `max(prod_stage)`; `prod_stage=1` é a coluna **Design**.

**Idempotência & tolerância a falha:**
- Re-chamar **não duplica** tasks nem regride o board (lojas já em `prod_stage ≥ 1` são puladas).
- Se a campanha ainda **não está aprovada** ou sem `pipeline_item_id`, o admin responde `200` e
  ignora (no-op) — o webhook nunca é o caminho crítico da aprovação.
- Falha ao garantir as tasks **não bloqueia** o avanço do board (loga e segue).

**Resposta de sucesso:**
```json
{ "ok": true, "suggestion_id": "uuid", "stores_moved": 3 }
```

> ℹ️ Este webhook é a **escolha explícita** de deixar o n8n sinalizar o fim do lote. Como
> alternativa, o próprio callback por loja da §6 poderia avançar o board ao detectar que foi o
> último da produção — mas o contrato atual é este POST final dedicado.

---

## 9. Erros, timeout e fallback inline

- **Falha por loja** não derruba as outras — mande `status:"error"` para a loja que falhou e siga.
- **Watchdog** (`src/app/api/cron/campaign-copy-watchdog/route.ts`, cron a cada 5min): se o job ficar
  parado por mais de `WATCHDOG_CAMPAIGN_COPY_TIMEOUT_MIN` (default **10min**), ele é promovido a
  `fallback_inline` e as lojas ainda `pending` são geradas **inline** (Anthropic direto).
- Depois do fallback, **callbacks atrasados do n8n são descartados** (`route.ts:119-132`) para evitar
  corrida com o run inline.
- **Timeout sugerido por loja no n8n:** ~60s.

---

## 10. Status no app + polling

`copy_results[mode][store_id].status`:

- `pending` — dispatch saiu, aguardando o n8n (UI mostra spinner).
- `success` — callback recebido (UI mostra a copy + permite marcar **"Boa"**).
- `error` — callback de erro (UI mostra o `error_message`).

A UI (`copy-panel.tsx:184-225`) **relê a sugestão a cada 4s** até nenhuma loja ficar `pending`.
Não há SSE/WebSocket — é polling simples.

---

## 11. Segurança & idempotência

- **Auth:** header `x-webhook-secret` comparado com `N8N_WEBHOOK_SECRET` via `timingSafeEqual`
  (`src/lib/api/n8n-auth.ts`). Vale para o **callback** e para o **endpoint de contexto**.
- **Idempotência:** um callback `success` **não sobrescreve** uma copy já marcada `quality:"good"`
  pelo COO (`route.ts:151-163`) — re-disparos são seguros. Re-callback após erro sobrescreve
  normalmente (recovery).

---

## 12. Variáveis de ambiente

| Var | Uso | Default |
|-----|-----|---------|
| `N8N_CAMPAIGN_COPY_WEBHOOK_URL` | URL do webhook de dispatch (admin → n8n). **Sem ela, não dispara** (o watchdog acaba gerando inline). | — |
| `N8N_WEBHOOK_SECRET` | Secret do header `x-webhook-secret` (dispatch, callback e contexto). | — |
| `NEXT_PUBLIC_APP_URL` | Hostname para montar `callback.url` e `context_url_template` (fallback: `VERCEL_URL`). | `http://localhost:3000` |
| `WATCHDOG_CAMPAIGN_COPY_TIMEOUT_MIN` | Minutos até o watchdog promover um job travado para fallback inline. | `10` |
| `WATCHDOG_CAMPAIGN_COPY_BATCH` | Máximo de jobs processados por tick do watchdog. | `5` |

---

## 13. Checklist de teste E2E

1. Configurar `N8N_CAMPAIGN_COPY_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET` + `NEXT_PUBLIC_APP_URL`.
2. No CopyPanel, selecionar 2-3 lojas piloto e **gerar piloto** (`mode:"test"`).
3. Conferir que o n8n recebeu o payload, fez `GET` no contexto de cada loja, e fez `POST` no callback
   por loja → `copy_results.test[store_id]` populado, status `success`.
4. Marcar pelo menos 1 loja como **"Boa"** (`quality:"good"`).
5. **Aprovar a campanha** → o approve dispara `mode:"production"` automaticamente para todas as
   lojas-alvo. Conferir que `pilot_references` chegou preenchido no payload e que
   `copy_results.production[store_id]` populou.
6. Ao terminar todos os callbacks da produção, o n8n faz o **POST de conclusão** (§8) em
   `/api/webhooks/n8n/campaign-copy-complete` com `mode:"production"`. Conferir que o card foi para
   **Design** (`target_stores[].prod_stage=1`) e que as tasks de **"estrutura"** estão presentes.
   Re-postar o mesmo payload **não** duplica tasks nem regride o board (idempotência).
7. Forçar timeout (n8n offline) e validar o **fallback inline**: o job vira `fallback_inline` e a copy
   é gerada mesmo assim (telemetria `generated_via:"inline_fallback"` em `campaign_ai_runs`).

---

## 14. Referências (código)

| O quê | Arquivo |
|-------|---------|
| Dispatch + payload de ida | `src/lib/services/campaign-central/campaign-copy-dispatch.service.ts:91-357` (payload `:250-277`) |
| Endpoint disparado pela UI | `src/app/api/admin/campaign-central/suggestions/[id]/generate-copy/route.ts` |
| Endpoint de contexto da loja | `src/app/api/admin/campaign-central/stores/[id]/context/route.ts` |
| Callback (persistência) | `src/app/api/webhooks/n8n/campaign-copy/route.ts:52-283` |
| Webhook de conclusão (Copy → Design) | `src/app/api/webhooks/n8n/campaign-copy-complete/route.ts` |
| Schema Zod do callback | `src/lib/validations/campaign-central.ts:196-213` |
| Schema Zod da conclusão | `campaignCopyCompleteSchema` em `src/lib/validations/campaign-central.ts` |
| Instanciação das tasks de design | `src/lib/services/campaign-central/campaign-design-instantiate.service.ts` |
| Avanço do board (prod_stage) | `src/lib/services/campaign-central/production.service.ts` (`updateProductionStore`) |
| Auth do webhook | `src/lib/api/n8n-auth.ts` |
| Watchdog / fallback inline | `src/app/api/cron/campaign-copy-watchdog/route.ts` · `src/lib/services/campaign-central/campaign-copy.service.ts` |
| Polling da UI | `src/components/campaign-central/copy-panel.tsx:184-225` |
| Tipos (`CopyResultEntry`, `EmailDraftBlock`) | `src/types/campaign-central.ts` |
