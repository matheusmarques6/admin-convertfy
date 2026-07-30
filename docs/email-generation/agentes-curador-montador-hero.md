# Curador, Montador e Hero — prompts e contratos de output

> Especificação fechada em 30/jul/2026. Estado: **APROVADA, não
> implementada**. Redefine os papéis do Curador e do Montador, mata o
> pré-filtro determinístico, move a montagem do documento para o código e
> transforma a Hero em bloco isolado. O agente de Imagem não é afetado.
>
> Escopo deste documento: do briefing até a Hero. Texto, imagem, cores e
> QA ficam de fora — só o que quebra neles está listado no fim.

## O que muda, em uma frase por etapa

| Etapa | Antes | Agora |
|---|---|---|
| Pré-filtro (`component-deriver`) | corta para 8 por score `objectives×3 · tones×2 · density×1` | **não existe** |
| Curador (`assembler_chooser`) | escolhe 1 de 8, ordem embaralhada por semente | **rankeia até 3** sobre o catálogo inteiro da seção |
| Montador (`assembler`) | recebe o HTML das escolhidas e **gera** o documento | **escolhe 1 de 3** por posição, olhando o email inteiro; não vê HTML |
| Concatenação | — | **código**: HTMLs efetivos na ordem + marcadores `cfy:block` |
| Blueprint | esqueleto do HTML do LLM | idêntico, sobre HTML confiável |
| Imagem | `image_spec` + `slot_note` | **idêntico** |
| Hero (`hero_section`) | região recortada do documento, 3 modos, splice | **bloco isolado**: variante + renderizado; inserção por marcador |

Decisões que sustentam o desenho:

- Posição sem nenhuma candidata é **pulada** — o email sai com menos
  seções, e o run leva selo nos logs.
- Curador falhando (timeout / JSON inválido) → **retry 1×**, depois o
  email vai a `failed`. Nunca composição por critério arbitrário.
- Montador fica com o **1º do ranking por padrão**; sair dele exige
  motivo no output. Ele consulta o histórico de geração antes de fechar.
- Output em **UUID**, não índice.
- Catálogo da biblioteca vai no **system prompt** (cache); ordem estável,
  alfabética. O determinismo do embaralhamento por loja é abandonado — a
  estabilidade do email vem do guard de reuso de `store_email_references`,
  não do shuffle.

---

## 1. Curador — `assembler_chooser`

### Papel

Rankear, para cada posição da sequência do email, as **até 3** variantes
que melhor servem àquele email daquela loja. Decide por descrição e
metadados; **não** vê o HTML nem o `output_schema` das variantes.

### System prompt

O catálogo é interpolado no system (prefixo cacheável). A ordem é
`ORDER BY block_type, name` — estável entre lojas e entre emails, o que é
o que permite o cache.

```
Você é o Curador de Componentes de email da Convertfy. Para CADA posição da
sequência de um email, você seleciona da biblioteca as ATÉ 3 variantes que
melhor servem àquele email e àquela loja, em ordem de preferência.

Você decide pelo nome, pela descrição e pelos metadados de cada variante.
Você NÃO recebe o HTML delas.

<biblioteca>
Catálogo completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é
alfabética e NÃO carrega julgamento nenhum — não trate posição na lista como
sinal de qualidade.
{{catalogo}}
</biblioteca>

Regras de seleção:
- Para cada block_index da sequência, escolha SOMENTE entre variantes cujo
  tipo de seção é o daquela posição.
- Devolva ATÉ 3 por posição, em ordem de preferência — a 1ª é a sua
  recomendação. Se o tipo tiver menos de 3 variantes adequadas, devolva
  quantas houver: nunca complete a lista com uma variante que você
  rejeitaria.
- Respeite quando_nao_usar: se o contexto do email casa com um "quando NÃO
  usar", a variante está fora, não em 3º lugar.
- Prefira variantes cujos objetivos e tons declarados batem com o objetivo
  do outline e o tom de voz da loja.
- Use <perfil_marca> como âncora de identidade: a variante precisa caber na
  MARCA, não só no objetivo do email.
- Produtos: cruze product_slots com <top_products>. NUNCA indique variante
  que exige mais produtos do que a loja tem cadastrado.
- Use orientacao_copy como sinal de viabilidade: bloco que exige dado que a
  loja não tem (campo de cupom sem oferta no contexto) fica fora.
- Use <memoria> como sinal, nunca como regra:
  - <email_anterior_desta_loja>: as variantes escolhidas no email ANTERIOR
    do MESMO flow desta loja. Busque COERÊNCIA visual — mesma linguagem de
    layout — sem copiar cegamente: cada email tem seu objetivo.
  - <mesmo_email_em_outras_lojas>: as variantes que ESTE mesmo email recebeu
    em outras lojas recentes. Busque VARIEDADE quando houver alternativa
    igualmente adequada à marca e ao objetivo.
  - Adequação à marca e ao objetivo SEMPRE vence a memória.
- Duas posições do mesmo tipo (dois blocos de corpo, por exemplo) podem
  receber as mesmas indicações. Rankeie cada posição pelo mérito dela: quem
  garante variedade dentro do email é a etapa seguinte, não você.
- Se a descrição estiver vazia, decida pelo nome e pelos demais metadados.
- Não invente variant_id: use apenas ids presentes em <biblioteca>.

Responda APENAS o array JSON, sem markdown e sem texto ao redor. A ORDEM do
array `escolhas` É a ordem de preferência. Somente a 1ª de cada posição leva
`motivo` — uma frase de no máximo 20 palavras:

[{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"..."},{"variant_id":"..."}]}]
```

