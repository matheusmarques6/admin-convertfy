# Nomenclatura padrão de tags dos HTML references

Vocabulário CANÔNICO e FECHADO de placeholders `{{TAG}}` para os HTML de
arquitetura (`store_email_references` e variantes da biblioteca
`email_component_variants`).

**Origem do problema**: análise de 412 references reais (14 lojas, 7 flows)
encontrou **2.490 tags distintas** — o Montador inventava a nomenclatura a
cada geração porque o prompt só dava 3 exemplos. Este documento fecha o
vocabulário. Nenhuma tag fora desta lista é permitida.

Os orçamentos de caracteres (min/max) espelham os guarda-corpos validados em
render real (600px) de `src/lib/email-workspace/copy-spec.ts` e a regra do
kicker da migration `20260923_blueprint_hero_kicker_limit.sql`.

---

## Regras gerais (a gramática)

1. **Formato**: `{{SECAO_CAMPO}}` ou `{{SECAO_N_CAMPO}}` para itens repetidos.
   MAIÚSCULAS, ASCII, `_` como separador. Ex.: `{{HERO_HEADLINE}}`,
   `{{PRODUCT_2_NAME}}`.
2. **Índice N sempre no MEIO**: `PRODUCT_1_NAME` (nunca `PRODUCT_NAME_1`).
   N vai de 1 a 4.
3. **Todo link é `_URL`; todo texto clicável é `_LABEL`**. Nunca `_LINK`,
   nunca `_HREF`. Um botão/link completo = par `X_CTA_LABEL` + `X_CTA_URL`.
4. **Campos permitidos** (fechados): `EYEBROW`, `HEADLINE`, `SUBHEAD`,
   `BODY`, `TITLE`, `TEXT`, `NAME`, `PRICE`, `DESC`, `IMAGE`, `CODE`,
   `HINT`, `RATING`, `LABEL`, `URL`, `CTA_LABEL`, `CTA_URL`, `ADDRESS`,
   `TAGLINE`.
5. **Sinônimos PROIBIDOS** (sempre converter):
   - `KICKER`, `LABEL` (de seção), `OVERLINE` → **`EYEBROW`**
   - `SUBHEADLINE`, `SUBTITLE`, `SUBTEXT` → **`SUBHEAD`**
   - `COPY`, `META`, `PARAGRAPH` → **`TEXT`** (ou `BODY` no hero)
   - `FEATURE`, `REASON`, `DETAIL`, `POINT`, `BLOCK`, `TRUST` (itens de
     grade de benefícios) → **`USP`**
   - `TESTIMONIAL`, `QUOTE` → **`REVIEW`**
   - `UNSUB` → **`UNSUBSCRIBE`**
   - `BTN`, `BUTTON` → **`CTA`**
6. **Tags de sistema** (URLs, imagens, dados da loja) NÃO têm orçamento de
   caracteres — são substituídas por dado real, não por copy do LLM.

---

## Tabela canônica com orçamento de caracteres

“—” em min/max = tag de sistema (sem copy gerada).

### Meta (head do documento)

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{EMAIL_TITLE}}` | `<title>` do documento | 20 | 60 |
| `{{PREHEADER}}` | Texto oculto de pré-visualização | 35 | 90 |
| `{{BRAND_NAME}}` | Nome da marca (dado da loja) | — | — |
| `{{YEAR}}` | Ano corrente (footer/copyright) | — | — |

### Header

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{LOGO}}` | Logo da marca (img/SVG, sistema) | — | — |

### Hero

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{HERO_EYEBROW}}` | Kicker de 1 linha (1–3 palavras) | 8 | **24** |
| `{{HERO_HEADLINE}}` | Título principal | 18 | 40 |
| `{{HERO_SUBHEAD}}` | Apoio curto sob o headline (opcional) | 30 | 90 |
| `{{HERO_BODY}}` | Parágrafo do hero | 120 | 210 |
| `{{HERO_CTA_LABEL}}` | Texto do botão | 8 | 16 |
| `{{HERO_CTA_URL}}` | Link do botão | — | — |
| `{{HERO_IMAGE}}` | Imagem de fundo/slot (sistema) | — | — |

### Seção de texto (body/story/letter)

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{BODY_TITLE}}` | Título da seção | 20 | 50 |
| `{{BODY_TEXT}}` | Parágrafo | 120 | 280 |
| `{{BODY_CTA_LABEL}}` | Botão da seção (opcional) | 8 | 20 |
| `{{BODY_CTA_URL}}` | Link do botão | — | — |

