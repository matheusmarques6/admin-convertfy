# Variantes com copy descartada no merge — lista completa (27/08/2026)

**27 variantes ativas** (de 36) têm ao menos um campo cujo `example` não ancora
no HTML. São **62 campos** de 269 — a copy é gerada, paga, e jogada fora na
entrega.

**A maior parte não é erro de cadastro.** Dos 62 campos:

| Onde está o defeito | Campos |
|---|---|
| **Reconhecimento** — campo único com N ocorrências (regra 5) | **36** |
| Cadastro — frase inexistente | 15 (3 suspeitos de falso-positivo) |
| Cadastro — example curto demais | 6 |
| Cadastro — example gravado como array JSON | 2 |
| Ambiguidade real — 2 campos disputando 4 lugares | 2 |

Corrigir a regra 5 do merge resolve **36 campos de uma vez**, sem tocar em
nenhum cadastro.

## Como o endereçamento funciona

`src/lib/agents/html/copy-merge.ts` ancora cada campo pela **frase do `example`
do schema**, procurada no HTML da variante. Não existe `{{TAG}}` — a biblioteca
nunca adotou placeholders.

O merge é **fail-open por decisão (20/08)**: campo sem âncora não derruba a
geração — a frase de exemplo (lorem ipsum) fica no email e o desvio vai só para
a telemetria. É por isso que o defeito só aparece no email pronto.

## O que NÃO conta como defeito

`normalizeForMatch` + `foldChar` já toleram, dos dois lados:

- entidades HTML (`&nbsp;` `&copy;` `&times;` `&amp;` `&#39;` …)
- aspas curvas `' ' " "` → retas · travessões `– —` → `-` · `…` → `...`
- tab, quebra de linha, espaços múltiplos → um espaço · trim · minúsculas
- frase partida por `<br>` ou wrapper inline (costura nós irmãos)

E quando **N campos irmãos** dividem o mesmo `example` e há **N ocorrências**,
o merge casa por ordem de declaração. Tudo isso está OK e foi descontado.

---

## Categoria AMBÍGUO — 38 campos, 22 variantes

**Isto é defeito de RECONHECIMENTO, não de cadastro.** O `example` é a frase
literal do HTML; o que o merge não sabe fazer é lidar com repetição intencional
da arte.

Caso canônico — `ribbon_text` da `body 2`:

```
example cadastrado: "Black Friday"
observação do curador: "Nome da campanha, repetido 7× na fita alternando peso"
HTML: duas fitas diagonais, 7 repetições cada, algumas dentro de <b>
```

O cadastro está impecável e até documenta a repetição. O merge encontra 16
ocorrências para 1 campo e cai na **regra 5** de `anchor-match.ts`:

```js
// anchor-match.ts:477
if (free.length > memberIdxs.length) {
  // Mais lugares que campos — chutar escreveria a copy na frase errada.
  fail("ocorrencias_excedem_campos")
}
```

Resultado: a loja recebe um email escrito "Black Friday" mesmo sem campanha de
Black Friday.

**36 dos 38 campos desta seção têm esse mesmo perfil** (campo único, N
ocorrências). Para um campo único cuja frase se repete idêntica, a leitura certa
não é ambiguidade — é **substituir todas as ocorrências**, que é o que o
`set_text` do Integrador já faz (migration 20261042). Trocar metade e deixar a
outra metade com o texto do template é pior do que trocar tudo.

Só **1 grupo** é ambiguidade real: `review 8`, `review_1_cta_label +
review_3_cta_label` — 2 campos com valores distintos para 4 ocorrências de
"Shop Now".

**Correção: no merge, não no cadastro.**

