# Card do X — o cartão completo

Identidade `tweet` + molde `molde-tweet`. Reproduz o cartão INTEIRO de um
post do X: moldura, logo no canto, texto, foto, a linha de
`hora · data · visualizações` e a barra de contadores. Tudo editável na
tela — foto, texto e as "informações".

É primo das duas famílias de print (`post` e `post-largo`), que reproduzem
uma captura **recortada**: sem moldura, sem hora, sem número. As três
simulam a mesma rede; o que muda é quanto do cartão entra na peça.

## De onde vêm as medidas

Do embed oficial do X, o `react-tweet` da Vercel — o mesmo componente que o
Spell UI usa por baixo (`spell.sh/docs/tweet`). Os valores foram **lidos do
pacote** (`twitter-theme/theme.css` e os `*.module.css` de cada peça), não
de memória nem a olho.

O cartão do embed tem 550 px; o nosso tem 1000 px na base 1080 do canvas,
com 40 px de folga de cada lado. Todo valor de `formato-tweet.ts` é
`medida_do_embed × FATOR_DO_EMBED` (1,818…), gravado já convertido — quem
mexer numa medida compara com a coluna do embed sem refazer a conta.

| item                        | embed | base 1080 |
|-----------------------------|-------|-----------|
| largura do cartão           |   550 |      1000 |
| raio do cartão              |    12 |        22 |
| recuo lateral do conteúdo   |    16 |        29 |
| recuo vertical do conteúdo  |    12 |        22 |
| avatar ⌀                    |    48 |        87 |
| nome e `@handle`            |    15 |        27 |
| logo do X                   | 23,75 |        43 |
| texto do post               |    20 |        36 |
| entrelinha do texto         |    24 |     (1,20) |
| foto: recuo do topo e raio  |    12 |        22 |
| vão da colagem              |     2 |         4 |
| linha de hora/data          |    15 |        27 |
| contadores                  |    14 |        25 |
| ícone do contador           |  17,5 |        32 |

Medido no render a 1080: cartão de 1000 px começando em x=40, texto de
36 px com entrelinha de 43,2 px, ícones de 32 px, selo de 33 px e logo de
43 px — os mesmos números da tabela.

## O que é do embed e o que é do aplicativo

A peça é declaradamente **híbrida**, e o motivo é o pedido: o operador
precisa poder editar os números.

- **Do embed**: a moldura, o raio, o logo do X no canto superior direito,
  toda a tipografia e o espaçamento.
- **Do aplicativo**: a fileira de MÉTRICAS embaixo (resposta, repost,
  curtida, visualização, salvar, compartilhar) distribuída na largura. O
  embed tem outra barra — Curtir · Responder · Copiar link —, que não tem
  número nenhum para o operador editar.

## Três regras que erram em silêncio

1. **Nenhum contador nasce preenchido.** Cartão sem número é o que o X
   mostra num post recém-publicado, e é o único estado honesto: número
   semeado por nós seria engajamento inventado impresso na peça. O exemplo
   fica no `placeholder` do painel; quem escreve é o operador.
2. **Contador vazio FICA na barra**, com valor vazio. Tirá-lo mudaria o
   espaçamento dos outros, e a barra deixaria de ser a do X justamente no
   slide sem número.
3. **Os cinco ícones saem em cinza e em contorno.** No X, ícone preenchido
   e colorido quer dizer "eu interagi com este post" — rosa se eu curti,
   verde se eu repostei —, não "o post tem muita curtida". A primeira
   versão pintava o coração de rosa assim que um número era digitado, o que
   conflata as duas coisas. O print que a peça imita é o de um post de
   terceiro, e nele os cinco ficam neutros.

A terceira apareceu **renderizando**: os traçados de resposta e curtida
vinham do `react-tweet`, onde são botões e portanto preenchidos, e saíam
como manchas sólidas ao lado de três ícones em contorno. Nenhum teste pega
peso de ícone.

## Campos

`titulo` é o primeiro parágrafo e `corpo` o segundo — os dois no MESMO
corpo e no MESMO peso, porque o X não tem negrito no texto do post. A
divisão existe pelo mesmo motivo do cartão de thread: é ela que permite a
foto entrar no meio do texto, e é o que preserva a copy de quem chega de
uma identidade que tem os dois campos.

**Não há `botao`**: o cartão do X não tem botão, e o fecho do carrossel
aqui é o próprio texto do post ("comente MÉTODO"). Um botão ali seria o
primeiro elemento a denunciar a peça.

O limite é o da **plataforma** (280 caracteres por post, divididos entre os
dois parágrafos), não o do tipo de slide: texto maior que o que o X aceita
é a primeira coisa que denuncia a peça como montada.

## As informações

Ficam em `DocFrame.tweet`, **fora** de `campos`/`textos`. `Campo` é o
conjunto de copy — o que a IA escreve, o que `ST_LIMITES` limita e o que o
auto-fit encolhe; contador não é copy: tem painel próprio, formato próprio
e não entra na régua de caracteres.

O painel fica em Ajustes → Texto ("Informações do post"), por slide, com
dois atalhos: **Usar agora** (carimba hora e data em pt-BR) e **Usar em
todos os slides** — o carrossel simula um fio, e digitar cinco números em
cinco slides é o atrito que faria a barra ficar vazia. Dois interruptores
escondem a linha de hora e a barra por slide.

## Temas

Os quatro temas do X (`print`, `claro`, `dim`, `escuro`) valem aqui como
nas famílias de print, com a cor de moldura (`--tweet-border`) que só esta
identidade desenha. No tema claro o cartão e a página são brancos e o que
os separa é a moldura — que é exatamente o que o X faz.

## Fonte

A mesma pilha das outras identidades que simulam a rede: **Inter** à frente
de `Segoe UI, Roboto, Helvetica, Arial`. Chirp (a fonte do X) é
proprietária e não pode ser embarcada; Inter é o substituto livre mais
próximo em proporção e mantém a exportação determinística — com fonte de
sistema o PNG mudaria de máquina para máquina.

## Limites declarados

- **Sem variantes de layout.** O cartão cresce com o conteúdo e fica
  centrado, sempre. `variantesDoTipo` devolve `undefined` aqui: oferecer o
  seletor da casa seria um controle que o operador mexe e não muda nada.
- **Sem campos opcionais** (gancho, anotação, caixa de destaque). O
  renderer tem UM desenho e não os desenha em lugar nenhum — o mesmo vale
  para as outras três identidades de rede, e era um campo fantasma
  pré-existente nelas.
- A foto é **16:9** sobre a largura interna do cartão, calculada e não
  escrita: mudar o recuo lateral sem mexer nessa linha deixaria a foto fora
  de proporção sem ninguém perceber.