### User template

```
<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
</store>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<top_products>
{{top_products}}
</top_products>

<memoria>
{{memoria}}
</memoria>

<sequencia_do_email>
{{blocks_json}}
</sequencia_do_email>

Para CADA block_index de <sequencia_do_email>, selecione em <biblioteca> as
até 3 variantes do tipo daquela posição, em ordem de preferência. Responda
APENAS o array JSON.
```

### Formato do catálogo (`{{catalogo}}`)

Uma entrada por variante ativa e elegível, agrupada por `block_type`.
Campos: `variant_id`, `name`, `description`, `quando_usar`,
`quando_nao_usar`, `objectives`, `tones`, `density`, `product_slots`,
`orientacao_copy`, `notas_implementacao`.

**Sem `campos_copy`** — o `output_schema` sai do Curador e passa a ser
exclusividade do Montador.

Elegibilidade (mantida): variante sem `{{PLACEHOLDER}}` no HTML efetivo
fica fora do catálogo, com o nome registrado em
`parsed_output.candidates_excluded_untagged`.

### Config e tool

| | Antes | Agora |
|---|---|---|
| `max_tokens` | 2048 | **8192** — 12 posições × 3 UUIDs + 12 motivos ≈ 2,5k; o teto não é custo |
| `temperature` | 0.2 | 0.2 |
| modelo | `anthropic/claude-sonnet-4.6` | igual |
| system renderizado | não | **sim** — `invokeAgent` passa a renderizar o `system_prompt` |
| parser | `parseAssemblerOutput` | novo parser de ranking |

### Validações do parser (código, não prompt)

1. `variant_id` inexistente no catálogo → **descartado do ranking**, com
   registro em `parsed_output.invalid_ids`.
2. `variant_id` cujo `block_type` **não é** a seção daquela posição →
   descartado, registro em `parsed_output.wrong_type_ids`. Necessário
   porque o catálogo agora vai inteiro, não pré-separado por posição.
3. Posição que sobra sem nenhum id válido → conta como **posição pulada**
   (mesmo selo do bloco sem candidata).
4. Todas as posições vazias, ou JSON inválido → retry 1×, depois
   `failed`.
5. `{{catalogo}}` ausente do system renderizado → **falha explícita**. O
   system é editável na aba Agentes; sem esse guard, uma edição
   descuidada faz o Curador escolher sem biblioteca, silenciosamente.

---

## 2. Montador — `assembler`

### Papel

Escolher **uma** variante por posição entre os finalistas do Curador,
decidindo pela coerência do **email inteiro**. Não escreve HTML, não
escreve copy, não monta documento.

### System prompt