| Variante | Campo | example | ocorrências |
|---|---|---|---|
| body 2 - bridge textos linha produtos `d5fb804f` | ribbon_text | Black Friday | **16** |
| review 8 `d92f812f` | review_1_cta_label + review_3_cta_label | Shop Now | 4 (p/ 2 campos) |
| review 5 `f8ed9f85` | section_intro | Lorem ipsum dolor sit amet… | 4 |
| review 8 `d92f812f` | review_2_name | Buyer Name | 3 |
| welcome - hero sectiion 8 `43f9b0ec` | headline_l1 | Header | 3 |
| welcome - hero section 5 `8858709f` | coupon_code | CODECODE | 3 |
| body 3 - bridge features cards `4e9726d1` | section_cta_label | DIGITAL GIFT CARD | 2 |
| body 3 - bridge features cards `4e9726d1` | section_headline | The Gift That Fits Every Taste | 2 |
| footer 1 `35b5d8fd` | footer_unsub_label | Unsubscribe | 2 |
| offer 2 `304bf7ce` | offer_eyebrow | 4th Of July | 2 |
| offer 3 `da0b6e11` | coupon_code | ` CODECODE` | 2 |
| offer 3 `da0b6e11` | coupon_cta_label | Shop Now | 2 |
| offer 4 `69ede46f` | manifesto_cta_label | Discover Now | 2 |
| offer 4 `69ede46f` | manifesto_headline | Taste Finds Its Match | 2 |
| offer 4 `69ede46f` | manifesto_headline_lead | Where Refined | 2 |
| offer 5 `5a34dbaf` | diff_cta_label | Use My Discount Now | 2 |
| offer 5 `5a34dbaf` | diff_headline | Us Different | 2 |
| offer 5 `5a34dbaf` | diff_label | What Makes | 2 |
| produtos 2 - Three Ingredients `8ef65206` | cta_label | SHOP NOW | 2 |
| produtos 3 - grid 4 produtos `a15a6331` | section_title | Two Line Section Title | 2 |
| produtos 4 - um produto `7bd9e98b` | badge_deadline | Offer ends July 31st. | 2 |
| produtos 4 - um produto `7bd9e98b` | badge_label | P.S. | 2 |
| produtos 4 - um produto `7bd9e98b` | cta_label | SHOP NOW | 2 |
| review 1 `d48deaa4` | section_title | RECOMMENDATION | 2 |
| review 3 `7dafa6ca` | review_1_body | Lorem ipsum dolor sit amet… | 2 |
| review 3 `7dafa6ca` | review_1_title | Ut enim ad minim veniam | 2 |
| review 3 `cff6c8d8` | review_1_body | Lorem ipsum dolor sit amet… | 2 |
| review 3 `cff6c8d8` | review_1_title | Ut enim ad minim veniam | 2 |
| review 6 `956b9e76` | testimonials_headline | Spicy Testimonials | 2 |
| welcome - hero sectiion 8 `43f9b0ec` | headline_l2 | Title | 2 |
| welcome - hero section 2 `3e241d7f` | cta_label | SHOP 10% OFF | 2 |
| welcome - hero section 4 `e447ef06` | coupon_code | CODE | 2 |
| welcome - hero section 5 `8858709f` | coupon_label | ` Use code<TAB> ` | 2 |
| welcome - hero section 5 `8858709f` | cta_label | SHOP NOW | 2 |
| welcome - hero section 6 `72c32ec8` | offer_value | X% OFF | 2 |
| welcome - hero section 7 `c90713ff` | offer_value | `<TAB>35% OFF SCRUBS` | 2 |
| welcome - hero section 9 `85006b06` | hero_headline | TITLE HERE | 2 |

---

## Categoria INEXISTENTE — 15 campos, 6 variantes

O cadastro está errado. Corrigir = colar no `example` a frase exata do HTML.

