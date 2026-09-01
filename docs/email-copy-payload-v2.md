# Payload de copy para o n8n — contrato v2

Contrato do POST que `dispatchEmailCopyWebhook` envia para
`N8N_EMAIL_COPY_WEBHOOK_URL` a partir do corte v2 (jul/2026, epic do
blueprint híbrido). O **input do n8n é SEMPRE igual**, independentemente da
rota que gerou o blueprint (determinística ou LLM fallback) — a
normalização acontece no `packageBlueprint` e, para blueprints legados, na
cascata de derivação do próprio dispatch.

## O que mudou (v1 → v2)

### Por bloco (`flows[].emails[].blocks[]`)

| Campo | v1 | v2 |
|---|---|---|
| `copy_spec` | `[{key, min_chars, max_chars}]` | **REMOVIDO** — substituído por `fields` |
| `fields` | `[{tag, key, min_chars, max_chars}]` (derivado só do tag-registry, só tags de copy) | **shape novo (abaixo)** — única fonte de orçamento/diretriz por campo |
| `variant_id` | — | **NOVO** — id da variante da biblioteca casada pelo Curador (ou `null`) |
| `variant_name` | — | **NOVO** — nome da variante (ou `null`) |
| `purpose`, `tags`, `block_id`, `position`, `type`, `label` | | inalterados |

### Por email (`flows[].emails[]`)

| Campo | v1 | v2 |
|---|---|---|
| `objective` | — | **NOVO** — objetivo efetivo do email (`blueprint.objective` > `estrutura_geral.objective`, ou `null`) |
| `tones` | — | **NOVO** — tons canônicos da loja: subconjunto de `["Urgente","Aspiracional","Educacional","Descontraído","Premium","Amigável"]` (derivado do tom de voz; pode ser `[]`) |
| `estrutura_geral` | só emails `text_only` | **TODOS os emails** (quando existe outline ativo para o flow×número; senão `null`) |
| `dispatch_batch_id` | — | **NOVO (jul/2026, aditivo)** — batch da geração que originou o dispatch (`generation_batch_id` do email no momento do disparo; `null` se o email nunca teve batch) |
| `component_variants`, `blueprint`, `text_only`, `email_id`, `email_number`, `name` | | inalterados |

O callback (`/api/webhooks/n8n/email-copy`) continua aceitando
`{store_id, email_id, subject, preheader, blocks:[{block_id, content}]}`
com `content[key] = valor` — as keys são as mesmas de `fields[].key`.

**`dispatch_batch_id` no callback (aditivo, recomendado)**: o flow do n8n
deve ECOAR o `dispatch_batch_id` recebido no payload de volta no corpo do
callback (mesma chave, campo opcional). Quando presente E divergente do
`generation_batch_id` vigente no email, o callback responde 200 no-op
(`{stale: true}`) e descarta a copy — é copy atrasada de um dispatch
antigo, e aceitá-la sobrescreveria uma geração mais nova (incidente Luxe
Lift 27/07). Flows que ainda não ecoam o campo mantêm o comportamento
anterior (copy aceita fora dos status idempotentes). Mudança aditiva: sem
janela de deploy obrigatória.

## v3 (jul/2026) — O BLOCO É O SCHEMA

Corte que muda o contrato: **`blocks[].fields` é o ÚNICO lugar onde o schema
existe, e é dele que a copy tem de sair.**

### Por que

Até a v2 o schema chegava por dois caminhos: `blocks[].fields` e
`emails[].component_variants` (a lista de `output_schema` das variantes, no
nível do email). O flow do n8n gerava a copy a partir do **bloco** (tipo,
label, purpose) e nunca cruzava com o array — então devolvia o vocabulário
do tag-registry (`headline`, `subhead`, `cta`) em vez das keys do schema.

Como só existe **um** `cta`, um bloco com dois botões perdia o segundo:
`hero_cta_2_label` voltava vazio, o agente de hero via o slot sem valor e
removia a linha. O email da Luxe Lift saiu sem o segundo botão, com cada
etapa funcionando como projetada.

### O que muda no payload

