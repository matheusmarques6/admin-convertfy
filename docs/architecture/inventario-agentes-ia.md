# Inventário de Agentes de IA — admin-convertfy

> Mapa completo de **todo uso de LLM** no código: quando cada agente é ativado,
> o que recebe (input), qual prompt usa e o que produz (output). Inclui modelo,
> custo relativo e se há cache/reuso (onde o dinheiro pode vazar).
>
> Última varredura: Junho/2026. Fonte canônica dos prompts versionados =
> `email_agent_configs` (pipeline AE + campaign-central) e `crm_ai_actions` (CRM).
> Os prompts dos "avulsos" são **hardcoded** no próprio arquivo de rota/serviço.

## Como ler

- **Ativação** = o que dispara o agente (call site + condição).
- **Cache** = se já existe resultado salvo, ele **reusa** (não paga LLM) ou **roda do zero**.
- 💰 = agente caro (Opus 4.8 ou modelo de imagem). Os demais (Sonnet/Haiku) são baratos.
- Toda chamada grava telemetria de custo; tudo é unificado na VIEW `ai_usage_unified`.

---

## Tabela mestra (24 usos de LLM)

| # | Agente | Subsistema | Arquivo | Modelo | Quando dispara | Cache? |
|---|--------|-----------|---------|--------|----------------|--------|
| 1 | Briefing | Email AE | `briefing-generation.service.ts` | sonnet-4-6 → gpt-5.3-chat → template | Cliente envia formulário | Só re-roda se respostas mudaram |
| 2 | Pesquisa & Diagnóstico | Email AE | n8n + `webhooks/n8n/*` | externo (n8n) | n8n termina cada pilar | Sobrescreve sempre |
| 3 | **Montador** 💰 | Email AE | `architect/component-assembler.service.ts` | **gpt-5.4** (reasoning medium) | cron dispatch / `/generate-blueprints` / **teste** | ✅ natural / ❌ teste e manual |
| 4 | Blueprint | Email AE | `architect/blueprint-generator.service.ts` | sonnet-4.6 | junto com o Montador | segue o Montador |
| 5 | Copy | Email AE | `email-copy-webhook.service.ts` (+ `copy.chain.ts` fallback) | n8n / sonnet-4.6 (fallback) | dispatch após research / manual / watchdog | só blocos vazios |
| 6 | Imagem 💰 | Email AE | `chains/image.chain.ts` | **gpt-5.4-image-2** | fase 2 (após copy) | ❌ sempre roda por bloco |
| 7 | HTML | Email AE | `chains/html.chain.ts` | sonnet-4.6 | fase 2 (após imagem) | ❌ sempre roda |
| 8 | QA | Email AE | `chains/qa.chain.ts` | sonnet-4.6 | fase 2 (após HTML) | ❌ sempre roda |
| 8.5 | QA Vision | Email AE | `chains/qa-vision.chain.ts` | sonnet-4-6 (vision) | gated por `EMAIL_QA_VISION_ENABLED` | ❌ |
| 9 | Trends (web search) | Campaign | `campaign-central/trends.service.ts` | sonnet-4-6 `:online` | cron semanal / re-gerar | por ciclo |
| 10 | Suggestions | Campaign | `campaign-central/suggestion-engine.service.ts` | sonnet-4-6 | cron semanal / re-gerar | por ciclo |
| 11 | Copy Master | Campaign | `campaign-central/copy-master.service.ts` | sonnet-4-6 | botão "Gerar Master" | sob demanda |
| 12 | Copy Parser | Campaign | `campaign-central/copy-master.service.ts` | sonnet-4-6 | botão "Colar texto" | sob demanda |
| 13 | Copy Adapter (por loja) | Campaign | `campaign-central/campaign-copy.service.ts` | sonnet-4-6 | "Gerar copies" / n8n | por loja (paralelo 3) |
| 14 | Campaign Architect | Campaign | seed `20260723_*.sql` | gpt-5-1 | **SEEDED, NÃO integrado** | — |
| 15 | CRM AI Actions | CRM | `crm-ai-action.service.ts` | haiku-4-5 (config) | node `ai_action` em automação | sob demanda |
| 16 | Dashboard Insights | Avulso | `api/dashboard/insights` | gpt-4o-mini | GET insights | — |
| 17 | Ritual Chat (8 tools) | Avulso | `api/ritual/chat` | sonnet-4-6 | chat do ritual | rate-limited |
| 18 | Diagnóstico Pareto | Avulso | `services/diagnostic/index.ts` | sonnet-4-6 | modal de diagnóstico | fallback sem IA |
| 19 | Mensagem WhatsApp (CS) | Avulso | `acompanhamento/.../generate-message` | sonnet-4-6 | botão gerar mensagem | — |
| 20 | Chat IA interno (stream) | Avulso | `api/ai/chat` | sonnet-4-5 | chat interno | rate-limited 15/min |
| 21 | AI-fill relatório mensal | Avulso | `reports/[id]/ai-fill` | haiku-4-5 | botão preencher | fallback sem IA |
| 22 | Ads Review (Meta+Google) | Avulso | `ads-review/regenerate` | haiku-4-5 | botão regenerar | fallback sem IA |
| 23 | Objeções do ICP | Avulso | `regenerate-objections` | haiku-4-5 | botão regenerar | — |
| 24 | Image Spike (teste) | Avulso | `agents/image/image-spike.service.ts` | gpt-5.4-image-2 | nossa ferramenta de teste | gate de entrada |

