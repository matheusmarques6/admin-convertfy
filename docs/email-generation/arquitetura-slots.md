# Arquitetura por Slots — agentes recebem só o que lhes convém

> Proposta mapeada em jul/2026 (pós-épico Taguedor). Estado: **Fase A
> IMPLEMENTADA** (migration 20261042) e **Fases B–D IMPLEMENTADAS**
> (migrations 20261043–46, "views-arch F1–F5", jul/2026):
>
> - **F1 — block_id nos contratos**: toda op e toda view pode carregar o
>   `email_blocks.id` (a MESMA chave do callback do n8n) — rastreabilidade
>   n8n → banco → view → op → HTML na telemetria. Aditivo/opcional.
> - **F2 — Verificador de merge (7b)**: agente LLM barato
>   (`merge_verifier`, Haiku) audita o resultado do copy_merge com views e
>   tria a fila do agente de exceção (`{block_id, tag, motivo,
>   copy_candidata, acao_sugerida}`). Modo via
>   `email_generation_settings.merge_verifier_mode` ('on_flag' default /
>   'always' / 'off' = kill-switch). Erro/timeout → fallback mecânico;
>   nunca derruba a geração. Ele não escreve HTML — output é roteamento.
> - **F3 — image_format por views**: recebe `image_slots_json`
>   ({block_id, tag, row_html}) + `logo_candidates_json` no lugar do
>   documento; ops iguais, applyOps aplica no doc que o agente não viu.
> - **F4 — color_format por inventário**: recebe `color_inventory_json`
>   ({valor, ocorrencias, contextos} — cobre hex/short-hex/rgb/rgba/
>   bgcolor/<style>) e emite ops `recolor {from, to}` — troca GLOBAL por
>   valor de cor, aplicada por código (`applyRecolor`, alpha do rgba
>   preservado). Atômico: impossível quebrar estrutura.
> - **F5 — QA por views**: o LLM recebe `block_views_json` (texto visível,
>   hrefs, imagens, block_id — extraídas ANTES do strip dos marcadores)
>   em vez do documento; visão global virou código (`runGlobalDocChecks`:
>   placeholder sobrando, <img> sem src, contagem de blocos × blueprint).
>   `QaIssue.block_id` aditivo.
>
> A3b (view por slot no agente de exceção) foi implementada junto da Fase
> A; a fila agora chega TRIADA pelo 7b quando ele roda. Item extra:
> reasoning OFF nos steps de JSON (image_format/color_format) via
> parâmetro unificado do OpenRouter (`FORMAT_OPS_REASONING=on` re-liga).

## Princípio

Hoje 3 dos 4 agentes de formatação recebem o **documento inteiro** (40–65k
tokens) e um deles (Formatação de Texto) também **emite** o documento
inteiro — a maior fonte de latência, custo e risco (truncation, "melhorias"
não pedidas) da cadeia.

A proposta inverte: **o documento canônico vive no CÓDIGO** (o Integrador).
Cada agente recebe apenas os SLOTS da sua alçada + contexto mínimo, e
devolve um **patch tipado por tag**, que o Integrador aplica no documento
com validação. Nenhum agente redigita o email. O único que vê o HTML
completo e final é o **QA** (ativação futura).

Pré-requisito que torna isso possível: o épico Taguedor. Com
`html_tagged` aprovado, todo slot tem um placeholder `{{UPPER(key)}}`
ÚNICO e ancorado no schema (`fields.tag` v2) — âncora determinística que
o código sabe substituir sozinho.

## Modelo mental: o email é um repositório git

O jeito certo de pensar o Integrador (definido pelo Matheus, jul/2026):

- **Repositório** = o HTML canônico do email, persistido (arquitetura do
  Montador com `{{PLACEHOLDERS}}`).
- **Sparse checkout** = a extração de view por agente: cada um "clona" só
  a parte que lhe é necessária (copy → tags de texto com a linha
  envolvente; imagem → slots de `<img>`; cores → inventário de cores).
