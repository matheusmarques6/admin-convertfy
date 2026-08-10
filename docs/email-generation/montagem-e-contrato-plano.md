# Montagem por código e contrato de schema — decisões e plano

Registro das decisões tomadas em ago/2026, depois do incidente do welcome da
Luxe Lift (segundo CTA ausente, hero sem imagem). Serve para não refazer as
mesmas perguntas — e para não replanejar trabalho que já está em produção.

## O que JÁ existe (não replanejar)

O Montador virou dois passos nas stories CM-3/CM-4, e a montagem virou
código na CM-2:

| Agente | Papel |
|---|---|
| `assembler` (**Curador**) | rankeia top-3 por posição sobre o catálogo inteiro |
| `assembler_chooser` (**Montador**) | escolhe 1 entre o top-3, por posição |
| **código** (`architect/assemble-document.ts`) | monta o documento |

`assembleDocument` concatena o `effectiveVariantHtml` das variantes
escolhidas (o `html_tagged` aprovado, senão o `html`), embrulha cada uma
via `fitFragment`, emite os marcadores `cfy:block:{i}:{section}`, monta o
shell de 600px, deduplica o CSS `@media` das variantes, aplica
`normalizeFonts` no documento inteiro e roda self-check de marcador e de
tag de imagem perdida. **Nenhum LLM escreve HTML.** Bloco sem variante
escolhida já vira `skipped` e não entra no documento.

Cadeia da fase 2 hoje: `image` → `copy_merge` (código) → `merge_verifier`
→ `hero_section` → `text_format` → `image_format` → `color_format` → `qa`.

## Decisões

1. **Uniformizar é tarefa dos agentes, não do código.** O `text_format`
   assume a tipografia.
2. **Seção sem variante não entra no email e não tem copy pedida** — com
   os blocos excluídos visíveis no log.
3. **Email sem nenhuma seção de conteúdo falha** com motivo, em vez de
   entregar um shell vazio.
4. **Corte seco** — sem flag por loja, sem kill-switch.
5. **A moldura fica como está** por ora; decisão adiada até ver o
   resultado das demais mudanças.
6. **`store_email_references.html` continua sendo gravado** (ver abaixo).

## Ordem de execução

`MC-1` (critério de bloco) → `MC-2` (piso) → `MC-3` (contrato nos
formatadores) → `MC-4` + `MC-5` juntos (tipografia migra e a rota
duplicada da hero morre na mesma mudança).

## Consequência de manter o cache em `store_email_references.html`

A pergunta original foi feita sob premissa errada — a de que aquele HTML
era o do Montador achatando variante. Depois da CM-2 ele é saída
**determinística** de `assembleDocument`, função de (slots, fontes,
idioma). Manter tem custo e ganho, e os dois precisam estar escritos:

**Ganho — a cadeia de formatação não pode remontar no meio.** A telemetria
por step encadeia `sha8`: a saída de um step é a entrada do próximo. O
resume por `email_flow_emails.html_pipeline_stage` reentra no ponto onde
parou; se o documento fosse remontado a cada retomada e a biblioteca
tivesse mudado nesse intervalo, o `image_format` aplicaria ops sobre um
documento diferente do que o `text_format` viu, e o encadeamento
quebraria. O cache é o que garante que todos os steps de uma geração
partem do mesmo documento.

**Custo 1 — o cache envelhece em silêncio.** O HTML é um retrato das
variantes no momento da montagem. Aprovar um `html_tagged` novo no
Taguedor, ou editar a variante, **não** muda emails já montados: eles só
refletem a biblioteca quando a reference é regenerada
(`POST /api/admin/stores/[id]/generate-blueprints`). Hoje nada indica que
um documento é de uma versão anterior da variante.

**Custo 2 — não existe invalidação.** Decorre do anterior e é trabalho
futuro: aprovar variante no Taguedor deveria marcar como stale as
references que a usam. Sem isso, a correção de uma variante quebrada não
alcança os emails que já a instanciaram.

**Custo 3 — preserva a janela de divergência com o blueprint.**
`store_email_references` e `store_email_blueprints` são gravados em
momentos possivelmente diferentes. No fluxo natural concordam por
construção (`generateStoreBlueprint` recebe os mesmos slots que viram
`slot_map`), mas regenerar um sem o outro faz o documento apontar para uma
variante e o schema para outra — é o `variant_mismatch` que a telemetria
da hero já registra. Remontar sempre fecharia essa janela; o cache a
mantém aberta.

**Se um dia reverter:** apagar a coluna força remontagem a cada retomada.
Só faz sentido junto com uma garantia de que a biblioteca não muda no meio
de uma geração — caso contrário troca-se um problema visível (cache velho)
por um invisível (steps vendo documentos diferentes).
