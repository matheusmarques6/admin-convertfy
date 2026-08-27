# Fluxo completo de geração de emails — agentes, prompts, inputs e outputs

*Atualizado: jul/2026 — pós split do agente HTML (migration 20261039).*

> **Onde os prompts vivem**: todo agente tem uma row em `email_agent_configs`
> (modelo, system_prompt, user_template, temperature, max_tokens), editável em
> **/admin/settings/email-generation → aba Agentes**. Prompt vazio no banco →
> o chain usa o DEFAULT in-code. Modelo com `/` (ex: `z-ai/glm-5.2`) roteia
> via OpenRouter (custo real em `usage.cost`); sem `/` usa o SDK Anthropic
> direto (custo estimado por token).

## Visão geral

```
ONBOARDING
  └→ [0] Pesquisa & Diagnóstico (n8n, 5 pilares) ──→ client_stores.brand_*/icp_*/tone_*/ads_*/store_*
  └→ [1] Briefing (cascata Sonnet→GPT→template) ──→ onboardings.briefing

ARQUITETURA (fila email_dispatch_jobs, 1x por loja×email)
  └→ [2] Curador  (assembler_chooser) — escolhe a variante de cada seção
  └→ [3] Montador (assembler) — monta o HTML de arquitetura + slot_map + marcadores cfy:block
  └→ [4] Blueprint (determinístico-primeiro; LLM fallback) + [4b] Subject (mini-LLM)

COPY
  └→ [5] Copy (n8n externo) — payload v2 → callback grava subject/preheader/blocos → status copy_ready

FASE 2 (status rendering; rotas run-phase2-image → run-phase2-html-qa)
  └→ [6] Imagem (geração) — gpt-5.4-image-2, até 4 imagens
  └→ [7a] HERO SECTION      ─┐
  └→ [7b] FORMATAÇÃO DE TEXTO │ cadeia de formatação (split do HTML agent)
  └→ [7c] FORMATAÇÃO DE IMAGEM│ retry 1x/step · resume por html_pipeline_stage
  └→ [7d] CORES & BOTÕES     ─┘ (substitui o Refinador; FAIL-OPEN)
  └→ [8] QA — determinístico sempre; LLM só com EMAIL_QA_ENABLED=true
  └→ ready
```

Status machine (intocada pelo split): `draft → pending → copy_generating →
copy_ready → rendering → image_done → qa_running → ready/failed`. A cadeia
7a-7d roda inteira dentro de `rendering`.

---

## [0] Pesquisa & Diagnóstico (n8n externo)

Sem prompt no admin — roda no n8n a partir da URL da loja. 5 callbacks gravam
os pilares em `client_stores` (todos com `x-webhook-secret` + validação de
store_url):

| Callback | Colunas |
|---|---|
| `/api/webhooks/n8n/brand` | `brand_thesis`, `brand_about`, `brand_pillars` (3), `brand_presence` |
| `/api/webhooks/n8n/store-story` | `store_story`, `store_milestones[]` |
| `/api/webhooks/n8n/icp` | `icp_persona`, `icp_demographics`, `icp_day_in_life`, `icp_motivations`, `icp_frictions` (+ opcionais awareness/objections/vocabulary...) |
| `/api/webhooks/n8n/tone` | `tone_description`, `tone_do`, `tone_dont`, `tone_use_words`, `tone_avoid_words` |
| `/api/webhooks/n8n/ads-analyzer` | `ads_score`, `ads_summary`, `ads_sub_scores`, `ads_strengths/opportunities/risks` |

Auxiliares: `competitors` → `client_competitors`; `top-products` →
`store_top_products`; **`pesquisa-completa`** → sinaliza o fim e ENFILEIRA os
jobs de arquitetura + dispatch de copy.

---

## [1] Briefing — `briefing-generation.service.ts`