- **Commit** = a aplicação do patch pelo Integrador, mudando SÓ a parte
  referenciada no output, com formatação/indentação feitas por código.
- **CI** = as validações pré-merge (âncora única, tabelas balanceadas,
  posse) — patch reprovado não entra; é pulado + telemetria.
- **CODEOWNERS** = a matriz de posse por tag.
- **Histórico/blame** = snapshot do documento após cada commit + sha8
  encadeado (qual agente introduziu o quê; rollback por estágio).

Consequências novas que o modelo destrava:

1. **Paralelismo**: agentes de posses DISJUNTAS (Ajuste de Texto ×
   Formatação de Imagem) rodam em paralelo sobre a mesma versão base e
   commitam em sequência — conflito é impossível por construção. Ordem:
   hero commita antes (estrutural); cores por último. Corta o tempo de
   parede além do ganho do merge determinístico.
2. **Rollback por estágio**: QA (ou o humano) reprova → volta ao commit
   anterior e re-roda só o estágio culpado, em vez de regenerar o email.

## O Integrador (código, não LLM)

Guarda o documento (arquitetura do Montador, com placeholders) e aplica
patches em ordem. Já existe embrião: `apply-patches.ts` (ops img /
remove_slot / replace + `allowHero`), `hero-locator.ts` (splice por
sentinelas), `enclosingRow`. Generalizações necessárias:

- **Matriz de posse por tag** (ownership): cada tag pertence a exatamente
  UM estágio. Patch em tag fora da posse do estágio → rejeitado +
  telemetria (generaliza o `allowHero` de hoje).
- Ações novas: `set_text` (troca {{TAG}} por texto), `remove_row`
  (remove a linha/célula do slot vazio — já existe como remove_slot),
  `set_url` (hrefs), `set_root_var` (valores do :root).
- Validações por patch: âncora única, tabelas balanceadas, tag existente.
  Patch inválido é PULADO e registrado (`ops_skipped`) — nunca corrompe.
- sha8 encadeado continua: documento após cada estágio = input do próximo.

## Matriz: o que cada agente recebe e devolve

### 0. Merge Determinístico de Copy (CÓDIGO — estágio novo, custo zero)

Roda ANTES de qualquer LLM de texto. Sem modelo.

| | |
|---|---|
| **Recebe** | fields v2 do blueprint (key→tag→copy do bloco), URLs dos blocos, fontes/cores aprovadas, subject/preheader |
| **Faz** | `{{TAG}}` → valor da copy (match por `fields.tag`); `{{*_CTA_URL}}` → URL do bloco; preheader/title; valores do `:root` (fontes + cores por papel); lang |
| **Posse** | tags de natureza `copy` COM `fields.tag` resolvido, fora da hero + META + :root |
| **Precisão** | 100% determinística — placeholder é âncora única; sem julgamento envolvido |

### 1. Ajuste de Texto (LLM — só EXCEÇÕES; skip total quando não há)

Substitui o Formatação de Texto atual. Só é invocado se o merge deixou
pendências.

| | |
|---|---|
| **Recebe** | LISTA de slots não resolvidos: `{tag, linha_html_do_slot (via enclosingRow), copy_candidata, fields_do_bloco}` + copy corrida sem campos (fallback n8n legado) + fontes |
| **Devolve** | `{"ops":[{tag, action:"set_text", value}, {tag, action:"remove_row"}]}` — NUNCA HTML |
| **Posse** | tags `copy` com `tag:null`/ambíguas, fora da hero |
| **Precisão** | é onde mora o julgamento (fatiar copy corrida, decidir remoção); volume cai à medida que a biblioteca é tagueada — tende a skip |

### 2. Hero Section (LLM — único que emite HTML, e só o fragmento)

Já funciona assim (fragmento + splice). Corte adicional: **input**.

