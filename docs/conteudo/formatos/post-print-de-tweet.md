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

**Fonte**: a da PLATAFORMA — ver "A fonte não é escolha de gosto" no fim
deste documento. Inter (self-hosted, variável) na frente da pilha do X
(`Segoe UI, Roboto, Helvetica, Arial`). Toda fonte tem de estar declarada em
`conteudo-slides.css` **e** na lista da exportação (`export/render.ts`) —
sem as duas, o PNG sai com a sans do sistema e a peça exportada não é a que
está na tela.

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
- **A fonte é a da plataforma, não a da referência.** A referência é uma
  captura e o desenho original pode ter sido refeito em qualquer tipo; o que
  o formato promete é parecer uma captura. Ver a seção final.

---

# O segundo desenho: "Post largo"

Mesmo gênero, outra referência — e a diferença é grande o bastante para ser
outra família (`post-largo`), não um ajuste da primeira.

| item | Post | Post largo |
|---|---|---|
| fonte | a mesma (Inter + pilha do X) | a mesma |
| margem lateral | 88 | **72** |
| avatar ⌀ | 104–134 | 114 |
| avatar → nome | 35 | **18** |
| corpo do texto | 42 | 42 |
| entrelinha | 1,28 | **1,37** |
| margem da imagem | 120 (recuada) | **72** (acompanha o texto) |
| fotos | 1 captura | **colagem de 2** |
| avatar | liso | **halo claro** |
| subida óptica | 3% | **0,8%** |

**As duas famílias usam a MESMA fonte, e isso é o certo**: elas simulam a
mesma interface. O que as separa é a métrica — margem, avatar, entrelinha,
colagem —, não o tipo. A referência do largo foi capturada num Windows, onde
a pilha do X cai justamente em Segoe UI. Ver a seção final.

## A colagem de duas fotos

`DocFrame.imagens` ganhou `slot2` (aditivo). Só o formato que declara
`gapGaleria > 0` desenha a segunda; nas outras identidades ela fica
**guardada sem aparecer** — trocar de identidade não pode apagar o que
alguém enviou.

Onde se envia: painel Mídia → "Foto da colagem" (1ª | 2ª), que troca o
destino de tudo (upload, banco da org, geração por IA). O ajuste fino
(zoom, posição, trocar, remover) opera na foto SELECIONADA — clicar na
segunda no canvas abre o painel flutuante nela, com o selo "2ª foto da
colagem". Remover a segunda tira só ela; remover a primeira esvazia o
frame, porque a colagem não existe sem a principal.

## Molde "História em posts"

Seis slides: abertura com a colagem e o começo da narrativa, quatro
capítulos só de texto e a chamada. É a sequência da referência — a história
contada em pedaços curtos, um por slide, com a prova visual no primeiro.

## Verificado renderizando

