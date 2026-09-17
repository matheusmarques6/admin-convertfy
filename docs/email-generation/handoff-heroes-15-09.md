# Hand-off para o vault — as 8 heroes de 15/09

**Este arquivo é para ser COLADO no chat do agente que escreve as notas no
Obsidian.** Tudo abaixo da linha foi gerado por
`src/lib/email-workspace/ficha-do-vault.ts` a partir do banco — a mesma
função do botão "Ficha para o vault" no editor de variante, e a mesma
derivação (`resumirContrato`) que monta a linha do catálogo que o Curador lê.

## Por que este arquivo existe

O agente do vault não enxerga o admin, e três coisas moram só do lado de cá.
Erradas na nota, ela é **ignorada em silêncio** — nada em log, nada em tela, e
o Curador segue escolhendo a variante sem nenhum eixo:

1. o `variant_id` (a chave do casamento nota↔variante),
2. o `nome_no_banco` exato (o casamento de reserva, por nome),
3. o `output_schema`, que é o que revela a anatomia da peça.

## O que foi medido antes

As 8 entraram em 15/09 **ativas, sem dispositivo e sem nota**, enquanto as
outras 37 variantes da biblioteca tinham as duas coisas. O cadastro em si
está bom: todas passam no `variantIsFillable`, o HTML está em 600px e o
schema casa com ele.

O dispositivo já foi corrigido no banco no mesmo dia. Em 17/09 o
vocabulário inteiro foi redefinido — o nome passou a ser o MECANISMO, sem
prefixo de seção (migration 20261166) —, e as fichas abaixo já trazem o
nome novo: `oferta_em_manchete` (11 e 14), `prazo_declarado` (12),
`campanha_nomeada` (13 e 15), `abertura_editorial` (16, 17 e 18).

**Seis das oito são o e-mail INTEIRO**, não uma abertura: as descrições dizem
isso com todas as letras ("E-mail inteiro de último dia…"). Só a 17 e a 18
são hero de verdade. É a informação mais importante deste hand-off, porque
não existe no banco: o eixo que a carrega é `papel_na_peca: peca-inteira`, e
ele mora na nota. Sem ela, o Curador pode pôr um e-mail de Black Friday na
abertura de um welcome e as outras cinco posições continuam empilhando
embaixo.

## Dois pares para separar no "quando não usar"

- **13 × 15** — as duas são "data comemorativa + oferta única + cupom" e
  diferem só no tratamento visual (card inclinado e faixa diagonal × selo e
  headline de um terço). Sem um "quando não usar" que se refira à outra, o
  Curador escolhe sempre a mesma.
- **17 × 18** — as duas abrem a peça sem oferta. A 17 exige foto horizontal
  com o assunto de um lado; a 18 é de e-mail de conteúdo, com o assunto antes
  da imagem.

## Depois de salvar as notas

1. `valida.py` (reprova valor de eixo sem nota própria).
2. `gera_catalogo.py` — nunca edite `_catalogo.md` à mão.
3. Sincronizar no admin, aba Conhecimento. A nota só passa a valer depois
   disso, e é ali que aparecem nota órfã e variante sem nota.

---

# Catalogar 8 variantes no vault (15/09/2026)

Escreva uma nota por variante em `componentes/variantes/<secao>/<slug>.md`,
seguindo `componentes/_como-cadastrar.md`. Os dados abaixo vêm do cadastro no
admin e são a VERDADE sobre a peça — não os reescreva, classifique-os.

## Regras

1. `status: aprovada` no frontmatter, ou a nota não entra no catálogo — a variante continua sendo escolhida, só que sem nenhum eixo.
2. `variant_id` e `nome_no_banco` EXATOS, copiados desta ficha. Errados, a nota é ignorada sem nenhum aviso. Nunca troque o `variant_id` de uma nota existente.
3. Preencha `aliviador` e `profundidade`. Nenhuma das notas atuais os declara e o código hoje os adivinha a partir do tipo de bloco — declarados, eles vencem o palpite, e são os dois eixos que mais pesam depois da objeção.
4. NÃO escreva design system nem direção fotográfica: moram no cadastro do admin e servem aos agentes que desenham, não a quem escolhe.
5. NÃO preencha `momento` nem `momento_vetado` — aposentados em 07/09, sem efeito nenhum.
6. NÃO invente valor de eixo fora do vocabulário: o `valida.py` reprova.
7. `dispositivo` NÃO vai na nota — é coluna do banco, já cadastrada. Está na ficha só para você saber com quem a peça concorre.

## O corpo da nota

Três títulos de nível 2 são lidos pelo Curador; o resto é para gente.

