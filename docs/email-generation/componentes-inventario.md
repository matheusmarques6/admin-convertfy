# Componentes de email — inventário completo

> **Fonte:** tabela `email_component_variants` do projeto Supabase `admin convertfy`, extraída em 31 de agosto de 2026.  
> **Referência de código:** branch `claude/resume-previous-session-UvATK`.  
> **Conteúdo:** 44 variantes (42 ativas) em 6 dos 8 tipos de seção · 506.5 KB de HTML.  
> **Integridade:** o HTML de cada variante foi conferido por `md5` contra o banco na extração.

## Como ler este documento

- Os **tipos de seção** e seus rótulos vêm da fonte canônica `src/lib/agents/shared/component-categories.ts` (`COMPONENT_CATEGORIES`) — são as mesmas pílulas da aba **Componentes** em `/admin/settings/email-generation`.
- Os rótulos dos campos são os mesmos da UI do editor de variante: *Descrição curta*, *Descrição detalhada*, e o card *Contexto para a IA* (Quando usar, Quando NÃO usar, Orientações de copy para a IA, Design system, Direção fotográfica).
- **Campo vazio aparece como `—` ou `_(vazio)_`** — o buraco é informação: é o que a IA não recebe na hora de escolher e preencher o bloco.
- No HTML, **imagens embutidas em base64 estão abreviadas** (`data:image/png;base64,…[base64 de ~83 KB omitido]…`) para o documento continuar legível. A versão `.html` deste mesmo inventário traz os data URIs **íntegros**.
- A coluna **Exemplo no HTML** do schema é um indicativo por busca literal do texto do campo `example` dentro do HTML. A régua real usada pelo merge (`auditSchemaAnchors`, em `src/lib/email-workspace/schema-example-coherence.ts`) normaliza espaços e desempata campos irmãos — um `não` aqui merece conferência, não é veredito.
- **Fora do documento** (por decisão de escopo): `rendered_html`, os campos legados `niche_affinity`/`positioning`/`mood`, o `slots` CSV antigo, `thumbnail`, `version` e as colunas mortas do Taguedor (`html_tagged`, `tagging_status`, `tagging_meta` — vazias em todas as 44 variantes).

## Resumo por tipo de seção

| # | Tipo de seção | Chave | Variantes | Ativas | HTML |
|---|---|---|---|---|---|
| 1 | Header / Navegação | `header` | **0** | — | — |
| 2 | Hero | `hero` | 9 | 9 | 45.1 KB |
| 3 | Value Proposition / Body | `body` | 9 | 7 | 81.9 KB |
| 4 | Produtos / Grade | `products` | 9 | 9 | 126.4 KB |
| 5 | Reviews / Prova Social | `reviews` | 7 | 7 | 152.0 KB |
| 6 | CTA | `cta` | **0** | — | — |
| 7 | Oferta / Promo / Desconto | `offer` | 6 | 6 | 34.4 KB |
| 8 | Footer | `footer` | 4 | 4 | 66.7 KB |
| | **Total** | | **44** | **42** | **506.5 KB** |

## Sumário

1. **Header / Navegação** — _nenhuma variante cadastrada_
2. **Hero** (9)
    - [2.1 · hero section 10](#v-dc6c363c)
    - [2.2 · welcome - hero sectiion 8](#v-43f9b0ec)
    - [2.3 · welcome - hero section 2](#v-3e241d7f)
    - [2.4 · welcome - hero section 3](#v-d9e34a1f)
    - [2.5 · welcome - hero section 4](#v-e447ef06)
    - [2.6 · welcome - hero section 5](#v-8858709f)
    - [2.7 · welcome - hero section 6](#v-72c32ec8)
    - [2.8 · welcome - hero section 7](#v-c90713ff)
    - [2.9 · welcome - hero section 9](#v-85006b06)
3. **Value Proposition / Body** (9)
    - [3.1 · body 2 - bridge textos linha produtos](#v-d5fb804f)
    - [3.2 · body 3 - bridge features cards](#v-4e9726d1)
    - [3.3 · body 4 - bridge fundo cards](#v-63736c6c)
    - [3.4 · body 5 - comparison table us vs them](#v-7d1c214a) · _inativa_
    - [3.5 · body 6 - bridge skin minimalism 101](#v-35a68bb0)
    - [3.6 · body 7 - bridge FAQ](#v-d699e212)
    - [3.7 · body 8 - cards vidro](#v-753d7e86)
    - [3.8 · body 9 - key features pilulas](#v-2daabd5e)
    - [3.9 · body 10 - listicle educativo 3 dicas](#v-42c883e5) · _inativa_
4. **Produtos / Grade** (9)
    - [4.1 · produto 8 - 4 produtos](#v-640b0a34)
    - [4.2 · produtos 2 - Three Ingredients. Zero Fillers](#v-8ef65206)
    - [4.3 · produtos 3 - grid 4 produtos](#v-a15a6331)
    - [4.4 · produtos 4 - um produto](#v-7bd9e98b)
    - [4.5 · produtos 5 - 3 produtos mesmo fundo](#v-7ef1a9f4)
    - [4.6 · produtos 6](#v-fc41efe6)
    - [4.7 · produtos 7 - dois produtos](#v-cee34b0a)
    - [4.8 · produtos 8 - 9 produtos](#v-9c00bf11)
    - [4.9 · produtos 9 - 4 produtos](#v-2f115df3)
5. **Reviews / Prova Social** (7)
    - [5.1 · review 1](#v-d48deaa4)
    - [5.2 · review 3](#v-7dafa6ca)
    - [5.3 · review 3](#v-cff6c8d8)
    - [5.4 · review 5](#v-f8ed9f85)
    - [5.5 · review 6](#v-956b9e76)
    - [5.6 · review 7](#v-a8468e9f)
    - [5.7 · review 8](#v-d92f812f)
6. **CTA** — _nenhuma variante cadastrada_
7. **Oferta / Promo / Desconto** (6)
    - [7.1 · offer 1](#v-3cee424b)
    - [7.2 · offer 2](#v-304bf7ce)
    - [7.3 · offer 3](#v-da0b6e11)
    - [7.4 · offer 4](#v-69ede46f)
    - [7.5 · offer 5](#v-5a34dbaf)
    - [7.6 · offer 6](#v-1e45ed32)
8. **Footer** (4)
    - [8.1 · footer 1](#v-35b5d8fd)
    - [8.2 · footer 2](#v-85557ad0)
    - [8.3 · footer 3 - dark](#v-a2bb5abd)
    - [8.4 · footer 4 - dark](#v-7ba06b7c)


---

## 1 · Header / Navegação

Nenhuma variante cadastrada para `header`. O Montador não tem de onde escolher um bloco desta seção — quando o blueprint pede um, o pipeline cai no template global.


---

## 2 · Hero

`hero` · 9 variantes (9 ativas · 45.1 KB de HTML)

<a id="v-dc6c363c"></a>

### 2.1 · hero section 10 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 3.1 KB |
| **ID** | `dc6c363c-7d4f-4c70-a163-632bcadfdce6` |

#### Descrição curta

Diz "a solução é o conjunto, não um produto". Anuncia uma rotina, kit ou linha completa e manda para a coleção. Vive no meio do e-mail, no momento de **descoberta e educação** — quando o cliente ainda está conhecendo a amplitude do catálogo, não decidindo uma compra específica.  

#### Descrição detalhada

Módulo de seção, nunca topo de e-mail. Ordem fixa: **título → subtítulo → CTA → imagem**.  

O CTA vem **antes** da foto — esse é o mecanismo. O leitor recebe a promessa, a justificativa em uma frase e o botão; a foto confirma visualmente o que ele já decidiu clicar. Com a imagem acima do botão, vira banner comum.  

Fundo do container e fundo da foto são o mesmo branco: a emenda é invisível e o bloco lê como peça única. Todo o texto é vivo em HTML — é o único padrão do arsenal que sobrevive inteiro a imagem bloqueada e a dark mode.  

#### Contexto para a IA

##### Quando usar

- Rotina, kit, linha ou coleção — o argumento é "conjunto".  
- Beleza, skincare, haircare, suplementos, pet, casa: nichos onde o portfólio é o argumento.  
- 2º/3º bloco de welcome; newsletter e campanha sazonal; cross-sell; browse abandonment.  
- Quando a marca tem fotografia de estúdio em fundo claro e embalagem colorida.  

##### Quando NÃO usar

- Carrinho e checkout abandonado — convida à descoberta e concorre com o CTA de recuperação.  
- Hero de abertura — não tem barra de marca; o e-mail começa sem identidade.  
- Produto único de ticket alto, ou marca de luxo editorial (o botão preto é comercial demais).  
- Foto com fundo colorido, escuro ou de ambiente — aparece a emenda.  
- Foto com texto, selo ou preço queimado.  
- Urgência, countdown, flash sale, transacional.  

##### Orientações de copy para a IA

**Título** — promessa de resultado, caixa alta, voz do benefício. Sem nome de produto, sem preço, sem desconto, sem ponto final.  
**Subtítulo** — uma frase com o *como*: o que ganha e por qual mecanismo. Não repete o título. Ponto final.  
**CTA** — verbo + objeto da coleção, caixa alta. Preferir específico ao genérico. Nunca repetir desconto.  

Sequência: título promete o resultado → subtítulo dá a condição → CTA nomeia o caminho. Se os três dizem a mesma coisa, está errado.  

**Proibições:** desconto ou cupom em qualquer slot, contagem regressiva, "clique aqui", superlativo sem lastro. Em PT-BR, evitar imperativo traduzido ao pé da letra ("COMPRE A ROTINA" → "MONTE SUA ROTINA").  

##### Design system

Container 600px fixo, fundo `#FFFFFF`, borda 1px `#000000` opcional (flag `has_border`). Zero raio, zero sombra, zero gradiente.  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Título | 59px | 35/39px, útil 490px (padding lateral 55px) |  
| Subtítulo | 24px | 24/27px, caixa travada em 357px |  
| CTA | 36px | 401 × 82px |  
| Imagem | 55px | 598 × 489px, full-bleed |  

Hierarquia de largura: **título > botão > subtítulo**. A caixa de 357px do subtítulo força duas linhas curtas — não alargar.  

**Paleta — duas cores.** Cor primária `#000000` (título, subtítulo, fundo do botão); cor secundária `#FFFFFF` (container, fundo da foto, label do botão). Sem acento: toda a cor vem da fotografia.  

**Tipografia.** Principal: Arial → Helvetica, nos três slots. Título 35px **regular** em caixa alta (o impacto vem do corpo, não do bold); subtítulo 24px regular; CTA 30px bold. Secundária não existe no template base — se a loja tem serif display de marca, ela entra **só no título** (é o que a Cocunat faz).  

**Implementação.** `color-scheme: light only` + hack `u + .body .txt-blk` (Gmail iOS). Botão bulletproof, nunca imagem. `<img>` sempre `display:block` — sem isso o gap do Outlook expõe a emenda. Imagem em 2x servida na largura de exibição.  

**Tags:** `SECTION_TITLE`, `SECTION_SUBTITLE`, `CTA_LABEL`, `CTA_URL`, `IMAGE_URL`, `IMAGE_LINK_URL`, `IMAGE_ALT`.  

**Erros que quebram o padrão:** imagem acima do botão · fundo da foto fora do branco do container · texto queimado na imagem · título em bold · subtítulo alargado · botão com raio ou mais largo que o título · terceira cor · segundo botão · `<img>` sem `display:block`.  

##### Direção fotográfica

598 × 489px (1,22:1) · exportar 1196 × 978 (2x) · JPG q80 ou WebP · < 200 KB · full-bleed.  

**Regra crítica:** o terço superior tem que ser branco de estúdio uniforme, no mesmo valor do container. É o que apaga a emenda.  

**Composição.** Cluster central de 6 a 9 itens da mesma família, alturas escalonadas em arco, sobreposição parcial, ao menos um item deitado. Sangra na base do quadro e pode sangrar de leve nas laterais. Terço superior livre.  

**Cenário e luz.** Superfície branca contínua com parede branca, sem linha dura de horizonte; faixa de piso levemente mais fria na base (≈ `#DEDEE0`). Luz difusa frontal-superior, sombras curtas e macias. Sem vinheta, sem reflexo espelhado.  

**Produto.** Rótulos da frente legíveis e voltados para a câmera. A cor da embalagem é a única cor da peça — o casting precisa formar paleta coerente.  

**Proibições:** fundo colorido ou de ambiente · texto/preço/selo queimado · produto único centralizado (vira packshot) · fileira simétrica · sombra dura · pessoa ou mão · prop de ambiente · marca d'água.  

**Adaptação por categoria** — o que compõe o cluster:  

| Categoria | Itens |  
|---|---|  
| Haircare / skincare | Frascos, bisnagas, séruns, pote, acessório de tecido |  
| Suplementos | Potes, sachês, doseador, cápsula solta |  
| Casa / limpeza | Refis, borrifadores, panos, embalagem-mãe |  
| Pet | Sachês, potes, brinquedo, coleira |  
| Alimentos / bebidas | Latas e garrafas, em pé e deitadas |  
| Beleza / maquiagem | Batons, compactos, pincéis em leque |  

#### Schema de output (4 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 48 | sim |
| `section_subtitle` | `{{SECTION_SUBTITLE}}` | Texto curto | Copy (n8n) | não | 60 | sim |
| `section_cta_label` | `{{SECTION_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `section_image_alt` | `{{SECTION_IMAGE_ALT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* Section title here
    - *Orientação:* 28 (máx. 48 em 2 linhas) \| Caixa alta, sem ponto final
- **`section_subtitle`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit
    - *Orientação:* 60 (máx. 85 em 3 linhas) Caixa mista, ponto final
- **`section_cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo + objeto
- **`section_image_alt`**
    - *Imagem:* proporção 1,22:1 · 1196 × 978 px
    - *Spec da imagem:* - **Onde fica:** último elemento do bloco, 55px abaixo do CTA, sangrando de borda a borda.<br>- **Nome do ativo:** `secao_lineup_[slug-da-colecao].jpg`<br>- **Proporção e formato:** 598 × 489px (1,22:1), exportar 1196 × 978 (2x), JPG q80 ou WebP, < 200 KB.<br>- **Ideia:** a linha completa da coleção anunciada, em cluster central sobre fundo branco de estúdio contínuo, alturas escalonadas, sangrando na base, terço superior vazio para casar com o container. A cor vem inteiramente das embalagens. Sem pessoas, props ou texto queimado.<br>- **Slot único.** Se a coleção precisa de mais de um visual, empilhe outra instância da variante.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Section Title + CTA + imagem</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">
  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">
    <!-- TÍTULO DA SEÇÃO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:59px 55px 0 55px;font-family:Arial,Helvetica,sans-serif;font-size:35px;line-height:39px;font-weight:400;text-transform:uppercase;color:#000000;">
        Section title here
      </td>
    </tr>
    <!-- SUBTÍTULO -->
    <tr>
      <td align="center" style="padding:24px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:357px;">
          <tr>
            <td align="center" class="txt-blk" style="width:357px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:27px;font-weight:400;color:#000000;">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- CTA -->
    <tr>
      <td align="center" style="padding:36px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:401px;">
          <tr>
            <td align="center" height="82" style="width:401px;height:82px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:401px;height:82px;line-height:82px;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP NOW
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- IMAGEM -->
    <tr>
      <td align="center" style="padding:55px 0 0 0;font-size:0;line-height:0;">
        <a href="URL_DA_IMAGEM_LINK_AQUI">
          <img src="URL_DA_IMAGEM_AQUI"
               width="598" height="489"
               alt="ALT_DA_IMAGEM_AQUI"
               style="display:block;width:598px;height:489px;">
        </a>
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>
```

<a id="v-43f9b0ec"></a>

### 2.2 · welcome - hero sectiion 8 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Promoção, Carrinho abandonado |
| **Tons compatíveis** | Aspiracional, Premium, Urgente |
| **Tags** | dark_bg, white_container, single_col, logo_right, logo_bar_dark, offer_reminder, urgency_copy, discount_offer, coupon_code, coupon_ruled_lines, pill_button, white_button, hero_image_bottom, dark_offer_block, text_block_image_order, mso_fallback, mobile_responsive, partial_template, product_grid_omitted, footer_omitted |
| **Tamanho do HTML** | 4.8 KB |
| **ID** | `43f9b0ec-9ebc-4657-b1ef-9cfd5a521895` |

#### Descrição curta

Bloco de meio de e-mail. Anuncia uma rotina, kit ou linha completa e leva à coleção correspondente; o argumento é o conjunto, não o produto individual. Momento de uso: descoberta e educação — quando o cliente está conhecendo a amplitude do catálogo, não decidindo uma compra específica.  

#### Descrição detalhada

Módulo de seção, nunca topo de e-mail. Ordem fixa: título → subtítulo → CTA → imagem.  

Três mecanismos definem a variante:  

CTA antes da imagem. O leitor recebe promessa, justificativa e botão; a foto confirma o que ele já decidiu clicar. Com a imagem acima do botão, o bloco vira banner.  

Fundo do container e fundo da foto no mesmo branco. A emenda entre texto e imagem fica invisível e o bloco lê como peça única.  

Texto 100% vivo em HTML. Título, subtítulo e label não são queimados na imagem — é o único padrão do arsenal que sobrevive inteiro a imagem bloqueada e a dark mode.  

#### Contexto para a IA

##### Quando usar

Rotina, kit, linha ou coleção — o argumento é "conjunto".  
Beleza, skincare, haircare, suplementos, pet, casa: nichos onde o portfólio é o argumento.  
2º/3º bloco de welcome; newsletter e campanha sazonal; cross-sell; browse abandonment.  
Quando a marca tem fotografia de estúdio em fundo claro e embalagem colorida.  

##### Quando NÃO usar

Carrinho e checkout abandonado — convida à descoberta e concorre com o CTA de recuperação.  
Hero de abertura — não tem barra de marca; o e-mail começa sem identidade.  
Produto único de ticket alto, ou marca de luxo editorial (o botão preto é comercial demais).  
Foto com fundo colorido, escuro ou de ambiente — aparece a emenda.  
Foto com texto, selo ou preço queimado.  
Urgência, countdown, flash sale, transacional.  

##### Orientações de copy para a IA

Título — promessa de resultado, caixa alta, voz do benefício. Sem nome de produto, sem preço, sem desconto, sem ponto final. Subtítulo — uma frase com o como: o que ganha e por qual mecanismo. Não repete o título. Ponto final. CTA — verbo + objeto da coleção, caixa alta. Preferir específico ao genérico. Nunca repetir desconto.  

Sequência: título promete o resultado → subtítulo dá a condição → CTA nomeia o caminho. Se os três dizem a mesma coisa, está errado.  

Proibições: desconto ou cupom em qualquer slot, contagem regressiva, "clique aqui", superlativo sem lastro. Em PT-BR, evitar imperativo traduzido ao pé da letra ("COMPRE A ROTINA" → "MONTE SUA ROTINA").  

##### Design system

Container 600px fixo, fundo   
#FFFFFF, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente.  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Título | 59px | 35/39px, útil 490px (padding lateral 55px) |  
| Subtítulo | 24px | 24/27px, caixa travada em 357px |  
| CTA | 36px | 401 × 82px |  
| Imagem | 55px | 598 × 489px, full-bleed |  

Hierarquia de largura: título > botão > subtítulo. A caixa de 357px do subtítulo força duas linhas curtas — não alargar.  

Paleta — duas cores. Cor primária   
#000000 (título, subtítulo, fundo do botão); cor secundária   
#FFFFFF (container, fundo da foto, label do botão). Sem acento: toda a cor vem da fotografia.  

Tipografia. Principal: Arial → Helvetica, nos três slots. Título 35px regular em caixa alta (o impacto vem do corpo, não do bold); subtítulo 24px regular; CTA 30px bold. Secundária não existe no template base — se a loja tem serif display de marca, ela entra só no título (é o que a Cocunat faz).  

Implementação. color-scheme: light only + hack u + .body .txt-blk (Gmail iOS). Botão bulletproof, nunca imagem. <img> sempre display:block — sem isso o gap do Outlook expõe a emenda. Imagem em 2x servida na largura de exibição.  

Tags: SECTION_TITLE, SECTION_SUBTITLE, CTA_LABEL, CTA_URL, IMAGE_URL, IMAGE_LINK_URL, IMAGE_ALT.  

Erros que quebram o padrão: imagem acima do botão · fundo da foto fora do branco do container · texto queimado na imagem · título em bold · subtítulo alargado · botão com raio ou mais largo que o título · terceira cor · segundo botão · <img> sem display:block.  

##### Direção fotográfica

7. Direção fotográfica  

598 × 489px (1,22:1) · exportar 1196 × 978 (2x) · JPG q80 ou WebP · < 200 KB · full-bleed.  

Regra crítica: o terço superior tem que ser branco de estúdio uniforme, no mesmo valor do container. É o que apaga a emenda.  

Composição. Cluster central de 6 a 9 itens da mesma família, alturas escalonadas em arco, sobreposição parcial, ao menos um item deitado. Sangra na base do quadro e pode sangrar de leve nas laterais. Terço superior livre.  

Cenário e luz. Superfície branca contínua com parede branca, sem linha dura de horizonte; faixa de piso levemente mais fria na base (≈   
#DEDEE0). Luz difusa frontal-superior, sombras curtas e macias. Sem vinheta, sem reflexo espelhado.  

Produto. Rótulos da frente legíveis e voltados para a câmera. A cor da embalagem é a única cor da peça — o casting precisa formar paleta coerente.  

Proibições: fundo colorido ou de ambiente · texto/preço/selo queimado · produto único centralizado (vira packshot) · fileira simétrica · sombra dura · pessoa ou mão · prop de ambiente · marca d'água.  

Adaptação por categoria — o que compõe o cluster:  

| Categoria | Itens |  
|---|---|  
| Haircare / skincare | Frascos, bisnagas, séruns, pote, acessório de tecido |  
| Suplementos | Potes, sachês, doseador, cápsula solta |  
| Casa / limpeza | Refis, borrifadores, panos, embalagem-mãe |  
| Pet | Sachês, potes, brinquedo, coleira |  
| Alimentos / bebidas | Latas e garrafas, em pé e deitadas |  
| Beleza / maquiagem | Batons, compactos, pincéis em leque |  


Checklist: terço superior livre · branco idêntico ao container · cluster sangrando na base · 6-9 itens · alturas escalonadas · rótulos legíveis · sem texto/pessoa · sombras macias · 1196px e < 200 KB.  

#### Schema de output (7 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `banner_benefit` | `{{BANNER_BENEFIT}}` | Texto curto | Copy (n8n) | não | 58 | não |
| `headline_l1` | `{{HEADLINE_L1}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `headline_l2` | `{{HEADLINE_L2}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `cta_1_label` | `{{CTA_1_LABEL}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `cta_2_label` | `{{CTA_2_LABEL}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `hero_background_campaign` | `{{HERO_BACKGROUND_CAMPAIGN}}` | Imagem | Imagem gerada | não | — | — |
| `brand_logo` | `{{BRAND_LOGO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`banner_benefit`**
    - *Exemplo:* Use code ‘WELCOMEHERO’ for $10 off your first course
    - *Orientação:* Uma linha, benefício permanente
- **`headline_l1`**
    - *Exemplo:* Header
    - *Orientação:* 12 (14 com sans condensada), Caixa alta, abre a frase
- **`headline_l2`**
    - *Exemplo:* Title
    - *Orientação:* Caixa alta, fecha a frase, sem ponto<br>12 (14 com sans condensada)
- **`cta_1_label`**
    - *Exemplo:* CTA 1
    - *Orientação:* Caixa alta, verbo + segmento
- **`cta_2_label`**
    - *Exemplo:* CTA 2
    - *Orientação:* Mesma construção do CTA 1
- **`hero_background_campaign`**
    - *Orientação:* Onde fica: fundo de toda a hero, abaixo da barra de benefício; logo, headline e os dois botões são sobrepostos a ela.<br>Nome do ativo: hero_campanha_[slug-da-campanha].jpg<br>Proporção e formato: 598 × 960px (1:1,60), exportar 1196 × 1920 (2x), JPG q80 ou WebP, < 320 KB.
    - *Imagem:* proporção 1:1,60 · 1196 × 1920 px
    - *Spec da imagem:* Ideia: cena de uso real do produto, enquadrada fechada e cortada pelas bordas, produto em ação ocupando menos de 20% do quadro. Duas faixas visualmente calmas — topo e altura dos botões — para receber o overlay; o sujeito ocupa a faixa central entre elas. Luz natural, paleta dessaturada. Sem rostos em primeiro plano, sem texto queimado, sem vinheta aplicada.
- **`brand_logo`**
    - *Orientação:* Onde fica: topo da hero, 36px abaixo da barra, centralizado.<br>Nome do ativo: logo_[marca]_[claro\|escuro].png
    - *Imagem:* 468 × 168 px
    - *Spec da imagem:* Ideia: wordmark da marca em versão de uma cor, na pele oposta à luminância da foto. Duas versões no acervo por marca.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hero — Header Title / duplo CTA</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ BANNER DO CUPOM ============ -->
    <tr>
      <td align="center" height="50" style="height:50px;background:#000000;padding:14px 14px 15px 14px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;font-weight:400;color:#FFFFFF;">
        Use code <strong style="font-weight:700;">&lsquo;WELCOMEHERO&rsquo;</strong> for $10 off your first course
      </td>
    </tr>

    <!-- ============ HERO COM IMAGEM DE FUNDO ============ -->
    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 960px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:960px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding:36px 0 0 0;">
              <a href="URL_DO_SITE_AQUI">
                <img src="URL_DO_LOGO_AQUI" width="234" height="84" alt="NOME_DA_MARCA"
                     style="display:block;width:234px;height:84px;">
              </a>
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td align="center" class="txt-blk" style="padding:94px 22px 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:96px;line-height:96px;font-weight:700;text-transform:uppercase;color:#000000;">
              Header<br>Title
            </td>
          </tr>

          <!-- CTA 1 -->
          <tr>
            <td align="center" style="padding:304px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:304px;">
                <tr>
                  <td align="center" height="59" style="width:304px;height:59px;background:#000000;">
                    <a href="URL_DO_CTA_1_AQUI"
                       style="display:block;width:304px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">
                      CTA 1
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA 2 -->
          <tr>
            <td align="center" style="padding:36px 0 96px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:304px;">
                <tr>
                  <td align="center" height="59" style="width:304px;height:59px;background:#000000;">
                    <a href="URL_DO_CTA_2_AQUI"
                       style="display:block;width:304px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">
                      CTA 2 
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-3e241d7f"></a>

### 2.3 · welcome - hero section 2 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Promoção, Lançamento |
| **Tons compatíveis** | Premium, Aspiracional, Urgente |
| **Tags** | dark_bg, single_col, white_logo_bar, hero_image_full, bulletproof_button, mso_fallback, uppercase_headline, compliance_footer, mobile_responsive, image_top |
| **Tamanho do HTML** | 4.0 KB |
| **ID** | `3e241d7f-5f84-4017-a553-880736a450dc` |

#### Descrição curta

Abertura de e-mail de proposta de valor. A headline faz uma pergunta comparativa que posiciona a marca contra a concorrência, com o diferencial destacado em peso e cor; o CTA já carrega a oferta. Momento de uso: meio da régua de welcome ou consideração — o cliente já conhece a marca e precisa de um motivo para escolher esta e não outra.  

#### Descrição detalhada

Barra branca de 80px com o logo; abaixo, uma imagem de fundo de 567px cobrindo o resto. Headline e CTA são sobrepostos à metade inferior dessa imagem.  

Três mecanismos definem a variante:  

Macro do produto no topo, zona limpa embaixo. O produto sangra nas laterais e no topo, cortado agressivamente, e ocupa a metade superior. A metade inferior é fundo liso escuro e recebe todo o texto. É o espelho do hero de campanha, onde o sujeito fica embaixo.  

Destaque por peso e cor, nunca por tamanho. A headline é regular; 2 a 3 palavras no meio recebem bold e a cor de acento. Aumentar o corpo do trecho enfatizado quebra o ritmo da caixa alta.  

A oferta vive no botão, não na headline. A headline é argumento; o desconto aparece só no label do CTA. É o inverso do hero de campanha, onde a oferta fica numa barra e o botão é genérico.  

#### Contexto para a IA

##### Quando usar

régua de consideração, reengajamento com argumento.  
Quando o diferencial é material, acabamento ou processo e a foto pode provar isso em macro.  
Joias, relógios, calçado, moda com aviamento visível, beleza com textura, eletrônico com acabamento.  
Quando a marca tem fundo escuro saturado na identidade e uma cor de acento definida.  
Quando existe oferta ativa que cabe no botão sem virar o argumento.  

##### Quando NÃO usar

Sem macro de produto disponível. Packshot inteiro centralizado transforma a peça em catálogo.  
Foto de fundo claro ou pouco saturado — o texto branco morre e o botão some.  
Produto sem diferencial visível. Se a qualidade não aparece em close, a headline promete o que a foto não entrega.  
Marca sem cor de acento definida — o destaque da headline fica sem onde apoiar.  
Carrinho, checkout, transacional, grade de produtos, prova social.  
Quando não há oferta: sem desconto, o CTA fica genérico e a variante perde o fecho.  

##### Orientações de copy para a IA

Headline — pergunta comparativa em caixa alta, três linhas. Estrutura: por que [marca] [diferencial] mais que [categoria concorrente]? O trecho destacado é o verbo do diferencial, não o nome da marca nem a categoria. Ponto de interrogação obrigatório. Sem preço, sem percentual, sem nome de produto.  

Trecho em destaque — 2 a 3 palavras contíguas, no meio da frase, nunca no começo nem no fim. É o que a marca faz melhor, em uma ação ("SHINE HARDER", "LASTS LONGER", "FITS BETTER").  

CTA — verbo + oferta ("SHOP 10% OFF"). Aqui o desconto no botão é o padrão, não erro: a headline não pode carregá-lo.  

Proibições: headline afirmativa em vez de pergunta · destaque em mais de 3 palavras · destaque na primeira ou última palavra · desconto na headline · exclamação · segunda pergunta.  

##### Design system

Container 600px fixo, sem borda. Zero raio, zero sombra, zero gradiente aplicado por CSS. Preheader oculto obrigatório.  

Estrutura  

| # | Elemento | Altura |  
|---|---|---|  
| 1 | Barra do logo (branca, opaca) | 80px |  
| 2 | Hero — imagem de fundo full-bleed | 567px |  

Zonas internas da hero  

| Zona | Faixa | Conteúdo |  
|---|---|---|  
| Produto | 0 – 265px (topo 47%) | Macro sangrando no topo e nas laterais. Nenhum texto. |  
| Limpa | 265 – 567px (base 53%) | Fundo liso. Recebe headline e CTA. |  

Overlay  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Logo (dentro da barra) | 14px | 145 × 52px |  
| Headline | 352px | 32/36px, 3 linhas, padding lateral 58px (útil 484px) |  
| CTA | 25px | 306 × 70px |  
| Respiro final | — | 12px |  

Paleta — três cores.  

| Papel | Hex (IceCartel) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #012A61 | Fundo — pipetado da própria foto, também background-color de fallback |  |  
| Cor secundária |  |  |  
| #42B0F0 | Fundo do botão, com label branco |  |  
| Acento |  |  |  
| #FFBC49 | Exclusivo do trecho destacado da headline |  |  

Regras: a cor primária é sempre pipetada da foto (trocou a foto, trocou o token). O acento nunca aparece no botão, e a cor secundária nunca aparece no texto. Luminância do fundo abaixo de 25% — acima disso o texto branco falha.  

Pele alternativa (HTML base): CTA branco com label preto, sem cor de acento — o destaque da headline fica só no bold. Usar quando a marca não tem cor de acento definida.  

Tipografia. Principal: Arial → Helvetica nos dois slots. Headline 32px regular em caixa alta, com <strong> no trecho destacado. CTA 32px bold, caixa alta, mesmo corpo da headline. Secundária não existe: o logo é ativo de imagem e cada marca traz o seu.  

Implementação. background no <td> + background-image inline + background-size:600px 567px, background-color na cor primária como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Hack u + .body .txt-wht para travar o branco no Gmail iOS dark mode. Botão bulletproof. Barra do logo opaca e fora da imagem — com imagem bloqueada a marca continua visível sobre branco.  

Tags: PREHEADER, LOGO_URL, SITE_URL, HERO_IMAGE_URL, HEADLINE, HEADLINE_HIGHLIGHT, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: background-color diferente do azul real da foto · packshot em vez de macro · fundo claro ou pouco saturado · destaque em mais de 3 palavras · aumentar o corpo do trecho destacado em vez do peso · usar o acento no botão · headline em caixa baixa ou em 4+ linhas · selo de desconto sobre a foto · segundo botão · botão com raio ou com a largura da caixa de texto.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 1,06:1 — 600 × 567px de exibição, ativo final 1200 × 1134px (2x). JPG q80 ou WebP, < 220 KB, full-bleed. Geradores não aceitam essa razão: gere em 1:1 a 1200 × 1200 e corte 66px de altura pelo topo — o produto já sangra ali, e a base precisa ficar intacta.  

Regra crítica: a metade inferior (265–567px) tem que estar completamente livre de produto, sem brilho especular e sem sombra dura. É onde a headline e o botão assentam.  

Composição. Macro extremo do produto, cortado nas laterais e no topo, preenchendo a metade superior em arco diagonal. Nada centralizado, nada com respiro em volta. Profundidade de campo rasa.  

Cenário e luz. Fundo monocromático escuro e saturado, com textura sutil de veludo ou tecido — nunca chapado digital. Luz dirigida no produto com brilho especular forte, caindo rápido em direção à base do quadro. Sem vinheta.  

Produto. Detalhe que prova o diferencial: elos, cravação, engate, costura, textura. Marca d'água ou repetição de logo no fundo é aceitável se ficar fora da faixa central inferior.  

Proibições: packshot centralizado · fundo branco ou claro · fundo chapado sem textura · produto na metade inferior · brilho ou sombra dura na zona limpa · texto/preço/selo queimado · pessoa no quadro · colagem ou split.  

Adaptação por categoria — o que é o macro:  

| Categoria | Detalhe |  
|---|---|  
| Joia | Elos da corrente, cravação, engate |  
| Relógio | Mostrador, bisel, malha |  
| Moda | Trama do tecido, costura, zíper, aviamento |  
| Beleza | Textura do produto, gota, creme, aplicador |  
| Eletrônico | Acabamento, porta, grafia, junção de materiais |  
| Calçado | Costura, sola, textura do couro |  

#### Schema de output (4 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `headline` | `{{HEADLINE}}` | Texto curto | Copy (n8n) | não | 84 | não |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 14 | não |
| `hero_macro_produto` | `{{HERO_MACRO_PRODUTO}}` | Imagem | Imagem gerada | não | — | — |
| `brand_logo` | `{{BRAND_LOGO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`headline`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    - *Orientação:* 84 (3 linhas de 28)<br>Caixa alta, pergunta, interrogação obrigatória
- **`cta_label`**
    - *Exemplo:* SHOP 10% OFF
    - *Orientação:* Caixa alta, verbo + oferta
- **`hero_macro_produto`**
    - *Orientação:* Onde fica: fundo de toda a hero, abaixo da barra branca do logo; headline e CTA são sobrepostos à metade inferior.<br>Nome do ativo: hero_macro_[produto]_[marca].jpg
    - *Imagem:* proporção 1,06:1 · 600 × 567 px
    - *Spec da imagem:* Ideia: macro extremo do produto sangrando nas laterais e no topo, preenchendo a metade superior em arco diagonal, sobre fundo monocromático escuro e saturado com textura sutil. Metade inferior completamente vazia, sem brilho nem sombra, para receber headline e botão. Luz dirigida com brilho especular no produto, caindo em direção à base.
- **`brand_logo`**
    - *Orientação:* Onde fica: barra branca de 80px no topo, centralizado, 14px de respiro em cima e embaixo.<br>Nome do ativo: logo_[marca]_escuro.png
    - *Imagem:* 145 × 52 px
    - *Spec da imagem:* Ideia: wordmark em versão escura de uma cor, sobre branco. O ativo se ajusta dentro da caixa mantendo a proporção original — wordmarks horizontais ocupam mais largura e menos altura.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hero — Dark gradient / Shop 10% Off</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* trava o texto branco sobre a imagem no dark mode */
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ BARRA DO LOGO (branca, opaca) ============ -->
    <tr>
      <td align="center" height="80" style="height:80px;background:#FFFFFF;padding:14px 0;">
        <a href="URL_DO_SITE_AQUI">
          <img src="URL_DO_LOGO_AQUI" width="145" height="52" alt="NOME_DA_MARCA"
               style="display:block;width:145px;height:52px;">
        </a>
      </td>
    </tr>

    <!-- ============ HERO COM IMAGEM DE FUNDO ============ -->
    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#000000;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:600px 567px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:567px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#000000" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">

          <!-- HEADLINE -->
          <tr>
            <td align="center" class="txt-wht" style="padding:352px 58px 0 58px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:36px;font-weight:400;text-transform:uppercase;color:#FFFFFF;">
              Lorem ipsum dolor sit amet, consectetur <strong style="font-weight:700;">adipiscing elit.</strong>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:25px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:306px;">
                <tr>
                  <td align="center" height="70" style="width:306px;height:70px;background:#FFFFFF;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:306px;height:70px;line-height:70px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">
                      Shop 10% Off
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- RESPIRO INFERIOR -->
          <tr>
            <td height="12" style="height:12px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-d9e34a1f"></a>

### 2.4 · welcome - hero section 3 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Promoção |
| **Tons compatíveis** | Premium, Amigável, Aspiracional |
| **Tags** | light_bg, single_col, bordered_container, boxed_logo, uppercase_headline, headline_slot, body_copy, hero_image_middle, text_image_cta_sandwich, bulletproof_button, mso_fallback, blue_match_hero, mobile_responsive, no_footer |
| **Tamanho do HTML** | 4.5 KB |
| **ID** | `d9e34a1f-7bc7-47e8-9081-53600b104dd2` |

#### Descrição curta

Primeiro e-mail da régua de boas-vindas. Entrega o cupom de captação e apresenta a marca; a headline é a oferta, o código aparece em texto e o CTA repete o valor. Momento de uso: welcome #1, logo após o opt-in, quando o contato ainda não comprou e o objetivo é a primeira conversão.  

#### Descrição detalhada

Uma imagem única de 949px cobre o e-mail inteiro. Lockup de marca, headline, linha do cupom e CTA são sobrepostos ao terço superior dessa imagem. Não há barra de logo, não há bloco de cor, não há emenda.  

Três mecanismos definem a variante:  

O fundo do texto é a área desfocada da própria foto. O terço superior da fotografia é fora de foco e uniforme; é ele que faz as vezes de bloco de cor. Trocar por um bloco chapado cria emenda visível.  

Headline em dois pesos na mesma família. Linha 1 em regular, linha 2 em bold, mesmo corpo e mesmo tracking negativo. A hierarquia vem do peso, não de tamanho nem de cor.  

O código do cupom não tem contêiner. Sem caixa, sem borda tracejada, sem cor própria — só bold dentro da linha de instrução. O destaque vem do respiro em volta.  

#### Contexto para a IA

##### Quando usar

em qualquer nicho com fotografia de produto própria.  
Beleza, skincare, joia, acessório, casa — categorias em que o flat-lay comunica o kit inteiro.  
Quando a marca não tem logo em arquivo ou prefere lockup tipográfico: o slot do topo aceita wordmark em texto vivo.  
Quando existe uma foto com região desfocada ou lisa no terço superior.  
Quando o desconto é o argumento central e não há necessidade de brand story no mesmo bloco.  

##### Quando NÃO usar

Sem cupom. A variante inteira gira em torno do código; sem ele, a headline e o CTA ficam vazios.  
Foto sem área desfocada ou lisa no topo — o texto cai em cima de detalhe e some.  
Marca de luxo que não desconta — headline de percentual descaracteriza posicionamento.  
Carrinho, checkout, browse, transacional.  
Campanha sazonal ou lançamento — não há onde acomodar tema nem urgência.  
Quando a marca precisa de identidade visual forte no topo e só tem logo em imagem de baixa resolução.  

##### Orientações de copy para a IA

Eyebrow + nome da marca — lockup de duas linhas: uma saudação curta em cima ("Welcome To") e o nome da marca embaixo, com régua de 1px na largura exata do nome. Leitura contínua entre as duas linhas.  

Headline — a oferta em duas linhas: linha 1 abre com o valor, linha 2 diz a que se aplica. Linha 2 em bold. Sem ponto final. Não repetir o nome da marca.  

Linha do cupom — instrução com o código em bold no meio, seguida de uma segunda linha curta com a condição ("at checkout" / "no checkout"). O código nunca ocupa linha própria com destaque gráfico.  

CTA — verbo + o valor da oferta, caixa alta com tracking largo. Repetir o percentual aqui é o padrão: o botão fecha o que a headline abriu.  

Proibições: contagem regressiva · exclamação · brand story dentro do bloco · segundo botão · código em caixa tracejada · headline em uma linha só · nome de produto na headline.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente. Preheader oculto obrigatório.  

Estrutura — elemento único: hero como imagem de fundo, 598 × 949px.  

Zonas internas  

| Zona | Faixa | Conteúdo |  
|---|---|---|  
| Limpa | 0 – 480px (topo 51%) | Área desfocada da foto. Recebe todo o overlay. |  
| Produto | 480 – 949px (base 49%) | Flat-lay em foco. Nenhum elemento sobreposto. |  

Overlay  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Lockup de marca | 75px | 152 × 48px |  
| Headline (2 linhas) | 31px | 50/57px, tracking −0.06em, padding lateral 24px |  
| Linha do cupom | 34px | 25/30px, padding lateral 58px |  
| CTA | 43px | 389 × 75px |  
| Área livre do produto | — | 469px |  

Paleta — duas cores.  

| Papel | Hex (London Brow) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #D2BBA7 | Fundo — vem da foto, não de CSS |  |  
| Cor secundária |  |  |  
| #130E31 | Todo o texto, a régua do lockup e o fundo do botão |  |  

A cor primária é pipetada da faixa desfocada da foto e usada como background-color de fallback. Trocou a foto, trocou o token. A secundária é uma só e faz tudo: lockup, régua, headline, cupom e preenchimento do botão. Não existe cor de acento — o destaque vem de peso tipográfico.  

Pele alternativa (HTML base): fundo branco, texto e botão pretos, lockup dentro de caixa com borda de 1px. Usar quando a foto tem topo claro neutro.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Headline 50/57px com tracking −0.06em, linha 1 regular e linha 2 em <strong>. Cupom 25/30px regular com o código em <strong>. CTA 25px regular, caixa alta, tracking +0.15em com text-indent compensando. Secundária: se a loja tem serif display de marca, ela entra apenas na headline e no nome da marca — é o que a London Brow faz.  

Implementação. background no <td> + background-image inline + background-size:598px 949px, background-color na cor primária como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Hack u + .body .txt-blk para o Gmail iOS. Botão bulletproof. Com imagem bloqueada, o texto continua legível sobre a cor primária de fallback — por isso o bgcolor é obrigatório e não opcional.  

Tags: PREHEADER, HERO_IMAGE_URL, BRAND_NAME, WELCOME_EYEBROW, HEADLINE_L1, HEADLINE_L2, COUPON_CODE, COUPON_HINT, OFFER_VALUE, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: bloco de cor chapado em vez do topo desfocado da foto · background-color diferente da faixa desfocada · objeto em foco na zona limpa · código do cupom em caixa ou com cor própria · régua mais larga ou mais estreita que o nome da marca · headline em uma linha · terceira cor · segundo botão · botão com raio · tracking positivo na headline.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 2:3 — slot de 598 × 949px, ativo final 1196 × 1898px (2x). JPG q80 ou WebP, < 300 KB, full-bleed. Gerar em 2:3 na altura de 1898px (1265 × 1898) e cortar 69px de largura, 35px de cada lado, para chegar ao ativo final.  

Regra crítica: o terço superior (0–480px) tem que estar fora de foco e uniforme, numa cor só. É esse desfoque que faz as vezes de bloco de cor e apaga a emenda. Qualquer objeto nítido ali expõe o corte e derruba a legibilidade do texto.  

Composição. Flat-lay em ângulo alto — não perpendicular — com o kit de produtos espalhado na metade inferior. Itens em diagonal, sobrepostos parcialmente, alguns cortados pelas bordas laterais e pela base. O foco cai da metade para baixo; a transição de desfoque é gradual, não uma linha.  

Cenário e luz. Superfície têxtil ou de couro em tom neutro quente, com textura visível. Luz natural difusa lateral, sombras longas e macias. Paleta monocromática quente — a foto define a cor da peça inteira.  

Produto. Kit completo, não produto único: sachês, aplicadores, frascos, ferramentas. Rótulos legíveis nos itens em foco. Nenhuma mão, nenhuma pessoa.  

Proibições: topo nítido · fundo branco de estúdio · flat-lay perpendicular e simétrico · produto único · texto/preço/selo queimado · pessoa ou mão · sombra dura · vinheta.  

Adaptação por categoria — o que compõe o flat-lay:  

| Categoria | Itens |  
|---|---|  
| Beleza / skincare | Sachês, frascos, pincéis, pinça, aplicadores |  
| Joia / acessório | Peças soltas, estojo aberto, flanela, cartão |  
| Casa | Têxteis dobrados, velas, utensílio, embalagem |  
| Moda | Peça dobrada, cinto, óculos, etiqueta |  
| Papelaria / kit | Cadernos, canetas, adesivos, envelope |  
| Pet | Sachês, brinquedo, coleira, escova |  

#### Schema de output (7 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `welcome_eyebrow` | `{{WELCOME_EYEBROW}}` | Texto curto | Copy (n8n) _(auto)_ | não | 16 | sim |
| `logo` | `{{LOGO}}` | Texto curto | Copy (n8n) _(auto)_ | não | 22 | sim |
| `headline_l1` | `{{HEADLINE_L1}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `headline_l2` | `{{HEADLINE_L2}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `coupon_line` | `{{COUPON_LINE}}` | Texto curto | Copy (n8n) | não | 48 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | não |
| `hero_flatlay_kit` | `{{HERO_FLATLAY_KIT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`welcome_eyebrow`**
    - *Exemplo:* TEXTO_DE_PREHEADER_AQUI
    - *Orientação:* Saudação curta, caixa mista<br>Ex - Welcome To
- **`logo`**
    - *Exemplo:* LOGO HERE
    - *Orientação:* Nome da marca, com régua de 1px na largura exata<br>Ex - 	London Brow Company
- **`headline_l1`**
    - *Exemplo:* Lorem ipsum
    - *Orientação:* Abre com o valor da oferta, peso regular<br>Ex - Here's 10% OFF
- **`headline_l2`**
    - *Exemplo:* dolor sit amet
    - *Orientação:* Diz a que se aplica, peso bold, sem ponto final<br>Ex - Your Next Purchase
- **`coupon_line`**
    - *Exemplo:* Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.
    - *Orientação:* Instrução com o código em bold, sem contêiner<br>Ex - Use code: WELCOME-5F3K at checkout - dividido em duas linhas
- **`cta_label`**
    - *Exemplo:* SHOP XXXX% OFF
    - *Orientação:* Caixa alta, verbo + valor da oferta<br>Ex -	SHOP 10% OFF
- **`hero_flatlay_kit`**
    - *Orientação:* Onde fica: fundo de todo o e-mail; lockup, headline, linha do cupom e CTA são sobrepostos ao terço superior.
    - *Imagem:* proporção 2:3 · 598 × 949 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 598 × 949px. Ativo final 1196 × 1898px (2x), JPG q80 ou WebP, < 300 KB. Gerar em 2:3 na altura de 1898px (1265 × 1898) e cortar 69px de largura para chegar a 1196 × 1898.<br>Ideia: flat-lay em ângulo alto do kit completo, espalhado em diagonal na metade inferior sobre superfície têxtil neutra e quente, itens sobrepostos e cortados pelas bordas. O terço superior é totalmente fora de foco, numa cor uniforme, funcionando como bloco de cor para o texto. Luz natural difusa lateral, sombras longas e macias, paleta monocromática quente.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Email 1 — Welcome + coupon code</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 949px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:949px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding:75px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:152px;">
                <tr>
                  <td align="center" height="48" style="width:152px;height:48px;background:#FFFFFF;border:1px solid #000000;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
                    LOGO HERE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- HEADLINE: linha leve + linha bold -->
          <tr>
            <td align="center" class="txt-blk" style="padding:31px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:57px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
              Lorem ipsum<br>
              <strong style="font-weight:700;">dolor sit amet</strong>
            </td>
          </tr>

          <!-- DESCRIÇÃO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:34px 58px 0 58px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:30px;font-weight:400;color:#000000;">
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:43px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:389px;">
                <tr>
                  <td align="center" height="75" style="width:389px;height:75px;background:#000000;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:389px;height:75px;line-height:75px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:400;letter-spacing:0.15em;text-indent:0.15em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      Shop XXXX% Off
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ÁREA LIVRE PARA O PRODUTO APARECER NA IMAGEM DE FUNDO -->
          <tr>
            <td height="469" style="height:469px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-e447ef06"></a>

### 2.5 · welcome - hero section 4 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, single_col, bordered_container, boxed_logo, welcome_headline, discount_offer, coupon_code, bulletproof_button, mso_fallback, hero_image_bottom, torn_paper_effect, uppercase_button, mobile_responsive, no_footer |
| **Tamanho do HTML** | 5.1 KB |
| **ID** | `e447ef06-95e2-4c5d-9b6f-c3e0b895f8d2` |

#### Descrição curta

Primeiro e-mail da régua de boas-vindas em registro editorial de moda. Acolhe o contato como membro de um grupo, entrega o cupom e apresenta a marca por meio de fotografia de campanha. Momento de uso: welcome #1 de marca com identidade visual forte, logo após o opt-in, quando o argumento é pertencimento e não desconto puro.  

#### Descrição detalhada

Uma imagem única de 1150px cobre o e-mail inteiro. Wordmark, lockup, tagline, linha do cupom, código e CTA são sobrepostos aos 43% superiores dessa imagem. Não há barra de logo, não há bloco de cor, não há emenda.  

Quatro mecanismos definem a variante:  

O lockup são duas linhas de famílias diferentes com sobreposição vertical. Um script caligráfico por cima de uma serif display, com as caixas se cruzando. É o elemento de identidade da peça e precisa ser entregue como PNG transparente ou queimado na foto — script não sobrevive a texto vivo em cliente de e-mail.  

Três famílias tipográficas com territórios rígidos. Script para a saudação, serif display para marca e nome do grupo, sans para tudo que é instrução. Nenhuma família invade o território da outra.  

A cor de acento vem do guarda-roupa da cena. O botão e o trecho destacado da linha do cupom usam a mesma cor da roupa da modelo. É o que amarra foto e interface.  

O código do cupom não tem contêiner. Sem caixa, sem borda, sem cor própria — só bold e o respiro em volta.  

#### Contexto para a IA

##### Quando usar

marca com identidade visual forte e fotografia de campanha própria.  
Moda, beachwear, resort, lingerie, joia — categorias em que a foto de campanha carrega o posicionamento.  
Quando a marca tem script ou serif display de identidade que justifica o lockup.  
Quando a cena de campanha tem guarda-roupa em cor definida que pode virar o acento da interface.  
Quando o argumento é pertencimento a um grupo ("família", "clube", "círculo") e não só o percentual.  

##### Quando NÃO usar

Sem identidade tipográfica própria. Sem script + serif display, o lockup não se sustenta — use o welcome de fundo fotográfico simples.  
Sem foto de campanha. Banco de imagem em 598 × 1150 denuncia a marca.  
Sem cupom — a estrutura tem três slots dedicados à oferta.  
Carrinho, checkout, browse, transacional, catálogo.  
Campanha de urgência — o registro editorial não comporta prazo.  
Quando o lockup teria que ser texto vivo por restrição de produção.  

##### Orientações de copy para a IA

Wordmark — nome da marca, ativo de imagem ou texto vivo conforme a marca.  

Lockup — uma frase única quebrada entre duas famílias. Linha 1 em script é a saudação; linha 2 em serif é o nome do grupo. As duas nunca são frases independentes — a leitura tem que ser contínua ("welcome to the" + "royal family").  

Tagline — posicionamento em uma frase completa, com ponto final. É o elemento mais largo da peça.  

Linha do cupom — instrução com o valor da oferta em bold e na cor de acento, no meio da frase. O código vem na linha seguinte, isolado, em bold, sem caixa e sem cor própria.  

CTA — verbo genérico em caixa alta com tracking largo. Não repetir o desconto: ele já foi dito na linha do cupom.  

Tom: aspiracional e acolhedor, posicionando o cliente como membro. Sem urgência, sem exclamação, sem contagem regressiva.  

Proibições: lockup com duas frases independentes · desconto no botão · código em caixa · segunda oferta · exclamação · tagline em duas linhas (empurra o botão para dentro da zona do sujeito).  

##### Design system

6. Design system  

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente. Preheader oculto obrigatório.  

Estrutura — elemento único: hero como imagem de fundo, 598 × 1150px.  

Zonas internas  

| Zona | Faixa | Conteúdo |  
|---|---|---|  
| Limpa | 0 – 489px (topo 43%) | Superfície lisa da foto. Recebe todo o overlay. |  
| Sujeito | 489 – 1150px (base 57%) | Modelos e cenário. Nenhum elemento sobreposto. |  

Overlay  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Wordmark | 27px | 152 × 48px |  
| Lockup (2 linhas sobrepostas) | 52px | 50/57px, tracking −0.06em, padding lateral 24px |  
| Tagline | 52px | 22/27px, padding lateral 30px |  
| Linha do cupom | 20px | 22/27px |  
| Código | 15px | 22/27px, bold |  
| CTA | 26px | 311 × 54px |  
| Área livre do sujeito | — | 661px |  

Paleta — três cores.  

| Papel | Hex (Royal Codes) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #997754 | Fundo — vem da foto, não de CSS |  |  
| Cor secundária |  |  |  
| #FFFFFF | Wordmark, lockup, tagline, linha do cupom, código, label do botão |  |  
| Acento |  |  |  
| #5C1725 | Fundo do botão e o valor da oferta dentro da linha do cupom |  |  

Regras: a primária é pipetada da parede da foto e entra como background-color de fallback. O acento é retirado do guarda-roupa da cena — é regra obrigatória no briefing de imagem, porque é o detalhe que um fotógrafo nunca adivinha. Não existe quarta cor.  

Pele alternativa (HTML base): fundo branco, texto e botão pretos, wordmark em caixa com borda de 1px, sem cor de acento. Usar quando a marca não tem cena de campanha com cor definida.  

Tipografia — três famílias com territórios rígidos.  

Principal: sans geométrica (perfil Montserrat), fallback Arial → Helvetica. Cobre tagline, linha do cupom, código e label do botão — 4 dos 6 blocos.  
Secundária: serif display de alto contraste (perfil Playfair). Só o wordmark e a linha 2 do lockup.  
Terciária: script caligráfico. Uso único: linha 1 do lockup.  

Script dá o tom, serif dá a marca, sans dá as instruções. As duas linhas do lockup se sobrepõem em ~27px; ambas centralizadas, mas o eixo óptico do script cai um pouco à direita pela inclinação natural da caligrafia — não forçar alinhamento matemático. CTA 18px com tracking +0.25em e text-indent compensando.  

Implementação. background no <td> + background-image inline + background-size:598px 1150px, background-color na cor primária como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. O lockup entra como PNG transparente sobreposto ou queimado na foto. Tagline, linha do cupom, código e botão ficam vivos em HTML. O valor da oferta é um <span> na cor de acento com font-weight:700. Botão bulletproof. Com imagem bloqueada a peça perde o lockup — o alt deve carregar a frase de acolhimento.  

Tags: PREHEADER, HERO_IMAGE_URL, BRAND_NAME, LOCKUP_IMAGE_URL, HERO_TAGLINE, OFFER_VALUE, COUPON_CODE, CTA_LABEL, CTA_URL. O lockup não tem tag de texto — é ativo de imagem. Se precisar variar por loja, vira etapa de design, não de merge.  

Erros que quebram o padrão: separar script e serif sem sobreposição · renderizar o script como texto vivo · barra de logotipo acima do wordmark · sujeito invadindo a zona limpa · guarda-roupa fora da paleta de acento · código em caixa tracejada · repetir o desconto no botão · quarta cor · botão com raio ou com a largura da caixa de texto · overlay escuro sobre a foto.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 9:16 — slot de 598 × 1150px, ativo final 1196 × 2300px (2x). JPG q80 ou WebP, < 320 KB, full-bleed. Gerar em 9:16 na altura de 2300px (1294 × 2300) e cortar 98px de largura, 49px de cada lado, para chegar ao ativo final.  

Regra crítica: os 43% superiores têm que ser uma superfície lisa e uniforme — parede, céu, areia ao longe. É ela que recebe wordmark, lockup, tagline, cupom e botão. Nenhum objeto, nenhuma sombra dura, nenhuma variação de cor forte nessa faixa.  

Regra obrigatória de produção: o guarda-roupa da cena tem que estar na cor de acento da interface. Botão e destaque do cupom são pipetados do look. Sem isso, a peça se desmonta em duas metades que não conversam.  

Composição. Duas figuras ou uma, ocupando a base do quadro, em corpo parcial — cortadas pela borda inferior. Pose relaxada, olhar para a câmera. Elemento vegetal ou arquitetônico entrando por um canto inferior. Sombra projetada nas laterais da metade inferior.  

Cenário e luz. Parede lisa em tom neutro quente ocupando o topo; superfície clara na base (areia, piso, tecido). Luz natural quente, contraste médio, sem estourar as altas na zona do texto. Paleta monocromática quente, com o guarda-roupa sendo o único ponto de cor saturada.  

Proibições: objeto ou textura forte na zona limpa · sujeito subindo acima de 43% · fundo de estúdio · guarda-roupa fora da paleta de acento · texto/preço/selo queimado (exceto o lockup, quando queimado por decisão de produção) · overlay ou vinheta · marca d'água.  

Adaptação por categoria — o que é a cena:  

| Categoria | Cena |  
|---|---|  
| Moda / resort | Duplas em look de coleção, parede e areia |  
| Beachwear | Corpo parcial, piscina ou duna ao fundo |  
| Lingerie | Interior de tom quente, luz de janela |  
| Joia | Busto e mãos em cena de lifestyle, parede lisa |  
| Beleza | Retrato de meio corpo, fundo de parede texturizada |  
| Casa | Ambiente vivido com pessoa em uso, parede lisa acima |  

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `brand_logo` | `{{BRAND_LOGO}}` | Texto curto | Copy (n8n) | não | 60 | sim |
| `lockup_l1` | `{{LOCKUP_L1}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `lockup_l2` | `{{LOCKUP_L2}}` | Texto curto | Copy (n8n) | não | 16 | não |
| `hero_tagline` | `{{HERO_TAGLINE}}` | Texto curto | Copy (n8n) | não | 48 | sim |
| `coupon_line` | `{{COUPON_LINE}}` | Texto curto | Copy (n8n) | não | 52 | sim |
| `coupon_code` | `{{COUPON_CODE}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 12 | não |
| `hero_campanha_editorial` | `{{HERO_CAMPANHA_EDITORIAL}}` | Imagem | Imagem gerada | não | — | — |
| `brand_lockup` | `{{BRAND_LOCKUP}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`brand_logo`**
    - *Exemplo:* LOGO HERE
    - *Orientação:* Wordmark no topo
- **`lockup_l1`**
    - *Exemplo:* Welcome to
    - *Orientação:* Script, minúscula, saudação — ativo de imagem
- **`lockup_l2`**
    - *Exemplo:* (Brand’s name)
    - *Orientação:* Serif display, nome do grupo — ativo de imagem
- **`hero_tagline`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit,
    - *Orientação:* Uma linha, frase completa com ponto final
- **`coupon_line`**
    - *Exemplo:* Enjoy % off your first order using the code:
    - *Orientação:* Valor da oferta em bold e na cor de acento
- **`coupon_code`**
    - *Exemplo:* CODE
    - *Orientação:* Caixa alta, bold, sem contêiner
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo genérico, sem desconto
- **`hero_campanha_editorial`**
    - *Orientação:* Onde fica: fundo de todo o e-mail; wordmark, lockup, tagline, cupom e CTA são sobrepostos aos 43% superiores.<br>Nome do ativo: hero_campanha_[marca]_welcome.jpg
    - *Imagem:* proporção 9:16 · 598 × 1150 px
    - *Spec da imagem:* Proporção: 9:16. Slot de 598 × 1150px. Ativo final 1196 × 2300px (2x), JPG q80 ou WebP, < 320 KB. Gerar em 9:16 na altura de 2300px (1294 × 2300) e cortar 98px de largura para chegar a 1196 × 2300.<br>Ideia: cena de campanha editorial com uma ou duas figuras em corpo parcial ocupando a base do quadro, cortadas pela borda inferior, guarda-roupa na cor de acento da interface. Parede lisa em tom neutro quente ocupando os 43% superiores, sem objeto nem sombra dura, para receber todo o overlay. Elemento vegetal ou arquitetônico entrando por um canto inferior, sombras projetadas nas laterais da metade inferior, luz natural quente.
- **`brand_lockup`**
    - *Orientação:* Onde fica: logo abaixo do wordmark, centralizado; ocupa a largura útil da caixa de texto.<br>Nome do ativo: lockup_[marca]_[claro\|escuro].png
    - *Imagem:* 550 × 114 px
    - *Spec da imagem:* Proporção: caixa de 550 × 114px. Ativo final 1100 × 228px (2x), PNG transparente.<br>Ideia: duas linhas de texto em famílias diferentes com sobreposição vertical de ~27px — script caligráfico por cima, serif display por baixo — formando uma frase contínua. Entregue como PNG transparente porque o script não sobrevive a texto vivo em cliente de e-mail. Duas versões por marca, clara e escura.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Welcome + Discount — Template</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 1150px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:1150px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding:27px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:152px;">
                <tr>
                  <td align="center" height="48" style="width:152px;height:48px;background:#FFFFFF;border:1px solid #000000;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
                    LOGO HERE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- WELCOME + BRAND NAME -->
          <tr>
            <td align="center" class="txt-blk" style="padding:52px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:57px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
              Welcome to<br>
              <strong style="font-weight:700;">(Brand&rsquo;s name)</strong>
            </td>
          </tr>

          <!-- DESCRIÇÃO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:52px 30px 0 30px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit,
            </td>
          </tr>

          <!-- MENSAGEM DO DESCONTO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:20px 30px 0 30px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;">
              Enjoy % off your first order using the code:
            </td>
          </tr>

          <!-- CÓDIGO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:15px 30px 0 30px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:700;color:#000000;">
              CODE
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:26px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:311px;">
                <tr>
                  <td align="center" height="54" style="width:311px;height:54px;background:#000000;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:311px;height:54px;line-height:54px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:0.25em;text-indent:0.25em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      Shop Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ÁREA LIVRE PARA A IMAGEM DE FUNDO E O PAPEL RASGADO -->
          <tr>
            <td height="661" style="height:661px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-8858709f"></a>

### 2.6 · welcome - hero section 5 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, single_col, bordered_container, boxed_logo, coupon_bar, discount_offer, coupon_pill, welcome_headline, pill_button, hero_image_rounded, four_content_sections, repeatable_blocks, square_section_images, uppercase_titles, highlight_card, gray_card, final_cta, footer_menu, menu_buttons, visit_website_button, compliance_footer, copyright_line, mso_fallback, mobile_responsive |
| **Tamanho do HTML** | 7.4 KB |
| **ID** | `8858709f-ef36-45d8-98f4-7d8711628cba` |

#### Descrição curta

foco no resgate do cupom. O código aparece três vezes — barra do topo, pílula na linha da oferta e label do CTA — e a foto lifestyle entra na base como prova de uso. Momento de uso: welcome #1 de marca de volume ou ticket baixo, logo após o opt-in, quando o objetivo é conversão imediata e não construção de marca.  

#### Descrição detalhada

Barra de cupom de 69px no topo; abaixo, um bloco de 1217px cujo fundo é um ativo composto — faixa de cor chapada na parte superior e fotografia lifestyle na base. Logo, headline, descrição, linha do cupom e CTA são sobrepostos à faixa chapada.  

Quatro mecanismos definem a variante:  

Cantos arredondados em tudo. Pílula do código com raio de 50px, CTA com raio de 50px, imagem principal com raio de 55px. É a única variante do arsenal com raio — misturar com blocos de cantos vivos no mesmo e-mail quebra a peça.  

O código do cupom vive dentro de uma pílula sólida. Contêiner com fundo próprio e contraste invertido, ao lado do rótulo "Use code". É o inverso das variantes editoriais, onde o código não tem contêiner nenhum.  

O cupom se repete três vezes. Barra, pílula e CTA. A redundância é deliberada: quem escaneia pega o código em qualquer altura da peça.  

A foto entra por baixo do texto, dentro do mesmo ativo de fundo. A faixa chapada superior e a fotografia formam um arquivo só — não há emenda porque não há dois elementos.  

#### Contexto para a IA

##### Quando usar

Email com cupom, em marca de volume, ticket baixo ou compra por impulso.  
Alimentos e bebidas, suplementos, pet, brinquedos, casa, moda casual.  
Quando o código é longo ou personalizado e precisa de contêiner para ser lido.  
Quando a marca tem identidade descontraída que comporta pílulas e cor saturada.  
Quando existe foto lifestyle com pessoa usando ou consumindo o produto.  

##### Quando NÃO usar

Marca premium ou editorial. Raio de 50px, cor saturada e cupom repetido três vezes derrubam o posicionamento.  
Sem cupom — a estrutura inteira gira em torno do código.  
No mesmo e-mail que blocos de cantos vivos — a mistura de raio e canto reto na mesma peça denuncia montagem.  
Carrinho, checkout, browse, transacional.  
Campanha sazonal ou lançamento — não há slot para tema.  
Quando a única foto disponível é packshot ou flat-lay: a variante pede pessoa em cena.  

##### Orientações de copy para a IA

Barra do topo — instrução com o código e o valor da oferta na mesma linha. É a primeira leitura da peça e tem que ser autossuficiente.  

Headline — duas linhas: linha 1 é a saudação curta, linha 2 é o nome do grupo ou da comunidade em caixa alta. Leitura contínua entre as duas ("Welcome" + "TO THE FLAVOR CLUB"). Sem ponto final.  

Descrição — duas a três linhas explicando o que o contato ganhou ao entrar, com o valor da oferta em bold. Tom de conversa, primeira pessoa do plural aceitável.  

Linha do cupom — rótulo curto ("Use code") + o código dentro da pílula. O rótulo nunca entra na pílula.  

CTA — verbo + valor da oferta. Aqui repetir o desconto no botão é o padrão: é o terceiro reforço e o fecho da peça.  

Proibições: contagem regressiva · exclamação em mais de um slot · brand story longa · segundo botão · código fora da pílula · headline em uma linha só.  

##### Design system

6. Design system  

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Preheader oculto obrigatório. Raio de 50px em pílulas e CTA, 55px na imagem principal — esta variante é a exceção à regra de cantos vivos do arsenal.  

Estrutura  

| # | Elemento | Altura |  
|---|---|---|  
| 1 | Barra do cupom | 69px, cor sólida |  
| 2 | Corpo com ativo de fundo composto | 1217px |  

Zonas internas do corpo  

| Zona | Faixa | Conteúdo |  
|---|---|---|  
| Chapada | 0 – 585px (topo 48%) | Cor sólida dentro do ativo. Recebe todo o overlay. |  
| Fotografia | 585 – 1217px (base 52%) | Cena lifestyle. Nenhum elemento sobreposto. |  

Overlay  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Logo | 57px | 152 × 48px |  
| Headline (2 linhas) | 57px | 50/57px, tracking −0.06em, padding lateral 24px |  
| Descrição | 34px | 25/30px, 2 linhas, padding lateral 58px |  
| Linha do cupom | 33px | Rótulo + gap de 24px + pílula 165 × 50px |  
| CTA | 43px | 523 × 78px |  
| Imagem principal | 70px | 534 × 534px, raio 55px |  

Paleta — três cores.  

| Papel | Hex (Cuso's) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #000000 | Fundo da faixa chapada e do bloco de texto |  |  
| Cor secundária |  |  |  
| #CBB995 | Fundo da barra do topo e da pílula do código |  |  
| Acento |  |  |  
| #B9250B | Fundo do CTA e da pílula do código dentro da barra |  |  

Regras: a secundária e o acento nunca trocam de lugar — a secundária é sempre o contêiner passivo (barra, pílula no corpo) e o acento é sempre o elemento clicável ou o destaque na barra. O texto sobre a primária é branco; sobre a secundária, na cor primária; sobre o acento, branco.  

Pele alternativa (HTML base): faixa chapada branca, texto e pílulas pretos, barra   
#393737. Usar quando a marca não tem cor de acento saturada.  

Tipografia — três famílias.  

Principal: sans, fallback Arial → Helvetica. Cobre barra, linha 2 da headline, linha do cupom e CTA.  
Secundária: script pesado. Logo e linha 1 da headline.  
Terciária: serif. Descrição e código — opcional; a pele do HTML base usa a sans em todos os slots.  

Implementação. background no <td> + background-image inline + background-size:598px 1217px, background-color na cor primária como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Pílula e CTA exigem v:roundrect com arcsize="50%" no bloco condicional MSO — sem isso o Outlook renderiza retângulo. border-radius na <img> não funciona em Outlook; a imagem principal precisa ser exportada com os cantos já arredondados e background:#ABABAB como fallback. Hack u + .body .txt-blk para o Gmail iOS.  

Tags: PREHEADER, BANNER_TEXT, COUPON_CODE, OFFER_VALUE, LOGO_URL, HEADLINE_L1, HEADLINE_L2, HERO_DESCRIPTION, COUPON_LABEL, CTA_LABEL, CTA_URL, HERO_IMAGE_URL, MAIN_IMAGE_URL, MAIN_IMAGE_ALT.  

Erros que quebram o padrão: misturar cantos vivos e arredondados no mesmo e-mail · pílula sem v:roundrect no MSO · border-radius só via CSS na imagem · rótulo "Use code" dentro da pílula · trocar acento e secundária de papel · quarta cor · segundo botão · omitir o desconto do CTA (é o terceiro reforço) · emenda visível entre a faixa chapada e a foto.  

##### Direção fotográfica

Proporção 1:1 — slot de 598 × 632px na base do ativo de fundo, ativo final 1196 × 1264px (2x). JPG q80 ou WebP, < 280 KB. Gerar em 1:1 a 1264 × 1264 e cortar 68px de largura, 34px de cada lado, para chegar ao ativo final.  

Montagem: a fotografia é composta sob uma faixa chapada de 585px na cor primária para formar o ativo de fundo de 598 × 1217px. A transição entre faixa e foto é um corte reto, sem degradê — a foto tem que começar com uma linha visualmente calma para o corte não chamar atenção.  

Regra crítica: a foto não recebe nenhum texto. Toda a legibilidade está resolvida na faixa chapada acima, o que libera a fotografia para ter contraste alto e cor saturada.  

Composição. Pessoa em cena de consumo ou uso real, meio corpo, olhando para a câmera ou para o produto. O produto aparece grande e nítido nas mãos, ocupando o terço central do quadro. Enquadramento frontal ou levemente oblíquo.  

Cenário e luz. Ambiente real e reconhecível (quintal, cozinha, caçamba de picape, parque). Luz natural, contraste médio-alto. O fundo pode ser escuro e desfocado — não precisa de área calma, porque não recebe texto.  

Produto. Protagonista da cena. Preparado, servido ou em uso — não embalado. Cor viva.  

Proibições: packshot · flat-lay · foto sem pessoa · texto/preço/selo queimado · produto ainda na embalagem · fundo de estúdio · marca d'água.  

Adaptação por categoria — o que é a cena:  

| Categoria | Cena |  
|---|---|  
| Alimentos / bebidas | Pessoa servindo ou provando, tábua ou prato montado |  
| Suplementos | Preparo do shake, copo na mão, cozinha ou academia |  
| Pet | Tutor e animal interagindo com o produto |  
| Brinquedos | Criança em brincadeira, produto em uso |  
| Casa | Pessoa usando o item no ambiente vivido |  
| Moda casual | Pessoa vestindo a peça em contexto cotidiano |  

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `banner_text` | `{{BANNER_TEXT}}` | Texto curto | Copy (n8n) | não | 50 | não |
| `headline_l1` | `{{HEADLINE_L1}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `headline_l2` | `{{HEADLINE_L2}}` | Texto curto | Copy (n8n) | não | 20 | não |
| `hero_description` | `{{HERO_DESCRIPTION}}` | Texto curto | Copy (n8n) | não | 96 | sim |
| `coupon_label` | `{{COUPON_LABEL}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `coupon_code` | `{{COUPON_CODE}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 28 | sim |
| `hero_lifestyle_consumo` | `{{HERO_LIFESTYLE_CONSUMO}}` | Imagem | Imagem gerada | não | — | — |
| `main_image_rounded` | `{{MAIN_IMAGE_ROUNDED}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`banner_text`**
    - *Exemplo:* Use code CODECODE for XXXX% off
    - *Orientação:* Uma linha, código em pílula de acento
- **`headline_l1`**
    - *Exemplo:* Welcome to
    - *Orientação:* Saudação curta, script
- **`headline_l2`**
    - *Exemplo:* (Brand’s name)
    - *Orientação:* ex - TO THE FLAVOR CLUB<br>Caixa alta, nome do grupo, sem ponto final
- **`hero_description`**
    - *Exemplo:* Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.
    - *Orientação:* Valor da oferta em bold - 96 (2 linhas)<br>Ex - Since you joined the boldest, best-tasting inbox on the internet, here's 15% OFF your first order.
- **`coupon_label`**
    - *Exemplo:* Use code
    - *Orientação:* Rótulo fora da pílula
- **`coupon_code`**
    - *Exemplo:* CODECODE
    - *Orientação:* Caixa alta, dentro da pílula
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo + valor da oferta<br>Ex - UNLOCK 15% OFF
- **`hero_lifestyle_consumo`**
    - *Orientação:* Onde fica: base do ativo de fundo, abaixo da faixa chapada; não recebe nenhum texto sobreposto.<br>Nome do ativo: hero_lifestyle_[marca]_welcome.jpg
    - *Imagem:* 598 × 632 px
    - *Spec da imagem:* Proporção: 1:1. Slot de 598 × 632px. Ativo final 1196 × 1264px (2x), JPG q80 ou WebP, < 280 KB. Gerar em 1:1 a 1264 × 1264 e cortar 68px de largura para chegar a 1196 × 1264. Compor sob uma faixa chapada de 585px na cor primária para formar o fundo de 598 × 1217px.<br>Ideia: pessoa em cena de consumo real, meio corpo, com o produto grande e nítido nas mãos ocupando o terço central. Ambiente reconhecível, fundo podendo ser escuro e desfocado, luz natural com contraste médio-alto e cor saturada. Como não recebe texto, a foto pode ter contraste alto — só a linha de topo precisa ser calma para o corte com a faixa chapada.
- **`main_image_rounded`**
    - *Orientação:* Onde fica: último elemento do corpo, 70px abaixo do CTA, centralizado, com 39px de respiro na base.
    - *Imagem:* 534 × 534 px
    - *Spec da imagem:* Proporção: 1:1. Slot de 534 × 534px. Ativo final 1068 × 1068px (2x), PNG ou JPG com os cantos de 55px já arredondados no arquivo — border-radius via CSS não renderiza em Outlook.<br>Ideia: produto ou cena secundária em enquadramento quadrado, com o mesmo tratamento de cor da foto principal. Serve como fecho visual do bloco.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Email 1A — Welcome + 15% Off</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ BARRA SUPERIOR ============ -->
    <tr>
      <td align="center" style="background:#393737;padding:20px 24px 19px 24px;font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:30px;font-weight:400;color:#FFFFFF;">
        Use code <strong style="font-weight:700;">CODECODE</strong> for XXXX% off
      </td>
    </tr>

    <!-- ============ CORPO COM IMAGEM DE FUNDO ============ -->
    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 1217px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:1217px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding:57px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:152px;">
                <tr>
                  <td align="center" height="48" style="width:152px;height:48px;background:#FFFFFF;border:1px solid #000000;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
                    LOGO HERE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- WELCOME + BRAND NAME -->
          <tr>
            <td align="center" class="txt-blk" style="padding:57px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:57px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
              Welcome to<br>
              <strong style="font-weight:700;">(Brand&rsquo;s name)</strong>
            </td>
          </tr>

          <!-- DESCRIÇÃO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:34px 58px 0 58px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:30px;font-weight:400;color:#000000;">
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.
            </td>
          </tr>

          <!-- LINHA DO CUPOM: "Use code" + pílula -->
          <tr>
            <td align="center" style="padding:33px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" valign="middle" class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:30px;font-weight:400;color:#000000;">
                    Use code
                  </td>
                  <td width="24" style="width:24px;font-size:0;line-height:0;">&nbsp;</td>
                  <td align="center" valign="middle" style="padding:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" style="height:50px;v-text-anchor:middle;width:165px;" arcsize="50%" stroke="f" fillcolor="#000000">
                      <w:anchorlock/>
                      <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:25px;">CODECODE</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:165px;">
                      <tr>
                        <td align="center" height="50" style="width:165px;height:50px;background:#000000;border-radius:50px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:50px;font-weight:400;color:#FFFFFF;">
                          CODECODE
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:43px 0 0 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:78px;v-text-anchor:middle;width:523px;" arcsize="50%" stroke="f" fillcolor="#000000">
                <w:anchorlock/>
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:30px;">SHOP NOW</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:523px;">
                <tr>
                  <td align="center" height="78" style="width:523px;height:78px;background:#000000;border-radius:50px;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:523px;height:78px;line-height:78px;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">
                      SHOP NOW
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- IMAGEM PRINCIPAL (cantos arredondados na exportação) -->
          <tr>
            <td align="center" style="padding:70px 0 39px 0;">
              <img src="URL_DA_IMAGEM_PRINCIPAL"
                   width="534" height="534"
                   alt="ALT_DA_IMAGEM_AQUI"
                   style="display:block;width:534px;height:534px;border-radius:55px;background:#ABABAB;">
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-72c32ec8"></a>

### 2.7 · welcome - hero section 6 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, single_col, bordered_container, hero_image_full, text_baked_in_image, logo_in_image, discount_card, overlap_card, negative_margin, big_discount, coupon_code, dynamic_coupon, bulletproof_button, mso_fallback, mobile_responsive, no_footer |
| **Tamanho do HTML** | 5.7 KB |
| **ID** | `72c32ec8-bbd2-4d2c-a938-3c24b65848cd` |

#### Descrição curta

Primeiro e-mail da régua de boas-vindas em que o percentual de desconto é o maior elemento da peça. A foto de campanha ocupa o topo, uma caixa sólida com a oferta assenta na borda inferior dela, e a instrução de resgate fica numa área branca abaixo. Momento de uso: welcome #1 logo após o opt-in, quando o desconto é o argumento principal e a marca ainda precisa se apresentar visualmente.  

#### Descrição detalhada

Um bloco de 707px com imagem de fundo, seguido de uma área branca com a linha do cupom e o CTA. Saudação, wordmark e caixa do desconto são sobrepostos à imagem.  

Quatro mecanismos definem a variante:  

A caixa do desconto termina exatamente onde a imagem termina. A borda inferior da caixa e a borda inferior da foto coincidem — não há respiro entre elas nem sobreposição parcial. É o que costura o bloco fotográfico à área branca.  

O percentual é o maior elemento tipográfico da peça. 60px bold, maior que o wordmark. A hierarquia é invertida de propósito: a oferta domina a marca.  

Instrução e ação vivem fora da imagem. Linha do cupom e CTA ficam sobre branco, em texto vivo. Com imagem bloqueada, o e-mail perde a foto e a caixa mas mantém o caminho de conversão.  

O texto assenta sobre o sujeito, não sobre área vazia. Diferente das variantes de zona limpa, aqui a foto é ocupada de ponta a ponta e a legibilidade vem de a cena inteira ser monocromática — fundo e guarda-roupa na mesma cor.  

#### Contexto para a IA

##### Quando usar

desconto de captação, quando o percentual é o argumento central.  
Moda, activewear, beachwear, beleza, acessório — categorias com foto de campanha em cor chapada.  
Quando a marca tem wordmark tipográfico que funciona em caixa alta com tracking largo.  
Quando existe foto monocromática (fundo e roupa na mesma família de cor) que aceita texto branco sobreposto sem área reservada.  
Quando o código é dinâmico e precisa aparecer em texto vivo.  

##### Quando NÃO usar

Foto com fundo variado ou contraste alto — sem monocromia, o texto sobre o sujeito some.  
Marca premium que não desconta — o percentual em 60px define a peça.  
Sem cupom.  
Carrinho, checkout, browse, transacional.  
Campanha sazonal ou lançamento — não há slot para tema.  
Quando a marca precisa que o nome apareça maior que a oferta.  

##### Orientações de copy para a IA

Saudação — "Welcome to" ou equivalente, uma linha, sem o nome da marca (ele vem no wordmark logo abaixo).  

Wordmark — nome da marca em caixa alta com tracking largo, em uma ou duas linhas. É ativo de marca, não copy livre.  

Caixa do desconto — três linhas fixas: eyebrow curto ("Enjoy"), o valor em bold e grande, e o rodapé com a condição ("your first order"). Nenhuma das três admite frase longa; a caixa é um cartaz, não um parágrafo.  

Linha do cupom — instrução com o código em bold e a condição de resgate. Fica fora da imagem, sobre branco.  

CTA — verbo + nome da marca ou da coleção. Não repetir o percentual: ele já é o maior elemento da peça.  

Proibições: percentual no CTA · contagem regressiva · brand story · segundo botão · frase longa em qualquer linha da caixa · nome da marca na saudação.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente.  

Estrutura  

| # | Elemento | Altura |  
|---|---|---|  
| 1 | Bloco com imagem de fundo | 707px |  
| 2 | Linha do cupom | 8px de respiro + 26px |  
| 3 | CTA | 20px de respiro + 63px |  
| 4 | Respiro final | 45px |  

Overlay sobre a imagem  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Saudação | 183px | 30/34px, padding lateral 24px |  
| Caixa do wordmark | 45px | 310 × 98px, borda 2px |  
| Caixa do desconto | 174px | 405px de largura, ~173px de altura |  

Interior da caixa do desconto: eyebrow 22/26px com 20px de padding superior · valor 60/72px bold · rodapé 22/28px com 27px de padding inferior.  

A soma dos paddings coloca a base da caixa em 707px — a mesma linha da base da imagem. Qualquer alteração nos espaçamentos acima quebra a ancoragem e precisa ser recalculada.  

Paleta — três cores.  

| Papel | Hex (ILUS Label) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #7A0000 | Fundo — vem da foto, também background-color de fallback |  |  
| Cor secundária |  |  |  
| #EEE4DC | Fundo da caixa do desconto |  |  
| Acento |  |  |  
| #921B1C | O valor do desconto dentro da caixa |  |  

O CTA usa   
#393737 fixo em ambas as peles. Texto sobre a primária é branco; dentro da caixa, na cor primária escura, com o valor no acento. O acento é uma variação escura da primária — não uma cor complementar.  

Pele alternativa (HTML base): caixa do desconto   
#E0E0E0 com todo o texto em preto, sem cor de acento, wordmark dentro de caixa branca com borda de 2px.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Saudação 30px regular · wordmark 49px com tracking −0.06em (na referência, tracking largamente positivo — ver seção 12) · valor do desconto 60px bold · demais slots 22px regular · CTA 22px regular com tracking +0.1em, caixa alta. Secundária não existe.  

Implementação. background no <td> + background-image inline + background-size:598px 707px, background-color na cor primária como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Linha do cupom e CTA fora do bloco de imagem, em <tr> próprios sobre branco. Botão bulletproof. Hack u + .body .txt-blk para o Gmail iOS.  

Tags: HERO_IMAGE_URL, WELCOME_EYEBROW, BRAND_NAME, OFFER_EYEBROW, OFFER_VALUE, OFFER_FOOTNOTE, COUPON_CODE, COUPON_HINT, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: respiro entre a base da caixa e a base da imagem · caixa do desconto ultrapassando a imagem · wordmark maior que o valor do desconto · foto com fundo de cor variada · percentual repetido no CTA · linha do cupom dentro do bloco de imagem · quarta cor · segundo botão · botão com raio.  

##### Direção fotográfica

Proporção 4:5 — slot de 598 × 707px, ativo final 1196 × 1414px (2x). JPG q80 ou WebP, < 280 KB, full-bleed. Gerar em 4:5 na largura de 1196px (1196 × 1495) e cortar 81px de altura pela base — essa faixa fica atrás da caixa do desconto.  

Regra crítica: a cena tem que ser monocromática — fundo e guarda-roupa na mesma família de cor, em tom escuro e saturado. Não existe área reservada para o texto: a legibilidade vem da uniformidade cromática da cena inteira. Cena com fundo variado ou contraste alto inviabiliza a variante.  

Composição. Uma figura ocupando o quadro inteiro, cortada pelo topo e pelas laterais. Pose de ação ou postura firme, olhar para a câmera ou fora dele. O sujeito preenche a peça — não há espaço negativo estrutural. Objeto de contexto (bola, prop de esporte, acessório) pode entrar por um canto inferior.  

Cenário e luz. Fundo chapado ou levemente vinhetado na cor da marca. Luz de estúdio direcional, contraste médio nas peles e baixo no fundo. Sem cenário reconhecível — a cor é o cenário.  

Produto. Vestido ou usado pela figura, na mesma cor do fundo. O produto se distingue por textura e recorte, não por contraste de cor.  

Proibições: fundo variado ou de ambiente · alto contraste na faixa central · texto/preço/selo queimado · packshot · vinheta pesada · marca d'água · cor de guarda-roupa fora da paleta.  

Adaptação por categoria — o que é a cena:  

| Categoria | Cena |  
|---|---|  
| Activewear | Figura em pose de esporte, prop da modalidade |  
| Moda | Figura em look completo, fundo na cor da peça |  
| Beachwear | Figura em pé, fundo chapado quente |  
| Beleza | Retrato de meio corpo, fundo na cor do produto |  
| Acessório | Figura com o acessório em destaque, mesma família de cor |  
| Lingerie | Figura em interior de tom único |  

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `welcome_eyebrow` | `{{WELCOME_EYEBROW}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `brand_name` | `{{BRAND_NAME}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `hero_tagline` | `{{HERO_TAGLINE}}` | Texto curto | Copy (n8n) | não | 40 | não |
| `offer_eyebrow` | `{{OFFER_EYEBROW}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `offer_value` | `{{OFFER_VALUE}}` | Texto curto | Copy (n8n) | não | 10 | sim |
| `offer_footnote` | `{{OFFER_FOOTNOTE}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `coupon_line` | `{{COUPON_LINE}}` | Texto curto | Copy (n8n) | não | 46 | não |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | não |
| `hero_campanha_monocromatica` | `{{HERO_CAMPANHA_MONOCROMATICA}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`welcome_eyebrow`**
    - *Exemplo:* Welcome to
    - *Orientação:* Saudação, sem o nome da marca
- **`brand_name`**
    - *Exemplo:* LOGO HERE
    - *Orientação:* Caixa alta com tracking largo, 1 ou 2 linhas
- **`hero_tagline`**
    - *Exemplo:* We're so happy to have you here!
    - *Orientação:* Slot opcional — não existe no HTML base
- **`offer_eyebrow`**
    - *Exemplo:* Enjoy
    - *Orientação:* Uma palavra, abre a caixa
- **`offer_value`**
    - *Exemplo:* X% OFF
    - *Orientação:* Bold, maior elemento da peça
- **`offer_footnote`**
    - *Exemplo:* your first order
    - *Orientação:* Condição, fecha a caixa
- **`coupon_line`**
    - *Exemplo:* with code [DYNAMIC] at checkout.
    - *Orientação:* Código em bold, sobre branco
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo + marca ou coleção, sem percentual
- **`hero_campanha_monocromatica`**
    - *Orientação:* Onde fica: fundo do bloco superior; saudação, wordmark e caixa do desconto são sobrepostos a ela. A base da caixa coincide com a base da imagem.<br>Nome do ativo: hero_mono_[marca]_welcome.jpg
    - *Imagem:* proporção 4:5 · 598 × 707 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 598 × 707px. Ativo final 1196 × 1414px (2x), JPG q80 ou WebP, < 280 KB. Gerar em 4:5 na largura de 1196px (1196 × 1495) e cortar 81px de altura pela base.<br>Ideia: figura única preenchendo o quadro inteiro, cortada pelo topo e pelas laterais, em cena monocromática — fundo chapado e guarda-roupa na mesma família de cor escura e saturada. O produto se distingue por textura e recorte, não por contraste. Luz de estúdio direcional, contraste baixo no fundo para o texto branco assentar sobre qualquer ponto. Prop de contexto opcional entrando por um canto inferior.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hero — Welcome / X% OFF first order</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ BLOCO COM IMAGEM DE FUNDO (0 → 707px) ============ -->
    <tr>
      <td background="URL_DA_IMAGEM_AQUI"
          valign="top"
          style="background-color:#ABABAB;background-image:url('URL_DA_IMAGEM_AQUI');background-position:center top;background-repeat:no-repeat;background-size:598px 707px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:707px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_AQUI" color="#ABABAB" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- WELCOME TO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:183px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:400;color:#000000;">
              Welcome to
            </td>
          </tr>

          <!-- CAIXA DO LOGO -->
          <tr>
            <td align="center" style="padding:45px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:310px;">
                <tr>
                  <td align="center" height="98" style="width:310px;height:98px;background:#FFFFFF;border:2px solid #000000;font-family:Arial,Helvetica,sans-serif;font-size:49px;line-height:56px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
                    LOGO HERE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- LINHA DE BOAS-VINDAS -->
          <tr>
            <td align="center" class="txt-wht" style="padding:40px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:26px;font-weight:400;color:#FFFFFF;">
              We&rsquo;re so happy to have you here!
            </td>
          </tr>

          <!-- CAIXA DO DESCONTO -->
          <tr>
            <td align="center" style="padding:108px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:405px;background:#E0E0E0;">
                <tr>
                  <td align="center" style="padding:20px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:26px;font-weight:400;color:#000000;">
                    Enjoy
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 20px;font-family:Arial,Helvetica,sans-serif;font-size:60px;line-height:72px;font-weight:700;color:#000000;">
                    X% OFF
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 20px 27px 20px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:400;color:#000000;">
                    your first order
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

    <!-- ============ ÁREA BRANCA ============ -->

    <!-- LINHA DO CUPOM -->
    <tr>
      <td align="center" class="txt-blk" style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;font-weight:400;letter-spacing:0.02em;color:#000000;">
        with code <strong style="font-weight:700;">[DYNAMIC]</strong> at checkout.
      </td>
    </tr>

    <!-- CTA BULLETPROOF -->
    <tr>
      <td align="center" style="padding:20px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:405px;">
          <tr>
            <td align="center" height="63" style="width:405px;height:63px;background:#393737;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:405px;height:63px;line-height:63px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:400;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Shop Now
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- RESPIRO INFERIOR -->
    <tr>
      <td height="45" style="height:45px;font-size:0;line-height:0;">&nbsp;</td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-c90713ff"></a>

### 2.8 · welcome - hero section 7 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, single_col, bordered_container, boxed_logo, two_line_headline, headline_slots, body_copy, big_button, square_button, hero_image_bottom, text_cta_image_order, bestsellers_hero, mso_fallback, mobile_responsive, no_footer |
| **Tamanho do HTML** | 5.4 KB |
| **ID** | `c90713ff-9821-4d92-98c1-c22008fb9609` |

#### Descrição curta

Abertura de campanha promocional. O percentual é a headline, uma linha de apoio explica a mecânica da oferta e três barras de cor no topo fazem o papel de assinatura visual da marca. Não há cupom: a oferta é automática. Momento de uso: campanha de desconto avulsa ou sazonal, para base já engajada que não precisa de apresentação.  

#### Descrição detalhada

Três barras de cor de 20px no topo; abaixo, uma imagem de fundo de 780px. Logo, eyebrow, headline, subhead e CTA são sobrepostos à metade superior dessa imagem.  

Quatro mecanismos definem a variante:  

As barras de cor substituem a barra de benefício. Três faixas de 200px cada, em cores da identidade, ocupando a largura total. É a assinatura da marca no topo — não carregam texto e não são clicáveis.  

O eyebrow é qualificador da oferta, não saudação. "Up to" existe para modular o percentual. Sem ele, o número vira promessa fechada e cria risco de expectativa.  

Escala tipográfica progressiva e centralizada. Eyebrow 31px → headline 53px → subhead 21px. O eyebrow é maior que o subhead, invertendo a hierarquia usual — o topo da leitura é a oferta, não a explicação.  

O CTA cai sobre o início dos sujeitos. Não existe respiro entre o botão e a cena; a base do CTA encosta na altura em que as figuras entram no quadro. É o que amarra o bloco de texto à fotografia.  

#### Contexto para a IA

##### Quando usar

Campanha promocional com desconto automático, sem cupom.  
Uniformes, activewear, moda funcional, calçado, casa, pet — categorias em que a cena de movimento comunica uso.  
Quando a marca tem duas ou três cores de identidade que sustentam as barras do topo.  
Quando o desconto é escalonado ou por volume ("quanto mais compra, mais economiza") e precisa da linha de apoio.  
Base já engajada, que não precisa de apresentação de marca.  

##### Quando NÃO usar

Welcome — não há slot para cupom nem para acolhimento.  
Marca de uma cor só — as barras ficam sem função e viram ruído.  
Oferta com código — a variante não tem onde acomodar o código sem quebrar a escala.  
Foto sem fundo claro e uniforme no topo — o texto cinza escuro exige fundo alto.  
Carrinho, checkout, transacional, editorial de marca.  
Quando o desconto é fechado e não escalonado: sem "up to", o eyebrow perde a função e a escala desmonta.  

##### Orientações de copy para a IA

Eyebrow — qualificador do percentual em caixa alta ("Up to", "Até", "Ganhe até"). Duas ou três palavras. Nunca saudação, nunca nome de marca.  

Headline — o percentual + a categoria em uma linha, caixa alta ("35% OFF SCRUBS"). Duas linhas só se a categoria for longa. Sem ponto final, sem exclamação.  

Subhead — uma frase que explica a mecânica da oferta e um comando de estoque. Duas linhas. É o único slot com exclamação permitida, e no máximo uma.  

CTA — verbo genérico em caixa alta com tracking largo. Sem percentual: a headline já é o percentual.  

Proibições: código de cupom em qualquer slot · contagem regressiva · percentual no CTA · headline em caixa baixa · exclamação fora do subhead · nome da marca na headline.  

##### Design system

Container 600px fixo, sem borda. Zero raio, zero sombra, zero gradiente.  

Estrutura  

| # | Elemento | Altura |  
|---|---|---|  
| 1 | Barras de cor | 20px |  
| 2 | Hero com imagem de fundo | 780px |  

Barras: três células de 200px, sem espaçamento entre elas, ocupando os 600px. Nenhuma tem texto ou link.  

Zonas internas da hero  

| Zona | Faixa | Conteúdo |  
|---|---|---|  
| Limpa | 0 – 383px (topo 49%) | Fundo alto e uniforme da foto. Recebe todo o overlay. |  
| Sujeito | 383 – 780px (base 51%) | Figuras em movimento. Nenhum elemento sobreposto além da base do CTA. |  

Overlay  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Logo | 51px | 148 × 47px |  
| Eyebrow | 30px | 31/37px, tracking +0.05em, caixa alta |  
| Headline | 22px | 53/56px, tracking +0.05em, caixa alta, padding lateral 18px |  
| Subhead | 22px | 21/24px, 2 linhas, padding lateral 43px |  
| CTA | 22px | 287 × 52px |  
| Área livre do sujeito | — | 397px |  

Paleta — quatro cores, e é a única variante do arsenal com quatro.  

| Papel | Hex (Mediclo) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #373737 | Todo o texto do overlay — cinza escuro, nunca preto puro |  |  
| Cor secundária |  |  |  
| #6B906E | Fundo do CTA, com label branco |  |  
| Barra 1 |  |  |  
| #646874 | Faixa esquerda |  |  
| Barra 3 |  |  |  
| #BC394B | Faixa direita |  |  

A barra do meio é sempre   
#FFFFFF — ela separa as outras duas e amarra com o fundo claro da foto. As barras 1 e 3 são cores da identidade e não aparecem em nenhum outro elemento da peça. O fundo vem da foto: cinza claro alto, também background-color de fallback.  

Pele alternativa (HTML base): CTA preto, barra 3 preta. Usar quando a marca só tem uma cor de identidade além do neutro.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Eyebrow e headline em caixa alta com tracking +0.05em; subhead em caixa mista sem tracking; CTA 23px bold com tracking +0.15em. Secundária não existe.  

Implementação. Barras como três <td> de 200px com font-size:0;line-height:0 — sem isso o Outlook insere altura fantasma. background no <td> da hero + background-image inline + background-size:600px 780px, background-color na cor de fundo da foto como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Botão bulletproof. Hack u + .body .hero-txt travando o cinza   
#373737 no Gmail iOS. &nbsp; entre o percentual e "Off" na headline para impedir quebra em ponto errado.  

Tags: HERO_IMAGE_URL, LOGO_URL, OFFER_QUALIFIER, OFFER_VALUE, OFFER_CATEGORY, HERO_SUBHEAD, CTA_LABEL, CTA_URL, BRAND_BAR_1, BRAND_BAR_3.  

Erros que quebram o padrão: barras de larguras desiguais · texto ou link nas barras · usar as cores das barras em outro elemento · barra do meio em cor · preto puro no texto · respiro entre o CTA e a entrada dos sujeitos · subhead maior que o eyebrow · percentual repetido no CTA · segundo botão · botão com raio.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 3:4 — slot de 600 × 780px, ativo final 1200 × 1560px (2x). JPG q80 ou WebP, < 260 KB, full-bleed. Gerar em 3:4 na largura de 1200px (1200 × 1600) e cortar 40px de altura pelo topo — é fundo liso e não carrega informação.  

Regra crítica: a metade superior tem que ser fundo claro, alto e uniforme, com luminância acima de 85%. O texto é cinza escuro, não branco — fundo médio ou escuro inviabiliza a peça.  

Composição. Duas figuras em movimento suspenso — corrida, salto, passada larga — entrando pelas laterais e cortadas pelas bordas laterais e pela base. Direções opostas ou convergentes. Nenhuma figura sobe acima da metade do quadro. Elemento vegetal entrando pelos cantos inferiores como moldura.  

Cenário e luz. Fundo infinito claro, sem horizonte visível, com leve sombreamento nos cantos inferiores para assentar as figuras. Luz de estúdio difusa, sombras suaves sob os pés. Sem cenário reconhecível.  

Produto. Vestido pelas figuras, em cor média que contrasta com o fundo claro. Detalhes funcionais visíveis (bolsos, cordões, aviamento) — é o que prova a categoria.  

Proibições: fundo escuro ou médio · figura acima da metade do quadro · cenário reconhecível · pose estática · texto/preço/selo queimado · sombra dura · marca d'água.  

Adaptação por categoria — o que é a cena:  

| Categoria | Cena |  
|---|---|  
| Uniforme / activewear | Duas figuras em corrida ou salto, roupa técnica |  
| Moda funcional | Figuras em passada larga, peça em movimento |  
| Calçado | Figuras em salto, pés em destaque na base |  
| Casa | Figuras carregando ou usando o item em movimento |  
| Pet | Tutor e animal em corrida, produto vestido |  
| Infantil | Crianças em brincadeira ativa, fundo claro |  

#### Schema de output (5 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `offer_qualifier` | `{{OFFER_QUALIFIER}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `offer_value` | `{{OFFER_VALUE}}` | Texto curto | Copy (n8n) | não | 22 | não |
| `hero_subhead` | `{{HERO_SUBHEAD}}` | Texto curto | Copy (n8n) | não | 104 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 14 | não |
| `hero_movimento_estudio` | `{{HERO_MOVIMENTO_ESTUDIO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`offer_qualifier`**
    - *Exemplo:* Up to
    - *Orientação:* Caixa alta, qualificador do percentual
- **`offer_value`**
    - *Exemplo:* 35% OFF SCRUBS
    - *Orientação:* Caixa alta, fecha a headline
- **`hero_subhead`**
    - *Exemplo:* The more you buy, the more you save! Stock up on your favorite scrubs now.
    - *Orientação:* 104 (2 linhas)<br>Caixa mista, no máximo uma exclamação
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo genérico, sem percentual
- **`hero_movimento_estudio`**
    - *Orientação:* Onde fica: fundo da hero, abaixo das barras de cor; logo, eyebrow, headline, subhead e CTA são sobrepostos à metade superior.<br>Nome do ativo: hero_movimento_[marca]_[campanha].jpg
    - *Imagem:* proporção 3:4 · 600 × 780 px
    - *Spec da imagem:* Proporção: 3:4. Slot de 600 × 780px. Ativo final 1200 × 1560px (2x), JPG q80 ou WebP, < 260 KB. Gerar em 3:4 na largura de 1200px (1200 × 1600) e cortar 40px de altura pelo topo.<br>Ideia: duas figuras em movimento suspenso entrando pelas laterais, cortadas pelas bordas laterais e pela base, nenhuma subindo acima da metade do quadro. Metade superior em fundo infinito claro e uniforme, com luminância acima de 85%, para receber o texto cinza escuro. Luz de estúdio difusa, leve sombreamento nos cantos inferiores, elemento vegetal emoldurando a base. Produto vestido em cor média, com detalhes funcionais visíveis.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hero — 35% OFF Scrubs</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  /* trava dark mode */
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .hero-txt { color:#373737 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- WRAPPER -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;">

    <!-- ================= BARRAS DE COR ================= -->
    <tr>
      <td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
          <tr>
            <td width="200" height="20" style="width:200px;height:20px;background:#646874;font-size:0;line-height:0;">&nbsp;</td>
            <td width="200" height="20" style="width:200px;height:20px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td width="200" height="20" style="width:200px;height:20px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ================= HERO COM IMAGEM DE FUNDO ================= -->
    <tr>
      <td background="URL_DA_IMAGEM_AQUI"
          valign="top"
          style="background-color:#EFEFEF;background-image:url('URL_DA_IMAGEM_AQUI');background-position:center top;background-size:600px 780px;background-repeat:no-repeat;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:780px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_AQUI" color="#EFEFEF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding:51px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:148px;">
                <tr>
                  <td align="center" height="47" style="width:148px;height:47px;background:#FFFFFF;border:1px solid #000000;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:400;letter-spacing:-0.06em;color:#000000;">
                    LOGO HERE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- EYEBROW -->
          <tr>
            <td align="center" class="hero-txt" style="padding:30px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:31px;line-height:37px;font-weight:400;letter-spacing:0.05em;text-transform:uppercase;color:#373737;">
              Up to
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td align="center" class="hero-txt" style="padding:22px 18px 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:53px;line-height:56px;font-weight:400;letter-spacing:0.05em;text-transform:uppercase;color:#373737;">
              35%&nbsp;Off Scrubs
            </td>
          </tr>

          <!-- SUBHEAD -->
          <tr>
            <td align="center" class="hero-txt" style="padding:22px 43px 0 43px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:24px;font-weight:400;color:#373737;">
              The more you buy, the more you save! Stock up on your favorite scrubs now.
            </td>
          </tr>

          <!-- CTA BULLETPROOF -->
          <tr>
            <td align="center" style="padding:22px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:287px;">
                <tr>
                  <td align="center" height="52" style="width:287px;height:52px;background:#000000;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:287px;height:52px;line-height:52px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      Shop Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ÁREA LIVRE PARA O PRODUTO APARECER NA IMAGEM -->
          <tr>
            <td height="397" style="height:397px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>
  <!-- /CONTAINER -->

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-85006b06"></a>

### 2.9 · welcome - hero section 9 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Hero (`hero`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, single_col, bordered_container, coupon_banner, discount_offer, coupon_code, pill_logo, rounded_logo, hero_image_full, big_title, uppercase_title, dual_cta, two_buttons, text_baked_in_image, mso_fallback, mobile_responsive, partial_template, second_section_omitted, footer_omitted |
| **Tamanho do HTML** | 5.1 KB |
| **ID** | `85006b06-b7db-498e-af9d-4db11be4fd5f` |

#### Descrição curta

E-mail de atendimento proativo. Pergunta se o contato precisa de ajuda, reconhece a visita ao site e oferece dois caminhos em escada: a ação principal em botão sólido e uma alternativa de menor comprometimento em botão de contorno. Não há oferta nem desconto. Momento de uso: browse abandonment ou pós-visita sem conversão, quando o objetivo é remover objeção e não empurrar compra.  

#### Descrição detalhada

Barra preta de logo no topo; abaixo, uma imagem única de 1199px cobrindo o resto. Título, copy e os dois botões são sobrepostos ao terço superior dessa imagem.  

Quatro mecanismos definem a variante:  

Os dois CTAs são hierárquicos, não paralelos. O primário é sólido preto; o secundário tem fundo claro e contorno de 1px. Mesma largura e altura, peso visual diferente. É o oposto do hero de campanha com duplo CTA, onde os dois são idênticos e bifurcam público — aqui há uma ação preferida e uma saída de menor atrito.  

O cinza de fundo é o fundo de estúdio da foto. Não existe bloco de cor separado nem emenda. A ausência total de costura é o efeito; montar como "bloco cinza + banner embaixo" transforma a peça em newsletter comum.  

Título em caixa baixa, com pergunta. Registro de atendimento, não de venda. Caixa alta ou ponto de exclamação derrubam o tom.  

Nenhum slot de oferta. Sem cupom, sem percentual, sem urgência. A variante existe para o momento em que vender seria contraproducente.  

#### Contexto para a IA

##### Quando usar

reativação suave.  
Atendimento proativo, "posso ajudar?", redução de objeção antes da compra.  
Beleza, skincare, joia, moda, eletrônico — categorias com dúvida técnica ou de escolha antes da conversão.  
Quando existem duas ações reais de suporte com pesos diferentes (conta e central de ajuda, chat e FAQ, consultoria e catálogo).  
Marca com identidade monocromática e fotografia de estúdio própria.  

##### Quando NÃO usar

Qualquer e-mail com oferta. Promoção, cupom, lançamento e urgência não têm onde entrar.  
Uma ação só — sem a segunda alternativa, o botão de contorno fica vazio de função.  
Carrinho e checkout abandonado — intenção alta pede caminho único e itens do carrinho.  
Welcome com cupom, campanha sazonal, grade de produtos, prova social.  
Quando a foto disponível não tem fundo de estúdio liso no terço superior.  
Marca de volume ou tom promocional: o registro contido soa desconexo.  

##### Orientações de copy para a IA

Título — pergunta curta em caixa baixa, na voz do atendimento ("can we help?", "posso ajudar?"). Interrogação obrigatória. Sem nome de marca, sem produto, sem oferta.  

Copy — três linhas: reconhecer a visita, oferecer ajuda com a escolha, convidar ao contato. Frases curtas, uma por linha. Tom de pessoa, não de sistema.  

CTA primário — a ação de maior valor para a marca, em caixa alta com tracking largo. É onde a conta, o chat ou a consultoria entram.  

CTA secundário — a alternativa de menor comprometimento: central de ajuda, FAQ, catálogo. Nunca o mesmo destino do primário e nunca mais persuasivo que ele.  

Proibições: percentual ou cupom em qualquer slot · urgência · exclamação em mais de uma linha · caixa alta no título · CTA secundário apontando para o mesmo lugar do primário · nome do produto.  

##### Design system

6. Design system  

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente. Preheader oculto obrigatório.  

Estrutura  

| # | Elemento | Altura |  
|---|---|---|  
| 1 | Barra do logo (preta, opaca) | 139px |  
| 2 | Corpo com imagem de fundo | 1199px |  

Zonas internas do corpo  

| Zona | Faixa | Conteúdo |  
|---|---|---|  
| Limpa | 0 – 463px (topo 39%) | Fundo de estúdio da foto. Recebe todo o overlay. |  
| Sujeito | 463 – 1199px (base 61%) | Pessoa e produto. Nenhum elemento sobreposto. |  

Overlay  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Logo (dentro da barra) | 45px | 152 × 48px |  
| Título | 66px | 48/55px, caixa baixa, padding lateral 40px |  
| Copy | 45px | 24/26px, 3 linhas, padding lateral 34px |  
| CTA primário | 49px | 330 × 75px |  
| CTA secundário | 20px | 330 × 75px, borda 1px |  
| Área livre do sujeito | — | 736px |  

Paleta — quatro valores, nenhum deles cor.  

| Papel | Hex | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #000000 | Barra do logo, título, fundo do CTA primário, borda e label do CTA secundário |  |  
| Cor secundária |  |  |  
| #DADDDD | Fundo — vem da foto, também background-color de fallback |  |  
| Neutro de texto |  |  |  
| #565352 | Copy — cinza médio, nunca preto |  |  
| Neutro do botão |  |  |  
| #E8E9ED | Fundo do CTA secundário — mais claro que o fundo da peça |  |  

A variante é monocromática por definição. Introduzir qualquer cor saturada, inclusive no CTA primário, descaracteriza o padrão. O   
#E8E9ED do botão secundário é deliberadamente mais claro que o   
#DADDDD do fundo — é assim que ele se destaca sem ganhar peso.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 48px regular em caixa baixa — o impacto vem do corpo, nunca do bold. Copy 24px regular. CTAs 24px regular em caixa alta. Secundária não existe; o ar de monoespaçado nos botões vem de tracking largo na própria sans. Exceção controlada: se a loja tem um monoespaçado de marca, ele pode entrar apenas nos labels de CTA — nunca no título, nunca na copy.  

Implementação. background no <td> + background-image inline + background-size:598px 1199px, background-color em   
#DADDDD como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Barra do logo opaca e fora da imagem — com imagem bloqueada a marca continua visível. Botões bulletproof; no secundário, o <a> mede 328 × 73px para caber dentro da borda de 1px. Hacks u + .body .txt-blk e u + .body .txt-gry travando as duas cores de texto no Gmail iOS.  

Tags: PREHEADER, LOGO_URL, SITE_URL, HERO_IMAGE_URL, HERO_HEADLINE, HERO_COPY, CTA_PRIMARY_LABEL/CTA_PRIMARY_URL, CTA_SECONDARY_LABEL/CTA_SECONDARY_URL.  

Erros que quebram o padrão: montar como bloco de cor + banner separado · background-color diferente do cinza real da foto · dois CTAs com o mesmo peso visual · CTA secundário sólido · título em caixa alta ou em bold · copy em preto puro · botão secundário mais escuro que o fundo · qualquer cor saturada · terceiro botão · botão com raio · sujeito invadindo a zona limpa.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 9:16 — slot de 598 × 1199px, ativo final 1196 × 2398px (2x). JPG q80 ou WebP, < 320 KB, full-bleed. Gerar em 9:16 na altura de 2398px (1349 × 2398) e cortar 153px de largura, 77px de cada lado, para chegar ao ativo final.  

Regra crítica: os 39% superiores têm que ser fundo de estúdio liso e uniforme, em cinza claro, sem vinheta e sem degradê perceptível. Essa faixa é o "fundo" da peça inteira e o background-color de fallback é pipetado dela. Qualquer variação de tom ali cria a emenda que o padrão existe para evitar.  

Composição. Uma figura em gesto de uso do produto, entrando pela base do quadro em meio corpo. Perfil ou três quartos, olhar baixo e concentrado — nunca para a câmera. O produto ocupa menos de 15% do quadro e está nas mãos, em uso. Nenhuma figura sobe acima de 39%.  

Cenário e luz. Fundo infinito cinza claro, sem horizonte. Luz difusa lateral, sombra suave de um lado do rosto. Sem cenário, sem prop, sem mobiliário.  

Produto. Em uso, nas mãos, com o rótulo parcialmente legível. Nunca apresentado à câmera, nunca em packshot.  

Proibições: fundo colorido, escuro ou de ambiente · vinheta ou degradê no fundo · olhar para a câmera · sorriso aberto · produto apresentado à câmera · figura acima de 39% do quadro · texto/preço/selo queimado · marca d'água.  

Adaptação por categoria — o que é o gesto:  

| Categoria | Gesto |  
|---|---|  
| Skincare | Aplicação de sérum ou creme no rosto |  
| Cabelo | Aplicação no comprimento, cabelo em movimento |  
| Joia | Fechando um colar ou ajustando um anel |  
| Moda | Ajustando a peça no corpo, mão no tecido |  
| Eletrônico | Manuseio do aparelho, foco nas mãos |  
| Casa | Manuseio do item em gesto de uso |  

#### Schema de output (6 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `hero_headline` | `{{HERO_HEADLINE}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `hero_copy` | `{{HERO_COPY}}` | Texto curto | Copy (n8n) | não | 144 | sim |
| `cta_primary_label` | `{{CTA_PRIMARY_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `cta_secondary_label` | `{{CTA_SECONDARY_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `hero_gesto_uso` | `{{HERO_GESTO_USO}}` | Imagem | Imagem gerada | não | — | — |
| `brand_logo` | `{{BRAND_LOGO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`hero_headline`**
    - *Exemplo:* TITLE HERE
    - *Orientação:* EX - can we help?<br>Caixa baixa, pergunta, interrogação obrigatória - LETRAS MINUSCULAS
- **`hero_copy`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    - *Orientação:* 144 (3 linhas)<br>Frases curtas, uma por linha<br>Ex - We saw you visited the site! Looking for something specific or have a question? Let us know!
- **`cta_primary_label`**
    - *Exemplo:* ACCESS MY ACCOUNT
    - *Orientação:* Caixa alta, ação de maior valor
- **`cta_secondary_label`**
    - *Exemplo:* VISIT HELP CENTER
    - *Orientação:* Caixa alta, alternativa de menor atrito
- **`hero_gesto_uso`**
    - *Orientação:* Onde fica: fundo de todo o corpo, abaixo da barra preta do logo; título, copy e os dois botões são sobrepostos aos 39% superiores.
    - *Imagem:* proporção 9:16 · 598 × 1199 px
    - *Spec da imagem:* Proporção: 9:16. Slot de 598 × 1199px. Ativo final 1196 × 2398px (2x), JPG q80 ou WebP, < 320 KB. Gerar em 9:16 na altura de 2398px (1349 × 2398) e cortar 153px de largura para chegar a 1196 × 2398.<br>Ideia: uma figura em gesto de uso do produto, meio corpo, entrando pela base do quadro, em perfil ou três quartos, olhar baixo. O produto está nas mãos e ocupa menos de 15% do quadro. Os 39% superiores são fundo de estúdio cinza claro, liso e uniforme, sem vinheta — é dele que sai o background-color de fallback da peça. Luz difusa lateral, monocromático e contido.
- **`brand_logo`**
    - *Orientação:* Onde fica: barra preta de 139px no topo, centralizado, 45px de respiro acima e 46px abaixo.
    - *Imagem:* 152 × 48 px
    - *Spec da imagem:* Proporção: caixa de 152 × 48px. Ativo final 304 × 96px (2x), PNG transparente.<br>Ideia: wordmark em versão branca de uma cor, sobre preto.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hero — Title Here com duplo CTA</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-gry { color:#565352 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ BARRA PRETA COM LOGO ============ -->
    <tr>
      <td align="center" height="139" style="height:139px;background:#000000;padding:45px 0 46px 0;">
        <a href="URL_DO_SITE_AQUI">
          <img src="URL_DO_LOGO_AQUI" width="152" height="48" alt="NOME_DA_MARCA"
               style="display:block;width:152px;height:48px;">
        </a>
      </td>
    </tr>


    <!-- ============ CORPO SOBRE IMAGEM DE FUNDO ============ -->
    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 1199px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:1199px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- TÍTULO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:66px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:48px;line-height:55px;font-weight:400;color:#000000;">
              TITLE HERE
            </td>
          </tr>

          <!-- COPY -->
          <tr>
            <td align="center" class="txt-gry" style="padding:45px 34px 0 34px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:26px;font-weight:400;color:#565352;">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </td>
          </tr>

          <!-- CTA PRIMÁRIO -->
          <tr>
            <td align="center" style="padding:49px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:330px;">
                <tr>
                  <td align="center" height="75" style="width:330px;height:75px;background:#000000;">
                    <a href="URL_CTA_PRIMARIO"
                       style="display:block;width:330px;height:75px;line-height:75px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      ACCESS MY ACCOUNT
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA SECUNDÁRIO -->
          <tr>
            <td align="center" style="padding:20px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:330px;">
                <tr>
                  <td align="center" height="75" style="width:330px;height:75px;background:#E8E9ED;border:1px solid #000000;">
                    <a href="URL_CTA_SECUNDARIO"
                       style="display:block;width:328px;height:73px;line-height:73px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">
                      VISIT HELP CENTER
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ÁREA LIVRE PARA A IMAGEM APARECER -->
          <tr>
            <td height="736" style="height:736px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```


---

## 3 · Value Proposition / Body

`body` · 9 variantes (7 ativas · 81.9 KB de HTML)

<a id="v-d5fb804f"></a>

### 3.1 · body 2 - bridge textos linha produtos — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, no_border, single_col, standalone_component, bridge_section, value_prop, text_blocks, four_blocks, underlined_block_titles, decorative_product_images, floating_images_omitted, asymmetric_blocks, single_cta, full_width_button, no_mso_fallback, mobile_responsive, no_logo, no_hero, no_footer, not_mobile_stacked |
| **Tamanho do HTML** | 5.7 KB |
| **ID** | `d5fb804f-8934-4c39-b011-950e20802498` |

#### Descrição curta

Duas fitas diagonais anunciam a data, um texto pinta a cena de uso e uma colagem de duas fotos inclinadas mostra a família com o produto. Momento de uso: Black Friday, Natal ou datas de presente, quando a compra é motivada por afeto e não por especificação.  

#### Descrição detalhada

Faixa de fitas diagonais, título em duas linhas, um parágrafo de cena, colagem de fotos, um parágrafo de urgência e o CTA.  

Quatro mecanismos definem a variante:  

Fitas e colagem são ativos de imagem, não CSS. transform:rotate() e position:absolute não funcionam em cliente de e-mail — o HTML de referência é preview de Figma, não peça enviável. A faixa de fitas vira um ativo de 600 × 200px e a colagem vira um ativo de 470 × 360px, ambos com as rotações e sombras já aplicadas.  

Dois parágrafos com funções opostas. O primeiro pinta a cena — "imagine sua família..." — e o segundo avisa que vai acabar. Emoção antes, urgência depois, com a colagem entre os dois servindo de prova visual da cena descrita.  

A colagem sobrepõe, não alinha. As duas fotos têm inclinações contrárias, alturas diferentes e se cruzam. Alinhá-las lado a lado transforma o bloco em grade de duas colunas e mata o ar de álbum.  

A repetição na fita é o ornamento. O nome da data se repete alternando peso regular e bold. Não há logo, não há selo — a fita é o único elemento de campanha.  

#### Contexto para a IA

##### Quando usar

Moda infantil e familiar, pijamas, casa, brinquedos, pet — categorias de compra por afeto.  
Quando existe fotografia de família ou de grupo usando o produto.  
Quando a marca aceita ornamento gráfico forte no topo.  
Quando o argumento é a cena, não o preço nem a especificação.  

##### Quando NÃO usar

Sem fotografia de pessoas — packshot na colagem esvazia o bloco.  
Produto individual sem contexto de grupo — a colagem precisa de duas cenas que conversem.  
Marca premium ou editorial — fitas repetidas e fotos tortas são registro festivo.  
Fora de data comemorativa — a fita pede um nome de campanha; sem ele, vira enfeite.  
Carrinho, checkout, transacional, prova social, catálogo.  
Quando a produção não puder montar os ativos: sem eles, o bloco não se sustenta em HTML puro.  

##### Orientações de copy para a IA

Texto da fita — o nome da campanha repetido, separado por ponto médio, alternando peso regular e bold. Sete repetições cobrem a largura.  

Título — duas linhas ligando a data ao sentimento. Sem percentual, sem nome de produto.  

Parágrafo 1 — a cena, em segunda pessoa, começando por um convite a imaginar. Quatro linhas. É o único slot do arsenal onde exclamação é bem-vinda; até duas.  

Parágrafo 2 — a urgência, em três linhas, terminando na ruptura de estoque. Muda o registro de afetivo para prático.  

CTA — verbo + nome da campanha, caixa alta.  

Proibições: percentual ou cupom no título · parágrafos com a mesma função · nome de produto na fita · contagem regressiva · exclamação no parágrafo 2 · segundo botão.  

##### Design system

Container 600px fixo, borda 1px   
#000000. Raio de 5px no CTA; demais elementos com cantos vivos.  

Estrutura  

| # | Elemento | Padding | Dimensão |  
|---|---|---|---|  
| 1 | Faixa de fitas | 0 | 600 × 200px |  
| 2 | Título | 20px topo · 38px laterais | 28/31px bold, 2 linhas |  
| 3 | Parágrafo 1 | 22px topo · 56px laterais | 22/27px, 4 linhas |  
| 4 | Colagem | 44px topo · 40px base | 470 × 360px |  
| 5 | Parágrafo 2 | 56px laterais | 22/27px, 3 linhas |  
| 6 | CTA | 35px topo · 45px base | 350 × 55px, borda 2px, raio 5px |  

Paleta — três cores.  

| Papel | Hex (Holy Pals) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #DFDAE0 | Fundo da seção |  |  
| Cor secundária |  |  |  
| #151515 | Título, CTA e o texto sobre a fita |  |  
| Acento |  |  |  
| #FAE25E | Fundo das fitas |  |  

O corpo dos parágrafos usa preto puro; o título usa o   
#151515, quase preto. O acento aparece só nas fitas — é o único ponto de saturação da peça, e é ele que marca a campanha.  

Pele alternativa (HTML base): fundo   
#F3F3F3, fitas pretas com texto branco. Usar quando a marca não tem cor de campanha definida.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 28px bold; parágrafos 22px regular; fita 20px alternando regular e bold; CTA 25px bold com tracking −0.25px. Secundária não existe.  

Implementação. Este é o ponto crítico da variante: o HTML de referência usa position:absolute, transform:rotate(), box-shadow e object-fit, e nenhum deles é confiável em cliente de e-mail. A conversão obrigatória:  

A faixa de fitas vira uma <img> de 600 × 200px.  
A colagem inteira vira uma <img> de 470 × 360px, com as duas fotos, rotações, molduras e sombras compostas no arquivo.  
O CTA usa v:roundrect com arcsize="9%" no bloco MSO.  
A media query de 620px pode ficar, mas o container de 600px do arsenal não depende dela.  

Com a colagem virando ativo único, o bloco perde texto vivo em dois pontos — o alt da colagem precisa carregar a descrição da cena.  

Tags: RIBBON_TEXT, RIBBON_IMAGE_URL, SECTION_TITLE, SECTION_COPY_1, COLLAGE_IMAGE_URL, COLLAGE_IMAGE_ALT, SECTION_COPY_2, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: manter transform:rotate() no HTML enviado · fotos da colagem alinhadas em vez de sobrepostas · colagem como duas <img> separadas · fita sem repetição · acento fora das fitas · parágrafo de urgência antes da colagem · segundo botão · CTA sem v:roundrect.  

##### Direção fotográfica

Colagem  

Proporção 4:3 — slot de 470 × 360px, ativo final 940 × 720px (2x). PNG, < 260 KB.  

O ativo é composto, não fotografado: duas fotos de 200 × 255px em molduras brancas, inclinadas em sentidos contrários, sobrepostas, com sombra projetada suave. Fundo transparente não é confiável — o arquivo sai com o fundo já na cor primária da seção.  

Montagem: foto da esquerda rotacionada −4°, posicionada a 20px da borda esquerda e 30px do topo; foto da direita rotacionada +6°, a 20px da borda direita e 70px do topo. Moldura branca de 14px em volta de cada uma, sombra de 4px de deslocamento e 11px de desfoque a 25% de opacidade.  

Fotos base — proporção 4:5  

Slot de 200 × 255px cada, dentro da colagem. Ativo de 400 × 510px (2x) antes da montagem.  

Composição. Cena doméstica real com pessoas usando o produto. As duas precisam mostrar escalas diferentes de vínculo: uma em plano fechado, com duas pessoas em contato — abraço, colo, rosto junto —, e outra em plano aberto com o grupo completo posado.  

Cenário e luz. Interior de casa, luz natural de janela, tons claros e quentes. Chão, tapete, cama, sofá. Nada de estúdio.  

Produto. Vestido por todos os presentes na cena, em estampa ou cor coordenada. É o que faz o argumento de "família combinando" funcionar sem precisar dizer.  

Proibições: fundo de estúdio · pessoas sem o produto · as duas fotos na mesma escala · sombra dura · texto/preço/selo queimado · marca d'água.  

Adaptação por categoria — o que são as duas cenas:  

| Categoria | Plano fechado | Plano aberto |  
|---|---|---|  
| Pijama / moda familiar | Abraço entre dois | Grupo completo posado |  
| Brinquedos | Criança concentrada no brinquedo | Família brincando junto |  
| Casa | Detalhe de uso na mesa | Ambiente com todos reunidos |  
| Pet | Tutor e animal juntos | Família com o pet |  
| Alimentos | Momento de provar | Mesa posta com todos |  
| Presentes | Mão abrindo a caixa | Troca de presentes |  

#### Schema de output (7 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `ribbon_text` | `{{RIBBON_TEXT}}` | Texto curto | Copy (n8n) | não | 60 | sim |
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 68 | não |
| `section_copy_1` | `{{SECTION_COPY_1}}` | Texto curto | Copy (n8n) | não | 176 | sim |
| `section_copy_2` | `{{SECTION_COPY_2}}` | Texto curto | Copy (n8n) | não | 176 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `collage_photo_1` | `{{COLLAGE_PHOTO_1}}` | Imagem | Imagem gerada | não | — | — |
| `collage_photo_2` | `{{COLLAGE_PHOTO_2}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`ribbon_text`**
    - *Exemplo:* Black Friday
    - *Orientação:* Nome da campanha, repetido 7× na fita alternando peso, OFERTA
- **`section_title`**
    - *Exemplo:* It's the Perfect Time to Bring Your Family Joy
    - *Orientação:* 68 (2 linhas)<br>Bold, liga a data ao sentimento
- **`section_copy_1`**
    - *Exemplo:* 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
    - *Orientação:* 176 (4 linhas)<br>A cena, em segunda pessoa, até duas exclamações
- **`section_copy_2`**
    - *Exemplo:* 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet,
    - *Orientação:* 176 (4 linhas)<br>A cena, em segunda pessoa, até duas exclamações
- **`cta_label`**
    - *Exemplo:* SHOP BLACK FRIDAY
    - *Orientação:* Caixa alta, verbo + nome da campanha
- **`collage_photo_1`**
    - *Orientação:* Onde fica: moldura da ESQUERDA da colagem (left:20px, inclinada -4deg no HTML), 44px abaixo do primeiro parágrafo. A moldura branca, a inclinação e a sombra são do HTML — a imagem é só a foto.
    - *Imagem:* proporção 4:5 · 200 × 255 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 200 × 255px. Ativo final 400 × 510px (2x), JPG q80, < 90 KB.<br>Cena: plano FECHADO de vínculo entre duas pessoas da família — abraço, colo, rostos juntos, mãos no ombro. Enquadramento vertical, cabeças na parte de cima do quadro, corte na altura do peito.<br>Produto: as pessoas vestem a peça em estampa coordenada com a da outra foto do bloco.<br>Luz e cor: luz natural de janela vindo da esquerda, tons claros e quentes, pele com textura preservada, sem filtro estourado.<br>Enquadrar de borda a borda: a foto é recortada por object-fit:cover no e-mail, então nada essencial nos 8% das bordas.<br>NÃO desenhar moldura, borda branca, inclinação, rotação nem sombra projetada: o HTML aplica os quatro por fora da imagem. A foto entra reta e sangrando até a borda do arquivo.<br>Sem texto, sem logotipo, sem marca d'água no quadro.
- **`collage_photo_2`**
    - *Orientação:* Onde fica: moldura da DIREITA da colagem (right:20px, top:70px, inclinada +6deg no HTML), mais abaixo que a da esquerda. A moldura branca, a inclinação e a sombra são do HTML — a imagem é só a foto.
    - *Imagem:* proporção 4:5 · 200 × 255 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 200 × 255px. Ativo final 400 × 510px (2x), JPG q80, < 90 KB.<br>Cena: o GRUPO completo da família posado em cena doméstica — sala ou cozinha, todos voltados para a câmera, plano médio de corpo inteiro ou três quartos. É o contraponto aberto do plano fechado da outra foto.<br>Produto: todos vestem a peça na mesma estampa coordenada da outra foto do bloco.<br>Luz e cor: mesma luz natural de janela e mesma paleta clara e quente da outra foto — as duas parecem da mesma sessão.<br>Enquadrar de borda a borda: a foto é recortada por object-fit:cover no e-mail, então nada essencial nos 8% das bordas.<br>NÃO desenhar moldura, borda branca, inclinação, rotação nem sombra projetada: o HTML aplica os quatro por fora da imagem. A foto entra reta e sangrando até a borda do arquivo.<br>Sem texto, sem logotipo, sem marca d'água no quadro.

#### HTML

```html
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Black Friday</title>
  <style>
    body { margin: 0; padding: 0; background: #f2f2f2; -webkit-text-size-adjust: 100%; }
    table { border-collapse: collapse; }
    img { border: 0; display: block; }
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body>
  <center>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f2f2f2">
    <tr><td align="center">

      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" bgcolor="#f3f3f3" style="width:600px;">

        <!-- ===== FITAS DIAGONAIS "BLACK FRIDAY" ===== -->
        <tr>
          <td style="padding:0; font-size:0; line-height:0;">
            <div style="position:relative; height:200px; width:600px; overflow:hidden; background:#f3f3f3;">
              <!-- fita descendo -->
              <div style="position:absolute; top:45px; left:-60px; width:720px; height:52px; background:#000000; transform:rotate(-9deg); text-align:center; white-space:nowrap; overflow:hidden;">
                <span style="display:inline-block; line-height:52px; font-family:Arial, Helvetica, sans-serif; font-size:20px; color:#ffffff;">Black&nbsp;Friday&nbsp;·&nbsp;<b>Black&nbsp;Friday</b>&nbsp;·&nbsp;Black&nbsp;Friday&nbsp;·&nbsp;<b>Black&nbsp;Friday</b>&nbsp;·&nbsp;Black&nbsp;Friday&nbsp;·&nbsp;<b>Black&nbsp;Friday</b>&nbsp;·&nbsp;Black&nbsp;Friday</span>
              </div>
              <!-- fita subindo -->
              <div style="position:absolute; top:100px; left:-60px; width:720px; height:52px; background:#000000; transform:rotate(7deg); text-align:center; white-space:nowrap; overflow:hidden;">
                <span style="display:inline-block; line-height:52px; font-family:Arial, Helvetica, sans-serif; font-size:20px; color:#ffffff;">Black&nbsp;Friday&nbsp;·&nbsp;<b>Black&nbsp;Friday</b>&nbsp;·&nbsp;Black&nbsp;Friday&nbsp;·&nbsp;<b>Black&nbsp;Friday</b>&nbsp;·&nbsp;Black&nbsp;Friday&nbsp;·&nbsp;<b>Black&nbsp;Friday</b>&nbsp;·&nbsp;Black&nbsp;Friday</span>
              </div>
            </div>
          </td>
        </tr>

        <!-- ===== TÍTULO ===== -->
        <tr>
          <td align="center" class="px" style="padding:20px 38px 0; font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:31px; font-weight:bold; color:#151515;">
            It's the Perfect Time<br>to Bring Your Family Joy
          </td>
        </tr>

        <!-- ===== PARÁGRAFO 1 ===== -->
        <tr>
          <td align="center" class="px" style="padding:22px 56px 0; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:27px; color:#000000;">
            1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
          </td>
        </tr>

        <!-- ===== COLAGEM DE FOTOS (dois selos inclinados e sobrepostos) ===== -->
        <tr>
          <td align="center" style="padding:44px 0 40px;">
            <!--[if mso]>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
            <![endif]-->
            <div style="position:relative; width:470px; height:360px; margin:0 auto;">
              <!-- foto esquerda -->
              <div style="position:absolute; left:20px; top:30px; transform:rotate(-4deg);">
                <div style="background:#ffffff; padding:14px; box-shadow:0 4px 11px rgba(0,0,0,0.25);">
                  <img src="https://www.figma.com/api/mcp/asset/d9880f17-4c4a-4c00-9c7c-bfeb3240d83c" width="200" height="255" alt="" style="width:200px; height:255px; object-fit:cover; background:#e6e6e6;">
                </div>
              </div>
              <!-- foto direita -->
              <div style="position:absolute; right:20px; top:70px; transform:rotate(6deg);">
                <div style="background:#ffffff; padding:14px; box-shadow:0 4px 11px rgba(0,0,0,0.25);">
                  <img src="https://www.figma.com/api/mcp/asset/d9880f17-4c4a-4c00-9c7c-bfeb3240d83c" width="200" height="255" alt="" style="width:200px; height:255px; object-fit:cover; background:#e6e6e6;">
                </div>
              </div>
            </div>
            <!--[if mso]>
            </td></tr></table>
            <![endif]-->
          </td>
        </tr>

        <!-- ===== PARÁGRAFO 2 ===== -->
        <tr>
          <td align="center" class="px" style="padding:0 56px; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:27px; color:#000000;">
            2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet,
          </td>
        </tr>

        <!-- ===== CTA ===== -->
        <tr>
          <td align="center" style="padding:35px 0 45px;">
            <table role="presentation" width="350" cellpadding="0" cellspacing="0" style="width:350px; max-width:80%;">
              <tr>
                <td align="center" bgcolor="#151515" style="border:2px solid #151515; border-radius:5px; height:55px;">
                  <a href="#" style="display:block; padding:13px 0; font-family:Arial, Helvetica, sans-serif; font-size:25px; font-weight:bold; letter-spacing:-0.25px; color:#ffffff;">SHOP BLACK FRIDAY</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
  </center>
</body>
</html>
```

<a id="v-4e9726d1"></a>

### 3.2 · body 3 - bridge features cards — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Promoção, Newsletter |
| **Tons compatíveis** | Premium, Amigável, Aspiracional |
| **Tags** | light_bg, no_border, single_col, standalone_component, bridge_section, value_prop, feature_cards, three_features, icon_panel_left, card_border, rounded_card, gray_icon_panel, repeatable_blocks, no_cta, no_price, no_mso_fallback, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 4.8 KB |
| **ID** | `4e9726d1-40fe-40ce-aa81-c2a33b062603` |

#### Descrição curta

Pitch de gift card digital com headline anti-objeção, dois parágrafos curtos e CTA, assinado por faixa de 3 selos circulares com valores da marca.  

#### Descrição detalhada

Bloco de texto 100% vivo sobre fundo branco + CTA bulletproof com border-radius (degrada reto no Outlook). Selos = 3 PNGs obrigatórios — texto em círculo não existe em HTML de e-mail; são assets fixos de configuração do cliente (valores de marca não mudam por campanha), gerados 1x e reusados, ~160px cada em row de 3 colunas. Com imagens bloqueadas o pitch sobrevive inteiro (só os selos somem — alt text com o valor de cada um). Mobile: selos de 3 colunas seguram até ~110px cada; abaixo disso, empilhar os 3 centralizados. Os dois módulos (pitch / selos) podem ser separáveis no template — a faixa de selos sozinha serve de assinatura em outros e-mails.  

#### Contexto para a IA

##### Quando usar

Campanhas de gift card — datas de presente (Natal, Dia das Mães/Pais/Namorados), corporate gifting de fim de ano, e como seção de apoio em e-mails sazonais ("não sabe o que dar? gift card"). A faixa de selos entra quando a marca tem valores articulados e quer reforço institucional — especialmente eficaz em B2B/corporate onde cultura vende.  

##### Quando NÃO usar

Clientes sem gift card digital (óbvio, mas o Architect precisa do dado no perfil do cliente: "tem gift card? sim/não"). Sem selos de valores produzidos, usar a variante só-pitch. E-mails promocionais de produto (o gift card compete com a oferta principal).  

##### Orientações de copy para a IA

Headline que mata a objeção de escolher presente (~30 caracteres): "serve pra todo gosto", "impossível errar". Parágrafo 1 funcional: o que é + benefício de conveniência (~110 caracteres); adaptar o destinatário ao contexto (B2C: "quem você ama"; B2B: "seus clientes"). Parágrafo 2 em tríade ritmada "one X, one Y, and Z" (~80 caracteres) — a musicalidade é a assinatura do bloco. CTA nomeando o produto ("DIGITAL GIFT CARD" / "CARTÃO PRESENTE"), não verbo de compra.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (7 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_headline` | `{{SECTION_HEADLINE}}` | Texto curto | Copy (n8n) _(auto)_ | não | 32 | sim |
| `section_body_1` | `{{SECTION_BODY_1}}` | Texto curto | Copy (n8n) _(auto)_ | não | 120 | sim |
| `section_body_2` | `{{SECTION_BODY_2}}` | Texto curto | Copy (n8n) _(auto)_ | não | 85 | sim |
| `section_cta_label` | `{{SECTION_CTA_LABEL}}` | Texto curto | Copy (n8n) _(auto)_ | não | 22 | sim |
| `value_seal_1_image` | `{{VALUE_SEAL_1_IMAGE}}` | Imagem | Imagem gerada _(auto)_ | não | 60 | — |
| `value_seal_2_image` | `{{VALUE_SEAL_2_IMAGE}}` | Imagem | Imagem gerada _(auto)_ | não | 60 | — |
| `value_seal_3_image` | `{{VALUE_SEAL_3_IMAGE}}` | Imagem | Imagem gerada _(auto)_ | não | 60 | — |

**Detalhe dos campos**

- **`section_headline`**
    - *Exemplo:* The Gift That Fits Every Taste
- **`section_body_1`**
    - *Exemplo:* 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit
- **`section_body_2`**
    - *Exemplo:* 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit
- **`section_cta_label`**
    - *Exemplo:* DIGITAL GIFT CARD
- **`value_seal_1_image`**
    - *Exemplo:* https://cdn.cliente.com/seal-care.png
- **`value_seal_2_image`**
    - *Exemplo:* https://cdn.cliente.com/seal-kind.png
- **`value_seal_3_image`**
    - *Exemplo:* https://cdn.cliente.com/seal-great.png

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — The Gift That Fits Every Taste</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:46px 50px 0 50px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:43px;font-weight:700;color:#000000;">
        The Gift That Fits<br>Every Taste
      </td>
    </tr>

    <!-- COPY 1 -->
    <tr>
      <td align="center" class="txt-blk" style="padding:25px 48px 0 48px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:26px;font-weight:400;color:#000000;">
        1 Lorem ipsum dolor sit amet, consectetur adipiscing elit
      </td>
    </tr>

    <!-- COPY 2 -->
    <tr>
      <td align="center" class="txt-blk" style="padding:44px 48px 0 48px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:26px;font-weight:400;color:#000000;">
        2 Lorem ipsum dolor sit amet, consectetur adipiscing elit
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td align="center" style="padding:35px 0 0 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:61px;v-text-anchor:middle;width:354px;" arcsize="13%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:32px;">DIGITAL GIFT CARD</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:354px;">
          <tr>
            <td align="center" height="61" style="width:354px;height:61px;background:#000000;border-radius:8px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:354px;height:61px;line-height:61px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:400;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Digital Gift Card
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

    <!-- ============ TRÊS CÍRCULOS DE ÍCONE ============ -->
    <tr>
      <td align="center" style="padding:63px 0 23px 0;">
        <table role="presentation" width="542" cellpadding="0" cellspacing="0" border="0" style="width:542px;">
          <tr>

            <!-- ícone 1 -->
            <td width="166" align="center" valign="middle" height="166"
                style="width:166px;height:166px;background:#8B8B8B;border-radius:83px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:26px;font-weight:400;color:#FFFFFF;text-align:center;">
              ICON 1
            </td>

            <td width="22" style="width:22px;font-size:0;line-height:0;">&nbsp;</td>

            <!-- ícone 2 -->
            <td width="166" align="center" valign="middle" height="166"
                style="width:166px;height:166px;background:#8B8B8B;border-radius:83px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:26px;font-weight:400;color:#FFFFFF;text-align:center;">
              ICON 2
            </td>

            <td width="22" style="width:22px;font-size:0;line-height:0;">&nbsp;</td>

            <!-- ícone 3 -->
            <td width="166" align="center" valign="middle" height="166"
                style="width:166px;height:166px;background:#8B8B8B;border-radius:83px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:26px;font-weight:400;color:#FFFFFF;text-align:center;">
              ICON 3
            </td>

          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-63736c6c"></a>

### 3.3 · body 4 - bridge fundo cards — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Newsletter, Boas-vindas |
| **Tons compatíveis** | Educacional, Amigável, Descontraído |
| **Tags** | gray_bg, background_image, bg_image_fallback_solid, single_col, standalone_component, bridge_section, value_prop, tag_cards, three_features, pill_tags, single_side_radius, alternating_tag_side, zigzag_layout, overlap_card, negative_margin, solid_cards, no_cta, no_price, no_mso_fallback, mobile_responsive |
| **Tamanho do HTML** | 16.4 KB |
| **ID** | `63736c6c-7d1b-4c7c-83ea-bae15599f1d7` |

#### Descrição curta

Tutorial de uso em 2 colunas paralelas: foto circular do produto, título do modo e passos numerados em badges, com Pro Tip compartilhado e CTA de aprofundamento.  

#### Descrição detalhada

2 cards = table 2 col com TDs bege + border-radius (degrada quadrado). Foto circular cavalgando o topo = overlap inexistente em e-mail — degradar para foto circular DENTRO do card (primeira linha, centralizada); círculo via PNG já recortado circular (border-radius 50% em <img> falha no Outlook — o PNG pronto resolve em todo client). Badges numeradas = TD mínima com background branco + radius contendo o número (degrada quadradinho, ok) ou fallback "1." em texto. Passos 100% vivos. Colunas assimétricas (5 vs 6 passos) são naturais — vertical-align top e cada card com sua altura; o stagger decorativo da referência se perde, sem prejuízo. Fundo texturizado → cor sólida. Pro Tip = bloco de texto vivo com label bold. Mobile: colunas empilham (card 1 sobre card 2) — a comparação lado a lado vira sequência, aceitável.  

#### Contexto para a IA

##### Quando usar

E-mails pós-compra (o uso certo do produto recém-chegado — reduz devolução e review ruim), welcome de produtos com curva de aprendizado, e reengajamento educativo. O formato de 2 colunas pede 2 produtos/modos complementares (shampoo+condicionador, dia+noite, preparo+finalização); para produto único, existe variante de coluna só. Nichos: beauty, skincare, food com preparo, qualquer produto em que "usar errado" gera frustração.  

##### Quando NÃO usar

Campanhas de venda (zero slot de oferta). Produtos autoexplicativos (tutorial de camiseta é ruído). Rotinas com mais de ~6 passos por coluna (vira manual — quebrar em 2 e-mails).  

##### Orientações de copy para a IA

Headline em mantra de 2–4 palavras staccato com pontos ("LATHER. RINSE. REPEAT." / "MOLHA. PASSA. PRONTO.") — o ritmo é a assinatura. Título de coluna = verbo/modo em 1 palavra caps. Passos: imperativos curtíssimos de 3–10 palavras, 1 ação por passo, com detalhe sensorial ou de tempo entre parênteses quando agregar ("3–5 minutos", "você vai sentir o 'slip'") — os parênteses humanizam. Pro Tip: 1 dica de conservação/armazenamento que estende a vida do produto (~110 caracteres). CTA de aprofundamento ("LEARN MORE" / "VER TUTORIAL COMPLETO"), nunca de compra.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_headline` | `{{SECTION_HEADLINE}}` | Texto curto | Copy (n8n) _(auto)_ | não | 25 | não |
| `howto_1_title` | `{{HOWTO_1_TITLE}}` | Texto curto | Copy (n8n) _(auto)_ | não | 12 | não |
| `howto_1_image` | `{{HOWTO_1_IMAGE}}` | Imagem | Imagem gerada _(auto)_ | não | 60 | — |
| `howto_1_steps` | `{{HOWTO_1_STEPS}}` | Texto curto | Copy (n8n) _(auto)_ | não | 60 | não |
| `howto_2_title` | `{{HOWTO_2_TITLE}}` | Texto curto | Copy (n8n) _(auto)_ | não | 12 | não |
| `howto_2_image` | `{{HOWTO_2_IMAGE}}` | Imagem | Imagem gerada _(auto)_ | não | 60 | — |
| `howto_2_steps` | `{{HOWTO_2_STEPS}}` | Texto curto | Copy (n8n) _(auto)_ | não | 60 | não |
| `section_cta_label` | `{{SECTION_CTA_LABEL}}` | Texto curto | Copy (n8n) _(auto)_ | não | 15 | não |
| `section_cta_url` | `{{SECTION_CTA_URL}}` | URL | Copy (n8n) _(auto)_ | não | 60 | não |

**Detalhe dos campos**

- **`section_headline`**
    - *Exemplo:* LATHER. RINSE. REPEAT.
- **`howto_1_title`**
    - *Exemplo:* LATHER
- **`howto_1_image`**
    - *Exemplo:* https://cdn.loja.com/bar1-circle.png
    - *Imagem:* proporção proporção 1:1 (círculo inscrito em quadrado) · 220 × 220 px
    - *Spec da imagem:* mão segurando/aplicando o produto, ação em andamento, recorte circular já no arquivo.
- **`howto_1_steps`**
    - *Exemplo:* ["Wet hair thoroughly.", "Lather bar in your hands or swipe it on your scalp.", ...]
- **`howto_2_title`**
    - *Exemplo:* SOFTEN
- **`howto_2_image`**
    - *Exemplo:* https://cdn.loja.com/bar2-circle.png
    - *Imagem:* proporção proporção 1:1 (círculo inscrito em quadrado) · 220 × 220 px
    - *Spec da imagem:* mão segurando/aplicando o produto, ação em andamento, recorte circular já no arquivo.
- **`howto_2_steps`**
    - *Exemplo:* ["Wet the bar + your hair.", ...]
- **`section_cta_label`**
    - *Exemplo:* LEARN MORE
- **`section_cta_url`**
    - *Exemplo:* https://loja.com/how-to

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Comparativo em duas colunas</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ BLOCO DAS DUAS COLUNAS ============ -->
    <tr>
      <td style="padding:0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>

            <!-- ============================================================ -->
            <!-- COLUNA ESQUERDA — título + painel A                          -->
            <!-- ============================================================ -->
            <td width="290" valign="top" style="width:290px;">
              <table role="presentation" width="290" cellpadding="0" cellspacing="0" border="0" style="width:290px;">

                <!-- TÍTULO DA SEÇÃO -->
                <tr>
                  <td align="left" class="txt-blk" style="padding:50px 0 0 59px;font-family:Arial,Helvetica,sans-serif;font-size:56px;line-height:62px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:#000000;">
                    Title<br>Here
                  </td>
                </tr>

                <!-- TOPO DO PAINEL A: círculo + canto arredondado (imagem composta) -->
                <tr>
                  <td style="padding:56px 0 0 18px;font-size:0;line-height:0;">
                    <img src="URL_TOPO_COLUNA_A" width="272" height="212" alt="ALT_COLUNA_A"
                         style="display:block;width:272px;height:212px;">
                  </td>
                </tr>

                <!-- CORPO DO PAINEL A -->
                <tr>
                  <td style="padding:0 0 0 18px;">
                    <table role="presentation" width="272" cellpadding="0" cellspacing="0" border="0"
                           style="width:272px;background:#BEBEBE;border-radius:0 0 26px 26px;">

                      <!-- TÍTULO DA COLUNA -->
                      <tr>
                        <td align="center" class="txt-blk" style="padding:17px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:700;color:#000000;">
                          TITLE
                        </td>
                      </tr>

                      <!-- item 1 -->
                      <tr>
                        <td align="center" style="padding:27px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">1</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:400;color:#000000;">
                          dolor sit amet,
                        </td>
                      </tr>

                      <!-- item 2 -->
                      <tr>
                        <td align="center" style="padding:20px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">2</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:11px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                      <!-- item 3 -->
                      <tr>
                        <td align="center" style="padding:48px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">3</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                      <!-- item 4 -->
                      <tr>
                        <td align="center" style="padding:32px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">4</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:7px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet,
                        </td>
                      </tr>

                      <!-- item 5 -->
                      <tr>
                        <td align="center" style="padding:18px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">5</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:6px 26px 69px 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>

              </table>
            </td>


            <!-- ============================================================ -->
            <!-- COLUNA DIREITA — painel B                                    -->
            <!-- ============================================================ -->
            <td width="308" valign="top" style="width:308px;">
              <table role="presentation" width="308" cellpadding="0" cellspacing="0" border="0" style="width:308px;">

                <!-- TOPO DO PAINEL B: círculo + canto arredondado (imagem composta) -->
                <tr>
                  <td style="padding:79px 0 0 17px;font-size:0;line-height:0;">
                    <img src="URL_TOPO_COLUNA_B" width="272" height="212" alt="ALT_COLUNA_B"
                         style="display:block;width:272px;height:212px;">
                  </td>
                </tr>

                <!-- CORPO DO PAINEL B -->
                <tr>
                  <td style="padding:0 0 0 17px;">
                    <table role="presentation" width="272" cellpadding="0" cellspacing="0" border="0"
                           style="width:272px;background:#D1D1D1;border-radius:0 0 26px 26px;">

                      <!-- TÍTULO DA COLUNA -->
                      <tr>
                        <td align="center" class="txt-blk" style="padding:18px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:700;color:#000000;">
                          TITLE
                        </td>
                      </tr>

                      <!-- item 1 -->
                      <tr>
                        <td align="center" style="padding:53px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">1</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:400;color:#000000;">
                          dolor sit amet,
                        </td>
                      </tr>

                      <!-- item 2 -->
                      <tr>
                        <td align="center" style="padding:33px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">2</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:11px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                      <!-- item 3 -->
                      <tr>
                        <td align="center" style="padding:37px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">3</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                      <!-- item 4 -->
                      <tr>
                        <td align="center" style="padding:45px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">4</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:7px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet,
                        </td>
                      </tr>

                      <!-- item 5 -->
                      <tr>
                        <td align="center" style="padding:36px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">5</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:6px 26px 0 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                      <!-- item 6 -->
                      <tr>
                        <td align="center" style="padding:45px 0 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:27px;">
                            <tr><td align="center" height="27" style="width:27px;height:27px;background:#FFFFFF;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:27px;color:#000000;">6</td></tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" class="txt-blk" style="padding:6px 26px 44px 26px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;">
                          dolor sit amet, consectetur adipiscing
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>

              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>

    <!-- COPY DE FECHAMENTO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:63px 92px 0 92px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:22px;font-weight:400;color:#000000;">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor,
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td align="center" style="padding:39px 0 50px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:59px;v-text-anchor:middle;width:418px;" arcsize="50%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:23px;font-weight:bold;">SHOP NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:418px;">
          <tr>
            <td align="center" height="59" style="width:418px;height:59px;background:#000000;border-radius:100px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:418px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP NOW
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-7d1c214a"></a>

### 3.4 · body 5 - comparison table us vs them — `INATIVA`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Inativa (fora do pool da IA) |
| **Densidade** | média |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Carrinho abandonado, Newsletter |
| **Tons compatíveis** | Educacional, Premium, Urgente |
| **Tags** | light_bg, no_border, single_col, standalone_component, bridge_section, value_prop, feature_bars, five_features, stacked_bars, black_pills, rounded_container, gray_panel, nested_card, text_only_features, single_cta, full_width_button, no_mso_fallback, mobile_responsive, mobile_safe |
| **Tamanho do HTML** | 11.6 KB |
| **ID** | `7d1c214a-abb1-44b6-bb5e-95777fb0f306` |

#### Descrição curta

Bloco de diferenciação para quando o cliente já entendeu a categoria e está decidindo entre marcas. Coloca a loja lado a lado com a concorrência genérica em cinco critérios e resolve a objeção de "por que pagar mais nesse".  

#### Descrição detalhada

Tabela de três colunas — critério à esquerda, a marca no meio, a concorrência à direita — com cinco linhas de comparação. A coluna do meio é um painel escuro que atravessa a tabela inteira e sobressai acima e abaixo dela, com uma foto circular do produto encaixada no topo. Cada célula das colunas de comparação traz um ícone de validação e uma frase curta. Fecha com um CTA sólido fora da tabela.  

Quatro mecanismos sustentam a seção:  

Coluna do meio como painel, não como célula. O bloco escuro de 192px atravessa toda a altura da tabela, ultrapassa 29px acima e 35px abaixo e tem cantos arredondados nas quatro pontas. Ele é lido como um objeto sobreposto à tabela, não como uma coluna dela.  
Foto circular ancorando a coluna. Um círculo de 118px com o produto se encaixa no topo do painel escuro, metade dentro e metade fora. É a única imagem de produto da seção e serve para dizer de quem é a coluna sem precisar de logo.  
Assimetria deliberada de copy. A célula da marca tem 2 a 4 linhas; a da concorrência tem 2 a 5. As linhas da direita são sempre mais longas — a desvantagem precisa de mais palavras que a vantagem, e é isso que dá altura à linha da tabela.  
Nenhuma marca concorrente é nomeada. A coluna da direita é "outras marcas", genérica. É o que permite a comparação sem risco.  

#### Contexto para a IA

##### Quando usar

Categoria saturada em que o cliente compara preço com um genérico de farmácia ou marketplace.  
Produto com diferencial verificável em critérios objetivos: formulação, ingrediente, uso em pele sensível, sustentabilidade.  
Meio ou fim da régua de welcome, recuperação de carrinho de alto valor, ou e-mail de objeção depois de o cliente já ter visitado a página.  
Marca com posicionamento premium que precisa justificar preço sem falar de preço.  

##### Quando NÃO usar

Marca sem diferencial real nos critérios listados. A tabela expõe: cinco linhas de vantagem vaga soam falsas.  
Categoria em que a compra é por estética ou impulso, não por especificação.  
Quando existe um concorrente dominante identificável — a coluna genérica deixa de funcionar e nomear traz risco jurídico.  
Menos de quatro critérios. Com três linhas a tabela não justifica a estrutura.  
E-mail promocional com desconto: a seção é argumentativa e não tem slot de oferta nenhum.  

##### Orientações de copy para a IA

O rótulo do critério é uma palavra, no máximo duas, em caixa alta. É a única coisa em caixa alta da tabela.  
A coluna da marca afirma; a da concorrência descreve o problema. À esquerda "Long-Lasting Hydration", à direita "Often Leaves Brows Dry After Use". A vantagem é substantiva, a desvantagem é comportamental.  
A coluna da concorrência usa hedge obrigatório — "often", "may", "can", "not always". Nunca afirmação categórica sobre terceiros.  
Title Case em todas as células, nas duas colunas. É o que dá simetria visual a frases de tamanhos diferentes.  
Um critério deve ser não-funcional (sustentabilidade, ética, origem) para a tabela não virar só ficha técnica.  
Cabeçalhos em possessivo e genérico: "Our X" contra "Other Brands" ou equivalente. Nunca nomear concorrente.  
CTA nomeia a categoria comparada, não a loja inteira — o leitor acabou de decidir sobre um produto específico.  

##### Design system

Container: 600px travado. O fundo da seção inteira é um ativo de imagem: foto desfocada e clara no topo que se dissolve num bege chapado   
#EBDFC9 a partir de ~y160 na esquerda e ~y360 na direita.  

Tipografia principal: sans humanista para rótulos, células e CTA. Tipografia secundária: uma serifada em itálico, usada exclusivamente nos dois cabeçalhos de coluna ("Our Aftercare" / "Other Brands"). É o único ponto da seção com segunda família — e é ele que separa o cabeçalho do conteúdo sem precisar de fundo ou régua.  

| Bloco | Tamanho / entrelinha | Peso | Caixa |  
|---|---|---|---|  
| Cabeçalho de coluna (serifada) | 24 / 24 | 400 itálico | Title Case |  
| Rótulo do critério | 17 / 18 | 700 | ALTA |  
| Texto da célula | 20 / 20 | 400 | Title Case |  
| Label do CTA | 22, tracking ~0.12em | 700 | ALTA |  

Cores. Cor primária   
#140E32 — azul-marinho quase preto, usado no painel central, no CTA, nas bordas e em todo o texto escuro. Não existe preto puro na peça. Cor secundária   
#FFFFFF (fundo da tabela e texto sobre o painel). Fundo da seção   
#EBDFC9. Dois acentos com função única:   
#00C109 no ícone de validação e   
#E90000 no ícone de negação.  

Grade e ritmo vertical (medido):  

fundo fotográfico → bege  
   círculo Ø118 centrado em x285, topo em y20  
   painel escuro 192 × 908 (x 189–380, y 71–978), raio 23 nas 4 pontas  
TABELA BRANCA  533 × 845 (x 34–566, y 102–945), raio 23, borda 1px #1C1638  
   colunas: 154 | 192 (painel) | 185  
   cabeçalho          y 171–187, sem separador abaixo  
   linha 1  HYDRATION       cabeçalho+linha = 248 de altura  
   ── separador 1px  
   linha 2  STRENGTH        120  
   ── separador  
   linha 3  SENSITIVE SKIN  142   (rótulo em 2 linhas)  
   ── separador  
   linha 4  INGREDIENTS     147  
   ── separador  
   linha 5  SUSTAINABILITY  186  
   ícone 23 × 23 no topo da célula, ~34px até a primeira linha de texto  
   ↓ 55px da base do painel  
CTA  419 × 75 (x 91), cantos retos, fundo #140E32  

Regras que não podem ser quebradas:  

As três células de cada linha são centralizadas verticalmente. A altura da linha é ditada pela célula mais alta, que é quase sempre a da concorrência.  
O painel central sobressai da tabela em cima e embaixo e tem raio nas quatro pontas. Encaixá-lo como célula comum destrói a variante.  
Os separadores horizontais atravessam só as colunas brancas — nunca cruzam o painel.  
Não há separador abaixo do cabeçalho. A primeira régua aparece só depois da linha 1.  
Os ícones são blocos chapados de 23×23, não emoji de fonte. Emoji renderiza diferente em cada cliente e quebra a única cor da seção.  
Verde só no ícone de validação, vermelho só no de negação. Nenhum dos dois aparece em texto, borda ou fundo.  
Todo o escuro da peça é o mesmo   
#140E32 — painel, CTA, bordas e texto. Preto puro endurece a composição contra o bege.  

##### Direção fotográfica

Dois ativos com funções opostas: um retrato de produto nítido e fechado, e um fundo que precisa desaparecer.  

Círculo de produto: vários frascos ou unidades do item espalhados sobre superfície clara, vistos de cima, luz natural difusa, com brilho de vidro e metal. Enquadramento fechado o bastante para os rótulos serem sugeridos mas não lidos. Composição espalhada, sem centro óbvio — o círculo corta o quadro e o assunto precisa preencher todas as bordas.  

Fundo: a mesma cena fotografada bem desfocada e superexposta, ocupando só o terço superior e se dissolvendo num bege chapado antes de chegar à tabela. Nada reconhecível: o que sobra é textura e temperatura de cor.  

Paleta: creme, dourado claro, branco quente. A foto tem que conversar com o bege do fundo, não contrastar com ele.  
Luz: natural, alta, sem sombra dura e sem fundo colorido.  
Proibições: modelo, mão, fundo escuro, produto isolado em fundo branco de e-commerce, sombra projetada forte, qualquer elemento nítido no ativo de fundo.  

#### Schema de output (16 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `compare_feature_1` | `{{COMPARE_FEATURE_1}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `compare_feature_4` | `{{COMPARE_FEATURE_4}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `compare_feature_3` | `{{COMPARE_FEATURE_3}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `compare_feature_2` | `{{COMPARE_FEATURE_2}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `compare_feature_1_ours` | `{{COMPARE_FEATURE_1_OURS}}` | Texto curto | Copy (n8n) | não | 48 | não |
| `compare_feature_2_ours` | `{{COMPARE_FEATURE_2_OURS}}` | Texto curto | Copy (n8n) | não | 48 | não |
| `compare_feature_3_ours` | `{{COMPARE_FEATURE_3_OURS}}` | Texto curto | Copy (n8n) | não | 48 | não |
| `compare_feature_4_ours` | `{{COMPARE_FEATURE_4_OURS}}` | Texto curto | Copy (n8n) | não | 48 | não |
| `compare_feature_5_ours` | `{{COMPARE_FEATURE_5_OURS}}` | Texto curto | Copy (n8n) | não | 48 | não |
| `compare_feature_1_theirs` | `{{COMPARE_FEATURE_1_THEIRS}}` | Texto curto | Copy (n8n) | não | 58 | não |
| `compare_feature_2_theirs` | `{{COMPARE_FEATURE_2_THEIRS}}` | Texto curto | Copy (n8n) | não | 58 | não |
| `compare_feature_3_theirs` | `{{COMPARE_FEATURE_3_THEIRS}}` | Texto curto | Copy (n8n) | não | 58 | não |
| `compare_feature_4_theirs` | `{{COMPARE_FEATURE_4_THEIRS}}` | Texto curto | Copy (n8n) | não | 58 | não |
| `compare_feature_5_theirs` | `{{COMPARE_FEATURE_5_THEIRS}}` | Texto curto | Copy (n8n) | não | 58 | não |
| `compare_circle_image` | `{{COMPARE_CIRCLE_IMAGE}}` | Imagem | Imagem gerada | não | — | — |
| `compare_background_image` | `{{COMPARE_BACKGROUND_IMAGE}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`compare_feature_1`**
    - *Exemplo:* Feature 1
- **`compare_feature_4`**
    - *Exemplo:* Feature 4
- **`compare_feature_3`**
    - *Exemplo:* Feature 3
- **`compare_feature_2`**
    - *Exemplo:* Feature 2
- **`compare_feature_1_ours`**
    - *Exemplo:* Lorem Ipsum Dolor 1
- **`compare_feature_2_ours`**
    - *Exemplo:* Lorem Ipsum Dolor 3
- **`compare_feature_3_ours`**
    - *Exemplo:* Lorem Ipsum Dolor 5
- **`compare_feature_4_ours`**
    - *Exemplo:* Lorem Ipsum Dolor 7
- **`compare_feature_5_ours`**
    - *Exemplo:* Lorem Ipsum Dolor 9
- **`compare_feature_1_theirs`**
    - *Exemplo:* Lorem Ipsum Dolor 2
- **`compare_feature_2_theirs`**
    - *Exemplo:* Lorem Ipsum Dolor 4
- **`compare_feature_3_theirs`**
    - *Exemplo:* Lorem Ipsum Dolor 6
- **`compare_feature_4_theirs`**
    - *Exemplo:* Lorem Ipsum Dolor 8
- **`compare_feature_5_theirs`**
    - *Exemplo:* Lorem Ipsum Dolor 10
- **`compare_circle_image`**
    - *Orientação:* Onde: círculo encaixado no topo do painel escuro, centrado em x285, com o topo 51px acima da borda superior do painel.<br>Slot: 118 × 118 px display (236 × 236 @2x) · proporção 1:1 · JPG, máscara circular aplicada na montagem.
    - *Imagem:* proporção 1:1 · 236 × 236 px
    - *Spec da imagem:* Como gerar: gerar em 1:1 direto em 236 × 236. Sem corte. Compor com o assunto preenchendo as bordas, porque os cantos são descartados pela máscara.<br>Ideia: várias unidades do produto vistas de cima sobre superfície clara, espalhadas, com brilho de vidro e luz natural difusa.
- **`compare_background_image`**
    - *Orientação:* Onde: fundo de toda a seção, atrás da tabela, do painel e do CTA.<br>Slot: 600 px de largura × altura total da seção · sem proporção fixa (é um ativo composto, não uma foto) · PNG ou JPG.
    - *Imagem:* proporção 1:1
    - *Spec da imagem:* Como gerar: gerar a foto de origem em 1:1, aplicar desfoque forte e superexposição, colar no topo de um canvas de 600px de largura e degradar para #EBDFC9 chapado até ~y360. O restante do canvas é bege sólido.<br>Ideia: a mesma cena do círculo, irreconhecível de tão desfocada — só textura clara e temperatura quente no topo da peça.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Comparativo Our Aftercare x Other Brands</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#F3F3F3;">

    <tr>
      <td background="URL_DA_FORMA_DE_FUNDO"
          valign="top"
          style="background-color:#F3F3F3;background-image:url('URL_DA_FORMA_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 1251px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:1251px;">
          <v:fill type="frame" src="URL_DA_FORMA_DE_FUNDO" color="#F3F3F3" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- ============ TABELA COMPARATIVA ============ -->
          <tr>
            <td style="padding:33px 31px 0 32px;">
              <table role="presentation" width="535" cellpadding="0" cellspacing="0" border="0" style="width:535px;">

                <!-- LINHA 0 — sobra superior da coluna preta -->
                <tr>
                  <td width="155" height="31" style="width:155px;height:31px;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="193" style="width:193px;background:#000000;border-radius:23px 23px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="187" style="width:187px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>

                <!-- LINHA DE CABEÇALHO -->
                <tr>
                  <td height="116" valign="top" style="height:116px;background:#FFFFFF;border-left:1px solid #130E31;border-top:1px solid #130E31;border-radius:23px 0 0 0;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="top" align="center" class="txt-wht" style="background:#000000;padding:68px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:24px;font-style:italic;font-weight:400;color:#FFFFFF;">
                    Our Aftercare
                  </td>
                  <td valign="top" align="center" style="background:#FFFFFF;border-right:1px solid #130E31;border-top:1px solid #130E31;border-radius:0 23px 0 0;padding:68px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:24px;font-style:italic;font-weight:400;color:#130E31;">
                    Other Brands
                  </td>
                </tr>

                <!-- ===== LINHA 1 ===== -->
                <tr>
                  <td height="131" valign="top" align="center" class="txt-blk" style="height:131px;background:#FFFFFF;border-left:1px solid #130E31;border-bottom:1px solid #130E31;padding:68px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:23px;font-weight:700;text-transform:uppercase;color:#000000;">
                     Feature 1
                  </td>
                  <td valign="top" align="center" style="background:#000000;padding:21px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#9989; 1</div>
                    <div class="txt-wht" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#FFFFFF;">Lorem<br>Ipsum Dolor 1</div>
                  </td>
                  <td valign="top" align="center" style="background:#FFFFFF;border-right:1px solid #130E31;border-bottom:1px solid #130E31;padding:14px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#10060; 1</div>
                    <div class="txt-blk" style="padding-top:19px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#000000;">Lorem<br>Ipsum Dolor 2</div>
                  </td>
                </tr>

                <!-- ===== LINHA 2 ===== -->
                <tr>
                  <td height="119" valign="top" align="center" class="txt-blk" style="height:119px;background:#FFFFFF;border-left:1px solid #130E31;border-bottom:1px solid #130E31;padding:57px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:23px;font-weight:700;text-transform:uppercase;color:#000000;">
                     Feature 2
                  </td>
                  <td valign="top" align="center" style="background:#000000;padding:16px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#9989; 2</div>
                    <div class="txt-wht" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#FFFFFF;">Lorem<br>Ipsum Dolor 3</div>
                  </td>
                  <td valign="top" align="center" style="background:#FFFFFF;border-right:1px solid #130E31;border-bottom:1px solid #130E31;padding:13px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#10060; 2</div>
                    <div class="txt-blk" style="padding-top:19px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#000000;">Lorem<br>Ipsum Dolor 4</div>
                  </td>
                </tr>

                <!-- ===== LINHA 3 ===== -->
                <tr>
                  <td height="142" valign="top" align="center" class="txt-blk" style="height:142px;background:#FFFFFF;border-left:1px solid #130E31;border-bottom:1px solid #130E31;padding:61px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:23px;font-weight:700;text-transform:uppercase;color:#000000;">
                     Feature 3
                  </td>
                  <td valign="top" align="center" style="background:#000000;padding:24px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#9989; 3</div>
                    <div class="txt-wht" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#FFFFFF;">Lorem<br>Ipsum Dolor 5</div>
                  </td>
                  <td valign="top" align="center" style="background:#FFFFFF;border-right:1px solid #130E31;border-bottom:1px solid #130E31;padding:27px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#10060; 3</div>
                    <div class="txt-blk" style="padding-top:19px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#000000;">Lorem<br>Ipsum Dolor 6</div>
                  </td>
                </tr>

                <!-- ===== LINHA 4 ===== -->
                <tr>
                  <td height="148" valign="top" align="center" class="txt-blk" style="height:148px;background:#FFFFFF;border-left:1px solid #130E31;border-bottom:1px solid #130E31;padding:65px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:18px;font-weight:700;text-transform:uppercase;color:#000000;">
                     Feature 4
                  </td>
                  <td valign="top" align="center" style="background:#000000;padding:24px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#9989; 4</div>
                    <div class="txt-wht" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#FFFFFF;">Lorem<br>Ipsum Dolor 7</div>
                  </td>
                  <td valign="top" align="center" style="background:#FFFFFF;border-right:1px solid #130E31;border-bottom:1px solid #130E31;padding:30px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#10060; 4</div>
                    <div class="txt-blk" style="padding-top:19px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#000000;">Lorem<br>Ipsum Dolor 8</div>
                  </td>
                </tr>

                <!-- ===== LINHA 5 ===== -->
                <tr>
                  <td height="188" valign="top" align="center" class="txt-blk" style="height:188px;background:#FFFFFF;border-left:1px solid #130E31;border-bottom:1px solid #130E31;border-radius:0 0 0 23px;padding:72px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:18px;font-weight:700;text-transform:uppercase;color:#000000;">
                     Feature 5
                  </td>
                  <td valign="top" align="center" style="background:#000000;padding:59px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#9989; 5</div>
                    <div class="txt-wht" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#FFFFFF;">Lorem<br>Ipsum Dolor 9</div>
                  </td>
                  <td valign="top" align="center" style="background:#FFFFFF;border-right:1px solid #130E31;border-bottom:1px solid #130E31;border-radius:0 0 23px 0;padding:45px 20px 0 20px;">
                    <div style="font-size:24px;line-height:25px;">&#10060; 5</div>
                    <div class="txt-blk" style="padding-top:19px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:22px;font-weight:400;color:#000000;">Lorem<br>Ipsum Dolor 10</div>
                  </td>
                </tr>

                <!-- LINHA 6 — sobra inferior da coluna preta -->
                <tr>
                  <td height="33" style="height:33px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="background:#000000;border-radius:0 0 23px 23px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:51px 0 195px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:432px;">
                <tr>
                  <td align="center" height="64" style="width:432px;height:64px;background:#000000;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:432px;height:64px;line-height:64px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      Shop Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-35a68bb0"></a>

### 3.5 · body 6 - bridge skin minimalism 101 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, no_border, single_col, standalone_component, bridge_section, value_prop, text_only, centered_layout, headline_text_cta, large_cta, full_width_button, no_images, no_mso_fallback, mobile_responsive, mobile_safe, minimal |
| **Tamanho do HTML** | 7.4 KB |
| **ID** | `35a68bb0-7a74-40bc-a342-32ef68605aaf` |

#### Descrição curta

_(vazio)_

#### Descrição detalhada

_(vazio)_

#### Contexto para a IA

##### Quando usar

_(vazio)_

##### Quando NÃO usar

_(vazio)_

##### Orientações de copy para a IA

_(vazio)_

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (0 campos)

_Sem schema cadastrado._ Sem os campos declarados, a copy do n8n não tem endereço neste bloco e a variante não é preenchível pelo pipeline.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Skin Minimalism 101</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-prim { color:#28100E !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ TÍTULO ESCALONADO ============ -->

    <!-- linha 1: SKIN + traço -->
    <tr>
      <td style="padding:50px 130px 0 79px;">
        <table role="presentation" width="389" cellpadding="0" cellspacing="0" border="0" style="width:389px;">
          <tr>
            <td width="125" valign="middle" class="txt-prim" style="width:125px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:50px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:#28100E;">
              SKIN
            </td>
            <td width="13" style="width:13px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="251" valign="middle" style="width:251px;font-size:0;line-height:0;">
              <table role="presentation" width="251" cellpadding="0" cellspacing="0" border="0" style="width:251px;">
                <tr><td height="1" style="width:251px;height:1px;background:#000000;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- linha 2: MINIMALISM -->
    <tr>
      <td class="txt-prim" style="padding:0 114px 0 167px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:50px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:#28100E;">
        MINIMALISM
      </td>
    </tr>

    <!-- linha 3: 101 vazado (texto) -->
    <tr>
      <td align="right" style="padding:0 80px 0 0;">

        <!-- Outlook: sem contorno, texto solido escuro -->
        <!--[if mso]>
        <div style="font-family:Arial,sans-serif;font-size:90px;line-height:90px;font-weight:bold;letter-spacing:2.7px;color:#28100E;text-align:right;">101</div>
        <![endif]-->

        <!-- demais clientes: preenchimento creme + contorno escuro -->
        <!--[if !mso]><!-- -->
        <div class="txt-101" style="font-family:Arial,Helvetica,sans-serif;font-size:90px;line-height:90px;font-weight:700;letter-spacing:0.03em;text-align:right;color:#F2EDE7;-webkit-text-stroke:1.5px #28100E;text-shadow:1px 0 0 #28100E,-1px 0 0 #28100E,0 1px 0 #28100E,0 -1px 0 #28100E,1px 1px 0 #28100E,-1px -1px 0 #28100E,1px -1px 0 #28100E,-1px 1px 0 #28100E;">101</div>
        <!--<![endif]-->

      </td>
    </tr>


    <!-- ============ GRADE DE 4 CARDS ============ -->
    <tr>
      <td align="center" style="padding:32px 0 0 0;">
        <table role="presentation" width="411" cellpadding="0" cellspacing="0" border="0" style="width:411px;">

          <!-- linha 1 -->
          <tr>
            <td width="198" valign="top" height="230"
                style="width:198px;height:230px;background:#D9D9D9;border-radius:10px;padding:54px 17px 0 17px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;text-align:center;">
                Lorem <strong style="font-weight:700;">ipsum dolor sit</strong> amet, consectetur adipiscing elit, sed do eiusmod tempor,
              </div>
            </td>
            <td width="15" style="width:15px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="198" valign="top" height="230"
                style="width:198px;height:230px;background:#FFFFFF;border:1px solid #000000;border-radius:10px;padding:54px 17px 0 17px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;text-align:center;">
                Lorem <strong style="font-weight:700;">ipsum dolor sit</strong> amet, consectetur adipiscing elit, sed do eiusmod tempor,
              </div>
            </td>
          </tr>

          <tr><td colspan="3" height="15" style="height:15px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- linha 2 -->
          <tr>
            <td valign="top" height="230"
                style="width:198px;height:230px;background:#FFFFFF;border:1px solid #000000;border-radius:10px;padding:54px 17px 0 17px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;text-align:center;">
                Lorem <strong style="font-weight:700;">ipsum dolor sit</strong> amet, consectetur adipiscing elit, sed do eiusmod tempor,
              </div>
            </td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td valign="top" height="230"
                style="width:198px;height:230px;background:#FFFFFF;border:1px solid #000000;border-radius:10px;padding:54px 17px 0 17px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:20px;font-weight:400;color:#000000;text-align:center;">
                Lorem <strong style="font-weight:700;">ipsum dolor sit</strong> amet, consectetur adipiscing elit, sed do eiusmod tempor,
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:32px 0 72px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:59px;v-text-anchor:middle;width:418px;" arcsize="50%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:23px;font-weight:bold;">SHOP NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:418px;">
          <tr>
            <td align="center" height="59" style="width:418px;height:59px;background:#000000;border-radius:100px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:418px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP NOW
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-d699e212"></a>

### 3.6 · body 7 - bridge FAQ — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, no_border, single_col, standalone_component, bridge_section, value_prop, numbered_steps, three_steps, how_it_works, dark_step_blocks, black_cards, giant_numbers, rounded_blocks, alternating_layout, zigzag_layout, framed_images, no_cta, no_price, mobile_responsive, not_mobile_stacked, custom_font_fallback |
| **Tamanho do HTML** | 13.1 KB |
| **ID** | `d699e212-57df-4b68-a80c-2b2aa81372c0` |

#### Descrição curta

_(vazio)_

#### Descrição detalhada

_(vazio)_

#### Contexto para a IA

##### Quando usar

_(vazio)_

##### Quando NÃO usar

_(vazio)_

##### Orientações de copy para a IA

_(vazio)_

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (0 campos)

_Sem schema cadastrado._ Sem os campos declarados, a copy do n8n não tem endereço neste bloco e a variante não é preenchível pelo pipeline.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — FAQs em formato de conversa</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ CABEÇALHO ============ -->
    <tr>
      <td align="center" class="txt-blk" style="padding:29px 85px 0 85px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:51px;line-height:51px;font-weight:700;font-style:italic;color:#000000;">
        FAQs
      </td>
    </tr>
    <tr>
      <td align="center" class="txt-blk" style="padding:0 85px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:25px;line-height:30px;font-weight:400;font-style:italic;color:#000000;">
        Copy Text Here
      </td>
    </tr>


    <!-- ============ MENSAGEM 1 — recebida ============ -->
    <tr>
      <td style="padding:41px 0 0 35px;">
        <table role="presentation" width="276" cellpadding="0" cellspacing="0" border="0" style="width:276px;">
          <tr>
            <td width="30" valign="middle" style="width:30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:30px;">
                <tr><td height="30" style="width:30px;height:30px;background:#C4C4C4;border-radius:15px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="28" style="width:28px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="218" valign="middle" style="width:218px;">
              <table role="presentation" width="218" cellpadding="0" cellspacing="0" border="0" style="width:218px;border:1px solid #000000;border-radius:8px;">
                <tr>
                  <td height="34" valign="middle" style="width:218px;height:34px;padding:0 9px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#2E2E2E;">
                    Lorem ipsum dolor sit amet,
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:11px 0 0 95px;font-family:'Public Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:12px;color:#333333;">
        5:00 PM
      </td>
    </tr>


    <!-- ============ MENSAGEM 2 — enviada ============ -->
    <tr>
      <td style="padding:14px 36px 0 132px;">
        <table role="presentation" width="432" cellpadding="0" cellspacing="0" border="0" style="width:432px;">
          <tr>
            <td width="374" valign="middle" style="width:374px;">
              <table role="presentation" width="374" cellpadding="0" cellspacing="0" border="0" style="width:374px;background:#000000;border:1px solid #000000;border-radius:8px;">
                <tr>
                  <td style="padding:20px 16px;">
                    <div class="txt-wht" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#FFFFFF;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
                    </div>
                    <div class="txt-wht" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#FFFFFF;">
                      labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
                    </div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="28" style="width:28px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="30" valign="middle" style="width:30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:30px;">
                <tr><td height="30" style="width:30px;height:30px;background:#000000;border-radius:15px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="left" style="padding:4px 0 0 466px;font-family:'Public Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:12px;color:#333333;">
        5:01 PM
      </td>
    </tr>


    <!-- ============ MENSAGEM 3 — recebida ============ -->
    <tr>
      <td style="padding:0 0 0 35px;">
        <table role="presentation" width="276" cellpadding="0" cellspacing="0" border="0" style="width:276px;">
          <tr>
            <td width="30" valign="middle" style="width:30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:30px;">
                <tr><td height="30" style="width:30px;height:30px;background:#C4C4C4;border-radius:15px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="28" style="width:28px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="218" valign="middle" style="width:218px;">
              <table role="presentation" width="218" cellpadding="0" cellspacing="0" border="0" style="width:218px;border:1px solid #000000;border-radius:8px;">
                <tr>
                  <td height="34" valign="middle" style="width:218px;height:34px;padding:0 9px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#2E2E2E;">
                    Lorem ipsum dolor sit amet,
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 0 0 95px;font-family:'Public Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:12px;color:#333333;">
        5:05 PM
      </td>
    </tr>


    <!-- ============ MENSAGEM 4 — enviada ============ -->
    <tr>
      <td style="padding:14px 36px 0 132px;">
        <table role="presentation" width="432" cellpadding="0" cellspacing="0" border="0" style="width:432px;">
          <tr>
            <td width="374" valign="middle" style="width:374px;">
              <table role="presentation" width="374" cellpadding="0" cellspacing="0" border="0" style="width:374px;background:#000000;border:1px solid #000000;border-radius:8px;">
                <tr>
                  <td height="130" valign="middle" style="padding:20px 16px;">
                    <div class="txt-wht" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#FFFFFF;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
                    </div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="28" style="width:28px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="30" valign="middle" style="width:30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:30px;">
                <tr><td height="30" style="width:30px;height:30px;background:#000000;border-radius:15px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="left" style="padding:4px 0 0 466px;font-family:'Public Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:12px;color:#333333;">
        5:06 PM
      </td>
    </tr>


    <!-- ============ MENSAGEM 5 — recebida ============ -->
    <tr>
      <td style="padding:11px 0 0 35px;">
        <table role="presentation" width="276" cellpadding="0" cellspacing="0" border="0" style="width:276px;">
          <tr>
            <td width="30" valign="middle" style="width:30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:30px;">
                <tr><td height="30" style="width:30px;height:30px;background:#C4C4C4;border-radius:15px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="28" style="width:28px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="218" valign="middle" style="width:218px;">
              <table role="presentation" width="218" cellpadding="0" cellspacing="0" border="0" style="width:218px;border:1px solid #000000;border-radius:8px;">
                <tr>
                  <td height="34" valign="middle" style="width:218px;height:34px;padding:0 9px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#2E2E2E;">
                    Lorem ipsum dolor sit amet,
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:11px 0 0 95px;font-family:'Public Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:12px;color:#333333;">
        5:12 PM
      </td>
    </tr>


    <!-- ============ MENSAGEM 6 — enviada ============ -->
    <tr>
      <td style="padding:14px 36px 0 132px;">
        <table role="presentation" width="432" cellpadding="0" cellspacing="0" border="0" style="width:432px;">
          <tr>
            <td width="374" valign="middle" style="width:374px;">
              <table role="presentation" width="374" cellpadding="0" cellspacing="0" border="0" style="width:374px;background:#000000;border:1px solid #000000;border-radius:8px;">
                <tr>
                  <td height="130" valign="middle" style="padding:20px 16px;">
                    <div class="txt-wht" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;color:#FFFFFF;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
                    </div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="28" style="width:28px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="30" valign="middle" style="width:30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:30px;">
                <tr><td height="30" style="width:30px;height:30px;background:#76695A;border-radius:15px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="left" style="padding:4px 0 0 466px;font-family:'Public Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:12px;color:#333333;">
        5:14 PM
      </td>
    </tr>


    <!-- ============ CTA ============ -->
    <tr>
      <td align="center" style="padding:11px 0 68px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:57px;v-text-anchor:middle;width:355px;" arcsize="7%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;font-style:italic;">SHOP NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:355px;">
          <tr>
            <td align="center" height="57" style="width:355px;height:57px;background:#000000;border-radius:4px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:355px;height:57px;line-height:57px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;font-style:italic;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Shop Now
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-753d7e86"></a>

### 3.7 · body 8 - cards vidro — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | dark_bg, background_image, bg_image_fallback_solid, single_col, standalone_component, bridge_section, value_prop, announcement, giveaway, banner_block, two_products, zigzag_layout, alternating_image_side, white_final_card, pill_button, mso_fallback, custom_font_fallback, no_price, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 4.1 KB |
| **ID** | `753d7e86-f909-4322-93d8-99f0f2381c01` |

#### Descrição curta

_(vazio)_

#### Descrição detalhada

_(vazio)_

#### Contexto para a IA

##### Quando usar

_(vazio)_

##### Quando NÃO usar

_(vazio)_

##### Orientações de copy para a IA

_(vazio)_

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (0 campos)

_Sem schema cadastrado._ Sem os campos declarados, a copy do n8n não tem endereço neste bloco e a variante não é preenchível pelo pipeline.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Cards de vidro sobre fotos</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- TÍTULO (texto ao vivo) -->
    <tr>
      <td align="center" class="txt-blk" style="padding:33px 85px 0 85px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:33px;line-height:40px;font-weight:700;font-style:italic;color:#000000;">
        TEXT HERE
      </td>
    </tr>
    <tr>
      <td align="center" class="txt-blk" style="padding:0 85px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:25px;line-height:30px;font-weight:400;font-style:italic;color:#000000;">
        TEXT HERE
      </td>
    </tr>


    <!-- ============ COMPOSIÇÃO ACHATADA + CTA POR CIMA ============ -->
    <tr>
      <td background="URL_DA_COMPOSICAO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_COMPOSICAO');background-position:center top;background-repeat:no-repeat;background-size:600px 850px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:850px;">
          <v:fill type="frame" src="URL_DA_COMPOSICAO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
          <tr>
            <td align="center" style="padding:731px 0 62px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:57px;v-text-anchor:middle;width:355px;" arcsize="7%" stroke="f" fillcolor="#000000">
                <w:anchorlock/>
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">SHOP FOR ANY OCCASION</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:355px;">
                <tr>
                  <td align="center" height="57" style="width:355px;height:57px;background:#000000;border-radius:4px;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:355px;height:57px;line-height:57px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      Shop for any occasion
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>
        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-2daabd5e"></a>

### 3.8 · body 9 - key features pilulas — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, no_border, single_col, standalone_component, bridge_section, value_prop, lifestyle_images, image_sandwich, card_between_images, overlap_card, negative_margin, top_and_bottom_images, centered_card, auto_width_button, single_cta, no_mso_fallback, mobile_responsive, mobile_safe, no_price |
| **Tamanho do HTML** | 9.2 KB |
| **ID** | `2daabd5e-f366-4130-b6f8-636ad77781f4` |

#### Descrição curta

_(vazio)_

#### Descrição detalhada

_(vazio)_

#### Contexto para a IA

##### Quando usar

_(vazio)_

##### Quando NÃO usar

_(vazio)_

##### Orientações de copy para a IA

_(vazio)_

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (0 campos)

_Sem schema cadastrado._ Sem os campos declarados, a copy do n8n não tem endereço neste bloco e a variante não é preenchível pelo pipeline.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Key Features em pílulas</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:598px 1029px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:1029px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- EYEBROW -->
          <tr>
            <td align="center" class="txt-blk" style="padding:72px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:29px;font-weight:400;color:#000000;">
              EYEBROW TEXT GOES HERE
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td align="center" class="txt-blk" style="padding:38px 20px 0 20px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:80px;line-height:77px;font-weight:700;font-style:italic;color:#000000;">
              TITLE GOES<br>HERE
            </td>
          </tr>


          <!-- ============ PÍLULA 1 ============ -->
          <tr>
            <td align="center" style="padding:89px 0 0 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:73px;v-text-anchor:middle;width:525px;" arcsize="50%" stroke="f" fillcolor="#A7A7A7">
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:30px;">Key Features copy here</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:525px;">
                <tr>
                  <td align="center" valign="middle" height="73" class="txt-wht"
                      style="width:525px;height:73px;background:#A7A7A7;border-radius:37px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:30px;line-height:29px;font-weight:400;color:#FFFFFF;">
                    Key Features copy here 1
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ============ PÍLULA 2 ============ -->
          <tr>
            <td align="center" style="padding:29px 0 0 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:73px;v-text-anchor:middle;width:525px;" arcsize="50%" stroke="f" fillcolor="#A7A7A7">
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:30px;">Key Features copy here</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:525px;">
                <tr>
                  <td align="center" valign="middle" height="73" class="txt-wht"
                      style="width:525px;height:73px;background:#A7A7A7;border-radius:37px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:30px;line-height:29px;font-weight:400;color:#FFFFFF;">
                    Key Features copy here 2
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ============ PÍLULA 3 ============ -->
          <tr>
            <td align="center" style="padding:29px 0 0 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:73px;v-text-anchor:middle;width:525px;" arcsize="50%" stroke="f" fillcolor="#A7A7A7">
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:30px;">Key Features copy here</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:525px;">
                <tr>
                  <td align="center" valign="middle" height="73" class="txt-wht"
                      style="width:525px;height:73px;background:#A7A7A7;border-radius:37px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:30px;line-height:29px;font-weight:400;color:#FFFFFF;">
                    Key Features copy here 3
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ============ PÍLULA 4 ============ -->
          <tr>
            <td align="center" style="padding:29px 0 0 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:73px;v-text-anchor:middle;width:525px;" arcsize="50%" stroke="f" fillcolor="#A7A7A7">
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:30px;">Key Features copy here</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:525px;">
                <tr>
                  <td align="center" valign="middle" height="73" class="txt-wht"
                      style="width:525px;height:73px;background:#A7A7A7;border-radius:37px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:30px;line-height:29px;font-weight:400;color:#FFFFFF;">
                    Key Features copy here 4
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ============ PÍLULA 5 ============ -->
          <tr>
            <td align="center" style="padding:29px 0 0 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:73px;v-text-anchor:middle;width:525px;" arcsize="50%" stroke="f" fillcolor="#A7A7A7">
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:30px;">Key Features copy here</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:525px;">
                <tr>
                  <td align="center" valign="middle" height="73" class="txt-wht"
                      style="width:525px;height:73px;background:#A7A7A7;border-radius:37px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:30px;line-height:29px;font-weight:400;color:#FFFFFF;">
                    Key Features copy here 5
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>


          <!-- CTA -->
          <tr>
            <td align="center" style="padding:82px 0 42px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:392px;">
                <tr>
                  <td align="center" height="58" style="width:392px;height:58px;background:#333333;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:392px;height:58px;line-height:58px;font-family:'Cera Pro',Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.15em;text-indent:0.15em;color:#FFFFFF;text-decoration:none;text-align:center;">
                      FINISH MY ORDER
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-42c883e5"></a>

### 3.9 · body 10 - listicle educativo 3 dicas — `INATIVA`

| | |
|---|---|
| **Tipo de seção** | Value Proposition / Body (`body`) |
| **Status** | Inativa (fora do pool da IA) |
| **Densidade** | média |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 9.5 KB |
| **ID** | `42c883e5-6c4a-43df-b18f-e7ee866e4ae7` |

#### Descrição curta

Bloco de conteúdo educativo para quando a venda depende de o cliente entender um contexto antes de comprar. Entrega uma lista numerada de três itens com explicação e miniatura, e só converte no CTA depois de ter ensinado alguma coisa  

#### Descrição detalhada

Texto de abertura centralizado dentro de um painel arredondado, seguido de três cards empilhados dentro do mesmo painel, cada um com miniatura vertical à esquerda, título numerado e parágrafo explicativo alinhados à esquerda. Abaixo do painel, fora dele, dois parágrafos de fechamento centralizados e um CTA sólido.  

Quatro mecanismos sustentam a seção:  

Painel como delimitador de conteúdo. A lista vive dentro de um painel de fundo levemente distinto; a abertura contextual e o fechamento ficam soltos sobre o fundo da peça. A moldura separa visualmente "o que estou ensinando" de "o que estou dizendo".  
Card que cresce com o texto. Os três cards medem 496 de largura e alturas diferentes — 257, 232 e 228 na referência. Nenhum campo é truncado para caber.  
Miniatura em faixa vertical que acompanha o card. A imagem tem largura fixa de 77px e altura igual à do card menos 20px de folga em cima e embaixo (217, 194 e 187 na referência). Não é um crop de tamanho fixo: é uma tira que estica.  
Ressalva em negrito dentro do parágrafo. O aviso de responsabilidade aparece como trecho grifado no meio da frase de fechamento, não como bloco separado nem como letra miúda. É o único negrito fora dos títulos dos cards.  

#### Contexto para a IA

##### Quando usar

Categoria em que o cliente precisa entender um mecanismo antes de comprar: suplemento, skincare ativo, saúde, nutrição, equipamento técnico.  
E-mail de nutrição de lista, welcome educativo ou reengajamento por conteúdo — a venda vem depois da informação.  
Marca que tem autoridade a demonstrar e um dado concreto para citar.  
Quando existe uma ressalva legítima a fazer (consultar profissional, restrição de uso) e ela precisa aparecer sem quebrar o tom.  

##### Quando NÃO usar

Campanhas promocionais (zero slot de oferta — o CTA é institucional). Marcas sem material educativo aprovado (a IA não pode gerar claims de saúde do zero). Públicos frios de topo de funil que ainda não conhecem a marca (o formato pressupõe interesse no tema).  

##### Orientações de copy para a IA

O conteúdo é sobre o mundo do cliente, não sobre o produto. Na referência, uma marca de recuperação pós-cirúrgica fala sobre alimentos, não sobre os próprios suplementos. O produto só aparece no CTA.  
O número faz parte do título e vem escrito no texto ("1. ", "2. ", "3. "), não como enfeite gráfico.  
Título nomeia o item em 2 a 4 palavras. O terceiro item pode quebrar o padrão com um gancho, como na referência, para o leitor não abandonar a lista no meio.  
Cada parágrafo explica o mecanismo, não só afirma o benefício: o que a coisa faz no corpo, por que funciona. Um dado numérico verificável em um dos três itens dá peso aos outros dois.  
Abertura em duas partes: uma frase que aponta o erro ou a lacuna, e uma que anuncia o que vem a seguir e fecha com dois-pontos.  
Fechamento em dois parágrafos: o primeiro traz a ressalva em negrito inline e devolve a permissão; o segundo projeta o resultado.  
CTA nomeia a marca, não a ação genérica.  

##### Design system

Container: 600px travado. Fundo   
#FAFAFA até a altura do CTA, onde transiciona para um gradiente quente (  
#EADDCC →   
#D7BC95) que continua na seção seguinte.  

Painel: x 28–571 (544 de largura), cantos arredondados ~20px, mesmo   
#FAFAFA do fundo, separado apenas por uma sombra difusa nas laterais e na base. Base do painel em y 1075, com 47px de folga abaixo do último card.  

Tipografia principal: sans humanista (perfil Asap/Inter). Não há tipografia secundária. O template substitui por Arial, Helvetica, sans-serif.  

| Bloco | Tamanho / entrelinha | Peso | Alinhamento |  
|---|---|---|---|  
| Abertura do painel | 22 / 24 | 400 | Centralizado |  
| Título do card | 24 / 24 | 700 | Esquerda |  
| Corpo do card | 22 / 24 | 400 | Esquerda |  
| Fechamento | 22 / 24 | 400 com trecho em 700 | Centralizado |  
| Label do CTA | ~28 | 700 | Centralizado, ALTA |  

Cores. Cor primária   
#0B2532 — um azul-petróleo escuro usado em todo o texto, títulos e corpo, nunca preto puro. Cor secundária   
#FAFAFA (fundo e painel). Card em   
#F3ECE4, um bege quente que é a única superfície colorida da lista. Cor de acento   
#941409 no CTA, com label branco. Nenhum outro elemento usa o acento.  

Grade e ritmo vertical (medido):  

PAINEL  x 28–571, raio 20  
   ↓ ~46px do topo do painel  
abertura parte 1        3 linhas, centralizado, largura de quebra ~410  
   ↓ 28px  
abertura parte 2        2 linhas, centralizado  
   ↓ 40px  
CARD 1  496 × 257 (x 53–548), raio 13, fundo #F3ECE4  
          +19  miniatura 77 × 217 (x 73–149), raio ~8  
          +23  título numerado (x 172)  
          +31  corpo — 7 linhas, x 172–515, entrelinha 24  
          26px de folga até a base do card  
   ↓ 40px  
CARD 2  496 × 232 — miniatura 77 × 194  
   ↓ 38px  
CARD 3  496 × 228 — miniatura 77 × 187  
   ↓ 47px  base do painel  
   ↓ 85px  
fechamento parágrafo 1  5 linhas, centralizado, x 65–535  
   ↓ 27px  
fechamento parágrafo 2  4 linhas, centralizado  
   ↓ 44px  
CTA     379 × 70 (x 111), fundo #941409, raio ~16  

Regras que não podem ser quebradas:  

O card cresce com o texto e a miniatura acompanha essa altura. Altura fixa quebra a variante.  
A miniatura tem largura fixa de 77px em todos os cards, sempre com 20px de folga em cima e embaixo dentro do card.  
Título e corpo do card são alinhados à esquerda; abertura e fechamento são centralizados. Essa troca de alinhamento é o que separa lista de discurso.  
A abertura e o fechamento ficam FORA do painel visualmente — a abertura dentro dele, o fechamento abaixo. Só a lista é emoldurada.  
Todo o texto é azul-petróleo   
#0B2532, nunca preto. O bege do card não tem contraste suficiente para preto puro sem endurecer o bloco.  
Só duas coisas em negrito: os títulos dos cards e o trecho de ressalva dentro do fechamento. Corpo, abertura e fechamento são regulares.  
Nenhum badge, ícone, seta, divisor ou borda. A hierarquia vem só de fundo, peso e alinhamento.  

##### Direção fotográfica

Macro de ingrediente ou material, recortado pela tira vertical estreita. A imagem é lida em 77px de largura — o que importa é textura e cor, não composição.  

Enquadramento: plano muito fechado, o assunto preenchendo o quadro inteiro. Nada de espaço negativo, nada de objeto inteiro com margem.  
Assunto: o ingrediente cru e reconhecível pela textura mesmo em miniatura — escama, casca, grão, fatia.  
Luz: natural e difusa, com sombra suave que dê volume. Sem flash duro, sem reflexo especular.  
Cor: cada uma das três miniaturas em uma faixa cromática distinta (na referência: prateado frio, marrom quente, amarelo saturado), para a pilha não virar um bloco só.  
Corte: o ativo é gerado quadrado e cortado verticalmente ao centro na montagem. Compor com o assunto no centro do quadro, porque as bordas superior e inferior serão descartadas.  
Proibições: prato montado, mão na cena, fundo branco de estúdio, produto da marca, texto ou selo sobreposto, imagem de banco genérica com aparência de anúncio.  

#### Schema de output (14 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `list_intro_problem` | `{{LIST_INTRO_PROBLEM}}` | Texto curto | Copy (n8n) | não | 110 | sim |
| `list_intro_promise` | `{{LIST_INTRO_PROMISE}}` | Texto curto | Copy (n8n) | não | 75 | sim |
| `list_item_1_title` | `{{LIST_ITEM_1_TITLE}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `list_item_1_body` | `{{LIST_ITEM_1_BODY}}` | Texto curto | Copy (n8n) | não | 200 | sim |
| `list_item_2_title` | `{{LIST_ITEM_2_TITLE}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `list_item_2_body` | `{{LIST_ITEM_2_BODY}}` | Texto curto | Copy (n8n) | não | 200 | sim |
| `list_item_3_title` | `{{LIST_ITEM_3_TITLE}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `list_item_3_body` | `{{LIST_ITEM_3_BODY}}` | Texto curto | Copy (n8n) | não | 200 | sim |
| `list_outro_caveat` | `{{LIST_OUTRO_CAVEAT}}` | Texto curto | Copy (n8n) | não | 190 | sim |
| `list_outro_payoff` | `{{LIST_OUTRO_PAYOFF}}` | Texto curto | Copy (n8n) | não | 170 | sim |
| `list_cta_label` | `{{LIST_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `list_item_1_thumb` | `{{LIST_ITEM_1_THUMB}}` | Imagem | Imagem gerada | não | — | — |
| `list_item_2_thumb` | `{{LIST_ITEM_2_THUMB}}` | Imagem | Imagem gerada | não | — | — |
| `list_item_3_thumb` | `{{LIST_ITEM_3_THUMB}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`list_intro_problem`**
    - *Exemplo:* 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
- **`list_intro_promise`**
    - *Exemplo:* 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit,
- **`list_item_1_title`**
    - *Exemplo:* 1. Product Feature
- **`list_item_1_body`**
    - *Exemplo:* 3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
- **`list_item_2_title`**
    - *Exemplo:* 2. Product Feature
- **`list_item_2_body`**
    - *Exemplo:* 4 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
- **`list_item_3_title`**
    - *Exemplo:* 3. Product Feature
- **`list_item_3_body`**
    - *Exemplo:* 5 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
- **`list_outro_caveat`**
    - *Exemplo:* 6 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
- **`list_outro_payoff`**
    - *Exemplo:* sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
- **`list_cta_label`**
    - *Exemplo:* SHOP NOW
- **`list_item_1_thumb`**
    - *Orientação:* Onde: tira vertical à esquerda do primeiro card, com 20px de folga em cima e embaixo.<br>Slot: 77px de largura fixa × altura variável (igual à altura do card menos 40) · sem proporção fixa · JPG com cantos arredondados de 8px aplicados na montagem.
    - *Imagem:* proporção 1:1 · 1024 × 1024 px
    - *Spec da imagem:* Como gerar: gerar em 1:1 (1024 × 1024), redimensionar para 154px de largura @2x e cortar verticalmente ao centro na altura necessária. O assunto tem que estar centralizado no quadro porque topo e base são descartados.<br>Ideia: macro do primeiro ingrediente da lista, textura preenchendo o quadro, faixa cromática fria.
- **`list_item_2_thumb`**
    - *Orientação:* Onde: tira vertical do segundo card.<br>Slot: 77px de largura fixa × altura variável · sem proporção fixa · JPG.
    - *Spec da imagem:* Como gerar: idêntico ao slot 1.<br>Ideia: macro do segundo ingrediente, faixa cromática quente e escura, para contrastar com a primeira.
- **`list_item_3_thumb`**
    - *Orientação:* Onde: tira vertical do terceiro card.<br>Slot: 77px de largura fixa × altura variável · sem proporção fixa · JPG.
    - *Spec da imagem:* Como gerar: idêntico ao slot 1.<br>Ideia: macro do terceiro ingrediente, cor saturada e clara, fechando a pilha com o tom mais vibrante.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Product Features em cards</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ PAINEL CINZA CLARO ============ -->
    <tr>
      <td align="center" style="padding:0 28px;">

        <table role="presentation" width="542" cellpadding="0" cellspacing="0" border="0" style="width:542px;background:#F2F2F2;border-radius:20px;">

          <!-- HEADLINE DO PAINEL -->
          <tr>
            <td align="center" class="txt-blk" style="padding:51px 43px 0 43px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;color:#000000;">
               1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
            </td>
          </tr>

          <!-- SUBHEAD DO PAINEL -->
          <tr>
            <td align="center" class="txt-blk" style="padding:20px 73px 0 73px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:400;color:#000000;">
              2 Lorem ipsum dolor sit amet, consectetur adipiscing elit,
            </td>
          </tr>

          <!-- ===== CARD 1 ===== -->
          <tr>
            <td align="center" style="padding:42px 0 0 0;">
              <table role="presentation" width="496" cellpadding="0" cellspacing="0" border="0" style="width:496px;background:#D1D1D1;border-radius:13px;">
                <tr>
                  <!-- coluna da miniatura -->
                  <td width="119" valign="top" style="width:119px;padding:22px 24px 22px 21px;font-size:0;line-height:0;">
                    <img src="URL_DA_IMAGEM_1" width="74" height="215" alt="ALT_DA_IMAGEM_1"
                         style="display:block;width:74px;height:215px;border-radius:10px;background:#E6E6E6;">
                  </td>
                  <!-- coluna do texto -->
                  <td width="377" valign="top" style="width:377px;padding:30px 20px 30px 0;">
                    <table role="presentation" width="357" cellpadding="0" cellspacing="0" border="0" style="width:357px;">
                      <tr>
                        <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:24px;font-weight:700;color:#011D2B;">
                          1. Product Feature
                        </td>
                      </tr>
                      <tr>
                        <td align="left" class="txt-blk" style="padding:23px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;color:#000000;">
                          3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== CARD 2 ===== -->
          <tr>
            <td align="center" style="padding:18px 0 0 0;">
              <table role="presentation" width="496" cellpadding="0" cellspacing="0" border="0" style="width:496px;background:#D1D1D1;border-radius:13px;">
                <tr>
                  <td width="119" valign="top" style="width:119px;padding:22px 24px 22px 21px;font-size:0;line-height:0;">
                    <img src="URL_DA_IMAGEM_2" width="74" height="215" alt="ALT_DA_IMAGEM_2"
                         style="display:block;width:74px;height:215px;border-radius:10px;background:#E6E6E6;">
                  </td>
                  <td width="377" valign="top" style="width:377px;padding:30px 20px 30px 0;">
                    <table role="presentation" width="357" cellpadding="0" cellspacing="0" border="0" style="width:357px;">
                      <tr>
                        <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:24px;font-weight:700;color:#011D2B;">
                          2. Product Feature
                        </td>
                      </tr>
                      <tr>
                        <td align="left" class="txt-blk" style="padding:23px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;color:#000000;">
                           4 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== CARD 3 ===== -->
          <tr>
            <td align="center" style="padding:18px 0 46px 0;">
              <table role="presentation" width="496" cellpadding="0" cellspacing="0" border="0" style="width:496px;background:#D1D1D1;border-radius:13px;">
                <tr>
                  <td width="119" valign="top" style="width:119px;padding:22px 24px 22px 21px;font-size:0;line-height:0;">
                    <img src="URL_DA_IMAGEM_3" width="74" height="215" alt="ALT_DA_IMAGEM_3"
                         style="display:block;width:74px;height:215px;border-radius:10px;background:#E6E6E6;">
                  </td>
                  <td width="377" valign="top" style="width:377px;padding:30px 20px 30px 0;">
                    <table role="presentation" width="357" cellpadding="0" cellspacing="0" border="0" style="width:357px;">
                      <tr>
                        <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:24px;font-weight:700;color:#011D2B;">
                          3. Product Feature
                        </td>
                      </tr>
                      <tr>
                        <td align="left" class="txt-blk" style="padding:23px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;color:#000000;">
                          5 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>

    <!-- ============ FECHAMENTO ============ -->

    <!-- BLOCO BOLD -->
    <tr>
      <td align="center" class="txt-blk" style="padding:72px 85px 0 85px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;color:#000000;">
        6 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
      </td>
    </tr>

    <!-- BLOCO REGULAR -->
    <tr>
      <td align="center" class="txt-blk" style="padding:20px 85px 0 85px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:400;color:#000000;">
        sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td align="center" style="padding:42px 0 60px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:72px;v-text-anchor:middle;width:381px;" arcsize="22%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FAFAFA;font-family:Arial,sans-serif;font-size:32px;font-weight:bold;">SHOP NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:381px;">
          <tr>
            <td align="center" height="72" style="width:381px;height:72px;background:#000000;border-radius:16px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:381px;height:72px;line-height:72px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;text-transform:uppercase;color:#FAFAFA;text-decoration:none;text-align:center;">
                Shop Now
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```


---

## 4 · Produtos / Grade

`products` · 9 variantes (9 ativas · 126.4 KB de HTML)

<a id="v-640b0a34"></a>

### 4.1 · produto 8 - 4 produtos — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | média |
| **Slots de produto** | 4 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, bordered_container, standalone_component, product_grid, four_cards, zigzag_layout, alternating_image_side, repeatable_blocks, card_border, pill_button, filled_card_button, outline_final_cta, per_product_cta, uppercase_text, no_logo, no_hero, no_footer, not_mobile_stacked |
| **Tamanho do HTML** | 13.5 KB |
| **ID** | `640b0a34-8632-4041-8378-38fe804c1516` |

#### Descrição curta

Bloco de recomendação de produtos com quatro itens, cada um com nome, indicação de uso e botão próprio, fechando com um CTA de coleção. Momento de uso: e-mail de catálogo, guia de presentes ou cross-sell, quando o leitor precisa escolher entre opções e não seguir um caminho único.  

#### Descrição detalhada

Título em duas linhas; abaixo, quatro linhas de produto de 271px cada; no fim, um CTA de contorno com a largura quase total.  

Quatro mecanismos definem a variante:  

O contorno do card é metade HTML, metade imagem. A coluna de texto carrega a borda de três lados; os outros pedaços da linha vêm dentro do ativo de imagem. É a exigência de produção mais rígida do arsenal: a foto não é só a foto, é a foto mais os fragmentos do contorno.  

A foto sangra para fora do contorno. O retângulo é quebrado do lado onde a imagem entra. Sem esse transbordo, o bloco vira uma tabela de produtos comum.  

Alternância 2 + 2, não em zigue-zague. Produtos 1 e 2 com a foto à esquerda, 3 e 4 com a foto à direita. É ritmo de blocos: dois de cada lado, com o respiro maior na virada.  

Cinco botões no bloco. Um por produto, mais o CTA final. Os quatro primeiros são sólidos e apontam para produtos; o último é de contorno e aponta para a coleção — a hierarquia é de preenchimento, não de tamanho.  

#### Contexto para a IA

##### Quando usar

Guia de presentes, catálogo sazonal, cross-sell, "nossos mais vendidos".  
Quando há quatro produtos distintos com indicações de uso diferentes entre si.  
Beleza, cuidado pessoal, casa, pet, ferramenta, papelaria — categorias onde a escolha é por finalidade.  
Quando cada produto tem página própria para receber o clique.  
Quando o acervo permite produzir os ativos com os fragmentos de contorno embutidos.  

##### Quando NÃO usar

Ação única. Cinco botões destroem qualquer e-mail com um objetivo só — carrinho, checkout, welcome com cupom.  
Menos de quatro produtos — a alternância 2 + 2 não se forma.  
Produtos sem diferença de finalidade — se as quatro indicações forem iguais, a grade não ajuda a escolher.  
Sem ativos com fragmentos de contorno — colar uma foto comum deixa a moldura aberta.  
Topo de e-mail, transacional, prova social.  
Marca de luxo editorial: quatro botões sólidos e um contornado é registro de catálogo.  

##### Orientações de copy para a IA

Título — duas linhas, caixa alta, com o gancho da ocasião ou do público. Pode ser bem-humorado; é o único slot com liberdade de tom no bloco.  

Nome do produto — o nome comercial em duas linhas, caixa alta. Quebra semântica: linha 1 é a família, linha 2 é a variante.  

Descrição — prefixo fixo em bold seguido da indicação de uso ("BEST FOR: REMOVING BUILD-UP"). Duas linhas, caixa alta, sem verbo de venda. As quatro indicações precisam ser diferentes — é o que faz a grade funcionar como ferramenta de escolha.  

CTA de produto — verbo genérico igual nos quatro. A diferenciação está no nome e na indicação, não no botão.  

CTA final — chamada da coleção ou da ocasião ("TREAT DAD"), não repete o verbo dos botões acima.  

Proibições: quatro indicações de uso iguais · preço em qualquer slot · botões de produto com rótulos diferentes entre si · desconto · descrição com verbo de venda · nome de produto em uma linha só quando cabe em duas.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Raio de 100px nos botões (pílula) — variante com cantos arredondados nos botões e cantos vivos nos cards.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 34px | 35/39px bold, caixa alta, 2 linhas, padding lateral 100px |  
| 2 | Produto 1 — foto à esquerda | 51px | Linha de 532px, padding lateral 33px |  
| 3 | Produto 2 — foto à esquerda | 25px | Linha de 532px |  
| 4 | Produto 3 — foto à direita | 35px | Linha de 532px |  
| 5 | Produto 4 — foto à direita | 25px | Linha de 532px |  
| 6 | CTA final | 39px | 525 × 56px, com 34px de respiro na base |  

O respiro de 35px antes do produto 3 é maior que os 25px dos demais: marca a virada do lado.  

Anatomia da linha de produto — duas colunas, 532px no total.  

| Coluna | Largura | Conteúdo |  
|---|---|---|  
| Imagem | 214px | Ativo de 214 × 271px com a foto e os fragmentos do contorno |  
| Texto | 318px | Borda de 1px em três lados, padding-top 47px |  

Bordas da coluna de texto: topo, direita e base quando a foto está à esquerda; topo, esquerda e base quando está à direita. Padding esquerdo de 23px nas linhas 1-2 e 30px nas linhas 3-4.  

Interior da coluna: nome 30/33px bold em 2 linhas · descrição 9px abaixo, 13/15px · botão 18px abaixo, 257 × 55px.  

Paleta — duas cores.  

| Papel | Hex (NOTICE) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #28252B | Título, nome, descrição e o contorno dos cards |  |  
| Cor secundária |  |  |  
| #1E3344 | Fundo dos botões de produto e borda do CTA final |  |  

O fundo é branco. O label dos botões de produto é branco; o do CTA final é a cor primária. Não existe cor de acento — a cor vem das fotos.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título e nome em bold caixa alta; descrição em regular caixa alta a 13px, com o prefixo em bold; botões 22px bold com tracking +0.07em e text-indent compensando. Secundária não existe.  

Implementação. Botões com border-radius:100px exigem v:roundrect com arcsize="50%" no bloco MSO — sem isso, retângulo no Outlook. O CTA final usa strokecolor e strokeweight no VML para reproduzir o contorno. font-size:0;line-height:0 na célula da imagem. O ativo de imagem precisa sair do Figma com os fragmentos de contorno já desenhados — não existe forma de fechar a moldura por CSS quando a foto transborda. Hack u + .body .txt-blk travando   
#28252B.  

Tags: SECTION_TITLE, PRODUCT_N_IMAGE_URL, PRODUCT_N_IMAGE_ALT, PRODUCT_N_NAME, PRODUCT_N_DESCRIPTION, PRODUCT_N_CTA_URL, PRODUCT_CTA_LABEL, FINAL_CTA_LABEL, FINAL_CTA_URL.  

Erros que quebram o padrão: imagem sem os fragmentos de contorno · foto contida dentro do retângulo em vez de transbordar · borda nos quatro lados da coluna de texto · alternância em zigue-zague em vez de 2 + 2 · botões de produto com raio diferente do CTA final · rótulos de botão diferentes entre produtos · preço no card · CTA final sólido.  

##### Direção fotográfica

Proporção 4:5 — slot de 214 × 271px, ativo final 428 × 542px (2x). PNG ou JPG q80, < 130 KB por produto. Gerar em 4:5 na altura de 542px (434 × 542) e cortar 6px de largura.  

Regra crítica de montagem: o ativo entregue não é só a fotografia. Ele contém a foto do produto e os fragmentos da linha de contorno que fecham a moldura acima e abaixo da imagem, na cor primária e com 1px de espessura. Isso é feito no Figma, na exportação — nunca em CSS.  

Regra crítica de composição: a foto transborda o retângulo do lado externo. No ativo, isso significa que o produto ocupa a borda externa até o limite do quadro, sem margem.  

Composição. Alternar entre dois tipos ao longo dos quatro slots: packshot em cena (produto e embalagem sobre superfície neutra) e produto em uso (mão segurando, gesto de aplicação, parte do corpo). Nunca quatro do mesmo tipo — a grade fica monótona e a leitura desliza.  

Cenário e luz. Fundo liso em tom neutro quente ou cinza claro, sem cenário reconhecível. Luz difusa, sombras curtas. A paleta dos quatro ativos precisa ser coerente entre si: mesma temperatura de cor e mesmo tratamento.  

Produto. Rótulo legível quando é packshot; textura e cor em evidência quando é uso.  

Proibições: foto sem os fragmentos de contorno · margem entre a foto e a borda externa do quadro · fundo branco puro (some contra o container) · quatro fotos do mesmo tipo · texto/preço/selo queimado · cenário reconhecível · marca d'água.  

Adaptação por categoria — o par de tipos:  

| Categoria | Packshot em cena | Produto em uso |  
|---|---|---|  
| Cuidado pessoal | Kit e caixa abertos | Barra na mão, gesto de aplicação |  
| Beleza | Frascos agrupados | Textura na pele, aplicador |  
| Casa | Item sobre superfície | Item sendo usado no ambiente |  
| Pet | Embalagem e acessório | Produto no animal |  
| Ferramenta | Ferramenta e estojo | Ferramenta na mão em trabalho |  
| Papelaria | Conjunto disposto | Mão escrevendo ou usando |  

#### Schema de output (13 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 44 | sim |
| `product_1_name` | `{{PRODUCT_1_NAME}}` | Texto curto | Copy (n8n) | não | 36 | não |
| `product_1_description` | `{{PRODUCT_1_DESCRIPTION}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `product_2_name` | `{{PRODUCT_2_NAME}}` | Texto curto | Copy (n8n) | não | 36 | não |
| `product_3_name` | `{{PRODUCT_3_NAME}}` | Texto curto | Copy (n8n) | não | 36 | não |
| `product_4_name` | `{{PRODUCT_4_NAME}}` | Texto curto | Copy (n8n) | não | 36 | não |
| `product_2_description` | `{{PRODUCT_2_DESCRIPTION}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `product_3_description` | `{{PRODUCT_3_DESCRIPTION}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `product_4_description` | `{{PRODUCT_4_DESCRIPTION}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `product_cta_label_1` | `{{PRODUCT_CTA_LABEL_1}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `product_cta_label_2` | `{{PRODUCT_CTA_LABEL_2}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `product_cta_label_3` | `{{PRODUCT_CTA_LABEL_3}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `product_cta_label_4` | `{{PRODUCT_CTA_LABEL_4}}` | Texto curto | Copy (n8n) | não | 20 | sim |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* Section Title 1
    - *Orientação:* Ex - SUDS FOR THE BIGGEST STUD YOU KNOW<br>Caixa alta, bold, gancho da ocasião<br>44 (2 linhas)
- **`product_1_name`**
    - *Exemplo:* Product Name 1
    - *Orientação:* 36 (2 linhas)<br>Caixa alta, família na linha 1
- **`product_1_description`**
    - *Exemplo:* Short product description 1
    - *Orientação:* 80 (2 linhas)<br>Prefixo em bold, indicação de uso
- **`product_2_name`**
    - *Exemplo:* Product Name 2
    - *Orientação:* 36 (2 linhas)	<br>Caixa alta
- **`product_3_name`**
    - *Exemplo:* Product Name 3
    - *Orientação:* 36 (2 linhas)	<br>Caixa alta
- **`product_4_name`**
    - *Exemplo:* Product Name 4
    - *Orientação:* 36 (2 linhas)	<br>Caixa alta
- **`product_2_description`**
    - *Exemplo:* Short product description 2
    - *Orientação:* 80 (2 linhas)<br>Indicação de uso
- **`product_3_description`**
    - *Exemplo:* Short product description 3
    - *Orientação:* 80 (2 linhas)<br>Indicação de uso
- **`product_4_description`**
    - *Exemplo:* Short product description 4
    - *Orientação:* 80 (2 linhas)<br>Indicação de uso
- **`product_cta_label_1`**
    - *Exemplo:* CTA PRODUTO 1
    - *Orientação:* Caixa alta, igual nos quatro<br>ex - SHOP NOW
- **`product_cta_label_2`**
    - *Exemplo:* CTA PRODUTO 2
    - *Orientação:* Caixa alta, igual nos quatro<br>ex - SHOP NOW
- **`product_cta_label_3`**
    - *Exemplo:* CTA PRODUTO 3
    - *Orientação:* Caixa alta, igual nos quatro<br>ex - SHOP NOW
- **`product_cta_label_4`**
    - *Exemplo:* CTA PRODUTO 4
    - *Orientação:* Caixa alta, igual nos quatro<br>ex - SHOP NOW

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Grade de 4 produtos alternados</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#28252B !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- TÍTULO DA SEÇÃO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:34px 100px 0 100px;font-family:Arial,Helvetica,sans-serif;font-size:35px;line-height:39px;font-weight:700;text-transform:uppercase;color:#28252B;">
        Section Title 1<br>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 1 — imagem à esquerda                                    -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:51px 33px 0 33px;">
        <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">
          <tr>
            <!-- composição: foto + fragmentos do contorno -->
            <td width="214" valign="top" style="width:214px;font-size:0;line-height:0;">
              <img src="URL_COMPOSICAO_PRODUTO_1" width="214" height="271" alt="ALT_PRODUTO_1"
                   style="display:block;width:214px;height:271px;">
            </td>
            <!-- coluna de texto com o restante do contorno -->
            <td width="318" valign="top"
                style="width:318px;border-top:1px solid #28252B;border-right:1px solid #28252B;border-bottom:1px solid #28252B;padding:47px 0 0 23px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 1
              </div>
              <div class="txt-blk" style="padding-top:9px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:15px;font-weight:400;text-transform:uppercase;color:#28252B;">
                Short product description 1
              </div>
              <div style="padding-top:18px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_CTA_PRODUTO_1" style="height:55px;v-text-anchor:middle;width:257px;" arcsize="50%" stroke="f" fillcolor="#000000">
                  <w:anchorlock/>
                  <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;">CTA PRODUTO 1</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:257px;">
                  <tr>
                    <td align="center" height="55" style="width:257px;height:55px;background:#000000;border-radius:100px;">
                      <a href="URL_CTA_PRODUTO_1" style="display:block;width:257px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">CTA PRODUTO 1</a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 2 — imagem à esquerda                                    -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:25px 33px 0 33px;">
        <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">
          <tr>
            <td width="214" valign="top" style="width:214px;font-size:0;line-height:0;">
              <img src="URL_COMPOSICAO_PRODUTO_2" width="214" height="271" alt="ALT_PRODUTO_2"
                   style="display:block;width:214px;height:271px;">
            </td>
            <td width="318" valign="top"
                style="width:318px;border-top:1px solid #28252B;border-right:1px solid #28252B;border-bottom:1px solid #28252B;padding:47px 0 0 23px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 2
              </div>
              <div class="txt-blk" style="padding-top:9px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:15px;font-weight:400;text-transform:uppercase;color:#28252B;">
                Short product description 2
              </div>
              <div style="padding-top:18px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_CTA_PRODUTO_2" style="height:55px;v-text-anchor:middle;width:257px;" arcsize="50%" stroke="f" fillcolor="#000000">
                  <w:anchorlock/>
                  <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;">CTA PRODUTO 2</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:257px;">
                  <tr>
                    <td align="center" height="55" style="width:257px;height:55px;background:#000000;border-radius:100px;">
                      <a href="URL_CTA_PRODUTO_2" style="display:block;width:257px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">CTA PRODUTO 2</a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 3 — imagem à direita (espelhado)                         -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:35px 33px 0 33px;">
        <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">
          <tr>
            <td width="318" valign="top"
                style="width:318px;border-top:1px solid #28252B;border-left:1px solid #28252B;border-bottom:1px solid #28252B;padding:47px 0 0 30px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 3
              </div>
              <div class="txt-blk" style="padding-top:9px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:15px;font-weight:400;text-transform:uppercase;color:#28252B;">
                Short product description 3
              </div>
              <div style="padding-top:18px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_CTA_PRODUTO_3" style="height:55px;v-text-anchor:middle;width:257px;" arcsize="50%" stroke="f" fillcolor="#000000">
                  <w:anchorlock/>
                  <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;">CTA PRODUTO 3</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:257px;">
                  <tr>
                    <td align="center" height="55" style="width:257px;height:55px;background:#000000;border-radius:100px;">
                      <a href="URL_CTA_PRODUTO_3" style="display:block;width:257px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">CTA PRODUTO 3</a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </div>
            </td>
            <td width="214" valign="top" style="width:214px;font-size:0;line-height:0;">
              <img src="URL_COMPOSICAO_PRODUTO_3" width="214" height="271" alt="ALT_PRODUTO_3"
                   style="display:block;width:214px;height:271px;">
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 4 — imagem à direita (espelhado)                         -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:25px 33px 0 33px;">
        <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">
          <tr>
            <td width="318" valign="top"
                style="width:318px;border-top:1px solid #28252B;border-left:1px solid #28252B;border-bottom:1px solid #28252B;padding:47px 0 0 30px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 4
              </div>
              <div class="txt-blk" style="padding-top:9px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:15px;font-weight:400;text-transform:uppercase;color:#28252B;">
                Short product description 4
              </div>
              <div style="padding-top:18px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_CTA_PRODUTO_4" style="height:55px;v-text-anchor:middle;width:257px;" arcsize="50%" stroke="f" fillcolor="#000000">
                  <w:anchorlock/>
                  <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;">CTA PRODUTO 4</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:257px;">
                  <tr>
                    <td align="center" height="55" style="width:257px;height:55px;background:#000000;border-radius:100px;">
                      <a href="URL_CTA_PRODUTO_4" style="display:block;width:257px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">CTA PRODUTO 4</a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </div>
            </td>
            <td width="214" valign="top" style="width:214px;font-size:0;line-height:0;">
              <img src="URL_COMPOSICAO_PRODUTO_4" width="214" height="271" alt="ALT_PRODUTO_4"
                   style="display:block;width:214px;height:271px;">
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA FINAL (contornado) -->
    <tr>
      <td align="center" style="padding:39px 0 34px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_CTA_FINAL" style="height:56px;v-text-anchor:middle;width:525px;" arcsize="50%" strokecolor="#1E3344" strokeweight="1px" fillcolor="#FFFFFF">
          <w:anchorlock/>
          <center style="color:#000000;font-family:Arial,sans-serif;font-size:23px;font-weight:bold;">CTA FINAL</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:525px;">
          <tr>
            <td align="center" height="56" style="width:525px;height:56px;background:#FFFFFF;border:1px solid #1E3344;border-radius:100px;">
              <a href="URL_CTA_FINAL"
                 style="display:block;width:525px;height:54px;line-height:54px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#000000;text-decoration:none;text-align:center;">
                CTA FINAL
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-8ef65206"></a>

### 4.2 · produtos 2 - Three Ingredients. Zero Fillers — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, bordered_container, standalone_component, single_product, product_feature_callouts, callouts_baked_in_image, headline_slot, big_headline, uppercase_headline, product_image_middle, pill_button, filled_button, mso_fallback, mobile_responsive, no_logo, no_footer |
| **Tamanho do HTML** | 8.8 KB |
| **ID** | `8ef65206-2f01-408f-ab07-c17f57cc136c` |

#### Descrição curta

Bloco de educação sobre composição. Uma foto do produto ocupa o centro e três marcadores apontam para o que ele tem dentro — ingrediente, origem, certificação — encerrando com um CTA. Momento de uso: consideração ou e-mail de USP, quando a objeção é "o que exatamente tem nisso" e a resposta é a formulação.  

#### Descrição detalhada

Headline em três linhas; abaixo, uma faixa de 494px com a foto do produto como imagem de fundo e três marcadores sobrepostos; no fim, o CTA.  

Quatro mecanismos definem a variante:  

Os marcadores são HTML, não infográfico queimado na imagem. Cada um é um pino circular de 31px com sinal de mais, mais um rótulo de 199 × 56px logo abaixo — tabelas com fundo, borda e raio. O texto é vivo, traduzível e trocável sem refazer arte.  

Alternância esquerda / direita / esquerda. O produto fica no eixo central e os marcadores se distribuem em zigue-zague pelas laterais. É o que impede a leitura de virar lista.  

Cada rótulo cita uma prova verificável. Certificação, origem geográfica, grau ou ausência de algo. Não é benefício — é composição.  

A headline é um manifesto de três linhas curtas. Cada linha termina em ponto. A cadência entrecortada é o registro da variante; frase corrida derruba o efeito.  

#### Contexto para a IA

##### Quando usar

Consideração e e-mail de USP, quando o argumento é formulação, material ou origem.  
Skincare, suplementos, alimentos, bebidas, limpeza, pet — categorias com rótulo e certificação.  
Quando existem três provas verificáveis distintas para apontar.  
Quando o produto é fotografável em plano único com o rótulo legível.  
Quando a marca quer texto vivo em vez de infográfico — traduzível para várias lojas.  

##### Quando NÃO usar

Sem provas verificáveis — três marcadores com adjetivo genérico ("suave", "poderoso") esvaziam o bloco.  
Produto sem composição relevante — moda, acessório, eletrônico de consumo.  
Foto sem corredores livres nas laterais — os rótulos caem sobre o produto e nada fica legível.  
Carrinho, checkout, transacional, topo de e-mail.  
Mais de três provas — a faixa de 494px não comporta um quarto marcador sem apertar.  
Quando a marca prefere entregar o infográfico como imagem única: aí o bloco perde a razão de existir.  

##### Orientações de copy para a IA

Headline — três linhas curtas, caixa alta, cada uma terminando em ponto. Estrutura recomendada: quantidade → o que tem → o que não tem ("THREE INGREDIENTS. ZERO FILLERS."). A negação na última linha é o que fecha o argumento.  

Rótulos dos marcadores — cada um em duas linhas, caixa mista. Citar prova concreta: selo de certificação, origem geográfica, grau de qualidade, ausência declarada. Um por marcador, nunca repetir a mesma categoria de prova nos três.  

CTA — verbo + benefício, caixa alta ("NOURISH YOUR SKIN"). Diferente das variantes de catálogo, aqui o botão fala do resultado, não da compra.  

Proibições: adjetivo genérico no lugar de prova · claim de saúde não sustentado · três marcadores da mesma categoria · headline em frase corrida · desconto ou cupom · segundo botão · rótulo em uma linha só.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Raio de 16px no pino, 5px no rótulo e 100px no CTA.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Headline | 46px | 50/50px bold, tracking +0.03em, caixa alta, 3 linhas, padding lateral 54px |  
| 2 | Faixa da foto com marcadores | 0 | 598 × 494px |  
| 3 | CTA | 52px | 418 × 59px, com 66px de respiro na base |  

Posição dos marcadores dentro da faixa  

| Marcador | Alinhamento | Padding |  
|---|---|---|  
| 1 | Esquerda | 45px topo · 31px esquerda |  
| 2 | Direita | 50px topo · 15px direita |  
| 3 | Esquerda | 78px topo · 31px esquerda · 60px base |  

Anatomia do marcador: pino de 31 × 31px com borda de 1px e raio 16px, contendo um + de 21px; abaixo dele, rótulo de 199 × 56px com borda de 1px, raio 5px, texto 15/15px centralizado em duas linhas.  

Paleta — quatro cores.  

| Papel | Hex (Shelter Skin) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #28100E | Headline e fundo do CTA |  |  
| Cor secundária |  |  |  
| #EEE6E0 | Fundo da seção — vem da foto |  |  
| Marcador A |  |  |  
| #B3CFEC | Fundo dos marcadores 1 e 3 |  |  
| Marcador B |  |  |  
| #FFE1A0 | Fundo do marcador 2 |  |  

O CTA usa a cor primária, não preto puro. As duas cores de marcador são pastéis de famílias opostas — uma fria, uma quente — e o pino acompanha a cor do rótulo. O texto dentro dos marcadores é sempre preto com borda de 1px preta.  

Pele alternativa (HTML base): os três marcadores em   
#D1D1D1, CTA preto. Usar quando a marca não tem par de pastéis definido.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Headline 50px bold caixa alta; rótulos 15px regular com tracking +0.03em; CTA 23px bold com tracking +0.07em e text-indent compensando. Secundária não existe.  

Implementação. background no <td> + background-image inline + background-size:598px 494px, background-color na cor secundária como fallback, bloco VML v:rect/v:fill type="frame" para Outlook. Pino e rótulo com border-radius degradam para retângulo no Outlook — degradação aceita, o marcador continua legível. O CTA exige v:roundrect com arcsize="50%". font-size:0;line-height:0 nas células que só contêm o pino. Hacks u + .body .txt-prim e u + .body .txt-blk.  

Tags: PREHEADER, HEADLINE_L1, HEADLINE_L2, HEADLINE_L3, PRODUCT_IMAGE_URL, MARKER_1_LABEL, MARKER_2_LABEL, MARKER_3_LABEL, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: marcadores queimados na imagem · rótulo sobre o produto em vez do corredor lateral · pino descolado do rótulo · três marcadores do mesmo lado · pino em cor diferente do rótulo · quarto marcador · headline em frase corrida · CTA em preto puro quando a marca tem cor primária.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 5:4 — slot de 598 × 494px, ativo final 1196 × 988px (2x). JPG q80 ou WebP, < 220 KB, full-bleed. Gerar em 5:4 na altura de 988px (1235 × 988) e cortar 39px de largura, 20px de cada lado.  

Regra crítica: a foto precisa de três corredores laterais livres, nas alturas em que os marcadores caem — dois à esquerda (topo e base) e um à direita (meio). Cada corredor tem cerca de 230px de largura por 90px de altura. Produto, mão ou sombra dura nessas áreas tornam o rótulo ilegível.  

Composição. Produto único no eixo central vertical, ocupando a faixa do meio de ponta a ponta. Segurado por uma mão que entra pela base, ou apoiado — em qualquer caso, o conjunto não invade os corredores. Rótulo do produto legível e voltado para a câmera.  

Cenário e luz. Fundo liso em tom neutro quente, sem textura forte. Luz difusa frontal, sombras suaves. O fundo é a cor secundária da peça e precisa ser uniforme o bastante para virar background-color de fallback.  

Produto. Em destaque, com detalhe de textura ou material visível — gota escorrendo, brilho do vidro, grão. É a prova visual do que os marcadores afirmam.  

Proibições: produto fora do eixo central · elemento nos corredores dos marcadores · fundo com padrão ou cenário reconhecível · texto ou selo queimado · sombra dura nas laterais · packshot recortado sem contexto de mão · marca d'água.  

Adaptação por categoria — o que é o plano central:  

| Categoria | Plano |  
|---|---|  
| Skincare | Frasco na mão, gota escorrendo |  
| Suplementos | Pote em pé, cápsulas ou pó ao lado |  
| Alimentos | Embalagem em pé, ingrediente cru na base |  
| Bebidas | Garrafa ou lata em pé, condensação visível |  
| Limpeza | Frasco em uso, superfície ao fundo |  
| Pet | Embalagem em pé, ração ou petisco em detalhe |  

#### Schema de output (6 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `headline` | `{{HEADLINE}}` | Texto curto | Copy (n8n) | não | 48 | não |
| `marker_1_label` | `{{MARKER_1_LABEL}}` | Texto curto | Copy (n8n) | não | 56 | não |
| `marker_2_label` | `{{MARKER_2_LABEL}}` | Texto curto | Copy (n8n) | não | 56 | não |
| `marker_3_label` | `{{MARKER_3_LABEL}}` | Texto curto | Copy (n8n) | não | 56 | não |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `product_center_shot` | `{{PRODUCT_CENTER_SHOT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`headline`**
    - *Exemplo:* THREE / INGREDIENTS. / ZERO FILLERS.
    - *Orientação:* 48 (3 linhas de 16)<br>Caixa alta, uma frase quebrada em 3 linhas com <br>; quantidade → o que tem → o que não tem
- **`marker_1_label`**
    - *Exemplo:* Product Feature #1
    - *Orientação:* 56 (2 linhas)<br>Caixa mista, prova verificável
- **`marker_2_label`**
    - *Exemplo:* Product Feature #2
    - *Orientação:* 56 (2 linhas)<br>Categoria de prova diferente da do marcador 1
- **`marker_3_label`**
    - *Exemplo:* Product Feature #3
    - *Orientação:* 56 (2 linhas)<br>Categoria de prova diferente das anteriores
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo + benefício
- **`product_center_shot`**
    - *Orientação:* Onde fica: imagem de fundo da faixa de 494px, entre a headline e o CTA; os três marcadores são sobrepostos a ela.
    - *Imagem:* proporção 5:4 · 598 × 494 px
    - *Spec da imagem:* Proporção: 5:4. Slot de 598 × 494px. Ativo final 1196 × 988px (2x), JPG q80 ou WebP, < 220 KB. Gerar em 5:4 na altura de 988px (1235 × 988) e cortar 39px de largura.<br>Ideia: produto único no eixo central vertical, ocupando a faixa do meio de ponta a ponta, segurado por uma mão que entra pela base, rótulo legível e detalhe de material visível — gota, condensação, textura. Fundo liso em tom neutro quente, uniforme o bastante para virar o background-color de fallback da peça. Três corredores laterais de cerca de 230 × 90px ficam completamente livres — superior esquerdo, médio direito e inferior esquerdo — para receber os marcadores.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Three Ingredients (marcadores em HTML)</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-prim { color:#28100E !important; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- HEADLINE -->
    <tr>
      <td align="center" class="txt-prim" style="padding:46px 54px 0 54px;font-family:Arial,Helvetica,sans-serif;font-size:50px;line-height:50px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:#28100E;">
        Three<br>Ingredients.<br>Zero Fillers.
      </td>
    </tr>


    <!-- ============ FOTO DE FUNDO COM OS MARCADORES POR CIMA ============ -->
    <tr>
      <td background="URL_DA_FOTO"
          valign="top"
          style="background-color:#FFFFFF;background-image:url('URL_DA_FOTO');background-position:center top;background-repeat:no-repeat;background-size:598px 494px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:494px;">
          <v:fill type="frame" src="URL_DA_FOTO" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">

          <!-- MARCADOR 1 — à esquerda -->
          <tr>
            <td align="left" style="padding:45px 0 0 31px;">
              <table role="presentation" width="199" cellpadding="0" cellspacing="0" border="0" style="width:199px;">
                <tr>
                  <td align="center" style="font-size:0;line-height:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:31px;">
                      <tr>
                        <td align="center" height="31" class="txt-blk"
                            style="width:31px;height:31px;background:#D1D1D1;border:1px solid #000000;border-radius:16px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:29px;color:#000000;text-align:center;">
                          +
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="199" cellpadding="0" cellspacing="0" border="0" style="width:199px;">
                      <tr>
                        <td align="center" valign="middle" height="56" class="txt-blk"
                            style="width:199px;height:56px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:15px;letter-spacing:0.03em;color:#000000;text-align:center;">
                          Product<br>Feature #1
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MARCADOR 2 — à direita -->
          <tr>
            <td align="right" style="padding:50px 15px 0 0;">
              <table role="presentation" width="199" cellpadding="0" cellspacing="0" border="0" style="width:199px;">
                <tr>
                  <td align="center" style="font-size:0;line-height:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:31px;">
                      <tr>
                        <td align="center" height="31" class="txt-blk"
                            style="width:31px;height:31px;background:#D1D1D1;border:1px solid #000000;border-radius:16px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:29px;color:#000000;text-align:center;">
                          +
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="199" cellpadding="0" cellspacing="0" border="0" style="width:199px;">
                      <tr>
                        <td align="center" valign="middle" height="56" class="txt-blk"
                            style="width:199px;height:56px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:15px;letter-spacing:0.03em;color:#000000;text-align:center;">
                          Product<br>Feature #2
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MARCADOR 3 — à esquerda -->
          <tr>
            <td align="left" style="padding:78px 0 60px 31px;">
              <table role="presentation" width="199" cellpadding="0" cellspacing="0" border="0" style="width:199px;">
                <tr>
                  <td align="center" style="font-size:0;line-height:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:31px;">
                      <tr>
                        <td align="center" height="31" class="txt-blk"
                            style="width:31px;height:31px;background:#D1D1D1;border:1px solid #000000;border-radius:16px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:29px;color:#000000;text-align:center;">
                          +
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="199" cellpadding="0" cellspacing="0" border="0" style="width:199px;">
                      <tr>
                        <td align="center" valign="middle" height="56" class="txt-blk"
                            style="width:199px;height:56px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:15px;letter-spacing:0.03em;color:#000000;text-align:center;">
                          Product<br>Feature #3
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:52px 0 66px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:59px;v-text-anchor:middle;width:418px;" arcsize="50%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:23px;font-weight:bold;">SHOP NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:418px;">
          <tr>
            <td align="center" height="59" style="width:418px;height:59px;background:#000000;border-radius:100px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:418px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP NOW
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-a15a6331"></a>

### 4.3 · produtos 3 - grid 4 produtos — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | baixa |
| **Slots de produto** | 1 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | dark_bg, full_dark, single_col, standalone_component, section_title, wide_tracking, arch_image, rounded_arch_top, arch_via_css, arch_baked_recommended, feature_list, four_features, star_bullets, cream_palette, square_button, inverted_button, mso_fallback, mobile_responsive, no_logo, no_hero, no_footer |
| **Tamanho do HTML** | 21.4 KB |
| **ID** | `a15a6331-8761-4025-8d70-574c18fcd40b` |

#### Descrição curta

Bloco de anúncio de novidades. Uma foto de campanha recortada em arco ocupa o centro e uma lista de quatro linhas enumera o que entrou na coleção — sem preço, sem foto por item e sem botão individual. Momento de uso: campanha de lançamento ou reposição para base já engajada, quando basta contar o que chegou e mandar para a coleção inteira.  

#### Descrição detalhada

Título em duas linhas; abaixo, a foto em arco; depois, uma faixa de 290px com quatro linhas de novidade sobre uma imagem de folhagem; no fim, o CTA.  

Quatro mecanismos definem a variante:  

O arco é recorte do ativo, não CSS. Não existe border-radius que produza arco em cliente de e-mail. A foto sai do Figma já mascarada, com o fundo da peça preenchendo os cantos superiores.  

A lista não tem CTA por item. É informe, não catálogo. Quatro linhas de ícone e texto, um único botão no fim apontando para a coleção. Colocar botão por linha transforma o bloco em grade de produtos e muda a intenção.  

Duas cores e nada mais. Fundo escuro saturado e creme. O CTA é creme com texto no fundo — não há terceira cor, nem no ícone, nem no texto.  

Tracking largo como assinatura. Título e CTA com letter-spacing de 0.25em e text-indent compensando. É o que dá o registro editorial sem precisar de segunda família tipográfica.  

#### Contexto para a IA

##### Quando usar

Moda, beachwear, joia, casa, beleza — categorias com variação de cor e modelo.  
Quando há quatro novidades que se explicam em uma frase cada.  
Quando a marca tem cor escura saturada de identidade e fotografia de campanha própria.  
Quando o destino é a coleção inteira, não produtos individuais.  

##### Quando NÃO usar

Quando cada item precisa de destino próprio — use uma grade de produtos com CTA por linha.  
Sem foto de campanha — a variante é 60% imagem.  
Base fria ou primeiro contato — não há apresentação de marca nem oferta.  
Mais de quatro novidades — a faixa de 290px não comporta a quinta linha.  
Carrinho, checkout, transacional, prova social.  
Quando a marca é clara: a peça depende do contraste creme sobre escuro.  

##### Orientações de copy para a IA

Título — duas linhas, caixa alta, anunciando a natureza da novidade ("NEW COLORS & SOULFUL EXTRAS"). Sem percentual, sem urgência, sem nome de produto.  

Linhas da lista — uma novidade por linha, em caixa mista, no formato produto + o que mudou. Citar a cor, a variação ou a quantidade nova. Máximo duas linhas de texto cada. Tom de conversa; reticências e prévias do que vem depois são bem-vindas.  

CTA — chamada para explorar a coleção, caixa alta com tracking largo. Sem verbo de compra direta e sem percentual.  

Proibições: preço em qualquer linha · desconto ou cupom · urgência · botão por item · quinta linha · nome da marca no título · exclamação em mais de uma linha.  

##### Design system

Container 600px fixo, sem borda. Zero raio, zero sombra, zero gradiente. Preheader oculto obrigatório.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 33px | 32/35px, tracking +0.25em, caixa alta, 2 linhas, padding lateral 60px |  
| 2 | Foto em arco | 56px | 420 × 510px, centralizada |  
| 3 | Faixa de novidades | 0 | 600 × 290px, com imagem de folhagem ao fundo |  
| 4 | CTA | 31px | 381 × 54px, com 31px de respiro na base |  

Interior da faixa de novidades: bloco de 466px com padding de 28px no topo e 134px à esquerda. Cada linha é ícone de 20 × 20px · espaçador de 10px · texto 22/27px. Entre as linhas, 47px.  

Paleta — duas cores.  

| Papel | Hex (referência) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #5B1724 | Fundo de toda a peça |  |  
| Cor secundária |  |  |  
| #F7F1ED | Título, texto das novidades, ícones e fundo do CTA |  |  

O label do CTA usa a cor primária sobre o creme. Não existe cor de acento: o único ponto de cor da peça é a fotografia.  

Pele alternativa (HTML base): fundo   
#000000 com o mesmo creme. Usar quando a marca não tem cor escura saturada própria.  

Tipografia. Principal: Proxima Nova → Arial → Helvetica em todos os slots. Título 32px regular caixa alta com tracking +0.25em; novidades 22px regular caixa mista sem tracking; CTA 18px bold caixa alta com tracking +0.25em. Secundária não existe — a diferenciação é toda por tracking e caixa.  

Implementação. Fonte web não renderiza em Outlook nem em boa parte do Gmail: testar a degradação para Arial no título, que é onde o tracking largo mais altera a largura. background no <td> da faixa de novidades + background-image inline + background-size:600px 290px, com background-color na cor primária como fallback e bloco VML v:rect/v:fill type="frame" para Outlook. text-indent igual ao letter-spacing para compensar o espaço extra no fim da linha. font-size:0;line-height:0 nas células de ícone e espaçador. Hack u + .body .txt-creme travando o creme sobre o escuro no dark mode.  

Tags: PREHEADER, SECTION_TITLE, ARCH_IMAGE_URL, ARCH_IMAGE_ALT, FOLIAGE_IMAGE_URL, FEATURE_ICON_URL, FEATURE_1_TEXT, FEATURE_2_TEXT, FEATURE_3_TEXT, FEATURE_4_TEXT, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: tentar produzir o arco por CSS · fundo do arco diferente da cor primária · CTA por linha de novidade · terceira cor · ícones diferentes entre as linhas · tracking no texto das novidades · quinta linha · botão com raio · faixa de folhagem sem background-color de fallback.  

##### Direção fotográfica

Foto em arco  

Proporção 4:5 — slot de 420 × 510px, ativo final 840 × 1020px (2x). PNG, < 260 KB. Gerar em 4:5 na altura de 1020px (816 × 1020) e ampliar para 840px de largura.  

Regra crítica: o ativo sai já mascarado em arco — topo semicircular, laterais retas, base reta — com os cantos superiores preenchidos na cor primária da peça. Não é PNG transparente: a transparência não é confiável em Outlook, então o fundo vai chapado no arquivo.  

Composição. Uma ou duas figuras em pé, corpo inteiro, centralizadas no eixo do arco, com folga acima da cabeça para o topo curvo não cortar. Pose relaxada, olhar para a câmera. Cenário arquitetônico com profundidade — porta, parede, vão.  

Cenário e luz. Luz natural quente, sombras suaves, paleta terrosa. Vegetação real na cena, em uma das laterais. O cenário precisa ter contraste tonal com a cor primária da peça — arco escuro sobre fundo escuro desaparece.  

Produto. Vestido pelas figuras, em cor que se destaque do cenário. As novidades citadas na lista precisam estar visíveis na foto.  

Proibições: cabeça encostando no topo curvo · figura fora do eixo do arco · fundo transparente no PNG · cenário de estúdio · texto queimado · marca d'água.  

Folhagem de fundo das novidades  

Proporção 2:1 — slot de 600 × 290px, ativo final 1200 × 580px (2x). PNG com o fundo já na cor primária, < 120 KB.  

Ideia: ramo de folhagem entrando pelo canto inferior esquerdo, ocupando no máximo 130px de largura — o texto começa em 134px e não pode ser tocado. Resto do quadro chapado na cor primária. Folhagem em verde natural, iluminada como se pertencesse à mesma cena da foto em arco.  

Adaptação por categoria — o que é a cena do arco:  

| Categoria | Cena |  
|---|---|  
| Beachwear / resort | Duplas em vão de porta, parede e vegetação |  
| Moda | Figura em pé em cenário arquitetônico |  
| Joia | Busto e mãos, parede texturizada ao fundo |  
| Casa | Ambiente vivido enquadrado pelo arco |  
| Beleza | Retrato de meio corpo, luz de janela |  
| Infantil | Criança em cena de brincadeira, cenário real |  

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 30 | sim |
| `feature_1_text` | `{{FEATURE_1_TEXT}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `feature_2_text` | `{{FEATURE_2_TEXT}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `feature_3_text` | `{{FEATURE_3_TEXT}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `feature_4_text` | `{{FEATURE_4_TEXT}}` | Texto curto | Copy (n8n) | não | 80 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | não |
| `arch_campaign_photo` | `{{ARCH_CAMPAIGN_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `features_foliage_bg` | `{{FEATURES_FOLIAGE_BG}}` | Imagem | Imagem gerada | não | — | — |
| `feature_icon` | `{{FEATURE_ICON}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* Two Line Section Title
    - *Orientação:* 30 (2 linhas de 15)<br>Caixa alta, tracking largo, quebra por <br>
- **`feature_1_text`**
    - *Exemplo:* Feature 1
    - *Orientação:* 80 (2 linhas)<br>Produto + o que mudou
- **`feature_2_text`**
    - *Exemplo:* Feature 2
    - *Orientação:* 80 (2 linhas)<br>Produto + o que mudou
- **`feature_3_text`**
    - *Exemplo:* Feature 3
    - *Orientação:* 80 (2 linhas)<br>Produto + o que mudou
- **`feature_4_text`**
    - *Exemplo:* Feature 4
    - *Orientação:* 80 (2 linhas)<br>Produto + o que mudou
- **`cta_label`**
    - *Exemplo:* EXPLORE OUR COLLECTION
    - *Orientação:* Caixa alta, tracking largo, sem percentual
- **`arch_campaign_photo`**
    - *Orientação:* Onde fica: centralizada, 56px abaixo do título, acima da faixa de novidades.
    - *Imagem:* proporção 4:5 · 420 × 510 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 420 × 510px. Ativo final 840 × 1020px (2x), PNG, < 260 KB. Entregar já mascarado em arco, com os cantos superiores preenchidos na cor primária — não transparente.<br>Ideia: uma ou duas figuras em pé, corpo inteiro, centralizadas no eixo do arco com folga acima da cabeça, em cenário arquitetônico com profundidade e vegetação real numa lateral. Luz natural quente, paleta terrosa. As peças citadas na lista precisam estar visíveis. O cenário tem que contrastar tonalmente com o fundo escuro da peça.
- **`features_foliage_bg`**
    - *Orientação:* Onde fica: imagem de fundo da faixa de 290px das novidades.<br>Nome do ativo: folhagem_[marca].png
    - *Imagem:* proporção 2:1 · 600 × 290 px
    - *Spec da imagem:* Proporção: 2:1. Slot de 600 × 290px. Ativo final 1200 × 580px (2x), PNG com fundo chapado na cor primária, < 120 KB.<br>Ideia: ramo de folhagem verde entrando pelo canto inferior esquerdo, ocupando no máximo 130px de largura — o texto das novidades começa em 134px e não pode ser tocado. O restante do quadro é chapado na cor primária. Iluminação coerente com a foto do arco, como se as duas fossem da mesma cena.
- **`feature_icon`**
    - *Orientação:* Onde fica: início de cada uma das quatro linhas de novidade. Ativo único reutilizado nas quatro — não são quatro arquivos.<br>Nome do ativo: icone_novidade_[marca].png
    - *Imagem:* proporção 1:1 · 20 × 20 px
    - *Spec da imagem:* Proporção: 1:1. Slot de 20 × 20px. Ativo final 40 × 40px (2x), PNG transparente.<br>Ideia: marcador gráfico simples na cor secundária — asterisco, estrela de quatro pontas, losango. Traço fino, sem preenchimento pesado. alt vazio: é decorativo.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Seção — Two Line Section Title (arco + features)</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#000000; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* trava o creme sobre o preto no dark mode */
  u + .body .txt-creme { color:#F7F1ED !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#000000;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#000000;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-creme" style="padding:33px 60px 0 60px;font-family:'Proxima Nova',Arial,Helvetica,sans-serif;font-size:32px;line-height:35px;font-weight:400;letter-spacing:0.25em;text-indent:0.25em;text-transform:uppercase;color:#F7F1ED;">
        Two Line<br>Section Title
      </td>
    </tr>

    <!-- IMAGEM EM ARCO -->
    <tr>
      <td align="center" style="padding:56px 0 0 0;font-size:0;line-height:0;">
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaQAAAH+CAIAAABcO+3zAAAi…[base64 de ~12 KB omitido]…" width="420" height="510" alt="ALT_DA_IMAGEM"
             style="display:block;width:420px;height:510px;">
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- FEATURES sobre a folhagem                                        -->
    <!-- ================================================================ -->
    <tr>
      <td height="290" valign="top"
          
          style="height:290px;background-color:#000000;background-position:left top;background-repeat:no-repeat;background-size:600px 290px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:290px;">
          
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
          <tr>
            <td style="padding:28px 0 0 134px;">
              <table role="presentation" width="466" cellpadding="0" cellspacing="0" border="0" style="width:466px;">

                <!-- feature 1 -->
                <tr>
                  <td width="20" valign="middle" style="width:20px;font-size:0;line-height:0;">
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAC…[base64 de ~1 KB omitido]…" width="20" height="20" alt="" style="display:block;width:20px;height:20px;">
                  </td>
                  <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" class="txt-creme" style="font-family:'Proxima Nova',Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#F7F1ED;">
                    Feature 1
                  </td>
                </tr>

                <tr><td colspan="3" height="47" style="height:47px;font-size:0;line-height:0;">&nbsp;</td></tr>

                <!-- feature 2 -->
                <tr>
                  <td valign="middle" style="font-size:0;line-height:0;">
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAC…[base64 de ~1 KB omitido]…" width="20" height="20" alt="" style="display:block;width:20px;height:20px;">
                  </td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" class="txt-creme" style="font-family:'Proxima Nova',Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#F7F1ED;">
                    Feature 2
                  </td>
                </tr>

                <tr><td colspan="3" height="47" style="height:47px;font-size:0;line-height:0;">&nbsp;</td></tr>

                <!-- feature 3 -->
                <tr>
                  <td valign="middle" style="font-size:0;line-height:0;">
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAC…[base64 de ~1 KB omitido]…" width="20" height="20" alt="" style="display:block;width:20px;height:20px;">
                  </td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" class="txt-creme" style="font-family:'Proxima Nova',Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#F7F1ED;">
                    Feature 3
                  </td>
                </tr>

                <tr><td colspan="3" height="47" style="height:47px;font-size:0;line-height:0;">&nbsp;</td></tr>

                <!-- feature 4 -->
                <tr>
                  <td valign="middle" style="font-size:0;line-height:0;">
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAC…[base64 de ~1 KB omitido]…" width="20" height="20" alt="" style="display:block;width:20px;height:20px;">
                  </td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" class="txt-creme" style="font-family:'Proxima Nova',Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#F7F1ED;">
                    Feature 4
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:31px 0 31px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:381px;">
          <tr>
            <td align="center" height="54" style="width:381px;height:54px;background:#F7F1ED;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:381px;height:54px;line-height:54px;font-family:'Proxima Nova',Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.25em;text-indent:0.25em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">
                Explore Our Collection
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-7bd9e98b"></a>

### 4.4 · produtos 4 - um produto — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | média |
| **Slots de produto** | 1 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | gray_bg, single_col, standalone_component, section_title, body_copy, two_paragraphs, product_card, rounded_card, price_anchor, strikethrough_price, discount_pricing, badge_baked_in_image, offer_badge, square_button, mso_fallback, mobile_responsive, no_logo, no_hero, no_footer |
| **Tamanho do HTML** | 8.6 KB |
| **ID** | `7bd9e98b-f016-4495-8245-88df69b8f4e1` |

#### Descrição curta

Bloco de oferta de produto único. Dois parágrafos explicam o que o produto é, um card mostra nome, preço antes e depois, e um selo circular carrega o prazo da promoção. Momento de uso: campanha de oferta com data-limite para produto de entrada — kit, starter pack, bundle — quando é preciso justificar antes de mostrar o preço.  

#### Descrição detalhada

Título em duas linhas, dois parágrafos de copy, um card de produto com selo sobreposto e o CTA.  

Quatro mecanismos definem a variante:  

O selo circular é 100% HTML e CSS, sem imagem. v:oval no bloco condicional do Outlook e border-radius de 69px nos demais clientes. O prazo é texto vivo — muda por campanha sem passar pelo design.  

O selo sangra para fora do card. Ele ocupa o canto superior direito e transborda a borda. É o que impede o card de parecer um bloco fechado e dá a leitura de adesivo colado.  

Setup longo, oferta curta. Dois parágrafos antes do card e nenhum texto de venda dentro dele. O card só tem nome, preço riscado, preço novo e a foto — a persuasão inteira já aconteceu acima.  

Preço antes e depois na mesma linha. Riscado em peso regular, novo em bold, separados por dois espaços não quebráveis. Sem etiqueta de percentual: a economia se lê pela diferença.  

#### Contexto para a IA

##### Quando usar

Oferta com prazo para produto único de entrada: kit, starter pack, bundle, caixa de degustação.  
Alimentos, bebidas, suplementos, beleza, pet, assinatura — categorias com produto de entrada definido.  
Quando o produto precisa ser explicado antes de precificado — os dois parágrafos existem para isso.  
Quando há prazo real para colocar no selo.  
Quando a marca tem cor escura saturada e uma cor de destaque vibrante.  

##### Quando NÃO usar

Sem prazo real — o selo é o mecanismo central e prazo falso corrói confiança.  
Sem desconto — o par de preços fica vazio.  
Mais de um produto — a variante tem um card só; para várias opções, use uma grade.  
Produto autoexplicativo — os dois parágrafos ficam sobrando e o bloco alonga sem função.  
Carrinho, checkout, transacional, prova social, welcome.  
Marca de luxo: selo de prazo e preço riscado são registro promocional.  

##### Orientações de copy para a IA

Título — o que o produto entrega, em duas linhas, caixa mista. Fala do benefício ou da praticidade, não do preço.  

Copy 1 — o que é o produto e para quem. Uma frase, tom de conversa.  

Copy 2 — o que ele resolve na rotina, terminando em dois-pontos para emendar no card. É a ponte entre argumento e oferta.  

Nome do produto — nome comercial curto, bold.  

Preços — valor cheio riscado e valor promocional em bold. Sem "de/por", sem percentual, sem "economize".  

Selo — três linhas curtas: um rótulo em bold ("P.S.") e o prazo em duas linhas. Data explícita, nunca "por tempo limitado".  

CTA — chamada com urgência leve ligada à oferta, caixa alta.  

Proibições: percentual em qualquer slot · prazo vago no selo · texto de venda dentro do card · segundo produto · contagem regressiva além do selo · exclamação.  

##### Design system

Container 598px fixo. Raio de 14px no card, 69px no selo e 4px no CTA — três raios diferentes, cada um com função.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 48px | 34/33px bold, tracking +0.05em, padding lateral 40px |  
| 2 | Copy 1 | 36px | 25/28px, padding lateral 85px |  
| 3 | Copy 2 | 20px | 25/28px, padding lateral 85px |  
| 4 | Card de produto | 92px | 351px de largura, raio 14px |  
| 5 | CTA | 48px | 368 × 59px, raio 4px, com 65px de respiro na base |  

Anatomia do card: faixa superior com duas colunas — nome e preços em 214px (padding 28px no topo e à esquerda) e o selo em 137px. Abaixo, a foto do produto de 292 × 332px, centralizada, com 1px acima e 37px de respiro na base.  

Selo: círculo de 137 × 137px, border-radius:69px, padding lateral de 14px, texto 20/21px centralizado em três linhas com mso-line-height-rule:exactly.  

Paleta — quatro cores.  

| Papel | Hex (SmoothieBox) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #0D402F | Fundo da seção e todo o texto sobre o card |  |  
| Cor secundária |  |  |  
| #FAFCEE | Fundo do card e todo o texto sobre o fundo escuro |  |  
| Acento A |  |  |  
| #BAD432 | Fundo do selo e o preço riscado |  |  
| Acento B |  |  |  
| #CBD505 | Fundo do CTA |  |  

Os dois acentos são vizinhos na mesma família — não são cores opostas. O texto do selo e o do CTA usam a cor primária, nunca branco. O preço riscado usa o acento A: é o único lugar do bloco onde cor marca informação, não superfície.  

Pele alternativa (HTML base): fundo   
#B1B3B6, card   
#F2F2F2, selo e CTA pretos com texto branco, sem acentos. Usar quando a marca não tem par de cores vibrantes.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título bold com tracking positivo; copies regular; nome do produto e preço novo bold com tracking −0.03em; preço riscado regular com text-decoration:line-through; selo 20px com o rótulo em bold; CTA 24px bold. Secundária não existe.  

Implementação. O selo exige as duas versões: v:oval com fillcolor e v:textbox no bloco [if mso], e a tabela com border-radius no [if !mso]. Sem o VML, o Outlook renderiza quadrado — e um quadrado nesse canto quebra a leitura de adesivo. mso-line-height-rule:exactly no selo para o Outlook não esticar as três linhas. O CTA usa v:roundrect com arcsize="7%". &nbsp;&nbsp; entre os dois preços — margem inline não é confiável. background:#E8E8E8 na <img> como fallback de carregamento.  

Tags: SECTION_TITLE, SECTION_COPY_1, SECTION_COPY_2, PRODUCT_NAME, PRICE_OLD, PRICE_NEW, PRODUCT_IMAGE_URL, PRODUCT_IMAGE_ALT, BADGE_LABEL, BADGE_DEADLINE, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: selo como imagem · selo contido dentro do card, sem sangrar · selo quadrado no Outlook por falta do VML · texto de venda dentro do card · percentual ao lado dos preços · acentos de famílias opostas · texto branco no selo ou no CTA · segundo card · foto com fundo diferente do card.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 4:5 — slot de 292 × 332px, ativo final 584 × 664px (2x). PNG, < 160 KB. Gerar em 4:5 na altura de 664px (531 × 664) e ampliar para 584px de largura.  

Regra crítica: o fundo do ativo é a cor do card, chapado, não branco nem transparente. A foto tem que desaparecer dentro do card — qualquer diferença de tom cria um retângulo visível.  

Composição. Grade 2 × 2 dos itens que compõem o kit, cada um com a quantidade indicada ao lado em número grande. As embalagens são frontais, alinhadas, com o mesmo tamanho aparente. É inventário visual, não cena.  

Cenário e luz. Sem cenário. Cada embalagem recortada, sombra suave ou nenhuma. Luz frontal uniforme.  

Produto. Rótulos legíveis a 292px de largura — o que significa embalagem com nome curto e cor de fundo distinta entre os quatro itens. É a cor de cada sachê que diferencia os sabores.  

Números de quantidade. Fazem parte do ativo, não do HTML: ficam à esquerda de cada embalagem, na cor primária, em corpo grande.  

Proibições: fundo branco ou transparente · cena de uso · embalagens em tamanhos diferentes · sombra dura · quatro itens da mesma cor · texto além dos multiplicadores · marca d'água.  

Adaptação por categoria — o que compõe a grade:  

| Categoria | Itens |  
|---|---|  
| Alimentos / bebidas | Sachês ou embalagens de sabores diferentes |  
| Suplementos | Potes ou sticks da linha |  
| Beleza | Miniaturas do kit |  
| Pet | Sachês ou petiscos por sabor |  
| Casa | Refis ou aromas do conjunto |  
| Assinatura | Itens da caixa do mês |  

#### Schema de output (10 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 48 | sim |
| `section_copy_1` | `{{SECTION_COPY_1}}` | Texto curto | Copy (n8n) | não | 120 | sim |
| `section_copy_2` | `{{SECTION_COPY_2}}` | Texto curto | Copy (n8n) | não | 120 | sim |
| `product_name` | `{{PRODUCT_NAME}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `price_old` | `{{PRICE_OLD}}` | Texto curto | Copy (n8n) | não | 8 | sim |
| `price_new` | `{{PRICE_NEW}}` | Texto curto | Copy (n8n) | não | 8 | sim |
| `badge_label` | `{{BADGE_LABEL}}` | Texto curto | Copy (n8n) | não | 8 | sim |
| `badge_deadline` | `{{BADGE_DEADLINE}}` | Texto curto | Copy (n8n) | não | 40 | não |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `product_kit_grid` | `{{PRODUCT_KIT_GRID}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* Section Title
    - *Orientação:* 48 (2 linhas)<br>Caixa mista, bold, benefício<br><br>Ex - 	Taste 4 Blends in One Simple Box
- **`section_copy_1`**
    - *Exemplo:* 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur
    - *Orientação:* 120 (3 linhas)<br>O que é e para quem<br>Ex - Our Starter Pack makes it easy to dip your toes into SmoothieBox with all our tastiest blends in one box.
- **`section_copy_2`**
    - *Exemplo:* 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur
    - *Orientação:* 120 (3 linhas)<br>Termina em dois-pontos<br>Ex - It's loaded with our favorite blends to brighten your mornings, fuel your afternoons, and keep you glowing all day long:
- **`product_name`**
    - *Exemplo:* Product Name
    - *Orientação:* Bold, nome comercial curto
- **`price_old`**
    - *Exemplo:* $64
    - *Orientação:* Riscado, peso regular
- **`price_new`**
    - *Exemplo:* $59
    - *Orientação:* Bold
- **`badge_label`**
    - *Exemplo:* P.S.
    - *Orientação:* Bold, primeira linha do selo
- **`badge_deadline`**
    - *Exemplo:* Offer ends July 31st.
    - *Orientação:* Data explícita, nunca prazo vago<br>40 (2 linhas)
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, urgência leve
- **`product_kit_grid`**
    - *Orientação:* Onde fica: base do card, centralizada, com 37px de respiro abaixo.<br>Nome do ativo: kit_[produto]_[marca].png
    - *Imagem:* proporção 4:5 · 292 × 332 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 292 × 332px. Ativo final 584 × 664px (2x), PNG, < 160 KB. Gerar em 4:5 na altura de 664px e ampliar para 584px de largura.<br>Ideia: grade 2 × 2 das embalagens que compõem o kit, recortadas, frontais, todas no mesmo tamanho aparente e cada uma em cor distinta para os sabores se lerem apartados. Multiplicador de quantidade à esquerda de cada uma, na cor primária, acrescentado na montagem. Fundo chapado na cor do card, para a foto desaparecer dentro dele. Luz frontal uniforme, sem cenário e sem sombra dura.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Seção — Selo circular 100% HTML/CSS</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .selo-txt { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;min-width:598px;max-width:598px;background:#B1B3B6;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:48px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:33px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#000000;">
        Section Title
      </td>
    </tr>

    <!-- COPY 1 -->
    <tr>
      <td align="center" class="txt-blk" style="padding:36px 85px 0 85px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:400;color:#000000;">
        1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur
      </td>
    </tr>

    <!-- COPY 2 -->
    <tr>
      <td align="center" class="txt-blk" style="padding:20px 85px 0 85px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:400;color:#000000;">
        2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- CARD DE PRODUTO                                                  -->
    <!-- ================================================================ -->
    <tr>
      <td align="center" style="padding:92px 0 0 0;">
        <table role="presentation" width="351" cellpadding="0" cellspacing="0" border="0"
               style="width:351px;background:#F2F2F2;border-radius:14px;">

          <!-- faixa superior -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="351" cellpadding="0" cellspacing="0" border="0" style="width:351px;">
                <tr>

                  <!-- nome e preços -->
                  <td width="214" valign="top" style="width:214px;padding:28px 0 0 28px;">
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:26px;font-weight:700;letter-spacing:-0.03em;color:#000000;">
                      Product Name
                    </div>
                    <div style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:26px;letter-spacing:-0.03em;color:#000000;">
                      <span style="text-decoration:line-through;font-weight:400;">$64</span>
                      &nbsp;&nbsp;
                      <span style="font-weight:700;">$59</span>
                    </div>
                  </td>

                  <!-- ============================================== -->
                  <!-- SELO: 100% HTML/CSS, sem imagem                -->
                  <!-- ============================================== -->
                  <td width="137" valign="top" style="width:137px;font-size:0;line-height:0;">

                    <!-- Outlook: círculo real via VML -->
                    <!--[if mso]>
                    <v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:137px;height:137px;" fillcolor="#000000" stroke="f">
                      <v:textbox inset="12px,40px,12px,12px">
                        <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:20px;line-height:21px;">
                          <b>P.S.</b><br>Offer ends<br>July 31st.
                        </center>
                      </v:textbox>
                    </v:oval>
                    <![endif]-->

                    <!-- demais clientes: border-radius -->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:137px;">
                      <tr>
                        <td align="center" valign="middle" height="137" class="selo-txt"
                            style="width:137px;height:137px;background-color:#000000;border-radius:69px;padding:0 14px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:21px;color:#FFFFFF;text-align:center;mso-line-height-rule:exactly;">
                          <span style="font-weight:700;">P.S.</span><br>
                          <span style="font-weight:400;">Offer ends<br>July&nbsp;31st.</span>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->

                  </td>

                </tr>
              </table>
            </td>
          </tr>

          <!-- foto do produto -->
          <tr>
            <td align="center" style="padding:1px 0 37px 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASQAAAFMCAIAAADtPFaMAAAE…[base64 de ~1 KB omitido]…" width="292" height="332" alt="ALT_DO_PRODUTO"
                   style="display:block;width:292px;height:332px;background:#E8E8E8;">
            </td>
          </tr>

        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:48px 0 65px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:59px;v-text-anchor:middle;width:368px;" arcsize="7%" stroke="f" fillcolor="#000000">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;">SHOP NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:368px;">
          <tr>
            <td align="center" height="59" style="width:368px;height:59px;background:#000000;border-radius:4px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:368px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP NOW
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-7ef1a9f4"></a>

### 4.5 · produtos 5 - 3 produtos mesmo fundo — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 3 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | gray_bg, single_col, standalone_component, section_title, body_copy, two_paragraphs, product_card, rounded_card, price_anchor, strikethrough_price, discount_pricing, badge_baked_in_image, offer_badge, square_button, mso_fallback, mobile_responsive, no_logo, no_hero, no_footer |
| **Tamanho do HTML** | 17.8 KB |
| **ID** | `7ef1a9f4-5141-4732-b58c-15628ac8e4a8` |

#### Descrição curta

Bloco de oferta em catálogo curto. Três produtos, cada um com foto, nome, três benefícios em lista e botão próprio, com um selo circular de percentual colado na foto. Momento de uso: campanha de desconto por categoria, quando o leitor escolhe entre poucas opções da mesma linha e o desconto vale para todas.  

#### Descrição detalhada

Três blocos de produto empilhados, alternando o lado da foto, sem título de seção e sem CTA final.  

Quatro mecanismos definem a variante:  

Cada bloco tem métrica própria. Larguras de 564, 598 e 531px; paddings de 72, 82 e 76px; fotos de 277 × 384, 244 × 406 e 244 × 400. Não é grade regular — é layout desenhado produto a produto, e é isso que tira o ar de tabela.  

O selo circular é HTML e CSS, e muda de posição em cada bloco. v:oval no Outlook, border-radius:55px nos demais. No produto 1 ele fica no canto inferior; nos produtos 2 e 3, no topo. A posição segue o espaço vazio da foto, não uma regra fixa.  

Sem título de seção e sem CTA final. O bloco começa direto no primeiro produto e termina no terceiro. É um trecho de catálogo, não uma seção fechada — precisa de um hero acima para ter contexto.  

Três benefícios por produto, marcados com +. O sinal é caractere de texto numa coluna de 12px, não ícone. Sempre três, sempre na mesma estrutura.  

#### Contexto para a IA

##### Quando usar

Campanha de desconto por categoria com percentual igual para todos os itens.  
Beleza, skincare, suplementos, cuidado pessoal — categorias em que o benefício se explica em três linhas.  
Quando há três produtos da mesma linha com páginas próprias.  
Quando existe hero ou barra de contexto acima: o bloco não se apresenta sozinho.  
Quando as fotos são packshots recortados que podem ceder um canto vazio para o selo.  

##### Quando NÃO usar

Percentuais diferentes por produto — o selo repetido com valores distintos vira ruído; nesse caso, preço riscado por item resolve melhor.  
Sem desconto — o selo é o mecanismo e não há onde colocar preço.  
Como bloco isolado — sem hero acima, o e-mail começa sem contexto.  
Fotos sem canto livre — o selo cai sobre o produto.  
Carrinho, checkout, transacional, prova social.  
Mais de três produtos — a métrica é desenhada bloco a bloco e não escala por repetição.  

##### Orientações de copy para a IA

Nome do produto — nome comercial em duas linhas. A quebra é semântica: linha 1 é o atributo, linha 2 é a categoria.  

Benefícios — exatamente três por produto, uma linha cada sempre que possível, começando por verbo na terceira pessoa ("Brightens with...", "Hydrates and smooths"). Sem ponto final. Os três precisam ser diferentes entre si e entre produtos — é o que permite escolher.  

Selo — o percentual em duas linhas: valor e a palavra de desconto. Nada além disso.  

CTA — verbo genérico, igual nos três. A diferenciação está no nome e nos benefícios.  

Proibições: preço em qualquer slot · benefícios repetidos entre produtos · quarto benefício · percentual diferente entre selos · prazo no selo · rótulos de botão diferentes entre produtos · ponto final nos benefícios.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Raio de 55px no selo; CTA e demais elementos com cantos vivos.  

Estrutura — três blocos com métrica própria.  

| Bloco | Padding do bloco | Largura interna | Foto | Posição do selo | Padding do texto |  
|---|---|---|---|---|---|  
| Produto 1 | 72px topo · 34px esquerda | 564px | 277 × 384px, à esquerda | Canto inferior: 275px do topo | 21px topo |  
| Produto 2 | — | 598px | 244 × 406px, à direita | Canto superior: 28px da esquerda | 82px topo · 69px esquerda |  
| Produto 3 | 67px esquerda · 28px base | 531px | 244 × 400px, à esquerda | Canto superior: 56px da esquerda | 76px topo |  

Gap entre foto e texto: 26px nos blocos 1 e 3; no bloco 2 a foto fica à direita, com 39px de respiro na borda.  

Coluna de texto (261px nos blocos 1 e 3, 315px no bloco 2): nome 30/33px bold caixa alta em 2 linhas · lista com 24px acima, largura 209px, coluna do + com 12px e espaçador de 25px, itens 20/23px separados por 10px · CTA 20px acima, 164 × 43px.  

Paleta — três cores.  

| Papel | Hex (Colleen Rothschild) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #443A31 | Fundo do selo, nome, benefícios e contorno do CTA |  |  
| Cor secundária |  |  |  
| #EDEAE3 | Fundo da seção |  |  
| Neutro invertido |  |  |  
| #FFFFFF | Texto dentro do selo |  |  

O selo é o único elemento sólido da peça. Não existe cor de acento — a cor vem das embalagens.  

Pele alternativa (HTML base): fundo branco, selo   
#D9D9D9 com texto   
#28252B, CTA preto sólido com label branco. Usar quando a marca não tem par de neutros próprio.  

Tipografia. Principal: Arial → Helvetica em benefícios, selo e CTA. Secundária: serif com itálico, usada apenas no nome do produto — é o que dá o registro de beleza premium. Nome em caixa mista quando há serif; caixa alta bold na pele do HTML base.  

Implementação. Cada foto é background-image do <td> com background-size próprio e bloco VML v:rect/v:fill type="frame", porque o selo fica sobreposto a ela. O selo exige as duas versões: v:oval no [if mso] e tabela com border-radius no [if !mso] — sem o VML, o Outlook renderiza quadrado. O + é caractere numa <td> de largura fixa, nunca imagem. Hack u + .body .txt-prim.  

Tags: PREHEADER, PRODUCT_N_IMAGE_URL, PRODUCT_N_NAME, PRODUCT_N_FEATURE_1, PRODUCT_N_FEATURE_2, PRODUCT_N_FEATURE_3, BADGE_TEXT, PRODUCT_CTA_LABEL, PRODUCT_N_CTA_URL.  

Erros que quebram o padrão: selo como imagem · selo quadrado no Outlook por falta do VML · selo na mesma posição nos três blocos · três blocos com a mesma métrica · quarto benefício · rótulos de botão diferentes entre produtos · preço no bloco · título de seção ou CTA final acrescentados · + como ícone.  

##### Direção fotográfica

Três slots com proporções diferentes — a variante não usa medida única.  

| Slot | Proporção | Slot em px | Ativo final |  
|---|---|---|---|  
| Produto 1 | 3:4 | 277 × 384 | 554 × 768 (2x) |  
| Produto 2 | 9:16 | 244 × 406 | 488 × 812 (2x) |  
| Produto 3 | 9:16 | 244 × 400 | 488 × 800 (2x) |  

PNG, < 150 KB cada.  

Regra crítica: o fundo do ativo é a cor da seção, chapado — não branco, não transparente. E cada foto precisa de um canto livre de 109 × 109px para o selo: inferior esquerdo no produto 1, superior esquerdo nos produtos 2 e 3.  

Composição. Packshot recortado em ângulo, flutuando, com sombra projetada longa e suave. O produto ocupa a diagonal do quadro e sangra por pelo menos uma borda. Rótulo legível e voltado para a câmera.  

Variação entre os três. Um com o produto inteiro e vertical; um com a embalagem aberta e a tampa separada, mais elementos soltos em volta (gotas, texturas); um com o produto tombado ou visto de cima, mostrando o conteúdo. Três packshots iguais em ângulos iguais anulam o layout orgânico.  

Luz. Direcional suave, sombra projetada visível — é ela que dá volume ao recorte sobre o fundo chapado.  

Proibições: fundo branco ou transparente · cenário · produto centralizado e alinhado ao eixo · sombra dura · selo ou texto queimado · três ângulos iguais · marca d'água.  

Adaptação por categoria — o que é o packshot:  

| Categoria | Enquadramento |  
|---|---|  
| Skincare | Frasco em ângulo, tampa separada, gotas de textura |  
| Suplementos | Pote inclinado, cápsulas ou pó soltos |  
| Cabelo | Bisnaga tombada, produto escorrendo |  
| Casa | Frasco em ângulo, superfície sugerida pela sombra |  
| Pet | Embalagem inclinada, petiscos soltos |  
| Maquiagem | Compacto aberto, swatch ao lado |  

#### Schema de output (17 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `header_title` | `{{HEADER_TITLE}}` | Texto curto | Copy (n8n) | não | 44 | sim |
| `header_subtitle` | `{{HEADER_SUBTITLE}}` | Texto curto | Copy (n8n) | não | 76 | não |
| `product_1_name` | `{{PRODUCT_1_NAME}}` | Texto curto | Copy (n8n) | não | 34 | não |
| `product_3_name` | `{{PRODUCT_3_NAME}}` | Texto curto | Copy (n8n) | não | 34 | não |
| `product_2_name` | `{{PRODUCT_2_NAME}}` | Texto curto | Copy (n8n) | não | 34 | não |
| `product_1_feature_1` | `{{PRODUCT_1_FEATURE_1}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_2_feature_1` | `{{PRODUCT_2_FEATURE_1}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_1_feature_2` | `{{PRODUCT_1_FEATURE_2}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_2_feature_2` | `{{PRODUCT_2_FEATURE_2}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_2_feature_3` | `{{PRODUCT_2_FEATURE_3}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_1_feature_3` | `{{PRODUCT_1_FEATURE_3}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_3_feature_1` | `{{PRODUCT_3_FEATURE_1}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_3_feature_2` | `{{PRODUCT_3_FEATURE_2}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_3_feature_3` | `{{PRODUCT_3_FEATURE_3}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `product_cta_label_1` | `{{PRODUCT_CTA_LABEL_1}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `product_cta_label_3` | `{{PRODUCT_CTA_LABEL_3}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `product_cta_label_2` | `{{PRODUCT_CTA_LABEL_2}}` | Texto curto | Copy (n8n) | não | 12 | não |

**Detalhe dos campos**

- **`header_title`**
    - *Exemplo:* Section Title
    - *Orientação:* Caixa mista, enuncia a campanha, sem percentual
- **`header_subtitle`**
    - *Exemplo:* Section Copy Line 1 Section Copy Line 2
    - *Orientação:* O que a seleção tem em comum, com ponto final<br>76 (2 linhas)
- **`product_1_name`**
    - *Exemplo:* Product Name 1
    - *Orientação:* 34 (2 linhas)
- **`product_3_name`**
    - *Exemplo:* Product Name 3
    - *Orientação:* 34 (2 linhas)
- **`product_2_name`**
    - *Exemplo:* Product Name 2
    - *Orientação:* 34 (2 linhas)
- **`product_1_feature_1`**
    - *Exemplo:* Product 1 Feature 1
    - *Orientação:* Verbo na terceira pessoa, sem ponto final
- **`product_2_feature_1`**
    - *Exemplo:* Product 2 Feature 1
    - *Orientação:* Verbo na terceira pessoa, sem ponto final
- **`product_1_feature_2`**
    - *Exemplo:* Product 1 Feature 2
    - *Orientação:* Benefício distinto
- **`product_2_feature_2`**
    - *Exemplo:* Product 2 Feature 2
    - *Orientação:* Benefício distinto
- **`product_2_feature_3`**
    - *Exemplo:* Product 2 Feature 3
    - *Orientação:* Benefício distinto
- **`product_1_feature_3`**
    - *Exemplo:* Product 1 Feature 3
    - *Orientação:* Benefício distinto
- **`product_3_feature_1`**
    - *Exemplo:* Product 3 Feature 1
- **`product_3_feature_2`**
    - *Exemplo:* Product 3 Feature 2
- **`product_3_feature_3`**
    - *Exemplo:* Product 3 Feature 3
- **`product_cta_label_1`**
    - *Exemplo:* CTA 1
    - *Orientação:* SHOW NOW
- **`product_cta_label_3`**
    - *Exemplo:* CTA 3
    - *Orientação:* SHOW NOW
- **`product_cta_label_2`**
    - *Exemplo:* CTA  2
    - *Orientação:* SHOW NOW

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Três produtos com selo de desconto</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-prim { color:#28252B !important; }
  u + .body .txt-000 { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">


    <!-- ================================================================ -->
    <!-- FAIXA CINZA — TÍTULO + COPY                                      -->
    <!-- ================================================================ -->
    <tr>
      <td align="center" style="background:#F3F3F3;padding:34px 69px 34px 69px;">
        <div class="txt-000" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:45px;font-weight:700;text-transform:uppercase;color:#000000;">
          Section Title
        </div>
        <div class="txt-000" style="padding-top:15px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;">
          Section Copy Line 1<br>Section Copy Line 2
        </div>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 1 — foto à esquerda, selo no canto inferior              -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:63px 0 0 34px;">
        <table role="presentation" width="564" cellpadding="0" cellspacing="0" border="0" style="width:564px;">
          <tr>

            <!-- foto + selo -->
            <td width="277" valign="top"
                background="URL_FOTO_1"
                style="width:277px;background-color:#FFFFFF;background-image:url('URL_FOTO_1');background-position:left top;background-repeat:no-repeat;background-size:277px 384px;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:277px;height:384px;">
                <v:fill type="frame" src="URL_FOTO_1" color="#FFFFFF" />
                <v:textbox inset="0,0,0,0"><![endif]-->
              <table role="presentation" width="277" cellpadding="0" cellspacing="0" border="0" style="width:277px;">
                <tr>
                  <td align="left" style="padding:275px 0 0 0;font-size:0;line-height:0;">
                    <!--[if mso]>
                    <v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:109px;height:109px;" fillcolor="#D9D9D9" stroke="f">
                      <v:textbox inset="6px,26px,6px,6px">
                        <center style="color:#28252B;font-family:Arial,sans-serif;font-size:25px;line-height:28px;font-weight:bold;">SELO 1<br>OFF 1</center>
                      </v:textbox>
                    </v:oval>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:109px;">
                      <tr>
                        <td align="center" valign="middle" height="109" class="txt-prim"
                            style="width:109px;height:109px;background:#D9D9D9;border-radius:55px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;text-transform:uppercase;color:#28252B;text-align:center;">
                          SELO 1<br>OFF 1
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr><td height="0" style="height:0;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>

            <td width="26" style="width:26px;font-size:0;line-height:0;">&nbsp;</td>

            <!-- texto -->
            <td width="261" valign="top" style="width:261px;padding:21px 0 0 0;">
              <div class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 1
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;width:209px;">
                <tr>
                  <td width="12" class="txt-prim" style="width:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td width="25" style="width:25px;font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 1 Feature 1</td>
                </tr>
                <tr><td colspan="3" height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 1 Feature 2</td>
                </tr>
                <tr><td colspan="3" height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 1 Feature 3</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;width:164px;">
                <tr>
                  <td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                    <a href="URL_CTA_1" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 1</a>
                  </td>
                </tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 2 — foto à direita, selo no topo                         -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>

            <!-- texto -->
            <td width="315" valign="top" style="width:315px;padding:82px 0 0 69px;">
              <div class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 2
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;width:209px;">
                <tr>
                  <td width="12" class="txt-prim" style="width:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td width="25" style="width:25px;font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 2 Feature 1</td>
                </tr>
                <tr><td colspan="3" height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 2 Feature 2</td>
                </tr>
                <tr><td colspan="3" height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 2 Feature 3</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;width:164px;">
                <tr>
                  <td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                    <a href="URL_CTA_2" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 2</a>
                  </td>
                </tr>
              </table>
            </td>

            <!-- foto + selo -->
            <td width="244" valign="top"
                background="URL_FOTO_2"
                style="width:244px;background-color:#FFFFFF;background-image:url('URL_FOTO_2');background-position:left top;background-repeat:no-repeat;background-size:244px 406px;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:244px;height:406px;">
                <v:fill type="frame" src="URL_FOTO_2" color="#FFFFFF" />
                <v:textbox inset="0,0,0,0"><![endif]-->
              <table role="presentation" width="244" cellpadding="0" cellspacing="0" border="0" style="width:244px;">
                <tr>
                  <td align="left" style="padding:0 0 297px 28px;font-size:0;line-height:0;">
                    <!--[if mso]>
                    <v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:109px;height:109px;" fillcolor="#D9D9D9" stroke="f">
                      <v:textbox inset="6px,26px,6px,6px">
                        <center style="color:#28252B;font-family:Arial,sans-serif;font-size:25px;line-height:28px;font-weight:bold;">SELO 2<br>OFF 2</center>
                      </v:textbox>
                    </v:oval>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:109px;">
                      <tr>
                        <td align="center" valign="middle" height="109" class="txt-prim"
                            style="width:109px;height:109px;background:#D9D9D9;border-radius:55px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;text-transform:uppercase;color:#28252B;text-align:center;">
                          SELO 2<br>OFF 2
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>

            <td width="39" style="width:39px;font-size:0;line-height:0;">&nbsp;</td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- PRODUTO 3 — foto à esquerda, selo no topo                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:0 0 28px 67px;">
        <table role="presentation" width="531" cellpadding="0" cellspacing="0" border="0" style="width:531px;">
          <tr>

            <!-- foto + selo -->
            <td width="244" valign="top"
                background="URL_FOTO_3"
                style="width:244px;background-color:#FFFFFF;background-image:url('URL_FOTO_3');background-position:left top;background-repeat:no-repeat;background-size:244px 400px;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:244px;height:400px;">
                <v:fill type="frame" src="URL_FOTO_3" color="#FFFFFF" />
                <v:textbox inset="0,0,0,0"><![endif]-->
              <table role="presentation" width="244" cellpadding="0" cellspacing="0" border="0" style="width:244px;">
                <tr>
                  <td align="left" style="padding:0 0 291px 56px;font-size:0;line-height:0;">
                    <!--[if mso]>
                    <v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:109px;height:109px;" fillcolor="#D9D9D9" stroke="f">
                      <v:textbox inset="6px,26px,6px,6px">
                        <center style="color:#28252B;font-family:Arial,sans-serif;font-size:25px;line-height:28px;font-weight:bold;">SELO 3<br>OFF 3</center>
                      </v:textbox>
                    </v:oval>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:109px;">
                      <tr>
                        <td align="center" valign="middle" height="109" class="txt-prim"
                            style="width:109px;height:109px;background:#D9D9D9;border-radius:55px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;text-transform:uppercase;color:#28252B;text-align:center;">
                          SELO 3<br>OFF 3
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>

            <td width="26" style="width:26px;font-size:0;line-height:0;">&nbsp;</td>

            <!-- texto -->
            <td width="261" valign="top" style="width:261px;padding:76px 0 0 0;">
              <div class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
                Product<br>Name 3
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;width:209px;">
                <tr>
                  <td width="12" class="txt-prim" style="width:12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td width="25" style="width:25px;font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 3 Feature 1</td>
                </tr>
                <tr><td colspan="3" height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 3 Feature 2</td>
                </tr>
                <tr><td colspan="3" height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">+</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                  <td class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:23px;color:#28252B;">Product 3 Feature 3</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;width:164px;">
                <tr>
                  <td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                    <a href="URL_CTA_3" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 3</a>
                  </td>
                </tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-fc41efe6"></a>

### 4.6 · produtos 6 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | baixa |
| **Slots de produto** | 2 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, bordered_container, standalone_component, decorative_pattern, checkerboard_band, pattern_baked_in_image, section_title, product_list, two_products, image_left, repeatable_blocks, no_price, square_button, mso_fallback, mobile_responsive, no_logo, no_hero, no_footer, not_mobile_stacked |
| **Tamanho do HTML** | 7.0 KB |
| **ID** | `fc41efe6-a2dc-493a-ab92-75e30fd13198` |

#### Descrição curta

Bloco de vitrine de promoção. Uma faixa xadrez marca o início, um título anuncia a lista e dois produtos aparecem com foto, nome e uma frase de descrição — sem preço, sem selo e sem botão individual. Momento de uso: e-mail de sale semanal ou recorrente, quando o objetivo é dizer o que entrou em promoção e mandar todo mundo para a mesma página.  

#### Descrição detalhada

Faixa xadrez de 98px, título, dois blocos de produto em linha e um CTA único.  

Quatro mecanismos definem a variante:  

A faixa xadrez é 100% HTML. Vinte e duas células de 49px em duas linhas alternadas, cada uma com font-size:0;line-height:0. Nenhuma imagem — o ornamento de marca sobrevive a imagem bloqueada e muda de cor por loja sem passar pelo design.  

A foto sangra na borda esquerda do container. Padding zero à esquerda: a imagem encosta na borda e o texto ocupa os 332px restantes. Isso dá leitura de lista corrida, não de card.  

Nenhum preço, selo ou botão por item. Só nome e uma frase. O bloco diz o que está em promoção, não por quanto — o preço fica na página de destino.  

O nome do produto é regular, não bold. A hierarquia contra a descrição vem só do tamanho, 30px contra 24px. Colocar bold no nome achata a diferença e o bloco vira catálogo.  

#### Contexto para a IA

##### Quando usar

Sale recorrente — promoção semanal, "o que entrou essa semana", liquidação de categoria.  
Alimentos, bebidas, açougue, mercearia, casa, pet — categorias de compra frequente.  
Quando os produtos compartilham o mesmo destino e não precisam de página própria.  
Quando a marca tem um ornamento gráfico de identidade que se resolve em módulos quadrados.  
Quando basta nomear o produto e dar uma frase: a decisão acontece na página.  

##### Quando NÃO usar

Quando o preço é o argumento — não há slot para valor nem para percentual.  
Produtos com destinos diferentes — o CTA é único.  
Mais de dois produtos — o padrão é uma lista curta; a partir do terceiro, use uma grade.  
Marca sem ornamento gráfico — a faixa xadrez precisa fazer parte da identidade, senão vira enfeite solto.  
Carrinho, checkout, transacional, prova social, welcome.  
Categorias de ticket alto: a densidade baixa e a ausência de preço soam informais demais.  

##### Orientações de copy para a IA

Título — anuncia a lista, em caixa alta, terminando em dois-pontos. O sinal é o que emenda no que vem abaixo.  

Nome do produto — nome comercial curto, uma linha. Pode incluir a medida ou o peso quando isso identifica o item.  

Descrição — uma frase em duas linhas dizendo como é ou para que serve. Adjetivos concretos e o uso pretendido. Ponto final obrigatório. As duas descrições precisam ter estrutura diferente entre si — se as duas seguirem o mesmo molde, a lista fica mecânica.  

CTA — verbo genérico apontando para a sale inteira, caixa alta com tracking largo.  

Proibições: preço ou percentual em qualquer slot · nome do produto em bold · descrição com mais de duas linhas · terceiro produto · CTA por item · exclamação.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Faixa xadrez | 29px topo · 30px esquerda · 29px direita | 539 × 98px |  
| 2 | Título | 53px | 40/46px bold, caixa alta, padding lateral 40px |  
| 3 | Produto 1 | 51px | Linha de 598px |  
| 4 | Produto 2 | 22px | Linha de 598px |  
| 5 | CTA | 66px | 415 × 67px, com 29px de respiro na base |  

Faixa xadrez: duas linhas de 11 células de 49 × 49px. Na linha superior, as colunas ímpares são preenchidas; na inferior, as pares. Isso dá 6 células cheias em cima e 5 embaixo — a assimetria é o que faz o padrão parecer contínuo apesar de só ter duas fileiras.  

Linha de produto: foto de 266 × 217px encostada na borda esquerda, sem padding; coluna de texto de 332px com padding de 64px no topo (62px no produto 2), 39px à esquerda e 20px à direita. Nome 30/34px regular; descrição 15px abaixo, 24/29px em duas linhas.  

Paleta — duas cores.  

| Papel | Hex (referência) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #A51E24 | Faixa xadrez e fundo do CTA |  |  
| Cor secundária |  |  |  
| #000000 | Título, nome e descrição |  |  

O fundo é branco e o label do CTA também. A cor primária aparece só nos dois elementos gráficos — faixa e botão — e nunca em texto corrido. É o que amarra o topo ao rodapé do bloco.  

Pele alternativa (HTML base): faixa e CTA em preto, sem cor de marca. Usar quando a loja não tem cor própria definida.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 40px bold caixa alta; nome 30px regular; descrição 24px regular; CTA 18px regular caixa alta com tracking +0.25em e text-indent compensando. Secundária não existe.  

Implementação. Cada célula do xadrez precisa de width, height, font-size:0 e line-height:0 — sem isso o Outlook insere altura fantasma e o padrão desalinha. A <img> com display:block e background:#EFEFEF como fallback. font-size:0;line-height:0 na célula da foto. Hack u + .body .txt-blk.  

Tags: CHECKER_COLOR, SECTION_TITLE, PRODUCT_N_IMAGE_URL, PRODUCT_N_IMAGE_ALT, PRODUCT_N_NAME, PRODUCT_N_DESCRIPTION, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: xadrez como imagem · célula sem font-size:0 · as duas fileiras do xadrez com o mesmo número de células cheias · foto com padding à esquerda · nome do produto em bold · preço no bloco · CTA por produto · terceiro produto · cor primária em texto.  

##### Direção fotográfica

Proporção 5:4 — slot de 266 × 217px, ativo final 532 × 434px (2x). PNG, < 120 KB cada. Gerar em 5:4 na altura de 434px (543 × 434) e cortar 11px de largura.  

Regra crítica: fundo branco puro, igual ao do container. A foto não tem moldura nem borda, então qualquer diferença de tom desenha um retângulo à esquerda do texto.  

Composição. Produto isolado, sem prato, sem tábua, sem prop. Centralizado no quadro com folga em volta — diferente das variantes de packshot sangrado, aqui a imagem respira porque não há contorno que a segure.  

Luz. Difusa e frontal, sombra mínima. Nada de sombra projetada longa: ela criaria uma linha visível contra o branco do container.  

Produto. Cru, montado ou porcionado conforme a categoria, mostrado como o cliente vai receber. Textura em primeiro plano — é o único argumento visual, já que não há preço nem selo.  

Os dois quadros precisam ter escalas diferentes. Um mais fechado, com o produto ocupando pouco do quadro, e outro mais aberto, preenchendo quase toda a área. É o que evita que a lista pareça duas fotos do mesmo lote.  

Proibições: fundo colorido ou cinza · sombra projetada longa · prop, prato ou tábua · texto/preço/selo queimado · produto sangrando nas bordas · dois quadros na mesma escala · marca d'água.  

Adaptação por categoria — o que é o produto:  

| Categoria | Enquadramento |  
|---|---|  
| Açougue / carnes | Corte cru embalado ou porção pronta |  
| Mercearia | Embalagem frontal |  
| Bebidas | Garrafa ou lata isolada |  
| Casa | Item avulso, sem ambiente |  
| Pet | Embalagem ou petisco solto |  
| Padaria | Peça inteira ou fatiada |  

#### Schema de output (8 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) _(auto)_ | não | 24 | não |
| `product_1_name` | `{{PRODUCT_1_NAME}}` | Texto curto | Copy (n8n) _(auto)_ | não | 26 | sim |
| `product_1_description` | `{{PRODUCT_1_DESCRIPTION}}` | Texto curto | Copy (n8n) _(auto)_ | não | 56 | não |
| `product_2_name` | `{{PRODUCT_2_NAME}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `product_2_description` | `{{PRODUCT_2_DESCRIPTION}}` | Texto curto | Copy (n8n) | não | 56 | não |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 26 | não |
| `product_1_photo` | `{{PRODUCT_1_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_2_photo` | `{{PRODUCT_2_PHOTO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* WHAT'S ON SALE:
    - *Orientação:* Caixa alta, bold, termina em dois-pontos
- **`product_1_name`**
    - *Exemplo:* Product Name 1
    - *Orientação:* Uma linha, peso regular
- **`product_1_description`**
    - *Exemplo:* Brief Product 1 Description 1
    - *Orientação:* 56 (2 linhas)<br>Uma frase, com ponto final
- **`product_2_name`**
    - *Exemplo:* Product Name 2
    - *Orientação:* Uma linha, pode incluir peso ou medida
- **`product_2_description`**
    - *Exemplo:* Brief Product 2 Description 2
    - *Orientação:* 56 (2 linhas)<br>Estrutura diferente da descrição 1
- **`cta_label`**
    - *Exemplo:* SHOP sale
    - *Orientação:* Caixa alta, tracking largo, aponta para a sale
- **`product_1_photo`**
    - *Orientação:* Onde fica: coluna esquerda da linha 1, encostada na borda do container, sem padding.
    - *Imagem:* proporção 5:4 · 266 × 217 px
    - *Spec da imagem:* Proporção: 5:4. Slot de 266 × 217px. Ativo final 532 × 434px (2x), PNG, < 120 KB. Fundo branco puro.<br>Ideia: produto isolado em escala fechada, ocupando cerca de metade do quadro, com folga em volta. Corte cru, peça inteira ou embalagem frontal conforme a categoria. Luz frontal difusa, sem sombra projetada, textura nítida. Sem prato, tábua ou prop.
- **`product_2_photo`**
    - *Orientação:* Onde fica: coluna esquerda da linha 2, encostada na borda do container.
    - *Imagem:* proporção 5:4 · 266 × 217 px
    - *Spec da imagem:* Proporção: 5:4. Slot de 266 × 217px. Ativo final 532 × 434px (2x), PNG, < 120 KB. Fundo branco puro.<br>Ideia: produto isolado em escala aberta, preenchendo quase todo o quadro — o oposto do slot 1. Preparação ou porção pronta em vez de peça crua, quando a categoria permitir. Mesma luz e mesmo fundo do slot 1; muda a escala e o estado do produto.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — What&rsquo;s On Sale</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ============ FAIXA XADREZ (11 colunas x 2 linhas de 49px) ============ -->
    <tr>
      <td style="padding:29px 29px 0 30px;font-size:0;line-height:0;">
        <table role="presentation" width="539" cellpadding="0" cellspacing="0" border="0" style="width:539px;">
          <!-- linha superior: preto nas colunas ímpares -->
          <tr>
            <td width="49" height="49" style="width:49px;height:49px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td width="49" style="width:49px;background:#000000;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- linha inferior: preto nas colunas pares -->
          <tr>
            <td height="49" style="height:49px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#000000;font-size:0;line-height:0;">&nbsp;</td>
            <td style="background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:53px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:40px;line-height:46px;font-weight:700;text-transform:uppercase;color:#000000;">
        What&rsquo;s On Sale:
      </td>
    </tr>


    <!-- ============ PRODUTO 1 ============ -->
    <tr>
      <td style="padding:51px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <!-- imagem sangrada na borda esquerda -->
            <td width="266" valign="top" style="width:266px;font-size:0;line-height:0;">
              <img src="URL_FOTO_1" width="266" height="217" alt="ALT_PRODUTO_1"
                   style="display:block;width:266px;height:217px;background:#EFEFEF;">
            </td>
            <!-- texto -->
            <td width="332" valign="top" style="width:332px;padding:64px 20px 0 39px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:400;color:#000000;">
                Product Name 1
              </div>
              <div class="txt-blk" style="padding-top:15px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:29px;font-weight:400;color:#000000;">
                Brief Product 1 <br>Description 1
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ PRODUTO 2 ============ -->
    <tr>
      <td style="padding:22px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td width="266" valign="top" style="width:266px;font-size:0;line-height:0;">
              <img src="URL_FOTO_2" width="266" height="217" alt="ALT_PRODUTO_2"
                   style="display:block;width:266px;height:217px;background:#EFEFEF;">
            </td>
            <td width="332" valign="top" style="width:332px;padding:62px 20px 0 39px;">
              <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:400;color:#000000;">
                Product Name 2
              </div>
              <div class="txt-blk" style="padding-top:15px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:29px;font-weight:400;color:#000000;">
                Brief Product 2<br>Description 2 
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:66px 0 29px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:415px;">
          <tr>
            <td align="center" height="67" style="width:415px;height:67px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:415px;height:67px;line-height:67px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:0.25em;text-indent:0.25em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Shop Sale
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-cee34b0a"></a>

### 4.7 · produtos 7 - dois produtos — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 2 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, bordered_container, standalone_component, gray_panel, two_product_blocks, gallery_layout, main_plus_thumbs, three_thumbs, per_block_cta, secondary_collection_cta, cta_hierarchy, repeatable_blocks, no_price, full_width_button, no_mso_fallback, mobile_responsive, no_logo, no_hero, no_footer, not_mobile_stacked |
| **Tamanho do HTML** | 9.6 KB |
| **ID** | `cee34b0a-030c-43df-93b6-c54de6f00569` |

#### Descrição curta

Bloco de apresentação profunda de produto. Dois produtos, cada um em um painel com foto grande, três miniaturas de outros ângulos, uma frase técnica e botão próprio, fechando com um CTA de coleção. Momento de uso: lançamento ou destaque de coleção, quando o leitor precisa ver o produto de vários ângulos antes de clicar.  

#### Descrição detalhada

Dois painéis cinza empilhados, cada um seguido do seu CTA, e um terceiro botão apontando para a coleção.  

Quatro mecanismos definem a variante:  

Galeria de ângulos, não de produtos. As três miniaturas são o mesmo item visto de outra forma — frente, costas, detalhe em uso. Colocar produtos diferentes ali transforma o painel em grade e destrói o argumento de profundidade.  

Espelhamento completo entre os dois blocos. No bloco 1 a foto grande fica à esquerda e a copy alinha à direita; no bloco 2 tudo inverte, inclusive o text-align da copy. O alinhamento do texto acompanha o lado — é o detalhe que faz o espelho parecer intencional.  

O CTA fica fora do painel. Cada botão tem 556px e encosta na base do painel cinza, sem entrar nele. É o que separa "conteúdo do produto" de "ação".  

Três botões, com o último em peso menor. Dois CTAs sólidos de produto e um terceiro, mais claro, para a coleção. A hierarquia é de contraste, não de tamanho — os três têm a mesma largura.  

#### Contexto para a IA

##### Quando usar

Lançamento ou destaque de coleção com dois produtos que merecem apresentação individual.  
Moda, uniformes, activewear, calçado, casa, acessório — categorias em que caimento e detalhe de acabamento importam.  
Quando existe acervo de fotos por ângulo do mesmo item: frente, costas, detalhe.  
Quando cada produto tem página própria e existe uma coleção que os agrupa.  
Quando a marca vende variação de cor: os dois blocos podem mostrar a mesma peça em cores diferentes.  

##### Quando NÃO usar

Sem acervo de ângulos — três miniaturas com a mesma foto recortada denunciam a montagem.  
Produtos que não compartilham coleção — o CTA final fica sem destino coerente.  
Mais de dois produtos — o padrão é profundidade, não amplitude; para amplitude, use uma grade.  
Produto sem variação visual — se frente e costas são iguais, as miniaturas não acrescentam.  
Carrinho, checkout, transacional, prova social.  
Ticket baixo e compra por impulso: o volume de imagem é desproporcional à decisão.  

##### Orientações de copy para a IA

Título — linha de família ou atributo do produto, curta. É o mesmo nos dois blocos quando eles são variações da mesma peça.  

Subtítulo — nome do modelo ou tipo, em corpo menor. Título e subtítulo formam o nome completo lido em duas linhas.  

Copy — uma frase técnica sobre material, construção ou caimento, e o que isso entrega em uso. Quatro a cinco linhas. As duas copies precisam falar de aspectos diferentes — uma do material, outra do corte; repetir o argumento desperdiça o segundo bloco.  

CTA de produto — verbo genérico, igual nos dois.  

CTA final — nomeia a coleção ou a ocasião, mais longo que os anteriores. É o que justifica ele existir depois de dois botões.  

Proibições: preço em qualquer slot · copies com o mesmo argumento · título e subtítulo diferentes entre blocos quando o produto é o mesmo · rótulos de CTA de produto diferentes entre si · desconto · terceiro bloco.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente.  

Estrutura  

| # | Elemento | Padding do bloco | Dimensão |  
|---|---|---|---|  
| 1 | Painel 1 — foto grande à esquerda | 26px topo · 21px direita · 19px esquerda | 558px |  
| 2 | CTA 1 | 27px topo · 21px laterais | 556 × 58px |  
| 3 | Painel 2 — foto grande à direita | 41px topo · 21px direita · 19px esquerda | 558px |  
| 4 | CTA 2 | 21px topo · 21px laterais | 556 × 58px |  
| 5 | CTA final | 47px topo · 49px base | 556 × 58px |  

Interior do painel — padding de 39px no topo (40px no painel 2), 27px à esquerda e 15px à direita; tabela interna de 516px em duas colunas.  

| Coluna | Largura | Conteúdo |  
|---|---|---|  
| Grande | 314px | Título 25/29px · subtítulo 5px abaixo, 18/21px · foto 314 × 733px, 37px abaixo |  
| Galeria | 202px | Três fotos de 160 × 182px com gaps de 7px e 9px · copy 47px abaixo, 18/27px |  

Padding da coluna de galeria: 41px à esquerda no painel 1; 42px à direita no painel 2. A copy alinha à direita no painel 1 e à esquerda no painel 2.  

Paleta — três cores.  

| Papel | Hex (referência) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #DBDBDB | Fundo dos painéis |  |  
| Cor secundária |  |  |  
| #6B906E | Fundo dos CTAs de produto, com label branco |  |  
| Neutro de texto |  |  |  
| #373737 | Título e subtítulo — cinza, nunca preto |  |  

A copy usa preto puro; título e subtítulo usam o cinza. A diferença de valor é o que separa identificação de argumento. O CTA final é branco com label escuro — contraste invertido em relação aos outros dois.  

Pele alternativa (HTML base): CTAs de produto pretos e CTA final   
#BEBEBE com label branco. Usar quando a marca não tem cor própria.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 25px regular com tracking +0.05em; subtítulo 18px regular com o mesmo tracking; copy 18/27px regular sem tracking; CTAs 25px bold com tracking +0.15em e text-indent compensando. Secundária não existe.  

Implementação. Todas as fotos são <img> com display:block e background:#EFEFEF como fallback; nenhuma é background-image. font-size:0;line-height:0 em todas as células e <div> que contêm só imagem — com oito imagens no bloco, um gap de Outlook em cada uma desalinharia a galeria inteira. Os gaps de 7px e 9px entre as miniaturas são desiguais de propósito e vêm do arquivo original; padronizá-los muda a altura total da coluna. Hacks u + .body .txt-gry e u + .body .txt-blk.  

Tags: PANEL_N_TITLE, PANEL_N_SUBTITLE, PANEL_N_COPY, PANEL_N_MAIN_IMAGE_URL, PANEL_N_THUMB_A_URL, PANEL_N_THUMB_B_URL, PANEL_N_THUMB_C_URL, PRODUCT_CTA_LABEL, PANEL_N_CTA_URL, FINAL_CTA_LABEL, FINAL_CTA_URL.  

Erros que quebram o padrão: miniaturas com produtos diferentes · copy com o mesmo alinhamento nos dois painéis · CTA dentro do painel · CTA final com o mesmo peso dos de produto · título em preto puro · gaps das miniaturas padronizados · imagem sem font-size:0 na célula · terceiro painel.  

##### Direção fotográfica

Dois tamanhos de slot, com proporções diferentes.  

| Slot | Proporção | Slot em px | Ativo final |  
|---|---|---|---|  
| Foto grande | 9:16 | 314 × 733 | 628 × 1466 (2x) |  
| Miniatura | 4:5 | 160 × 182 | 320 × 364 (2x) |  

PNG ou JPG q80. Foto grande < 220 KB; miniaturas < 90 KB cada.  

A foto grande é mais estreita que 9:16: gere em 9:16 na altura de 1466px (825 × 1466) e corte 197px de largura, 98px de cada lado. A miniatura: gere em 4:5 na altura de 364px (291 × 364) e amplie para 320px.  

Regra crítica: o fundo de todos os oito ativos é o mesmo cinza do painel, chapado. Nenhum deles tem moldura, então qualquer diferença de tom desenha retângulos dentro do painel.  

Composição da foto grande. Modelo em meio corpo, de frente, cortado pelo topo e pela base do quadro. Enquadramento estreito e alto — o produto ocupa a largura toda. Olhar para a câmera, pose parada.  

Composição das miniaturas. Três ângulos do mesmo item e da mesma cor: detalhe lateral ou de acabamento, costas em corpo inteiro, e o produto em uso mostrando a parte que a foto grande não mostra (calça, calçado, movimento). A ordem importa — do mais fechado ao mais aberto, de cima para baixo.  

Luz e cenário. Estúdio, fundo liso, sem cenário. Luz difusa frontal, sombras suaves. Os oito ativos precisam da mesma temperatura de cor e do mesmo tratamento — eles aparecem lado a lado.  

Entre os dois painéis. Modelo diferente e cor diferente do produto, mantendo o mesmo enquadramento e a mesma luz. É o que faz os dois blocos lerem como variações e não como peças distintas.  

Proibições: fundo branco ou colorido · cenário reconhecível · miniaturas de produtos diferentes · miniatura repetindo o ângulo da foto grande · sombra dura · texto/preço/selo queimado · modelos com poses muito diferentes entre os painéis · marca d'água.  

Adaptação por categoria — o que são os três ângulos:  

| Categoria | Miniaturas |  
|---|---|  
| Uniforme / activewear | Detalhe lateral, costas, calça e calçado |  
| Moda | Detalhe de tecido, costas, look completo |  
| Calçado | Solado, perfil, pé calçado em movimento |  
| Casa | Detalhe de material, item completo, item em uso |  
| Acessório | Fecho ou aviamento, verso, uso no corpo |  
| Bolsa | Interior, verso, uso a tiracolo |  

#### Schema de output (16 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `panel_1_title` | `{{PANEL_1_TITLE}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `panel_1_subtitle` | `{{PANEL_1_SUBTITLE}}` | Texto curto | Copy (n8n) | não | 36 | sim |
| `panel_1_copy` | `{{PANEL_1_COPY}}` | Texto curto | Copy (n8n) | não | 130 | sim |
| `panel_2_title` | `{{PANEL_2_TITLE}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `panel_2_subtitle` | `{{PANEL_2_SUBTITLE}}` | Texto curto | Copy (n8n) | não | 36 | sim |
| `panel_2_copy` | `{{PANEL_2_COPY}}` | Texto curto | Copy (n8n) | não | 130 | sim |
| `product_cta_label` | `{{PRODUCT_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 28 | não |
| `final_cta_label` | `{{FINAL_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 34 | sim |
| `panel_1_main_photo` | `{{PANEL_1_MAIN_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `panel_1_thumb_a` | `{{PANEL_1_THUMB_A}}` | Imagem | Imagem gerada | não | — | — |
| `panel_1_thumb_b` | `{{PANEL_1_THUMB_B}}` | Imagem | Imagem gerada | não | — | — |
| `panel_1_thumb_c` | `{{PANEL_1_THUMB_C}}` | Imagem | Imagem gerada | não | — | — |
| `panel_2_main_photo` | `{{PANEL_2_MAIN_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `panel_2_thumb_a` | `{{PANEL_2_THUMB_A}}` | Imagem | Imagem gerada | não | — | — |
| `panel_2_thumb_b` | `{{PANEL_2_THUMB_B}}` | Imagem | Imagem gerada | não | — | — |
| `panel_2_thumb_c` | `{{PANEL_2_THUMB_C}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`panel_1_title`**
    - *Exemplo:* 1 Product Description
    - *Orientação:* Família ou atributo, uma linha
- **`panel_1_subtitle`**
    - *Exemplo:* 1 Product Description
    - *Orientação:* Nome do modelo, corpo menor
- **`panel_1_copy`**
    - *Exemplo:* 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing
    - *Orientação:* Argumento de material, alinhado à direita<br>130 (5 linhas)
- **`panel_2_title`**
    - *Exemplo:* 2 Product Description
    - *Orientação:* Família ou atributo, uma linha
- **`panel_2_subtitle`**
    - *Exemplo:* 2 Product Description
    - *Orientação:* Nome do modelo, corpo menor
- **`panel_2_copy`**
    - *Exemplo:* 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing
    - *Orientação:* 130 (5 linhas)<br>Argumento de corte, alinhado à esquerda
- **`product_cta_label`**
    - *Exemplo:* 2 shop now
    - *Orientação:* Caixa alta, igual nos dois painéis
- **`final_cta_label`**
    - *Exemplo:* SHOP COLLECTION
    - *Orientação:* Caixa alta, nomeia a coleção<br>Ex - SHOP THE NURSE WEEK COLLECTION
- **`panel_1_main_photo`**
    - *Orientação:* Onde fica: coluna esquerda do painel 1, abaixo do título e subtítulo.
    - *Imagem:* proporção 9:16 · 314 × 733 px
    - *Spec da imagem:* Proporção: 9:16. Slot de 314 × 733px. Ativo final 628 × 1466px (2x), < 220 KB. Fundo cinza do painel.<br>Ideia: modelo em meio corpo, de frente, cortado pelo topo e pela base, enquadramento estreito e alto, olhar para a câmera. Produto na primeira cor da campanha.
- **`panel_1_thumb_a`**
    - *Orientação:* Onde fica: primeira miniatura da coluna de galeria do painel 1.
    - *Imagem:* proporção 4:5 · 160 × 182 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 160 × 182px. Ativo final 320 × 364px (2x), < 90 KB.<br>Ideia: detalhe lateral ou de acabamento do mesmo item e cor — o ângulo mais fechado dos três.
- **`panel_1_thumb_b`**
    - *Orientação:* Onde fica: segunda miniatura do painel 1.
    - *Imagem:* proporção 4:5 · 160 × 182 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 160 × 182px. Ativo final 320 × 364px (2x), < 90 KB.<br>Ideia: costas em corpo inteiro ou meio corpo, mostrando o que a foto grande esconde.
- **`panel_1_thumb_c`**
    - *Orientação:* Onde fica: terceira miniatura do painel 1.
    - *Imagem:* proporção 4:5 · 160 × 182 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 160 × 182px. Ativo final 320 × 364px (2x), < 90 KB.<br>Ideia: a peça que a foto grande não mostra — calça, calçado, parte inferior — em corpo inteiro. O ângulo mais aberto dos três.
- **`panel_2_main_photo`**
    - *Orientação:* Onde fica: coluna direita do painel 2, abaixo do título e subtítulo.
    - *Imagem:* proporção 9:16 · 314 × 733 px
    - *Spec da imagem:* Proporção: 9:16. Slot de 314 × 733px. Ativo final 628 × 1466px (2x), < 220 KB. Fundo cinza do painel.<br>Ideia: modelo em meio corpo, de frente, cortado pelo topo e pela base, enquadramento estreito e alto, olhar para a câmera. Produto na primeira cor da campanha.
- **`panel_2_thumb_a`**
    - *Orientação:* Onde fica: primeira miniatura da coluna de galeria do painel 2.
    - *Imagem:* proporção 4:5 · 160 × 182 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 160 × 182px. Ativo final 320 × 364px (2x), < 90 KB.<br>Ideia: detalhe lateral ou de acabamento do mesmo item e cor — o ângulo mais fechado dos três.
- **`panel_2_thumb_b`**
    - *Orientação:* Onde fica: segunda miniatura do painel 2.
    - *Imagem:* proporção 4:5 · 160 × 182 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 160 × 182px. Ativo final 320 × 364px (2x), < 90 KB.<br>Ideia: costas em corpo inteiro ou meio corpo, mostrando o que a foto grande esconde.
- **`panel_2_thumb_c`**
    - *Orientação:* Onde fica: terceira miniatura do painel 2.
    - *Imagem:* proporção 4:5 · 160 × 182 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 160 × 182px. Ativo final 320 × 364px (2x), < 90 KB.<br>Ideia: peça inferior e calçado em corpo inteiro, fechando a sequência do mais fechado ao mais aberto.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Dois blocos espelhados de produto</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-gry { color:#373737 !important; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">


    <!-- ================================================================ -->
    <!-- BLOCO 1 — foto grande à esquerda                                 -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:26px 21px 0 19px;">
        <table role="presentation" width="558" cellpadding="0" cellspacing="0" border="0" style="width:558px;background:#D9D9D9;">
          <tr>
            <td style="padding:39px 15px 0 27px;">
              <table role="presentation" width="516" cellpadding="0" cellspacing="0" border="0" style="width:516px;">
                <tr>

                  <!-- coluna esquerda: títulos + foto grande -->
                  <td width="314" valign="top" style="width:314px;">
                    <div class="txt-gry" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:29px;font-weight:400;letter-spacing:0.05em;color:#373737;">
                      1 Product Description
                    </div>
                    <div class="txt-gry" style="padding-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;font-weight:400;letter-spacing:0.05em;color:#373737;">
                      1 Product Description
                    </div>
                    <div style="padding-top:37px;font-size:0;line-height:0;">
                      <img src="URL_FOTO_GRANDE_1" width="314" height="733" alt="ALT_FOTO_GRANDE_1"
                           style="display:block;width:314px;height:733px;background:#EFEFEF;">
                    </div>
                  </td>

                  <!-- coluna direita: 3 fotos pequenas + copy -->
                  <td width="202" valign="top" style="width:202px;padding:0 1px 0 41px;">
                    <div style="font-size:0;line-height:0;">
                      <img src="URL_FOTO_PEQUENA_1A" width="160" height="182" alt="ALT_FOTO_1A"
                           style="display:block;width:160px;height:182px;background:#EFEFEF;">
                    </div>
                    <div style="padding-top:7px;font-size:0;line-height:0;">
                      <img src="URL_FOTO_PEQUENA_1B" width="160" height="182" alt="ALT_FOTO_1B"
                           style="display:block;width:160px;height:182px;background:#EFEFEF;">
                    </div>
                    <div style="padding-top:9px;font-size:0;line-height:0;">
                      <img src="URL_FOTO_PEQUENA_1C" width="160" height="182" alt="ALT_FOTO_1C"
                           style="display:block;width:160px;height:182px;background:#EFEFEF;">
                    </div>
                    <div class="txt-blk" style="padding-top:47px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:27px;font-weight:400;color:#000000;text-align:right;">
                      1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing
                    </div>
                  </td>

                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA BLOCO 1 -->
    <tr>
      <td align="center" style="padding:27px 21px 0 21px;">
        <table role="presentation" width="556" cellpadding="0" cellspacing="0" border="0" style="width:556px;">
          <tr>
            <td align="center" height="58" style="width:556px;height:58px;background:#000000;">
              <a href="URL_CTA_1"
                 style="display:block;width:556px;height:58px;line-height:58px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.15em;text-indent:0.15em;color:#FFFFFF;text-decoration:none;text-align:center;">
                1 SHOP NOW
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 2 — foto grande à direita (espelhado)                      -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:41px 21px 0 19px;">
        <table role="presentation" width="558" cellpadding="0" cellspacing="0" border="0" style="width:558px;background:#D9D9D9;">
          <tr>
            <td style="padding:40px 15px 0 27px;">
              <table role="presentation" width="516" cellpadding="0" cellspacing="0" border="0" style="width:516px;">
                <tr>

                  <!-- coluna esquerda: 3 fotos pequenas + copy -->
                  <td width="202" valign="top" style="width:202px;padding:0 42px 0 0;">
                    <div style="font-size:0;line-height:0;">
                      <img src="URL_FOTO_PEQUENA_2A" width="160" height="182" alt="ALT_FOTO_2A"
                           style="display:block;width:160px;height:182px;background:#EFEFEF;">
                    </div>
                    <div style="padding-top:7px;font-size:0;line-height:0;">
                      <img src="URL_FOTO_PEQUENA_2B" width="160" height="182" alt="ALT_FOTO_2B"
                           style="display:block;width:160px;height:182px;background:#EFEFEF;">
                    </div>
                    <div style="padding-top:9px;font-size:0;line-height:0;">
                      <img src="URL_FOTO_PEQUENA_2C" width="160" height="182" alt="ALT_FOTO_2C"
                           style="display:block;width:160px;height:182px;background:#EFEFEF;">
                    </div>
                    <div class="txt-blk" style="padding-top:47px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:27px;font-weight:400;color:#000000;text-align:left;">
                      2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Lorem ipsum dolor sit amet, consectetur adipiscing
                    </div>
                  </td>

                  <!-- coluna direita: títulos + foto grande -->
                  <td width="314" valign="top" style="width:314px;">
                    <div class="txt-gry" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:29px;font-weight:400;letter-spacing:0.05em;color:#373737;">
                     2 Product Description
                    </div>
                    <div class="txt-gry" style="padding-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;font-weight:400;letter-spacing:0.05em;color:#373737;">
                     2 Product Description
                    </div>
                    <div style="padding-top:37px;font-size:0;line-height:0;">
                      <img src="URL_FOTO_GRANDE_2" width="314" height="733" alt="ALT_FOTO_GRANDE_2"
                           style="display:block;width:314px;height:733px;background:#EFEFEF;">
                    </div>
                  </td>

                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA BLOCO 2 -->
    <tr>
      <td align="center" style="padding:21px 21px 0 21px;">
        <table role="presentation" width="556" cellpadding="0" cellspacing="0" border="0" style="width:556px;">
          <tr>
            <td align="center" height="58" style="width:556px;height:58px;background:#000000;">
              <a href="URL_CTA_2"
                 style="display:block;width:556px;height:58px;line-height:58px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.15em;text-indent:0.15em;color:#FFFFFF;text-decoration:none;text-align:center;">
                2 SHOP NOW
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA FINAL -->
    <tr>
      <td align="center" style="padding:47px 21px 49px 21px;">
        <table role="presentation" width="556" cellpadding="0" cellspacing="0" border="0" style="width:556px;">
          <tr>
            <td align="center" height="58" style="width:556px;height:58px;background:#BEBEBE;">
              <a href="URL_CTA_COLECAO"
                 style="display:block;width:556px;height:58px;line-height:58px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.15em;text-indent:0.15em;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP COLLECTION
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-9c00bf11"></a>

### 4.8 · produtos 8 - 9 produtos — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | alta |
| **Slots de produto** | 9 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, bordered_container, standalone_component, product_grid, grid_3x3, nine_products, underlined_subtitle, per_product_button, shop_button, full_width_button, repeatable_blocks, no_price, no_mso_fallback, mobile_responsive, no_logo, no_hero, no_footer, not_mobile_stacked |
| **Tamanho do HTML** | 14.3 KB |
| **ID** | `9c00bf11-22e4-4675-98aa-499aee857d7d` |

#### Descrição curta

Bloco de catálogo amplo. Nove produtos em grade regular, cada um com foto, nome e botão próprio, sem preço e sem descrição. Momento de uso: e-mail de catálogo, mais vendidos ou coleção completa, quando o leitor já conhece a marca e precisa escolher entre muitas variações — tipicamente de aroma, sabor ou cor.  

#### Descrição detalhada

Título, duas linhas de copy e três fileiras de três produtos.  

Quatro mecanismos definem a variante:  

Amplitude máxima, profundidade mínima. Nove produtos e nenhum tem descrição, preço ou selo. Só foto, nome e botão. É o oposto das variantes de painel: aqui o bloco não convence, apenas apresenta o cardápio.  

Nove botões, nenhum de coleção. Cada produto leva ao seu destino e não existe CTA final. Quem chega ao fim da grade sem clicar já viu tudo que havia.  

Ênfase por sublinhado. A copy usa text-decoration:underline em uma palavra por linha. É o único recurso de ênfase da peça — não há bold, não há cor, não há tamanho diferente.  

A grade só funciona com nomes do mesmo tamanho. Nome de uma linha numa coluna e de duas em outra desalinha os botões da fileira. A célula do nome precisa de altura fixa de 50px, equivalente a duas linhas.  

#### Contexto para a IA

##### Quando usar

Catálogo, mais vendidos, coleção completa para base que já conhece a marca.  
Beleza, suplementos, alimentos, bebidas, papelaria, pet — categorias com muitas variações do mesmo produto.  
Quando a diferença entre os itens é visual e imediata: aroma, sabor, cor, fragrância.  
Quando cada produto tem página própria.  
Quando existe hero ou contexto acima: o bloco não se apresenta sozinho.  

##### Quando NÃO usar

Menos de 6 produtos (grid 3-col com 3–4 itens fica ralo — usar lista simples ou zigzag). Produtos que precisam de explicação ou preço para converter. Como seção única de e-mail promocional — sem oferta nem urgência, é seção de apoio/fechamento.  

##### Orientações de copy para a IA

Título — anuncia o recorte da lista, caixa alta, terminando em dois-pontos.  

Copy — duas linhas paralelas na mesma estrutura, cada uma com a primeira palavra sublinhada. O paralelismo é o que sustenta o recurso: "Trusted By Thousands. / Verified By Science." Ponto final nas duas.  

Nome do produto — o que diferencia aquela variação, não o nome da linha. Se todos são shampoo, o nome é o aroma, não "shampoo". Caixa alta. Todos os nomes de uma mesma fileira devem ocupar o mesmo número de linhas.  

CTA — verbo genérico curto, igual nos nove.  

Proibições: preço ou percentual · descrição por produto · nome de linha repetido nos nove · sublinhado fora das duas linhas de copy · CTA de coleção acrescentado · nomes com alturas diferentes na mesma fileira.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 47px | 40/45px bold, caixa alta, padding lateral 40px |  
| 2 | Copy | 25px | 25/29px, 2 linhas |  
| 3 | Fileira 1 | 98px | 524px, padding 38px esquerda · 36px direita |  
| 4 | Fileira 2 | 54px | 524px |  
| 5 | Fileira 3 | 54px | 524px, com 47px de respiro na base |  

Célula de produto: 164px de largura, gap de 16px entre colunas. Foto 164 × 186px · nome 20px abaixo, 20/25px bold, altura fixa de 50px · CTA 9px abaixo, 164 × 43px.  

O respiro antes da primeira fileira (98px) é quase o dobro dos 54px entre fileiras: separa o cabeçalho da grade.  

Paleta — duas cores.  

| Papel | Hex (Routine) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #00227C | Título, copy e nome dos produtos |  |  
| Cor secundária |  |  |  
| #EE4037 | Fundo dos nove botões, com label branco |  |  

O fundo é branco. A cor secundária aparece só nos botões — nove blocos idênticos de cor formando um ritmo vertical que é, na prática, o segundo elemento gráfico da peça.  

Pele alternativa (HTML base): título, copy e nomes em preto; botões pretos. Usar quando a marca não tem par de cores próprio.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 40px bold caixa alta; copy 25px regular com text-decoration:underline na palavra enfatizada; nome 20px bold caixa alta; CTA 20px bold. Secundária não existe.  

Implementação. font-size:0;line-height:0 na célula de cada foto e em todos os espaçadores de 16px — com nove imagens, um gap de Outlook em qualquer uma desalinha a fileira. A célula do nome precisa de height:50px explícito: sem isso, um nome de uma linha sobe o botão daquela coluna em 25px em relação aos vizinhos. Botões bulletproof. Hack u + .body .txt-blk.  

Tags: SECTION_TITLE, SECTION_COPY, PRODUCT_N_IMAGE_URL, PRODUCT_N_IMAGE_ALT, PRODUCT_N_NAME, PRODUCT_N_CTA_URL, PRODUCT_CTA_LABEL.  

Erros que quebram o padrão: célula do nome sem altura fixa · nomes de alturas diferentes na mesma fileira · preço ou descrição acrescentados · CTA de coleção no fim · sublinhado no nome ou no título · gap diferente de 16px entre colunas · fileira incompleta · fundo colorido nas fotos.  

##### Direção fotográfica

Proporção 4:5 — slot de 164 × 186px, ativo final 328 × 372px (2x). PNG, < 90 KB cada. Gerar em 4:5 na altura de 372px (298 × 372) e ampliar para 328px de largura.  

Regra crítica: os nove ativos precisam de enquadramento e escala idênticos. O produto ocupa a mesma altura relativa em todos, alinhado no mesmo eixo. É a única forma de a grade parecer grade — variação de escala entre células destrói o alinhamento óptico mesmo com as caixas certas.  

Composição. Packshot recortado sobre fundo branco puro, centralizado, com folga em volta. Quando o item é um conjunto (frasco duplo, kit), os dois elementos aparecem lado a lado com leve sobreposição, sempre na mesma disposição em todas as células.  

O que diferencia as células. A cor da embalagem, o rótulo e — quando houver — os elementos decorativos ao redor: flores, frutas, ingredientes da variação. Esses adereços são o que faz a grade ser legível em 164px de largura, já que o texto do rótulo não é legível nesse tamanho.  

Luz. Frontal difusa, sombra suave e curta. Idêntica nos nove.  

Proibições: fundo colorido ou cinza · escalas diferentes entre células · sombra dura ou projetada longa · cenário · modelo ou mão · texto/preço/selo queimado além do rótulo real · variações que só se distinguem pelo texto do rótulo · marca d'água.  

Adaptação por categoria — o que diferencia as variações:  

| Categoria | Diferenciador visual |  
|---|---|  
| Beleza / cabelo | Cor do rótulo + ingrediente botânico ao redor |  
| Suplementos | Cor da tampa e do rótulo |  
| Alimentos | Cor da embalagem + ingrediente cru ao lado |  
| Bebidas | Cor da lata + fruta correspondente |  
| Papelaria | Cor da capa |  
| Pet | Cor do sachê + petisco visível |  

#### Schema de output (29 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `section_copy` | `{{SECTION_COPY}}` | Texto curto | Copy (n8n) | não | 60 | não |
| `product_1_name` | `{{PRODUCT_1_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_2_name` | `{{PRODUCT_2_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_3_name` | `{{PRODUCT_3_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_4_name` | `{{PRODUCT_4_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_5_name` | `{{PRODUCT_5_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_6_name` | `{{PRODUCT_6_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_7_name` | `{{PRODUCT_7_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_8_name` | `{{PRODUCT_8_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_9_name` | `{{PRODUCT_9_NAME}}` | Texto curto | Copy (n8n) | não | 32 | sim |
| `product_cta_label_1` | `{{PRODUCT_CTA_LABEL_1}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_2` | `{{PRODUCT_CTA_LABEL_2}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_3` | `{{PRODUCT_CTA_LABEL_3}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_4` | `{{PRODUCT_CTA_LABEL_4}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_5` | `{{PRODUCT_CTA_LABEL_5}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_6` | `{{PRODUCT_CTA_LABEL_6}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_7` | `{{PRODUCT_CTA_LABEL_7}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_8` | `{{PRODUCT_CTA_LABEL_8}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_cta_label_9` | `{{PRODUCT_CTA_LABEL_9}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `product_1_photo` | `{{PRODUCT_1_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_9_photo` | `{{PRODUCT_9_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_8_photo` | `{{PRODUCT_8_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_7_photo` | `{{PRODUCT_7_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_6_photo` | `{{PRODUCT_6_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_5_photo` | `{{PRODUCT_5_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_4_photo` | `{{PRODUCT_4_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_3_photo` | `{{PRODUCT_3_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_2_photo` | `{{PRODUCT_2_PHOTO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* Section Title
    - *Orientação:* Caixa alta, bold, termina em dois-pontos
- **`section_copy`**
    - *Exemplo:* Section Copy Line 1 Underline Section Copy Line 1 Section Copy Line 2 Underline Section Copy Line 2
    - *Orientação:* Duas frases paralelas, primeira palavra sublinhada em cada<br>60 (2 linhas)
- **`product_1_name`**
    - *Exemplo:* Product Name 1
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_2_name`**
    - *Exemplo:* Product Name 2
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_3_name`**
    - *Exemplo:* Product Name 3
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_4_name`**
    - *Exemplo:* Product Name 4
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_5_name`**
    - *Exemplo:* Product Name 5
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_6_name`**
    - *Exemplo:* Product Name 6
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_7_name`**
    - *Exemplo:* Product Name 7
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_8_name`**
    - *Exemplo:* Product Name 8
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_9_name`**
    - *Exemplo:* Product Name 9
    - *Orientação:* 32 (2 linhas)<br>Caixa alta, o que diferencia a variação
- **`product_cta_label_1`**
    - *Exemplo:* CTA 1
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_2`**
    - *Exemplo:* CTA 2
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_3`**
    - *Exemplo:* CTA 3
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_4`**
    - *Exemplo:* CTA 4
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_5`**
    - *Exemplo:* CTA 5
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_6`**
    - *Exemplo:* CTA 6
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_7`**
    - *Exemplo:* CTA 7
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_8`**
    - *Exemplo:* CTA 8
    - *Orientação:* Caixa alta, igual nos nove
- **`product_cta_label_9`**
    - *Exemplo:* CTA 9
    - *Orientação:* Caixa alta, igual nos nove
- **`product_1_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_9_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_8_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_7_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_6_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_5_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_4_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_3_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.
- **`product_2_photo`**
    - *Orientação:* Onde ficam: topo de cada célula das fileiras 1 e 2, na ordem de leitura.
    - *Imagem:* proporção 4:5 · 164 × 186 px
    - *Spec da imagem:* Proporção: 4:5. Slot de 164 × 186px. Ativo final 328 × 372px (2x), PNG, < 90 KB. Fundo branco puro.<br>Ideia: o par de produtos da variação — frasco e complemento lado a lado com leve sobreposição, na mesma disposição em todas as seis células. A variação é identificada pela cor do rótulo e pelos elementos botânicos ou de ingrediente dispostos ao redor da base e do topo. Enquadramento e escala idênticos entre as seis.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — The Top Picks (grade 3x3)</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:47px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:40px;line-height:45px;font-weight:700;text-transform:uppercase;color:#000000;">
        Section Title
      </td>
    </tr>

    <!-- COPY -->
    <tr>
      <td align="center" class="txt-blk" style="padding:25px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:29px;font-weight:400;color:#000000;">
        <span style="text-decoration:underline;">Section Copy Line 1 Underline</span> Section Copy Line 1<br>
        <span style="text-decoration:underline;">Section Copy Line 2 Underline</span> Section Copy Line 2
      </td>
    </tr>


    <!-- ============ LINHA 1 ============ -->
    <tr>
      <td style="padding:98px 36px 0 38px;">
        <table role="presentation" width="524" cellpadding="0" cellspacing="0" border="0" style="width:524px;">
          <tr>

            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_1" width="164" height="186" alt="ALT_PRODUTO_1" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 1</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_1" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 1</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
            <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_2" width="164" height="186" alt="ALT_PRODUTO_2" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 2</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_2" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 2</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
            <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_3" width="164" height="186" alt="ALT_PRODUTO_3" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 3</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_3" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 3</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>

    <!-- ============ LINHA 2 ============ -->
    <tr>
      <td style="padding:54px 36px 0 38px;">
        <table role="presentation" width="524" cellpadding="0" cellspacing="0" border="0" style="width:524px;">
          <tr>

            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_4" width="164" height="186" alt="ALT_PRODUTO_4" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 4</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_4" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 4</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
            <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_5" width="164" height="186" alt="ALT_PRODUTO_5" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 5</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_5" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 5</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
            <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_6" width="164" height="186" alt="ALT_PRODUTO_6" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 6</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_6" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 6</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>

    <!-- ============ LINHA 3 ============ -->
    <tr>
      <td style="padding:54px 36px 47px 38px;">
        <table role="presentation" width="524" cellpadding="0" cellspacing="0" border="0" style="width:524px;">
          <tr>

            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_7" width="164" height="186" alt="ALT_PRODUTO_7" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 7</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_7" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 7</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
            <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_8" width="164" height="186" alt="ALT_PRODUTO_8" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 8</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_8" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 8</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
            <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="164" valign="top" style="width:164px;">
              <table role="presentation" width="164" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                <tr><td style="font-size:0;line-height:0;"><img src="URL_PRODUTO_9" width="164" height="186" alt="ALT_PRODUTO_9" style="display:block;width:164px;height:186px;background:#EFEFEF;"></td></tr>
                <tr><td align="center" class="txt-blk" style="padding:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:25px;font-weight:700;color:#000000;">Product Name 9</td></tr>
                <tr><td align="center" style="padding:9px 0 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:164px;">
                    <tr><td align="center" height="43" style="width:164px;height:43px;background:#000000;">
                      <a href="URL_CTA_9" style="display:block;width:164px;height:43px;line-height:43px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 9</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-2f115df3"></a>

### 4.9 · produtos 9 - 4 produtos — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Produtos / Grade (`products`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | média |
| **Slots de produto** | 4 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | gray_bg, gradient_fallback_solid, standalone_component, four_cards, zigzag_layout, alternating_image_side, card_border, rounded_card, size_grid, size_chart, sizes_hardcoded, apparel_sizes, per_card_cta, filled_card_button, outline_final_cta, cta_hierarchy, repeatable_blocks, no_price, no_mso_fallback, mobile_responsive, no_logo, no_hero, no_footer, not_mobile_stacked |
| **Tamanho do HTML** | 25.3 KB |
| **ID** | `2f115df3-1ddd-4ca4-bb45-e3337cef5546` |

#### Descrição curta

Bloco de urgência por estoque. Quatro produtos, cada um com foto, nome e uma grade de tamanhos que mostra quais ainda existem — os esgotados aparecem apagados. Momento de uso: e-mail de queima de estoque ou última chamada, quando o argumento não é desconto e sim disponibilidade.  

#### Descrição detalhada

Título e subtítulo, quatro blocos de produto alternando o lado da foto, e um CTA de contorno fechando.  

Quatro mecanismos definem a variante:  

A grade de tamanhos tem estado. Dez quadrados de 46 × 31px por produto; os disponíveis ficam brancos com borda clara, os esgotados ficam preenchidos em cinza com o texto apagado. É a única variante do arsenal que expõe estoque — e é isso que produz a urgência sem precisar de contagem regressiva.  

A foto ultrapassa o card em 25px em cima e embaixo. Foto de 348px contra card de 298px. O desencaixe é o que dá a leitura de camada, com a foto por cima e o card por baixo.  

Meia moldura no card. A foto tem raio nos quatro cantos; o card tem borda em três lados e raio só nos dois cantos externos. O lado que encosta na foto fica aberto — os dois se encaixam como peça única.  

Escassez sem desconto. Não há preço, percentual nem cupom. O que faz correr é ver dois tamanhos sobrando.  

#### Contexto para a IA

##### Quando usar

Queima de estoque, última chamada, fim de coleção — quando o argumento é disponibilidade.  
Moda, calçado, acessório — categorias com grade de tamanho real.  
Quando existe integração de estoque e a grade pode refletir a verdade. Grade estática mentindo é o pior uso possível desta variante.  
Quando a marca tem quatro peças com estoque irregular: a variação entre os produtos é o que torna a grade convincente.  
Base já engajada, que reconhece as peças.  

##### Quando NÃO usar

Sem dado de estoque real — a grade vira decoração e o e-mail promete o que não pode cumprir.  
Produto sem tamanho — beleza, alimentos, casa; a grade não tem o que mostrar.  
Todos os tamanhos disponíveis — sem esgotados, a grade não gera urgência e o bloco fica sem função.  
Quando o argumento é preço — não há slot para valor.  
Carrinho, checkout, transacional, prova social, welcome.  
Marca premium: expor ruptura de estoque é registro de outlet.  

##### Orientações de copy para a IA

Título — a condição de escassez em duas palavras, caixa alta.  

Subtítulo — uma linha de aviso com tom de marca. É o único slot com liberdade de voz na peça.  

Nome do produto — nome comercial completo em duas linhas. Nomes autorais funcionam melhor aqui do que descritivos, porque não há descrição para complementar.  

Rótulo da grade — palavra fixa seguida de dois-pontos, igual nos quatro.  

CTA de produto — verbo genérico, igual nos quatro.  

CTA final — chamada da sale, mais longa que os anteriores e em contraste invertido.  

Proibições: preço, percentual ou cupom · contagem regressiva · descrição por produto · rótulos de CTA diferentes entre produtos · afirmação de escassez que o estoque não sustenta · quinto bloco.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Raio de 16px na foto e nos cantos externos do card; CTAs com cantos vivos.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 20px | 35/35px bold, caixa alta |  
| 2 | Subtítulo | 17px | 23/25px regular |  
| 3 | Bloco 1 — foto à esquerda | 57px | 522px, padding lateral 38px |  
| 4 | Bloco 2 — foto à direita | 49px | 522px |  
| 5 | Bloco 3 — foto à esquerda | 52px | 522px |  
| 6 | Bloco 4 — foto à direita | 77px | 522px |  
| 7 | CTA final | 74px | 350 × 55px, borda 2px, com 62px de respiro na base |  

Anatomia do bloco: foto de 221 × 348px com borda de 2px e raio 16px na coluna de 225px; card de 297px com padding vertical de 25px, fundo branco, borda de 2px em três lados e raio 16px nos dois cantos externos.  

Interior do card, padding de 30px no topo e 23px à esquerda (25px nos blocos espelhados): nome 25/26px bold em 2 linhas · rótulo 11px abaixo, 15/17px · grade 11px abaixo · CTA 25px abaixo, 252 × 55px · respiro final de 31px.  

Grade de tamanhos: duas fileiras de cinco células de 46 × 31px, gap de 5px entre colunas e 8px entre fileiras, largura total 250px. Disponível: fundo branco, borda 1px   
#E2E2E2, texto preto. Esgotado: fundo   
#E3E3E3, texto cinza claro.  

Paleta — três cores.  

| Papel | Hex (referência) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #316D89 | Fundo da seção |  |  
| Cor secundária |  |  |  
| #FFFFFF | Fundo dos cards, título, subtítulo e CTA final |  |  
| Neutro de estado |  |  |  
| #E3E3E3 | Preenchimento dos tamanhos esgotados |  |  

Os CTAs de produto são pretos com label branco; o CTA final é branco com borda e label pretos. O contraste se inverte no último botão, como nas outras variantes de catálogo do arsenal.  

Pele alternativa (HTML base): fundo   
#BEBEBE, título e subtítulo pretos. Usar quando a marca não tem cor de fundo própria.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 35px bold caixa alta; subtítulo 23px regular; nome 25px bold; rótulo e tamanhos 15px regular; CTAs 23px bold caixa alta. Secundária não existe.  

Implementação. O text-shadow do título não renderiza em Outlook nem em vários clientes — é ganho opcional, não pode ser o que garante legibilidade; o contraste do texto contra o fundo precisa funcionar sem ele. border-radius parcial no card degrada para retângulo no Outlook; a foto, por ser <img>, precisa sair do Figma com o raio e a borda de 2px já no arquivo. font-size:0;line-height:0 na célula da foto e em todos os espaçadores da grade. A grade é tabela de células com borda, nunca imagem — é ela que precisa mudar por produto e por reposição.  

Tags: PREHEADER, SECTION_TITLE, SECTION_SUBTITLE, PRODUCT_N_IMAGE_URL, PRODUCT_N_IMAGE_ALT, PRODUCT_N_NAME, PRODUCT_N_SIZES, SIZES_LABEL, PRODUCT_CTA_LABEL, PRODUCT_N_CTA_URL, FINAL_CTA_LABEL, FINAL_CTA_URL.  

Erros que quebram o padrão: grade com todos os tamanhos disponíveis · grade como imagem · grade estática que não reflete o estoque · foto sem raio e borda no arquivo · card com borda nos quatro lados · foto alinhada ao card em vez de ultrapassar · preço acrescentado · quinto bloco · CTA final sólido.  

##### Direção fotográfica

Proporção 2:3 — slot de 221 × 348px, ativo final 442 × 696px (2x). PNG, < 150 KB cada. Gerar em 2:3 na altura de 696px (464 × 696) e cortar 22px de largura.  

Regra crítica: o ativo sai com a borda de 2px e o raio de 16px já aplicados, porque border-radius em <img> não renderiza no Outlook. O fundo interno é claro e neutro, próximo do branco do card.  

Composição. Modelo real vestindo a peça, corpo parcial, cortado pelo topo e pela base. O enquadramento muda conforme o produto: meio corpo quando a peça é superior, corpo inteiro quando é vestido ou casaco, recorte de quadril quando é peça inferior. A peça sempre preenche o eixo central do quadro.  

Casting. Corpos variados entre os quatro blocos — é o que dá sentido à grade de tamanhos que vai até 5XL. Repetir o mesmo tipo físico nos quatro contradiz o argumento da seção.  

Cenário e luz. Estúdio, fundo claro liso, sem cenário. Luz difusa frontal, sombras suaves. Pose parada, olhar para a câmera ou levemente fora.  

Proibições: fundo escuro ou colorido · cenário reconhecível · foto sem borda e raio no arquivo · peça fora do eixo central · corpos idênticos entre os quatro blocos · texto/preço/selo queimado · marca d'água.  

Adaptação por categoria — o que é o enquadramento:  

| Categoria | Enquadramento |  
|---|---|  
| Peça superior | Meio corpo, do quadril ao topo da cabeça |  
| Vestido / casaco | Corpo quase inteiro, cortado nos pés |  
| Peça inferior | Recorte do quadril às coxas |  
| Calçado | Pernas e pés, do joelho para baixo |  
| Acessório | Recorte do corpo com o item em destaque |  
| Lingerie | Meio corpo, enquadramento fechado |  

Prompt para IA:  

Studio photograph of a model wearing [PRODUTO], [ENQUADRAMENTO: half  
body / almost full body cropped at the feet / hip-to-thigh crop], the  
garment filling the central axis of a tall frame, cropped by the top and  
bottom edges. Flat light neutral studio background close to white. Soft  
frontal diffused light, gentle shadows, still pose, looking at camera or  
slightly off. Body type distinct from the other products in the set. No  
setting, no props, no text, no logos, no price badges, no watermark.  
Aspect ratio 2:3. High resolution.  

Montagem final: aplicar borda de 2px preta e raio de 16px nos quatro cantos, no arquivo, e exportar a 442 × 696px.  

Checklist: borda e raio aplicados no arquivo · fundo claro próximo do branco do card · peça no eixo central · enquadramento adequado ao tipo de peça · corpos diferentes entre os quatro blocos · sem cenário e sem texto queimado · 442px de largura e < 150 KB.  

#### Schema de output (14 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `section_subtitle` | `{{SECTION_SUBTITLE}}` | Texto curto | Copy (n8n) | não | 44 | sim |
| `product_1_name` | `{{PRODUCT_1_NAME}}` | Texto curto | Copy (n8n) | não | 38 | não |
| `product_2_name` | `{{PRODUCT_2_NAME}}` | Texto curto | Copy (n8n) | não | 38 | não |
| `product_3_name` | `{{PRODUCT_3_NAME}}` | Texto curto | Copy (n8n) | não | 38 | não |
| `product_4_name` | `{{PRODUCT_4_NAME}}` | Texto curto | Copy (n8n) | não | 38 | não |
| `product_cta_label_1` | `{{PRODUCT_CTA_LABEL_1}}` | Texto curto | Copy (n8n) | não | 18 | não |
| `product_cta_label_2` | `{{PRODUCT_CTA_LABEL_2}}` | Texto curto | Copy (n8n) | não | 18 | não |
| `product_cta_label_3` | `{{PRODUCT_CTA_LABEL_3}}` | Texto curto | Copy (n8n) | não | 18 | não |
| `product_cta_label_4` | `{{PRODUCT_CTA_LABEL_4}}` | Texto curto | Copy (n8n) | não | 18 | não |
| `product_1_photo` | `{{PRODUCT_1_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_2_photo` | `{{PRODUCT_2_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_3_photo` | `{{PRODUCT_3_PHOTO}}` | Imagem | Imagem gerada | não | — | — |
| `product_4_photo` | `{{PRODUCT_4_PHOTO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* Section Title
    - *Orientação:* Caixa alta, bold, a condição de escassez
- **`section_subtitle`**
    - *Exemplo:* Section Copy
    - *Orientação:* Uma linha, voz da marca
- **`product_1_name`**
    - *Exemplo:* Product Name 1
    - *Orientação:* 38 (2 linhas)<br>Nome comercial completo
- **`product_2_name`**
    - *Exemplo:* Product Name 2
    - *Orientação:* 38 (2 linhas)<br>Nome comercial completo
- **`product_3_name`**
    - *Exemplo:* Product Name 3
    - *Orientação:* 38 (2 linhas)<br>Nome comercial completo
- **`product_4_name`**
    - *Exemplo:* Product Name 4
    - *Orientação:* 38 (2 linhas)<br>Nome comercial completo
- **`product_cta_label_1`**
    - *Exemplo:* cta 1
    - *Orientação:* Caixa alta, igual nos quatro
- **`product_cta_label_2`**
    - *Exemplo:* cta 2
    - *Orientação:* Caixa alta, igual nos quatro
- **`product_cta_label_3`**
    - *Exemplo:* cta 3
    - *Orientação:* Caixa alta, igual nos quatro
- **`product_cta_label_4`**
    - *Exemplo:* cta 4
    - *Orientação:* Caixa alta, igual nos quatro
- **`product_1_photo`**
    - *Orientação:* Onde fica: coluna esquerda do bloco 1, ultrapassando o card em 25px acima e abaixo.
    - *Imagem:* proporção 2:3 · 221 × 348 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.<br>Ideia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.
- **`product_2_photo`**
    - *Orientação:* Onde fica: coluna esquerda do bloco 2, ultrapassando o card em 25px acima e abaixo.
    - *Imagem:* proporção 2:3 · 221 × 348 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.<br>Ideia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.
- **`product_3_photo`**
    - *Orientação:* Onde fica: coluna esquerda do bloco 3, ultrapassando o card em 25px acima e abaixo.
    - *Imagem:* proporção 2:3 · 221 × 348 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.<br>Ideia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.
- **`product_4_photo`**
    - *Orientação:* Onde fica: coluna esquerda do bloco 4, ultrapassando o card em 25px acima e abaixo.
    - *Imagem:* proporção 2:3 · 221 × 348 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.<br>Ideia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Limited Stock</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#BEBEBE;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:20px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:35px;line-height:35px;font-weight:700;color:#000000;text-shadow:0 0 3.5px #FFFFFF;">
        Section Title
      </td>
    </tr>

    <!-- SUBTÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:17px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:25px;font-weight:400;color:#000000;">
        Section Copy
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 1 — foto à esquerda                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:57px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_1" width="221" height="348" alt="ALT_PRODUTO_1"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-right:2px solid #222222;border-bottom:2px solid #222222;border-radius:0 16px 16px 0;">
                <tr>
                  <td style="padding:30px 0 0 23px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 1
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 1:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_1" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 1</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 2 — foto à direita                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:49px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-left:2px solid #222222;border-bottom:2px solid #222222;border-radius:16px 0 0 16px;">
                <tr>
                  <td style="padding:30px 0 0 25px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 2
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 2:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_2" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 2</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_2" width="221" height="348" alt="ALT_PRODUTO_2"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 3 — foto à esquerda                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:52px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_3" width="221" height="348" alt="ALT_PRODUTO_3"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-right:2px solid #222222;border-bottom:2px solid #222222;border-radius:0 16px 16px 0;">
                <tr>
                  <td style="padding:30px 0 0 23px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 3
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 3:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_3" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 3</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 4 — foto à direita                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:77px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-left:2px solid #222222;border-bottom:2px solid #222222;border-radius:16px 0 0 16px;">
                <tr>
                  <td style="padding:30px 0 0 25px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 4
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 4:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_4" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 4</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_4" width="221" height="348" alt="ALT_PRODUTO_4"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA FINAL -->
    <tr>
      <td align="center" style="padding:74px 0 62px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:350px;">
          <tr>
            <td align="center" height="55" style="width:350px;height:55px;background:#FFFFFF;border:2px solid #000000;">
              <a href="URL_DO_CTA_FINAL"
                 style="display:block;width:346px;height:51px;line-height:51px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">
                CTA FINAL
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```


---

## 5 · Reviews / Prova Social

`reviews` · 7 variantes (7 ativas · 152.0 KB de HTML)

<a id="v-d48deaa4"></a>

### 5.1 · review 1 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Carrinho abandonado, Lançamento |
| **Tons compatíveis** | Educacional, Amigável, Premium |
| **Tags** | gray_bg, bordered_container, standalone_component, reviews, social_proof, testimonial_cards, two_reviews, customer_photo, star_rating, five_stars, gold_stars, quote_mark, serif_quote, dark_review_cards, partial_rounded_corner, name_and_role, repeatable_blocks, no_cta, no_price, no_mso_fallback, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 7.5 KB |
| **ID** | `d48deaa4-6d8b-4a09-95fb-e512b676c8d8` |

#### Descrição curta

Bloco de meio de e-mail que resolve objeção de confiança com depoimento de autoridade. Cada card traz o rosto de quem fala, o depoimento, a nota em estrelas e — o que define a variante — o cargo ou credencial da pessoa. Momento de uso: consideração, quando o produto já foi apresentado e o que falta é alguém confiável dizendo que funciona.  

#### Descrição detalhada

Título e copy introdutória sobre fundo claro; abaixo, dois cards de depoimento empilhados. Cada card é bipartido: fotografia vertical à esquerda, painel escuro com o texto à direita.  

Quatro mecanismos definem a variante:  

Cantos arredondados só nas bordas externas. Raio de 22px na esquerda da foto e na direita do painel; a emenda entre os dois é reta. O card lê como uma peça só, não como dois elementos encostados.  

Contraste invertido em relação à seção. A seção é clara e os cards são escuros. É o que faz o depoimento saltar sem precisar de borda, sombra ou moldura.  

O slot de credencial é obrigatório. Nome e cargo em linhas separadas, com o cargo em corpo muito menor. Sem a credencial, o bloco vira prova social genérica e perde a função — o argumento é a autoridade de quem fala, não a satisfação do cliente.  

Slot repetível de dois cards. Estrutura idêntica; muda só o conteúdo. Um card sozinho não sustenta o padrão, três alongam demais a peça.  

#### Contexto para a IA

##### Quando usar

Consideração, depois de o produto já ter sido apresentado no mesmo e-mail ou na régua.  
Quando existe prova social de autoridade real — profissional, especialista, técnico certificado.  
Pet, suplementos, saúde, beleza clínica, eletrônico, casa — categorias com objeção de eficácia ou segurança.  
Welcome #3 ou #4, e-mail de USP, reengajamento com argumento.  
Quando há foto do depoente disponível: o rosto é metade do argumento.  

##### Quando NÃO usar

Sem credencial. Depoimento de cliente comum não sustenta a variante — o slot de cargo fica vazio e a estrutura perde o sentido.  
Sem foto do depoente. Placeholder ou avatar genérico derruba a credibilidade que o bloco existe para construir.  
Topo de e-mail — não tem logo, headline de campanha nem CTA.  
Carrinho, checkout, transacional.  
Categoria sem objeção de eficácia — em compra por impulso ou estética, o bloco alonga sem converter.  
Quando só existe um depoimento: um card sozinho parece erro de montagem.  

##### Orientações de copy para a IA

Título — quem recomenda, em uma linha ("Recommended by Vets", "Aprovado por dermatologistas"). É a promessa de autoridade e precisa ser verificável.  

Copy introdutória — dois parágrafos curtos: o primeiro contextualiza quem são os depoentes e o que observaram; o segundo projeta o resultado para o leitor. Frases curtas.  

Depoimento — fala em primeira pessoa, específica sobre o que o produto resolve. Mencionar ingrediente, mecanismo ou situação de uso. Sem superlativo vago.  

Nome — nome do depoente com o tratamento profissional quando houver ("Dr. Carin Beene").  

Função — credencial ou cargo, abreviado. É o slot que legitima; nunca deixar vazio nem preencher com "Cliente".  

Estrelas — sempre cinco. Nota menor dentro de um bloco de recomendação envia sinal contraditório.  

Proibições: depoimento inventado ou não atribuível · credencial genérica ("Cliente satisfeito") · desconto ou cupom em qualquer slot · CTA dentro do card · nota abaixo de cinco estrelas · superlativo sem objeto.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Raio de 22px nos cards — variante com cantos arredondados; não combinar no mesmo e-mail com blocos de cantos vivos.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 60px | 25/37px, caixa alta, padding lateral 69px |  
| 2 | Copy introdutória | 35px | 20/29px, padding lateral 69px |  
| 3 | Card de review 1 | 45px | 541px de largura, padding lateral 28/29px |  
| 4 | Card de review 2 | 31px | 541px, com 70px de respiro na base |  

Anatomia do card — duas colunas, 541px no total.  

| Coluna | Largura | Conteúdo |  
|---|---|---|  
| Foto | 241px | Imagem 241 × 349px, raio 22px só à esquerda |  
| Painel | 300px | Fundo escuro, raio 22px só à direita |  

Interior do painel, padding 30px no topo e 19/20px nas laterais:  

| Elemento | Padding-top | Dimensão |  
|---|---|---|  
| Aspas | 0 | Serif 52px bold, line-height 17px, recuo de 11px |  
| Depoimento | 31px | 20/27px |  
| Estrelas | 18px | 21px, tracking +9px |  
| Nome | 16px | 20/27px |  
| Função | 4px | 10/14px |  
| Respiro final | — | 36px |  

Paleta — quatro cores.  

| Papel | Hex (Wuffes) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #17443D | Fundo do painel do card |  |  
| Cor secundária |  |  |  
| #F7ECE1 | Fundo da seção |  |  
| Acento |  |  |  
| #C5FB54 | Aspas e estrelas |  |  
| Neutro invertido |  |  |  
| #FFFFFF | Depoimento, nome e função |  |  

O acento aparece apenas nas aspas e nas estrelas — dois elementos gráficos, nunca em texto corrido nem em fundo. O título usa a cor primária sobre a secundária.  

Pele alternativa (HTML base): seção   
#E1DEDE, painel   
#404040, aspas e estrelas em branco, sem cor de acento. Usar quando a marca não tem cor de acento saturada.  

Tipografia. Principal: Arial → Helvetica em título, copy, depoimento, estrelas, nome e função. Secundária: serif (Georgia → Times New Roman) em uso único — as aspas de abertura. Título 25px em caixa alta com tracking −0.011em; função em 10px, metade do corpo do nome. A hierarquia nome/função é de tamanho, não de peso.  

Implementação. border-radius parcial (22px 0 0 22px / 0 22px 22px 0) não renderiza em Outlook: a foto precisa sair do Figma com o canto esquerdo já arredondado e o painel degrada para retângulo — degradação aceita, não corrigir com imagem de fundo. background:#EFEFEF na <img> como fallback de carregamento. font-size:0;line-height:0 na célula da foto para matar o gap do Outlook. Estrelas em caractere Unicode &#9733; com tracking, não imagem. Hacks u + .body .txt-blk e u + .body .txt-wht travando as duas cores no Gmail iOS.  

Tags: SECTION_TITLE, SECTION_COPY, REVIEW_N_IMAGE_URL, REVIEW_N_IMAGE_ALT, REVIEW_N_QUOTE, REVIEW_N_NAME, REVIEW_N_ROLE.  

Erros que quebram o padrão: raio nos quatro cantos de cada metade · painel e foto com alturas diferentes · slot de função vazio · acento em texto corrido · CTA dentro do card · borda ou sombra no card · três ou mais cards · nota abaixo de cinco estrelas · foto horizontal.  

##### Direção fotográfica

Proporção 2:3 — slot de 241 × 349px, ativo final 482 × 698px (2x). JPG q80 ou WebP, < 120 KB por card. Gerar em 2:3 na altura de 698px (465 × 698) e ampliar para 482px de largura, ou gerar em 2:3 a 482 × 723 e cortar 25px de altura pela base.  

Regra crítica: retrato real do depoente, não modelo genérico nem banco de imagem. A variante inteira depende de o rosto ser atribuível ao nome e à credencial embaixo.  

Composição. Retrato vertical, meio corpo ou busto, figura centralizada e olhando para a câmera. Expressão aberta e confiante. O enquadramento é estreito — o rosto ocupa o terço superior e precisa sobreviver a 241px de largura.  

Cenário e luz. Contexto que reforce a credencial: jaleco, estetoscópio, ambiente de trabalho, campo. Luz natural, fundo desfocado. Não é estúdio: o cenário é parte da prova.  

Elemento de credencial. Ao menos um marcador visual da profissão no quadro. É o que casa a foto com o slot de função.  

Proibições: foto de banco de imagem genérica · retrato sem contexto profissional · foto horizontal ou quadrada · rosto fora do terço superior · texto ou selo queimado · avatar ilustrado · marca d'água.  

Adaptação por categoria — qual é a autoridade:  

| Categoria | Depoente e contexto |  
|---|---|  
| Pet | Veterinário, jaleco e ambiente clínico ou de campo |  
| Suplementos | Nutricionista ou médico, consultório |  
| Beleza clínica | Dermatologista ou esteticista, clínica |  
| Eletrônico | Técnico ou instalador, bancada de trabalho |  
| Casa | Arquiteto ou marceneiro, ambiente de obra |  
| Esporte | Preparador físico, academia ou quadra |  

#### Schema de output (10 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 30 | sim |
| `section_copy` | `{{SECTION_COPY}}` | Texto curto | Copy (n8n) | não | 156 | sim |
| `review_1_quote` | `{{REVIEW_1_QUOTE}}` | Texto curto | Copy (n8n) | não | 200 | sim |
| `review_1_name` | `{{REVIEW_1_NAME}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_1_role` | `{{REVIEW_1_ROLE}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `review_2_quote` | `{{REVIEW_2_QUOTE}}` | Texto curto | Copy (n8n) | não | 200 | sim |
| `review_2_name` | `{{REVIEW_2_NAME}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_2_role` | `{{REVIEW_2_ROLE}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `review_1_portrait` | `{{REVIEW_1_PORTRAIT}}` | Imagem | Imagem gerada | não | — | — |
| `review_2_portrait` | `{{REVIEW_2_PORTRAIT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* RECOMMENDATION
    - *Orientação:* Uma linha, quem recomenda<br>EX - 	Recommended by Vets
- **`section_copy`**
    - *Exemplo:* Veterinarians across the nation are raving about the results they've seen when recommending Wuffes products to their patients. Just imagine the results your pup could see to improve their quality of life.
    - *Orientação:* Dois parágrafos curtos
- **`review_1_quote`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    - *Orientação:* Primeira pessoa, específica
- **`review_1_name`**
    - *Exemplo:* Name.
    - *Orientação:* Nome com tratamento profissional
- **`review_1_role`**
    - *Exemplo:* Professional
    - *Orientação:* Credencial abreviada, nunca vazio
- **`review_2_quote`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    - *Orientação:* Primeira pessoa, específica
- **`review_2_name`**
    - *Exemplo:* Name.
    - *Orientação:* Nome com tratamento profissional
- **`review_2_role`**
    - *Exemplo:* Professional
    - *Orientação:* Credencial abreviada, nunca vazio
- **`review_1_portrait`**
    - *Orientação:* Onde fica: coluna esquerda do card 1, 241px de largura, canto esquerdo arredondado em 22px.
    - *Imagem:* proporção 2:3 · 241 × 349 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 241 × 349px. Ativo final 482 × 698px (2x), JPG q80 ou WebP, < 120 KB. Entregar com o canto esquerdo já arredondado no arquivo — border-radius parcial não renderiza em Outlook.<br>Ideia: retrato vertical real do depoente do card 1 em seu contexto de trabalho, meio corpo ou busto, olhando para a câmera com expressão aberta. Ao menos um marcador visual da profissão no quadro — jaleco, ferramenta, ambiente — porque é ele que casa a foto com o slot de credencial. Rosto no terço superior para sobreviver ao recorte estreito. Luz natural, fundo real desfocado.<br><br>Vertical portrait of a [PROFISSÃO] in their working context, half body<br>or bust, centred in frame, looking at camera with an open confident<br>expression. At least one visible marker of the profession — [JALECO /<br>ESTETOSCÓPIO / FERRAMENTA] — in frame. The face sits in the upper third<br>so it survives a narrow crop. Natural light, softly blurred real-world<br>background that reinforces the credential; not a studio. No text, no<br>logos, no badges, no watermark, no illustrated avatar.<br>Aspect ratio 2:3. High resolution.
- **`review_2_portrait`**
    - *Orientação:* Onde fica: coluna esquerda do card 2, 241px de largura, canto esquerdo arredondado em 22px.
    - *Imagem:* proporção 2:3 · 241 × 349 px
    - *Spec da imagem:* Vertical portrait of a [PROFISSÃO] in their working context, half body<br>or bust, centred in frame, looking at camera with an open confident<br>expression. At least one visible marker of the profession — [JALECO /<br>ESTETOSCÓPIO / FERRAMENTA] — in frame. The face sits in the upper third<br>so it survives a narrow crop. Natural light, softly blurred real-world<br>background that reinforces the credential; not a studio. No text, no<br>logos, no badges, no watermark, no illustrated avatar.<br>Aspect ratio 2:3. High resolution.<br><br>Proporção: 2:3. Slot de 241 × 349px. Ativo final 482 × 698px (2x), JPG q80 ou WebP, < 120 KB. Entregar com o canto esquerdo já arredondado no arquivo.<br>Ideia: retrato vertical real do depoente do card 2, nas mesmas condições do slot 1. Variar o enquadramento e o cenário em relação ao card 1 — um em ambiente aberto e outro em interior, ou um de corpo mais aberto e outro mais fechado. Dois retratos com a mesma composição lado a lado parecem banco de imagem e derrubam a credibilidade que o bloco existe para construir.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Recommendation (reviews)</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#E1DEDE;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:60px 69px 0 69px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:37px;font-weight:400;letter-spacing:-0.011em;color:#000000;">
        RECOMMENDATION
      </td>
    </tr>

    <!-- COPY -->
    <tr>
      <td align="center" class="txt-blk" style="padding:35px 69px 0 69px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:29px;font-weight:400;letter-spacing:-0.011em;color:#000000;">
        Veterinarians across the nation are raving about the results they've seen when recommending Wuffes products to their patients. Just imagine the results your pup could see to improve their quality of life.
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- CARD DE REVIEW 1                                                 -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:45px 28px 0 29px;">
        <table role="presentation" width="541" cellpadding="0" cellspacing="0" border="0" style="width:541px;">
          <tr>

            <!-- foto -->
            <td width="241" valign="top" style="width:241px;font-size:0;line-height:0;">
              <img src="URL_FOTO_REVIEW_1" width="241" height="349" alt="ALT_REVIEW_1"
                   style="display:block;width:241px;height:349px;border-radius:22px 0 0 22px;background:#EFEFEF;">
            </td>

            <!-- painel escuro -->
            <td width="300" valign="top" style="width:300px;background:#404040;border-radius:0 22px 22px 0;">
              <table role="presentation" width="300" cellpadding="0" cellspacing="0" border="0" style="width:300px;">
                <tr>
                  <td style="padding:30px 20px 0 19px;">

                    <!-- aspas -->
                    <div class="txt-wht" style="font-family:Georgia,'Times New Roman',serif;font-size:52px;line-height:17px;font-weight:700;color:#FFFFFF;padding-left:11px;">
                      &ldquo;
                    </div>

                    <!-- depoimento -->
                    <div class="txt-wht" style="padding-top:31px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </div>

                    <!-- estrelas -->
                    <div class="txt-wht" style="padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:21px;letter-spacing:9px;color:#FFFFFF;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>

                    <!-- nome -->
                    <div class="txt-wht" style="padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
                      Name.
                    </div>

                    <!-- função -->
                    <div class="txt-wht" style="padding-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
                      Professional
                    </div>

                  </td>
                </tr>
                <tr><td height="36" style="height:36px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- CARD DE REVIEW 2                                                 -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:31px 28px 70px 29px;">
        <table role="presentation" width="541" cellpadding="0" cellspacing="0" border="0" style="width:541px;">
          <tr>

            <td width="241" valign="top" style="width:241px;font-size:0;line-height:0;">
              <img src="URL_FOTO_REVIEW_2" width="241" height="349" alt="ALT_REVIEW_2"
                   style="display:block;width:241px;height:349px;border-radius:22px 0 0 22px;background:#EFEFEF;">
            </td>

            <td width="300" valign="top" style="width:300px;background:#404040;border-radius:0 22px 22px 0;">
              <table role="presentation" width="300" cellpadding="0" cellspacing="0" border="0" style="width:300px;">
                <tr>
                  <td style="padding:30px 20px 0 19px;">

                    <div class="txt-wht" style="font-family:Georgia,'Times New Roman',serif;font-size:52px;line-height:17px;font-weight:700;color:#FFFFFF;padding-left:11px;">
                      &ldquo;
                    </div>

                    <div class="txt-wht" style="padding-top:31px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </div>

                    <div class="txt-wht" style="padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:21px;letter-spacing:9px;color:#FFFFFF;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>

                    <div class="txt-wht" style="padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
                      Name.
                    </div>

                    <div class="txt-wht" style="padding-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
                      Professional
                    </div>

                  </td>
                </tr>
                <tr><td height="36" style="height:36px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-7dafa6ca"></a>

### 5.2 · review 3 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | baixa |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Carrinho abandonado, Boas-vindas |
| **Tons compatíveis** | Descontraído, Amigável, Aspiracional |
| **Tags** | light_bg, bordered_container, standalone_component, reviews, social_proof, testimonial_blocks, two_reviews, product_photo, zigzag_layout, alternating_image_side, monospace_font, custom_font_fallback, quote_mark, serif_quote, star_rating, five_stars, black_stars, verified_buyer, review_subtitle, no_card_bg, single_cta, auto_width_button, no_mso_fallback, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 10.7 KB |
| **ID** | `7dafa6ca-65de-4907-b52c-dad83ecd63a4` |

#### Descrição curta

Bloco de prova social para inserir depois do argumento principal, quando a objeção que falta vencer é confiança no produto e não preço. Usa dois depoimentos longos de clientes reais com foto do item comprado para fechar a decisão antes do CTA final.  

#### Descrição detalhada

Título centralizado em duas linhas seguido de duas linhas de review em disposição espelhada: na primeira, foto à esquerda sangrando na borda e texto à direita; na segunda, texto à esquerda e foto à direita sangrando. Cada review é uma pilha fixa — aspas decorativas alinhadas à direita da coluna de texto, título do depoimento em bold, corpo do depoimento, régua de 5 estrelas, nome e selo de credencial. Fecha com um CTA sólido centralizado.  

Tipografia monoespaçada em todos os blocos, sem nenhuma segunda família. O depoimento fica com aparência de texto digitado pelo próprio cliente, não de copy da marca.  
Sangria alternada das fotos. As duas fotos encostam nas bordas opostas do container e o texto respira para dentro. O zigue-zague dá ritmo sem precisar de card, borda ou fundo colorido.  
Alinhamento superior das colunas. A altura de cada linha é ditada pelo depoimento mais longo, e a foto acompanha. Depoimentos de tamanhos diferentes não quebram o layout.  

#### Contexto para a IA

##### Quando usar

Recuperação de checkout ou carrinho, como segundo ou terceiro bloco, depois de recuperar o item.  
Loja com reviews escritos longos e específicos (menciona sensação, uso, encaixe), não "produto muito bom, recomendo".  
Categorias em que o cliente decide por confiança em ajuste ou qualidade: vestuário, performance, suplemento, skincare.  
Marca sem paleta ou com identidade preto e branco — a seção depende de contraste, não de cor.  

##### Quando NÃO usar

Sem foto do produto real usado ou vestido. Foto de estúdio genérica derruba o efeito de depoimento.  
Reviews curtos (menos de ~80 caracteres). A coluna fica vazia ao lado de uma foto alta e o bloco desmonta.  
Como primeira seção do e-mail. A seção não tem oferta, cupom nem contexto de campanha — só reforça.  
E-mail que já tem outra seção de prova social. Duplicar prova social na mesma peça cansa.  
Marca com tipografia serifada ou display de identidade forte — o monoespaçado é dominante demais para conviver.  

##### Orientações de copy para a IA

Depoimento é citação, não copy. Preservar as palavras do cliente, inclusive repetição e falta de vírgula. Não corrigir gramática nem encurtar para "ficar limpo".  
Título do depoimento é o benefício em duas ou três palavras, extraído do próprio texto do review — nunca um slogan da marca.  
Título da seção fala do cliente, não do produto: quantos já compram, quem já usa, quem já aprovou.  
Os dois reviews devem cobrir atributos diferentes (um sobre a peça, outro sobre outro item ou outro aspecto). Dois reviews sobre a mesma coisa desperdiçam o bloco.  
Selo de credencial é obrigatório e sempre o mesmo texto nos dois ("Verified Buyer", "Compra verificada"). É o que sustenta a alegação.  
CTA retoma a ação pendente, não repete "comprar agora" genérico.  
Se o review original mencionar cupom ou código de afiliado, manter — reforça que é texto de gente real.  

##### Design system

Container: 600px travado, fundo branco, sem borda.  

Tipografia principal: Space Mono (fallback 'Courier New', Courier, monospace) em todos os blocos de texto. Não há tipografia secundária — as estrelas usam Arial só porque o glifo ★ do monoespaçado não é confiável.  

| Bloco | Tamanho / entrelinha | Peso | Tracking | Caixa |  
|---|---|---|---|---|  
| Título da seção | 30 / 39 | 700 | 0.06em | ALTA |  
| Aspas decorativas | 120 / 58 | 700 | 0.04em | glifo &rdquo; |  
| Título do depoimento | 22 / 29 | 700 | 0.04em | Sentença |  
| Corpo do depoimento | 20 / 26 | 400 | 0.04em | Sentença |  
| Estrelas (Arial) | 32 / 32 | — | — | ★ ×5 (154px) |  
| Nome | 18 / 24 | 700 | 0.04em | Sentença |  
| Selo de credencial | 16 / 21 | 400 | 0.04em | Sentença |  
| Label do CTA | 22 | 700 | 0.10em | ALTA |  

Cores. Cor primária   
#000000 (todo o texto e o fundo do CTA). Cor secundária   
#FFFFFF (fundo da peça e label do CTA). Cor de acento   
#FA6B05 — usada exclusivamente em aspas e estrelas, os dois únicos elementos coloridos da seção.  

Grade e ritmo vertical (medido no PNG de referência):  

título da seção          padding lateral 79px, centralizado  
   ↓ 47px  
REVIEW 1   linha de 598px — coluna foto 275px | coluna texto 323px  
           aspas (alinhadas à direita do bloco de texto)  
              ↓ 6px   título do depoimento  
              ↓ 8px   corpo  
              ↓ 20px  estrelas  
              ↓ 11px  nome  
              ↓ 1px   selo  
   ↓ 66px  
REVIEW 2   espelhado — coluna texto 360px | coluna foto 238px  
   ↓ 39px  
CTA        325 × 60, fundo #000000, centralizado  
   ↓ 100px  

Regras que não podem ser quebradas:  

Zero border-radius, zero sombra, zero gradiente, zero borda em qualquer elemento.  
As fotos encostam na borda do container (x=0 e x=599). Adicionar respiro lateral mata a sangria.  
As aspas são alinhadas à direita do bloco de texto nos dois reviews, inclusive no espelhado.  
Acento só em aspas e estrelas. Título, corpo, nome, selo e CTA são pretos.  
Colunas com valign="top", nunca middle.  
display:block em toda <img> e célula da foto com font-size:0;line-height:0 — sem isso o Outlook abre um gap na sangria.  
Nenhuma segunda família tipográfica além do fallback do monoespaçado.  

##### Direção fotográfica

Produto recortado em fundo branco puro (  
#FFFFFF), sem sombra projetada, sem superfície, sem cenário. O fundo do ativo é o fundo do e-mail — a ausência de emenda é o efeito.  

Peça vestível: fotografada plana ou em suporte invisível, levemente girada, com a estampa ou detalhe que o review menciona totalmente visível.  
Par de itens: os dois em diagonal, sobrepostos parcialmente, um claro e um escuro para gerar contraste no branco.  
Escala: o produto ocupa 85–95% da altura do slot. Sobra de branco só no eixo em que o recorte sangra para fora do container.  
Luz: difusa e frontal, alto-chave, sem vinheta e sem realce especular forte. O branco do produto tem que se separar do branco do fundo apenas por sombra própria suave.  
Proibições: modelo com rosto, fundo colorido, sombra dura no chão, prop de cena, moldura, reflexo de estúdio, recorte com halo cinza na borda.  

#### Schema de output (12 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `reviews_headline` | `{{REVIEWS_HEADLINE}}` | Texto curto | Copy (n8n) | não | 44 | sim |
| `review_1_title` | `{{REVIEW_1_TITLE}}` | Texto curto | Copy (n8n) | não | 36 | sim |
| `review_1_body` | `{{REVIEW_1_BODY}}` | Texto curto | Copy (n8n) | não | 190 | sim |
| `review_1_name` | `{{REVIEW_1_NAME}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_1_credential` | `{{REVIEW_1_CREDENTIAL}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `review_2_title` | `{{REVIEW_2_TITLE}}` | Texto curto | Copy (n8n) | não | 36 | sim |
| `review_2_body` | `{{REVIEW_2_BODY}}` | Texto curto | Copy (n8n) | não | 190 | sim |
| `review_2_name` | `{{REVIEW_2_NAME}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_2_credential` | `{{REVIEW_2_CREDENTIAL}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `reviews_cta_label` | `{{REVIEWS_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `review_1_portrait` | `{{REVIEW_1_PORTRAIT}}` | Imagem | Imagem gerada | não | — | — |
| `review_2_portrait` | `{{REVIEW_2_PORTRAIT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`reviews_headline`**
    - *Exemplo:* Lorem ipsum dolor sit amet consectetur 1
- **`review_1_title`**
    - *Exemplo:* Ut enim ad minim veniam
- **`review_1_body`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- **`review_1_name`**
    - *Exemplo:* Name. 1
- **`review_1_credential`**
    - *Exemplo:* Verified Buyer 1
- **`review_2_title`**
    - *Exemplo:* 2 Ut enim ad minim veniam
- **`review_2_body`**
    - *Exemplo:* oi oi Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- **`review_2_name`**
    - *Exemplo:* Name. 2
- **`review_2_credential`**
    - *Exemplo:* Verified Buyer 2
- **`reviews_cta_label`**
    - *Exemplo:* Finish My Order
- **`review_1_portrait`**
    - *Orientação:* Onde: coluna esquerda do primeiro review, sangrando na borda esquerda do container.
    - *Imagem:* proporção 2:3 · 238 × 342 px
    - *Spec da imagem:* Como gerar: gerar em 2:3, redimensionar para 456 × 684 e centralizar em canvas branco de 476 × 684. Os 10px de branco de cada lado são invisíveis porque o fundo da peça também é branco — não cortar o recorte.<br>Ideia: o produto principal do depoimento, recortado em fundo branco, levemente girado, com a estampa ou o detalhe citado no review em evidência.
- **`review_2_portrait`**
    - *Orientação:* Onde: coluna direita do segundo review, sangrando na borda direita do container.
    - *Imagem:* proporção 2:3 · 238 × 342 px
    - *Spec da imagem:* Como gerar: idêntico ao slot 1.<br>Ideia: um item diferente do primeiro (ou o par claro + escuro do mesmo item), em diagonal, recortado no mesmo fundo branco e com a mesma luz do slot 1.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Seção — Reviews monospace</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- HEADLINE -->
    <tr>
      <td align="center" class="txt-blk" style="padding:57px 79px 0 79px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:30px;line-height:39px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#000000;">
        Lorem ipsum dolor sit amet consectetur 1
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 1 — foto à esquerda, sangrada na borda                    -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:49px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>

            <!-- foto -->
            <td width="275" valign="top" style="width:275px;padding:62px 0 0 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAO4AAAFWCAIAAADhYjbZAAAD…[base64 de ~1 KB omitido]…" width="238" height="342" alt="ALT_REVIEW_1"
                   style="display:block;width:238px;height:342px;background:#D9D9D9;">
            </td>

            <!-- review -->
            <td width="323" valign="top" style="width:323px;padding:0 55px 0 0;">
              <table role="presentation" width="268" cellpadding="0" cellspacing="0" border="0" style="width:268px;">
                <tr>
                  <td>

                    <!-- aspas decorativas -->
                    <div style="font-family:'Space Mono','Courier New',Courier,monospace;font-size:120px;line-height:58px;font-weight:700;letter-spacing:0.04em;color:#271B1B;text-align:right;">
                      &rdquo;
                    </div>

                    <!-- título do depoimento -->
                    <div class="txt-blk" style="padding-top:6px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:22px;line-height:29px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                      Ut enim ad minim veniam
                    </div>

                    <!-- depoimento -->
                    <div class="txt-blk" style="padding-top:8px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:20px;line-height:26px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </div>

                    <!-- estrelas -->
                    <div style="padding-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:32px;color:#271B1B;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>

                    <!-- nome -->
                    <div class="txt-blk" style="padding-top:11px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:18px;line-height:24px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                      Name. 1
                    </div>

                    <!-- selo -->
                    <div class="txt-blk" style="padding-top:1px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:16px;line-height:21px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                      Verified Buyer 1
                    </div>

                  </td>
                </tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 2 — foto à direita, sangrada na borda                     -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:65px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>

            <!-- review -->
            <td width="360" valign="top" style="width:360px;padding:0 53px 0 39px;">
              <table role="presentation" width="268" cellpadding="0" cellspacing="0" border="0" style="width:268px;">
                <tr>
                  <td>

                    <div style="font-family:'Space Mono','Courier New',Courier,monospace;font-size:120px;line-height:58px;font-weight:700;letter-spacing:0.04em;color:#322020;text-align:right;">
                      &rdquo;
                    </div>

                    <div class="txt-blk" style="padding-top:6px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:22px;line-height:29px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                     2 Ut enim ad minim veniam
                    </div>

                    <div class="txt-blk" style="padding-top:8px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:20px;line-height:26px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                       oi oi Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </div>

                    <div style="padding-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:32px;color:#322020;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>

                    <div class="txt-blk" style="padding-top:11px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:18px;line-height:24px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                      Name. 2
                    </div>

                    <div class="txt-blk" style="padding-top:1px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:16px;line-height:21px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                      Verified Buyer 2
                    </div>

                  </td>
                </tr>
              </table>
            </td>

            <!-- foto -->
            <td width="238" valign="top" style="width:238px;padding:53px 0 0 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAO4AAAFWCAIAAADhYjbZAAAD…[base64 de ~1 KB omitido]…" width="238" height="342" alt="ALT_REVIEW_2"
                   style="display:block;width:238px;height:342px;background:#D9D9D9;">
            </td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:56px 0 113px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:325px;">
          <tr>
            <td align="center" height="60" style="width:325px;height:60px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:325px;height:60px;line-height:60px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:22px;font-weight:700;letter-spacing:0.1em;text-indent:0.1em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Finish My Order
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-cff6c8d8"></a>

### 5.3 · review 3 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | baixa |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Carrinho abandonado, Boas-vindas |
| **Tons compatíveis** | Descontraído, Amigável, Aspiracional |
| **Tags** | light_bg, bordered_container, standalone_component, reviews, social_proof, testimonial_blocks, two_reviews, product_photo, zigzag_layout, alternating_image_side, monospace_font, custom_font_fallback, quote_mark, serif_quote, star_rating, five_stars, black_stars, verified_buyer, review_subtitle, no_card_bg, single_cta, auto_width_button, no_mso_fallback, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 10.7 KB |
| **ID** | `cff6c8d8-a0da-4c80-90fa-1875174a75a1` |

#### Descrição curta

Bloco de prova social para inserir depois do argumento principal, quando a objeção que falta vencer é confiança no produto e não preço. Usa dois depoimentos longos de clientes reais com foto do item comprado para fechar a decisão antes do CTA final.  

#### Descrição detalhada

Título centralizado em duas linhas seguido de duas linhas de review em disposição espelhada: na primeira, foto à esquerda sangrando na borda e texto à direita; na segunda, texto à esquerda e foto à direita sangrando. Cada review é uma pilha fixa — aspas decorativas alinhadas à direita da coluna de texto, título do depoimento em bold, corpo do depoimento, régua de 5 estrelas, nome e selo de credencial. Fecha com um CTA sólido centralizado.  

Tipografia monoespaçada em todos os blocos, sem nenhuma segunda família. O depoimento fica com aparência de texto digitado pelo próprio cliente, não de copy da marca.  
Sangria alternada das fotos. As duas fotos encostam nas bordas opostas do container e o texto respira para dentro. O zigue-zague dá ritmo sem precisar de card, borda ou fundo colorido.  
Alinhamento superior das colunas. A altura de cada linha é ditada pelo depoimento mais longo, e a foto acompanha. Depoimentos de tamanhos diferentes não quebram o layout.  

#### Contexto para a IA

##### Quando usar

Recuperação de checkout ou carrinho, como segundo ou terceiro bloco, depois de recuperar o item.  
Loja com reviews escritos longos e específicos (menciona sensação, uso, encaixe), não "produto muito bom, recomendo".  
Categorias em que o cliente decide por confiança em ajuste ou qualidade: vestuário, performance, suplemento, skincare.  
Marca sem paleta ou com identidade preto e branco — a seção depende de contraste, não de cor.  

##### Quando NÃO usar

Sem foto do produto real usado ou vestido. Foto de estúdio genérica derruba o efeito de depoimento.  
Reviews curtos (menos de ~80 caracteres). A coluna fica vazia ao lado de uma foto alta e o bloco desmonta.  
Como primeira seção do e-mail. A seção não tem oferta, cupom nem contexto de campanha — só reforça.  
E-mail que já tem outra seção de prova social. Duplicar prova social na mesma peça cansa.  
Marca com tipografia serifada ou display de identidade forte — o monoespaçado é dominante demais para conviver.  

##### Orientações de copy para a IA

Depoimento é citação, não copy. Preservar as palavras do cliente, inclusive repetição e falta de vírgula. Não corrigir gramática nem encurtar para "ficar limpo".  
Título do depoimento é o benefício em duas ou três palavras, extraído do próprio texto do review — nunca um slogan da marca.  
Título da seção fala do cliente, não do produto: quantos já compram, quem já usa, quem já aprovou.  
Os dois reviews devem cobrir atributos diferentes (um sobre a peça, outro sobre outro item ou outro aspecto). Dois reviews sobre a mesma coisa desperdiçam o bloco.  
Selo de credencial é obrigatório e sempre o mesmo texto nos dois ("Verified Buyer", "Compra verificada"). É o que sustenta a alegação.  
CTA retoma a ação pendente, não repete "comprar agora" genérico.  
Se o review original mencionar cupom ou código de afiliado, manter — reforça que é texto de gente real.  

##### Design system

Container: 600px travado, fundo branco, sem borda.  

Tipografia principal: Space Mono (fallback 'Courier New', Courier, monospace) em todos os blocos de texto. Não há tipografia secundária — as estrelas usam Arial só porque o glifo ★ do monoespaçado não é confiável.  

| Bloco | Tamanho / entrelinha | Peso | Tracking | Caixa |  
|---|---|---|---|---|  
| Título da seção | 30 / 39 | 700 | 0.06em | ALTA |  
| Aspas decorativas | 120 / 58 | 700 | 0.04em | glifo &rdquo; |  
| Título do depoimento | 22 / 29 | 700 | 0.04em | Sentença |  
| Corpo do depoimento | 20 / 26 | 400 | 0.04em | Sentença |  
| Estrelas (Arial) | 32 / 32 | — | — | ★ ×5 (154px) |  
| Nome | 18 / 24 | 700 | 0.04em | Sentença |  
| Selo de credencial | 16 / 21 | 400 | 0.04em | Sentença |  
| Label do CTA | 22 | 700 | 0.10em | ALTA |  

Cores. Cor primária   
#000000 (todo o texto e o fundo do CTA). Cor secundária   
#FFFFFF (fundo da peça e label do CTA). Cor de acento   
#FA6B05 — usada exclusivamente em aspas e estrelas, os dois únicos elementos coloridos da seção.  

Grade e ritmo vertical (medido no PNG de referência):  

título da seção          padding lateral 79px, centralizado  
   ↓ 47px  
REVIEW 1   linha de 598px — coluna foto 275px | coluna texto 323px  
           aspas (alinhadas à direita do bloco de texto)  
              ↓ 6px   título do depoimento  
              ↓ 8px   corpo  
              ↓ 20px  estrelas  
              ↓ 11px  nome  
              ↓ 1px   selo  
   ↓ 66px  
REVIEW 2   espelhado — coluna texto 360px | coluna foto 238px  
   ↓ 39px  
CTA        325 × 60, fundo #000000, centralizado  
   ↓ 100px  

Regras que não podem ser quebradas:  

Zero border-radius, zero sombra, zero gradiente, zero borda em qualquer elemento.  
As fotos encostam na borda do container (x=0 e x=599). Adicionar respiro lateral mata a sangria.  
As aspas são alinhadas à direita do bloco de texto nos dois reviews, inclusive no espelhado.  
Acento só em aspas e estrelas. Título, corpo, nome, selo e CTA são pretos.  
Colunas com valign="top", nunca middle.  
display:block em toda <img> e célula da foto com font-size:0;line-height:0 — sem isso o Outlook abre um gap na sangria.  
Nenhuma segunda família tipográfica além do fallback do monoespaçado.  

##### Direção fotográfica

Produto recortado em fundo branco puro (  
#FFFFFF), sem sombra projetada, sem superfície, sem cenário. O fundo do ativo é o fundo do e-mail — a ausência de emenda é o efeito.  

Peça vestível: fotografada plana ou em suporte invisível, levemente girada, com a estampa ou detalhe que o review menciona totalmente visível.  
Par de itens: os dois em diagonal, sobrepostos parcialmente, um claro e um escuro para gerar contraste no branco.  
Escala: o produto ocupa 85–95% da altura do slot. Sobra de branco só no eixo em que o recorte sangra para fora do container.  
Luz: difusa e frontal, alto-chave, sem vinheta e sem realce especular forte. O branco do produto tem que se separar do branco do fundo apenas por sombra própria suave.  
Proibições: modelo com rosto, fundo colorido, sombra dura no chão, prop de cena, moldura, reflexo de estúdio, recorte com halo cinza na borda.  

#### Schema de output (12 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `reviews_headline` | `{{REVIEWS_HEADLINE}}` | Texto curto | Copy (n8n) | não | 44 | sim |
| `review_1_title` | `{{REVIEW_1_TITLE}}` | Texto curto | Copy (n8n) | não | 36 | sim |
| `review_1_body` | `{{REVIEW_1_BODY}}` | Texto curto | Copy (n8n) | não | 190 | sim |
| `review_1_name` | `{{REVIEW_1_NAME}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_1_credential` | `{{REVIEW_1_CREDENTIAL}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `review_2_title` | `{{REVIEW_2_TITLE}}` | Texto curto | Copy (n8n) | não | 36 | sim |
| `review_2_body` | `{{REVIEW_2_BODY}}` | Texto curto | Copy (n8n) | não | 190 | sim |
| `review_2_name` | `{{REVIEW_2_NAME}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_2_credential` | `{{REVIEW_2_CREDENTIAL}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `reviews_cta_label` | `{{REVIEWS_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 18 | sim |
| `review_1_portrait` | `{{REVIEW_1_PORTRAIT}}` | Imagem | Imagem gerada | não | — | — |
| `review_2_portrait` | `{{REVIEW_2_PORTRAIT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`reviews_headline`**
    - *Exemplo:* Lorem ipsum dolor sit amet consectetur 1
- **`review_1_title`**
    - *Exemplo:* Ut enim ad minim veniam
- **`review_1_body`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- **`review_1_name`**
    - *Exemplo:* Name. 1
- **`review_1_credential`**
    - *Exemplo:* Verified Buyer 1
- **`review_2_title`**
    - *Exemplo:* 2 Ut enim ad minim veniam
- **`review_2_body`**
    - *Exemplo:* oi oi Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- **`review_2_name`**
    - *Exemplo:* Name. 2
- **`review_2_credential`**
    - *Exemplo:* Verified Buyer 2
- **`reviews_cta_label`**
    - *Exemplo:* Finish My Order
- **`review_1_portrait`**
    - *Orientação:* Onde: coluna esquerda do primeiro review, sangrando na borda esquerda do container.
    - *Imagem:* proporção 2:3 · 238 × 342 px
    - *Spec da imagem:* Como gerar: gerar em 2:3, redimensionar para 456 × 684 e centralizar em canvas branco de 476 × 684. Os 10px de branco de cada lado são invisíveis porque o fundo da peça também é branco — não cortar o recorte.<br>Ideia: o produto principal do depoimento, recortado em fundo branco, levemente girado, com a estampa ou o detalhe citado no review em evidência.
- **`review_2_portrait`**
    - *Orientação:* Onde: coluna direita do segundo review, sangrando na borda direita do container.
    - *Imagem:* proporção 2:3 · 238 × 342 px
    - *Spec da imagem:* Como gerar: idêntico ao slot 1.<br>Ideia: um item diferente do primeiro (ou o par claro + escuro do mesmo item), em diagonal, recortado no mesmo fundo branco e com a mesma luz do slot 1.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Seção — Reviews monospace</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- HEADLINE -->
    <tr>
      <td align="center" class="txt-blk" style="padding:57px 79px 0 79px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:30px;line-height:39px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#000000;">
        Lorem ipsum dolor sit amet consectetur 1
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 1 — foto à esquerda, sangrada na borda                    -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:49px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>

            <!-- foto -->
            <td width="275" valign="top" style="width:275px;padding:62px 0 0 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAO4AAAFWCAIAAADhYjbZAAAD…[base64 de ~1 KB omitido]…" width="238" height="342" alt="ALT_REVIEW_1"
                   style="display:block;width:238px;height:342px;background:#D9D9D9;">
            </td>

            <!-- review -->
            <td width="323" valign="top" style="width:323px;padding:0 55px 0 0;">
              <table role="presentation" width="268" cellpadding="0" cellspacing="0" border="0" style="width:268px;">
                <tr>
                  <td>

                    <!-- aspas decorativas -->
                    <div style="font-family:'Space Mono','Courier New',Courier,monospace;font-size:120px;line-height:58px;font-weight:700;letter-spacing:0.04em;color:#271B1B;text-align:right;">
                      &rdquo;
                    </div>

                    <!-- título do depoimento -->
                    <div class="txt-blk" style="padding-top:6px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:22px;line-height:29px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                      Ut enim ad minim veniam
                    </div>

                    <!-- depoimento -->
                    <div class="txt-blk" style="padding-top:8px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:20px;line-height:26px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </div>

                    <!-- estrelas -->
                    <div style="padding-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:32px;color:#271B1B;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>

                    <!-- nome -->
                    <div class="txt-blk" style="padding-top:11px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:18px;line-height:24px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                      Name. 1
                    </div>

                    <!-- selo -->
                    <div class="txt-blk" style="padding-top:1px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:16px;line-height:21px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                      Verified Buyer 1
                    </div>

                  </td>
                </tr>
              </table>
            </td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 2 — foto à direita, sangrada na borda                     -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:65px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>

            <!-- review -->
            <td width="360" valign="top" style="width:360px;padding:0 53px 0 39px;">
              <table role="presentation" width="268" cellpadding="0" cellspacing="0" border="0" style="width:268px;">
                <tr>
                  <td>

                    <div style="font-family:'Space Mono','Courier New',Courier,monospace;font-size:120px;line-height:58px;font-weight:700;letter-spacing:0.04em;color:#322020;text-align:right;">
                      &rdquo;
                    </div>

                    <div class="txt-blk" style="padding-top:6px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:22px;line-height:29px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                     2 Ut enim ad minim veniam
                    </div>

                    <div class="txt-blk" style="padding-top:8px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:20px;line-height:26px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                       oi oi Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </div>

                    <div style="padding-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:32px;color:#322020;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>

                    <div class="txt-blk" style="padding-top:11px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:18px;line-height:24px;font-weight:700;letter-spacing:0.04em;color:#000000;">
                      Name. 2
                    </div>

                    <div class="txt-blk" style="padding-top:1px;padding-left:2px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:16px;line-height:21px;font-weight:400;letter-spacing:0.04em;color:#000000;">
                      Verified Buyer 2
                    </div>

                  </td>
                </tr>
              </table>
            </td>

            <!-- foto -->
            <td width="238" valign="top" style="width:238px;padding:53px 0 0 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAO4AAAFWCAIAAADhYjbZAAAD…[base64 de ~1 KB omitido]…" width="238" height="342" alt="ALT_REVIEW_2"
                   style="display:block;width:238px;height:342px;background:#D9D9D9;">
            </td>

          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:56px 0 113px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:325px;">
          <tr>
            <td align="center" height="60" style="width:325px;height:60px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:325px;height:60px;line-height:60px;font-family:'Space Mono','Courier New',Courier,monospace;font-size:22px;font-weight:700;letter-spacing:0.1em;text-indent:0.1em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Finish My Order
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-f8ed9f85"></a>

### 5.4 · review 5 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | média |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Lançamento, Carrinho abandonado |
| **Tons compatíveis** | Descontraído, Amigável, Aspiracional |
| **Tags** | light_bg, bordered_container, standalone_component, reviews, social_proof, testimonial_cards, three_reviews, product_photo, dark_review_panel, black_panel, star_rating, five_stars, white_stars, quote_text, buyer_name, partial_rounded_corner, single_cta, hard_shadow_button, brutalist_button, no_mso_fallback, repeatable_blocks, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 8.8 KB |
| **ID** | `f8ed9f85-f0f3-47f3-879a-2dd65aba0f86` |

#### Descrição curta

Bloco de prova social por volume. Três depoimentos de clientes comuns, cada um com uma foto do produto na casa de quem escreveu, seguidos do título da seção e do CTA. Momento de uso: meio ou fim de e-mail de consideração, quando a objeção não é técnica e sim "outras pessoas compraram e gostaram?".  

#### Descrição detalhada

Copy de abertura sobre fundo claro; abaixo, três cards de review empilhados; depois deles, o título da seção e o CTA. Cada card é bipartido: foto vertical à esquerda, painel escuro à direita.  

Quatro mecanismos definem a variante:  

A foto é o produto em cena, não o rosto do depoente. Garrafa na bancada, latas na varanda, produto no ambiente de quem comprou. É prova de uso doméstico, não de autoridade — o oposto da variante de cards com credencial.  

Título e CTA vêm depois dos reviews. A prova antecede a chamada; quando o leitor chega ao botão, os três depoimentos já foram lidos. Subir o título para o topo inverte a lógica e transforma o bloco em seção de catálogo.  

CTA com sombra sólida. Botão branco com borda de 2px sobre um bloco preto deslocado 10px para baixo. Não é sombra de CSS: são duas tabelas empilhadas, e é isso que garante o efeito em Outlook.  

Três cards de altura idêntica. A foto fixa a altura em 346px, o que impõe um teto rígido ao depoimento. É a restrição que mantém os três cards visualmente iguais.  

#### Contexto para a IA

##### Quando usar

Consideração e reengajamento, depois de o produto já ter sido apresentado.  
Quando existe volume de reviews de clientes comuns com nome e foto de uso.  
Alimentos, bebidas, casa, pet, beleza, produtos de consumo recorrente.  
Quando o argumento é adesão social — "muita gente gostou" — e não credencial técnica.  
Quando as fotos disponíveis mostram o produto em ambiente doméstico real.  

##### Quando NÃO usar

Objeção técnica ou de segurança — use a variante de cards com credencial, onde o rosto e o cargo carregam o argumento.  
Menos de três reviews — a variante depende do efeito de volume.  
Sem foto de uso real — packshot repetido três vezes vira grade de produto.  
Depoimentos longos demais — a altura fixa de 346px corta o texto.  
Carrinho, checkout, transacional, topo de e-mail.  
No mesmo e-mail que blocos de cantos vivos — a variante usa raio em duas medidas.  

##### Orientações de copy para a IA

Copy de abertura — posicionamento do produto em três linhas, caixa alta. Diz o que o produto entrega e para qual ocasião. É a única fala da marca no bloco.  

Depoimentos — fala de cliente em primeira pessoa, entre aspas, mencionando ocasião de uso ("aniversário", "noite de jogos", "beira da piscina"). Ocasião é mais persuasiva que atributo neste bloco. Os três precisam citar ocasiões diferentes — a repetição derruba a sensação de volume.  

Nomes — nome e sobrenome em caixa alta, precedidos de travessão. Sem cargo, sem credencial: aqui a força é ser gente comum.  

Título da seção — chamada em caixa alta que fecha o argumento e prepara o clique.  

CTA — verbo genérico em caixa alta.  

Proibições: credencial ou cargo nos nomes · depoimento acima do limite de caracteres · três depoimentos com a mesma ocasião · desconto ou cupom · CTA dentro do card · nota abaixo de cinco estrelas · título da seção acima dos reviews.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Raio de 16px nos cards e 10px no CTA — variante com cantos arredondados.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Copy de abertura | 35px | 22/27px, padding lateral 83px |  
| 2 | Review 1 | 77px | 540px |  
| 3 | Review 2 | 48px | 540px |  
| 4 | Review 3 | 48px | 540px |  
| 5 | Título da seção | 97px | 30/33px bold, caixa alta |  
| 6 | CTA | 27px | 447 × 61px, com 80px de respiro na base |  

Anatomia do card — duas colunas, 540px no total.  

| Coluna | Largura | Conteúdo |  
|---|---|---|  
| Foto | 241px | Imagem 241 × 346px, raio 16px só à esquerda |  
| Painel | 299px | Fundo escuro, raio 16px só à direita |  

Interior do painel, padding 40px no topo, 34px à direita, 49px na base e 26px à esquerda: estrelas 15px com tracking +7px · depoimento 27px abaixo, 22/27px, entre aspas · nome 26px abaixo, 20/27px bold, com recuo de 7px.  

CTA com sombra sólida: tabela externa de 447px na cor primária com raio 10px, contendo a tabela do botão (fundo claro, borda de 2px, raio 10px) e uma linha de 10px abaixo dela. O <a> mede 443 × 57px para caber dentro da borda.  

Paleta — três cores.  

| Papel | Hex (Willie's) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #374256 | Fundo do painel do card e todo o texto sobre o fundo claro |  |  
| Cor secundária |  |  |  
| #FAF7F0 | Fundo da seção — off-white quente |  |  
| Neutro invertido |  |  |  
| #FFF8EE | Estrelas, depoimento e nome dentro do painel |  |  

O branco do painel é off-white, não   
#FFFFFF — casa com o fundo da seção e tira a dureza do contraste. Não existe cor de acento: as estrelas usam o mesmo branco do texto.  

Pele alternativa (HTML base): seção branca, painel   
#000000, texto preto sobre o fundo. Usar quando a marca é neutra.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Copy de abertura e título em caixa alta; depoimento em caixa mista; nome em bold. Secundária não existe.  

Implementação. border-radius parcial não renderiza em Outlook: a foto precisa sair do Figma com o canto esquerdo já arredondado e o painel degrada para retângulo. background:#EFEFEF na <img> como fallback. font-size:0;line-height:0 na célula da foto. Estrelas em &#9733; com tracking, nunca imagem. O CTA com sombra depende de duas tabelas aninhadas — não substituir por box-shadow. Hacks u + .body .txt-blk e u + .body .txt-wht.  

Tags: PREHEADER, SECTION_INTRO, REVIEW_N_IMAGE_URL, REVIEW_N_IMAGE_ALT, REVIEW_N_QUOTE, REVIEW_N_NAME, SECTION_TITLE, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: raio nos quatro cantos de cada metade · cards com alturas diferentes · box-shadow no lugar da tabela empilhada · branco puro no painel · título da seção antes dos reviews · CTA dentro do card · dois cards em vez de três · foto horizontal · packshot em fundo branco.  

##### Direção fotográfica

7. Direção fotográfica  

Proporção 2:3 — slot de 241 × 346px, ativo final 482 × 692px (2x). JPG q80 ou WebP, < 120 KB por card. Gerar em 2:3 a 482 × 723 e cortar 31px de altura pela base.  

Regra crítica: o produto tem que estar em ambiente doméstico real, não em estúdio. Bancada, mesa de varanda, parapeito de janela, deck de madeira. É o que separa este bloco de uma grade de produtos.  

Composição. Produto em primeiro plano, vertical, ocupando o terço central do quadro. Contexto ao redor: fruta, copo servido, utensílio, elemento da ocasião. Enquadramento fechado — sem espaço negativo estrutural, já que a foto não recebe texto.  

Cenário e luz. Luz natural de janela ou ambiente externo. Sombras suaves. Fundo de madeira, azulejo, pedra ou vegetação, levemente desfocado.  

Produto. Rótulo legível e voltado para a câmera. Pode aparecer sozinho ou em conjunto (garrafa, latas, kit).  

Os três quadros precisam ser distintos. Ocasiões, cenários e horários diferentes — um interior, um exterior, um de detalhe. Três fotos com o mesmo enquadramento anulam o efeito de volume que a variante existe para criar.  

Proibições: fundo branco de estúdio · packshot flutuando · pessoa em primeiro plano · texto/preço/selo queimado · foto horizontal · três quadros com a mesma composição · marca d'água.  

Adaptação por categoria — o que é a cena:  

| Categoria | Cena |  
|---|---|  
| Bebidas | Garrafa ou lata servida, fruta e copo ao lado |  
| Alimentos | Prato montado na mesa de casa |  
| Casa | Item instalado ou em uso no ambiente |  
| Beleza | Produto na bancada do banheiro, luz de janela |  
| Pet | Produto ao lado do animal, chão de casa |  
| Ferramenta | Ferramenta na bancada com o trabalho ao redor |  

#### Schema de output (12 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_intro` | `{{SECTION_INTRO}}` | Texto curto | Copy (n8n) | não | 138 | sim |
| `review_1_quote` | `{{REVIEW_1_QUOTE}}` | Texto curto | Copy (n8n) | não | 156 | não |
| `review_2_quote` | `{{REVIEW_2_QUOTE}}` | Texto curto | Copy (n8n) | não | 156 | não |
| `review_3_quote` | `{{REVIEW_3_QUOTE}}` | Texto curto | Copy (n8n) | não | 156 | não |
| `review_1_name` | `{{REVIEW_1_NAME}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `review_2_name` | `{{REVIEW_2_NAME}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `review_3_name` | `{{REVIEW_3_NAME}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `section_intro_cta` | `{{SECTION_INTRO_CTA}}` | Texto curto | Copy (n8n) | não | 35 | sim |
| `review_1_scene` | `{{REVIEW_1_SCENE}}` | Imagem | Imagem gerada | não | — | — |
| `review_2_scene` | `{{REVIEW_2_SCENE}}` | Imagem | Imagem gerada | não | — | — |
| `review_3_scene` | `{{REVIEW_3_SCENE}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_intro`**
    - *Exemplo:* Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur
    - *Orientação:* 138 (3 linhas)<br>Caixa alta, posicionamento em uma frase
- **`review_1_quote`**
    - *Exemplo:* “ 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
    - *Orientação:* Entre aspas, cita a ocasião de uso
- **`review_2_quote`**
    - *Exemplo:* “2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
    - *Orientação:* Ocasião diferente da do review 1
- **`review_3_quote`**
    - *Exemplo:* “ 3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
    - *Orientação:* Ocasião diferente das anteriores
- **`review_1_name`**
    - *Exemplo:* -Buyers Name 1
    - *Orientação:* Caixa alta, precedido de travessão, sem cargo
- **`review_2_name`**
    - *Exemplo:* -Buyers Name 2
    - *Orientação:* Caixa alta, precedido de travessão, sem cargo
- **`review_3_name`**
    - *Exemplo:* -Buyers Name 3
    - *Orientação:* Caixa alta, precedido de travessão, sem cargo
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo genérico
- **`section_intro_cta`**
    - *Exemplo:* SECTION TITLE HERE
    - *Orientação:* Caixa alta, questionaamento ou algum gancho para aa frase qeuy se encaixa com o publico, marca sobre o CTA abaixo
- **`review_1_scene`**
    - *Orientação:* Onde fica: coluna esquerda do card 1, 241px de largura, canto esquerdo arredondado em 16px.
    - *Imagem:* proporção 2:3 · 241 × 346 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 241 × 346px. Ativo final 482 × 692px (2x), JPG q80 ou WebP, < 120 KB. Entregar com o canto esquerdo já arredondado no arquivo.<br>Ideia: produto em cena doméstica de interior — bancada de cozinha ou mesa posta, com props da ocasião ao redor (fruta, copo servido, utensílio). Vertical, rótulo legível, luz de janela, fundo levemente desfocado.
- **`review_2_scene`**
    - *Orientação:* Onde fica: coluna esquerda do card 2.
    - *Imagem:* proporção 2:3 · 241 × 346 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 241 × 346px. Ativo final 482 × 692px (2x), JPG q80 ou WebP, < 120 KB. Canto esquerdo já arredondado no arquivo.<br>Ideia: o mesmo produto em cena de transição ou detalhe — parapeito de janela, luz diferente da do slot 1, produto mais isolado. Muda o horário e a temperatura de cor em relação ao primeiro.
- **`review_3_scene`**
    - *Orientação:* Onde fica: coluna esquerda do card 3.
    - *Imagem:* proporção 2:3 · 241 × 346 px
    - *Spec da imagem:* Proporção: 2:3. Slot de 241 × 346px. Ativo final 482 × 692px (2x), JPG q80 ou WebP, < 120 KB. Canto esquerdo já arredondado no arquivo.<br>Ideia: cena de exterior — deck de madeira, varanda, quintal, com vegetação ao fundo. Se a marca tem mais de um formato (garrafa e lata, kit), este é o slot para mostrar o conjunto. Fecha o trio com o cenário mais aberto dos três.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Três reviews com painel preto</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- COPY DE ABERTURA -->
    <tr>
      <td align="center" class="txt-blk" style="padding:35px 83px 0 83px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur
      </td>
    </tr>


    <!-- ============ REVIEW 1 ============ -->
    <tr>
      <td align="center" style="padding:77px 0 0 0;">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:540px;">
          <tr>
            <!-- foto -->
            <td width="241" valign="top" style="width:241px;font-size:0;line-height:0;">
              <img src="URL_FOTO_1" width="241" height="346" alt="ALT_REVIEW_1"
                   style="display:block;width:241px;height:346px;border-radius:16px 0 0 16px;background:#EFEFEF;">
            </td>
            <!-- painel -->
            <td width="299" valign="top" style="width:299px;background:#000000;border-radius:0 16px 16px 0;">
              <table role="presentation" width="299" cellpadding="0" cellspacing="0" border="0" style="width:299px;">
                <tr>
                  <td style="padding:40px 34px 49px 26px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:15px;letter-spacing:7px;color:#FFF8EE;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>
                    <div class="txt-wht" style="padding-top:27px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#FFFFFF;">
                      &ldquo; 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
                    </div>
                    <div class="txt-wht" style="padding-top:26px;padding-left:7px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;color:#FFFFFF;">
                      -Buyers Name 1 
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ REVIEW 2 ============ -->
    <tr>
      <td align="center" style="padding:48px 0 0 0;">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:540px;">
          <tr>
            <td width="241" valign="top" style="width:241px;font-size:0;line-height:0;">
              <img src="URL_FOTO_2" width="241" height="346" alt="ALT_REVIEW_2"
                   style="display:block;width:241px;height:346px;border-radius:16px 0 0 16px;background:#EFEFEF;">
            </td>
            <td width="299" valign="top" style="width:299px;background:#000000;border-radius:0 16px 16px 0;">
              <table role="presentation" width="299" cellpadding="0" cellspacing="0" border="0" style="width:299px;">
                <tr>
                  <td style="padding:40px 34px 49px 26px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:15px;letter-spacing:7px;color:#FFF8EE;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>
                    <div class="txt-wht" style="padding-top:27px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#FFFFFF;">
                      &ldquo;2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
                    </div>
                    <div class="txt-wht" style="padding-top:26px;padding-left:7px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;color:#FFFFFF;">
                      -Buyers Name 2 
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ REVIEW 3 ============ -->
    <tr>
      <td align="center" style="padding:48px 0 0 0;">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:540px;">
          <tr>
            <td width="241" valign="top" style="width:241px;font-size:0;line-height:0;">
              <img src="URL_FOTO_3" width="241" height="346" alt="ALT_REVIEW_3"
                   style="display:block;width:241px;height:346px;border-radius:16px 0 0 16px;background:#EFEFEF;">
            </td>
            <td width="299" valign="top" style="width:299px;background:#000000;border-radius:0 16px 16px 0;">
              <table role="presentation" width="299" cellpadding="0" cellspacing="0" border="0" style="width:299px;">
                <tr>
                  <td style="padding:40px 34px 49px 26px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:15px;letter-spacing:7px;color:#FFF8EE;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </div>
                    <div class="txt-wht" style="padding-top:27px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#FFFFFF;">
                      &ldquo; 3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
                    </div>
                    <div class="txt-wht" style="padding-top:26px;padding-left:7px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;color:#FFFFFF;">
                      -Buyers Name 3 
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- TÍTULO DA SEÇÃO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:97px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#000000;">
        SECTION TITLE HERE
      </td>
    </tr>


    <!-- CTA com sombra sólida -->
    <tr>
      <td align="center" style="padding:27px 0 80px 0;">
        <table role="presentation" width="447" cellpadding="0" cellspacing="0" border="0"
               style="width:447px;background:#000000;border-radius:10px;">
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="447" cellpadding="0" cellspacing="0" border="0"
                     style="width:447px;background:#FFFFFF;border:2px solid #000000;border-radius:10px;">
                <tr>
                  <td align="center" height="61" style="width:447px;height:61px;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:443px;height:57px;line-height:57px;font-family:Arial,Helvetica,sans-serif;font-size:27px;font-weight:700;color:#000000;text-decoration:none;text-align:center;">
                      SHOP NOW
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-956b9e76"></a>

### 5.5 · review 6 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | Boas-vindas, Newsletter, Lançamento |
| **Tons compatíveis** | Descontraído, Amigável, Educacional |
| **Tags** | light_bg, bordered_container, standalone_component, reviews, social_proof, testimonial_list, three_reviews, product_photo, divider_lines, horizontal_rules, no_card, star_rating, five_stars, black_stars, quote_text, buyer_name, single_cta, wide_tracking_cta, auto_width_button, no_mso_fallback, repeatable_blocks, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 7.3 KB |
| **ID** | `956b9e76-2c97-448e-bbfd-4a97f082e1dd` |

#### Descrição curta

Bloco de prova social para quando a loja precisa vender variedade de catálogo e não um produto único. Cada depoimento vem acompanhado do produto exato que o cliente comprou, então a seção funciona como prova social e vitrine ao mesmo tempo.  

#### Descrição detalhada

Título curto centralizado e três depoimentos empilhados em linhas idênticas de 598px: packshot vertical do produto à esquerda, coluna de texto centralizada à direita com régua de 5 estrelas, citação entre aspas e assinatura do cliente. Réguas horizontais pretas separam os depoimentos entre si, e um CTA sólido fecha a seção. A régua não aparece depois do terceiro depoimento — o CTA fecha o ritmo.  

Três mecanismos sustentam a seção:  

Um produto diferente por depoimento. A foto não ilustra o depoimento, ela é o SKU citado. É o que transforma três reviews em três oportunidades de compra sem virar grade de produtos.  
Coluna de texto centralizada verticalmente contra a foto. A foto tem altura fixa e o depoimento varia de 4 a 6 linhas; a centralização vertical mantém os três blocos alinhados sem ajuste manual. Medido na referência: os centros de texto e foto ficam a 8–14px um do outro nos três blocos, com o texto começando mais alto conforme cresce.  
Divisor como pausa, não como moldura. Uma régua preta curta e centralizada, sem card, sem fundo e sem borda. É o único elemento estrutural da seção.  

#### Contexto para a IA

##### Quando usar

Marca com catálogo de variantes do mesmo tipo de produto (molho, sabor, fragrância, cor) e review escrito por variante.  
Softsell de catálogo, welcome com prova social, reengajamento de base fria ou cross-sell pós-compra.  
Produto com embalagem vertical e rótulo legível — a foto tem 293px de altura e 155 de largura.  
Loja com voz informal, que pode publicar o review do cliente sem editar.  

##### Quando NÃO usar

Menos de três depoimentos com produtos distintos. Repetir o mesmo produto nas três linhas anula o mecanismo.  
Depoimentos curtos (menos de 3 linhas). A coluna fica vazia ao lado de uma foto de 293px e o bloco desmonta.  
Produto sem packshot vertical: peça de roupa, item plano, serviço, assinatura.  
E-mail que já tem grade de produtos — a seção já cumpre esse papel e as duas juntas viram catálogo repetido.  
Marca de posicionamento sóbrio ou clínico. A variante depende de exagero e entusiasmo no texto do cliente.  

##### Orientações de copy para a IA

Um produto por depoimento, todos diferentes. Escolher reviews que citem variantes distintas do catálogo.  
Preservar o texto do cliente na íntegra, incluindo gíria, erro de pontuação e falta de vírgula. Não reescrever para "ficar limpo".  
Preservar a quebra de linha do review original quando ela existir. Na referência o terceiro depoimento abre com uma palavra isolada em linha própria, e é isso que dá o tom.  
Assinatura sempre abreviada: hífen + primeiro nome + inicial do sobrenome. Nunca nome completo, nunca @usuário.  
Título da seção em duas palavras, qualificando o depoimento pela categoria do produto. Não usar fórmula genérica do tipo "o que nossos clientes dizem".  
Sem selo de credencial nesta variante. Se a loja precisa de "compra verificada", usar outra variante de prova social.  
CTA aponta para o catálogo, não para um produto — a seção acabou de mostrar três.  

##### Design system

Container: 600px travado, fundo branco, sem borda.  

Tipografia principal: sans geométrica de peso alto para título e assinatura; o mesmo desenho, em regular, para a citação. Não há tipografia secundária. O template substitui por Arial, Helvetica, sans-serif como fallback web-safe.  

| Bloco | Tamanho / entrelinha | Peso | Alinhamento |  
|---|---|---|---|  
| Título da seção | 40 / 36 | 700 | Centralizado, ALTA |  
| Régua de estrelas | régua de 229 × 41 | — | Centralizado |  
| Citação | 22 / 26 | 400 | Centralizado |  
| Assinatura | 22 / 27 | 700 | Centralizado |  
| Label do CTA | 24 | 700 | Centralizado, ALTA, tracking 0.25em |  

Cores. Cor primária   
#000000 (título, citação, assinatura, divisor). Cor secundária   
#FFFFFF (fundo). Cor de acento   
#FEB801 — aplicada exclusivamente ao fundo do CTA, com label preto. É o único elemento colorido da seção fora das fotos.  

Grade e ritmo vertical (medido, normalizado para container de 600px):  

título da seção        centralizado, 1 linha  
   ↓ 91px  
DEPOIMENTO 1  linha de 598px — coluna foto 222px | coluna texto 376px  
              foto 155 × 293 (x 67–221) · texto centralizado vertical contra a foto  
              estrelas ↓30 citação ↓31 assinatura  
   ↓ 37px (medido a partir da BASE DA FOTO, não do texto)  
divisor        365 × 3, centralizado  
   ↓ 52px  
DEPOIMENTO 2  idêntico  
   ↓ 37px  
divisor        365 × 3  
   ↓ 59px  
DEPOIMENTO 3  idêntico, sem divisor depois  
   ↓ 38px  
CTA            201 × 48, fundo #FEB801, label preto  

Regras que não podem ser quebradas:  

Zero border-radius, zero sombra, zero gradiente, zero card, zero borda.  
A coluna de texto é centralizada verticalmente contra a foto (valign="middle"), nunca alinhada ao topo com padding fixo. É isso que faz depoimentos de 4 e de 6 linhas conviverem.  
O espaçamento até o divisor é medido a partir da base da foto, que é sempre o elemento mais alto da linha.  
Não existe divisor depois do último depoimento.  
As três fotos usam o mesmo slot, a mesma luz e o mesmo enquadramento. Variação entre elas quebra o ritmo da pilha.  
Todo o texto da coluna é centralizado — estrelas, citação e assinatura no mesmo eixo.  
display:block em toda <img> e célula da foto com font-size:0;line-height:0.  

##### Direção fotográfica

Packshot vertical do produto recortado em fundo branco puro (  
#FFFFFF), sem sombra projetada, sem superfície e sem cenário.  

Enquadramento: produto de frente, eixo vertical, rótulo inteiramente legível e centralizado no recorte. Sem rotação, sem perspectiva, sem inclinação.  
Escala: o produto ocupa 95–100% da altura do slot e é a altura que padroniza a pilha — as três fotos precisam terminar praticamente na mesma linha de base.  
Luz: difusa e frontal, alto-chave, com sombra própria suave nas laterais para separar a embalagem do branco. Sem realce especular no vidro, sem reflexo de softbox.  
Cor: a cor vem do rótulo do produto, não de tratamento. Sem filtro, sem viragem, sem saturação empurrada.  
Proibições: mão segurando, prato ou comida na cena, fundo colorido, sombra dura no chão, reflexo espelhado embaixo, moldura, recorte com halo cinza, produto deitado.  

#### Schema de output (10 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `testimonials_headline` | `{{TESTIMONIALS_HEADLINE}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `testimonial_1_author` | `{{TESTIMONIAL_1_AUTHOR}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `testimonial_2_quote` | `{{TESTIMONIAL_2_QUOTE}}` | Texto curto | Copy (n8n) | não | 215 | não |
| `testimonial_2_author` | `{{TESTIMONIAL_2_AUTHOR}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `testimonial_3_quote` | `{{TESTIMONIAL_3_QUOTE}}` | Texto curto | Copy (n8n) | não | 215 | não |
| `testimonial_3_author` | `{{TESTIMONIAL_3_AUTHOR}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `testimonials_cta_label` | `{{TESTIMONIALS_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `testimonial_1_product` | `{{TESTIMONIAL_1_PRODUCT}}` | Imagem | Imagem gerada | não | — | — |
| `testimonial_2_product` | `{{TESTIMONIAL_2_PRODUCT}}` | Imagem | Imagem gerada | não | — | — |
| `testimonial_3_product` | `{{TESTIMONIAL_3_PRODUCT}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`testimonials_headline`**
    - *Exemplo:* Spicy Testimonials
- **`testimonial_1_author`**
    - *Exemplo:* -Buyer Name 1
- **`testimonial_2_quote`**
    - *Exemplo:* “2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor lorem”
- **`testimonial_2_author`**
    - *Exemplo:* -Buyer Name 2
- **`testimonial_3_quote`**
    - *Exemplo:* “ 3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor lorem”
- **`testimonial_3_author`**
    - *Exemplo:* -Buyer Name 3
- **`testimonials_cta_label`**
    - *Exemplo:* Explore More
- **`testimonial_1_product`**
    - *Orientação:* Onde: coluna esquerda do primeiro depoimento, com 67px de branco até a borda do container.
    - *Imagem:* proporção 9:16 · 165 × 293 px
    - *Spec da imagem:* Como gerar: gerar em 9:16 direto em 330 × 586. Sem corte — o packshot medido ocupa 155px de largura e sobra branco invisível nas laterais.<br>Ideia: packshot frontal da variante de produto citada no depoimento 1, recortada em branco, rótulo legível, altura cheia do slot.
- **`testimonial_2_product`**
    - *Orientação:* Onde: coluna esquerda do segundo depoimento.
    - *Imagem:* proporção 9:16 · 165 × 293 px
    - *Spec da imagem:* Como gerar: idêntico ao slot 1.<br>Ideia: variante diferente da do slot 1, mesma luz e mesmo enquadramento, terminando na mesma linha de base.
- **`testimonial_3_product`**
    - *Orientação:* Onde: coluna esquerda do terceiro depoimento.
    - *Imagem:* proporção 9:16 · 165 × 293 px
    - *Spec da imagem:* Como gerar: idêntico ao slot 1.<br>Ideia: terceira variante do catálogo, de preferência a de rótulo mais claro, para fechar a pilha com contraste.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Spicy Testimonials</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:58px 60px 0 60px;font-family:Arial,Helvetica,sans-serif;font-size:40px;line-height:36px;font-weight:700;color:#000000;">
        SPICY TESTIMONIALS
      </td>
    </tr>


    <!-- ============ DEPOIMENTO 1 ============ -->
    <tr>
      <td style="padding:52px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td width="222" valign="top" style="width:222px;padding:0 0 0 46px;font-size:0;line-height:0;">
              <img src="URL_FOTO_1" width="176" height="341" alt="ALT_DEPOIMENTO_1"
                   style="display:block;width:176px;height:341px;background:#EFEFEF;">
            </td>
            <td width="376" valign="top" style="width:376px;padding:78px 46px 0 21px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:27px;line-height:27px;letter-spacing:13px;text-indent:13px;color:#000000;text-align:center;">
                &#9733;&#9733;&#9733;&#9733;&#9733;
              </div>
              <div class="txt-blk" style="padding-top:25px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;text-align:center;">
                &ldquo; 1Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor lorem&rdquo;
              </div>
              <div class="txt-blk" style="padding-top:25px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:700;color:#000000;text-align:center;">
                -Buyer Name 1
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- DIVISOR 1 -->
    <tr>
      <td align="center" style="padding:59px 0 0 0;font-size:0;line-height:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:383px;">
          <tr><td height="5" style="width:383px;height:5px;background:#000000;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>


    <!-- ============ DEPOIMENTO 2 ============ -->
    <tr>
      <td style="padding:41px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td width="222" valign="top" style="width:222px;padding:0 0 0 46px;font-size:0;line-height:0;">
              <img src="URL_FOTO_2" width="176" height="341" alt="ALT_DEPOIMENTO_2"
                   style="display:block;width:176px;height:341px;background:#EFEFEF;">
            </td>
            <td width="376" valign="top" style="width:376px;padding:78px 46px 0 21px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:27px;line-height:27px;letter-spacing:13px;text-indent:13px;color:#000000;text-align:center;">
                &#9733;&#9733;&#9733;&#9733;&#9733;
              </div>
              <div class="txt-blk" style="padding-top:25px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;text-align:center;">
                &ldquo;2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor lorem&rdquo;
              </div>
              <div class="txt-blk" style="padding-top:25px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:700;color:#000000;text-align:center;">
                -Buyer Name 2 
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- DIVISOR 2 -->
    <tr>
      <td align="center" style="padding:73px 0 0 0;font-size:0;line-height:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:383px;">
          <tr><td height="5" style="width:383px;height:5px;background:#000000;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>


    <!-- ============ DEPOIMENTO 3 ============ -->
    <tr>
      <td style="padding:51px 0 0 0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td width="222" valign="top" style="width:222px;padding:0 0 0 46px;font-size:0;line-height:0;">
              <img src="URL_FOTO_3" width="176" height="341" alt="ALT_DEPOIMENTO_3"
                   style="display:block;width:176px;height:341px;background:#EFEFEF;">
            </td>
            <td width="376" valign="top" style="width:376px;padding:78px 46px 0 21px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:27px;line-height:27px;letter-spacing:13px;text-indent:13px;color:#000000;text-align:center;">
                &#9733;&#9733;&#9733;&#9733;&#9733;
              </div>
              <div class="txt-blk" style="padding-top:25px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:400;color:#000000;text-align:center;">
                &ldquo; 3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor lorem&rdquo;
              </div>
              <div class="txt-blk" style="padding-top:25px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:27px;font-weight:700;color:#000000;text-align:center;">
                -Buyer Name 3 
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:59px 0 78px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:329px;">
          <tr>
            <td align="center" height="67" style="width:329px;height:67px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:329px;height:67px;line-height:67px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;letter-spacing:0.25em;text-indent:0.25em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                Explore More
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-a8468e9f"></a>

### 5.6 · review 7 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | cream_bg, bordered_container, standalone_component, reviews, social_proof, hybrid_reviews, three_reviews, polaroid_image, photos_as_image, review_cards, cream_cards, paper_texture_fallback, avatar_initial, initial_circle, star_rating, five_stars, amber_stars, verified_badge, blue_checkmark, per_review_cta, final_cta, full_width_button, no_mso_fallback, repeatable_blocks, mobile_responsive, mobile_safe |
| **Tamanho do HTML** | 9.3 KB |
| **ID** | `a8468e9f-c8d8-4c71-b416-6a4f6f5ca0f9` |

#### Descrição curta

Bloco de prova social em zigue-zague. Três depoimentos de compradores verificados, cada um com uma foto de produto que troca de lado a cada review, fechando com cupom e CTA. Momento de uso: meio ou fim de e-mail de consideração com oferta ativa, quando o argumento é atributo de produto confirmado por quem já usa.  

#### Descrição detalhada

Título centralizado; abaixo, três faixas de 451px cada, uma por review; no fim, a linha do cupom e o CTA de largura quase total.  

Quatro mecanismos definem a variante:  

A foto é imagem de fundo da faixa, não um <img> em coluna. Cada ativo tem 598 × 451px e já contém a composição inteira: o recorte fotográfico de um lado e a área lisa do outro. O texto é sobreposto por padding assimétrico. Isso muda a produção — não existe "foto do review" recortada, existe a faixa inteira.  

Alternância esquerda / direita / esquerda. A foto troca de lado no review do meio. O zigue-zague é o que dá ritmo ao empilhamento e distingue esta variante das seções de cards, onde todos os reviews têm a mesma orientação.  

Selo de comprador verificado em linha com o nome. Nome, espaçador de 10px, selo de 18px, espaçador de 6px, rótulo. Os espaçadores são fixos e white-space:nowrap impede a linha de quebrar. É a validação da variante — sem o selo, é depoimento sem procedência.  

Cupom e CTA fecham o bloco. Diferente das outras seções de prova social, esta termina em conversão com oferta: a linha do cupom vem em bold logo acima do botão.  

#### Contexto para a IA

##### Quando usar

Consideração com oferta ativa — quando há cupom para entregar no fim do bloco.  
Quando o argumento é atributo de produto confirmado no uso: tecido, durabilidade, caimento, praticidade.  
Uniformes, activewear, moda funcional, calçado, casa, pet.  
Quando existem reviews de plataforma com selo de compra verificada.  
Quando as fotos podem ser produzidas já compostas em 598 × 451px, com metade livre para o texto.  

##### Quando NÃO usar

Sem selo de compra verificada — o mecanismo central fica vazio.  
Sem oferta — o bloco termina em cupom e CTA; sem eles, fecha no vazio.  
Fotos recortadas em coluna — a variante exige o ativo composto de faixa inteira. Se o acervo só tem recortes verticais, use uma seção de cards.  
Menos de três reviews — a alternância precisa dos três para formar o zigue-zague.  
Carrinho, checkout, transacional, topo de e-mail.  
Depoimento longo — o padding assimétrico deixa só 245px de largura útil.  

##### Orientações de copy para a IA

Título — o atributo validado em caixa alta, curto ("VET-APPROVED SCRUBS"). Diz quem aprova ou o que o produto resolve, não a marca.  

Depoimentos — fala em primeira pessoa focada em um atributo por review: o do primeiro fala do tecido, o do segundo da praticidade, o do terceiro do conforto em uso prolongado. Citar a situação profissional ou de rotina. Os três não podem repetir o mesmo atributo.  

Nomes — nome e sobrenome, ou só o primeiro nome. Caixa mista.  

Rótulo de verificação — texto fixo por loja ("Verified Buyer", "Compra verificada"). Não é copy variável por review.  

Linha do cupom — instrução com o código, em bold, uma linha.  

CTA — verbo + valor da oferta. Aqui repetir o desconto no botão é o padrão: o cupom já foi dito acima e o botão fecha.  

Proibições: três depoimentos sobre o mesmo atributo · rótulo de verificação variando entre reviews · depoimento acima do limite de caracteres · cargo ou credencial nos nomes · segundo botão · CTA dentro da faixa do review.  

##### Design system

Container 600px fixo, borda 1px   
#000000 opcional (flag has_border). Zero raio, zero sombra, zero gradiente aplicado por CSS.  

Estrutura  

| # | Elemento | Padding-top | Dimensão |  
|---|---|---|---|  
| 1 | Título | 59px | 34/33px bold, tracking +0.05em, caixa alta |  
| 2 | Review 1 — foto à esquerda | 49px | Faixa de 598 × 451px |  
| 3 | Review 2 — foto à direita | 44px | Faixa de 598 × 451px |  
| 4 | Review 3 — foto à esquerda | 44px | Faixa de 598 × 451px |  
| 5 | Linha do cupom | 62px | 22/25px bold |  
| 6 | CTA | 18px | 556 × 58px, com 30px de respiro na base |  

Sobreposição do texto na faixa  

| Review | Padding do bloco de texto | Largura útil |  
|---|---|---|  
| 1 e 3 (foto à esquerda) | 103px topo · 41px direita · 312px esquerda | 245px |  
| 2 (foto à direita) | 128px topo · 334px direita · 19px esquerda | 245px |  

Assinatura 25px abaixo do depoimento: nome · espaçador 10px · selo 18 × 18px · espaçador 6px · rótulo. Todos os textos com white-space:nowrap.  

Paleta — três cores.  

| Papel | Hex (referência) | Uso |  
|---|---|---|  
| Cor primária |  |  |  
| #373737 | Título e depoimentos — cinza escuro, nunca preto |  |  
| Cor secundária |  |  |  
| #000000 | Nome do comprador e selo |  |  
| Acento |  |  |  
| #658A68 | Fundo do CTA, com label branco |  |  

O nome é a única coisa em preto puro no bloco; o depoimento é cinza. A diferença de valor é o que separa fala de assinatura sem precisar de peso ou tamanho.  

Pele alternativa (HTML base): CTA preto sem cor de acento. Usar quando a marca não tem cor definida.  

Tipografia. Principal: Arial → Helvetica em todos os slots. Título 34px bold em caixa alta com tracking; depoimento 22/25px regular; nome e rótulo 18/21px regular; cupom 22px bold; CTA 25px bold com tracking +0.15em e text-indent compensando. Secundária não existe.  

Implementação. Cada faixa usa background no <td> + background-image inline com background-position: left <padding-top> e background-size:598px 451px, mais bloco VML v:rect/v:fill type="frame" para Outlook. height fixo de 451px na célula. A linha da assinatura é uma <table> com <td> espaçadores de largura fixa — não usar margin entre elementos inline, que o Outlook ignora. Selo como <img> de 18px com alt vazio: é decorativo, o rótulo textual ao lado já carrega o significado. Hacks u + .body .txt-gry e u + .body .txt-blk.  

Tags: PREHEADER, SECTION_TITLE, REVIEW_N_IMAGE_URL, REVIEW_N_QUOTE, REVIEW_N_NAME, VERIFIED_LABEL, VERIFIED_BADGE_URL, COUPON_LINE, COUPON_CODE, CTA_LABEL, CTA_URL.  

Erros que quebram o padrão: três reviews com a foto do mesmo lado · foto entregue como recorte em coluna em vez de faixa composta · texto invadindo a metade da foto · nome e depoimento na mesma cor · selo sem o rótulo textual ao lado · quebra de linha na assinatura · CTA dentro da faixa · botão com raio.  

##### Direção fotográfica

Proporção 4:3 — slot de 598 × 451px, ativo final 1196 × 902px (2x). JPG q80 ou WebP, < 200 KB por faixa. Gerar em 4:3 a 1204 × 903 e cortar 8px de largura, 4px de cada lado.  

Regra crítica: cada ativo é a faixa inteira composta, não um recorte de produto. Metade do quadro é o recorte fotográfico; a outra metade é superfície lisa e clara que vai receber o texto. A divisão é vertical e reta, sem degradê na emenda.  

Lado da foto: review 1 à esquerda, review 2 à direita, review 3 à esquerda. Produzir cada ativo já espelhado — não confiar em background-position para inverter.  

Composição. Recorte fechado do produto vestido: detalhe de peça, meio corpo, ou corpo parcial cortado pelas bordas. O enquadramento é vertical dentro da metade que ocupa. Fundo do recorte claro e neutro, próximo ao da metade lisa.  

Luz. Estúdio difuso, contraste baixo, sombras suaves. A metade lisa precisa de luminância acima de 88% para o cinza   
#373737 do texto assentar.  

Os três recortes precisam mostrar partes diferentes: um detalhe de tecido ou acabamento, um corpo inteiro ou meio corpo, um recorte de outra peça da linha. Três enquadramentos iguais anulam o efeito.  

Proibições: faixa entregue sem a metade lisa · emenda em degradê · fundo escuro ou saturado · texto/preço/selo queimado (exceto o selo de atributo, quando houver) · foto no lado errado do quadro · três recortes com o mesmo enquadramento · marca d'água.  

Adaptação por categoria — o que é o recorte:  

| Categoria | Recorte |  
|---|---|  
| Uniforme / activewear | Detalhe de bolso e tecido, meio corpo, calça e calçado |  
| Moda | Caimento, aviamento, look completo |  
| Calçado | Solado, pé calçado em pé, par lado a lado |  
| Casa | Textura do material, item no ambiente, detalhe de acabamento |  
| Pet | Coleira no animal, detalhe de fecho, animal em uso |  
| Beleza | Textura na pele, aplicador, embalagem em mão |  

#### Schema de output (13 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `section_title` | `{{SECTION_TITLE}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `review_1_quote` | `{{REVIEW_1_QUOTE}}` | Texto curto | Copy (n8n) | não | 156 | não |
| `review_1_name` | `{{REVIEW_1_NAME}}` | Texto curto | Copy (n8n) | não | 22 | não |
| `review_2_quote` | `{{REVIEW_2_QUOTE}}` | Texto curto | Copy (n8n) | não | 156 | não |
| `review_2_name` | `{{REVIEW_2_NAME}}` | Texto curto | Copy (n8n) | não | 22 | não |
| `review_3_quote` | `{{REVIEW_3_QUOTE}}` | Texto curto | Copy (n8n) | não | 156 | não |
| `review_3_name` | `{{REVIEW_3_NAME}}` | Texto curto | Copy (n8n) | não | 22 | não |
| `coupon_line` | `{{COUPON_LINE}}` | Texto curto | Copy (n8n) | não | 44 | sim |
| `cta_label` | `{{CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `review_1_band` | `{{REVIEW_1_BAND}}` | Imagem | Imagem gerada | não | — | — |
| `review_2_band` | `{{REVIEW_2_BAND}}` | Imagem | Imagem gerada | não | — | — |
| `review_3_band` | `{{REVIEW_3_BAND}}` | Imagem | Imagem gerada | não | — | — |
| `verified_badge` | `{{VERIFIED_BADGE}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`section_title`**
    - *Exemplo:* SECTION TITLE
    - *Orientação:* Caixa alta, o atributo validado
- **`review_1_quote`**
    - *Exemplo:* “ 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
    - *Orientação:* Entre aspas, um atributo só
- **`review_1_name`**
    - *Exemplo:* Buyer Name	 		 	1
    - *Orientação:* Caixa mista, sem cargo
- **`review_2_quote`**
    - *Exemplo:* “ 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
    - *Orientação:* Atributo diferente do review 1
- **`review_2_name`**
    - *Exemplo:* Buyer Name	 		 	2
    - *Orientação:* Caixa mista, sem cargo
- **`review_3_quote`**
    - *Exemplo:* “3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
    - *Orientação:* Atributo diferente dos anteriores
- **`review_3_name`**
    - *Exemplo:* Buyer Name	 		 	3
    - *Orientação:* Caixa mista, sem cargo
- **`coupon_line`**
    - *Exemplo:* Use code CODE at checkout
    - *Orientação:* Bold, uma linha, com o código
- **`cta_label`**
    - *Exemplo:* SHOP NOW
    - *Orientação:* Caixa alta, verbo + valor da oferta
- **`review_1_band`**
    - *Orientação:* Onde fica: faixa do review 1, imagem de fundo da célula inteira. Foto à esquerda, texto sobreposto à direita.
    - *Imagem:* proporção 4:3 · 598 × 451 px
    - *Spec da imagem:* Proporção: 4:3. Slot de 598 × 451px. Ativo final 1196 × 902px (2x), JPG q80 ou WebP, < 200 KB. Gerar em 4:3 a 1204 × 903 e cortar 8px de largura.<br>Ideia: banner dividido ao meio na vertical. Metade esquerda com recorte fechado de detalhe — tecido, bolso, acabamento — cortado pelas bordas. Metade direita lisa e muito clara, luminância acima de 88%, sem objeto nem sombra, para receber o texto. Emenda reta, luz de estúdio difusa.
- **`review_2_band`**
    - *Orientação:* Onde fica: faixa do review 2. Foto à direita, texto sobreposto à esquerda.
    - *Imagem:* proporção 4:3 · 598 × 451 px
    - *Spec da imagem:* Proporção: 4:3. Slot de 598 × 451px. Ativo final 1196 × 902px (2x), JPG q80 ou WebP, < 200 KB.<br>Ideia: mesma divisão, espelhada. Metade direita com figura em meio corpo ou corpo parcial vestindo o produto, em pé e cortada pelas bordas — é o quadro mais aberto dos três. Metade esquerda lisa e clara para o texto. Entregar já espelhado no arquivo.
- **`review_3_band`**
    - *Orientação:* Onde fica: faixa do review 3. Foto à esquerda, texto sobreposto à direita.
    - *Imagem:* proporção 4:3 · 598 × 451 px
    - *Spec da imagem:* Proporção: 4:3. Slot de 598 × 451px. Ativo final 1196 × 902px (2x), JPG q80 ou WebP, < 200 KB.<br>Ideia: metade esquerda com outra peça da linha em recorte parcial — calça e calçado, segunda cor, complemento do conjunto mostrado no slot 1. Fecha o trio sem repetir enquadramento. Metade direita lisa e clara.
- **`verified_badge`**
    - *Orientação:* Onde fica: canto superior da metade lisa de cada faixa, no lado oposto à foto.
    - *Imagem:* proporção 1:1 · 44 × 44 px
    - *Spec da imagem:* Proporção: 1:1. Slot de 44 × 44px. Ativo final 88 × 88px (2x), PNG transparente.<br>Ideia: selo de atributo do produto em line-art — origem, material, certificação. Aparece no export de referência ("PLANT BASED") e não existe no template base; se usado, entra nos três reviews, sempre no mesmo canto relativo.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Reviews com comprador verificado</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-gry { color:#373737 !important; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-gry" style="padding:59px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:33px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#373737;">
        SECTION TITLE
      </td>
    </tr>


    <!-- ============ REVIEW 1 — foto à esquerda ============ -->
    <tr>
      <td height="451" valign="top"
          background="URL_FOTO_1"
          style="height:451px;padding-top:49px;background-color:#FFFFFF;background-image:url('URL_FOTO_1');background-position:left 49px;background-repeat:no-repeat;background-size:598px 451px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:451px;">
          <v:fill type="frame" src="URL_FOTO_1" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td style="padding:103px 41px 0 312px;">
              <div class="txt-gry" style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:400;color:#373737;">
                &ldquo; 1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;">
                <tr>
                  <td valign="middle" class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;color:#000000;white-space:nowrap;">Buyer Name</td>
                  <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-size:0;line-height:0;"><img src="URL_SELO_VERIFICADO" width="18" height="18" alt="" style="display:block;width:18px;height:18px;"></td>
                  <td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;color:#0B0A07;white-space:nowrap;"> 1 Verified Buyer</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td height="152" style="height:152px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>


    <!-- ============ REVIEW 2 — foto à direita ============ -->
    <tr>
      <td height="451" valign="top"
          background="URL_FOTO_2"
          style="height:451px;padding-top:44px;background-color:#FFFFFF;background-image:url('URL_FOTO_2');background-position:left 44px;background-repeat:no-repeat;background-size:598px 451px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:451px;">
          <v:fill type="frame" src="URL_FOTO_2" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td style="padding:128px 334px 0 19px;">
              <div class="txt-gry" style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:400;color:#373737;">
                &ldquo; 2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;">
                <tr>
                  <td valign="middle" class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;color:#000000;white-space:nowrap;">Buyer Name</td>
                  <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-size:0;line-height:0;"><img src="URL_SELO_VERIFICADO" width="18" height="18" alt="" style="display:block;width:18px;height:18px;"></td>
                  <td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;color:#0B0A07;white-space:nowrap;"> 2 Verified Buyer</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td height="127" style="height:127px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>


    <!-- ============ REVIEW 3 — foto à esquerda ============ -->
    <tr>
      <td height="451" valign="top"
          background="URL_FOTO_3"
          style="height:451px;padding-top:44px;background-color:#FFFFFF;background-image:url('URL_FOTO_3');background-position:left 44px;background-repeat:no-repeat;background-size:598px 451px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:451px;">
          <v:fill type="frame" src="URL_FOTO_3" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td style="padding:103px 41px 0 312px;">
              <div class="txt-gry" style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:400;color:#373737;">
                &ldquo;3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;">
                <tr>
                  <td valign="middle" class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;color:#000000;white-space:nowrap;">Buyer Name</td>
                  <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-size:0;line-height:0;"><img src="URL_SELO_VERIFICADO" width="18" height="18" alt="" style="display:block;width:18px;height:18px;"></td>
                  <td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:21px;color:#0B0A07;white-space:nowrap;"> 3 Verified Buyer</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td height="152" style="height:152px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>


    <!-- CUPOM -->
    <tr>
      <td align="center" class="txt-blk" style="padding:62px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:700;color:#000000;">
        Use code CODE at checkout
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td align="center" style="padding:18px 21px 30px 21px;">
        <table role="presentation" width="556" cellpadding="0" cellspacing="0" border="0" style="width:556px;">
          <tr>
            <td align="center" height="58" style="width:556px;height:58px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:556px;height:58px;line-height:58px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.15em;text-indent:0.15em;color:#FFFFFF;text-decoration:none;text-align:center;">
                SHOP NOW
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-d92f812f"></a>

### 5.7 · review 8 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Reviews / Prova Social (`reviews`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | gray_bg, bordered_container, standalone_component, reviews, social_proof, product_showcase, hybrid_reviews_products, four_products, zigzag_layout, alternating_image_side, last_full_width, star_rating, five_stars, black_stars, review_count, benefit_pills, capsule_pills, two_benefits_each, benefit_icon, per_product_cta, custom_font_fallback, no_mso_fallback, no_price, repeatable_blocks, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 97.7 KB |
| **ID** | `d92f812f-d83e-4e82-99a6-11286eba0e07` |

#### Descrição curta

Bloco de prova social para marca de comunidade, onde a conversão vem de identificação com quem já usa e não com o produto. Usa foto de cliente real, selo de compra verificada e um CTA por depoimento para levar cada leitor ao item que ele viu na foto.  

#### Descrição detalhada

Título centralizado em duas linhas seguido de três depoimentos empilhados. Cada depoimento é uma composição de duas camadas: fotos de cliente montadas como polaroids giradas, sobrepostas e sangrando pelas duas bordas do container, e por cima delas um cartão de papel rasgado de altura fixa com avatar de inicial, selo de verificação, régua de estrelas, nome, depoimento e CTA próprio. Fecha com um CTA final de largura maior e cor diferente.  

Quatro mecanismos sustentam a seção:  

Foto de cliente, não de produto. As imagens são fotos enviadas pelo comprador, com a peça vestida em contexto real. É o mecanismo central: a prova é a pessoa, não o packshot.  
Montagem de polaroid girada e sangrada. Cada foto tem moldura branca, sombra suave e rotação de 2° a 5° em sentidos opostos, e ultrapassa as duas bordas do container. O recorte pelo limite de 600px é o que dá a aparência de foto solta em cima da mesa.  
Cartão de papel de altura fixa. O bloco de papel mede sempre 464 × 387 e sobrepõe o terço inferior das fotos. A altura não cresce com o texto — o depoimento tem que caber, e é isso que limita a copy a 5 ou 6 linhas.  
CTA por depoimento. Cada card tem seu próprio botão apontando para o item daquele review, e o CTA final, maior e em outra cor, aponta para a loja inteira.  

#### Contexto para a IA

##### Quando usar

Marca de comunidade ou de nicho identitário (fé, esporte, causa, fandom), onde o cliente posta a peça em uso.  
Loja com acervo de UGC real — foto enviada pelo comprador, não campanha produzida.  
Reviews longos e emocionais, que falam de pertencimento e não de especificação técnica.  
Catálogo com três categorias distintas para linkar (camiseta, moletom, acessório na referência).  

##### Quando NÃO usar

Sem UGC autorizado. A seção inteira depende de foto de pessoa real; substituir por foto de estúdio derruba o mecanismo.  
Marca de posicionamento premium, minimalista ou clínico. Papel rasgado, polaroid girada e selo azul são deliberadamente informais.  
Reviews curtos ou técnicos. Menos de 4 linhas deixa o cartão de altura fixa com um vazio embaixo do texto.  
E-mail curto ou com pressa: a seção tem quase 2500px de altura, é uma peça inteira, não um bloco de apoio.  
Loja de produto único — os três CTAs por depoimento não teriam para onde apontar.  

##### Orientações de copy para a IA

Preservar o depoimento na íntegra, com erro de digitação, caixa baixa no meio da frase, gíria e excesso de exclamação. Na referência há um "(i'm wearing it rn)" e um "HWLF!!!" — é isso que autentica.  
Cada depoimento sobre um produto diferente, e o CTA daquele card aponta para o produto citado.  
Título fala do cliente, não da marca: o que a pessoa está fazendo ao usar a peça. Duas linhas, caixa alta.  
Nome sempre só o primeiro nome, sem sobrenome e sem inicial. A inicial já aparece no avatar.  
Selo de credencial fixo e igual nos três ("Verified" / "Compra verificada"). É texto de sistema, não copy.  
Limite rígido de 6 linhas no depoimento: o cartão não cresce. Se o review original for maior, cortar pelo fim mantendo a frase de fechamento emocional.  
CTA de card curto e igual nos três; CTA final carrega o nome da marca.  

##### Design system

Container: 600px travado. Fundo em gradiente vertical sutil de verde-sálvia claro (  
#F1F3E8 no topo →   
#E3EADA no meio →   
#FAF9F4 na base) — não é branco chapado.  

Tipografia principal: sans humanista de peso alto (perfil Asap/Inter) em todos os blocos. Não há tipografia secundária. O template substitui por Arial, Helvetica, sans-serif.  

| Bloco | Tamanho / entrelinha | Peso | Caixa |  
|---|---|---|---|  
| Título da seção | 40 / 46 | 700 | ALTA, centralizado |  
| Inicial do avatar | ~40 | 700 | ALTA |  
| Régua de estrelas | régua de 152 × 25 | — | ★ ×5 |  
| Selo de verificação | ~17 dentro de chip 85 × 25 | 700 | Sentença |  
| Nome | ~24 | 700 | Sentença |  
| Depoimento | 22 / 23 | 400 | Sentença |  
| Label dos CTAs | ~20 | 700 | ALTA |  

Cores. Cor primária   
#0B0A07 (título, nome, depoimento — praticamente preto, não cinza). Cor secundária   
#FFFFFF (moldura das polaroids e label dos CTAs de card). Três acentos com função fixa:   
#F3B137 nas estrelas,   
#009CCD no chip de verificação,   
#859274 no CTA de cada depoimento. O CTA final usa   
#FAAFCE com label preto. Papel do cartão em bege texturizado   
#E5D9C9.  

Grade e ritmo vertical (medido):  

título (2 linhas)          centralizado  
   ↓ 22px  
REVIEW 1   fotos: 2 polaroids giradas, sangrando x=0 e x=599  
           cartão de papel 464 × 387 (x 65–528), sobrepondo o terço inferior das fotos  
             +32  avatar 79 × 79 (x 108)  
             +36  estrelas 152 × 25 (x 215)  
             +78  chip "Verified" 85 × 25 + nome ao lado  
             +136 depoimento — 5 a 6 linhas, x 108–500, entrelinha 23  
             CTA 327 × 59 (x 136), ancorado ~40px acima da base do cartão  
   ↓ 75px  
REVIEW 2   idêntico  
   ↓ 84px  
REVIEW 3   uma foto só, sem moldura e quase sem giro; mesmo cartão  
   ↓ 73px  
CTA FINAL  495 × 59 (x 52), fundo #FAAFCE, label preto  
   ↓ 96px  

Regras que não podem ser quebradas:  

O cartão de papel tem altura fixa (387). O texto se adapta ao cartão, nunca o contrário.  
As fotos sangram pelas duas bordas do container e são recortadas pelo limite de 600px. Contê-las dentro da largura anula o efeito.  
Rotações sempre em sentidos opostos entre as duas fotos do mesmo review, entre 2° e 5°. Nunca alinhar ao eixo.  
Todos os botões têm borda preta de 1px e raio de 5px. Os CTAs de card são verdes e iguais entre si; o CTA final é maior e de outra cor.  
Cada acento tem um dono: dourado é estrela, azul é verificação, verde é CTA de card, rosa é CTA final. Nenhum deles aparece em outro lugar.  
O texto do depoimento é preto, não cinza. O cinza tira a legibilidade contra o papel bege.  
O avatar carrega a inicial do nome e o selo circular de check no canto inferior direito — os dois juntos, sempre.  

##### Direção fotográfica

Foto enviada pelo cliente, não produzida. É o único bloco do arsenal em que grão, enquadramento torto e luz irregular são desejáveis.  

Cena: ambiente real e cotidiano — praia, cafeteria, campo, rua. Nunca fundo infinito ou estúdio.  
Pessoa: corpo inteiro ou três quartos, de costas, de lado ou com o rosto parcialmente cortado. A peça é o assunto; a identificação vem da postura, não do rosto.  
Peça: vestida e legível — estampa, cor e caimento reconhecíveis à distância de miniatura.  
Luz: natural, hora do dia qualquer, com estouro e sombra dura permitidos.  
Par de fotos: as duas do mesmo review mostram o mesmo produto em ângulos diferentes (frente e costas, ou perto e longe). Não usar duas fotos quase idênticas.  
Tratamento: moldura branca de ~12px em volta, sombra suave difusa embaixo, rotação leve. Sem filtro, sem viragem de cor, sem borda preta.  
Proibições: foto de banco de imagem, modelo profissional posando, packshot em fundo branco, colagem com texto sobreposto, marca d'água de rede social.  

#### Schema de output (18 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `reviews_headline` | `{{REVIEWS_HEADLINE}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `review_1_name` | `{{REVIEW_1_NAME}}` | Texto curto | Copy (n8n) | não | 14 | — |
| `review_1_initial` | `{{REVIEW_1_INITIAL}}` | Texto curto | Copy (n8n) | não | 1 | sim |
| `review_1_body` | `{{REVIEW_1_BODY}}` | Texto curto | Copy (n8n) | não | 210 | não |
| `review_1_cta_label` | `{{REVIEW_1_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 16 | não |
| `review_2_name` | `{{REVIEW_2_NAME}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `review_2_initial` | `{{REVIEW_2_INITIAL}}` | Texto curto | Copy (n8n) | não | 1 | sim |
| `review_2_body` | `{{REVIEW_2_BODY}}` | Texto curto | Copy (n8n) | não | 210 | não |
| `review_2_cta_label` | `{{REVIEW_2_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 16 | não |
| `review_3_name` | `{{REVIEW_3_NAME}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `review_3_initial` | `{{REVIEW_3_INITIAL}}` | Texto curto | Copy (n8n) | não | 1 | — |
| `review_3_body` | `{{REVIEW_3_BODY}}` | Texto curto | Copy (n8n) | não | 210 | não |
| `review_3_cta_label` | `{{REVIEW_3_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 16 | não |
| `review_1_photo_a` | `{{REVIEW_1_PHOTO_A}}` | Imagem | Imagem gerada | não | — | — |
| `review_1_photo_b` | `{{REVIEW_1_PHOTO_B}}` | Imagem | Imagem gerada | não | — | — |
| `review_2_photo_a` | `{{REVIEW_2_PHOTO_A}}` | Imagem | Imagem gerada | não | — | — |
| `review_3_photo_a` | `{{REVIEW_3_PHOTO_A}}` | Imagem | Imagem gerada | não | — | — |
| `review_3_photo` | `{{REVIEW_3_PHOTO}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`reviews_headline`**
    - *Exemplo:* SECTION TITLE HERE
- **`review_1_initial`**
    - *Exemplo:* G
- **`review_1_body`**
    - *Exemplo:* “1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
- **`review_1_cta_label`**
    - *Exemplo:* Shop Now
- **`review_2_name`**
    - *Exemplo:* Buyer Name
- **`review_2_initial`**
    - *Exemplo:* K
- **`review_2_body`**
    - *Exemplo:* “2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
- **`review_2_cta_label`**
    - *Exemplo:* 2	Shop Now
- **`review_3_name`**
    - *Exemplo:* 3 Buyer Name
- **`review_3_body`**
    - *Exemplo:* “3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur”
- **`review_3_cta_label`**
    - *Exemplo:* Shop Now
- **`review_1_photo_a`**
    - *Orientação:* Onde: polaroid da esquerda do primeiro review, girada ~5° no sentido anti-horário, sangrando pela borda esquerda do container.
    - *Imagem:* proporção 3:4 · 300 × 400 px
    - *Spec da imagem:* Slot: 300 × 400 px display (600 × 800 @2x) · proporção 3:4 · JPG, moldura branca aplicada no HTML/montagem, não no ativo.<br>Como gerar: gerar em 3:4 direto em 600 × 800. Sem corte — a rotação e o sangramento acontecem na montagem.<br>Ideia: cliente vestindo a peça em cena externa real, de frente ou três quartos, rosto parcialmente fora do quadro.
- **`review_1_photo_b`**
    - *Orientação:* Onde: polaroid da direita do primeiro review, girada ~2° no sentido horário, sobreposta à foto A e sangrando pela borda direita.
    - *Imagem:* proporção 3:4 · 300 × 400 px
    - *Spec da imagem:* Slot: 300 × 400 px display (600 × 800 @2x) · proporção 3:4 · JPG.<br>Como gerar: idêntico ao slot A.<br>Ideia: o mesmo produto do slot A em outro ângulo — de costas, mostrando a estampa que o depoimento cita.
- **`review_2_photo_a`**
    - *Orientação:* Onde: mesma composição do review 1, com a foto da esquerda girada ~4° anti-horário.
    - *Imagem:* proporção 3:4 · 300 × 400 px
    - *Spec da imagem:* Slot: 300 × 400 px display (600 × 800 @2x) · proporção 3:4 · JPG.<br>Como gerar: idêntico aos slots do review 1.<br>Ideia: segundo produto do catálogo, um plano em interior e outro em exterior, para variar o cenário em relação ao review 1.
- **`review_3_photo_a`**
    - *Orientação:* Onde: mesma composição do review 1, com a foto da esquerda girada ~4° anti-horário.
    - *Imagem:* proporção 3:4 · 300 × 400 px
    - *Spec da imagem:* Slot: 300 × 400 px display (600 × 800 @2x) · proporção 3:4 · JPG.<br>Como gerar: idêntico aos slots do review 1.<br>Ideia: segundo produto do catálogo, um plano em interior e outro em exterior, para variar o cenário em relação ao review 1.
- **`review_3_photo`**
    - *Orientação:* Onde: foto única do terceiro review, centralizada, sem moldura branca e com giro quase nulo, sobreposta pelo cartão.
    - *Imagem:* proporção 4:3 · 300 × 225 px
    - *Spec da imagem:* Slot: 300 × 225 px display (600 × 450 @2x) · proporção 4:3 · JPG.<br>Como gerar: gerar em 4:3 direto em 600 × 450. Sem corte.<br>Ideia: o acessório do terceiro depoimento em plano fechado, apoiado em superfície neutra clara, sem pessoa na cena.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Seção — Reviews em papel rasgado (fotos em HTML)</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-gry { color:#373737 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px + borda preta 1px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;border:1px solid #000000;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:92px 40px 49px 40px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#000000;">
        SECTION TITLE HERE
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 1                                                         -->
    <!-- ================================================================ -->

    <!-- fotos em HTML, com moldura preta -->
    <tr>
      <td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td width="265" valign="top" style="width:265px;padding:72px 0 0 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAP8AAAE+CAIAAADNqVE4AAAD…[base64 de ~1 KB omitido]…" width="255" height="318" alt="ALT_FOTO_1A"
                   style="display:block;width:255px;height:318px;border:5px solid #000000;background:#EFEFEF;">
            </td>
            <td width="9" style="width:9px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="324" valign="top" style="width:324px;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAToAAAGGCAIAAABkKNoFAAAF…[base64 de ~2 KB omitido]…" width="314" height="390" alt="ALT_FOTO_1B"
                   style="display:block;width:314px;height:390px;border:5px solid #000000;background:#EFEFEF;">
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- papel rasgado com o conteúdo por cima -->
    <tr>
      <td align="center" style="padding:0 23px;">
        <table role="presentation" width="552" cellpadding="0" cellspacing="0" border="0" style="width:552px;">
          <tr>
            <td height="505" valign="top"
                background="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…"
                style="height:505px;background-color:transparent;background-image:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…');background-position:left top;background-repeat:no-repeat;background-size:552px 505px;">

              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:552px;height:505px;">
                <v:fill type="frame" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…" color="#E2D4BC" />
                <v:textbox inset="0,0,0,0"><![endif]-->

              <table role="presentation" width="552" cellpadding="0" cellspacing="0" border="0" style="width:552px;">
                <tr>
                  <td style="padding:82px 0 0 95px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="81" valign="top" style="width:81px;font-size:0;line-height:0;">
                          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFEAAABRCAYAAACqj0o2AAAU…[base64 de ~7 KB omitido]…" width="81" height="81" alt="" style="display:block;width:81px;height:81px;">
                        </td>
                        <td width="27" style="width:27px;font-size:0;line-height:0;">&nbsp;</td>
                        <td valign="top" style="padding-top:5px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:25px;letter-spacing:5px;color:#000000;">
                            &#9733;&#9733;&#9733;&#9733;&#9733;
                          </div>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:7px;">
                            <tr>
                              <td valign="middle" style="padding-left:8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:30px;color:#FFFFFF;white-space:nowrap;">Verified</td>
                              <td width="17" style="width:17px;font-size:0;line-height:0;">&nbsp;</td>
                              <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:36px;font-weight:700;color:#0B0A07;white-space:nowrap;"> 1 Buyer Name</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="txt-gry" style="padding:40px 82px 0 95px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:400;color:#373737;">
                    &ldquo;1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
                  </td>
                </tr>
                <tr>
                  <td style="padding:31px 0 112px 113px;">
                    <table role="presentation" width="327" cellpadding="0" cellspacing="0" border="0" style="width:327px;">
                      <tr>
                        <td align="center" height="59" style="width:327px;height:59px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;">
                          <a href="URL_CTA_1" style="display:block;width:325px;height:57px;line-height:57px;font-family:Asap,Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.013em;color:#000000;text-decoration:none;text-align:center;">SHOP NOW</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 2                                                         -->
    <!-- ================================================================ -->

    <tr>
      <td style="padding:40px 0 0 0;font-size:0;line-height:0;">
        <table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;">
          <tr>
            <td width="265" valign="top" style="width:265px;padding:72px 0 0 0;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAP8AAAE+CAIAAADNqVE4AAAD…[base64 de ~1 KB omitido]…" width="255" height="318" alt="ALT_FOTO_2A"
                   style="display:block;width:255px;height:318px;border:5px solid #000000;background:#EFEFEF;">
            </td>
            <td width="9" style="width:9px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="324" valign="top" style="width:324px;font-size:0;line-height:0;">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAToAAAGGCAIAAABkKNoFAAAF…[base64 de ~2 KB omitido]…" width="314" height="390" alt="ALT_FOTO_2B"
                   style="display:block;width:314px;height:390px;border:5px solid #000000;background:#EFEFEF;">
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:0 23px;">
        <table role="presentation" width="552" cellpadding="0" cellspacing="0" border="0" style="width:552px;">
          <tr>
            <td height="505" valign="top"
                background="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…"
                style="height:505px;background-color:transparent;background-image:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…');background-position:left top;background-repeat:no-repeat;background-size:552px 505px;">

              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:552px;height:505px;">
                <v:fill type="frame" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…" color="#E2D4BC" />
                <v:textbox inset="0,0,0,0"><![endif]-->

              <table role="presentation" width="552" cellpadding="0" cellspacing="0" border="0" style="width:552px;">
                <tr>
                  <td style="padding:82px 0 0 95px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="81" valign="top" style="width:81px;font-size:0;line-height:0;">
                          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFEAAABRCAYAAACqj0o2AAAU…[base64 de ~7 KB omitido]…" width="81" height="81" alt="" style="display:block;width:81px;height:81px;">
                        </td>
                        <td width="27" style="width:27px;font-size:0;line-height:0;">&nbsp;</td>
                        <td valign="top" style="padding-top:5px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:25px;letter-spacing:5px;color:#000000;">
                            &#9733;&#9733;&#9733;&#9733;&#9733;
                          </div>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:7px;">
                            <tr>
                              <td valign="middle" style="padding-left:8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:30px;color:#FFFFFF;white-space:nowrap;">Verified</td>
                              <td width="17" style="width:17px;font-size:0;line-height:0;">&nbsp;</td>
                              <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:36px;font-weight:700;color:#0B0A07;white-space:nowrap;">Buyer Name</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="txt-gry" style="padding:40px 82px 0 95px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:400;color:#373737;">
                    &ldquo;2 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
                  </td>
                </tr>
                <tr>
                  <td style="padding:31px 0 112px 113px;">
                    <table role="presentation" width="327" cellpadding="0" cellspacing="0" border="0" style="width:327px;">
                      <tr>
                        <td align="center" height="59" style="width:327px;height:59px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;">
                          <a href="URL_CTA_2" style="display:block;width:325px;height:57px;line-height:57px;font-family:Asap,Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.013em;color:#000000;text-decoration:none;text-align:center;"> 2 SHOP NOW</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- REVIEW 3 — uma foto só, deitada                                  -->
    <!-- ================================================================ -->

    <tr>
      <td align="center" style="padding:40px 0 0 0;font-size:0;line-height:0;">
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAV4AAAEZCAIAAABQFNqZAAAD…[base64 de ~1 KB omitido]…" width="350" height="281" alt="ALT_FOTO_3"
             style="display:block;width:350px;height:281px;border:5px solid #000000;background:#EFEFEF;">
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:0 23px;">
        <table role="presentation" width="552" cellpadding="0" cellspacing="0" border="0" style="width:552px;">
          <tr>
            <td height="505" valign="top"
                background="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…"
                style="height:505px;background-color:transparent;background-image:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…');background-position:left top;background-repeat:no-repeat;background-size:552px 505px;">

              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:552px;height:505px;">
                <v:fill type="frame" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAigAAAH5CAYAAACrh8WSAAAR…[base64 de ~6 KB omitido]…" color="#E2D4BC" />
                <v:textbox inset="0,0,0,0"><![endif]-->

              <table role="presentation" width="552" cellpadding="0" cellspacing="0" border="0" style="width:552px;">
                <tr>
                  <td style="padding:82px 0 0 95px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="81" valign="top" style="width:81px;font-size:0;line-height:0;">
                          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFEAAABRCAYAAACqj0o2AAAU…[base64 de ~7 KB omitido]…" width="81" height="81" alt="" style="display:block;width:81px;height:81px;">
                        </td>
                        <td width="27" style="width:27px;font-size:0;line-height:0;">&nbsp;</td>
                        <td valign="top" style="padding-top:5px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:25px;letter-spacing:5px;color:#000000;">
                            &#9733;&#9733;&#9733;&#9733;&#9733;
                          </div>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:7px;">
                            <tr>
                              <td valign="middle" style="padding-left:8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:30px;color:#FFFFFF;white-space:nowrap;">Verified</td>
                              <td width="17" style="width:17px;font-size:0;line-height:0;">&nbsp;</td>
                              <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:36px;font-weight:700;color:#0B0A07;white-space:nowrap;"> 3 Buyer Name</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="txt-gry" style="padding:40px 82px 0 95px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:25px;font-weight:400;color:#373737;">
                    &ldquo;3 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur&rdquo;
                  </td>
                </tr>
                <tr>
                  <td style="padding:31px 0 112px 113px;">
                    <table role="presentation" width="327" cellpadding="0" cellspacing="0" border="0" style="width:327px;">
                      <tr>
                        <td align="center" height="59" style="width:327px;height:59px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;">
                          <a href="URL_CTA_3" style="display:block;width:325px;height:57px;line-height:57px;font-family:Asap,Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.013em;color:#000000;text-decoration:none;text-align:center;">3 SHOP NOW</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA FINAL -->
    <tr>
      <td align="center" style="padding:40px 0 66px 0;">
        <table role="presentation" width="446" cellpadding="0" cellspacing="0" border="0" style="width:446px;">
          <tr>
            <td align="center" height="59" style="width:446px;height:59px;background:#D1D1D1;border:1px solid #000000;border-radius:5px;">
              <a href="URL_DO_CTA_FINAL" style="display:block;width:444px;height:57px;line-height:57px;font-family:Asap,Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;letter-spacing:0.013em;color:#000000;text-decoration:none;text-align:center;">SHOP NOW</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```


---

## 6 · CTA

Nenhuma variante cadastrada para `cta`. O Montador não tem de onde escolher um bloco desta seção — quando o blueprint pede um, o pipeline cai no template global.


---

## 7 · Oferta / Promo / Desconto

`offer` · 6 variantes (6 ativas · 34.4 KB de HTML)

<a id="v-3cee424b"></a>

### 7.1 · offer 1 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Oferta / Promo / Desconto (`offer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 2.8 KB |
| **ID** | `3cee424b-5278-4503-9fa7-2afca3b5d13f` |

#### Descrição curta

Bloco de oferta sem nenhuma imagem, para quando a peça já mostrou o produto e o que falta é declarar a condição comercial e mandar clicar. Serve como fechamento de e-mail ou como ponte entre duas seções pesadas.  

#### Descrição detalhada

Três elementos empilhados e centralizados sobre fundo branco: headline, um parágrafo de corpo e um CTA sólido de largura quase total. Não há painel, borda, card, ícone, divisor ou imagem — a hierarquia vem inteira de tamanho de fonte e espaço em branco.  

Dois mecanismos sustentam o bloco:  

Respiro como hierarquia. Os vãos são maiores que os elementos: 67px entre headline e corpo, 63px entre corpo e CTA. O espaço é o que separa os três blocos, já que não existe nenhum recurso gráfico fazendo isso.  
CTA desproporcional de propósito. 490 de largura contra 600 do container e 70 de altura — é o elemento mais pesado da seção, mais largo que o próprio bloco de texto. Num bloco sem imagem, o botão é o único ponto de peso visual.  

#### Contexto para a IA

##### Quando usar

Fechamento de e-mail depois de uma seção rica em imagem (hero, grade de produtos, prova social).  
Anúncio de condição comercial simples que se resolve em uma frase: percentual, frete, brinde, prazo.  
Ponte entre duas seções pesadas, para o e-mail não virar um bloco visual atrás do outro.  
Campanha em que a oferta é o argumento e não precisa de reforço visual.  

##### Quando NÃO usar

Como único bloco de oferta de um e-mail promocional. Sem imagem e sem destaque de cupom, o bloco não segura sozinho o peso de uma campanha.  
Quando a oferta tem código de desconto que precisa de destaque. A estrutura não tem slot de cupom — o código teria que ser embutido no corpo do texto ou no label do botão, e nos dois casos ele perde evidência.  
Quando a oferta tem mais de uma condição ou regra. O corpo comporta 3 a 5 linhas e não aguenta letra miúda.  
No topo do e-mail. O bloco não apresenta nada, só conclui.  

##### Orientações de copy para a IA

Orientações de copy para a IA  
A headline carrega o valor da oferta, não o nome da campanha. É o único elemento em corpo grande e é o que o leitor lê primeiro.  
Headline em uma linha. A largura útil é de 520px em corpo 40 — passar disso quebra em duas e desmonta o equilíbrio com o vão de 67px abaixo.  
O corpo diz o que fazer e até quando, em 3 a 5 linhas. É o único lugar onde cabem prazo, condição ou regra.  
Nada de repetir a headline no corpo. Com três elementos só, redundância aparece na hora.  
O label do CTA é a ação, curta. Num botão de 490px de largura, um label longo fica solto no meio de um vão enorme; label curto centralizado é o que funciona.  
Sem emoji, sem caixa alta gritada, sem exclamação dupla. O bloco é sóbrio por construção — o peso está no tamanho, não no tom.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (3 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `offer_headline` | `{{OFFER_HEADLINE}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `offer_body` | `{{OFFER_BODY}}` | Texto curto | Copy (n8n) | não | 180 | sim |
| `offer_cta_label` | `{{OFFER_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | sim |

**Detalhe dos campos**

- **`offer_headline`**
    - *Exemplo:* This Is Your Headline
- **`offer_body`**
    - *Exemplo:* You can put any text, product description and features here. Longer product description and other helpful product information can be placed here.
- **`offer_cta_label`**
    - *Exemplo:* CTA

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção bridge — headline, texto e CTA</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- HEADLINE -->
    <tr>
      <td align="center" class="txt-blk" style="padding:35px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:40px;line-height:48px;font-weight:400;color:#000000;">
        This Is Your Headline
      </td>
    </tr>

    <!-- TEXTO -->
    <tr>
      <td align="center" style="padding:67px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:460px;">
          <tr>
            <td align="center" class="txt-blk" style="width:460px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:29px;font-weight:400;color:#000000;">
              You can put any text, product description and features here. Longer product description and other helpful product information can be placed here.
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td align="center" style="padding:63px 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:490px;">
          <tr>
            <td align="center" height="70" style="width:490px;height:70px;background:#000000;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:490px;height:70px;line-height:70px;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">
                CTA
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-304bf7ce"></a>

### 7.2 · offer 2 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Oferta / Promo / Desconto (`offer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 6.5 KB |
| **ID** | `304bf7ce-6a23-4c68-b3a5-c37f551aaa5f` |

#### Descrição curta

Bloco de oferta para data comemorativa, quando a campanha tem duas ofertas diferentes rodando ao mesmo tempo. Empilha um desconto percentual e um combo de preço fechado em caixas separadas, sobre uma foto de cena que ocupa a seção inteira.  

#### Descrição detalhada

Faixa decorativa de estrelas no topo, sobrescrito e headline centralizados, duas caixas de oferta empilhadas, uma linha de prazo solta e um CTA com estrelas nas pontas — tudo flutuando sobre uma única foto de cena que se estende do topo ao fim da seção e cuja metade inferior fica livre, sem nenhum elemento por cima.  

Quatro mecanismos sustentam o bloco:  

Duas ofertas com papéis diferentes, em caixas diferentes. A branca carrega o desconto percentual e a mecânica ("aplicado automaticamente"); a azul carrega o combo de preço fechado e a especificação do que vem nele. São duas ofertas simultâneas, não uma oferta e um reforço.  
O prazo fica fora das caixas. A urgência é a única linha de texto solta sobre a foto entre a caixa azul e o CTA. Condição comercial dentro da caixa, prazo fora dela — a separação é o que impede a leitura de "letra miúda".  
A foto é a seção, não um elemento dela. Não há fundo próprio: um único ativo de imagem cobre os 1440px e a metade inferior é deixada respirando, com a comida em primeiro plano e nada escrito por cima.  
Motivo sazonal repetido em duas escalas. A faixa de estrelas no topo e as duas estrelas nas pontas do CTA são o mesmo elemento em tamanhos diferentes, amarrando o topo e a base sem precisar de mais nenhuma decoração.  

#### Contexto para a IA

##### Quando usar

Data comemorativa com identidade visual óbvia (feriado nacional, Black Friday, Natal) onde um motivo decorativo simples já situa a campanha.  
Campanha com duas ofertas simultâneas: um desconto geral e um combo ou kit de preço fechado.  
Categoria em que a foto de cena vende sozinha — alimento, bebida, churrasco, mesa posta, decoração.  
Quando existe um prazo real e curto para declarar.  

##### Quando NÃO usar

Uma oferta só. Com uma caixa a estrutura fica desequilibrada e a segunda vira enchimento.  
Produto que precisa ser mostrado isolado ou em detalhe. A foto aqui é ambiente, não packshot.  
Marca sem motivo sazonal para usar na faixa e no CTA — sem ele a seção perde o que a amarra.  
Campanha sem prazo. A linha de urgência é estrutural: sem ela sobra um vão de 55px entre a caixa azul e o CTA.  
E-mail de conteúdo ou educativo. A seção é comercial da primeira à última linha.  

##### Orientações de copy para a IA

Sobrescrito é a data, headline é o evento. "4th Of July" em cima, "BBQ Blowout Is Live" embaixo. O sobrescrito nunca repete a palavra da headline.  
A headline declara que está no ar, não convida. É estado, não chamada — quem chama é o CTA.  
A caixa branca junta valor e mecânica: o percentual e sobre o quê, e logo abaixo como o desconto é aplicado. Se o desconto é automático, dizer — é o que remove a objeção do cupom.  
A caixa azul abre com o preço, curto e sem enrolação, e depois especifica o que está incluso em itens objetivos: quantidade, peso, formato, estado. Nada de adjetivo nessa lista.  
Title Case em toda a seção, incluindo as especificações e o prazo. Só o sobrescrito e a headline ficam em caixa alta.  
O prazo traz data e a segunda condição: "até tal dia, ou antes se acabar". A dupla condição vale mais que o relógio sozinho.  
CTA nomeia a promoção, não a loja.  

##### Design system

Container: 600px travado. A seção inteira é uma imagem de fundo de 600 × 1440 — não há cor de fundo própria. A cor média para fallback é   
#E4DCD1.  

Tipografia principal: sans geométrica de peso alto. Não há tipografia secundária. O template substitui por Arial, Helvetica, sans-serif.  

| Bloco | Tamanho aproximado | Peso | Caixa |  
|---|---|---|---|  
| Sobrescrito | ~38 | 700 | ALTA |  
| Headline | ~43 (tracking negativo) | 700 | ALTA |  
| Valor do desconto | ~34 | 700 no percentual, 400 no resto | Title Case |  
| Nota do desconto | ~18 | 400 | Sentença, entre parênteses |  
| Preço do combo | ~34 | 400 | Title Case |  
| Especificação do combo | ~20 / 35 | 400 | Title Case |  
| Prazo | ~24 / 35 | 400 | Title Case |  
| Label do CTA | ~23 | 700 | ALTA |  

Cores. Cor primária   
#A61D24 — vermelho usado no sobrescrito e no fundo do CTA, e em mais nada. Cor secundária   
#0A4A6D, o azul da caixa de combo.   
#FFFFFF na caixa de desconto, nas estrelas e nos textos sobre azul e vermelho;   
#000000 na headline, no valor do desconto e no prazo. A dupla vermelho/azul sobre bege é a paleta inteira.  

Grade e ritmo vertical (medido):  

faixa de estrelas   3 fileiras (y 19–97), 20 estrelas de ~18px por fileira,  
                    passo 30, fileira do meio deslocada meio passo  
   ↓  
sobrescrito         y 162–188, centralizado  
   ↓ 29px  
headline            y 217–247, centralizado  
   ↓ 40px  
CAIXA BRANCA        471 × 134 (x 64–534), cantos retos  
                      +37  valor do desconto  
                      +51  nota entre parênteses  
   ↓ 31px  
CAIXA AZUL          469 × 229 (x 64–532), cantos retos  
                      +45  preço do combo  
                      +103 especificação — 3 linhas, entrelinha 35  
   ↓ 59px  
prazo               2 linhas, entrelinha 35, solto sobre a foto  
   ↓ 40px  
CTA                 430 × 61 (x 90), cantos retos, fundo #A61D24  
                    estrela ~17px a 38px de cada borda, label centralizado  
   ↓ 553px          área livre — só a foto, nada por cima  

Regras que não podem ser quebradas:  

Zero border-radius. Caixas e CTA têm cantos retos, e as duas caixas têm a mesma largura.  
A metade inferior da seção fica livre. Escrever sobre a comida destrói a variante.  
O prazo nunca entra dentro de uma das caixas.  
Vermelho só no sobrescrito e no CTA. Azul só na caixa de combo. Nenhuma das duas cores aparece em mais nenhum lugar.  
As estrelas do CTA ficam nas duas pontas, simétricas, e são o mesmo desenho da faixa do topo.  
A faixa de estrelas tem fileiras alternadas com deslocamento de meio passo. Alinhar as três em grade reta deixa o padrão mecânico.  
Tudo centralizado. Não há alinhamento à esquerda nesta variante.  

##### Direção fotográfica

Uma foto só, vertical e muito alta, com dois terços de respiro em cima e a cena inteira embaixo.  

Cena: mesa posta em uso, vista em perspectiva baixa e diagonal, com o produto principal em primeiro plano sobre tábua de madeira e elementos de contexto ao redor — copos, pratos, guarnição, bebida.  
Enquadramento: a comida ancorada na base do quadro e cortada pelas bordas inferior e laterais. Nada centralizado, nada isolado.  
Terço superior: parede lisa e desfocada, sem objeto nenhum, servindo de área para o texto. É onde todo o conteúdo da seção vai ficar, então precisa estar limpa e uniforme.  
Luz: natural lateral, quente, com sombra suave. Profundidade de campo curta — o fundo desfoca, o primeiro plano fica nítido.  
Cor: paleta quente de madeira, pão e bege. A foto tem que aceitar vermelho e azul chapados por cima sem competir.  
Proibições: pessoa na cena, fundo escuro, foto de estúdio em fundo branco, produto isolado, gradiente artificial, textura de fundo com padrão.  

#### Schema de output (12 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `offer_eyebrow` | `{{OFFER_EYEBROW}}` | Texto curto | Copy (n8n) | não | 16 | não |
| `offer_headline` | `{{OFFER_HEADLINE}}` | Texto curto | Copy (n8n) | não | 24 | não |
| `offer_discount_value` | `{{OFFER_DISCOUNT_VALUE}}` | Texto curto | Copy (n8n) | não | 26 | não |
| `offer_discount_note` | `{{OFFER_DISCOUNT_NOTE}}` | Texto curto | Copy (n8n) | não | 42 | sim |
| `offer_price_value` | `{{OFFER_PRICE_VALUE}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `offer_price_spec_1` | `{{OFFER_PRICE_SPEC_1}}` | Texto curto | Copy (n8n) | não | 38 | sim |
| `offer_price_spec_2` | `{{OFFER_PRICE_SPEC_2}}` | Texto curto | Copy (n8n) | não | 38 | não |
| `offer_price_spec_3` | `{{OFFER_PRICE_SPEC_3}}` | Texto curto | Copy (n8n) | não | 38 | sim |
| `offer_price_spec_4` | `{{OFFER_PRICE_SPEC_4}}` | Texto curto | Copy (n8n) | não | 38 | não |
| `offer_deadline` | `{{OFFER_DEADLINE}}` | Texto curto | Copy (n8n) | não | 55 | não |
| `offer_cta_label` | `{{OFFER_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `offer_background_image` | `{{OFFER_BACKGROUND_IMAGE}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`offer_eyebrow`**
    - *Exemplo:* 4th Of July
- **`offer_headline`**
    - *Exemplo:* BBQ Blowout Is Live
- **`offer_discount_value`**
    - *Exemplo:* 20% OFF All Hot Dogs
- **`offer_discount_note`**
    - *Exemplo:* (Discount auto-applied at checkout)
- **`offer_price_value`**
    - *Exemplo:* Just $50
- **`offer_price_spec_1`**
    - *Exemplo:* 9lb Case Of Chuck + Brisket Patties
- **`offer_price_spec_2`**
    - *Exemplo:* 24× 6oz Patties
- **`offer_price_spec_3`**
    - *Exemplo:* 80/20 Blend
- **`offer_price_spec_4`**
    - *Exemplo:* Grill-Ready/20 Blend
- **`offer_deadline`**
    - *Exemplo:* Ends July 5th At Midnight Or Sooner If We Sell Out
- **`offer_cta_label`**
    - *Exemplo:* Shop The Sale Now
- **`offer_background_image`**
    - *Orientação:* Onde: fundo de toda a seção, atrás de tudo, do topo até 553px abaixo do CTA.<br>Slot: 600 × 1440 px display (1200 × 2880 @2x) · ativo composto, sem proporção fixa · JPG.
    - *Imagem:* 600 × 1440 px
    - *Spec da imagem:* Como gerar: gerar a cena em 9:16 (1080 × 1920), ancorar a comida na base de um canvas de 1200 × 2880 e estender a parede desfocada para cima até preencher a altura, mantendo o gradiente natural (mais escuro no topo, mais claro na altura do texto). Sobrepor a faixa de estrelas no topo antes de exportar — ela faz parte deste ativo e não é um elemento separado do HTML.<br>Ideia: mesa de churrasco em uso, comida ancorada na base, parede lisa e desfocada ocupando o terço superior como área de texto.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>4th of July — BBQ Blowout</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
  u + .body .txt-red { color:#A61F2A !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <tr>
      <td background="URL_DA_IMAGEM_DE_FUNDO"
          valign="top"
          style="background-color:#E4DCD1;background-image:url('URL_DA_IMAGEM_DE_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:600px 1440px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:1440px;">
          <v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="#E4DCD1" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">

          <!-- EYEBROW -->
          <tr>
            <td align="center" class="txt-red" style="padding:155px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:36px;font-weight:700;color:#A61F2A;">
              4TH OF JULY
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td align="center" class="txt-blk" style="padding:20px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:40px;font-weight:700;color:#000000;">
              BBQ BLOWOUT IS LIVE
            </td>
          </tr>


          <!-- ============ CAIXA BRANCA ============ -->
          <tr>
            <td align="center" style="padding:36px 0 0 0;">
              <table role="presentation" width="474" cellpadding="0" cellspacing="0" border="0" style="width:474px;background:#FFFFFF;">
                <tr>
                  <td align="center" class="txt-blk" style="padding:35px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;font-weight:400;color:#000000;">
                    <strong style="font-weight:700;">20% OFF</strong> All Hot Dogs
                  </td>
                </tr>
                <tr>
                  <td align="center" class="txt-blk" style="padding:12px 24px 31px 24px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:20px;font-weight:400;color:#000000;">
                    (Discount auto-applied at checkout)
                  </td>
                </tr>
              </table>
            </td>
          </tr>


          <!-- ============ CAIXA AZUL ============ -->
          <tr>
            <td align="center" style="padding:27px 0 0 0;">
              <table role="presentation" width="474" cellpadding="0" cellspacing="0" border="0" style="width:474px;background:#114E76;">
                <tr>
                  <td align="center" class="txt-wht" style="padding:42px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:40px;font-weight:400;color:#FFFFFF;">
                    Just $50
                  </td>
                </tr>
                <tr>
                  <td align="center" class="txt-wht" style="padding:18px 24px 25px 24px;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:35px;font-weight:400;color:#FFFFFF;">
                    9lb Case Of Chuck + Brisket Patties<br>
                    24&times; 6oz Patties | 80/20 Blend<br>
                    | Grill-Ready
                  </td>
                </tr>
              </table>
            </td>
          </tr>


          <!-- URGÊNCIA -->
          <tr>
            <td align="center" class="txt-blk" style="padding:55px 80px 0 80px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:36px;font-weight:400;color:#000000;">
              Ends July 5th At Midnight Or<br>Sooner If We Sell Out
            </td>
          </tr>


          <!-- CTA -->
          <tr>
            <td align="center" style="padding:23px 0 0 0;">
              <table role="presentation" width="420" cellpadding="0" cellspacing="0" border="0" style="width:420px;background:#A61F2A;">
                <tr>
                  <td width="60" align="center" valign="middle" height="63" class="txt-wht"
                      style="width:60px;height:63px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:63px;color:#FFFFFF;">&#9733;</td>
                  <td align="center" valign="middle" style="padding:0;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;line-height:63px;font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">
                      Shop The Sale Now
                    </a>
                  </td>
                  <td width="60" align="center" valign="middle" class="txt-wht"
                      style="width:60px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:63px;color:#FFFFFF;">&#9733;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ÁREA LIVRE PARA A FOTO -->
          <tr>
            <td height="547" style="height:547px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-da0b6e11"></a>

### 7.3 · offer 3 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Oferta / Promo / Desconto (`offer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 6.4 KB |
| **ID** | `da0b6e11-c681-48af-ae88-316429e25c05` |

#### Descrição curta

Bloco de lembrete de cupom para quem já recebeu o código e não usou. Repete o código, o percentual e a condição em quatro linhas curtas, com o produto embaixo e um botão único — serve como e-mail inteiro de reforço, não como seção de apoio.  

#### Descrição detalhada

Card arredondado de fundo claro flutuando sobre um fundo em gradiente de cor da marca, com quatro elementos de texto no terço superior, a foto do produto no meio e um botão em pílula que atravessa a borda inferior do card. O código de desconto vive dentro de uma pílula colorida encaixada no meio de uma frase, com a palavra seguinte ao lado dela na mesma linha.  

Três mecanismos sustentam o bloco:  

Cupom inline, não empilhado. A pílula do código fica dentro da frase, com a preposição seguinte ao lado dela na mesma linha. O leitor lê "use o código X para" numa tacada só, em vez de ler três blocos separados.  
Botão atravessando a borda do card. A pílula do CTA fica metade dentro e metade fora do card — 33px acima da borda e 35px abaixo. É o que impede o card de parecer uma caixa fechada e leva o olho para fora dela.  
Cor invertida entre pílula e botão. A pílula do código é a cor da marca com texto claro; o botão é claro com texto escuro. As duas âncoras da peça não competem entre si.  

#### Contexto para a IA

##### Quando usar

Lembrete de cupom não usado, dois a quatro dias depois do welcome ou do pop-up de captura.  
Recuperação de navegação ou de carrinho quando o desconto já foi concedido e só falta ser aplicado.  
Marca com produto pequeno e colorido que aparece bem em pilha ou grupo — acessório, cosmético, papelaria, snack.  
Como e-mail curto e único, não como bloco dentro de uma peça longa.  

##### Quando NÃO usar

Sem cupom. A pílula do código é o centro da variante e não tem substituto.  
Produto grande ou que precisa de contexto de uso. A foto aqui é um agrupamento em fundo neutro, não uma cena.  
Campanha com mais de uma condição ou regra. Só há quatro linhas de texto e nenhuma delas comporta letra miúda.  
Primeiro contato com a oferta. O bloco pressupõe que o leitor já conhece o código.  

##### Orientações de copy para a IA

A primeira linha assume que já foi dito antes: "não esqueça de usar", nunca "aqui está seu código". É lembrete, não entrega.  
A frase atravessa a pílula. O texto antes do código e a preposição depois dele fazem parte da mesma frase — escrever os dois pedaços como se a pílula fosse uma palavra no meio.  
A palavra depois da pílula é curta, uma preposição de até 4 caracteres. Ela precisa caber ao lado da pílula na mesma linha.  
A linha do percentual é só o percentual, em corpo grande, sem qualificador.  
A última linha diz sobre o que o desconto vale, e é a única que carrega a exclamação da peça.  
Title Case nas quatro linhas. O código fica em caixa alta.  
CTA genérico e curto. A oferta já foi declarada três vezes acima; o botão só precisa levar.  

##### Design system

Container: 600px travado, altura 639. O fundo é um gradiente vertical na cor da marca, do topo (  
#2C7D83) para a base (  
#379998).  

Card: 558 × 517 (x 21–579, y 45–561), raio ~19, fundo azul-claro   
#C7D6EB. Margem de 21px para as bordas laterais do container, 45 no topo e 78 na base.  

Tipografia principal: sans geométrica. Não há tipografia secundária. O template substitui por Arial, Helvetica, sans-serif.  

| Bloco | Tamanho aproximado | Peso | Caixa |  
|---|---|---|---|  
| Linha de introdução | ~25 | 400 | Title Case |  
| Código na pílula | ~28 | 700 | ALTA |  
| Palavra ao lado da pílula | ~25 | 400 | Title Case |  
| Linha do percentual | ~55 | 700 | ALTA |  
| Linha de fechamento | ~28 | 400 | Title Case |  
| Label do CTA | ~22 | 700 | ALTA |  

Cores. Cor primária   
#012B46 — azul-marinho escuro em todo o texto sobre o card e no label do CTA. Cor secundária   
#C7D6EB (fundo do card). Cor de acento   
#379898, usada no gradiente de fundo e no preenchimento da pílula do código — é a mesma cor nos dois lugares.   
#FFFFFF no código dentro da pílula e no preenchimento do CTA.  

Grade e ritmo vertical (medido, já normalizado para 600px):  

fundo em gradiente        600 × 639  
CARD                      558 × 517 (x 21–579, y 45–561), raio 19  
   ↓ 31px do topo do card  
linha de introdução       y 76–100, centralizada  
   ↓ 6px  
PÍLULA DO CÓDIGO          218 × 35 (x 156–373), totalmente arredondada  
                          + palavra ao lado, x 384–418, alinhada ao centro da pílula  
   ↓ 17px  
linha do percentual       y 157–201  
   ↓ 21px  
linha de fechamento       y 222–243  
   ↓ 27px  
área da foto do produto   ~260px livres, produto agrupado e centralizado  
CTA                       496 × 69 (x 52–548), pílula, fundo branco  
                          topo 33px acima da base do card, base 35px abaixo dela  
   ↓ 43px até o fim da peça  

Regras que não podem ser quebradas:  

O CTA atravessa a borda inferior do card, dividido praticamente ao meio por ela. Encaixá-lo dentro do card fecha a composição.  
A pílula do código e a palavra seguinte ficam na mesma linha. Empilhar quebra a frase.  
A pílula do código é preenchida na cor de acento com texto claro; o CTA é claro com texto escuro. A inversão entre os dois é obrigatória.  
Tudo centralizado, com exceção do conjunto pílula + palavra, que é centralizado como um bloco só.  
Cantos: o card tem raio pequeno (19), a pílula e o CTA são totalmente arredondados. Não há canto reto na peça.  
A foto do produto não recebe texto por cima e fica na metade inferior do card  

##### Direção fotográfica

Agrupamento do produto sobre superfície neutra clara, fotografado de frente e ligeiramente de cima.  

Composição: várias unidades do mesmo produto empilhadas ou encostadas umas nas outras, formando um monte compacto no centro. Nada alinhado em grade, nada isolado.  
Variação: cada unidade em uma estampa ou cor diferente, para o agrupamento mostrar o catálogo sem precisar de grade de produtos.  
Superfície: clara, lisa e sem textura, com sombra de contato suave logo abaixo da pilha. O fundo tem que se dissolver no azul-claro do card.  
Luz: difusa e frontal, sem sombra dura e sem realce especular.  
Escala: o agrupamento ocupa cerca de metade da largura do card, deixando respiro dos dois lados.  
Proibições: modelo, mão, cena de uso, fundo colorido, sombra projetada forte, produto cortado pelas bordas.  

#### Schema de output (7 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `coupon_intro` | `{{COUPON_INTRO}}` | Texto curto | Copy (n8n) | não | 30 | não |
| `coupon_code` | `{{COUPON_CODE}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `coupon_connector` | `{{COUPON_CONNECTOR}}` | Texto curto | Copy (n8n) | não | 5 | sim |
| `coupon_value` | `{{COUPON_VALUE}}` | Texto curto | Copy (n8n) | não | 10 | sim |
| `coupon_scope` | `{{COUPON_SCOPE}}` | Texto curto | Copy (n8n) | não | 26 | sim |
| `coupon_cta_label` | `{{COUPON_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 18 | não |
| `coupon_background_image` | `{{COUPON_BACKGROUND_IMAGE}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`coupon_intro`**
    - *Exemplo:* Don’t Forget To Use Code
- **`coupon_code`**
    - *Exemplo:* CODECODE
- **`coupon_connector`**
    - *Exemplo:* For
- **`coupon_value`**
    - *Exemplo:* XX% OFF
- **`coupon_scope`**
    - *Exemplo:* Your First Purchase!
- **`coupon_cta_label`**
    - *Exemplo:* Shop Now
- **`coupon_background_image`**
    - *Orientação:* Onde: fundo de toda a seção — carrega o gradiente, o card arredondado e a foto do produto.<br>Slot: 600 × 639 px display (1200 × 1278 @2x) · ativo composto, sem proporção fixa · JPG.
    - *Imagem:* proporção 1:1 · 600 × 639 px
    - *Spec da imagem:* Como gerar: gerar a foto do agrupamento de produto em 1:1 (1024 × 1024) sobre fundo claro liso, recortar num bloco de ~560 × 520 @2x e montá-la na metade inferior do card. O card (558 × 517, raio 19, <br>#C7D6EB) e o gradiente de fundo entram na montagem, não no HTML.<br>Ideia: pilha compacta de unidades do produto em estampas diferentes, sobre superfície clara, com sombra de contato suave e fundo que se funde ao azul do card.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Lembrete de cupom — card + CTA</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <tr>
      <td background="URL_DO_FUNDO"
          valign="top"
          style="background-color:#C7D6EB;background-image:url('URL_DO_FUNDO');background-position:center top;background-repeat:no-repeat;background-size:600px 639px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:639px;">
          <v:fill type="frame" src="URL_DO_FUNDO" color="#C7D6EB" />
          <v:textbox inset="0,0,0,0"><![endif]-->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">

          <!-- LINHA 1 -->
          <tr>
            <td align="center" class="txt-blk" style="padding:71px 60px 0 60px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:29px;font-weight:400;color:#000000;">
              Don&rsquo;t Forget To Use Code
            </td>
          </tr>

          <!-- PÍLULA DO CUPOM + "For" na mesma linha -->
          <tr>
            <td align="center" style="padding:14px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="font-size:0;line-height:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:50px;v-text-anchor:middle;width:257px;" arcsize="50%" filled="f" strokecolor="#000000" strokeweight="1px">
                      <v:stroke dashstyle="dash" />
                      <center style="color:#000000;font-family:Arial,sans-serif;font-size:38px;font-weight:bold;">CODECODE</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" width="257" cellpadding="0" cellspacing="0" border="0" style="width:257px;">
                      <tr>
                        <td align="center" valign="middle" height="50" class="txt-blk"
                            style="width:257px;height:50px;border:1px dashed #000000;border-radius:32px;font-family:Arial,Helvetica,sans-serif;font-size:38px;line-height:46px;font-weight:700;color:#000000;text-align:center;">
                          CODECODE
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                  <td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:50px;font-weight:400;color:#000000;white-space:nowrap;">For</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DESCONTO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:16px 60px 0 60px;font-family:Arial,Helvetica,sans-serif;font-size:48px;line-height:58px;font-weight:700;color:#000000;">
              XX% OFF
            </td>
          </tr>

          <!-- FECHAMENTO -->
          <tr>
            <td align="center" class="txt-blk" style="padding:12px 60px 0 60px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:36px;font-weight:400;color:#000000;">
              Your First Purchase!
            </td>
          </tr>

          <!-- ÁREA LIVRE PARA A FOTO DO PRODUTO -->
          <tr>
            <td height="222" style="height:222px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- CTA, sobreposto à borda do card -->
          <tr>
            <td align="center" style="padding:0 0 66px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:65px;v-text-anchor:middle;width:432px;" arcsize="50%" stroke="f" fillcolor="#393737">
                <w:anchorlock/>
                <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:23px;font-weight:bold;">SHOP NOW</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="432" cellpadding="0" cellspacing="0" border="0" style="width:432px;">
                <tr>
                  <td align="center" height="65" style="width:432px;height:65px;background:#393737;border-radius:100px;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:432px;height:65px;line-height:65px;font-family:Poppins,Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:0.07em;text-indent:0.07em;color:#FFFFFF;text-decoration:none;text-align:center;">
                      SHOP NOW
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

        </table>

        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-69ede46f"></a>

### 7.4 · offer 4 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Oferta / Promo / Desconto (`offer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 5.8 KB |
| **ID** | `69ede46f-1534-431c-bdab-2d7be60ce236` |

#### Descrição curta

Bloco de boas-vindas para marca de posicionamento premium, quando o cupom precisa vir depois de um argumento de marca e não antes dele. Declara a missão em três parágrafos e só então entrega o código, sem nenhuma imagem.  

#### Descrição detalhada

Headline em duas escalas, três parágrafos curtos de manifesto, uma faixa de cupom dividida em duas metades de tratamento oposto, uma linha de aviso e um CTA sólido. Tudo centralizado, tudo em uma única cor sobre branco, sem imagem, borda de container, ícone ou divisor.  

Três mecanismos sustentam o bloco:  

Headline em duas escalas na mesma frase. A primeira linha vem em corpo reduzido e a continuação em corpo grande — não é sobrescrito mais título, é uma frase só que muda de tamanho no meio. A leitura atravessa a quebra.  
Cupom bipartido. O rótulo fica numa metade de contorno tracejado e sem preenchimento; o código fica na outra metade em bloco chapado com texto invertido. As duas metades encostam e formam uma faixa única — é a única figura geométrica da peça.  
Cor única em tudo. O mesmo verde aparece no texto, no tracejado, no bloco do código e no CTA. Sem segunda cor e sem preto, o bloco fica leve o bastante para o cupom não parecer promoção agressiva.  

#### Contexto para a IA

##### Quando usar

Welcome de marca premium, onde o cupom precisa vir depois do argumento e não como manchete.  
Categoria em que a compra é por identificação com a marca: moda autoral, couro, joalheria, perfumaria, decoração.  
Quando a marca tem uma missão escrita que se sustenta em três frases.  
Como e-mail inteiro e curto, ou como fechamento de uma peça que já mostrou produto.  

##### Quando NÃO usar

Campanha promocional com percentual alto. O bloco esconde o desconto atrás de três parágrafos e não tem nenhum slot para o valor da oferta.  
Marca sem discurso próprio. Sem manifesto real, os três parágrafos viram texto de preenchimento e a peça fica vazia.  
Quando o produto precisa aparecer. Não existe slot de imagem.  
Público frio que ainda não sabe o que a loja vende. O manifesto pressupõe contexto.  
Marca informal ou popular — o tom da variante é contido por construção.  

##### Orientações de copy para a IA

A headline é uma frase só, quebrada em duas escalas. A primeira parte é curta e abre a ideia; a segunda fecha em corpo grande. Escrever como sentença contínua e depois decidir onde cortar — nunca escrever a primeira parte como rótulo.  
Três parágrafos com funções fixas: o primeiro declara a missão e cita matéria-prima ou método; o segundo diz o que o cliente ganha ao escolher; o terceiro fecha no detalhe e na pessoa.  
Cada parágrafo cabe em 2 ou 3 linhas. É a única regra rígida da copy aqui — o bloco perde a leveza com parágrafo de 4 linhas.  
Frase de manifesto, não de venda. Sem verbo no imperativo até chegar no CTA, sem percentual, sem urgência dentro dos parágrafos.  
O rótulo do cupom é uma palavra com dois-pontos. Nunca "use o código" ou frase completa — a metade tracejada é estreita.  
O aviso de prazo é vago de propósito e fica em caixa alta e corpo pequeno. É a única urgência da peça e ela não pode competir com o manifesto.  
CTA de descoberta, não de compra. "Descobrir", "conhecer", "explorar" — coerente com um bloco que não mostrou produto nenhum.  

##### Design system

Container: 600px travado, fundo branco chapado. Sem borda, painel, card ou divisor.  

Tipografia principal: Montserrat (fallback Arial, Helvetica, sans-serif), uma única família em todos os elementos. Não há tipografia secundária.  

| Bloco | Tamanho / entrelinha | Peso | Caixa |  
|---|---|---|---|  
| Primeira linha da headline | ~23 | 400 | ALTA |  
| Headline | ~54 / 48 | 400 | ALTA |  
| Parágrafos do manifesto | 23 / 23 | 400 | Sentença |  
| Rótulo do cupom | 30 | 400 | ALTA |  
| Código do cupom | 30 | 700 | ALTA |  
| Aviso de prazo | 17 | 400 | ALTA, tracking 0.02em |  
| Label do CTA | 24 | 400 | ALTA |  

Cores. Cor primária   
#388261 — o mesmo verde em absolutamente tudo: texto, tracejado, bloco do código e fundo do CTA. Cor secundária   
#FFFFFF, usada no fundo da peça, no código dentro do bloco verde e no label do CTA. Não há terceira cor e não há preto.  

Grade e ritmo vertical (medido):  

   ↓ 37px  
primeira linha da headline   y 37–52, centralizada  
   ↓ 11px  
headline                     2 linhas, y 63–149, entrelinha 48  
   ↓ 43px  
parágrafo 1                  3 linhas, bloco de 464px  
   ↓ 24px  
parágrafo 2                  2 linhas  
   ↓ 24px  
parágrafo 3                  3 linhas  
   ↓ 51px  
FAIXA DE CUPOM               464 × 66 (x 67–530), cantos retos  
                             metade esquerda 197 — contorno tracejado, sem preenchimento  
                             metade direita 267 — bloco chapado #388261, texto branco  
   ↓ 13px  
aviso de prazo               y 545–556, centralizado  
   ↓ 39px  
CTA                          293 × 61 (x 153–446), raio 5, fundo #388261  
   ↓ 81px  

Regras que não podem ser quebradas:  

Uma cor só. Qualquer segundo tom quebra a variante.  
As duas metades do cupom encostam sem folga e têm a mesma altura. O tracejado só existe na metade do rótulo.  
O código do cupom é a única coisa em peso 700 da peça inteira. Headline, parágrafos, rótulo e CTA são todos regulares.  
A headline tem entrelinha menor que o corpo da fonte (48 contra ~54). O aperto é o que dá a aparência editorial.  
Zero imagem, zero ícone, zero divisor, zero borda de container.  
O CTA tem raio pequeno (5) e a faixa de cupom tem canto reto. Nenhum elemento é arredondado de verdade.  
Tudo centralizado.  

##### Direção fotográfica

_(vazio)_

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `manifesto_headline_lead` | `{{MANIFESTO_HEADLINE_LEAD}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `manifesto_headline` | `{{MANIFESTO_HEADLINE}}` | Texto curto | Copy (n8n) | não | 30 | sim |
| `manifesto_body_1` | `{{MANIFESTO_BODY_1}}` | Texto curto | Copy (n8n) | não | 125 | sim |
| `manifesto_body_2` | `{{MANIFESTO_BODY_2}}` | Texto curto | Copy (n8n) | não | 125 | sim |
| `manifesto_body_3` | `{{MANIFESTO_BODY_3}}` | Texto curto | Copy (n8n) | não | 125 | não |
| `manifesto_coupon_label` | `{{MANIFESTO_COUPON_LABEL}}` | Texto curto | Copy (n8n) | não | 10 | não |
| `manifesto_coupon_code` | `{{MANIFESTO_COUPON_CODE}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `manifesto_coupon_note` | `{{MANIFESTO_COUPON_NOTE}}` | Texto curto | Copy (n8n) | não | 34 | sim |
| `manifesto_cta_label` | `{{MANIFESTO_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 16 | não |

**Detalhe dos campos**

- **`manifesto_headline_lead`**
    - *Exemplo:* Where Refined
- **`manifesto_headline`**
    - *Exemplo:* Taste Finds Its Match
- **`manifesto_body_1`**
    - *Exemplo:* Our mission: to craft bags that honor your elegance through genuine leather, timeless design, and European artistry.
- **`manifesto_body_2`**
    - *Exemplo:* With our curated collection, you discover pieces that speak before you say a word.
- **`manifesto_body_3`**
    - *Exemplo:* Every detail, every stitch, designed to accompany the woman you've always been.
- **`manifesto_coupon_label`**
    - *Exemplo:* Coupon:
- **`manifesto_coupon_code`**
    - *Exemplo:* WELCOME10
- **`manifesto_coupon_note`**
    - *Exemplo:* Available for a limited time
- **`manifesto_cta_label`**
    - *Exemplo:* Discover Now

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Where Refined Taste Finds Its Match</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-verde { color:#388261 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- EYEBROW + HEADLINE -->
    <tr>
      <td align="center" class="txt-verde" style="padding:35px 68px 0 68px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:22px;line-height:20px;font-weight:400;letter-spacing:0.02em;text-transform:uppercase;color:#388261;">
        Where Refined
      </td>
    </tr>
    <tr>
      <td align="center" class="txt-verde" style="padding:0 68px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:46px;line-height:46px;font-weight:400;text-transform:uppercase;color:#388261;">
        Taste Finds Its Match
      </td>
    </tr>


    <!-- COPY — três parágrafos -->
    <tr>
      <td align="center" style="padding:43px 0 0 0;">
        <table role="presentation" width="470" cellpadding="0" cellspacing="0" border="0" style="width:470px;">
          <tr>
            <td align="center" class="txt-verde" style="width:470px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:23px;line-height:23px;font-weight:400;color:#388261;">
              Our mission: to craft bags that honor your elegance through genuine leather, timeless design, and European artistry.
            </td>
          </tr>
          <tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" class="txt-verde" style="width:470px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:23px;line-height:23px;font-weight:400;color:#388261;">
              With our curated collection, you discover pieces that speak before you say a word.
            </td>
          </tr>
          <tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" class="txt-verde" style="width:470px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:23px;line-height:23px;font-weight:400;color:#388261;">
              Every detail, every stitch, designed to accompany the woman you&rsquo;ve always been.
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CUPOM -->
    <tr>
      <td align="center" style="padding:37px 0 0 0;">
        <table role="presentation" width="466" cellpadding="0" cellspacing="0" border="0" style="width:466px;">
          <tr>
            <td width="198" align="center" valign="middle" height="66" class="txt-verde"
                style="width:198px;height:66px;border:1px dashed #388261;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:400;color:#388261;text-align:center;">
              COUPON:
            </td>
            <td width="268" align="center" valign="middle" class="txt-wht"
                style="width:268px;height:66px;background:#388261;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:700;color:#FFFFFF;text-align:center;">
              WELCOME10
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- AVISO -->
    <tr>
      <td align="center" class="txt-verde" style="padding:12px 60px 0 60px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:16px;line-height:13px;font-weight:400;letter-spacing:0.02em;text-transform:uppercase;color:#388261;">
        Available for a limited time
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:37px 0 74px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:62px;v-text-anchor:middle;width:294px;" arcsize="8%" stroke="f" fillcolor="#388261">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:24px;">DISCOVER NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" width="294" cellpadding="0" cellspacing="0" border="0" style="width:294px;">
          <tr>
            <td align="center" height="62" style="width:294px;height:62px;background:#388261;border-radius:5px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:294px;height:62px;line-height:62px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">
                DISCOVER NOW
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-5a34dbaf"></a>

### 7.5 · offer 5 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Oferta / Promo / Desconto (`offer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 6.4 KB |
| **ID** | `5a34dbaf-6710-4282-8b7b-3c03921bd6fc` |

#### Descrição curta

Bloco de diferenciação com cupom no fim, para quando o argumento de compra é a qualidade e não o preço. Lista três diferenciais em parágrafos densos e só entrega o código depois de o leitor ter lido os três.  

#### Descrição detalhada

Régua fina de cor no topo, headline em duas partes — a primeira dentro de uma etiqueta chapada e a segunda solta abaixo em corpo grande —, três parágrafos de diferencial com abertura em negrito, faixa de cupom bipartida e CTA sólido. Tudo centralizado, tudo em uma cor sobre branco, sem imagem.  

Três mecanismos sustentam o bloco:  

Headline partida entre etiqueta e texto solto. A primeira metade da frase fica invertida dentro de um bloco chapado; a segunda fica embaixo, em corpo quase o dobro, na cor de fundo da etiqueta. As duas partes formam uma frase só e a inversão de cor é o que marca a quebra.  
Abertura em negrito como sub-rótulo. Cada parágrafo começa com o nome do diferencial em negrito, terminado em dois-pontos, e emenda no texto explicativo na mesma linha. É o que permite três blocos densos de quatro linhas sem virar parede de texto.  
Cupom depois do argumento. O código só aparece no penúltimo elemento, depois dos três diferenciais. O bloco não abre com desconto — abre com qualidade.  

#### Contexto para a IA

##### Quando usar

Objeção de preço em marca premium: o cliente achou caro e precisa entender o que está pagando.  
Welcome de segunda ou terceira posição, depois de a marca já ter se apresentado.  
Categoria em que os diferenciais são verificáveis: matéria-prima, garantia, logística, atendimento.  
Quando existem exatamente três diferenciais fortes. Dois deixam a peça curta, quatro cansam.  

##### Quando NÃO usar

Campanha promocional. O cupom aqui é fechamento, não manchete, e não há slot para percentual em destaque.  
Marca sem diferencial concreto. Três parágrafos de adjetivo expõem a falta de argumento.  
Público que ainda não sabe o que a loja vende — o bloco pressupõe categoria conhecida.  
Quando o produto precisa aparecer. Não há slot de imagem.  

##### Orientações de copy para a IA

A headline é uma frase só, partida entre a etiqueta e o texto solto. Escrever como sentença contínua e cortar onde a etiqueta termina.  
Cada diferencial tem uma abertura nomeada em negrito, de 3 a 5 palavras, terminada em dois-pontos. Ela nomeia o diferencial, não o benefício.  
Os três diferenciais cobrem eixos distintos: o produto (matéria-prima ou método), o risco (garantia, devolução) e a experiência (entrega, atendimento, embalagem). Três variações do mesmo eixo desperdiçam o bloco.  
Cada parágrafo fecha com uma frase curta e cortada, no ritmo de negação ou de reforço — é o que impede o texto denso de ficar monótono.  
Nada de percentual ou urgência nos parágrafos. A oferta só existe na faixa de cupom.  
CTA na primeira pessoa do cliente, referindo o desconto que ele acabou de receber, não a loja.  

##### Design system

Container: 600px travado, fundo branco chapado. Sem borda, painel ou card.  

Tipografia principal: Montserrat (fallback Arial, Helvetica, sans-serif), família única em todos os elementos. Não há tipografia secundária.  

| Bloco | Tamanho / entrelinha | Peso | Caixa |  
|---|---|---|---|  
| Texto da etiqueta | 27 | 600 | ALTA |  
| Headline | ~53 / 42 | 700 | ALTA |  
| Abertura do diferencial | 14 / 19 | 700 | Title Case |  
| Corpo do diferencial | 14 / 19 | 400 | Sentença |  
| Rótulo do cupom | 34 | 400 | ALTA |  
| Código do cupom | 33 | 400 | ALTA |  
| Label do CTA | 24 | 400 | ALTA |  

Cores. Cor primária   
#388261 — em tudo: régua do topo, fundo da etiqueta, headline, corpo, código do cupom e CTA. Cor secundária   
#FFFFFF, no fundo da peça e nos textos sobre verde. O contorno tracejado do cupom é a única exceção, em   
#472967 (ver divergência 2).  

Grade e ritmo vertical (medido):  

régua de cor            600 × 2, no topo absoluto da seção  
   ↓ 29px  
ETIQUETA                274 × 39 (x 162–436), chapada, cantos retos  
   ↓ 3px  
headline                y 72–109, uma linha  
   ↓ 29px  
diferencial 1           4 linhas, bloco de 509px (x 45–553), entrelinha 19  
   ↓ 24px  
diferencial 2           4 linhas  
   ↓ 24px  
diferencial 3           4 linhas  
   ↓ 38px  
FAIXA DE CUPOM          451 × 64 (x 76–527), cantos retos  
                        metade esquerda 192 — contorno tracejado, sem preenchimento  
                        metade direita 259 — bloco chapado, texto branco  
   ↓ 17px  
CTA                     356 × 74 (x 125–481), raio 8  
   ↓ 35px  

Regras que não podem ser quebradas:  

A etiqueta e a headline encostam — 3px entre a base do bloco chapado e o topo das letras. Elas são uma frase só e não podem respirar entre si.  
A headline tem entrelinha bem menor que o corpo da fonte (42 contra ~53). O aperto é o que dá peso ao bloco.  
As duas metades do cupom encostam sem folga e têm a mesma altura. O tracejado só existe na metade do rótulo.  
A abertura em negrito e o corpo do diferencial ficam na mesma linha, sem quebra entre eles.  
Uma cor só em tudo. Zero imagem, ícone, divisor ou borda de container.  
Cantos retos na etiqueta e na faixa de cupom; só o CTA tem raio, e pequeno (8).  
Tudo centralizado, incluindo os parágrafos densos.  

##### Direção fotográfica

_(vazio)_

#### Schema de output (11 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `diff_label` | `{{DIFF_LABEL}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `diff_headline` | `{{DIFF_HEADLINE}}` | Texto curto | Copy (n8n) | não | 16 | sim |
| `diff_item_1_lead` | `{{DIFF_ITEM_1_LEAD}}` | Texto curto | Copy (n8n) | não | 42 | sim |
| `diff_item_1_body` | `{{DIFF_ITEM_1_BODY}}` | Texto curto | Copy (n8n) | não | 260 | sim |
| `diff_item_2_lead` | `{{DIFF_ITEM_2_LEAD}}` | Texto curto | Copy (n8n) | não | 42 | sim |
| `diff_item_2_body` | `{{DIFF_ITEM_2_BODY}}` | Texto curto | Copy (n8n) | não | 60 | não |
| `diff_item_3_lead` | `{{DIFF_ITEM_3_LEAD}}` | Texto curto | Copy (n8n) | não | 42 | sim |
| `diff_item_3_body` | `{{DIFF_ITEM_3_BODY}}` | Texto curto | Copy (n8n) | não | 260 | sim |
| `diff_coupon_label` | `{{DIFF_COUPON_LABEL}}` | Texto curto | Copy (n8n) | não | 10 | não |
| `diff_coupon_code` | `{{DIFF_COUPON_CODE}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `diff_cta_label` | `{{DIFF_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | não |

**Detalhe dos campos**

- **`diff_label`**
    - *Exemplo:* What Makes
- **`diff_headline`**
    - *Exemplo:* Us Different
- **`diff_item_1_lead`**
    - *Exemplo:* Genuine Leather, Curated at the Source:
- **`diff_item_1_body`**
    - *Exemplo:* Every Luxcoeur bag is crafted from full-grain leather selected through our European sourcing process, chosen for texture, durability, and the way it ages into something even more beautiful. Not leather-look. Not bonded. Genuine.
- **`diff_item_2_lead`**
    - *Exemplo:* Confidence-Backed Purchase:
- **`diff_item_2_body`**
    - *Exemplo:* We believe in our bags completely. That's why every order ships with our quality assurance commitment, if your piece doesn't meet the standard we promise, we make it right. No complications.
- **`diff_item_3_lead`**
    - *Exemplo:* White-Glove Experience, Worldwide:
- **`diff_item_3_body`**
    - *Exemplo:* From the moment you place your order to the day it arrives, our dedicated concierge team ensures every detail is attended to. Free worldwide shipping. Elegant packaging. Support that reflects the same standard as the bag inside.
- **`diff_coupon_label`**
    - *Exemplo:* Coupon:
- **`diff_coupon_code`**
    - *Exemplo:* WELCOME10
- **`diff_cta_label`**
    - *Exemplo:* Use My Discount Now

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — What Makes Us Different</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-verde { color:#388261 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- ETIQUETA VERDE -->
    <tr>
      <td align="center" style="padding:29px 0 0 0;">
        <table role="presentation" width="274" cellpadding="0" cellspacing="0" border="0" style="width:274px;">
          <tr>
            <td align="center" valign="middle" height="39" class="txt-wht"
                style="width:274px;height:39px;background:#388261;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:27px;line-height:39px;font-weight:600;text-transform:uppercase;color:#FFFFFF;text-align:center;">
              What Makes
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- HEADLINE -->
    <tr>
      <td align="center" class="txt-verde" style="padding:0 68px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:51px;line-height:42px;font-weight:700;text-transform:uppercase;color:#388261;">
        Us Different
      </td>
    </tr>


    <!-- COPY — três blocos -->
    <tr>
      <td align="center" style="padding:24px 0 0 0;">
        <table role="presentation" width="513" cellpadding="0" cellspacing="0" border="0" style="width:513px;">
          <tr>
            <td align="center" class="txt-verde" style="width:513px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:400;color:#388261;">
              <strong style="font-weight:700;">Genuine Leather, Curated at the Source:</strong> Every Luxcoeur bag is crafted from full-grain leather selected through our European sourcing process, chosen for texture, durability, and the way it ages into something even more beautiful. Not leather-look. Not bonded. Genuine.
            </td>
          </tr>
          <tr><td height="21" style="height:21px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" class="txt-verde" style="width:513px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:400;color:#388261;">
              <strong style="font-weight:700;">Confidence-Backed Purchase:</strong> We believe in our bags completely. That&rsquo;s why every order ships with our quality assurance commitment, if your piece doesn&rsquo;t meet the standard we promise, we make it right. No complications.
            </td>
          </tr>
          <tr><td height="21" style="height:21px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" class="txt-verde" style="width:513px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:400;color:#388261;">
              <strong style="font-weight:700;">White-Glove Experience, Worldwide:</strong> From the moment you place your order to the day it arrives, our dedicated concierge team ensures every detail is attended to. Free worldwide shipping. Elegant packaging. Support that reflects the same standard as the bag inside.
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CUPOM -->
    <tr>
      <td align="center" style="padding:30px 0 0 0;">
        <table role="presentation" width="452" cellpadding="0" cellspacing="0" border="0" style="width:452px;">
          <tr>
            <td width="192" align="center" valign="middle" height="64" class="txt-verde"
                style="width:192px;height:64px;border:1px dashed #472967;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:34px;line-height:38px;font-weight:400;text-transform:uppercase;color:#388261;text-align:center;">
              COUPON:
            </td>
            <td width="260" align="center" valign="middle" class="txt-wht"
                style="width:260px;height:64px;background:#388261;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:33px;line-height:38px;font-weight:400;color:#FFFFFF;text-align:center;">
              WELCOME10
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA -->
    <tr>
      <td align="center" style="padding:15px 0 34px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:75px;v-text-anchor:middle;width:357px;" arcsize="10%" stroke="f" fillcolor="#388261">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:24px;">USE MY DISCOUNT NOW</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <table role="presentation" width="357" cellpadding="0" cellspacing="0" border="0" style="width:357px;">
          <tr>
            <td align="center" height="75" style="width:357px;height:75px;background:#388261;border-radius:8px;">
              <a href="URL_DO_CTA_AQUI"
                 style="display:block;width:357px;height:75px;line-height:75px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">
                USE MY DISCOUNT NOW
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-1e45ed32"></a>

### 7.6 · offer 6 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Oferta / Promo / Desconto (`offer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 6.6 KB |
| **ID** | `1e45ed32-01c4-487c-bb60-f986623a3270` |

#### Descrição curta

E-mail inteiro de recuperação de carrinho para marca de contraste alto, dividido em dois blocos de fundo oposto: o branco mostra o que ficou no carrinho, o preto entrega o cupom e chama de volta. As duas metades são separadas por uma faixa de papel rasgado.  

#### Descrição detalhada

Faixa rasgada no topo, bloco branco com o título do carrinho e o bloco dinâmico de produto, segunda faixa rasgada como transição, e bloco preto com headline, sublinha da oferta, caixa de cupom em branco chapado, linha de apoio e CTA em pílula clara.  

Três mecanismos sustentam a peça:  

Inversão de fundo como divisão de função. O branco é informativo — lembra o que o cliente escolheu. O preto é persuasivo — reabre a oferta e chama. A troca de fundo faz a virada sem precisar de headline de seção.  
Faixa rasgada como emenda. As duas transições são ativos de imagem de 600 × 70 com borda irregular, não réguas retas nem cantos arredondados. É o único elemento decorativo da peça.  
Frase que atravessa a caixa do cupom. A linha depois da caixa começa em minúscula e continua a sentença iniciada dentro dela. O cupom é lido como parte da frase, não como bloco isolado.  

#### Contexto para a IA

##### Quando usar

Recuperação de carrinho ou de checkout com desconto ativo.  
Marca de identidade preto e branco, com contraste alto e sem paleta autoral.  
Categoria funcional em que o cliente compra por problema resolvido — controle de praga, ferramenta, limpeza, manutenção.  
Quando o e-commerce tem bloco dinâmico de produto configurado e o carrinho pode ser exibido de verdade.  

##### Quando NÃO usar

Sem bloco dinâmico funcionando. O bloco branco existe para mostrar o item salvo; com placeholder estático ele perde a razão de ser.  
Sem cupom. A caixa branca no bloco preto é o centro da metade de baixo.  
Marca com paleta de cor. A peça inteira depende da inversão branco/preto e não tem onde acomodar uma terceira cor.  
Como seção dentro de outro e-mail. As duas faixas rasgadas pressupõem que a peça começa e termina nela mesma.  

##### Orientações de copy para a IA

O título do bloco branco nomeia o que está ali, com dois-pontos, e nada além disso. Ele apresenta o bloco dinâmico, não vende.  
A headline do bloco preto é uma pergunta curta que devolve a decisão ao cliente, sem pressão e sem prazo.  
A sublinha reafirma que o desconto continua valendo, no presente. É lembrete de algo já concedido, não oferta nova.  
A caixa de cupom abre uma frase que a linha seguinte fecha. Escrever as duas partes juntas: a linha de apoio começa em minúscula e emenda na anterior.  
A linha de apoio fala do problema, não do produto — o que o cliente para de enfrentar ao concluir a compra.  
O CTA devolve ao carrinho, com posse ("seu carrinho"), não à loja.  

##### Design system

Container: 600px travado. Dois blocos de fundo:   
#FFFFFF na metade de cima e   
#000000 na de baixo, emendados por faixas rasgadas de 600 × 70.  

Tipografia principal: sans, uma única família em todos os elementos.  

| Bloco | Tamanho / entrelinha | Peso | Caixa |  
|---|---|---|---|  
| Título do carrinho | 32 / 33 | 400 | ALTA |  
| Headline do bloco preto | 40 / 60 | 400 | ALTA |  
| Sublinha da oferta | 32 / 48 | 400 | Sentença |  
| Texto do cupom | 32 / 44 | 400 | ALTA |  
| Linha de apoio | 24 / 33 | 400 | Sentença |  
| Label do CTA | 25 | 400 | Title Case |  

Cores. Cor primária   
#000000 e cor secundária   
#FFFFFF, invertendo de papel entre os dois blocos.   
#BBBBBB no preenchimento do CTA, com label preto — é o único tom intermediário da peça (ver divergência 3).  

Grade e ritmo vertical:  

faixa rasgada         600 × 70  
BLOCO BRANCO  
   ↓ 46px  
título do carrinho    centralizado  
   ↓ 60px  
bloco dinâmico        455 × 200, borda 1px #090909, cantos retos  
   ↓ 51px  
faixa rasgada         600 × 70  
BLOCO PRETO  
   ↓ 21px  
headline              centralizada  
   ↓ 25px  
sublinha da oferta  
   ↓ 28px  
CAIXA DO CUPOM        430 × 64, branco chapado, cantos retos, texto #171717  
   ↓ 28px  
linha de apoio  
   ↓ 43px  
CTA                   346 × 63, pílula, fundo #BBBBBB, label preto  
   ↓ 92px  

Regras que não podem ser quebradas:  

As faixas rasgadas são ativos de imagem, nunca borda ou raio. Cada uma tem que casar exatamente com a cor do bloco de cima e a do de baixo.  
O bloco dinâmico tem borda fina e canto reto. Ele é uma moldura para conteúdo de terceiro, não um card de design.  
A caixa do cupom é branco chapado sobre o preto, com canto reto — a inversão máxima da peça e o único retângulo claro dentro do bloco escuro.  
Só o CTA é arredondado, e totalmente (pílula). Todo o resto tem canto reto.  
Tudo centralizado nos dois blocos.  
Zero cor além de preto, branco e o cinza do CTA.  

##### Direção fotográfica

Não se aplica a fotografia — os dois slots de imagem são gráficos, não fotos.  

Faixas rasgadas: borda irregular de papel rasgado, com fibras e microrrasgos visíveis, sem sombra e sem textura de papel no corpo da faixa. Cada faixa é bicolor e chapada: metade da altura na cor do bloco de cima, metade na do de baixo, com o rasgo atravessando no meio. A da transição inverte a ordem em relação à do topo.  

#### Schema de output (9 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `cart_title` | `{{CART_TITLE}}` | Texto curto | Copy (n8n) | não | 22 | sim |
| `cart_headline` | `{{CART_HEADLINE}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `cart_offer_line` | `{{CART_OFFER_LINE}}` | Texto curto | Copy (n8n) | não | 40 | sim |
| `cart_coupon_label` | `{{CART_COUPON_LABEL}}` | Texto curto | Copy (n8n) | não | 12 | sim |
| `cart_coupon_code` | `{{CART_COUPON_CODE}}` | Texto curto | Copy (n8n) | não | 14 | sim |
| `cart_support_line` | `{{CART_SUPPORT_LINE}}` | Texto curto | Copy (n8n) | não | 56 | sim |
| `cart_cta_label` | `{{CART_CTA_LABEL}}` | Texto curto | Copy (n8n) | não | 24 | sim |
| `cart_tear_top` | `{{CART_TEAR_TOP}}` | Imagem | Imagem gerada | não | — | — |
| `cart_tear_middle` | `{{CART_TEAR_MIDDLE}}` | Imagem | Imagem gerada | não | — | — |

**Detalhe dos campos**

- **`cart_title`**
    - *Exemplo:* Your Saved Cart:
- **`cart_headline`**
    - *Exemplo:* Still Deciding?
- **`cart_offer_line`**
    - *Exemplo:* Your 00% discount is still active.
- **`cart_coupon_label`**
    - *Exemplo:* Use code:
- **`cart_coupon_code`**
    - *Exemplo:* CODE HERE
- **`cart_support_line`**
    - *Exemplo:* and take the frustration out of rodent control.
- **`cart_cta_label`**
    - *Exemplo:* Return To Your Cart
- **`cart_tear_top`**
    - *Orientação:* Onde: primeira linha da peça, acima do bloco branco.<br>Slot: 600 × 70 px display (1200 × 140 @2x) · sem proporção fixa (faixa) · PNG.
    - *Imagem:* 600 × 70 px
    - *Spec da imagem:* Como gerar: gerar como gráfico vetorial ou recorte, não como foto. Metade superior chapada na cor do bloco anterior, metade inferior na cor do bloco branco, com o rasgo atravessando na horizontal.<br>Ideia: borda de papel rasgado com fibras finas e microrrasgos, sem sombra e sem textura no corpo da faixa.
- **`cart_tear_middle`**
    - *Orientação:* Onde: entre o bloco branco e o bloco preto.<br>Slot: 600 × 70 px display (1200 × 140 @2x) · sem proporção fixa (faixa) · PNG.
    - *Imagem:* 600 × 70 px
    - *Spec da imagem:* Como gerar: idêntico ao slot anterior, com as cores invertidas — branco em cima, preto embaixo — e um desenho de rasgo diferente, para as duas faixas não parecerem a mesma imagem repetida.<br>Ideia: mesma linguagem de rasgo da faixa do topo, com o traçado espelhado ou redesenhado.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Email — Your Saved Cart</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- FAIXA RASGADA SUPERIOR -->
    <tr>
      <td style="padding:0;font-size:0;line-height:0;">
        <img src="URL_FAIXA_TOPO" width="600" height="70" alt=""
             style="display:block;width:600px;height:70px;background:#000000;">
      </td>
    </tr>


    <!-- ============ BLOCO BRANCO ============ -->
    <tr>
      <td style="padding:0;background:#FFFFFF;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">

          <tr>
            <td align="center" class="txt-blk" style="padding:46px 60px 0 60px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:33px;font-weight:400;text-transform:uppercase;color:#000000;">
              Your Saved Cart:
            </td>
          </tr>

          <!-- BLOCO DINÂMICO DO PRODUTO -->
          <tr>
            <td align="center" style="padding:60px 0 51px 0;">
              <table role="presentation" width="455" cellpadding="0" cellspacing="0" border="0"
                     style="width:455px;background:#FFFFFF;border:1px solid #090909;">
                <tr>
                  <td align="center" valign="middle" height="200" class="txt-blk"
                      style="width:455px;height:200px;padding:0 20px;font-family:'EB Garamond',Georgia,'Times New Roman',serif;font-size:24px;line-height:29px;font-weight:400;color:#000000;text-align:center;">
                    [klaviyo dynamic block]
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>


    <!-- FAIXA RASGADA DE TRANSIÇÃO -->
    <tr>
      <td style="padding:0;font-size:0;line-height:0;">
        <img src="URL_FAIXA_TRANSICAO" width="600" height="70" alt=""
             style="display:block;width:600px;height:70px;background:#FFFFFF;">
      </td>
    </tr>


    <!-- ============ BLOCO PRETO ============ -->
    <tr>
      <td style="padding:0;background:#000000;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">

          <!-- HEADLINE -->
          <tr>
            <td align="center" class="txt-wht" style="padding:21px 60px 0 60px;font-family:Arial,Helvetica,sans-serif;font-size:40px;line-height:60px;font-weight:400;letter-spacing:-0.011em;text-transform:uppercase;color:#FFFFFF;">
              Still Deciding?
            </td>
          </tr>

          <!-- SUBLINHA -->
          <tr>
            <td align="center" class="txt-wht" style="padding:25px 66px 0 66px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:48px;font-weight:400;letter-spacing:-0.011em;color:#FFFFFF;">
              Your 00% discount is still active.
            </td>
          </tr>

          <!-- CAIXA DO CUPOM -->
          <tr>
            <td align="center" style="padding:28px 0 0 0;">
              <table role="presentation" width="430" cellpadding="0" cellspacing="0" border="0" style="width:430px;">
                <tr>
                  <td align="center" valign="middle" height="64"
                      style="width:430px;height:64px;background:#FFFFFF;padding:0 10px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:44px;font-weight:400;text-transform:uppercase;color:#171717;text-align:center;">
                    Use code: CODE HERE
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- LINHA DE APOIO -->
          <tr>
            <td align="center" class="txt-wht" style="padding:28px 63px 0 63px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:33px;font-weight:400;color:#FFFFFF;">
              and take the frustration out of rodent control.
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:43px 0 92px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_DO_CTA_AQUI" style="height:63px;v-text-anchor:middle;width:346px;" arcsize="50%" stroke="f" fillcolor="#BBBBBB">
                <w:anchorlock/>
                <center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;">Return To Your Cart</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="346" cellpadding="0" cellspacing="0" border="0" style="width:346px;">
                <tr>
                  <td align="center" height="63" style="width:346px;height:63px;background:#BBBBBB;border-radius:100px;">
                    <a href="URL_DO_CTA_AQUI"
                       style="display:block;width:346px;height:63px;line-height:63px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:400;letter-spacing:-0.011em;color:#000000;text-decoration:none;text-align:center;">
                      Return To Your Cart
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```


---

## 8 · Footer

`footer` · 4 variantes (4 ativas · 66.7 KB de HTML)

<a id="v-35b5d8fd"></a>

### 8.1 · footer 1 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Footer (`footer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | — |
| **Tamanho do HTML** | 25.8 KB |
| **ID** | `35b5d8fd-59b5-4e0f-92ab-a180745242e0` |

#### Descrição curta

Footer padrão de e-commerce: logo, menu de navegação em grid 2×3 de botões outline, 4 ícones sociais com label e bloco legal de copyright + unsubscribe.  

#### Descrição detalhada

100% vivo exceto logo e ícones sociais: grid de links = table 2 col × 3 rows, cada célula um botão bulletproof outline (border 1px + padding, link no <a> cobrindo o texto). Ícones sociais = 4 PNGs pequenos (~34px) hospedados, com label em texto vivo abaixo — labels vivas garantem navegação mesmo com imagens bloqueadas. Bloco legal em texto vivo com o link de unsubscribe usando a variável nativa da ESP ({{unsubscribe}} do Omnisend) — nunca URL fixa. Gap de compliance da referência: falta o endereço físico do remetente, exigido por CAN-SPAM (e boa prática LGPD) — o template do arsenal deve adicionar uma linha de endereço acima do copyright, mesmo que a referência não tenha. Módulo opcional de UGC (visto nas camadas ocultas) pode virar variante da seção. Footer é o bloco mais reaproveitado do sistema: 1 configuração por cliente, repetida em todo e-mail.  

#### Contexto para a IA

##### Quando usar

Todo e-mail — footer é obrigatório. Esta variação (menu em botões grandes) favorece mobile (alvo de toque generoso) e clientes com 4–6 destinos de navegação relevantes (coleções, FAQ, rastreio, conta).  

##### Quando NÃO usar

Não se aplica "não usar footer" — mas esta variação específica não serve para clientes com menos de 4 links úteis (grid fica capenga; usar variante de lista horizontal simples) ou e-mails transacionais ultra-minimalistas.  

##### Orientações de copy para a IA

A IA não gera copy aqui — footer é configuração por cliente, não geração por campanha: labels de link vêm do onboarding do cliente (máx ~15 caracteres por label, caps), sociais são URLs fixas, legal é template com ano dinâmico e nome da empresa. Único texto sensível: a frase de unsubscribe deve ser clara e sem dark pattern ("Para cancelar a inscrição, clique aqui"), traduzida pro idioma do público.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (3 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `footer_copyright` | `{{FOOTER_COPYRIGHT}}` | Texto curto | Copy (n8n) | não | 44 | não |
| `footer_unsub_text` | `{{FOOTER_UNSUB_TEXT}}` | Texto curto | Copy (n8n) | não | 60 | sim |
| `footer_unsub_label` | `{{FOOTER_UNSUB_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | sim |

**Detalhe dos campos**

- **`footer_copyright`**
    - *Exemplo:* Copyright © 2025, Company Name
    - *Orientação:* Nome da marca e ano. Mantenha o formato 'Copyright © ANO, MARCA'.
- **`footer_unsub_text`**
    - *Exemplo:* If you would like to unsubscribe, click
    - *Orientação:* Frase curta no idioma da loja.
- **`footer_unsub_label`**
    - *Exemplo:* Unsubscribe
    - *Orientação:* Use um termo com a raiz 'descadastr' (ex.: 'Descadastrar'). O check de compliance procura por essa palavra no HTML final.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Rodapé</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FDFDFD; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FDFDFD;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FDFDFD;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FDFDFD;">

    <!-- LOGO -->
    <tr>
      <td align="center" style="padding:35px 0 0 0;font-size:0;line-height:0;">
        <a href="URL_DO_SITE_AQUI">
          <img src="URL_DO_LOGO_AQUI" width="197" height="60" alt="NOME_DA_MARCA"
               style="display:block;width:197px;height:60px;">
        </a>
      </td>
    </tr>


    <!-- ============ GRADE DE LINKS (3 linhas x 2 colunas) ============ -->
    <tr>
      <td style="padding:23px 50px 0 50px;">
        <table role="presentation" width="500" cellpadding="0" cellspacing="0" border="0" style="width:500px;">

          <!-- linha 1 -->
          <tr>
            <td width="240" style="width:240px;">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;">
                <tr>
                  <td align="center" height="50" style="width:240px;height:50px;border:2px solid #000000;">
                    <a href="URL_LINK_1" class="txt-blk" style="display:block;width:236px;height:46px;line-height:46px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">Link Here</a>
                  </td>
                </tr>
              </table>
            </td>
            <td width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="240" style="width:240px;">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;">
                <tr>
                  <td align="center" height="50" style="width:240px;height:50px;border:2px solid #000000;">
                    <a href="URL_LINK_2" class="txt-blk" style="display:block;width:236px;height:46px;line-height:46px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">Link Here</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td colspan="3" height="20" style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- linha 2 -->
          <tr>
            <td style="width:240px;">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;">
                <tr>
                  <td align="center" height="50" style="width:240px;height:50px;border:2px solid #000000;">
                    <a href="URL_LINK_3" class="txt-blk" style="display:block;width:236px;height:46px;line-height:46px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">Link Here</a>
                  </td>
                </tr>
              </table>
            </td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:240px;">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;">
                <tr>
                  <td align="center" height="50" style="width:240px;height:50px;border:2px solid #000000;">
                    <a href="URL_LINK_4" class="txt-blk" style="display:block;width:236px;height:46px;line-height:46px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">Link Here</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td colspan="3" height="20" style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- linha 3 -->
          <tr>
            <td style="width:240px;">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;">
                <tr>
                  <td align="center" height="50" style="width:240px;height:50px;border:2px solid #000000;">
                    <a href="URL_LINK_5" class="txt-blk" style="display:block;width:236px;height:46px;line-height:46px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">Link Here</a>
                  </td>
                </tr>
              </table>
            </td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:240px;">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;">
                <tr>
                  <td align="center" height="50" style="width:240px;height:50px;border:2px solid #000000;">
                    <a href="URL_LINK_6" class="txt-blk" style="display:block;width:236px;height:46px;line-height:46px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">Link Here</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>


    <!-- ============ ÍCONES SOCIAIS ============ -->
    <tr>
      <td align="center" style="padding:47px 0 0 0;">
        <table role="presentation" width="384" cellpadding="0" cellspacing="0" border="0" style="width:384px;">
          <tr>
            <td width="72" align="center" valign="bottom" style="width:72px;font-size:0;line-height:0;">
              <a href="URL_FACEBOOK"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAAG…[base64 de ~2 KB omitido]…" width="42" height="42" alt="Facebook" style="display:block;width:42px;height:42px;"></a>
            </td>
            <td width="41" style="width:41px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="73" align="center" valign="bottom" style="width:73px;font-size:0;line-height:0;">
              <a href="URL_INSTAGRAM"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAAZ…[base64 de ~9 KB omitido]…" width="42" height="42" alt="Instagram" style="display:block;width:42px;height:42px;"></a>
            </td>
            <td width="58" style="width:58px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="46" align="center" valign="bottom" style="width:46px;font-size:0;line-height:0;">
              <a href="URL_TIKTOK"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAAI…[base64 de ~3 KB omitido]…" width="42" height="42" alt="TikTok" style="display:block;width:42px;height:42px;"></a>
            </td>
            <td width="44" style="width:44px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="63" align="center" valign="bottom" style="width:63px;font-size:0;line-height:0;">
              <a href="URL_YOUTUBE"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAAF…[base64 de ~2 KB omitido]…" width="42" height="42" alt="YouTube" style="display:block;width:42px;height:42px;"></a>
            </td>
          </tr>
          <tr>
            <td colspan="7" height="6" style="height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" class="txt-blk" style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;font-weight:400;letter-spacing:-0.01em;color:#000000;">Facebook</td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td align="center" class="txt-blk" style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;font-weight:400;letter-spacing:-0.01em;color:#000000;">Instagram</td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td align="center" class="txt-blk" style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;font-weight:400;letter-spacing:-0.01em;color:#000000;">TikTok</td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td align="center" class="txt-blk" style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:16px;line-height:18px;font-weight:400;letter-spacing:-0.01em;color:#000000;">YouTube</td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ COPYRIGHT E UNSUBSCRIBE ============ -->
    <tr>
      <td align="center" class="txt-blk" style="padding:45px 60px 0 60px;font-family:Raleway,Arial,Helvetica,sans-serif;font-size:16px;line-height:19px;font-weight:400;color:#000000;">
        Copyright &copy; 2025, Company Name
      </td>
    </tr>
    <tr>
      <td align="center" class="txt-blk" style="padding:5px 60px 21px 60px;font-family:Raleway,Arial,Helvetica,sans-serif;font-size:16px;line-height:19px;font-weight:400;color:#000000;">
        If you would like to unsubscribe, click <a href="URL_UNSUBSCRIBE" style="color:#000000;text-decoration:underline;">Unsubscribe</a>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-85557ad0"></a>

### 8.2 · footer 2 — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Footer (`footer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | light_bg, no_border, single_col, standalone_component, footer, compliance_footer, pill_logo, rounded_logo, menu_buttons, five_links, two_two_one_layout, social_icons, three_socials, unsubscribe, copyright, no_mso_fallback, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 9.7 KB |
| **ID** | `85557ad0-dc20-48fa-8baf-b14c2e1a147b` |

#### Descrição curta

Footer de alto contraste: menu em 5 botões sólidos (2×2 + 1 full-width de destaque), 3 ícones sociais sem label e bloco legal com unsubscribe em evidência.  

#### Descrição detalhada

Mesma base técnica do footer outline: table de botões bulletproof (aqui com background sólido — contraste máximo, melhor CTR de rodapé), ícones = PNGs pequenos, legal vivo com variável de unsubscribe da ESP. O quinto botão full-width = row própria com colspan. Ícones sem label: mais limpo, porém sem fallback quando imagens bloqueadas — mitigar com alt text em cada ícone. Mesmo gap de compliance da referência anterior: sem endereço físico — o template adiciona. Diferença de acessibilidade a favor: botões sólidos têm contraste AA garantido em qualquer paleta escura sobre clara.  

#### Contexto para a IA

##### Quando usar

Clientes de identidade bold/alto contraste (streetwear, fitness, food casual) e quando existe um destino prioritário que merece o botão full-width. Footer alternativo ao outline — a escolha entre os dois é estética da marca, não funcional.  

##### Quando NÃO usar

Marcas de estética leve/minimalista clara (botões sólidos pesam visualmente — usar o outline). Clientes com 6+ links iguais em prioridade (a hierarquia 4+1 força uma escolha).  

##### Orientações de copy para a IA

Configuração por cliente, sem geração por campanha (mesma regra do outro footer). Labels curtos em caps (~12 caracteres). O link full-width recebe o destino de maior valor comercial ("SHOP ALL", "NOVIDADES"). Frase de unsubscribe direta e visível — a referência até a coloca acima do copyright, bom sinal de compliance.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (3 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `footer_unsub_text` | `{{FOOTER_UNSUB_TEXT}}` | Texto curto | Copy (n8n) | não | 60 | sim |
| `footer_unsub_label` | `{{FOOTER_UNSUB_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `footer_copyright` | `{{FOOTER_COPYRIGHT}}` | Texto curto | Copy (n8n) | não | 60 | não |

**Detalhe dos campos**

- **`footer_unsub_text`**
    - *Exemplo:* No longer want to receive these emails?
    - *Orientação:* Pergunta curta no idioma da loja.
- **`footer_unsub_label`**
    - *Exemplo:* Unsubscribe
    - *Orientação:* Use um termo com a raiz 'descadastr' (ex.: 'Descadastrar'). O check de compliance procura por essa palavra no HTML final.
- **`footer_copyright`**
    - *Exemplo:* © 2025 brand name. All rights reserved.
    - *Orientação:* Ano, nome da marca e reserva de direitos.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Rodapé 2</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#FFFFFF;">

    <!-- LOGO -->
    <tr>
      <td align="center" style="padding:44px 0 0 0;font-size:0;line-height:0;">
        <a href="URL_DO_SITE_AQUI">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQ4AAABhCAIAAACoBtjJAAAC…[base64 de ~1 KB omitido]…" width="270" height="97" alt="NOME_DA_MARCA"
               style="display:block;width:270px;height:97px;">
        </a>
      </td>
    </tr>


    <!-- ============ BOTÕES 2x2 ============ -->
    <tr>
      <td style="padding:35px 34px 0 34px;">
        <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">

          <tr>
            <td width="256" style="width:256px;">
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#000000;">
                  <a href="URL_LINK_1" style="display:block;width:256px;height:62px;line-height:62px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
                </td></tr>
              </table>
            </td>
            <td width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="256" style="width:256px;">
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#000000;">
                  <a href="URL_LINK_2" style="display:block;width:256px;height:62px;line-height:62px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
                </td></tr>
              </table>
            </td>
          </tr>

          <tr><td colspan="3" height="11" style="height:11px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="width:256px;">
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#000000;">
                  <a href="URL_LINK_3" style="display:block;width:256px;height:62px;line-height:62px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
                </td></tr>
              </table>
            </td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:256px;">
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#000000;">
                  <a href="URL_LINK_4" style="display:block;width:256px;height:62px;line-height:62px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
                </td></tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>

    <!-- BOTÃO LARGO -->
    <tr>
      <td align="center" style="padding:10px 0 0 0;">
        <table role="presentation" width="435" cellpadding="0" cellspacing="0" border="0" style="width:435px;">
          <tr><td align="center" height="62" style="width:435px;height:62px;background:#000000;">
            <a href="URL_LINK_5" style="display:block;width:435px;height:62px;line-height:62px;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
          </td></tr>
        </table>
      </td>
    </tr>


    <!-- ============ ÍCONES SOCIAIS ============ -->
    <tr>
      <td align="center" style="padding:56px 0 0 0;">
        <table role="presentation" width="141" cellpadding="0" cellspacing="0" border="0" style="width:141px;">
          <tr>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_FACEBOOK"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAB…[base64 de ~1 KB omitido]…" width="27" height="27" alt="Facebook" style="display:block;width:27px;height:27px;"></a>
            </td>
            <td width="30" style="width:30px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_INSTAGRAM"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAC…[base64 de ~1 KB omitido]…" width="27" height="27" alt="Instagram" style="display:block;width:27px;height:27px;"></a>
            </td>
            <td width="30" style="width:30px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_YOUTUBE"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAB…[base64 de ~1 KB omitido]…" width="27" height="27" alt="YouTube" style="display:block;width:27px;height:27px;"></a>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ UNSUBSCRIBE ============ -->
    <tr>
      <td align="center" class="txt-blk" style="padding:44px 27px 40px 27px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:26px;font-weight:400;letter-spacing:0.05em;color:#000000;">
        No longer want to receive these emails? <a href="URL_UNSUBSCRIBE" style="color:#000000;text-decoration:underline;">Unsubscribe</a>.<br>
        &copy; 2025 brand name. All rights reserved.
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-a2bb5abd"></a>

### 8.3 · footer 3 - dark — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Footer (`footer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | dark_bg, full_dark, single_col, standalone_component, footer, compliance_footer, giant_logo, text_links, three_links, divider_lines, stacked_links, social_icons, three_socials, company_address, unsubscribe, manage_preferences, mobile_responsive, mobile_safe |
| **Tamanho do HTML** | 16.0 KB |
| **ID** | `a2bb5abd-931e-4884-aae7-627b11c75f19` |

#### Descrição curta

Footer dark editorial: logo tipográfico oversized, 3 links de texto entre hairlines, sociais em círculos e bloco legal completo (endereço + unsubscribe + preferências).  

#### Descrição detalhada

Fundo preto sólido, tudo vivo exceto ícones. Logo: se o cliente tem wordmark simples, renderizar como texto gigante vivo (como na referência — sobrevive a imagens bloqueadas); logos complexos viram imagem. Links = rows de texto centralizadas com border-top/bottom 1px na TD (hairlines full-width, zero botão). Ícones em círculo = PNGs prontos com o círculo embutido (border-radius em imagem não rola no Outlook). É a referência de compliance do arsenal: endereço físico presente, unsubscribe destacado em cor, e link de preference center — o "Manage my preferences" reduz unsubscribes totais oferecendo redução de frequência como alternativa; usar a URL de preference center da ESP. Os outros dois footers devem herdar essas três linhas legais deste.  

#### Contexto para a IA

##### Quando usar

Marcas fashion/lifestyle de identidade forte e estética escura, com poucos destinos de navegação (3 links máx) e presença visual em redes (IG/TikTok/Pinterest). Quando o cliente tem preference center configurado na ESP.  

##### Quando NÃO usar

Clientes que precisam de 4+ links de rodapé (estrutura comporta 3 — mais que isso, usar os footers de grid). Marcas claras/leves (inverter a paleta descaracteriza; usar o outline).  

##### Orientações de copy para a IA

Configuração por cliente (mesma regra dos outros footers). Labels de link minúsculos e editoriais (~10 caracteres). Endereço físico completo obrigatório. Frase de unsubscribe + "Gerenciar preferências" na linha seguinte, ambos linkados.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (4 campos)

| Chave | Placeholder | Tipo | Natureza | Obrig. | Máx. | Exemplo no HTML |
|---|---|---|---|---|---|---|
| `footer_address` | `{{FOOTER_ADDRESS}}` | Texto curto | Copy (n8n) | não | 90 | sim |
| `footer_unsub_text` | `{{FOOTER_UNSUB_TEXT}}` | Texto curto | Copy (n8n) | não | 60 | sim |
| `footer_unsub_label` | `{{FOOTER_UNSUB_LABEL}}` | Texto curto | Copy (n8n) | não | 20 | sim |
| `footer_prefs_label` | `{{FOOTER_PREFS_LABEL}}` | Texto curto | Copy (n8n) | não | 30 | sim |

**Detalhe dos campos**

- **`footer_address`**
    - *Exemplo:* 85 Great Portland Street, London, United Kingdom W1W 7LT
    - *Orientação:* Endereço físico da loja em uma linha. Exigido por CAN-SPAM em envio internacional.
- **`footer_unsub_text`**
    - *Exemplo:* No longer want to receive these emails?
    - *Orientação:* Pergunta curta no idioma da loja.
- **`footer_unsub_label`**
    - *Exemplo:* Unsubscribe
    - *Orientação:* Use um termo com a raiz 'descadastr' (ex.: 'Descadastrar'). O check de compliance procura por essa palavra no HTML final.
- **`footer_prefs_label`**
    - *Exemplo:* Manage my preferences
    - *Orientação:* Rótulo do link para a central de preferências de e-mail.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Rodapé 3 — escuro</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#000000; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* trava o branco sobre o preto no dark mode */
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#000000;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#000000;">

    <!-- LOGO TIPOGRÁFICO -->
    <tr>
      <td align="center" class="txt-wht" style="padding:0 40px;font-family:Arial,Helvetica,sans-serif;font-size:129px;line-height:169px;font-weight:700;color:#FFFFFF;">
        LOGO
      </td>
    </tr>


    <!-- ============ LINKS EMPILHADOS ============ -->
    <tr>
      <td align="center" style="padding:0 40px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;">
          <tr>
            <td align="center" height="60" style="width:520px;height:60px;">
              <a href="URL_LINK_1" class="txt-wht" style="display:block;width:520px;height:60px;line-height:60px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
            </td>
          </tr>
          <tr>
            <td align="center" height="60" style="width:520px;height:60px;border-top:1px solid #FFFFFF;">
              <a href="URL_LINK_2" class="txt-wht" style="display:block;width:520px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
            </td>
          </tr>
          <tr>
            <td align="center" height="60" style="width:520px;height:60px;border-top:1px solid #FFFFFF;">
              <a href="URL_LINK_3" class="txt-wht" style="display:block;width:520px;height:59px;line-height:59px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:400;color:#FFFFFF;text-decoration:none;text-align:center;">LINK</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ ÍCONES SOCIAIS ============ -->
    <tr>
      <td align="center" style="padding:28px 0 0 0;">
        <table role="presentation" width="203" cellpadding="0" cellspacing="0" border="0" style="width:203px;">
          <tr>
            <td width="47" style="width:47px;font-size:0;line-height:0;">
              <a href="URL_INSTAGRAM"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAvCAYAAABzJ5OsAAAK…[base64 de ~4 KB omitido]…" width="47" height="47" alt="Instagram" style="display:block;width:47px;height:47px;"></a>
            </td>
            <td width="31" style="width:31px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="47" style="width:47px;font-size:0;line-height:0;">
              <a href="URL_TIKTOK"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAvCAYAAABzJ5OsAAAJ…[base64 de ~3 KB omitido]…" width="47" height="47" alt="TikTok" style="display:block;width:47px;height:47px;"></a>
            </td>
            <td width="31" style="width:31px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="47" style="width:47px;font-size:0;line-height:0;">
              <a href="URL_PINTEREST"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAvCAYAAABzJ5OsAAAL…[base64 de ~4 KB omitido]…" width="47" height="47" alt="Pinterest" style="display:block;width:47px;height:47px;"></a>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ============ ENDEREÇO E UNSUBSCRIBE ============ -->
    <tr>
      <td align="center" class="txt-wht" style="padding:50px 76px 0 76px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;line-height:21px;font-weight:400;color:#FFFFFF;">
        85 Great Portland Street, London, United Kingdom W1W 7LT
      </td>
    </tr>
    <tr>
      <td align="center" class="txt-wht" style="padding:4px 76px 36px 76px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;line-height:22px;font-weight:400;color:#FFFFFF;">
        No longer want to receive these emails?
        <a href="URL_UNSUBSCRIBE" style="color:#E0574A;text-decoration:underline;">Unsubscribe</a><br>
        <a href="URL_PREFERENCIAS" style="color:#E0574A;text-decoration:underline;">Manage my preferences</a>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

<a id="v-7ba06b7c"></a>

### 8.4 · footer 4 - dark — `Ativa`

| | |
|---|---|
| **Tipo de seção** | Footer (`footer`) |
| **Status** | Ativa (disponível para a IA) |
| **Densidade** | — |
| **Slots de produto** | 0 |
| **Objetivos compatíveis** | — (vazio = compatível com todos) |
| **Tons compatíveis** | — (vazio = compatível com todos) |
| **Tags** | dark_bg, full_dark, single_col, standalone_component, footer, navigation_footer, light_buttons, seven_links, two_col_grid, colspan_wide_button, rounded_buttons, social_icons, four_socials, custom_font_fallback, no_unsubscribe, no_copyright, no_compliance, no_mso_fallback, mobile_responsive, not_mobile_stacked |
| **Tamanho do HTML** | 15.2 KB |
| **ID** | `7ba06b7c-8a6a-423b-9478-262fb3c2ce1d` |

#### Descrição curta

Footer dark com mega-menu: 7 links em pills claras (3×2 + 1 full-width), 4 ícones sociais e bloco legal a completar pelo template.  

#### Descrição detalhada

Fundo preto, pills = botões bulletproof com background claro + border-radius alto (degrada retângulo no Outlook, sem perda funcional). Grid 3 rows × 2 cols + row de colspan pro full-width. Contraste invertido (texto escuro sobre pill clara) = legibilidade máxima em dark mode e light mode — aliás, dos quatro footers, é o que melhor sobrevive a forced dark mode do Gmail (fundos claros dos botões são preservados). Ícones = PNGs brancos pequenos. Completar obrigatoriamente: linha de endereço físico, unsubscribe e preferências herdadas do footer dark editorial — a ausência na referência é gap, não escolha.  

#### Contexto para a IA

##### Quando usar

Clientes com catálogo/conteúdo ramificado que justifica 6–7 destinos (lojas com categorias fortes, marcas com cursos/conteúdo além de produto — como a referência, que vende tools, books e courses). Identidades escuras que precisam de menu robusto.  

##### Quando NÃO usar

Clientes com 3–4 destinos (pills sobrando esvaziam o menu — usar os footers menores). Marcas claras (usar o outline).  

##### Orientações de copy para a IA

Configuração por cliente. Labels de 1–2 palavras em caps (~12 caracteres). O full-width recebe o destino institucional ou o prioritário ("ABOUT US" na referência — mas pode ser comercial). Legal no padrão do arsenal.  

##### Design system

_(vazio)_

##### Direção fotográfica

_(vazio)_

#### Schema de output (0 campos)

_Sem schema cadastrado._ Sem os campos declarados, a copy do n8n não tem endereço neste bloco e a variante não é preenchível pelo pipeline.

#### HTML

```html
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>[PREVIEW] Rodapé 4 — grade de botões</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#000000; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-wht { color:#FFFFFF !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#000000;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#000000;">

    <!-- LOGO -->
    <tr>
      <td align="center" class="txt-wht" style="padding:19px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:57px;line-height:66px;font-weight:400;color:#FFFFFF;">
        LOGO
      </td>
    </tr>


    <!-- ============ GRADE DE BOTÕES ============ -->
    <tr>
      <td style="padding:65px 34px 0 34px;">
        <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">

          <!-- linha 1 -->
          <tr>
            <td width="256" style="width:256px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_TOOLS" style="height:62px;v-text-anchor:middle;width:256px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">TOOLS</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_TOOLS" style="display:block;width:256px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">TOOLS</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
            <td width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="256" style="width:256px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_BOOKS" style="height:62px;v-text-anchor:middle;width:256px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">BOOKS</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_BOOKS" style="display:block;width:256px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">BOOKS</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <tr><td colspan="3" height="21" style="height:21px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- linha 2 -->
          <tr>
            <td style="width:256px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_GOODS" style="height:62px;v-text-anchor:middle;width:256px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">GOODS</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_GOODS" style="display:block;width:256px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">GOODS</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:256px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_CUT_SHEETS" style="height:62px;v-text-anchor:middle;width:256px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">CUT SHEETS</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_CUT_SHEETS" style="display:block;width:256px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">CUT SHEETS</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <tr><td colspan="3" height="21" style="height:21px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- linha 3 -->
          <tr>
            <td style="width:256px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_BRANDS" style="height:62px;v-text-anchor:middle;width:256px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">BRANDS</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_BRANDS" style="display:block;width:256px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">BRANDS</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
            <td style="font-size:0;line-height:0;">&nbsp;</td>
            <td style="width:256px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_COURSES" style="height:62px;v-text-anchor:middle;width:256px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">COURSES</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="256" cellpadding="0" cellspacing="0" border="0" style="width:256px;">
                <tr><td align="center" height="62" style="width:256px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_COURSES" style="display:block;width:256px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">COURSES</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <tr><td colspan="3" height="21" style="height:21px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- linha 4: botão largo -->
          <tr>
            <td colspan="3">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="URL_ABOUT_US" style="height:62px;v-text-anchor:middle;width:532px;" arcsize="24%" stroke="f" fillcolor="#F2F0EB">
                <w:anchorlock/><center style="color:#000000;font-family:Arial,sans-serif;font-size:25px;font-weight:bold;">ABOUT US</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" width="532" cellpadding="0" cellspacing="0" border="0" style="width:532px;">
                <tr><td align="center" height="62" style="width:532px;height:62px;background:#F2F0EB;border-radius:15px;">
                  <a href="URL_ABOUT_US" style="display:block;width:532px;height:62px;line-height:62px;font-family:Figtree,Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;color:#000000;text-decoration:none;text-align:center;">ABOUT US</a>
                </td></tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

        </table>
      </td>
    </tr>


    <!-- ============ ÍCONES SOCIAIS ============ -->
    <tr>
      <td align="center" style="padding:45px 0 69px 0;">
        <table role="presentation" width="198" cellpadding="0" cellspacing="0" border="0" style="width:198px;">
          <tr>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_FACEBOOK"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAB…[base64 de ~1 KB omitido]…" width="27" height="27" alt="Facebook" style="display:block;width:27px;height:27px;"></a>
            </td>
            <td width="30" style="width:30px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_INSTAGRAM"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAD…[base64 de ~1 KB omitido]…" width="27" height="27" alt="Instagram" style="display:block;width:27px;height:27px;"></a>
            </td>
            <td width="30" style="width:30px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_PINTEREST"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAC…[base64 de ~1 KB omitido]…" width="27" height="27" alt="Pinterest" style="display:block;width:27px;height:27px;"></a>
            </td>
            <td width="30" style="width:30px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="27" style="width:27px;font-size:0;line-height:0;">
              <a href="URL_YOUTUBE"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAB…[base64 de ~1 KB omitido]…" width="27" height="27" alt="YouTube" style="display:block;width:27px;height:27px;"></a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>
```