Os seis slides contra a referência, no Chromium. As **quebras de linha
saíram idênticas** nos dois slides longos ("Conheci lá um alemão de 55
anos, dono de / uma marca que patrocina uma das principais / equipes do
ciclismo mundial." e os dois parágrafos do slide do Tour) — é a prova mais
forte de que fonte, corpo e margem batem. Posições medidas contra o print:
avatar 6,7%–17,0% (ref 7,5%–18,1%), texto começa em 22,5% (ref 21,2%),
colagem de 58,5% a 94,5% da altura (ref 57,8%–94,7%) e de 6,7% a 93,3% da
largura (ref idem).

O único ajuste que o render pediu foi a **subida óptica**: 1,5% deixava o
bloco 1% acima do da referência; medida nos cinco slides, ela é 0,8%.

---

# A fonte não é escolha de gosto

O formato promete parecer uma **captura de tela**. Então a pergunta não é
"qual fonte fica bonita", é "qual fonte a plataforma usa" — e ela tem
resposta pública:

- O **X** usa a **Chirp** (Grilli Type, 2021), grotesca de tela com x-height
  alta, e declara esta pilha de recuo: `Segoe UI, Roboto, Helvetica, Arial,
  sans-serif`. Chirp é **proprietária**: não é vendida nem licenciada para
  embarcar.
- Nos aplicativos nativos quem aparece é a fonte do sistema — **SF Pro** no
  iOS, **Roboto** no Android. Todas grotescas.
- O substituto livre apontado nas comparações de Chirp é a **Inter** (e, em
  segundo, DM Sans): desenhada para tela, mesma família de proporções.

**O primeiro desenho desta família usava Poppins, e estava errado.** Poppins
é geométrica, derivada de Futura: `a` de um andar só, bojos circulares,
terminais retos. Nenhuma interface social usa geométrica no corpo do post — e
esse `a` de um andar é justamente o detalhe que faz a peça ler como card de
Canva, o "cara de feito com IA". A troca é do TIPO, não das medidas: as
medidas continuam as do print.

Inter vai na FRENTE da pilha da plataforma (e não depois) porque a
exportação precisa de fonte determinística: com fonte de sistema, o mesmo
carrossel exportado em duas máquinas sai diferente.

**O que isso NÃO resolve**: Chirp tem detalhes próprios (pontuação
arredondada, letras levemente irregulares) que nenhuma substituta reproduz.
A peça fica no gênero certo, não idêntica ao pixel — e isso é um limite da
licença, não do desenho.

---

# A via B: o prompt de imagem do formato

O prompt de cada slide é montado a partir da FAMÍLIA. No cartão de perfil
isso muda tudo, e descrever a anatomia da casa ali entregaria o oposto do
formato:

- **A foto NÃO é fundo.** Ela é uma peça recortada abaixo do texto, com
  margem própria — no híbrido e no completo. A capa não sangra.
- **A anatomia é a da captura**: fundo `#0D0D0D`, avatar redondo, nome em
  700 com o selo azul, `@handle` no mesmo corpo em cinza, o texto embaixo —
  com as medidas de `formato-post.ts`, convertidas do print.
- **Sem rodapé de marca e sem contador.** Pedi-los faria o modelo desenhar
  justamente o que denuncia que a peça não é uma captura de tela.
- **O fundo é declarado UMA vez.** A linha `- Fundo:` da casa sairia com
  outra cor, e duas instruções de fundo no mesmo prompt fazem o modelo
  escolher uma ao acaso.
- **A direção de arte SUBSTITUI a da casa** (`ESTILO_SUBSTITUI`): o texto
  base abre com "fotografia real" e a direção do formato diz "não é
  fotografia, é uma captura de tela". Pela mesma razão a **cena** vem da
  família (`CENA_DA_FAMILIA`) — a cena por papel fala de objeto e gesto, que
  a direção do formato proíbe.
- **`**palavra**` nunca vai cru**: é notação nossa, e o modelo escreveria os
  asteriscos dentro da imagem. Vira instrução de cor.

---

# O que a especificação do X acrescentou (set/2026)

Pedido: olhar o componente Tweet do **Spell UI** (`spell.sh/docs/tweet`) e
ver o que dá para aproveitar. O domínio está bloqueado pelo proxy desta
sessão, mas a busca respondeu o que importava: o componente deles é o
**`react-tweet`** da Vercel, que replica o embed OFICIAL do X. O pacote foi
baixado do npm e lido — `twitter-theme/theme.css`, `tweet-header.module.css`
e `tweet-body.module.css`.

## O que já batia

| item | nós | embed do X |
|---|---|---|
| razão avatar ÷ corpo do texto | 2,43 | 2,40 |
| espaço avatar → nome ÷ avatar (formato largo) | 0,161 | 0,167 |
| nome e `@handle` no MESMO corpo | sim | sim (0,9375rem) |
| nome em peso 700, handle em 400 | sim | sim |
| selo azul | `#1D9BF0` | `#1D9BF0` |
| quebra de linha do autor preservada | `pre-wrap` | `pre-wrap` |
| pilha de fontes grotesca | Inter à frente | `-apple-system…Segoe UI` |

As medidas do nosso formato **não foram trocadas**: elas vieram do print da
referência, e o `react-tweet` descreve o *embed* (corpo de 20px numa peça de
550px), que é outro objeto. Trocar uma referência medida por outra seria
perder o que o pedido original mandou copiar.

## O que estava errado, e a especificação corrigiu

- **O cinza do `@handle` era neutro** (`#808080`). O do X é **azulado**:
  `#8B98A5` no escuro, `#536471` no claro. Sobre fundo escuro o neutro lê
  como "desligado"; o azulado integra com o azul da interface.
- **O texto era branco puro.** O do X é `#F7F9F9`.

## O que passou a existir

**Quatro temas** (`TEMAS_DO_X` em `formato-post.ts`), com as cores da
especificação: `print` (o medido na referência — **o padrão**, zero
regressão), `claro`, `dim` (`#15202B`) e `escuro` (`#000000`, o "Lights
out"). Print de tweet no tema CLARO era impossível antes, e é o mais comum
de todos.

`aplicarTemaDoPost` segue a regra do `aplicarFamilia`: só troca o que ainda
está no padrão do tema anterior, e leva o **fundo de cada slide** junto —
sem isso o texto claro do tema escuro ficaria sobre o branco do claro,
invisível e sem erro nenhum (o defeito que o cartão de thread já pagou).

**`@menção`, `#hashtag` e link saem em AZUL** (`entidades-do-x.ts`). É o
detalhe que mais denuncia um print falso: num tweet de verdade nenhuma
dessas três é da cor do texto. As regras são as da lib **oficial** do
Twitter (`twitter-text` 3.1.0, Apache-2.0), lida do pacote:

- a menção precisa de fronteira à esquerda — sem isso `joao@convertfy.me`
  sairia com `@convertfy` azul no meio de um e-mail;
- ela morre pelo que vem **depois** (`endMentionMatch`): outro `@`, letra
  acentuada ou `://`;
- o handle vai até **20** caracteres (15 é o limite de CADASTRO — foi onde
  meu palpite errou, e a lib corrigiu);
- hashtag só de dígitos é TEXTO (`#2026`), senão data e preço viram link.

**Verificado contra o oráculo**: o módulo foi comparado com
`extractEntitiesWithIndices` da lib oficial em **35 casos** — 1 divergência,
e é a que está declarada no módulo (domínio solto como `convertfy.me`, que o
X linka e nós não: reconhecê-lo faria "comprou.Depois" virar link).

## O que ficou de fora, e por quê

- **Métricas (curtidas, respostas, visualizações).** O embed as mostra, e
  um print de tweet real também. Mas o carrossel é feito ANTES de o post
  existir: qualquer número ali seria inventado, e publicar engajamento
  fabricado é conteúdo falso, não enfeite. Se o número for real, ele entra
  como texto.
- **Timestamp e o ícone do X no canto.** O ícone é do *embed* (é o botão
  "ver no X"), não de uma captura; o print da referência não tem nenhum dos
  dois.
- **Cashtag (`$AAPL`).** O X a linka; num carrossel de e-commerce o `$`
  aparece em preço, e o ganho não paga o risco.
- **O selo continua AZUL no tema escuro.** O `react-tweet` o pinta de branco
  ali (`--tweet-verified-blue-color: #fff`), mas isso é decisão do embed —
  no X e no print da referência ele é azul em qualquer tema.
