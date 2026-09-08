# Formato "Editorial Convertfy" — anatomia para a fase 2 do Estúdio

Fonte: carrossel "8% dos clientes fazem 41% do faturamento" (5 slides
recebidos em 08/09/2026, referência `conteudo_referencias` da org
Convertfy, molde Benchmark, pilar Educacional). Este documento existe
para que a fase 2 (novos tipos de frame no renderer) seja construída
sobre medida, não de memória. O segundo formato prometido pelo usuário
entra em arquivo irmão; o sistema de frames é desenhado quando os dois
estiverem descritos.

## Por que os 5 tipos de frame atuais NÃO reproduzem este formato

| Elemento | Existe hoje? | O que falta |
|---|---|---|
| Título em PAR (itálico serif + negrito sans) | Não — `titulo` é um campo, uma família | Dois campos tipográficos por título, com famílias distintas |
| Palavras em destaque (marrom) no corpo | Não — corpo é texto liso | Marcação inline (`**x**` → cor de destaque) |
| Card branco com conteúdo variável (grade de KPIs / print / conta à mão) | Não — o slot de imagem é uma foto | Slot de "card" com 3 sub-variantes |
| Anotação manuscrita com seta | Não | Campo `anotacao` + seta SVG posicionada |
| Frase-bala de fechamento em negrito | Parcial (corpo) | Campo próprio, peso e tamanho maiores que o corpo |
| Pílula "DESLIZE →" / "NOSSO MÉTODO →" | Sim (`cta` do frame) | Estilo pílula clara com borda, não botão sólido |
| Chips de dados em linha (3 pílulas) | Não | Lista curta renderizada como chips |
| Capa com foto full-bleed e título sobre a foto | Parcial (capa variante a/b/c) | Título de 3 linhas com mistura de peso + itálico + pílula |

## Tokens visuais (lidos dos slides)

- **Fundo interno**: bege quente, aprox. `#F1EBE3` → `#EFE7DD` (leve
  gradiente/granulação). Capa: foto full-bleed (azul saturado + dourado).
- **Tinta principal**: marrom-preto `#2A2320`.
- **Destaque**: marrom queimado `#8C5A2B` (palavras no corpo, número da
  conta, anotação manuscrita, seta).
- **Card**: branco quente `#FBF9F6`, raio ~24px, sombra suave e larga,
  sem borda. Sub-card de KPI: raio ~14px, borda hairline `#E6DFD5`.
- **Pílula (CTA)**: fundo `#F7F3EE`, texto `#2A2320` 700 tracking +2%,
  raio total, altura ~64px na base 1080, alinhada à direita embaixo
  ("DESLIZE →") ou centralizada (capa, "NOSSO MÉTODO →").
- **Logo**: "CON / VERT / FY" empilhado em 3 linhas, sans 700, tracking
  largo, centralizado no topo (~y=60–130 na base 1080).

## Tipografia

- **Gancho (linha 1 do título)**: serif itálico de contraste alto
  (família tipo Instrument Serif / Playfair Italic), ~92px, peso 400.
- **Afirmação (linha 2 do título)**: sans grotesca 800, ~100px, tracking
  −2%, com ponto final.
- **Corpo**: sans 400, ~34px, entrelinha 1,3; palavras de destaque em 600
  + cor de destaque.
- **Fechamento**: sans 700, ~48px, 2–3 linhas, alinhado à esquerda.
- **Anotação**: manuscrita (tipo Caveat), ~34px, cor de destaque, rotação
  ±4°, com seta curva SVG apontando para o card.
- **Conta à mão** (card do slide 4): manuscrita ~44px; resultado em cor
  de destaque ~88px; linhas horizontais como traço de divisão.

## Estrutura do frame interno (base 1080 × 1350)

```
[logo centralizado]                       y 60–130
[gancho itálico]                          y 220
[afirmação negrito]                       y 300
[corpo 1–3 linhas, destaques]             y 420
[CARD — uma de: kpi_grid | print | conta] y 520–1000
   [anotação manuscrita + seta]           sobre a borda direita do card
[chips opcionais em linha]                y 1090 (só slide 5)
[fechamento negrito]                      y 1100–1240
[pílula DESLIZE →]                        canto inferior direito
```

Capa (slide 1): foto full-bleed; logo no topo; título de 3 linhas na
metade inferior (negrito 120px / negrito 120px / itálico 88px); pergunta
em serif regular 44px; pílula centralizada.

## Sub-variantes do card

1. **kpi_grid** — 2×2 de métricas (label 28px 600 + valor 64px 500 +
   seta colorida ↗/↘); um dos quatro pode ser "?" em destaque com borda
   de destaque (o "buraco" que a anotação aponta).
2. **print** — imagem enviada (screenshot) com raio 18px, leve inclinação
   opcional; é aqui que entra a PROVA (relatório, manchete).
3. **conta** — 3 a 5 linhas manuscritas: operandos, traço, resultado
   grande em destaque, legenda embaixo.

## Sequência observada (5 de N slides)

capa → dado (kpi_grid, pergunta) → prova (print, benchmark) → dado
(conta, tradução) → dado (print + chips, vilão externo). O fechamento
com CTA/oferta não veio nos anexos; o molde Benchmark da casa prevê
`cta` como último frame.

## Proposta para a fase 2 (a decidir com o segundo formato)

- Novo `FrameTipo` **`editorial`** com campos `gancho`, `afirmacao`,
  `corpo` (com destaques inline), `fechamento`, `anotacao`, `card`
  (`{ kind: "kpi_grid" | "print" | "conta", ... }`), `chips?: string[]`.
- Nova variante de **capa** (`d`: foto full-bleed + título misto + pílula).
- Paleta como **preset de brand kit** ("Editorial bege"), não hard-code:
  fundo, tinta, destaque, card, pílula.
- Fontes self-hosted a adicionar em `public/fonts`: uma serif itálica de
  contraste, uma manuscrita. (A exportação por `<foreignObject>` exige
  URL própria — regra já documentada no CLAUDE.md.)