- **Modelo (cascata)**: `claude-sonnet-4-6` (40s) → OpenRouter `openai/gpt-5.3-chat` (20s) → template determinístico. `max_tokens 4096`, `temp 0.3`.
- **Input**: sem `{{vars}}` — o user é montado por código: bloco "PESQUISA & DIAGNÓSTICO DA LOJA" (fonte PRIMÁRIA), "DADOS DA LOJA" (JSON), "CLIENTE", "RESPOSTAS DO FORMULÁRIO" (URLs de storage removidas).
- **Prompt (essência)**: assistente da Convertfy; gera briefing JSON `{about_brand, audience, language_tone, visual_identity{palette,fonts,references}, offers_and_differentials}`, 2-5 frases por campo, em PT. Regras de fidelidade: pesquisa vence formulário; "NUNCA assuma Real (R$) ou Brasil por padrão"; não inventar cores/fontes ("A definir com base no manual da marca"); dado inexistente → "a definir"; nunca incluir URLs (o cliente lê).
- **Output**: `BriefingContent` validado rigorosamente → `onboardings.briefing` + `briefing_status='generated_pending_review'`.

---

## [2] Curador (`assembler_chooser`) — `component-assembler.service.ts` (passo A)

- **Modelo**: config ativa; fallback `anthropic/claude-sonnet-4.6` · temp 0.2 · 2048 tokens · timeout 240s. Recebe top-8 candidatos por seção (`CHOOSER_TOP_K`), embaralhados com seed.
- **Input (vars)**: `brand_name, nicho, posicionamento, persona, tom_voz, outline_objective, outline_guidance, outline_tone_hint, briefing_marca, top_products, memoria, blocks_json, candidates_json` — os candidatos vêm SEM html (id, nome, descrição, quando_usar/quando_nao_usar, objectives, tones, density, product_slots, orientacao_copy, campos_copy, notas_implementacao).
- **Prompt (essência)**: "Você é o Curador de Componentes de email" — escolhe UMA variante por `block_index` pela descrição+metadados, nunca pelo HTML. Regras: respeitar `quando_nao_usar`; objectives/tones batendo com o outline e o tom da loja; `<perfil_marca>` como âncora ("precisa caber na marca, não só no objetivo"); "NUNCA escolha variante que exige mais produtos do que a loja tem"; viabilidade de copy pelos `campos_copy` (cupom sem oferta → outra variante); não repetir variante no mesmo email; memória = coerência (email anterior da loja) + variedade (mesmo email em outras lojas), mas "a memória é sinal, não regra". "Não invente variant_id."
- **Output**: `[{"block_index": N, "variant_id": "..."}]` → `AssemblySlot[]` (variant | missing). Escolhas persistidas em `email_generation_choices` (memória) e, via Montador, em `store_email_references.slot_map`.

---

## [3] Montador (`assembler`) — `component-assembler.service.ts` (passo B)

- **Modelo**: config ativa (`z-ai/glm-5.2` desde jul/2026); fallback `claude-sonnet-4-6` · temp 0.3 · 16384 · timeout 240s.
- **Input (vars)**: `brand_name, nicho, posicionamento, persona, tom_voz, mood, outline_objective, outline_guidance, outline_tone_hint, reference_template_html` (referência curada do flow, guia), `chosen_html_json` (**HTML completo** das variantes escolhidas, com block_index/section/notas_implementacao), `missing_blocks_json`.
- **Prompt (essência)**: monta UM documento coeso REUSANDO os HTMLs das variantes (não reescreve do zero; harmoniza espaçamentos/larguras/tipografia). Blocos sem variante → puxa do reference padrão com nota obrigatória. Container 600px; cores SEMPRE via CSS variables em `:root`; NÃO escreve copy nem cria placeholders novos; NÃO usa imagens reais. **REGRA DOS SLOTS DE IMAGEM**: toda tag `{{*_IMAGE}}` das variantes DEVE sobreviver. **REGRA DAS TAGS CANÔNICAS**: preservar placeholders exatamente. **REGRA DOS MARCADORES DE BLOCO** (nova, 20261039): envolver CADA bloco com `<!-- cfy:block:{i}:{section}:start/end -->` — é o que o hero-locator da fase 2 usa como modo primário.
- **Output**: HTML de ARQUITETURA (esqueleto + placeholders, sem copy/imagens) → `store_email_references` (`html`, `variant_ids`, **`slot_map`** = escolha por parte, `model`). Marcadores inválidos são removidos por `validateBlockMarkers` (telemetria `block_markers: ok|stripped|absent`). Só persiste se o LLM gerou de verdade (`usedLlm`); senão o consumidor cai no template global.

