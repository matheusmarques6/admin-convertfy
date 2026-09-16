# A base do Obsidian no Estúdio de Carrosséis

## O que a medição achou

Levantamento de 16/09, antes de escrever código.

| | |
|---|---|
| Notas aprovadas em `ai_knowledge_notes` | **256** |
| Com embedding (busca por significado) | **251** |
| Contexto que o Estúdio servia ao modelo | **~40 palavras** hardcoded |
| Ações do módulo Conteúdo que consultavam a base | **zero** |

O parágrafo que o Estúdio servia era este, inteiro:

> "Agência de e-mail marketing e retenção para e-commerce (Convertfy). O
> público é dono de loja e gestor de tráfego; os assuntos giram em torno de
> segmentação, LTV, carrinho abandonado, pós-compra e o que fazer com a base
> que já comprou."

E a base cobre **exatamente** esses assuntos:

| pasta | notas | palavras/nota |
|---|---|---|
| `Advisors/Max` (+ subpastas) | 234 | 644–1.774 |
| … `flows` · `deliverability` · `list-growth` · `copy` · `sms` · `campanhas` | 14 · 14 · 12 · 11 · 12 · 11 | — |
| `Referencias/email` | 11 | 1.690 |
| `Convertfy/estruturas` | 5 | 1.906 |

O ativo mais forte é uma série de **16 notas de NÚMEROS** com valores
verbatim, registro de origem e linha do bruto — e o motor editorial do
Estúdio marcava `[confirmar]` toda vez que não tinha número com fonte.
A casa tinha os números e a IA do carrossel não os via.

## O que passou a acontecer

`blocoConhecimento` é o terceiro bloco do `executarIA`, ao lado dos dois que
já existiam, e cada um responde a uma pergunta diferente:

| bloco | responde | vem de |
|---|---|---|
| **conhecimento** | o que afirmar (mecanismo, limites, números) | base do Obsidian |
| **referências** | como escrever (ritmo, gancho, prova) | carrosséis bons da casa |
| **fontes** | que fato externo existe | busca na internet |

Ações que recebem: `triagem`, `espinha`, `gerar_estrutura`,
`preencher_frame`, `headlines`, `legenda`, `chat`, `pautas`. Ficam de fora
`revisar`, `distribuir`, `corrigir_legenda` e as de leitura — elas julgam ou
transportam texto que já existe, e doutrina ali só gastaria contexto.

## As regras que não podem regredir

### 1. Procedência separa o bloco em dois

`Convertfy/*` e `Referencias/*` são **como a casa faz** — afirmável na
primeira pessoa. `Advisors/Max/*` é **doutrina de curso de terceiro**.
Trocar um pelo outro tem custo nos dois sentidos: virar "nós fazemos assim"
é apropriação; virar "o mercado diz" quando é a casa é modéstia que joga
fora a autoridade da peça. É a mesma razão do cabeçalho fixo do
`buscar_doutrina` no Curador de e-mail.

### 2. Número de doutrina é benchmark, nunca resultado nosso

"3x por semana é o sweet spot" é o que o curso ensina, não o que a Convertfy
mediu. Um slide que troque um pelo outro publica um case falso.

### 3. As três regras do corpus viajam com o número

Copiadas verbatim da nota-índice `numeros-de-email-marketing-mais-pedidos`,
que as declara "sem exceção":

1. **Verbatim** — nunca arredondar, converter, normalizar nem traduzir.
2. **Registro identificado** — o que está marcado `outro-narrador` **não é
   citável como fala do Max**.
3. **Nada de média** — "o piso é 3", nunca "cerca de 5".

Entram **só quando uma tabela de número entra** (reconhecida pelo NOME do
arquivo, não por conter dígito): servi-las em toda geração vira ruído que o
modelo aprende a pular.

### 4. O corte nunca come a ressalva

As notas da casa abrem com o resumo e **fecham declarando o que não
provam**. A de welcome termina com:

> "Esta nota é padrão de execução, não evidência de conversão — não a use
> para afirmar que esta estrutura converte mais que outra."

Cortar só pelo começo preserva o resumo e joga fora a ressalva, e a nota
decapitada vira material para afirmar exatamente o que ela proíbe.
`ressalvaDaNota` acha a última seção de limite e ela entra no orçamento
**antes** do corpo; o trecho omitido fica declarado no meio.

### 5. Path de nota inventado é removido, como link inventado

`verificarFontes` (das evidências da triagem) só confere o que começa com
`http`. Servir a base sem uma segunda régua abriria a porta que a primeira
fecha, e por um caminho pior — **um path interno parece mais confiável que
um link**. `conferirNotasCitadas` confere contra os paths realmente
servidos; o que não bate perde a fonte e o dado sobrevive marcado.

## O limite que a medição impôs

**A busca por significado é o que faz isto funcionar.** Medido contra a base
real:

| consulta | full-text (PT) |
|---|---|
| "carrinho abandonado recuperacao" | **0 notas** |
| "cart abandon" | 3 notas |
| três pautas em linguagem natural | **0/3** |
| as mesmas em palavras-chave | 1/3 |

Duas causas somadas: o corpus mistura português e inglês (está escrito "cart
abandon", não "carrinho abandonado") e o `websearch_to_tsquery` é **AND** —
uma pauta de dez palavras exige que as dez apareçam na nota.

Daí duas decisões:

- **A consulta vai em palavras-chave**, não na frase inteira
  (`consultaDaPauta`, a mesma extração da busca na web). O vetor perde
  pouco; a full-text sai de zero.
- **`semanticaRodou: false` é DITO com força**: "o que chegou é quase
  certamente uma fração do que a base tem; NÃO conclua que a casa não trata
  o assunto". "Pode estar incompleto" faria o modelo concluir o contrário.

## Onde aparece na tela

O painel da triagem passou a mostrar dois blocos separados: **Fontes
consultadas** (web, com link) e **Base da casa** (notas, com o rótulo
`nossa doutrina` × `mercado`). Zero notas é resultado legítimo e a tela diz
isso — esconder faria parecer que a peça tem lastro que não tem.

## Custo

Três notas com teto de 3.500 caracteres cada, teto total de 9.000 — medido
em 5.949 caracteres no caso real (welcome flow + números de flows). Para
`pautas` o teto é menor (2 notas, 4.500): propor pauta precisa saber **que**
ângulo a casa sustenta, não a doutrina inteira.
