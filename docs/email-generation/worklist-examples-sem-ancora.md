# Copy descartada no merge — worklist do cadastro (27/08/2026)

## Como o endereçamento funciona

`src/lib/agents/html/copy-merge.ts` ancora cada campo pela **frase do `example`
do schema**, procurada no HTML da variante. Não há `{{TAG}}` — a biblioteca
nunca adotou placeholders.

O merge é **fail-open por decisão (20/08)**: campo sem âncora não derruba a
geração — a frase de exemplo (lorem ipsum) fica no email e o desvio vai só
para a telemetria. É por isso que o defeito é invisível até o email pronto.

## O que NÃO é problema

`normalizeForMatch` + `foldChar` já toleram, dos dois lados:

- entidades HTML (`&nbsp;` `&copy;` `&times;` `&amp;` `&#39;` …)
- aspas curvas `' ' " "` → retas, travessões `– —` → `-`, `…` → `...`
- tab, quebra de linha, espaços múltiplos → um espaço; trim; minúsculas
- frase partida por `<br>` ou wrapper inline (costura nós irmãos)

Quando N campos irmãos dividem o mesmo `example` e há N ocorrências no HTML,
o merge casa **por ordem de declaração**. Isso também não é defeito.

## Categoria 1 — AMBÍGUO: ocorrências excedem campos (38 campos)

A frase existe e está correta, mas aparece **mais vezes** que o número de
campos que a reivindicam. O merge não chuta (`ocorrencias_excedem_campos`) e
descarta todos.

**Não se resolve editando o `example`** — a frase já é exata. Sai por:
(a) diferenciar as frases no HTML da variante, ou
(b) desempatar por posição/estrutura no merge.

| Variante | Campo | example | ocorrências |
|---|---|---|---|
| body 2 - bridge textos linha produtos | ribbon_text | Black Friday | 16 |
| review 5 | section_intro | Lorem ipsum dolor sit amet… | 4 |
| review 8 | review_1_cta_label + review_3_cta_label | Shop Now | 4 (p/ 2 campos) |
| review 8 | review_2_name | Buyer Name | 3 |
| welcome - hero sectiion 8 | headline_l1 | Header | 3 |
| welcome - hero section 5 | coupon_code | CODECODE | 3 |
| body 3 - bridge features cards | section_cta_label | DIGITAL GIFT CARD | 2 |
| body 3 - bridge features cards | section_headline | The Gift That Fits Every Taste | 2 |
| footer 1 | footer_unsub_label | Unsubscribe | 2 |
| offer 2 | offer_eyebrow | 4th Of July | 2 |
| offer 3 | coupon_code / coupon_cta_label | CODECODE / Shop Now | 2 |
| offer 4 | manifesto_cta_label / _headline / _headline_lead | — | 2 |
| offer 5 | diff_cta_label / diff_headline / diff_label | — | 2 |
| produtos 2 | cta_label | SHOP NOW | 2 |
| produtos 3 - grid 4 produtos | section_title | Two Line Section Title | 2 |
| produtos 4 - um produto | badge_deadline / badge_label / cta_label | — | 2 |
| review 1 | section_title | RECOMMENDATION | 2 |
| review 3 | review_1_body / review_1_title | Lorem ipsum… | 2 |
| review 6 | testimonials_headline | Spicy Testimonials | 2 |
| welcome - hero sectiion 8 | headline_l2 | Title | 2 |
| welcome - hero section 2 | cta_label | SHOP 10% OFF | 2 |
| welcome - hero section 4 | coupon_code | CODE | 2 |
| welcome - hero section 5 | coupon_label / cta_label | — | 2 |
| welcome - hero section 6 | offer_value | X% OFF | 2 |
| welcome - hero section 7 | offer_value | 35% OFF SCRUBS | 2 |
| welcome - hero section 9 | hero_headline | TITLE HERE | 2 |

## Categoria 2 — frase NÃO existe no HTML (~12 campos)

Aqui o cadastro está errado de fato. Corrigir = colar no `example` a frase
exata que está no HTML da variante.

| Variante | Campos | example cadastrado | Diagnóstico |
|---|---|---|---|
| body 4 - bridge fundo cards | howto_1_title, howto_2_title, section_cta_label, section_headline | LATHER / SOFTEN / LEARN MORE / "LATHER. RINSE. REPEAT." | examples são de **outra peça** (shampoo em barra); o HTML desta variante tem "TITLE HERE" e lorem ipsum |
| body 3 - bridge features cards | section_body_1, section_body_2 | "Our digital gift card lets…" / "One simple click…" | frase não está no HTML |
| produto 8 - 4 produtos | product_cta_label_1..4 | "CTA PROPDUTO 1..4" | **erro de digitação**: HTML tem PRODUTO, cadastro tem PROP­DUTO. A numeração também está trocada (label_2 → "CTA PROPDUTO 4") |
| produto 8 - 4 produtos | section_title | 2 Line Section Title Here | frase não está no HTML |
| produtos 2 - Three Ingredients. Zero Fillers | headline | "THREE / INGREDIENTS. / ZERO FILLERS." | as **barras `/`** são notação de quebra de linha do curador — não existem no HTML (que tem THREE e ZERO FILLERS) |

## Categoria 3 — example curto demais (6 campos)

Âncora de 1–3 caracteres casa em qualquer lugar.

| Variante | Campo | example |
|---|---|---|
| offer 1 | offer_cta_label | CTA |
| offer 3 | coupon_connector | For |
| produtos 4 - um produto | price_new / price_old | $59 / $64 |
| review 8 | review_1_initial / review_2_initial | G / K |

## Categoria 4 — example é ARRAY JSON (2 campos)

`body 4 - bridge fundo cards` → `howto_1_steps`, `howto_2_steps` gravados como
`["Wet hair thoroughly.", "Lather bar…"]`. Uma âncora de texto nunca casa com
um array serializado — é erro de tipo no cadastro.

## Sugestão de guarda

O editor de variantes tem o painel "Schema × HTML", mas ele confere
**placeholder** — o modelo antigo. Precisa passar a conferir, com a MESMA
`normalizeForMatch`, se o `example` aparece no HTML e **quantas vezes**,
sinalizando: não encontrado · ambíguo · curto demais · não-texto.
