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

## O shape de `fields` (v2)

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
