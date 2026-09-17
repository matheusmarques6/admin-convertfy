# Identidade "Thread" — o cartão de thread comentada

Família visual `thread` + molde `molde-thread` ("Thread comentada"). Foi
lida dos **quatro prints do construtor de carrossel da referência** (o
"Template Twitter" deles), enviados pelo usuário com o pedido de copiar o
formato e comparar as duas plataformas.

## É outro gênero, não uma variação do print de tweet

O Estúdio já tinha duas famílias que simulam captura de post (`post` e
`post-largo`). Esta é **outra coisa**, e confundir as duas produziria a peça
errada: aquelas simulam UM post; esta simula uma peça **editorial com cara
de thread** — cartão claro, barra de metadados no topo, bloco de autoria, e
um fio de parágrafos com uma foto no meio.

| | `post` (print de tweet) | `thread` (esta) |
|---|---|---|
| fundo do cartão | quase preto | **branco** |
| topo | nada | **barra de metadados**: `@handle` · marca · copyright |
| autoria | avatar + nome + selo + handle | igual, porém em claro |
| corpo | um bloco | **fio**: parágrafo, foto, parágrafo |
| fecho | mesmo cartão | slide **PRETO** com avatar, handle e a frase |
| campos | `titulo` + `corpo`; o CTA tem `botao` | `titulo` + `corpo`; o fecho só `titulo` |

## De onde vêm os números

Dos prints do construtor, com o canvas a 100%: **o cartão mede 459 px de
tela para uma peça de 1080**, ou seja escala **0,425**. Cada medida de
`src/lib/conteudo/formato-thread.ts` é a da tela dividida por ela, e
`doTela()` deixa a conta no código em vez de num comentário — quem for
reconferir não tem de refazê-la.

**Procedência declarada:** é a mesma classe de precisão das duas famílias de
print (medida de imagem renderizada) e um degrau abaixo de ter o arquivo
original — o que o print do construtor entrega é a peça em 42,5% do tamanho.
Um degrau acima da extinta `neon`, que tinha sido feita só da descrição
escrita.

## A fonte — a pergunta que o formato obriga a responder

O usuário perguntou, sobre as famílias que simulam post: *"qual seria a
fonte ideal"*. A resposta não é estética, é de **procedência**:

- O X usa **Chirp**, proprietária. Não pode ser embarcada, e sem ela a
  exportação sairia diferente em cada máquina.
- A própria aplicação declara a pilha de fallback `Segoe UI, Roboto,
  Helvetica, Arial` — todas **grotescas**, e é essa a família tipográfica
  que o olho lê como "interface".
- **Inter** é a grotesca livre mais próxima em proporção, já é self-hosted
  aqui e mantém a exportação **determinística**.

Por isso `FONTE_POST` é `'Inter Slides', Inter, 'Segoe UI', Roboto,
Helvetica, Arial` e a `thread` usa a MESMA pilha das outras duas: elas
simulam a mesma interface, e o que as separa é a métrica, não a face.

**Poppins saiu do repositório** por causa dessa mesma pergunta: é
geométrica (linhagem Futura), com `a` de um andar só e bojo circular —
nenhuma interface social usa isso no corpo do post, e é exatamente esse
detalhe que faz uma peça ler como "montada num gerador" em vez de capturada
da tela.

O **peso** também é decisão medida, não default: na referência o fio é
**semibold (600)**, não regular. Com 400 o cartão fica leve demais e perde a
ênfase que o formato usa para marcar o argumento — `THREAD_PESO_CORPO`
existe para esse número não voltar a 400 por acidente.

## O que a identidade decide

| traço | valor | por quê |
|---|---|---|
| fundo do cartão | `#FFFFFF` | branco puro; a página creme do print é do aplicativo, não da peça |
| fundo do fecho | `#000000` | o corte no fim, onde a frase fica sozinha |
| tinta | `#000000` | corpo e nome |
| metadado | `#9C9C9C` | barra do topo, handle e selo |
| fonte | pilha grotesca (acima) | é o que simula interface |
| peso do corpo | 600 | medido da referência |
| raio | 10 | o canto da foto do fio |
| barra do topo, contador, rodapé de marca | **nenhum** | a peça imita uma captura; enfeite da casa denuncia que não é uma |

## O ritmo: todo cartão branco, só o fecho preto

`fundoPadraoDaFamilia` decide pela POSIÇÃO como nas outras famílias de ritmo
— mas aqui a regra é simples: `cta` → preto, todo o resto → branco.