| Variante | Campo | example cadastrado | Diagnóstico |
|---|---|---|---|
| body 4 - bridge fundo cards `63736c6c` | section_headline | LATHER. RINSE. REPEAT. | examples de **outra peça** (shampoo em barra); este HTML tem "TITLE HERE" e lorem ipsum |
| body 4 - bridge fundo cards `63736c6c` | howto_1_title | LATHER | idem |
| body 4 - bridge fundo cards `63736c6c` | howto_2_title | SOFTEN | idem |
| body 4 - bridge fundo cards `63736c6c` | section_cta_label | LEARN MORE | idem |
| body 3 - bridge features cards `4e9726d1` | section_body_1 | Our digital gift card lets your clients… | frase ausente do HTML |
| body 3 - bridge features cards `4e9726d1` | section_body_2 | One simple click, one thoughtful gesture… | frase ausente do HTML |
| produto 8 - 4 produtos `640b0a34` | product_cta_label_1 | CTA PRO**P**DUTO 1 | **erro de digitação** — HTML tem PRODUTO |
| produto 8 - 4 produtos `640b0a34` | product_cta_label_2 | CTA PRO**P**DUTO **4** | typo **+ numeração trocada** |
| produto 8 - 4 produtos `640b0a34` | product_cta_label_3 | CTA PRO**P**DUTO 3 | typo |
| produto 8 - 4 produtos `640b0a34` | product_cta_label_4 | CTA PRO**P**DUTO **2** | typo + numeração trocada |
| produto 8 - 4 produtos `640b0a34` | section_title | 2 Line Section Title Here | frase ausente do HTML |
| produtos 2 - Three Ingredients `8ef65206` | headline | `<TAB>`THREE **/** INGREDIENTS. **/** ZERO FILLERS. | as **barras `/`** são notação de quebra de linha do curador; o HTML tem THREE e ZERO FILLERS sem elas |
| footer 1 `35b5d8fd` | footer_copyright | Copyright © 2025, Company Name | HTML tem `&copy;` e "Company Name" — provável divergência no resto da frase |
| footer 2 `85557ad0` | footer_copyright | © 2025 brand name. All rights reserved. | idem |
| offer 2 `304bf7ce` | offer_price_spec_2 / _spec_4 | 24× 6oz Patties / Grill-Ready/20 Blend | HTML tem `&times;` e "Patties" — divergência no resto |

> As 4 últimas linhas (footer 1, footer 2, offer 2) envolvem entidades HTML que
> o código decodifica genericamente. Podem ainda ser falso-positivo da medição —
> conferir no editor antes de mexer.

---

## Categoria CURTO DEMAIS — 6 campos, 4 variantes

Âncora de 1–3 caracteres casa em qualquer lugar.

| Variante | Campo | example |
|---|---|---|
| offer 1 `3cee424b` | offer_cta_label | CTA |
| offer 3 `da0b6e11` | coupon_connector | For |
| produtos 4 - um produto `7bd9e98b` | price_new / price_old | $59 / $64 |
| review 8 `d92f812f` | review_1_initial / review_2_initial | `<TAB>G` / K |

---

## Categoria ARRAY JSON — 2 campos, 1 variante

`body 4 - bridge fundo cards` `63736c6c` → `howto_1_steps`, `howto_2_steps`
gravados como `["Wet hair thoroughly.", "Lather bar…"]`. Uma âncora de texto
nunca casa com array serializado — erro de tipo no cadastro.

---

## Achados laterais

- **Duas variantes ativas chamadas "review 3"** (`cff6c8d8` e `7dafa6ca`), com o
  mesmo defeito nas duas. Provável duplicata na biblioteca.
- **"welcome - hero sectiion 8"** — typo no nome da variante ("sectiion").
- **"offer 4 "** — espaço sobrando no fim do nome.

## A correção da regra 5

Em `assignTextAnchors` (`anchor-match.ts:477`), quando `memberIdxs.length === 1`
e há N ocorrências livres, ancorar em **todas** em vez de falhar. O
`copy-merge` já empurra splices para uma lista (`applySplices`), então é
emitir um splice por ocorrência com o mesmo `replacement`.

Escopo: `AnchorAssignment` ganha os ranges extras (aditivo, não quebra
consumidor), a regra passa a distinguir campo único de irmãos, e a telemetria
registra quantas ocorrências foram escritas.

Risco a decidir: se a mesma frase aparece em dois lugares semanticamente
diferentes e só um é campo, os dois passam a ser trocados. Na prática isso é
melhor que o estado atual — hoje nenhum dos dois é trocado, e o email sai com o
texto do template. O precedente da casa é o `set_text` do Integrador, que já
substitui todas as ocorrências.

## Sugestão de guarda

O painel "Schema × HTML" do editor de variantes confere **placeholder** — o
modelo antigo. Precisa passar a usar a MESMA `normalizeForMatch` e reportar se
o `example` aparece no HTML e **quantas vezes**, sinalizando: não encontrado ·
ambíguo · curto demais · não-texto. Sem isso o defeito segue invisível até o
email ficar pronto.
