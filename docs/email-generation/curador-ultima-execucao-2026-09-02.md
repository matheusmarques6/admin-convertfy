# Curador — catálogo da última execução (02/09/2026 13:56 UTC)

*Levantado em 02/09/2026 a partir do banco de produção (`email_generation_runs`,
`prompt_segments`, `input_summary`) cruzado com o código da branch
`claude/curator-agent-analysis-pnr7vn` (HEAD `46cd0f9`).*

Este documento responde a uma pergunta só: **o que exatamente o agente Curador
(`assembler_chooser`) recebeu na última run, de onde cada pedaço veio e por
qual caminho chegou ao modelo.** Não é o desenho do agente (esse está em
`agentes-curador-montador-hero.md` e `fluxo-entradas-por-agente.md`); é a
auditoria de UMA execução, byte a byte, com os achados que ela expõe.

---

## 1. Identificação da run

| Campo | Valor |
|---|---|
| `email_generation_runs.id` | `6e116d4b-268f-4e65-9244-f68ac02ca9e9` |
| `agent` | `assembler_chooser` (rótulo "Curador" no Estúdio) |
| `status` | `success` |
| `model` | `anthropic/claude-sonnet-4.6` |
| `created_at` | 2026-09-02 13:56:03 UTC |
| `duration_ms` | 115.959 (≈ 1 min 56 s) |
| `tokens_input` / `tokens_output` | 68.419 / 5.737 |
| `cost_cents` | 32,96 (custo real devolvido pelo OpenRouter) |
| `store_id` | `741414b9-2958-4210-8331-8a1c90c2d28b` — **Innova Bay nova** (`https://innovabay.site/`) |
| `flow_id` / `email_id` | `8faf0b1d-…` (Welcome Flow) / `6b3a7f42-…` (welcome **#1**, status `ready`) |
| `batch_id` | `f576a00f-6411-43c5-a688-e5fb17ccc25f` |
| `triggered_by` | `62decdad-1a88-414f-a16e-54290a052064` |
| `agent_config_id` | **NULL** (ver achado A1) |
| `input_vars` | `{shadow:false, curador_vault_mode:"on", shadow_contract:"v2-justificado", momento:"welcome-1", vault_docs:163, catalog_sha8:"8605a7e5"}` |
| `rendered_prompt` | 50.156 chars — **só a parte USER** (o system não é gravado; ver §3) |
| `prompt_segments` | 52 segmentos (7 system + 45 user) |
| `input_summary` | 23 itens |
| `raw_output` | 8.000 chars (truncado no limite de gravação) |

Posição no batch (mesmo `batch_id`, ordem de `created_at`):

```
13:56:02  estruturador      skipped  (model "desligado")
13:56:03  assembler_chooser success  ← ESTA RUN (Curador)
13:58:00  assembler         success  moonshotai/kimi-k3 (Montador)
13:58:17  blueprint         success  deterministic
13:58:18  subject           success  anthropic/claude-sonnet-4.6
13:58:25  copy_dispatch     success  n8n
… copy_fit, copy, image ×16, copy_merge, hero_section (1 erro + 1 sucesso),
  text_format (skipped), image_format, color_format, qa (skipped/disabled)
```

Escolha registrada em `email_generation_choices` (13:58:17, mesmo batch):
`hero = welcome - hero section 5 · offer = offer 1 · body = body 4 - bridge fundo cards · products = produtos 7 - dois produtos · reviews = review 7 · footer = footer 1`.

---

## 2. Caminho de código que rodou

A run nasceu em `assembleStoreReference`
(`src/lib/agents/architect/component-assembler.service.ts`), chamada por
`generate.service.ts` (fase 1, loja × flow × email). O ramo que efetivamente
falou com o modelo foi o **Curador do vault**, porque
`email_generation_settings.curador_vault_mode = 'on'` para a org da loja
(`d1ae3cf9-558d-40cc-9272-4a5633894ef8`):

```
assembleStoreReference
  ├─ loadActiveVariantsByType()          → 40 variantes ativas, 35 elegíveis (variantIsFillable)
  ├─ loadCuradorVaultMode(storeId)       → "on"
  ├─ loadCuradorVaultKnowledge()         → 163 docs ativos de email_vault_docs
  ├─ loadEstruturaRefsResumo("welcome")  → 8 refs
  ├─ buildCatalogVaultExtras + buildCatalog → catálogo JSON (130.074 chars, sha8 8605a7e5)
  ├─ loadCuradorMemory(...)              → email_generation_choices (org + loja)
  ├─ loadActiveAgentConfig("assembler_chooser") → row kimi-k3 (NÃO usada neste ramo)
  ├─ monta chooserVars (22 vars) + origins (editorialOrigins)
  └─ modo "on" → runCuradorShadow({ modo:"on", baseVars: chooserVars, … })
        (src/lib/agents/architect/curador-shadow.ts)
        ├─ model  = CURADOR_SHADOW_MODEL (env) ?? "anthropic/claude-sonnet-4.6"
        ├─ system = DEFAULT_CHOOSER_VAULT_SYSTEM (in-code)
        ├─ user   = DEFAULT_CHOOSER_VAULT_USER   (in-code)
        ├─ temperature 0.2 · max_tokens 8192
        ├─ vars   = baseVars + momento/estruturas_ref/secoes_notas/aprendizados
        │           + memoria (baseVars.memoria + renderUsageCounts)
        ├─ buildSegmentedPrompt / buildInterpolatedSegments → prompt_segments
        ├─ startGenerationRun(...)  (rendered_prompt = USER renderizado)
        ├─ invokeAgent(config, vars, {protocolo, convivencias, catalogo})
        └─ finishGenerationRun(...)  (parsed_output com papeis, fio, ranking_justificado…)
```

**Transporte** (`llm-invoke.ts`): o id do modelo contém `/`, então foi
`invokeViaOpenRouter` → `POST https://openrouter.ai/api/v1/chat/completions`
com `messages = [{role:"system", content:[{type:"text", text, cache_control:{type:"ephemeral"}}]}, {role:"user", content}]`,
`temperature: 0.2`, `max_tokens: 8192`, sem campo `reasoning` (só kimi/glm e
GPT-5 recebem), timeout 240 s (`ARCHITECT_INVOKE_TIMEOUT_MS`), retry via
`withOpenRouterRetry`. O system vai como ARRAY com `cache_control` porque o
modelo é `anthropic/*` — é o que torna os ~153k chars de prefixo cacheáveis
entre lojas (o `catalog_sha8` foi o mesmo `8605a7e5` nas três últimas runs
desde 02:42 UTC).

---

## 3. SYSTEM — 7 segmentos, 153.220 chars

O system NÃO é gravado em `rendered_prompt`. Ele é reconstruível pelos
`prompt_segments` (texto inline) **exceto o catálogo**, que viaja por
referência (`{ref:"catalogo", sha8:"8605a7e5", chars:130074}`) e é
resolvido sob demanda pelo Estúdio em `GET /api/admin/agents/prompt-segment`
(o hash é conferido na resolução).

| # | Classe | Rótulo gravado | Chars | De onde vem | Como chega |
|---|---|---|---|---|---|
| 0 | `agente` | Template do agente | 1.698 | `DEFAULT_CHOOSER_VAULT_SYSTEM` (in-code, `curador-shadow.ts`) — abertura + EMENDA-MOMENTO-01 | literal |
| 1 | `vault` | Protocolo de seleção — email_vault_docs | 11.760 | `email_vault_docs` kind=`protocolo`, slug `_protocolo-de-selecao`, arquivo `componentes/_protocolo-de-selecao.md` (body 11.762 chars, commit `39662d10`) | `buildProtocoloBlock` → `clamp(body_md, 24_000)` → `{{protocolo}}` |
| 2 | `agente` | Template do agente | 842 | mesmo template — fechamento do protocolo + abertura de `<biblioteca>` | literal |
| 3 | `biblioteca` | Catálogo da biblioteca — 35 variantes + eixos do vault | **130.074** (por `ref` + sha8) | `email_component_variants` (35 ativas E elegíveis) + `email_vault_docs` kind=`variante` (eixos por `variant_id`) | `buildCatalog(eligible, vaultExtras)` → JSON (`JSON.stringify(sections, null, 1)`) → `{{catalogo}}` por `interpolateSystem` (substituição literal) |
| 4 | `agente` | Template do agente | 84 | template — fechamento de `<biblioteca>` + abertura de `<convivencia>` | literal |
| 5 | `vault` | Regras de convivência — email_vault_docs | 4.688 | `email_vault_docs` kind=`convivencia` — 6 docs (`exige-hero-ou-contexto-acima`, `grade-de-produtos-nao-convive-com-review-vitrine`, `monoespacado-nao-convive-com-serif-display`, `peca-inteira-nao-e-bloco`, `prova-social-nao-duplica-na-peca`, `raio-alto-nao-convive-com-canto-vivo`) | `buildConvivenciaBlock` → `— slug:\n clamp(body, 900)` → `{{convivencias}}` |
| 6 | `agente` | Template do agente | 4.074 | template — "Como decidir, na ordem" (4 regras), regras herdadas do Curador antigo, contrato de saída JSON justificado | literal |

### 3.1 O que há dentro do catálogo (segmento 3)

Cada entrada (`CatalogEntry`, `catalog-builder.ts`) levava, NESTA run, por
variante: `variant_id`, `name`, `description`, `quando_usar`,
`quando_nao_usar`, `objectives[]`, `tones[]`, `density`, `product_slots`,
`orientacao_copy` (`copy_guidance`), `notas_implementacao`
(`long_description`) e, quando a variante tem nota no vault, `vault: {slug,
momento[], momento_vetado[], objecao[], registro[], registro_vetado[],
paleta[], papel_na_peca[], peso, convivencia[], itens}`. Onde a prosa do
vault existe ela **vence** a do banco (`description`/`quando_usar`/
`quando_nao_usar`); quando as duas descreviam peças diferentes (Dice <
0,5), a do banco entrava também como `description_no_banco`. Nesta run:
**2 divergentes** — `body-4-tutorial-de-uso` e `body-3-pitch-de-gift-card`.

> **Mudado depois desta run (02/09, mesmo dia):** `objectives`, `tones`,
> `density`, `product_slots` do banco, `orientacao_copy` e
> `description_no_banco` SAÍRAM do catálogo. A capacidade passou a vir do
> vault (`vault.product_slots` + `vault.itens`) e a divergência vault ×
> banco ficou só na telemetria — foi corrigida na fonte: a nota
> `body-4-tutorial-de-uso` virou `body-4-comparativo-em-duas-colunas`
> (o HTML sempre foi o comparativo; `body-3` era a mesma peça com outro
> vocabulário, falso positivo).

O HTML e o `output_schema` **NÃO** entram no catálogo (decisão CM-3).

Composição do catálogo (35) versus banco (40 ativas):

| Seção | Ativas no banco | No catálogo | Fora (não elegíveis) |
|---|---|---|---|
| hero | 9 | 9 | — |
| offer | 4 (`offer 1, 2, 3, 6`) | 4 | — |
| body | 7 | 3 (`body 2, 3, 4`) | `body 6, 7, 8, 9` — `output_schema` vazio → `variantIsFillable=false` |
| products | 9 | 9 | — |
| reviews | 7 | 7 | — |
| footer | 4 | 3 | `footer 4 - dark` — `output_schema` vazio |

"Eixos em 40" no `input_summary` conta os docs `kind=variante` ativos do
vault que resolveram `variant_id` (40), não as entradas do catálogo (35):
cinco notas do vault apontam para variantes que não estão no catálogo
(`footer-4`, `offer-4`, `offer-5`, `body-5`, `body-10` — ver achado A3).

---

## 4. USER — 45 segmentos, 50.156 chars (= `rendered_prompt`)

Template: `DEFAULT_CHOOSER_VAULT_USER` (in-code). Os 23 segmentos `agente`
(1.018 chars) são a cola do template (`<store>\n- marca: `, `\n- nicho: `…).
Abaixo, os **22 blocos de conteúdo**, na ordem em que o modelo os leu.

| Tag no prompt | Var | Classe | Chars | Fonte concreta | Builder / caminho | O que chegou nesta run |
|---|---|---|---|---|---|---|
| `<store>` marca | `brand_name` | loja | 15 | `client_stores.store_name` | direto | `Innova Bay nova` |
| `<store>` nicho | `nicho` | loja | 43 | `store_briefings.marca.nicho` → `client_stores.niche` | `fieldOrMissing` | **`(não cadastrado — deduza de <perfil_marca>)`** — `niche` é NULL e não há briefing |
| `<store>` posicionamento | `posicionamento` | loja | 43 | `store_briefings.marca.posicionamento` → `client_stores.posicionamento_preco` | `fieldOrMissing` | **`(não cadastrado …)`** — ambos NULL |
| `<store>` persona | `persona` | loja | 312 | `client_stores.icp_persona` (JSONB) + `icp_demographics` | `resolvePersonaText` | "Robert Prova-Antes — 40 · Estados Unidos … Ensino médio +" |
| `<store>` tom de voz | `tom_voz` | loja | 984 | `client_stores.tone_description` | direto | "A voz soa como a de um vendedor experiente…" (2 parágrafos) |
| `<outline>` objetivo | `outline_objective` | curadoria | 260 | `email_outline_templates` (welcome/1, id `dc5a2455-…`, atualizado 30/08).`objective` | direto | "A pessoa acabou de assinar…" |
| `<outline>` diretriz | `outline_guidance` | curadoria | 860 | `email_outline_templates.guidance` (Estruturador OFF → não é o fio dele) | direto | "Este e-mail tem dois trabalhos inseparáveis…" |
| `<outline>` tom sugerido | `outline_tone_hint` | curadoria | 38 | `email_outline_templates.tone_hint` | direto | `Tom: Aspiracional, premium, acolhedor.` (ver achado A6) |
| `<intencao_do_email>` [do flow] | `intencao_flow` | vault | 2.792 | `email_intents` flow=welcome, slug `_flow` (`intencoes/welcome/_flow.md`, 2.794 chars) | `clampPromptText` | "# A intenção do flow inteiro… varredura de objeções… Regras do incentivo 1-6" |
| `<intencao_do_email>` [deste email] | `intencao_email` | vault | 1.729 | `email_intents` slug `welcome-1` (`email_number=1`, 1.731 chars) | `clampPromptText` | "# Welcome 1 — Entregar a promessa e trocar o motivo…" |
| `<intencao_do_email>` [NÃO DEVE] | `outline_restricoes` | curadoria | 369 | `email_outline_templates.restrictions` | trim ou "(sem restrições declaradas)" | 4 bullets (não contar a fundação, não pedir engajamento paralelo, sem urgência artificial, uma objeção só) |
| `<momento>` | `momento` | sistema | 884 | código `momentoDoEmail("welcome", 1)` = `welcome-1` + `email_vault_docs` kind=`eixo` grupo=`momento` slug=`welcome-1` (`componentes/eixos/momento/welcome-1.md`, 875 chars) | `buildMomentoBlock` → `clamp(nota, 1_800)` | "welcome-1\n\n# Welcome 1\n\nPrimeiro toque…" |
| `<estruturas_de_referencia>` | `estruturas_ref` | vault | 644 | `email_structure_refs` flow=welcome, `is_active` — 8 refs (`avelmore-*` ×4, `carta-plain-text-extensao`, `medicube-*` ×3), colunas `slug, loja, escopo, emails, secoes_normalizadas` | `loadEstruturaRefsResumo` → `buildEstruturasRefResumo` (1 linha por ref, máx 15) | "- avelmore-deadline-objecao (geral) [emails 2]: hero → body → offer → products → footer …" |
| `<notas_de_secao>` | `secoes_notas` | vault | 12.743 | `email_vault_docs` kind=`secao` — só as seções da estrutura deste email: `_hero` (3.538), `_offer` (2.127), `_body` (2.642), `_products` (2.107), `_reviews` (2.544), `_footer` (1.692) | `buildSecaoNotasBlock` → `semExige(body)` → `clamp(…, 5_000)` por seção | "## Seção hero\n# Cobertura\n\n9 variantes…" (ver achado A4) |
| `<aprendizados>` | `aprendizados` | vault | 14.453 | `email_learnings` `is_active` com `flow_type='welcome'` (12) OU `flow_type IS NULL` e `aplica_a` contendo welcome (6) = **18** | `loadAprendizadosResumo` → `buildAprendizadosBlock` (`clamp(body, 1_200)`, máx 25) | "— ausencia-de-prova-social-assume-abertura: …" — 3 notas passaram do teto e aparecem com `(… truncado)` |
| `<revisao_humana>` | `revisao_humana` | curadoria | 35 | `email_structure_reviews` (`is_active`, flow=welcome, email 1, `para_curador=true`) — **0 linhas** | `loadRevisoesAplicaveis` → `montarBlocoRevisao(revisoes, "curador")` | `(nenhuma revisão humana registrada)` |
| `<perfil_marca>` | `briefing_marca` | loja | 8.399 | **Pesquisa & Diagnóstico** (`client_stores.brand_*`, `store_*`, `icp_*`, `tone_*`) serializada SEM a seção 05 (ads). `store_briefings` tem **0 linhas** para a loja, então o fallback é a pesquisa | `pesquisaToFullText(store, {incluirAds:false})` → `resolveBrandProfile` (source = `pesquisa`) | "## 01 · Perfil da Marca … ## 02 · Sobre a loja … ## 03 · Cliente Ideal … ## 04 · Tom de Comunicação" |
| `<objecoes>` | `objecoes` | loja | 722 | `client_stores.icp_frictions` (TEXT[], 5 itens) | `resolveObjecoes` (bullets) | 5 bullets ("Desconfiança de que produtos baratos…") |
| `<vocabulario>` | `vocabulario` | loja | 808 | `client_stores.tone_use_words` (22) / `tone_avoid_words` (28) | `resolveVocabulario` (literal, sem corte) | "Usar: garantia vitalícia, sem risco, … / Evitar: jornada, imersão, …" (ver achado A7) |
| `<top_products>` | `top_products` | loja | 423 | `store_top_products` (rank ≤ 5: `title, price, handle`) + `client_stores.store_url` | `mapTopProductRow` → `renderTopProducts` | 5 produtos com preço e link (`EnergySave Pro™ — 39.9 — https://innovabay.site/products/energysaver-pro™` …) |
| `<memoria>` | `memoria` | sistema | 2.231 | (a) `email_generation_choices` do email #1 de welcome em OUTRAS lojas da mesma org (Luxe Lift, Von Alder); (b) email anterior da loja — N=1, não há; (c) `<uso_por_variante>`: contagem por `variant_id` nas últimas 500 linhas de `email_generation_choices`, slug do vault quando existe | `loadCuradorMemory` → `renderCuradorMemory` + `loadVariantUsageCounts` → `renderUsageCounts` (concatenados em `curador-shadow.ts`) | `<mesmo_email_em_outras_lojas>` (2 lojas) + `<uso_por_variante>` (41 linhas, de `footer-1-menu-outline: 162×` a `footer-4-dark-mega-menu: 1×`; 5 linhas com UUID cru — variantes sem nota no vault) |
| `<estrutura_do_email>` | `blocks_json` | sistema | 351 | `email_outline_templates.suggested_blocks` = `["hero","offer","body","products","reviews","footer"]` (Estruturador OFF) | `resolveStructure(outline)` → `JSON.stringify([{block_index, section, componente}])` | 6 posições, `componente` = mesmo nome da seção |
| `estruturador_decisao` | `estruturador_decisao` | upstream | — | `resumoParaCurador(estruturadorOutput)` — Estruturador em `off` → NULL | `clampPromptText(null, "(sem decisão…)")` | **A var foi montada, mas o template do vault NÃO tem `{{estruturador_decisao}}`** — não chegou ao modelo (ver achado A2) |

### 4.1 Totais por classe (soma dos `chars` dos segmentos)

| Parte | Classe | Segmentos | Chars |
|---|---|---|---|
| system | agente | 4 | 6.698 |
| system | vault | 2 | 16.448 |
| system | biblioteca | 1 | 130.074 |
| user | agente | 23 | 1.018 |
| user | loja | 9 | 11.749 |
| user | curadoria | 5 | 1.562 |
| user | vault | 5 | 32.361 |
| user | sistema | 3 | 3.466 |
| **total** | | **52** | **203.376** (≈ 68,4k tokens de entrada — bate com `tokens_input`) |

Leitura: **72% do que o Curador recebeu é biblioteca + vault** (catálogo,
protocolo, convivências, notas de seção, aprendizados, intenções). A loja
responde por 6% e a curadoria global (outline) por menos de 1%.

---

## 5. Estado das alavancas que decidiram o caminho

| Alavanca | Onde | Valor na run | Efeito |
|---|---|---|---|
| `curador_vault_mode` | `email_generation_settings` (org `d1ae3cf9-…`) | `on` | ramo `runCuradorShadow({modo:"on"})`; o caminho kimi nem foi iniciado (`chooserRunId=""`) |
| `estruturador_mode` | idem | `off` | run `estruturador` gravada como `skipped`; sequência = outline; `outline_guidance` = diretriz do outline; `estruturador_decisao` ausente |
| `copy_fit_mode` | idem | `on` | não afeta o Curador |
| `default_model` | idem | NULL | não afeta o ramo vault (modelo é `CURADOR_SHADOW_MODEL`) |
| `CURADOR_SHADOW_MODEL` | env | não definida (assumido) | modelo = default in-code `anthropic/claude-sonnet-4.6` — coincide com o gravado |
| `email_agent_configs` (`assembler_chooser`, ativa, id `893989b4-…`) | banco | `moonshotai/kimi-k3`, T=0.20, max 8192, `system_prompt` e `user_template` **vazios** | **NÃO usada** neste ramo (só entraria no fallback kimi) |

---

## 6. O que o modelo devolveu (para fechar o ciclo)

`parsed_output` da run: `estrutura_conforme: true` (os 6 papéis casaram
índice a índice com a arquitetura), `fio_narrativo` preenchido,
`positions_ranked: 6`, `empty_blocks: []`, `invalid_ids: []`,
`posicoes_sem_variante: []`, `live_rank1_agreement: {comparaveis:0}` (não
há call vivo para comparar no modo `on`).

`ranking_justificado` (rank 1 por posição):
`hero-5-cupom-em-tres-lugares` · `offer-1-condicao-sem-imagem` ·
`body-3-pitch-de-gift-card` · `products-7-dois-com-galeria-de-angulos` ·
`reviews-7-zigue-zague-com-cupom` · `footer-1-menu-outline`.

`protocol_violations`: 4 × `momento_nao_declarado` (offer, body, products,
reviews) — esperado sob a EMENDA-MOMENTO-01: declarar outro momento NÃO
elimina, o medidor só registra.

Nota: a escolha FINAL gravada em `email_generation_choices` tem
`body = body 4 - bridge fundo cards` (rank 2 do Curador), não `body 3` (rank
1). Quem trocou foi o Montador (`assembler`, kimi-k3, 13:58:00), que tem essa
alçada por design ("PADRÃO: fique com a 1ª indicação… só sai por razão de
objeção/convivência"). Não é desvio do Curador.

---

## 7. Achados do catálogo

Coisas que a auditoria desta run expõe e que valem decisão. Nenhuma foi
alterada aqui — este documento é o levantamento.

**A1. A aba Agentes não governa o Curador vigente.** No modo `on`, modelo,
system e user vêm de `curador-shadow.ts` (`CURADOR_SHADOW_MODEL`,
`DEFAULT_CHOOSER_VAULT_SYSTEM/USER`). A row ativa de `email_agent_configs`
para `assembler_chooser` (kimi-k3, prompts vazios) é carregada e ignorada; a
run nasce com `agent_config_id = NULL`. Editar o Curador na UI hoje muda só
o fallback kimi. Se a intenção é que o vault seja o Curador definitivo, ou a
config passa a alimentar esse ramo, ou a UI deixa claro que ele é fixo em
código.

**A2. `estruturador_decisao` é montada mas não entra no prompt do vault.**
`chooserVars.estruturador_decisao` existe e tem origin declarada
(`upstream`), mas `DEFAULT_CHOOSER_VAULT_USER` não tem `{{estruturador_decisao}}`.
Hoje é inócuo (Estruturador em `off`); ligar o Estruturador em `on` com o
Curador do vault faria a decisão dele **não chegar** ao Curador — só o
`outline_guidance` (que vira o fio narrativo dele) chegaria. O
`input_summary` da run declara "Decisão do Estruturador: (sem decisão nesta
geração)", o que mascara a diferença entre "não houve" e "não é servida".

**A3. As notas de seção e o `<uso_por_variante>` falam de variantes que não
estão no catálogo.** A nota `_offer` diz "6 variantes, todas ativas" e
tabela com `offer-4-manifesto-antes-do-cupom` (momento `welcome-1`) e
`offer-5-tres-diferenciais-e-cupom`; no banco só `offer 1, 2, 3, 6` estão
ativas e só elas foram ao catálogo. Efeito observado NESTA run: a
`justificativa` da posição offer termina com "Ordem: offer-4 (1º por momento
welcome-1, apesar do registro), offer-1 (2º), offer-3 (3º)" — o modelo
elegeu como 1º uma variante que não podia escolher, e as `escolhas` saíram
com 2 itens (offer-1, offer-3) em vez de 3. O mesmo vale para `body-5` e
`body-10` (nota `_body` os cita como inativos, correto) e para `footer-4`
(no vault, no uso-por-variante, fora do catálogo por schema vazio). O vault
descreve o inventário do Obsidian; o catálogo descreve o que o banco pode
montar. Onde os dois divergem, o modelo raciocina sobre fantasmas.