---

## [4] Blueprint — `blueprint-generator.service.ts` (determinístico-primeiro)

- **Rota A (determinística, custo ~0)**: quando o skeleton de tags canônicas do reference existe e a cobertura das variantes é 100% (ou `blueprint_mode='deterministic'`). Sem LLM: estrutura ← skeleton; `purpose` ← `copy_guidance` da variante; `image_brief` ← campos type=image do `output_schema`; `fields` v2 ← output_schema→tag_registry→copy_spec. Persiste com `model='deterministic'`. Só o Subject (4b) roda como LLM.
- **Rota B (LLM fallback)**: skeleton null, cobertura <100% ou `blueprint_mode='llm'`.
  - **Modelo**: config ativa; fallback `claude-sonnet-4-6` · temp 0.4 · 8192 · timeout 240s.
  - **Input (vars)**: `brand_name, nicho, posicionamento, persona, tom_voz, flow_type, email_number, outline_objective, outline_guidance, allowed_block_types, pesquisa_diagnostico, reference_html, estrutura_extraida`.
  - **Prompt (essência)**: "arquiteto de estrutura" — LÊ o HTML montado e extrai um bloco por seção visual, na MESMA ordem, sem fundir/pular; só os 19 tipos permitidos; `purpose` 2-3 frases concretas (diretiva, não a copy); `copy_spec` com fórmula de geometria (`chars_por_linha ≈ largura_px ÷ (font_px × 0.55)`) e guarda-corpos por campo (headline 12-60, cta 6-24, hero.eyebrow ≤24...); com `<estrutura_extraida>` não-vazia, NÃO re-deriva estrutura (só preenche label/purpose/image_brief); "PURPOSE LIMITADO ÀS TAGS".
- **As duas rotas terminam em `packageBlueprint`** (normalizador único): todo bloco sai com `variant_id/variant_name` + `fields` v2. Upsert em `store_email_blueprints`.

### [4b] Subject (`subject`) — mini-LLM da rota determinística

- **Modelo**: `claude-haiku-4-5` · temp 0.7 · 400 tokens.
- **Input (vars)**: `brand_name, nicho, tom_voz, persona, flow_type, email_number, outline_objective, outline_guidance, tones, copy_guidance_resumo, top_products`.
- **Prompt**: "Você escreve a direção editorial de UM email" — `subject_hint` ≤55 chars no idioma/tom da loja + `messaging` 2-3 frases (ângulo central). Responde APENAS JSON.
- **Output**: `{subject_hint, messaging}`; falha → fallback do outline.

---

## [5] Copy (n8n externo) — `email-copy-webhook.service.ts`

- **Não tem prompt no admin** — o prompt vive no flow do n8n. O admin envia o payload e recebe o callback.
- **Payload v2 (POST no `N8N_EMAIL_COPY_WEBHOOK_URL`)**: `event, trigger_source, test_context, callback{url,secret}`, `store{...}` (brand/icp/tone/positioning/visual/story/ads_review/operations/audience — a pesquisa inteira), `brand_identity`, `briefing`, `pesquisa_diagnostico`, `top_products`, `competitors`, `flows[]`. Por email: `objective`, `tones` canônicos, `component_variants[]` (variant_id, name, copy_guidance, output_schema), `coupon_code`, `estrutura_geral`, `blueprint{objective,messaging,subject_hint}`, `blocks[]`. Por bloco: `purpose`, `variant_id/variant_name`, `tags[]`, **`fields` v2** (`{key,label,type,max_len,min_len,required,example,guidance,tag,source}` — a ÚNICA fonte de spec de copy; `copy_spec` foi removido).
- **Callback `/api/webhooks/n8n/email-copy`**: grava `subject/preheader` no email + `content` por bloco (match por block_id, fallback por posição), zera artefatos antigos (html, qa_issues, timers), audita desvios contra os `fields` (observabilidade, nunca rejeita) → **status `copy_ready`** → dispara a fase 2.

---

## [6] Imagem (geração) (`image`) — `chains/image.chain.ts` + `image/prompt-vars-builder.ts`