**Infra de roteamento** (não são agentes, mas todo agente passa por elas):
`architect/llm-invoke.ts` e `agents/openrouter-invoke.ts` (pipeline AE) · `campaign-central/anthropic-client.ts` (`callAnthropicJson`, `callAnthropicWithWebSearch`). Regra: **modelo com `/` → OpenRouter; sem `/` → Anthropic SDK direto.**

---

## 1. Pipeline de Email (Epic AE)

Ordem real: `Briefing → [Pesquisa] → Montador → Blueprint → Copy → Imagem → HTML → QA`.
Status do email: `draft → pending → copy_generating → copy_ready → rendering → image_done → qa_running → ready/failed`.

### 1.1 Briefing
- **Arquivo:** `src/lib/services/briefing-generation.service.ts` · prompt **hardcoded** (não em DB).
- **Ativação:** `POST /api/forms/[token]/submit-data` (cliente envia formulário) ou `retry-briefing`. Só re-gera se `responsesChanged` ou travou (`isStuck`).
- **Input:** `onboardings.form_responses` + pesquisa (5 pilares de `client_stores`).
- **Output:** `onboardings.briefing` (JSON `BriefingContent`) + `briefing_ai_original`.
- **Modelo:** cascata T1 `claude-sonnet-4-6` (Anthropic SDK, 40s) → T2 `openai/gpt-5.3-chat` (OpenRouter, 20s) → T3 template determinístico. T=0.3, max 4096.
- **Prompt (system, resumo):** "Você é assistente da Convertfy… gere um BRIEFING estruturado em JSON {about_brand, audience, language_tone, visual_identity, offers_and_differentials}" + 12 regras de fidelidade (moeda/país, não inventar cores/fontes). Texto completo: `briefing-generation.service.ts:44-69`.
- **Cache:** sem cache de LLM, mas dedup por conteúdo (não re-roda se respostas idênticas).

### 1.2 Pesquisa & Diagnóstico (n8n externo)
- **Arquivos:** callbacks `src/app/api/webhooks/n8n/{brand,competitors,icp,tone,ads-analyzer,store-story}/route.ts` + gatilho `pesquisa-completa`.
- **Ativação:** n8n externo processa a URL da loja; ao fim de cada pilar chama o callback. `pesquisa-completa` (último) → `enqueueDispatchJob` (enfileira o Architect).
- **Input:** URL da loja (n8n). **Output:** `client_stores.brand_*/icp_*/tone_*/ads_*` + `client_competitors`.
- **Prompt:** vive no n8n (fora do código). O admin só persiste o resultado.
- **Cache:** callbacks sobrescrevem sempre; `enqueueDispatchJob` deduplica job ativo e pula emails com reference já existente.

