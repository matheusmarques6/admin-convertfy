# Identidade "Manchete" — a tese em cinco tempos

Família visual `manchete` + molde `molde-manchete` ("Tese em manchete"). Foi
lida dos **cinco slides da referência** que o usuário enviou (o carrossel
"DATAS SAZONAIS foram criadas para você vender mais" / Black Friday) e
substitui a identidade `neon`, que tinha sido construída da DESCRIÇÃO
escrita desta mesma referência — e errava em vários eixos.

## O que a referência desmentiu

A `neon` dizia "bloco preto do começo ao fim com foto acesa". A peça real é
o contrário disso:

| a `neon` dizia | a referência mostra |
|---|---|
| peça toda PRETA com um respiro claro | peça toda **BRANCA** com dois escuros (a capa e o slide do problema) |
| foto recortada com **brilho** azul de 90 px | foto sem brilho nenhum, card entre as margens do texto |
| fundo escuro `#0A0A0A`, claro `#F2F2F2` | **preto puro** e **branco puro** — a peça é chapada, sem cinza |
| título alternando azul e branco | título **preto** no claro e **branco** no escuro; o azul é realce pontual |
| régua horizontal sob o corpo | régua só no slide de chamada, entre título e subtítulo |
| rodapé de marca no slide | **só o ícone da marca**, pequeno, no topo |

Trocar em vez de somar uma sexta família foi decisão de dado: o banco tem
**zero documentos e zero templates do time**, então renomear a chave, o
molde e o `MoldeKey` não alcança nenhuma linha.

## O que a identidade decide

| traço | valor | por quê |
|---|---|---|
| fundo escuro | `#000000` | preto puro; a peça é chapada, não tem profundidade |
| fundo claro | `#FFFFFF` | branco puro pelo mesmo motivo |
| destaque | `#3355FF` | o azul elétrico: palavra marcada e a CAIXA sólida |
| tinta (`hook`) | `#111111` | a cor do corpo sobre o claro — preto puro no corpo cansa a leitura |
| título | Barlow Condensed 800, caixa alta, entrelinha **0,92** | é a massa da peça: em todo slide ele ocupa mais espaço que o corpo |
| raio | 18 | o canto da foto; o resto é reto |
| brilho da foto | **0** | era o traço mais visível da `neon` e a referência não o tem |
| CTA | `bloco` | mas o slide de chamada da referência **não tem pílula**: é título, régua e subtítulo |
| logo no topo | **sim** | é a única marca da peça; não há rodapé nem contador |
| assinatura no slide | não | seria a segunda marca |

**`**palavra**` sai em azul.** O realce é o que o Estúdio já tinha
(`rich.ts`), então o limite de caracteres continua contando o texto SEM os
marcadores.

## As medidas

**Lidas da referência renderizada, não extraídas do arquivo.** As duas
famílias de print (`post`, `post-largo`) têm tabela de/para medida pixel a
pixel do original; aqui as proporções foram lidas dos cinco slides e
conferidas renderizando lado a lado. É um degrau acima da `neon` (feita só
da descrição) e um abaixo dos prints. A tabela vive em
`src/lib/conteudo/formato-manchete.ts`, na base 1080 do canvas.

## O ritmo: peça clara com dois escuros

`respiroEscuro` é o inverso do `respiroClaro` da `neon`: a peça é CLARA e o
preto é o corte. Ele cai na **capa** e no **slide do meio**
(`Math.floor(total / 2)`), que na referência é o slide do problema — o preto
marca a tensão, o branco carrega o argumento.

Três regras que os testes travam:

- **Sem saber o total, só a CAPA é escura.** Inventar a posição do corte o
  poria no slide errado, e corte no lugar errado é pior que nenhum.
- **Peça com menos de 4 slides não tem o segundo escuro** — não há meio que
  renda o corte.
- **Inserir um slide no meio REFAZ o ritmo** (`ritmoDeFundos`). Fundo
  pintado à mão continua onde o usuário pôs.

## A escada do título

O que dá o tom de manchete: cada linha do título um passo menor que a
anterior (`ESCADA = [1, 0.66, 0.56, 0.5]`, aplicada em `em` para o auto-fit
continuar escalando a escada inteira). A quebra é a do **texto** (`\n`),
nunca a automática — quebra automática não tem como receber corpo
diferente, e é a quebra escolhida que faz a escada.

Dois limites declarados:

- **A escada vale só no fundo ESCURO**, e isso foi LIDO da referência: os
  dois slides escuros a têm, os três claros trazem o título todo do mesmo
  corpo. É a diferença entre o modo "manchete" e o modo "artigo" dentro da
  mesma peça.
- **A escada é sempre DECRESCENTE.** O slide do problema na referência põe a
  frase entre aspas no meio, MAIOR que as vizinhas. Reproduzir isso exigiria
  marcar a linha protagonista — campo que ninguém pediu.

## A caixa de destaque

Campo novo (`destaque`), opcional, gated por DOIS eixos: o tipo de frame
(`DESENHA.destaque` — não entra na capa nem no fecho, onde competiria com o
próprio título) **e** a família (`camposOpcionaisDaPeca` só o oferece onde
`traco.caixaDeDestaque`). Campo que a identidade não desenha é campo
fantasma: o operador escreve e nada aparece, sem erro nenhum — é o defeito
que o gating fecha.

Sem texto, a caixa não desenha nada — não fica um retângulo azul vazio.

## O molde

Cinco slides, na sequência da referência: **Tese** (capa com foto), **O
erro**, **O problema** (o segundo escuro), **A virada** e **Chamada**. Mover
o slide do problema muda qual slide escurece: a posição dele é o que
`fundoPadraoDaFamilia` lê.

## A via B conhece a identidade

O prompt de imagem por slide (`prompt-slide.ts`) é montado a partir da
FAMÍLIA: a foto é declarada como **card entre as margens do texto** (não
sangra e não acende), e o slide com caixa de destaque pede **CAIXA SÓLIDA**
no lugar da pílula. O `**palavra**` não vai cru para o modelo — ele viraria
asterisco dentro da imagem; vira instrução de cor.

## Verificado renderizando

Os cinco slides desenhados com `renderToStaticMarkup` e fotografados no
Chromium, lado a lado com a referência. O que apareceu aí:

1. **O corpo do título na capa estava em 112** e afogava a escada — medido
   contra a referência, é **96**.
2. **A foto do slide do erro fica ENTRE título e corpo** (variante "a"), não
   depois do corpo. É o que a referência faz no segundo e no quarto slide,
   com a ordem invertida entre eles.
3. **A fonte condensada nunca tinha carregado em render nenhum desta
   sessão.** O arnês substituía `url(/fonts/`, e o `conteudo-slides.css`
   escreve `url("/fonts/...")` **com aspas** — todo render anterior caiu no
   fallback Inter em silêncio. Corrigido para `/url\(("|')?\/fonts\//`. Vale
   de lição para a próxima verificação visual: fallback de fonte não avisa,
   e é justamente a fonte que estas identidades existem para copiar.