**A4. `semExige` deixa as notas de seção com frases quebradas.** A remoção
por LINHA de tudo que cita `exige` (decisão de 02/09) apagou também o início
de parágrafos: em `_hero` a "Chave de decisão" começa em "(requisito duro,
inclui o ativo fotográfico) → objeção (1º eixo…)", e há trechos como "e
hero-10-lineup-de-colecao têm `momento`, `objecao`, `registro`,
`variant_id`, `schema_campos` e `peso.altura_px` divergem)" e "mesma peça).
Nenhuma outra variante — nem hero-2…" que perderam a oração anterior. O
conteúdo eliminado era o certo; o corte por linha em prosa corrida deixa
resíduo ilegível. Vale cortar por SENTENÇA ou editar as notas no vault.
(A palavra `exige` aparece 2× no user desta run, as duas em prosa comum —
"a decisão exige", "o que exige uma comunicação técnica" — em
`<aprendizados>` e `<perfil_marca>`, não como campo do vault; era 12× antes
da correção de 02/09. O filtro cumpriu o papel nas notas de seção.)

**A5. Nicho e posicionamento chegaram como "(não cadastrado)".**
`client_stores.niche` e `posicionamento_preco` são NULL e não existe
`store_briefings` para a loja (0 linhas), então os dois campos de `<store>`
apontam para `<perfil_marca>` — que, por sua vez, é a Pesquisa serializada
(fonte `pesquisa`, 8.399 chars), não um briefing curado. A pesquisa cobre
(a seção 02 diz "popular / acessível, ticket médio < R$ 100"), mas é dado de
segunda mão para o Curador. O `log.warn("architect.store_context_partial")`
disparou por construção.