- **Modelo**: `openai/gpt-5.4-image-2` (OpenRouter) · timeout 90s por imagem · máx **4 imagens/email** (`MAX_AI_IMAGES`) · até 3 imagens de referência (product_ref).
- **Input (vars, ~31)**: legacy snake_case (`brand_name, block_purpose, nicho, primary_colors, top_products, product_N_name...`) + Master v2 UPPERCASE (`MARCA, NICHO, PRODUTO_HEROI, PUBLICO, CENARIO, PALETA_1/2, NEUTRO, MOOD, IDIOMA, MOEDA, LOGO_STYLE, INSTRUCAO_ADICIONAL, EMAIL_OBJETIVO, EMAIL_IDEIA, EMAIL_ASSUNTO, SHOT_ARCHETYPE`) + por bloco (`aspect_ratio, mode, product_ref, image_overlay_reserve_bottom`) + **`IMAGE_SLOTS`** (direção de arte estruturada dos `fields` type=image do blueprint — quando existe, `IMAGE_BRIEF` é zerado pra não duplicar).
- **Prompt (essência)**: banner de fundo pro bloco do email; estética e-commerce limpa alinhada ao mood/nicho/produtos; **"No text in the image (text is overlaid in HTML)"**; instrução de aspect-ratio/dims anexada pelo runner; compor pra reforçar a ideia do email sem renderizar o texto.
- **Output**: URL da imagem (upload no Storage, signed URL 365d) → `email_blocks.content.image_url/image_alt`; avatares de testimonial em `content.items[].avatar_url`. Status → `image_done`.

---

## Cadeia de formatação (split do HTML agent — status `rendering`)

Mecânica comum aos 4 steps: config própria em `email_agent_configs` (seed
`z-ai/glm-5.2`, prompt vazio → default in-code); run próprio em
`email_generation_runs` com `rendered_prompt` (o que entrou), `raw_output`
(o que saiu), tokens, custo real, duração, `retry_count`; `input_vars.input_sha8`
= `parsed_output.output_sha8` do step anterior (auditoria encadeada); retry 1x
(2º erro → `failed` com o reason do agente; cores é fail-open); budget dinâmico
(`PHASE2_CHAIN_BUDGET_MS`, default 760s) com resume por
`email_flow_emails.html_pipeline_stage`.

### [7a] Hero Section (`hero_section`) — `chains/hero.chain.ts`

- **Modelo**: `z-ai/glm-5.2` · temp 0.3 · 16384 tokens · timeout 240s (`HERO_CHAIN_TIMEOUT_MS`).
- **Resolução da variante (algoritmo, sem LLM)**: `store_email_references.slot_map` → `blueprint.blocks[]` (type hero com variant_id) → `email_generation_choices` → null (modo degradado).
- **Input (vars)**: `brand_name, locale, color_bg/text/heading/button_bg/button_text/accent, font_heading(+weight), font_body(+weight), logo_light` (main→alt→monogram), `logo_dark` (reverse), `email_name, subject, montador_html` (documento inteiro como contexto), `hero_region_html` (região localizada: marcadores cfy:block → tags canônicas → full-doc), `hero_variant_html` (biblioteca), **`hero_variant_rendered_html`** (gold reference), `hero_variant_schema_json` (output_schema), `hero_content_json` (copy da hero), `hero_image_url`.
- **Prompt (essência)**: "HERO SECTION finisher" — entrega a hero no padrão do `rendered_html` da variante ("é assim que ela fica PRONTA — reproduza esse acabamento com os dados desta loja"). Herda a regra v6: SÓ troca `{{HERO_IMAGE}}` pela URL (sem overlay/background/crop/reorder, `height:auto`; sem imagem → remove só a linha da imagem, NUNCA inventa URL). Copy verbatim de `hero_content`; merge tags literais; fontes com peso da identidade; hex só da paleta; logo escura em fundo escuro / clara em fundo claro. Modo degradado (sem variante): preserva a região byte a byte e só faz os swaps.
- **Output**: SÓ o fragmento da hero entre `<CFY_HERO_OUTPUT>` tags → o CÓDIGO faz o splice no documento e injeta sentinelas `<!-- cfy:hero:start/end -->` (resto byte-for-byte intacto). Fallback full-doc com guard estrutural. Persiste `html` parcial + `html_pipeline_stage='hero'`. Falha 2x → `failed: hero_failed`.