| Campo | v2 | v3 |
|---|---|---|
| `blocks[].schema` | não existia | **a única fonte** — o schema da variante casada, organizado; vem de `email_blocks.fields` |
| `blocks[].fields` | uma das fontes | **REMOVIDO** — virou `schema.campos`, indexado por key |
| `blocks[].tags` | array de tags canônicas | **REMOVIDO** — redundante com o placeholder de cada campo |
| `blocks[].variant_name` | no nível do bloco | movido para `schema.variante` |
| `blocks[].purpose` | no nível do bloco | **mantido** (ponte) e também em `schema.diretriz` |
| `emails[].component_variants` | lista de `output_schema` por email | **REMOVIDO** — era a segunda fonte que o n8n não cruzava |
| `blocks[].variant_id` | casado por índice no dispatch | resolvido pelo `variant_id` da linha do bloco |

### O shape de `blocks[]` (v3)

```jsonc
{
  "block_id": "71666143-5d53-457e-8b3e-988dfca91783",
  "position": 5,
  "type": "testimonials",
  "label": "Prova social + fechamento emocional",
  "variant_id": "cff6c8d8-a0da-4c80-90fa-1875174a75a1",
  "schema": {
    "variante": "review 3",
    "diretriz": "Headline de pertencimento em 2ª pessoa (~40 caracteres)…",
    "total_campos": 9,
    "obrigatorios": ["review_headline", "review_1_text"],
    "campos": {
      "review_headline": {
        "label": "Headline da prova social",
        "tipo": "text_short",
        "obrigatorio": true,
        "max_caracteres": 40,
        "min_caracteres": null,
        "exemplo": "Quem já usa, não larga",
        "orientacao": "Tom de pertencimento, 2ª pessoa",
        "placeholder_no_html": "{{REVIEW_HEADLINE}}"
      }
      // … uma entrada por campo, na ordem do schema da variante
    }
  }
}
```

> **Ponte de transição.** `purpose` continua no nível do bloco, duplicando
> `schema.diretriz`, porque o flow atual gera a copy a partir do BLOCO
> (type/label/purpose) e ignora o schema — removê-lo agora deixaria o flow
> sem a única diretriz que ele lê. Some quando `contrato.taxa_pct` do run
> `copy` estabilizar em 100.

**As chaves de `schema.campos` são o contrato de resposta.** Não existe mais
um `key` dentro do item — a key é a posição dele no objeto. `nature`,
`source` e os campos de imagem ficaram de fora: já foram filtrados/usados
antes, e o copywriter não escreve nada com eles.

`placeholder_no_html` é onde o valor cai no template. É informativo — **não**
é a chave de resposta (vem com `{{}}` justamente para não ser confundido).

### O que o flow do n8n tem de fazer

Iterar `blocks[]` e, para cada bloco, gerar **exatamente** as keys de
`schema.campos` — nada além, nada aquém —, respeitando `max_caracteres` e
usando `label`, `schema.diretriz`, `orientacao` e `exemplo` como direção.
Devolver:

```jsonc
{ "block_id": "uuid", "content": { "hero_headline": "…", "hero_cta_2_label": "…" } }
```

> **`max_caracteres` é o tamanho da CAIXA, não uma sugestão.** Ele sai do
> `output_schema` da variante e, quando a geometria do slot permite medir,
> é apertado pela largura real do elemento (`html/fit-budget.ts`). Passar
> dele faz a frase vazar por cima do layout no email entregue.
>
> Entre 20 e 27/08 **todo** run de copy voltou com estouro (74 campos em
> 27/08, 56 em 24/08, 37 em 23/08) — no Welcome 1 da Innova, `panel_1_copy`
> veio com 217 num campo de 130 e `review_2_body` com 249 num de 190.
> Desde a migration 20261089 o admin **corrige**: o agente `copy_fit`
> reescreve os campos fora do limite antes da fase 2, e o run `copy` guarda
> o antes em `desvios_pre_fit`. Isso é rede de segurança, não licença — o
> encurtador custa uma chamada a mais por email, reescreve texto que o
> copywriter não revisou e não conserta campo que voltou VAZIO. O número a
> zerar continua sendo o de `desvios_pre_fit`.

Sem `headline`, sem `cta`, sem nenhuma chave que não esteja em
`schema.campos`.

**Entra na mesma janela do deploy.** Rollback = reverter o admin.

### O que passa a ser medido

- Chave devolvida fora de `fields[]` → desvio `unknown_key` no callback. É o
  contador que diz quando o n8n terminou de migrar.