### Oferta / Cupom

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{OFFER_EYEBROW}}` | Kicker da oferta (opcional) | 6 | 24 |
| `{{OFFER_HEADLINE}}` | Título da oferta | 15 | 40 |
| `{{OFFER_BODY}}` | Texto da oferta | 60 | 140 |
| `{{COUPON_CODE}}` | Código do cupom | 4 | 15 |
| `{{COUPON_HINT}}` | Condições/validade (linha pequena) | 20 | 90 |
| `{{OFFER_CTA_LABEL}}` | Botão | 8 | 20 |
| `{{OFFER_CTA_URL}}` | Link do botão | — | — |

### Produtos (grade ou destaque)

Seção (cabeçalho da grade):

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{PRODUCTS_TITLE}}` | Título da seção de produtos | 15 | 40 |
| `{{PRODUCTS_CTA_LABEL}}` | Botão "ver tudo" | 8 | 20 |
| `{{PRODUCTS_CTA_URL}}` | Link | — | — |

Itens (N = 1..4):

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{PRODUCT_N_NAME}}` | Nome do produto | 8 | 40 |
| `{{PRODUCT_N_PRICE}}` | Preço formatado (ex.: R$ 129,90) | 4 | 12 |
| `{{PRODUCT_N_DESC}}` | Descrição curta (opcional) | 40 | 90 |
| `{{PRODUCT_N_CTA_LABEL}}` | Botão do item (opcional) | 6 | 16 |
| `{{PRODUCT_N_URL}}` | Link do produto | — | — |
| `{{PRODUCT_N_IMAGE}}` | Imagem do produto (sistema) | — | — |

### USPs / Benefícios (grade de 2–4 itens)

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{USP_HEADLINE}}` | Título da seção (opcional) | 15 | 40 |
| `{{USP_N_TITLE}}` | Título do item | 12 | 30 |
| `{{USP_N_TEXT}}` | Texto do item | 60 | 120 |

### Reviews / Prova social

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{REVIEWS_TITLE}}` | Título da seção | 15 | 40 |
| `{{REVIEW_N_TEXT}}` | Depoimento | 55 | 85 |
| `{{REVIEW_N_NAME}}` | Nome do autor | 5 | 30 |
| `{{REVIEW_N_RATING}}` | Estrelas (ex.: ★★★★★) | — | — |
| `{{BADGE_N_TEXT}}` | Selo/garantia curto | 8 | 30 |

### Urgência / Countdown

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{URGENCY_HEADLINE}}` | Título de urgência | 20 | 45 |
| `{{URGENCY_TEXT}}` | Texto de urgência | 60 | 140 |
| `{{COUNTDOWN_DD}}` `{{COUNTDOWN_HH}}` `{{COUNTDOWN_MM}}` `{{COUNTDOWN_SS}}` | Dígitos do timer (sistema/ESP) | — | — |
| `{{COUNTDOWN_DD_LABEL}}` etc. | Rótulo da unidade (dias/horas…) | 3 | 10 |

### CTA final (fechamento)

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{FINAL_CTA_HEADLINE}}` | Título do fechamento | 20 | 45 |
| `{{FINAL_CTA_TEXT}}` | Texto de apoio | 40 | 120 |
| `{{FINAL_CTA_LABEL}}` | Botão | 8 | 20 |
| `{{FINAL_CTA_URL}}` | Link | — | — |

CTA genérico de bloco único (quando o bloco só tem um botão):
`{{CTA_LABEL}}` (8–20) + `{{CTA_URL}}` (—).

### Footer

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{FOOTER_TAGLINE}}` | Frase da marca | 10 | 90 |
| `{{FOOTER_TEXT}}` | Texto institucional/legal | 40 | 200 |
| `{{FOOTER_ADDRESS}}` | Endereço físico | 20 | 120 |
| `{{FOOTER_LINK_N_LABEL}}` | Rótulo de link de navegação (N=1..4) | 4 | 20 |
| `{{FOOTER_LINK_N_URL}}` | URL do link | — | — |
| `{{INSTAGRAM_URL}}` `{{FACEBOOK_URL}}` `{{TIKTOK_URL}}` `{{PINTEREST_URL}}` `{{YOUTUBE_URL}}` | Redes sociais (sistema) | — | — |
| `{{UNSUBSCRIBE_LABEL}}` | Texto do descadastro | 8 | 30 |
| `{{UNSUBSCRIBE_URL}}` | Link de descadastro (merge tag ESP) | — | — |
| `{{PREFERENCES_LABEL}}` | Texto de preferências | 8 | 30 |
| `{{PREFERENCES_URL}}` | Link de preferências (merge tag ESP) | — | — |