### [7b] Formatação de Texto (`text_format`) — `chains/text-format.chain.ts`

- **Modelo**: `z-ai/glm-5.2` · temp 0.3 · 65536 tokens · timeout 540s (`TEXT_FORMAT_TIMEOUT_MS`).
- **Input (vars)**: `html` (output do 7a), `blocks_with_content_json` (copy do n8n, SEM a hero), `fields_json` (schema por bloco do blueprint), `subject, preheader, objective, messaging`, cores/fontes+pesos, `top_products_json`, brand/locale.
- **Prompt (essência)**: "TEXT FORMATTER" — o documento recebido É o output, menos as substituições: valores do `:root`, font-family (com pesos + @import), placeholders de copy VERBATIM (match por posição+semântica via `fields`), hrefs absolutos, `<title>`/preheader (uma linha, sem spacer hack). **`<hero_is_untouchable>`**: nada entre as sentinelas muda, byte a byte. **`<image_tags_survive>`**: tags `{{*_IMAGE}}/{{*_THUMB}}` são do próximo agente — nunca preencher/remover. Proibições estruturais herdadas do monolítico (tabelas, div órfã/foster-parent, contagem de blocos, NO DUPLICATE PRODUCTS, reference_count_check).
- **Output**: documento completo `<!DOCTYPE html>...</html>` (post-process preserve-tags). Guards determinísticos: nº de tabelas, shrink <0.9x, tags de imagem sobrevivem, sentinelas presentes; hero divergente → **re-splice determinístico** (telemetria `hero_respliced`). Persiste `html` + stage `'text'`. Falha 2x → `failed: text_format_failed`.

### [7c] Formatação de Imagem (`image_format`) — `chains/image-format.chain.ts` + `html/apply-patches.ts`

- **Modelo**: `z-ai/glm-5.2` · temp 0.2 · 8192 tokens · timeout 180s (`IMAGE_FORMAT_TIMEOUT_MS`).
- **Input (vars)**: `html` (output do 7b), `image_map_json` (imagens geradas por slot, SEM a entry da hero; inclui avatares de testimonial), `logo_light/logo_dark`, `top_products_json`, brand_name.
- **Prompt (essência)**: "IMAGE PLACER" — NÃO edita o documento; emite `{"ops":[...]}`: `img` (troca `{{TAG}}`→URL + `{{TAG_ALT}}`→alt), `remove_slot` (slot sem imagem), `replace` (logo no lugar do texto estilizado; crop shopify `width=520&height=650&crop=center`). Herda as slot rules v6: MATCH BY TAG (índices contam), ONE SLOT PER IMAGE, unfilled→remove, TEXT SLOTS ARE NOT IMAGE SLOTS; hero proibida ("the applier rejects them").
- **Output**: JSON de ops **aplicado por código** (`applyOps`, `allowHero:false`): `find` ambíguo → op pulada (`ops_skipped` na telemetria), `remove_slot` só com `<tr>` balanceada — nunca corrompe. Depois do apply: sentinelas removidas + strip de placeholders órfãos + `lang` da loja (limpeza única do fim da cadeia). Persiste `html` + `html_pre_refiner` (snapshot pré-polimento) + stage `'image'`. Falha 2x → `failed: image_format_failed`.

### [7d] Cores & Botões (`color_format`) — `chains/color-format.chain.ts` *(substitui o Refinador)*