```
Você é o Montador de Composição de email da Convertfy. O Curador já rankeou,
para cada posição do email, até 3 variantes da biblioteca. Sua tarefa:
escolher UMA por posição, olhando o EMAIL INTEIRO.

Você não escreve HTML e não escreve copy. Você decide a COMPOSIÇÃO.

O que só você vê: o schema de output de cada finalista — os campos que aquele
bloco vai exigir da copy e das imagens, com tipo, limite e obrigatoriedade.

Como decidir:
- PADRÃO: fique com a 1ª indicação do Curador. Ela é o mérito daquela posição
  avaliada isoladamente. Você só sai dela por uma das razões abaixo.
- Razão de CONJUNTO: duas posições ficariam com a mesma variante, ou com
  variantes de linguagem visual idêntica (mesma faixa, mesma anatomia); o
  email ficaria monótono ou desequilibrado na densidade; abertura e
  fechamento não conversam.
- Razão de VIABILIDADE: o schema do 1º exige dado que esta loja não tem
  (campo obrigatório de cupom sem oferta no contexto, mais slots de produto
  do que <top_products>) e o 2º ou o 3º resolve.
- Razão de HISTÓRICO: <memoria> mostra que a 1ª indicação já ocupou posição
  equivalente no email anterior desta loja, ou vem se repetindo em outras
  lojas, e existe finalista igualmente adequada.
- Toda posição que tem finalistas recebe uma escolha. Descartar posição é
  decisão do sistema, não sua — nunca devolva posição em branco.
- Nunca escolha um variant_id que não esteja entre os finalistas daquela
  posição.

Responda APENAS o array JSON, sem markdown e sem texto ao redor. Uma entrada
por posição, na ordem de block_index. `rank` é a colocação da variante
escolhida no ranking do Curador (1, 2 ou 3). `motivo` é OBRIGATÓRIO quando
rank for diferente de 1 e PROIBIDO quando rank for 1:

[{"block_index":0,"variant_id":"...","rank":1},{"block_index":1,"variant_id":"...","rank":2,"motivo":"..."}]
```

`motivo` proibido no rank 1 é deliberado: mantém o output curto e evita
que o modelo invente justificativa para confirmar o óbvio.

### User template

```
<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
</store>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<top_products>
{{top_products}}
</top_products>

<memoria>
{{memoria}}
</memoria>

<finalistas_por_posicao>
{{finalists_json}}
</finalistas_por_posicao>

Escolha AGORA uma variante por posição, olhando o email inteiro. Responda
APENAS o array JSON.
```

### Formato de `{{finalists_json}}`

Por posição: `block_index`, `section`, `label` e as opções com `rank`,
`variant_id`, `name`, `description`, `quando_usar`, `quando_nao_usar`,
`product_slots`, `orientacao_copy`, `notas_implementacao`,
`motivo_curador` (só no rank 1) e `campos` — o `output_schema`
**compacto**: `key`, `label`, `type`, `nature`, `max_len`, `required`.

`example` e `guidance` do schema ficam fora: servem à copy e à imagem, não
à escolha.

### Config e tool

| | Antes | Agora |
|---|---|---|
| `max_tokens` | 16384 | **2048** — output é JSON curto |
| modelo | `anthropic/claude-opus-4.8` | igual. O motivo do modelo caro era gerar 40KB de HTML; o custo cai sozinho pelo output |
| `temperature` | 0.3 | irrelevante — Opus 4.7/4.8 não recebe temperatura (`modelSupportsTemperature`) |
| parser | `extractHtml` + `looksLikeHtml` | parser de escolhas |
| timeout | `ARCHITECT_INVOKE_TIMEOUT_MS` 240s | folgado; revisar junto do `TICK_BUDGET_MS` do cron de dispatch, calibrado em cima dos 240s |

### Validações do parser

1. `variant_id` fora dos finalistas daquela posição → cai para o **rank
   1** do Curador, com registro em `parsed_output.forced_rank1`.
2. `rank` divergente do real → corrigido pelo código; o `rank`
   autodeclarado é telemetria, não fonte de verdade.
3. Posição ausente no output → cai para o rank 1, registrado.
4. Motivo ausente com `rank != 1` → aceito, registrado em
   `parsed_output.missing_motivo`. Observabilidade não derruba email.
5. `parsed_output` passa a carregar `desvios` (quantas posições saíram do
   rank 1) — a métrica que mede se o Curador está rankeando bem.

---

## 3. Imagem — `image`

**Nada muda.** O `slot_note` é extraído de `effectiveVariantHtml(variant)`
dentro de `fieldsFromSchema`, sem passar pelo documento montado. Direção
de arte segue sendo `image_spec` + `example` + formato + `slot_note` +
copy do grupo.

---

## 4. Hero — `hero_section`

### Bug ativo a corrigir primeiro

`hero.chain.ts:250` passa o **system prompt** por `renderImageTemplate`,
que substitui qualquer `{{ALGO}}` e resolve var inexistente para **string
vazia** (`template-renderer.ts:122`). O system do hero é exatamente o
texto que cita as tags canônicas como exemplo. Efeito real hoje:

```
ANTES : carrying the `{{HERO_IMAGE}}` placeholder (and `{{HERO_IMAGE_ALT}}` for ...)
DEPOIS: carrying the `` placeholder (and `` for ...)

ANTES : ESP merge tags ([unsubscribe_link], [first_name], {{ unsubscribe }}, ...)
DEPOIS: ESP merge tags ([unsubscribe_link], [first_name], , ...)
```

Apagados: `{{PLACEHOLDERS}}`, `{{HERO_IMAGE}}`, `{{HERO_IMAGE_ALT}}`,
`{{COUPON_CODE}}`, `{{HERO_HEADLINE}}`, `{{HERO_CTA_LABEL}}`,
`{{ unsubscribe }}`. A migration `20261039` semeia `system_prompt = ''`,
então o texto em uso é o default hardcoded — o caminho que passa pelo
renderer.

Fix, sem tocar no renderer (outros agentes dependem do comportamento de
vazio):

```ts
// NÃO usar renderImageTemplate aqui: ele apagaria os {{TAGS}} canônicas
// que o próprio prompt usa como exemplo.
const systemPrompt = (config.system_prompt.trim() || DEFAULT_HERO_SYSTEM_PROMPT)
  .replaceAll("{{output_contract}}", outputContract)
```

Corrigível hoje, independente do resto desta especificação.

### Cirurgias no prompt

| Bloco | Ação |
|---|---|
| `<gold_reference>` | O modo degradado "variante desconhecida" sai — o `slot_map` sempre diz qual é. Entra "renderizado ausente": nunca cadastrado, ou descartado por hash divergente |
| `<structure_fidelity>` | Sai tudo sobre "o Montador pode ter achatado a região" e sobre `<hero_region>` definir fronteiras e **conteúdo vizinho** (barra de cupom, menu) |
| `<copy_rules>` | Deixa de ser "array com a copy de todo bloco dentro da região"; passa a ser os campos do **bloco da hero** |
| `<output_contract>` | Só fragmento, mais o relatório. `HERO_OUTPUT_CONTRACT_FULL_DOC` sai |

### Blocos reescritos

```
<gold_reference>
<hero_variant_rendered> is the FINISHED look of this hero variant — a real,
rendered example of how it looks when done right (image treatment, spacing,
text placement, button finish). Reproduce THAT finish using THIS store's
data. <hero_variant_source> is the same variant as authored in the library,
with {{PLACEHOLDERS}}; <variant_schema> explains each field's semantics and
limits.
If <hero_variant_rendered> is EMPTY, the variant has no approved rendered
example (or the existing one no longer matches the source and was
discarded). In that case <hero_variant_source> is the only truth: keep its
structure and perform the substitutions below.
</gold_reference>

<structure_fidelity>
The VARIANT is the structural truth of this hero. You receive it whole — not
a fragment cut out of a larger document — and you deliver it finished:
- Row order and anatomy follow the variant: logo band, headline, body,
  buttons, image, in the VARIANT's order.
- Background bands SURVIVE: a colored band in the variant (dark logo bar,
  tinted hero background) is reproduced via bgcolor/inline style, using the
  variant's var(--xxx) or <color_roles>. Never let a designed band collapse
  to plain white.
- CTA slots keep the variant's BUTTON finish: a padded cell/link with
  background and text color from <color_roles> or the variant's vars. NEVER
  downgrade a styled button into a bare underlined text link.
- Logo contrast is settled AFTER the band background: dark band →
  <logos>.dark (fallback .light), light band → <logos>.light. A light logo on
  a white background is ALWAYS wrong.
</structure_fidelity>

<copy_rules>
<hero_content> carries the copy of THIS hero block — one entry per field of
<variant_schema>, with its tag and value. Fill every placeholder in the
variant with the matching value, VERBATIM: do not rewrite, translate,
summarize or invent copy. CTA hrefs come from the fields' URLs.
</copy_rules>
```

`<hero_image_hard_rule>`, `<empty_slot_rule>`, `<merge_tags_are_literal>`,
`<identity_rules>` e `<structural_rules>` seguem como estão.

### Novo output contract

```
Emit the finished hero fragment wrapped EXACTLY in <CFY_HERO_OUTPUT> and
</CFY_HERO_OUTPUT>: a sequence of complete <table>...</table> blocks. No
<!DOCTYPE>, no <html>/<head>/<body>, no markdown fences, no commentary.

After the fragment, emit a short report wrapped EXACTLY in
<CFY_HERO_REPORT> and </CFY_HERO_REPORT>, as JSON:
{"imagem":"aplicada"|"ausente","campos_vazios":["TAG",...],
 "linhas_removidas":["cta","imagem",...],"logo":"light"|"dark"|"nenhuma"}

The report is what the pipeline knows about what you discarded. Report it
honestly: a removed CTA row or an unfilled field must appear there.
```