- Campo de `fields[]` que volta vazio → desvio `missing` (opcional) ou
  `required_empty` (obrigatório). Antes só o obrigatório gerava sinal, e
  como a biblioteca tem quase tudo opcional, campo sumido era silêncio.
- Bloco enviado sem contrato → `blocos_sem_schema` no run `copy_dispatch` e
  desvio `sem_contrato` no callback. **Bloco sem variante casada é erro de
  curadoria**, não modo de operação: sem schema o n8n volta a inventar o
  vocabulário.
- O payload inteiro fica em `email_generation_runs.input_vars.payload` do run
  `copy_dispatch` (esqueleto acima de 1 MB).

## `language_directive` (set/2026) — a ordem de idioma e moeda

Campo de texto pronto, presente em **três lugares do mesmo payload**:

| onde | por quê |
|---|---|
| `language_directive` (raiz) | contrato explícito, primeiro campo depois de `test_context` |
| `store.language_directive` | ao lado do `language`/`language_label` que ele explica |
| início de `pesquisa_diagnostico` | o blob é o "contexto rico p/ a copy" e o candidato mais provável a já estar dentro do prompt hoje — prefixar faz a ordem chegar ao modelo **antes** de o flow passar a ler os outros dois |

### Por que existe

Em 01/09 a copy da Innova Bay (loja `en`, americana) voltou **misturada dentro
do mesmo bloco**:

| campo | voltou |
|---|---|
| `offer_headline` | "Does it work on my car?" |
| `offer_cta_label` | "SEE HOW IT WORKS" |
| `offer_body` | "Plug-and-play, compatível com OBD2… Menos de **R$ 70**." |

O payload estava certo: `language: "en"`, `language_source: "store"`, sem
fallback. O que derrubou foi o material em volta. A pesquisa da loja
(`brand`, `icp`, `tone`, `story`, `pesquisa_diagnostico`, `ads_review`) é
gerada em **PT-BR**, porque os agentes de pesquisa rodam no n8n em português
para o time interno. E a parte dela que o copywriter é instruído a imitar é
justamente a mais contaminante: `tone.use_words` é uma lista de frases em
português ("garantia vitalícia", "veja como funciona") e `tone.do` são quatro
frases-exemplo inteiras da voz desejada. Um campo dizendo "en" contra ~15 KB
de exemplos em português.

A moeda entra pelo mesmo caminho: a pesquisa descreve uma loja que vende em
USD dizendo "ticket médio abaixo de R$ 100", e o `R$` atravessa para a copy.
Por isso a ordem nomeia a moeda vinda de `top_products[].currency` — a real,
não uma derivada do idioma.

### O que o flow do n8n tem de fazer

Incluir `language_directive` no prompt do copywriter, uma vez, de preferência
no topo.

**Medido em 01/09: ele não faz.** Os dois runs de `copy_dispatch` daquela
noite saíram com a diretiva na raiz, no `store` e prefixando o
`pesquisa_diagnostico` — e a copy voltou em português numa loja `en`. Nem o
campo novo nem o prefixo no blob de pesquisa foram usados.

Enquanto isso não muda, quem conserta é o **`copy_fit`** (motivo `idioma`,
migrations 20261099 + 20261100): o campo em língua errada é reescrito no
idioma da loja antes do merge, e a reescrita que voltar errada é RECUSADA
pelo código. `parsed_output.idioma` do run `copy` conta, geração a geração,
quantos campos o flow entregou fora do idioma pedido.

> **O tiro pela culatra (01/09).** A primeira versão marcava o idioma por
> CAMPO e o prompt dizia "por padrão mantenha o mesmo idioma; a ÚNICA exceção
> é o campo marcado". Nessa mesma noite o n8n mandou o email **em inglês** e o
> encurtador devolveu os 14 campos **em português** — a construção condicional
> introduziu a ideia de trocar de língua, e o guard só valia para os alvos de
> idioma. Corrigido na 20261100: o idioma vira declaração global e o guard
> passa a recusar troca de língua em qualquer alvo (`mudou_de_idioma`).

A ordem sai **em inglês** para loja não-lusófona (é a língua em que os modelos
seguem instrução com mais confiabilidade; escrevê-la em português repetiria o
erro que ela corrige) e **em português** para loja pt-BR, onde não há
conflito. Nenhum campo antigo mudou: `language`, `language_label`,
`language_source` e os `*_raw` seguem exatamente como estavam.