**A6. `outline_tone_hint` contradiz a loja.** O outline global de welcome/1
manda "Tom: Aspiracional, premium, acolhedor."; a pesquisa e o
`tone_description` da Innova Bay dizem "técnico, direto, sem floreio".
O Curador recebeu os dois. A justificativa de hero/offer/footer mostra que
ele seguiu a marca (vetou `premium-editorial`), mas a var está lá empurrando
para o lado oposto. O outline é global por flow×email; o tom deveria vir da
loja ou o campo deveria ser omitido quando a loja tem tom próprio.

**A7. Vocabulário com pontuação suja.** `tone_use_words` contém itens como
`"antes de decidir,"`, `"direto ao ponto:"`, `"na prática,"` — o prompt sai
com "antes de decidir,, direto ao ponto:, na prática,," e o resumo conta
"23 usar / 30 evitar" onde o banco tem 22/28. É lixo de captura no
`client_stores`, não do builder (que é literal de propósito).

**A8. O `rendered_prompt` não contém o system.** É decisão documentada (o
catálogo de 130k é reconstruível por conteúdo), mas vale saber: `protocolo`
(11,7k) e `convivencias` (4,7k) só existem inline em `prompt_segments`; se
os segmentos falharem no guard de recomposição, o system inteiro some da
auditoria. Nesta run o guard passou (52 segmentos, chars conferem com
`length(rendered_prompt)`).