O relatório é **opcional no parser**: ausência registra
`hero_report_missing` no run e segue. Não vira motivo de falha do email —
observabilidade não derruba entrega.

### User template

Sai `<montador_html>` e `<hero_region>`. Fica store, `color_roles`,
`fonts`, `logos`, email, `hero_variant_source`, `hero_variant_rendered`,
`variant_schema`, `hero_content`, `hero_image`.

### Config e tool

| | Antes | Agora |
|---|---|---|
| vars | `montador_html`, `hero_region_html` | **removidas** — mexe no Zod de `html/contract.ts:74-75` |
| `HeroChainMode` | `fragment` \| `full_doc` | um só |
| `heroFullDocGuard` | guard de documento | **sai inteiro** |
| `parseHeroFragment` | wrapper `CFY_HERO_OUTPUT` | mantém, mais o parse do relatório |
| `blocksInsideHeroRegion` | interseção de tags da região | **sai** — passa a ser os fields do bloco hero |
| timeout | 240s dimensionado com 40KB no prompt | folgado |
| `rendered_html` | sempre enviado | enviado **só** se o hash de origem casar |

### Hash de origem do renderizado

Coluna nova `rendered_html_source_sha`, gravada com `sha(html)` no momento
em que o renderizado é salvo. Se `sha(html atual) != rendered_html_source_sha`,
o renderizado está comprovadamente velho: o código **não envia** o
renderizado, registra no run e a aba Componentes mostra o aviso na
variante. A regra vive no código — o prompt só precisa saber lidar com
renderizado ausente, que já é o caso das variantes sem cadastro.

---

## Compatibilidade — o que quebra junto

- **`component-deriver.ts`**: `prefilterCandidates`, `scoreVariant`,
  `buildMatchContext`, `seededShuffle` e `seedFrom` perdem os
  consumidores. `objectives`/`tones` continuam existindo como informação
  para o Curador ler, mas ninguém mais pontua por eles.
- **`component-assembler.service.ts`**: `extractHtml`, `looksLikeHtml`,
  `assembleReferenceHtml` (promovido de fallback a caminho principal, no
  módulo da concatenação), `findDroppedImageTags` (deixa de validar LLM),
  `resolveChoices` (vira o parser do Montador).
  `validateBlockMarkers` **fica**, como self-check da concatenação: custa
  nada e pega bug de código.
- **`text_format`**: o prompt tem regras explícitas de não tocar na região
  da hero. Com a hero fora do documento, ficam obsoletas — e regra
  obsoleta em prompt é ruído que o modelo tenta obedecer.
- **Blueprint rota B (LLM)**: intacta, mas passa a quase nunca disparar —
  o esqueleto agora vem de HTML montado por código.

## Riscos registrados

1. **Nenhum desses agentes tem structured output.** É texto puro +
   `extractJson`, que tolera prosa e fences mas não JSON truncado. Com o
   Curador devolvendo ~2,5k tokens e o fallback sendo falhar o email, o
   caminho de mitigação — se incomodar — é `response_format: json_schema`
   no OpenRouter, para onde o Curador já roteia.
2. **Hero composta.** O prompt novo assume que a copy da hero são os
   campos do bloco da hero. Variante de hero que engole cupom ou faixa de
   logo **sem declarar esses campos no `output_schema` dela** deixa essa
   copy órfã — é o bug `Use code '' for off` voltando por outra porta.
   Varrer a biblioteca por variantes `hero` cujo HTML tem placeholder fora
   do schema **antes** de trocar o prompt.
3. **Cache do catálogo tem TTL de 5 minutos**, renovado a cada acerto. Um
   lote de 12 emails em sequência mantém vivo; lojas com intervalo maior
   pagam a escrita de novo. Editar a biblioteca no meio de um lote custa
   uma reescrita de cache e nada mais.

## Indicadores novos nos logs

Selo na linha do run, sem abrir o detalhe:

| Selo | Origem |
|---|---|
| Seções puladas | posição sem candidata, ou sem id válido depois das validações |
| Renderizado desatualizado | hash de origem divergente; o agente usou o HTML |
| Variantes fora do pool | ativas sem placeholder no HTML efetivo (já existe como dado, ganha selo) |
| Desvios do ranking | posições em que o Montador não ficou com o 1º do Curador |