Montagem em `src/lib/i18n/copy-language-directive.ts` (puro, com testes).

---

## O shape de `fields` (v2 — histórico)

> Substituído por `blocks[].schema` na v3. Continua sendo o shape gravado em
> `email_blocks.fields` (a fonte de onde o `schema` é montado); o que mudou é
> o que viaja no payload.


```jsonc
{
  "key": "headline",            // key do content que o n8n deve devolver
  "label": "Headline",          // rótulo humano
  "type": "text_short",         // text_short | text_long | number | url | image | boolean
  "nature": "copy",             // copy | imagem_gerada | asset_fixo (pode faltar em snapshots antigos)
  "max_len": 40,                // teto de caracteres (0 = sem teto)
  "min_len": 18,                // piso, ou null
  "required": true,             // campo obrigatório
  "example": "Bem-vindo à Loja",// exemplo curado (pode ser "")
  "guidance": "Tom acolhedor…", // diretriz curada de copy (pode ser "")
  "tag": "HERO_HEADLINE",       // {{TAG}} correspondente no template, ou null
  "source": "schema"            // schema | tag_registry | llm
}
```

### Naturezas (épico Taguedor, jul/2026)

Desde o T8, **o payload só envia campos de natureza `copy`** — o dispatch
filtra `imagem_gerada` (do agente de imagem da fase 2) e `asset_fixo`
(arte da biblioteca que fica intacta) ANTES de montar o bloco. Na prática
o n8n nunca vê campo que não deva escrever; snapshots antigos sem
`nature` derivam pela regra `type:"image"` → `imagem_gerada`, resto →
`copy` (ou seja: só some do payload o que já não era copy).

### Regras por `type`

- **`text_short` / `text_long`**: o n8n GERA copy. `max_len` é teto duro
  (a auditoria do callback loga `max_len` estourado; o QA reporta
  `copy_excede_max_len`). `required:true` + vazio → `campo_obrigatorio_vazio`.
- **`image`**: não chega mais no payload (filtro por natureza acima) —
  o campo é preenchido pela fase 2 (agente de imagem).
- **`url` / `boolean` / `number`**: não gerar texto criativo; devolver
  apenas se o contexto fornecer o valor (ex.: código de cupom vindo do
  briefing), senão omitir.

### Origem (`source`)

- **`schema`**: `output_schema` da variante da biblioteca casada pelo
  Curador — o dado mais rico (guidance/example curados por humano).
- **`tag_registry`**: derivado das tags canônicas `{{TAG}}` do template
  (mesmo dado que alimentava o `fields` v1); `required` sempre `true`.
- **`llm`**: convertido do `copy_spec` (Blueprint LLM legado ou default
  canônico do tipo) — sem tag, sem guidance.

### Cascata no dispatch (por bloco)

1. Snapshot `fields` persistido no blueprint da loja (builder /
   `packageBlueprint` — já vem com a origem resolvida).
2. Sem snapshot, mas com `tags` no blueprint → derivação do tag-registry.
3. Sem nada (blueprint legado / fallback global) → conversão do
   `copy_spec` normalizado (default canônico do tipo, origem `llm`).

Ou seja: **todo bloco chega com `fields` não-vazio** sempre que o tipo tem
copy (blocos estruturais como footer/divider podem chegar com `[]`).

## Validação no callback (observabilidade)

O callback audita o `content` devolvido contra o snapshot de `fields` do
blueprint da loja (`store_email_blueprints.blocks[].fields`), quando
existe (deviations com `source:"schema"` — required vazio / max_len
estourado, cobrando só campos de natureza `copy`); senão contra o
`copy_spec` real do bloco casado. Loga `email_copy.copy_out_of_spec` —
**nunca rejeita nem trunca** a copy.

## Janela de corte e rollback

- O corte é **substitutivo**: o payload v2 não envia mais `copy_spec` por
  bloco. O flow do n8n precisa ser atualizado **na mesma janela** do deploy
  (ler `fields[].key/max_len/min_len/guidance/example` no lugar de
  `copy_spec[].key/min_chars/max_chars`).
- **Rollback** = revert do deploy do admin (o payload volta ao v1); o flow
  n8n antigo volta a funcionar sem mudança adicional.
- Chaves aditivas anteriores (`component_variants`, `test_context`)
  continuam presentes e opcionais.
