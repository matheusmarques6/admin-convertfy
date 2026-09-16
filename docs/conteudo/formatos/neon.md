# Identidade "Neon" — o bloco preto com foto acesa

Família visual `neon` + molde `molde-neon` ("Oferta em neon"). A peça é um
**bloco preto** do começo ao fim: título condensado em caixa alta alternando
azul elétrico e branco, foto recortada com brilho azul, um slide claro de
respiro no meio e uma **caixa sólida** azul no fecho.

## O que a identidade decide

| traço | valor | por quê |
|---|---|---|
| fundo escuro | `#0A0A0A` | preto puro (`#000`) chapa e **come o brilho da foto**, que é o elemento do formato |
| fundo claro | `#F2F2F2` | o respiro tem de parecer papel ao lado do bloco, não um furo de luz |
| destaque | `#3B5BFD` | o azul elétrico: palavra marcada, régua, caixa do fecho |
| tinta (`hook`) | `#0A0A0A` | é a cor sobre o CLARO; no escuro o renderer usa branco |
| apoio (`cores.apoio`) | `#2E2E2E` | o corpo no slide claro — o azul-marinho da casa brigaria com o preto-e-azul |
| título | Barlow Condensed 800, caixa alta, entrelinha **0,88** | o título é massa; o que faz a massa é o espaço APERTADO entre as linhas |
| raio | 28 | o único elemento com canto redondo é a foto; o resto é chapado |
| brilho da foto | 90 px na cor de destaque | `box-shadow` desenha para FORA da caixa, então ele não some com o recorte |
| CTA | `bloco` | retângulo sólido de canto quase reto, texto condensado em caixa alta |
| assinatura no slide | **não** | o rodapé de marca já carrega o handle; repeti-lo colado no título duplica a mesma informação |

**`**palavra**` sai em azul.** A alternância azul/branco dentro do título não
é campo novo: é o realce que o Estúdio já tinha (`rich.ts`), e por isso o
limite de caracteres continua contando o texto SEM os marcadores.

## O ritmo: bloco preto com UM respiro

`respiroClaro` não é a alternância do Alternado (claro/escuro a cada passo).
Aqui o claro é o **corte único** que dá fôlego antes do fecho: o slide no
meio da sequência (`Math.floor(total / 2)`), e só ele. Capa e CTA **não**
abrem exceção para gradiente — abriria um furo no bloco.

Duas regras que os testes travam:

- **Sem saber o total, a peça fica TODA escura.** Inventar a posição do
  respiro colocaria o corte no lugar errado, e um corte no lugar errado é
  pior que nenhum.
- **Inserir um slide no meio REFAZ o ritmo** (`ritmoDeFundos`, que agora
  vale para toda família cujo fundo é função da posição). Sem isso, o
  respiro fica preso ao slide antigo no primeiro slide adicionado. Fundo
  pintado à mão continua onde o usuário pôs.

## A capa é foto ACESA, não foto de fundo

Nas outras famílias a capa sangra a foto de borda a borda com um véu escuro
por cima. Aqui não: a foto é um **bloco recortado** na parte de cima e o
título fecha embaixo. Sangrar apagaria o brilho (não há preto em volta para
ele aparecer) e o véu faria o oposto do que o formato quer — a foto é a
única fonte de luz da peça.

## O molde

Seis slides: **Afirmação** (capa com foto), **Promessa**, **Prova**,
**Respiro** (o único claro e o único sem foto — é o slide de argumento),
**Oferta** e **Chamada**. Mover o Respiro muda qual slide respira: a posição
dele é o que `fundoPadraoDaFamilia` lê.

## Verificado renderizando

Os seis slides desenhados com `renderToStaticMarkup` e fotografados no
Chromium. Dois defeitos apareceram aí — nenhum quebra teste:

1. **O título do slide claro saía BRANCO**, invisível. `cores.hook` estava
   como branco, e `hook` é a tinta sobre o CLARO (no escuro o renderer usa
   branco fixo). É o mesmo defeito que a Alternado pagou em set/2026.
2. **A capa sangrava a foto** com véu, matando o brilho — virou o bloco
   recortado descrito acima.

E um terceiro que o teste pegou, com a mesma raiz: `aplicarFamilia` só
substituía as cores que a família NOVA declara, então `apoio` — que só a
Neon tem — sobrevivia à troca e ia pintar o corpo dos slides claros da casa.
Agora a cor que só a família anterior declarava **sai** na troca, desde que
ainda seja o padrão dela; cor posta à mão fica.

## Limite declarado, e é o principal

**As medidas desta identidade NÃO foram tiradas da referência.** As duas
famílias de print (`post`, `post-largo`) têm tabela de/para medida pixel a
pixel do arquivo original; esta foi construída a partir da DESCRIÇÃO do
formato (bloco preto, condensada em caixa alta, azul `#3B5BFD` alternando
com branco, foto com canto e brilho, caixa sólida no fecho, um slide claro
com régua) porque a imagem da referência não estava disponível no momento
da construção.

O que isso significa na prática: o **gênero** está certo e cada decisão está
declarada acima, mas corpo do título, margens, altura da foto e o vão entre
os blocos são escolhas — não medições. Com o arquivo da referência à mão, o
caminho é o mesmo do print de tweet: medir, gravar já convertido para a base
1080 e trocar os números; nada do desenho precisa mudar para isso.