Isso descobriu **um defeito latente** em `aplicarFamilia`: ela decidia se
recalculava o fundo por uma **lista de traços escrita à mão**
(`alternaFundo`/`cartaoPerfil`/`respiroEscuro`), e a `thread` ficou de fora
dela — o fecho herdava o "gradiente" da casa e saía **branco com texto
branco**, invisível, sem erro nenhum. A decisão passou a ser pelo
RESULTADO: compara o padrão posicional antigo com o novo. Um segundo da
mesma família estava em `ehFamilia`, um `||` escrito à mão que derrubava a
identidade nova para `padrao` em silêncio; agora deriva de `FAMILIAS`.

E uma terceira, com o preço mais peculiar: `FAMILIA_OPCOES`, a lista do
seletor. A identidade existia INTEIRA — tipo, mapa, molde — e a peça nascia
certa ao escolher o molde, mas ela **não podia ser escolhida** em Marca →
Identidade visual nem no diálogo de criação. Nenhum erro, nenhuma opção
faltando visivelmente; simplesmente não estava lá. Agora deriva de
`FAMILIAS`.

**É o padrão de falha desta parte do código**: lista escrita à mão que
descarta a entrada nova sem avisar. As três portas têm teste.

## A barra de metadados não entra no fecho

`temBarraDeMetadados(tipo)` devolve `false` para `cta`. Na referência o
slide preto tem avatar e `@handle` no topo e mais nada — pôr a barra ali
repetiria a marca duas vezes justamente no slide que existe para deixar uma
frase sozinha.

## Limites de texto próprios

O fio é longo de propósito (na referência um slide chega a quatro
parágrafos), então o limite do TIPO — desenhado para uma afirmação curta —
encolheria a letra sem necessidade. `LIMITES_THREAD` sobe `titulo` e `corpo`
para 260; o fecho é o oposto, uma frase que precisa caber **grande**.

## O construtor deles × o nosso

O pedido pedia também comparar as plataformas. Cada painel dos quatro prints
foi conferido contra a nossa tela:

| painel da referência | aqui |
|---|---|
| seletor de template | ✅ prateleira com prévia real |
| colar texto + "Aplicar" | ✅ mesmo gesto, placeholder idêntico |
| CAMPOS GLOBAIS com olhinhos de visibilidade | ✅ + vínculo com o brand kit |
| "Clique em um texto no slide para editar estilo" | ✅ mesma frase |
| MÍDIA com slots numerados e "N de M slots" | ✅ + a nota de quais frames não têm slot |
| CORES GLOBAIS | ✅ |
| FUNDO por slide, listados juntos | ✅ |
| CTA liga/desliga | ✅ |
| PROPORÇÃO 9:16 \| 4:5 | ✅ mesma explicação |
| histórico | ✅ |
| grade de frames em 2 colunas com menu ⋮ | ✅ |
| zoom, alta fidelidade | ✅ |
| exportar PNG/JPG em ZIP | ✅ |
| — | ➕ banco de imagens da org |
| — | ➕ geração de imagem pela ConvertIA |
| — | ➕ colagem de duas fotos |
| — | ➕ motor editorial (triagem → headline → espinha → revisão) |

**Conclusão da comparação: a lacuna não era de construtor, era de
formato.** O painel deles não tem nada que o nosso não tenha; o que eles
tinham e nós não era o "Template Twitter" — e é ele que esta família passou
a entregar.

## O chrome da interface não é a paleta da peça

Duas decisões que só apareceram ao renderizar a **prateleira**, onde nenhum
molde tem avatar:

- **O selo verificado é chrome da interface simulada**, como a barra de
  metadados e o handle. Estava preso a `doc.cores.destaque`: quem trocasse a
  cor global do documento veria o selo virar vermelho, e nenhuma rede faz
  isso. Passou a ser a constante cinza da família, como a `post` já fazia com
  `POST_CORES.selo`.
- **Avatar sem foto mostra a INICIAL**, como no cartão de perfil. Um círculo
  cinza chapado lê como imagem que não carregou — e é exatamente isso que a
  prateleira exibia.

## Verificado renderizando

`renderToStaticMarkup` + Chromium, contra os prints:

- **capa**: quebra de linha **idêntica** à referência ("Um ex-dono de
  academia acaba de mudar a história / do marketing digital para sempre.");
- **slide 2**: casa com o terceiro print;
- **fecho**: preto, avatar e `@handle` no canto superior esquerdo, a frase
  branca centrada. `fechoTexto` foi de 46 para 52 porque a quebra saía uma
  palavra depois da referência — defeito que nenhum teste pegaria.

## Limite declarado

O que temos é o print do construtor, não o arquivo. Isso fixa as
proporções com segurança, mas deixa em aberto o **tracking exato** e o
**hinting** da fonte original, que só o arquivo (ou a peça exportada)
responderia.