---

## Extensões v1.1 (mapeamento da biblioteca Email / Componentes)

Tags adicionadas ao converter as 40 variantes reais de
`email_component_variants` (que usavam o dialeto `{{ tag_minuscula }}`).

### Tags de sistema adicionadas (sem orçamento de copy)

| Tag | Conteúdo |
|---|---|
| `{{LOGO_URL}}` | URL da imagem do logo (quando o logo é `<img>`) |
| `{{WEBSITE_URL}}` | URL do site da loja |
| `{{X_IMAGE_ALT}}` | Alt text de qualquer imagem (par de toda `X_IMAGE`) |
| `{{X_BG_IMAGE}}` | Imagem decorativa de fundo da seção (`BODY_BG_IMAGE`, `PRODUCTS_BG_IMAGE`) |
| `{{PRODUCT_N_THUMB_M}}` | Miniaturas do produto (M = 1..3) |
| `{{FACEBOOK_ICON}}` `{{INSTAGRAM_ICON}}` `{{TIKTOK_ICON}}` `{{YOUTUBE_ICON}}` `{{PINTEREST_ICON}}` | Ícones sociais (img src) |
| `{{USP_N_ICON}}` / `{{USP_ICON}}` | Ícone do benefício (compartilhado quando único) |
| `{{BADGE_N_ICON}}` | Ícone do selo |
| `{{STEP_N_IMAGE}}` / `{{STEP_N_NUMBER}}` | Imagem e numeral do passo |
| `{{REVIEW_N_IMAGE}}` / `{{REVIEW_N_INITIAL}}` / `{{REVIEW_N_PHOTOS}}` / `{{REVIEW_N_URL}}` | Avatar, inicial, fotos anexas e link do review |
| `{{REVIEWS_IMAGE}}` / `{{REVIEWS_IMAGE_ALT}}` | Imagem/gif da seção de reviews |
| `{{PRODUCTS_IMAGE}}` | Imagem editorial da seção de produtos |
| `{{HEADER_LINK_N_LABEL}}` / `{{HEADER_LINK_N_URL}}` | Menu de navegação no topo (N = 1..4) |

### Tags de copy adicionadas

| Tag | Conteúdo | min | max |
|---|---|---|---|
| `{{OFFER_VALUE}}` | Valor do desconto (ex.: "10% OFF") | 4 | 16 |
| `{{BODY_SUBHEAD}}` | Apoio sob o título da seção de texto | 30 | 90 |
| `{{BODY_TEXT_N}}` | Parágrafos múltiplos (N = 1..3) | 80 | 220 |
| `{{BODY_QUOTE_LINE_N}}` | Linhas de citação da brand story (N = 1..3) | 15 | 60 |
| `{{HERO_HEADLINE_LINE_N}}` | Headline quebrada em 2 linhas estilizadas | 8 | 24 |
| `{{HERO_CTA_2_LABEL}}` / `{{HERO_CTA_2_URL}}` | Segundo CTA do hero | 8/— | 16/— |
| `{{PRODUCTS_SUBHEAD}}` | Apoio sob o título da grade | 20 | 80 |
| `{{PRODUCT_N_SUBHEAD}}` | Subtítulo do produto | 10 | 40 |
| `{{PRODUCT_N_DESC_2}}` | Segundo parágrafo (bloco 1-produto) | 40 | 90 |
| `{{PRODUCT_N_COMPARE_PRICE}}` | Preço "de" riscado | 4 | 12 |
| `{{PRODUCT_N_USP_M}}` | Benefício curto do produto (M = 1..2) | 8 | 35 |
| `{{PRODUCT_N_REVIEWS_COUNT}}` | Contagem de reviews (ex.: "1.234 reviews") | 5 | 20 |
| `{{PRODUCT_CTA_LABEL}}` | CTA compartilhado dos cards (grades grandes) | 6 | 16 |
| `{{REVIEWS_TEXT}}` | Intro da seção de reviews | 40 | 140 |
| `{{REVIEW_N_META}}` | Papel/produto do autor (ex.: "Verified Buyer") | 5 | 40 |
| `{{REVIEW_VERIFIED_LABEL}}` | Rótulo "Compra verificada" | 8 | 25 |
| `{{STEP_N_TITLE}}` / `{{STEP_N_TEXT}}` | Passos "como funciona" (N = 1..3) | 8–30 | 40–100 |