| | |
|---|---|
| **Recebe** | SÓ a `hero_region` (não mais o `montador_html` completo) + variante (html tagueado + rendered gold) + schema + copy da hero (array, blocos internos) + imagem + identidade + logos |
| **Devolve** | fragmento HTML entre `<CFY_HERO_OUTPUT>` (como hoje); splice por código |
| **Posse** | TODAS as tags entre as sentinelas `cfy:hero` |
| **Precisão** | acabamento estrutural precisa ser HTML (não dá pra reduzir a patch); o corte de input economiza ~30-50% dos tokens de entrada do step |

### 3. Formatação de Imagem (LLM — output já é patch; cortar o input)

| | |
|---|---|
| **Recebe** | POR SLOT: `{tag, linha_html_envolvente, dims_do_slot, slot_note}` (extraído por código — mesmo mecanismo do slot_note) + `image_map` (natureza `imagem_gerada`, sem hero) + logos |
| **Devolve** | `{"ops":[{tag, action:"img", url, width_px, alt}, {tag, action:"remove_slot"}]}` (formato atual) |
| **Posse** | tags de natureza `imagem_gerada` fora da hero; `asset_fixo` é invisível pra ele |
| **Precisão** | a linha envolvente + dims declaradas bastam pra decidir width/crop; sem o documento inteiro o modelo não tem o que "melhorar" |

### 4. Cores & Botões (LLM — inventário em vez de documento)

| | |
|---|---|
| **Recebe** | INVENTÁRIO extraído por código: valores do `:root`, lista de cores únicas em uso (`bgcolor`, styles de botão/texto) cada uma com 1-2 snippets de contexto + paleta com papéis + nicho/tons/pesquisa |
| **Devolve** | `{"ops":[{action:"replace", find:"#HEX-ou-var", replace:"#HEX", scope:"color"}]}` — o Integrador aplica em TODAS as ocorrências validadas |
| **Posse** | somente valores de cor; ÚNICO autorizado a tocar dentro da hero (regra atual mantida); fail-open mantido |
| **Precisão** | trocar cor por cor é seguro por natureza; o julgamento (paleta × nicho) continua no LLM, só que sobre ~20 linhas em vez de 60k tokens |

### 5. QA (LLM — futuro, único com o documento completo)

Recebe o HTML final integrado + blocks + briefing e valida o conjunto
(hoje já é assim; ativação/reforço ficam pra depois da migração).

## Sem conflito, por construção

1. **Posse exclusiva por tag** — dois agentes nunca podem escrever no
   mesmo slot; o Integrador rejeita patch fora da alçada.
2. **Ordem fixa** — merge → ajuste de texto → hero → imagem → cores; cada
   estágio parte do documento já integrado do anterior (sha8).
3. **Âncora única** — patch só aplica se a âncora ocorre exatamente 1x
   (regra atual do `find` estendida a todas as ações).
4. **asset_fixo** — sem placeholder, invisível a todos os patches.

## Ganho esperado

| Step | Hoje | Depois |
|---|---|---|
| Formatação de Texto | 2–5 min (doc inteiro via GLM) | ~0s (merge) + LLM só em exceção |
| Hero | 1–2 min | igual, input menor (↓ tokens) |
| Formatação de Imagem | 30–60s | ↓ (input por slot) |
| Cores & Botões | 30–90s | ↓ (inventário) |
| **Cadeia típica** | **5–9 min** | **~2–3 min** (dominada por hero + imagem) |

Riscos honestos: (a) a precisão do merge depende da biblioteca tagueada e
APROVADA — variante legada sem âncora cai no agente de exceção; (b) copy
corrida do n8n (sem fields) continua precisando de LLM; (c) hero composta
segue sendo o caso mais delicado (inalterado).

## Faseamento recomendado

1. **Fase A** — Merge determinístico + Ajuste de Texto como exceção
   (maior ganho: mata a baleia). Gate: % de slots com `fields.tag`
   resolvido no batch (telemetria já existe: `fields_sem_tag`).
2. **Fase B** — Inventário de cores + input por slot na imagem.
3. **Fase C** — Corte do input da hero (region + variante).
4. **Fase D** — QA reforçado como único leitor do documento completo.