- `## Descrição curta` — 2 a 3 frases, até 600 caracteres. É o que ele lê primeiro.
- `## Quando usar` — em que momento esta peça é a certa (até 1200).
- `## Quando não usar` — em que momento ela seria o erro (até 1200). É o que faz
  o Curador descartar pelo motivo certo em vez de escolher por eliminação.

## Vocabulários fechados

objecao: adesao-social · amplitude-de-catalogo · composicao-formulacao ·
  confianca-no-canal · disponibilidade-urgencia · escolha-variedade ·
  pertencimento · preco-valor · qualidade-eficacia · suporte-duvida ·
  uso-aprendizado
aliviador: garantia_de_devolucao · prova_de_terceiro · prova_por_volume ·
  demonstracao_de_mecanismo · transparencia_de_politica · amostra_ou_teste ·
  dado_de_adequacao · comparacao_de_categoria · seguranca_de_pagamento ·
  reputacao_da_loja
profundidade: afirmacao · mecanismo · prova_de_terceiro · garantia
registro: bold-alto-contraste · clinico-sobrio · comercial ·
  comunidade-identitario · festivo · luxo · minimalista-leve ·
  popular-informal · premium-editorial · volume-impulso
paleta: cinza-neutro · claro · com-acento-definido · creme · escuro-saturado ·
  full-dark · monocromatico · preto-e-branco
papel_na_peca: abre · apoio · fecha · meio · peca-inteira · ponte

---

## hero section 11

```yaml
variant_id: 2ce07010-4b17-4f44-931a-f5f0b014b444
nome_no_banco: hero section 11
status: aprovada
papel_na_peca: [peca-inteira]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `oferta_em_manchete` (não vai na nota)
- forma: 7 campos · 2 imagens · logo
- anatomia: cupom, cta
- campos: `bogo_headline_1, bogo_headline_2, bogo_subline, bogo_coupon_label, bogo_coupon_code, bogo_body, bogo_cta_label, bogo_background_image, bogo_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> E-mail inteiro de campanha promocional para quando a oferta é simples o bastante para caber em duas linhas. Abre com o percentual em corpo enorme, deixa a foto ocupar todo o meio da peça e fecha com cupom, reforço e CTA.

Atenção: É o E-MAIL INTEIRO, não uma abertura. Diga isso com essas palavras na descrição curta e no "quando não usar" — o Curador não tem outro jeito de saber.

## hero 12

```yaml
variant_id: 9bc6a6c7-2fb8-4b66-bffa-0d64b6d28063
nome_no_banco: hero 12
status: aprovada
papel_na_peca: [peca-inteira]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `prazo_declarado` (não vai na nota)
- forma: 8 campos · 2 imagens · prazo · logo
- anatomia: cta
- campos: `countdown_benefit_line, countdown_eyebrow, countdown_offer_main, countdown_offer_symbol, countdown_offer_suffix, countdown_subline, countdown_body, countdown_cta_label, countdown_background_image, countdown_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> E-mail inteiro de último dia, para quando a urgência é o argumento principal e precisa aparecer antes de qualquer outra coisa. Abre com um contador regressivo ocupando a tela inteira e só depois entrega a oferta e o botão.

Atenção: É o E-MAIL INTEIRO. Tem percentual mas NÃO tem cupom: a urgência é o argumento, e é isso que a separa das irmãs de `oferta_em_manchete`.

## hero section 13

```yaml
variant_id: bd4965fe-9606-49ca-bdbf-f260571acb3a
nome_no_banco: hero section 13
status: aprovada
papel_na_peca: [peca-inteira]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `campanha_nomeada` (não vai na nota)
- forma: 7 campos · 4 imagens · logo
- anatomia: cupom, cta
- campos: `bf_offer_line_1, bf_offer_value, bf_offer_line_3, bf_coupon_label, bf_coupon_code, bf_cta_label, bf_campaign_name, bf_offer_card_image, bf_diagonal_stripes_image, bf_background_image, bf_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> E-mail inteiro de data comemorativa forte, quando a oferta é um percentual único e a campanha já tem nome próprio. Entrega a oferta num card inclinado, o cupom logo abaixo e fecha com uma marcação diagonal repetindo o nome da data.

Atenção: É o E-MAIL INTEIRO. Descreve a MESMA decisão de uso da `hero section 15` (data comemorativa + oferta única + cupom) e difere só no tratamento visual — o "quando não usar" das duas precisa se referir uma à outra, senão o Curador escolhe sempre a mesma. O campo `bf_coupon_label` está sem example no cadastro: nunca ancora.