### Ajustes de faixa

- `FOOTER_LINK_N`: N estendido de 1..4 para **1..7** (footers reais têm até 7 links)
- `PRODUCT_N`: N estendido para **1..9** (grade "produtos 8" tem 9 cards)

---

## De → Para (tags mais frequentes fora do padrão)

Mapa de conversão para normalizar references existentes (frequência na
análise entre parênteses):

| Encontrado no CSV | Canônico |
|---|---|
| `LINK_N` / `LINK_N_URL` / `LINK_N_LABEL` (401+333+65) | `FOOTER_LINK_N_LABEL` / `FOOTER_LINK_N_URL` |
| `SOCIAL_N_URL` / `SOCIAL_N` (272+92) | rede nomeada: `INSTAGRAM_URL` etc. |
| `CONTEUDO` (129) | campo específico da seção (`BODY_TEXT`…) |
| `HEADLINE` solto (117) | `HERO_HEADLINE` (ou `BODY_TITLE` se não for hero) |
| `CTA_URL_N` / `CTA_LABEL_N` (134+130) | `X_CTA_URL` / `X_CTA_LABEL` da seção dona |
| `FEATURE_N[_TITLE/_TEXT]` (104+90+81) | `USP_N_TITLE` / `USP_N_TEXT` |
| `PRODUCT_NAME_N` / `PRODUCT_PRICE_N` (40+38) | `PRODUCT_N_NAME` / `PRODUCT_N_PRICE` |
| `UNSUB_LABEL` / `UNSUB_URL` (47+44) | `UNSUBSCRIBE_LABEL` / `UNSUBSCRIBE_URL` |
| `COMPANY_ADDRESS` / `ADDRESS` (50+24) | `FOOTER_ADDRESS` |
| `LOGO_TEXT` (59) | `LOGO` |
| `SECTION_TITLE` (56) | `TITLE` da seção dona (`PRODUCTS_TITLE`…) |
| `HERO_KICKER` / `EYEBROW` / `HERO_LABEL` | `HERO_EYEBROW` |
| `REASON_N_*` / `DETAIL_N_*` / `BLOCK_N_*` / `POINT_N` / `TRUST_N_*` | `USP_N_TITLE` / `USP_N_TEXT` |
| `QUOTE_N` / `TESTIMONIAL_*` | `REVIEW_N_TEXT` |
| `HH` / `MM` / `SS` / `DD` (+`_LABEL`) | `COUNTDOWN_HH` etc. |
| `FINAL_CTA` (24) | `FINAL_CTA_LABEL` |
| `CODE_LABEL` / `COUPON_LABEL` (23+23) | `COUPON_HINT` |
| `SUBHEAD` solto (50) | `HERO_SUBHEAD` (ou `BODY_TEXT`) |

---

## Próximos passos (padronização no pipeline)

1. Autor humano aplica esta nomenclatura nos HTML references existentes
   (este documento é a referência).
2. Migration no prompt do Montador (`email_agent_configs`, agent
   `component_assembler`): trocar o "ex.: {{HEADLINE}}…" pela lista fechada
   + regra "NUNCA invente tags fora desta lista".
3. Espelhar o vocabulário no prompt do HTML agent (matching direto por
   contrato em vez de matching semântico).
4. Validação em código: rejeitar/logar tags fora do vocabulário no output
   do Montador e no `POST /api/admin/components`.
5. Blueprint agent emite `copy_spec` usando os min/max desta tabela como
   teto (já clampado por `copy-spec.ts`).
