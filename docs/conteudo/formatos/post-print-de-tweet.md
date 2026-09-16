# Formato "Post" — o print de tweet

Família visual `post` + molde `molde-post`. A peça imita uma **captura de
tela de um post**: fundo quase preto, cartão de perfil (avatar, nome com
selo, `@handle`) e o texto grande embaixo. Sem contador, sem rodapé de
marca, sem filete — qualquer enfeite da casa denuncia que não é uma
captura.

## De onde vêm as medidas

A referência tem **1170 px de largura**; o canvas do Estúdio tem **1080**
(`FRAME_W`). Toda medida de `lib/conteudo/formato-post.ts` é
`medida_do_print × 0,923` (`doPrint`), gravada já convertida — é o que
permite conferir a peça contra a referência sem refazer a conta.

| item | print | base 1080 | onde |
|---|---|---|---|
| margem lateral do texto | 95 | 88 | `margem` |
| margem lateral da imagem | 130 | 120 | `margemImagem` |
| avatar ⌀ (slide com print) | 145 | 134 | `POST_GRANDE.avatar` |
| avatar ⌀ (slide de texto) | 112 | 104 | `POST_PADRAO.avatar` |
| avatar → nome | 38 | 35 | `gapAvatar` |
| nome e `@handle` (mesmo corpo) | 54 / 46 | 50 / 42 | `nome` |
| selo ⌀ | 36 / 31 | 33 / 29 | `selo` |
| cabeçalho → texto | 53 | 49 | `gapCabecalho` |
| corpo do texto | 45–46 | 42 | `texto` |
| entrelinha | — | 1,28 | `entrelinha` |
| título em negrito → parágrafo | 41 | 38 | `gapTitulo` |
| texto → imagem | 40 | 37 | `gapImagem` |
| topo do slide → avatar | 30 | 28 | `topo` |
| frase do gancho (capa) | 54 | 50 | `POST_GANCHO.texto` |
| cabeçalho → gancho | 110 | 102 | `POST_GANCHO.gapCabecalho` |

**Cores** (`POST_CORES`): fundo `#0D0D0D` (nunca `#000` — o preto puro
chapa), texto `#FFFFFF`, `@handle` `#808080`, selo `#1D9BF0`.

**Fonte**: Poppins 400/600/700, self-hosted em `public/fonts` (OFL) e
declarada em `conteudo-slides.css` **e** na lista da exportação — sem as
duas, o PNG sai com a sans do sistema e a peça exportada não é a que está
na tela.

## As três poses

O formato tem UM desenho, e o que muda é onde o bloco pousa:

- **Gancho** (tipo `capa`): frase grande, bloco no centro óptico. É o
  slide que para o dedo — na referência a linha ocupa 62% da largura com
  24 caracteres, contra 79% com 42 nos slides de texto.
- **Com print** (qualquer tipo, com slot de imagem): cabeçalho maior no
  TOPO, texto curto e a captura ocupando o resto até quase a borda.
- **Só texto**: bloco no **centro óptico** — o centro geométrico puxado 3%
  para cima (`SUBIDA_OPTICA`). Centralizar no meio exato deixa o bloco
  visualmente afundado, e é onde os três slides de texto da referência
  estão.

A pose vem da IMAGEM, não do tipo (`posePost`): slide com foto precisa do
espaço de baixo inteiro, slide sem foto fica perdido no topo. As variantes
`b` e `c` forçam topo e centro, para quem quiser o contrário.

## O que o formato lê do documento

- `titulo` → a linha em **negrito** (o "Why it works:" da referência),
  opcional.
- `corpo` → o texto do post; `\n\n` vira parágrafo (o renderer usa
  `white-space: pre-wrap`).
- **nome, `@handle`, foto e selo saem do brand kit** — o perfil do canal
  Instagram conectado. Trocar de perfil reescreve os quatro slides sem
  ninguém digitar nada, e os três são ocultáveis em Campos globais.
- `cta` mantém o botão (é a única coisa que o último slide tem a mais).

## Limites próprios

`LIMITES_POST` existe porque o texto aqui ocupa a peça inteira, sem
título gigante concorrendo: o slide de "por que funciona" da referência
tem **232 caracteres** e sai no tamanho cheio. Com o limite do TIPO
(`corpo: 180` em `texto`) o auto-fit encolheria a fonte, e a peça deixaria
de ser idêntica **sem nada avisar** — daí `limiteDe(tipo, campo,
cartaoPerfil)` e o teste que fixa `fitFactor(232, …) === 1`.

## O que é editável

Tudo o que o Estúdio já edita continua valendo, por campo: tamanho
(escala 50–170%), **altura de linha**, peso, alinhamento, cor e
deslocamento vertical — no painel Texto e pelas alças do canvas, com
"voltar ao padrão". A família é a BASE; o que o usuário mexe à mão
sobrevive a trocar de identidade (`aplicarFamilia` só substitui o que
ainda é o default da família anterior).

## Verificado renderizando

Os quatro slides foram desenhados com `renderToStaticMarkup` e
fotografados no Chromium contra a referência. Foi assim que apareceram —
nenhum deles quebra teste:

1. **Gradiente sutil no fundo da capa**: `novoDocumento` grava
   `"gradiente"` na capa antes de a família ser aplicada, e
   `aplicarFamilia` trocava cor por cor — o degradê de `#1A1A1A` para
   `#0D0D0D` ficava. A troca passou a **recalcular** os fundos quando
   entra ou sai do cartão de perfil.
2. **Selo genérico**: um círculo com check dentro lê como ícone; a forma
   em lóbulos é o que o olho reconhece como conta verificada.
3. **Gancho pequeno demais** e o respiro do cabeçalho curto no slide da
   capa — as duas medidas ganharam valores próprios (`POST_GANCHO`).

Conferência de fidelidade: a largura da linha "The biggest option on the
page will be the" saiu em **79,6%** da largura do slide contra **79,0%**
na referência, com a mesma quebra de linha nos dois parágrafos.

## Limites declarados

- **A margem lateral é única (88).** Na referência ela varia de slide a
  slide (95, 88, 148, 140 no print) sem regra; margem que muda sem motivo
  é ruído, e a peça fica mais consistente com uma só.
- **A fonte é uma aproximação.** A referência é uma captura, não um
  arquivo: Poppins é a geométrica arredondada mais próxima do desenho
  (x-height alta, círculos geométricos, terminais retos). Trocar é uma
  linha em `familias.ts` + os `@font-face`.