### 1.3 Montador / Component Assembler 💰
- **Arquivo:** `src/lib/agents/architect/component-assembler.service.ts` · config em `email_agent_configs` (`agent_type='assembler'`).
- **Ativação (3 caminhos):** (a) cron `/api/cron/email-dispatch-queue` [natural], (b) `POST /api/admin/stores/[id]/generate-blueprints` [manual], (c) `runTestGeneration` caminho `with_copy` [**aba Testar**]. Todos via `generateBlueprintAndReference()`.
- **Input:** briefing + pesquisa + outline + estrutura esperada + template de referência curado + biblioteca de variantes.
- **Output:** HTML de arquitetura em `store_email_references.html` (**só persiste se `usedLlm`**).
- **Modelo:** **`openai/gpt-5.4`** via OpenRouter (reasoning model: `reasoning.effort=medium`, sem `temperature`), max 16384. Trocado de `claude-opus-4.8` (que custava ~$0,60/req e era ~70% do gasto de IA) em `20260726_assembler_model_gpt54.sql` — projeção ~$0,20–0,23/req. Pricing em `telemetry.callback.ts`.
- **Prompt (system):** "Você é o Montador de Componentes… SELECIONE 1 variante por posição + MONTE HTML 600px com CSS variables, placeholders `{{HEADLINE}}`/`{{BODY}}`, sem copy final, sem imagens reais." Fonte: `component-assembler.service.ts:39-62`.
- **⚠️ Cache:** **TEM** no fluxo natural (`enqueueDispatchJob` marca `done` se a reference existe → pula o LLM). **NÃO TEM** no caminho manual nem na aba Testar → re-paga Opus 4.8 toda vez. **(Este é o vazamento que originou esta investigação.)**

### 1.4 Blueprint
- **Arquivo:** `src/lib/agents/architect/blueprint-generator.service.ts` · `agent_type='blueprint'`.
- **Ativação:** junto com o Montador (mesma `generateBlueprintAndReference`).
- **Input:** o HTML do Montador + contexto da loja. **Output:** `store_email_blueprints` (objective/messaging/subject_hint/blocks) — **só se `source='ai'`**.
- **Modelo:** `anthropic/claude-sonnet-4.6` via OpenRouter, T=0.4, max 2048–8192.
- **Prompt (system):** "Você é o arquiteto de estrutura… gere o BLUEPRINT DETALHADO: blocos ordenados {type,label,purpose,needs_image}. Use só tipos permitidos: hero,text,coupon,products,footer,…" Fonte: seed `20260708b_component_assembler_agent_seed.sql:19-36`.
- **Cache:** roda sempre que o Montador roda (sem dedup próprio).

### 1.5 Copy
- **Arquivos:** `src/lib/services/email-copy-webhook.service.ts` (dispatch) + callback `src/app/api/webhooks/n8n/email-copy/route.ts`. Fallback in-process: `src/lib/agents/chains/copy.chain.ts` + `copy-chain-fallback.service.ts`.
- **Ativação:** `dispatchEmailCopyWebhook` — disparado por briefing confirmado, botão manual "Gerar copies", `pesquisa-completa`, ou teste `without_copy`. **Fallback (AE-4):** watchdog detecta `copy_generating` travado >15min → status `copy_generating_recovery` → `runCopyChainInProcess`.
- **Input:** store + blueprint + blocos vazios (envia **só** os vazios, preserva carry-over). **Output:** `email_flow_emails.subject/preheader` + `email_blocks.content` → status `copy_ready`.
- **Modelo:** n8n (externo, default Sonnet 4.6). Fallback in-process usa `DEFAULT_COPY_SYSTEM_PROMPT` (`copy.chain.ts:14-29`).
- **Prompt (fallback, system):** "Você é copywriter sênior de email marketing BR… headlines ≤8 palavras, body 2-3 frases, CTA verbos ≤4 palavras, nunca 'Clique aqui'. Se houver REFERÊNCIA DE COPY, siga valores exatos." Fonte: `copy.chain.ts:14-29`.