---

## 8. Como reproduzir o levantamento

```sql
-- a run
select * from email_generation_runs where id = '6e116d4b-268f-4e65-9244-f68ac02ca9e9';

-- segmentos na ordem (parte, classe, rótulo, tamanho, ref/sha8)
select ord-1 as idx, seg->>'parte' parte, seg->>'cls' cls, seg->>'rotulo' rotulo,
       (seg->>'chars')::int chars, seg->>'ref' ref, seg->>'sha8' sha8
from email_generation_runs r, jsonb_array_elements(r.prompt_segments) with ordinality s(seg, ord)
where r.id = '6e116d4b-268f-4e65-9244-f68ac02ca9e9' order by ord;

-- totais por classe
select seg->>'parte', seg->>'cls', sum((seg->>'chars')::int), count(*)
from email_generation_runs r, jsonb_array_elements(r.prompt_segments) s(seg)
where r.id = '6e116d4b-268f-4e65-9244-f68ac02ca9e9' group by 1,2 order by 1,2;

-- o prompt de user inteiro (50.156 chars)
select rendered_prompt from email_generation_runs where id = '6e116d4b-268f-4e65-9244-f68ac02ca9e9';

-- fontes do vault servidas
select kind, grupo, slug, length(body_md), file_path, synced_commit_sha
from email_vault_docs where is_active
  and (kind in ('protocolo','convivencia','secao') or (kind='eixo' and grupo='momento' and slug='welcome-1'));

-- catálogo × banco
select block_type, name, id, jsonb_array_length(coalesce(output_schema,'[]')) schema_n
from email_component_variants where is_active order by 1,2;
```

Para o catálogo exato (segmento 3) o caminho é o do Estúdio:
`GET /api/admin/agents/prompt-segment?ref=catalogo&sha8=8605a7e5` — ele
reconstrói por `buildCatalog` e confere o hash.