- **Modelo**: `z-ai/glm-5.2` · temp 0.3 · 16384 tokens · timeout 240s (`COLOR_FORMAT_TIMEOUT_MS`).
- **Input (vars)**: `html` (output do 7c, já limpo), `brand_colors` (paleta serializada "Papel: #HEX (Nome)"), `niche`, `tones` (derivados do tom de voz), `pesquisa_full_text` (5 pilares), `font_heading/font_body`, `email_name, subject`, brand/locale.
- **Prompt (essência)**: "COLOR & BUTTON finisher" — última passada visual. Herda o `<identity_conformance>` do Refinador: comparar cores efetivas com a paleta; cor CLARAMENTE fora → hex do papel equivalente (Principal→botões, Fundo→fundos, Destaque→acentos) com contraste legível; derivados funcionais (branco/preto/cinzas) são legítimos; NUNCA introduzir cor fora da paleta; paleta vazia ou dúvida → não mexe. `<button_rules>`: bg de botão na paleta + texto contrastando (AA), consistência entre CTAs (mesmo idioma visual, radius já existente no documento), botão da hero EM ESCOPO (só cor). `<preservation>`: proibido tocar copy/href/src/estrutura/fontes — SÓ valores de cor. Emitir ZERO ops é decisão legítima.
- **Output**: JSON de ops `replace` (find único) aplicado por código (`allowHero:true`) + guard de contagem de tabelas. **FAIL-OPEN**: 2 falhas ou budget esgotado → mantém o HTML do 7c e segue pra ready (email nunca fica pior). Persiste `html` final + stage `null`.

---

## [8] QA (`qa`) — `chains/qa.chain.ts`

- **Determinístico (sempre roda, custo 0)**: `computeRenderChecks` + `runDeterministicChecks` (`html_invalido`, `blocos_vazios`, `links_quebrados`) + `runSchemaChecks` contra os `fields` v2 (`campo_obrigatorio_vazio`, `copy_excede_max_len`). Não bloqueiam por default.
- **LLM (só com `EMAIL_QA_ENABLED=true`)**: modelo da config (fallback `claude-sonnet-4-6`) · temp 0.2 · 1500 tokens · timeout 60s. Sem config ativa → degrade seguro (`model:'noop'`).
- **Input (vars)**: `html`, `blocks_json`, `briefing_json`, `brand_json`, `blueprint_objective` + `MERGE_TAGS_INSTRUCTION` appendado sempre in-code (merge tags do provedor NÃO são link quebrado/compliance).
- **Output**: `QaResult {passed, issues[{type,severity,message,location}], meta}` — 14 issue types; `passed` via `EMAIL_QA_BLOCK_SEVERITY` (default high). `!passed` → `failed: qa_failed`; senão → **`ready`**. Opcional: QA Vision (cap 3 imagens) valida paleta/cena/overlay da hero.

---

## Agentes removidos (corte seco, jul/2026)

| Agente | Substituído por | Observação |
|---|---|---|
| `html` (monolítico) | cadeia 7a-7d | config `is_active=false` (histórico preservado); chain deletado |
| `refiner` | `color_format` (7d) | idem; toggle removido da aba Configurações |

## Telemetria e custo

- Cada run em `email_generation_runs`: agente, modelo, status, `rendered_prompt`, `raw_output`, `parsed_output`, tokens in/out, `cost_cents` (real via OpenRouter), `duration_ms`, `retry_count`.
- **Proveniência** (migration 20261085): `prompt_segments` guarda o MESMO prompt cortado por origem — template do agente · loja · biblioteca · saída de agente anterior · curadoria · vault · derivado por código — e `input_summary` guarda a Entrada estruturada. A marcação nasce na montagem (quem monta a var declara de onde ela veio) e cada call site confere a **recomposição byte-igual** antes de gravar: divergiu, grava o prompt sem marcação em vez de mentir. Segmento grande (o catálogo do Curador, ~120k) vira `{ref, sha8}` e a UI resolve por `GET /api/admin/agents/prompt-segment`.
- **Estúdio de Agentes** (`/admin/agents`, abas Execuções e Teste): drill-down por nó com **Entrada** (itens com chip de origem), **Prompt** (blocos coloridos por proveniência, SYSTEM separado de USER) e **Saída** legível por agente — ranking do Curador, escolhas do Montador, blocos do Blueprint, assunto, embasamento do Estruturador, campo a campo dos merges, relatório da hero, a imagem gerada e o veredito do QA. Runs antigas caem no texto plano.
- `email_flow_emails.total_cost_cents` = soma dos runs do email (rollup automático).
- Página **/admin/settings/email-generation-logs**: resumo por agente, linha sintética **"Montagem HTML"** (soma da cadeia + legados), participação no custo, drawer por run com Prompt renderizado / Output bruto / Output parseado.
- Por batch: `GET /api/admin/stores/[id]/generation-status/[batchId]` (totalCost/totalDuration/tokens).