### 1.6 Imagem 💰
- **Arquivo:** `src/lib/agents/chains/image.chain.ts` (`generateEmailImage`) via `phase2-runner`. Config `agent_type='image'`.
- **Ativação:** fase 2, disparada pelo gate de brand confirmada → sinal `render` (consumido pelo watchdog/cron), ou pelo teste `with_copy`. Loop por bloco `needs_image=true`.
- **Input:** prompt niche-adaptive (12 vars UPPERCASE) + aspect ratio + opcional foto de produto (`product_ref` / `text2img`). **Output:** `email_blocks.content.image_url` → status `image_done`.
- **Modelo:** `openai/gpt-5.4-image-2` via OpenRouter, T=0.7. **Caro (~$0,44/imagem).**
- **Prompt (system):** "You are an e-commerce email image generator. Generate photographic, realistic images anchored to brand niche and product hero. Never invent products outside the catalogue." User template niche-adaptive (Welcome #1-6). Fonte: `20260622_image_agent_config_seed.sql` + `20260624_image_agent_real_prompts.sql`.
- **⚠️ Nota conhecida:** o caminho `product_ref` (img2img) com fotos de **pessoas reais** é recusado pela política da OpenAI → ver `docs/` da investigação do filtro. E falta `modalities:["image"]` no payload real (mesmo bug do spike).
- **Cache:** sempre roda por bloco (sobrescreve `image_url`).

### 1.7 HTML
- **Arquivo:** `src/lib/agents/chains/html.chain.ts` + `html/build-vars.ts`. Config `agent_type='html'`.
- **Ativação:** fase 2, após a Imagem. **Output:** `email_flow_emails.html` (HTML completo `<!DOCTYPE…`).
- **Modelo:** `anthropic/claude-sonnet-4.6` via OpenRouter, T=0.3, max 16384. (Histórico: `claude-opus-4-7` → $2,04/req; trocado pra Sonnet em `20260718`/`20260722`.)
- **Prompt v3 (system):** "HTML Assembler — não escreve copy nem gera imagens; monta o design final pra importar no Figma. 3 autoridades: `reference_html`=FORMA, `color_roles+fonts+logo`=APARÊNCIA, `blocks+images`=PAYLOAD. Protocolo de 6 passos, matriz de overlay, 9 regras inquebráveis, self-check." User template em XML com as 21 vars. Fonte: `20260706_html_agent_master_prompt_v3.sql:47-200`.
- **Inputs (21 vars,** `html/build-vars.ts`**) — o que pesa em tokens:** `reference_html` (HTML do Montador, ~38% do input) · `blocks_with_content_json` (copy de todos os blocos, ~24%) · `system_prompt` (~12%) · `logo_svg` (SVG ~leve; **se PNG vira base64 inline, até ~27k tokens!**) · resto (cores/fontes/image_map/top_products, leve).
- **Preço real** (telemetria): **$0,1248/req** · in 12.731 → out 5.816. Decomposição (Sonnet 3/15): input $0,038 + **output $0,087 (70% do custo)**. O custo é dominado pelo OUTPUT (o HTML em si). Risco: input inchar (reference grande ou logo PNG) — foi o que levou a 101k in / $2,04 no passado com Opus.
- **Cache:** sempre roda (sobrescreve). Só "repinta" a arquitetura do Montador — por isso é Sonnet barato, não precisa de modelo caro.

### 1.8 QA (+ QA Vision)
- **Arquivo:** `src/lib/agents/chains/qa.chain.ts`. Config `agent_type='qa'`.
- **Ativação:** fase 2, após o HTML. **Input:** HTML + blocks + briefing + brand + objetivo. **Output:** `email_flow_emails.qa_issues` → status `ready`/`failed`.
- **Modelo:** `anthropic/claude-sonnet-4.6` via OpenRouter, T=0.2, max 1500.
- **Prompt (system):** "Você é QA reviewer de emails… identifique problemas {spam_score_alto, links_quebrados, blocos_vazios, tom_inconsistente, claim_nao_coberto, html_invalido, alt_text_faltando, compliance}. Severity high bloqueia envio. Responda APENAS JSON." Fonte: `20260530d_qa_agent_seed.sql:25-51`. Pré-checks determinísticos rodam antes do LLM.
- **QA Vision (8.5):** `chains/qa-vision.chain.ts`, `claude-sonnet-4-6` com vision (Anthropic SDK), T=0.2, max 800, timeout 10s. Gated por `EMAIL_QA_VISION_ENABLED`. Avalia a imagem em 3 eixos (paleta, overlay reserve, cena). Falha graceful (nunca bloqueia o QA textual).

---

## 2. Campaign-Central (Central de Campanhas)

Pipeline: `Trends → Suggestions → [Copy Master / Parser] → Copy Adapter (por loja)`. Telemetria em `campaign_ai_runs` (kind: trends/suggestions/copy/copy_master/copy_parse).

### 2.1 Trends (web search)
- **Arquivo:** `campaign-central/trends.service.ts:249` (`callAnthropicWithWebSearch`). Config `agent_type='campaign_trends'`.
- **Ativação:** cron `campaign-suggestions-cycle` (domingo 22h BRT) → `captureTrends()`; ou `POST /cycle/regenerate`. Gated por `trends_enabled`.
- **Input:** país + nichos do cluster + datas comemorativas a excluir. **Output:** `campaign_trends`.
- **Modelo:** `claude-sonnet-4-6` `:online` (web search via OpenRouter Exa, ou tool nativo `web_search` no Anthropic), T=0.6, max 4096, maxSearches 5.
- **Prompt (system):** "You are a consumer trends analyst… identify viral/cultural/social/sports trends per country, NOT commercial dates already in the calendar. Assign commercial_potential 0-100, urgency, campaign_angle, evidence." Fonte: `email_agent_configs` (`20260719_campaign_central_settings.sql:64-86`).

### 2.2 Suggestions
- **Arquivo:** `campaign-central/suggestion-engine.service.ts:362` (`callAnthropicJson`). Config `agent_type='campaign_suggestion'`.
- **Ativação:** mesmo cron/regenerate, por cluster (paralelo até `max_concurrent_clusters`=3).
- **Input:** lojas do cluster + datas + lojas em atenção + benchmark interno + trends. **Output:** `campaign_suggestions` (type data/tema/email/performance, targets, confidence, angle, send_date).
- **Modelo:** `claude-sonnet-4-6`, T=0.7, max 8000.
- **Prompt (system):** "Você é o estrategista de campanhas da Convertfy… gere 1-4 sugestões por cluster, tipos {data,tema,email,performance}, use APENAS lojas do contexto, respeite lead time." Fonte: `20260716b_agent_type_campaign_suggestion.sql:34-52`.

### 2.3 Copy Master
- **Arquivo:** `campaign-central/copy-master.service.ts:123` (`generateMasterFromAngle`). Config `agent_type='campaign_copy_master'`.
- **Ativação:** botão "Gerar copy MASTER" → `POST /suggestions/[id]/generate-master`.
- **Input:** a sugestão (título, tipo, trigger, angle, subject, targets). **Output:** `campaign_suggestions.email_draft` (subject/preheader/strategy/blocks).
- **Modelo:** `claude-sonnet-4-6`, T=0.8, max 4000.
- **Prompt (system):** "Você é diretor de copywriting sênior… crie a COPY MASTER (carta-mãe) em pt-BR com estrutura fixa de 8 blocos {image, heading, text, products, offer, text, button, footer}." Fonte: `20260720_copy_master_workflow.sql:76-101`.

### 2.4 "Usar estrutura como master" — ⚠️ DETERMINÍSTICO (não usa mais IA)
- **Arquivo:** `campaign-central/copy-master.service.ts` (`setMasterFromStructure`, monta via `buildLiteralMaster`).
- **Ativação:** botão "Usar minha estrutura como master" → `POST /suggestions/[id]/parse-master`.
- **Input:** texto da "Estrutura & tom da copy" (brief). **Output:** `campaign_suggestions.email_draft` — 1 bloco `text` com o texto **LITERAL** (subject/preheader/strategy vazios; têm campo dedicado próprio).
- **Modelo:** nenhum. Preserva a copy do COO 1:1, sem reescrever. (Antes passava por `claude-sonnet-4-6` com um prompt de "parser"; trocado por montagem literal — o COO já escreveu a copy, a IA não deve mexer.)

### 2.5 Copy Adapter (por loja)
- **Arquivo:** `campaign-central/campaign-copy.service.ts:350` (`generateCampaignCopy`). Prompt **hardcoded**.
- **Ativação:** botão "Gerar copies" → `POST /suggestions/[id]/generate-copy`; ou n8n `/webhooks/n8n/campaign-copy` (+ watchdog fallback). Por loja, paralelo até 3.
- **Input:** copy master + contexto de UMA loja (idioma, tom, top products reais) + (opcional) lojas piloto `quality='good'` como few-shot. **Output:** `campaign_suggestions.copy_results[mode][store_id]`.
- **Modelo:** `claude-sonnet-4-6`, T=0.75, max 3500.
- **Prompt (system):** "Você é copywriter sênior… adapte a copy master pra UMA loja: traduza pro idioma da loja, aplique tom de voz, substitua products placeholder por TOP PRODUCTS reais, mantenha valores/cupons exatos." Fonte: `campaign-copy.service.ts:38-65`.

### 2.6 Campaign Architect (Single Day) — ⚠️ SEEDED, NÃO INTEGRADO
- **Config:** `agent_type='campaign_architect'`, `gpt-5-1` (OpenRouter), T=0.6, max 4000. Seed `20260723_campaign_architect_agent.sql`.
- **Status:** existe no banco mas **nenhum call site no código ativo** o invoca. Integração pendente (framework "Single Day").
- **Prompt (system):** "Você é o Arquiteto de Estrutura do framework Single Day. NÃO escreve copy. Gera 3 candidatos (APE), pontua 0-15 por rubrica, itera 1x (OPRO), seleciona blueprint {FIXO/PREENCHER/DINAMICO}." Fonte: `20260723_campaign_architect_agent.sql:34-168`.

---

## 3. CRM — AI Actions (motor genérico)

- **Arquivos:** `src/lib/services/crm-ai-action.service.ts` (executor) + `crm-automation-executor.service.ts:443-483` (node `ai_action`) + CRUD `api/crm/ai-actions/*`.
- **Ativação:** node `ai_action` dentro de uma automação (DAG), disparado por triggers `deal_created` / `deal_stage_change` / `lead_created` via `crm-trigger-dispatcher`. O node mapeia contexto→vars (`input_mapping`) e grava o output na entidade (`output_target`).
- **Input:** config da `crm_ai_actions` (system_prompt + user_prompt_template com `{{var}}`) + contexto (deal/lead/thread/store).
- **Prompt:** **versionado em banco** (`crm_ai_actions.system_prompt` / `user_prompt_template`). Renderizado com `{{var}}` → Anthropic Messages API **direto** (`https://api.anthropic.com/v1/messages`, sem SDK).
- **Modelo:** configurável por action (default `claude-haiku-4-5-20251001`; aceita opus/sonnet ou OpenRouter).
- **Output:** validado por JSON Schema (`output_schema`) → gravado em `deals`/`crm_leads`/`crm_threads`. Telemetria em `crm_ai_action_runs`.
- **Status:** **infra pronta, sem agentes pré-criados em produção** — é um motor para criar AI Actions sob demanda.

---

## 4. Avulsos (fora dos 3 subsistemas)

Todos com prompt **hardcoded** no próprio arquivo. Telemetria via `recordAiUsage()`.

| Agente | Arquivo:contexto | Modelo | Ativação | Prompt (resumo) | Output |
|--------|------------------|--------|----------|-----------------|--------|
| Dashboard Insights | `api/dashboard/insights:144` | `gpt-4o-mini` (OpenAI) | GET `/api/dashboard/insights` | "analista sênior… gere 4 insights acionáveis em JSON" | 4 insights p/ dashboard |
| Ritual Chat | `api/ritual/chat:22` | `claude-sonnet-4-6` | POST chat (ritual sexta) | "copiloto da Convertfy no ritual semanal" + 8 tools Omnisend ao vivo | texto (chat) + tool_calls |
| Diagnóstico Pareto | `services/diagnostic/index.ts:498` | `claude-sonnet-4-6` | `buildPareto()` no modal | "analista sênior… ranqueie problemas por impacto, soma=100%" | JSON {items, impactPercent, actions} → fallback sem IA |
| Mensagem WhatsApp CS | `acompanhamento/.../generate-message:17` | `claude-sonnet-4-6` | POST gerar mensagem | "CSM escrevendo mensagem semanal, máx 800 chars" | `weekly_pipeline_states.ai_message` |
| Chat IA interno | `api/ai/chat:45` | `claude-sonnet-4-5` (stream) | POST chat interno | "assistente IA da Convertfy p/ time interno" | SSE stream → `ai_chat_messages` |
| AI-fill relatório | `reports/[id]/ai-fill:83` | `claude-haiku-4-5` | POST preencher | "analista de CS… leituras editoriais, 7 slides" | `client_monthly_reports.snapshot.insights` (7) → fallback |
| Ads Review | `ads-review/regenerate:201` | `claude-haiku-4-5` | POST regenerar | "analista de growth… pontue mídia paga Meta+Google" | JSON {score, sub_scores, strengths, risks} → fallback |
| Objeções ICP | `regenerate-objections:124` | `claude-haiku-4-5` (tool use) | POST regenerar | "estrategista de copy… 5 objeções reais + tratamento" | 5 objeções (tool use schema) |
| Image Spike | `agents/image/image-spike.service.ts` | `gpt-5.4-image-2` | nossa ferramenta de teste | product_ref / text2img | data URI / URL |

---

## 5. Telemetria & custo

Três tabelas registram cada chamada (`tokens_input`, `tokens_output`, `cost_cents`, `duration_ms`, `status`):
- **`email_generation_runs`** — pipeline AE (agent: briefing/assembler/blueprint/copy/image/html/qa).
- **`campaign_ai_runs`** — campaign-central (kind: trends/suggestions/copy/copy_master/copy_parse).
- **`crm_ai_action_runs`** — CRM AI Actions.
- Avulsos: `recordAiUsage()` (feature, model, provider, tokens, status).

**Tudo é unificado na VIEW `ai_usage_unified`** (`20260725_ai_usage_observability.sql`) — colunas canônicas `{source, feature, model, status, tokens, cost_cents, duration_ms, created_at}`. **É o lugar para auditar gasto de qualquer agente.**

Pricing tabelado (USD/1M tokens, `anthropic-client.ts:71-85`): opus 15/75 · sonnet 3/15 · haiku 1/5 · gpt-5-1 1.25/10 · gemini-flash 0.075/0.3.

---

## 6. ⚠️ Onde o dinheiro pode vazar

1. **Montador (Opus 4.8) re-rodando sem cache** na aba "Testar" e no `/generate-blueprints` — ~$0,77 por clique mesmo sem nada mudar. O fluxo natural (cron) tem cache (`existingRefs`); o teste **não**. → corrigir `runTestGeneration` pra reusar `store_email_references`/`store_email_blueprints` existentes.
2. **Imagem (gpt-5.4-image-2)** — ~$0,44/imagem, sempre roda, e hoje o `product_ref` é recusado por política (gera "alternativa segura" genérica e cobra). Falta `modalities:["image"]` no payload real.
3. **HTML/QA sempre rodam** — esperado (dependem da copy), mas são Sonnet barato.
4. **Copy Adapter** roda por loja em paralelo — escala com nº de lojas; cada uma é uma cobrança.

---

## 7. Como editar os prompts

- **Pipeline AE + campaign-central:** `email_agent_configs` (1 ativo por `agent_type`). UI em `/admin/settings/email-generation?tab=agents` e `/admin/agents/prompts` (admin/owner ou tag `dev`). Migrations fazem `UPDATE` in-place da linha ativa.
- **CRM:** `crm_ai_actions` via `api/crm/ai-actions/*` (PATCH incrementa `version`).
- **Avulsos:** hardcoded no arquivo — exigem deploy pra mudar.
