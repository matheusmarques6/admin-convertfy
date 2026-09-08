# Worklist: cobertura da biblioteca de componentes

Gerado por `auditVariantCoverage` (`src/lib/agents/html/coverage-audit.ts`) sobre
as 40 variantes ATIVAS, em 08/09/2026.

**O casador é o MESMO da produção** (`fitFragment` + `buildTextIndex` +
`assignTextAnchors` + `orphanTextFragments`), e isso não é detalhe: uma régua
própria — `position(example in html)`, por exemplo — reprova como quebrado tudo
que o merge resolve por normalização (entidades, aspas curvas, whitespace). Na
primeira tentativa esta auditoria acusou 14 dos 16 campos da `body 4` e a
verdade é que os 16 ancoram. O que está abaixo é o que o merge faz de fato.

A auditoria roda sobre o FRAGMENTO que a montagem encaixa, não sobre o
documento da variante: o `<title>` delas é nota de curadoria (`[PREVIEW] Seção
— Reviews monospace`) e punha 10 falsos na lista.

## O retrato

| | |
|---|---|
| variantes ativas | 40 |
| **sem nada a fazer** | **25** |
| campos de copy | 274 |
| **campos que ancoram** | **258 (94%)** |
| campos sem lugar | 16 |
| pedaços de texto que vazam | 36, em 12 variantes |
| órfãos totais (inclui texto fixo legítimo) | 128 |

**O mapeamento por `example` está certo em 94% dos campos.** A tese de que a
biblioteca estava toda desalinhada é falsa. O que existe são dois defeitos
localizados, cada um com causa mecânica nomeada.

## Defeito 1 — 16 campos sem lugar

| variante | campo | motivo | `example` cadastrado |
|---|---|---|---|
| `body 3 - bridge features cards` | `section_copy_2` | `range_ja_tomado` | `2 Lorem ipsum dolor sit amet, consectetur adipiscing` |
| `offer 2` | `offer_price_spec_4` | `nao_encontrado` | `Grill-Ready/20 Blend` |
| `produtos 4 - um produto` | `section_copy_2` | `range_ja_tomado` | `2 Lorem ipsum dolor sit amet, consectetur adipiscing` |
| `produtos 7 - dois produtos` | `panel_2_copy` | `range_ja_tomado` | `2 Lorem ipsum dolor sit amet, consectetur adipiscing` |
| `review 2` | `review_1_title` | `range_ja_tomado` | `Ut enim ad minim veniam` |
| `review 3` | `review_1_title` | `range_ja_tomado` | `Ut enim ad minim veniam` |
| `review 7` | `review_1_name` | `nao_encontrado` | ` Buyer Name\t \t\t \t1 ` |
| `review 7` | `review_2_name` | `nao_encontrado` | ` Buyer Name\t \t\t \t2 ` |
| `review 7` | `review_3_name` | `nao_encontrado` | ` Buyer Name\t \t\t \t3 ` |
| `review 8` | `review_1_name` | `frase_curta` | `` |
| `review 8` | `review_1_initial` | `frase_curta` | `\tG` |
| `review 8` | `review_1_cta_label` | `range_ja_tomado` | `Shop Now` |
| `review 8` | `review_2_name` | `range_ja_tomado` | `Buyer Name` |
| `review 8` | `review_2_initial` | `frase_curta` | `K` |
| `review 8` | `review_3_initial` | `frase_curta` | `` |
| `review 8` | `review_3_cta_label` | `range_ja_tomado` | `Shop Now` |

**`range_ja_tomado` (8) — o irmão sem o número.** A arte numera os parágrafos
(`1 Lorem ipsum…` / `2 Lorem ipsum…`) e UM dos campos foi cadastrado sem o
número. Aí não há grupo de examples idênticos (que o casador distribuiria por
ordem, e isso funciona): o específico toma a vaga dele, o genérico acha as duas
ocorrências e fica sem nenhuma. Na peça: um parágrafo sai REPETIDO e a copy do
outro campo não entra. Foi exatamente isso no Welcome 1 da Hero Boxers — o
parágrafo do checkout saiu duas vezes.
Conserto: alinhar o `example` do irmão genérico ao texto real (com o número).

**`nao_encontrado` (4).** `review 7` tem os três nomes cadastrados como
`' Buyer Name\t \t\t \t1 '` — copiado do Figma com tabulação e o índice
colado — enquanto o HTML diz `1 Verified Buyer`. `offer 2` tem
`'Grill-Ready/20 Blend'`, que não existe na arte.

**`frase_curta` (4).** `offer 1` (`'CTA'`) e as iniciais de `review 8`
(`'K'`, `'\tG'`, e duas VAZIAS). Example de 1–3 caracteres só ancora com
fronteira de palavra e ocorrência única — aqui não há.

## Defeito 2 — 36 pedaços de texto sem campo nenhum

Aqui o `example` não erra: **não existe campo**. Sem contrato, o texto não vai
no payload do n8n, não volta como copy, não é ancorado e nenhum agente de
formatação tem alçada para tocar. Atravessa o pipeline e chega ao cliente.

| variante | o que vaza | o que criar |
|---|---|---|
| `body 3 - bridge features cards` | `ICON 1` · `ICON 2` · `ICON 3` | `seal_1..3_label` — é a faixa de remoção de risco; nas referências do Figma são `Cruelty Free` · `Fair trade` · `1 Year Warranty` |
| `body 6 - bridge skin minimalism 101` | `Lorem` ×4 · `ipsum dolor sit` ×4 | schema inteiro (hoje tem 0 campos) |
| `body 7 - bridge FAQ` | `Lorem ipsum dolor sit amet,` ×3 · `Lorem ipsum dolor sit amet, consectetur ` ×3 | schema inteiro (hoje tem 0 campos) |
| `body 9 - key features pilulas` | `TITLE GOES` | `section_title` |
| `footer 1` | `Link Here` ×6 | `footer_link_1..6_label` + `_url` |
| `produto 8 - 4 produtos` | `CTA FINAL` | `final_cta_label` |
| `produtos 9 - 4 produtos` | `CTA FINAL` | `final_cta_label` |
| `review 6` | `&ldquo; 1Lorem ipsum dolor sit amet, con` | `review_1_quote` (a citação está fora do schema) |
| `review 7` | `1 Verified Buyer` · `2 Verified Buyer` · `3 Verified Buyer` | `review_1..3_badge` ("Verified Buyer") — e corrigir os 3 examples de nome |
| `welcome - hero sectiion 8` | `_AQUI` | nada — resto de `TEXTO_DE_PREHEADER_AQUI`, apagar do HTML |
| `welcome - hero section 5` | `LOGO HERE` | `logo` |
| `welcome - hero section 7` | `LOGO HERE` | `logo` |

**O sinal existia e estava calibrado baixo.** `pareceExemplo` — a heurística que
alimenta `texto_orfao_suspeito` na telemetria do `copy_merge` — devolve `false`
para `ICON 1`, `CTA FINAL` e `TITLE GOES`. Por isso o run de produção do Welcome
1 reportou 6 suspeitos entre 27 órfãos e ninguém foi alertado. Vale ampliar a
heurística; enquanto não for, o que decide é a lista crua de órfãos.

## Como rodar de novo

`auditVariantCoverage(variante)` por variante, `resumirBiblioteca(laudos)` para
o agregado. Puros, sem I/O — o chamador lê `email_component_variants` ativas com
o HTML EFETIVO (`html_tagged` aprovado, senão `html`).