## hero section 14

```yaml
variant_id: fea49994-d150-40fa-a8e9-513686563686
nome_no_banco: hero section 14
status: aprovada
papel_na_peca: [peca-inteira]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `oferta_em_manchete` (não vai na nota)
- forma: 7 campos · 3 imagens · logo
- anatomia: cta
- campos: `lockup_eyebrow, lockup_repeat_word, lockup_value, lockup_suffix, lockup_collection_title, lockup_body, lockup_cta_label, lockup_type_image, lockup_background_image, lockup_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> E-mail inteiro de desconto adicional, para campanha de coleção em que a oferta é um percentual extra sobre o que já está no site. Constrói um bloco tipográfico gigante com a palavra do reforço repetida quatro vezes e entrega a coleção e o botão embaixo.

Atenção: É o E-MAIL INTEIRO. A oferta é um percentual EXTRA sobre o preço do site — a coleção é o contexto, não a oferta.

## hero section 15

```yaml
variant_id: 54881d0b-bcda-42ef-a56e-706f7ecc415b
nome_no_banco: hero section 15
status: aprovada
papel_na_peca: [peca-inteira]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `campanha_nomeada` (não vai na nota)
- forma: 7 campos · 2 imagens · logo
- anatomia: cupom, cta
- campos: `cyber_badge_line_1, cyber_badge_line_2, cyber_eyebrow, cyber_headline, cyber_coupon_label, cyber_coupon_code, cyber_cta_label, cyber_background_image, cyber_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> E-mail inteiro de data comemorativa com oferta única, para quando a campanha se resolve em uma linha e a marca quer dizer isso do jeito mais direto possível. Um selo identifica a data, a headline ocupa um terço da peça e o cupom vem logo abaixo.

Atenção: É o E-MAIL INTEIRO. Mesma decisão de uso da `hero section 13` — escreva o "quando não usar" das duas se referindo uma à outra.

## hero section 16

```yaml
variant_id: 28b9815c-466f-4621-b432-2babcab6e012
nome_no_banco: hero section 16
status: aprovada
papel_na_peca: [peca-inteira]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `abertura_editorial` (não vai na nota)
- forma: 4 campos · 2 imagens · logo
- anatomia: cta
- campos: `arch_headline_1, arch_headline_2, arch_body, arch_cta_label, arch_background_image, arch_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> E-mail inteiro de apresentação de coleção ou de conceito de marca, para quando a peça não tem oferta nenhuma e precisa vender por imagem e frase. A foto ocupa quase tudo dentro de um bloco em arco, e o texto entra só no terço final.

Atenção: É o E-MAIL INTEIRO, e é a única das seis sem oferta nenhuma: vende por imagem e frase.

## hero section 17

```yaml
variant_id: 7f3a72a6-e24c-4aa6-b4ca-14df7f3d80b5
nome_no_banco: hero section 17
status: aprovada
papel_na_peca: [abre]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `abertura_editorial` (não vai na nota)
- forma: 4 campos · 2 imagens · logo
- anatomia: cta
- campos: `hero_title, hero_body_lead, hero_body, hero_cta_label, hero_background_image, hero_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> Hero curto para abrir um e-mail quando a foto é horizontal e tem o assunto de um lado só. Encosta título, copy e botão na margem esquerda, deixando a metade direita da imagem livre.

Atenção: Esta ABRE a peça (não é e-mail inteiro). Exige foto horizontal com o assunto de um lado só — é o "quando não usar" mais útil dela.

## hero section 18

```yaml
variant_id: d5fe8ba1-05df-4803-9807-fc1e51019203
nome_no_banco: hero section 18
status: aprovada
papel_na_peca: [abre]
aliviador:        # preencher
profundidade:     # preencher
objecao: []       # preencher
registro: []      # preencher
registro_vetado: []
paleta: []        # preencher
```

- caminho: `componentes/variantes/hero/<slug>.md`
- dispositivo no banco: `abertura_editorial` (não vai na nota)
- forma: 3 campos · 2 imagens · logo
- anatomia: cta
- campos: `hero_headline, hero_body, hero_cta_label, hero_background_image, hero_logo_image`

Descrição do cadastro (prevalece sobre a sua):
> Hero de abertura para e-mail de conteúdo, quando o assunto precisa ser anunciado antes de qualquer imagem. Resolve título, contexto e botão no terço superior e entrega a metade inferior inteira para a foto.

Atenção: Esta ABRE a peça. É de e-mail de CONTEÚDO (o assunto vem antes da imagem) — distinga-a da `hero section 17`, que é de foto horizontal.
