# Briefing: organizar o vault de conhecimento da ConvertIA

**Para quem recebe este documento:** você vai reorganizar um vault do
Obsidian que alimenta uma IA. As regras abaixo não são preferência de
estilo — são o comportamento medido do sincronizador e do agente que
leem esse vault. Uma nota que viole qualquer uma delas continua bonita
no Obsidian e some da base, sem erro em lugar nenhum.

Repositório: `matheusmarques6/All-for-Eficiencia`, branch `main`.
Pasta desta base: `Admin Convertfy/Conhecimento/`.

> ⚠️ **Não mexa em `Admin Convertfy/Emails/`.** São 223 notas lidas por
> OUTRO sistema (o Curador do pipeline de geração de e-mail), com
> contrato próprio de frontmatter e nomes. Renomear ali quebra a
> geração de e-mail em produção.

---

## 1. Como a IA realmente lê este vault

Três canais, com capacidades muito diferentes. Isto é o que decide o
que vale organizar:

| Canal | Tamanho | Entra quando |
|---|---|---|
| Persona do advisor | até **18.000** chars | **Sempre**, em toda resposta |
| Catálogo de títulos | até **400** notas, só os títulos | **Sempre** |
| Corpo das notas | **12.000** chars por leitura | Só se a IA buscar e abrir |

Medido hoje: persona com 14.093 chars, catálogo com 2.665, e **1.054.434
chars de corpo** espalhados em 123 notas. Numa conversa típica a IA abre
2 a 4 notas — cerca de 3% do acervo.

**Consequência para a organização:** o que decide se uma nota é usada
não é a qualidade dela, é (a) o título estar no catálogo e (b) o título
descrever o assunto bem o bastante para ser escolhido. Organizar aqui é
principalmente **trabalho de nomes e de recortes**, não de pastas.

---

## 2. As seis regras que fazem uma nota existir

**1. Sem `status: aprovado`, a nota é ignorada em silêncio.**
Aceita também `aprovada`, `approved`, `publicado`, `published`.

**2. `_index.md` e `readme.md` são DESCARTADOS.**
Junto com pastas ocultas, `templates/` e `_templates/`. Hoje há **11
arquivos `_index.md` no vault e nenhum está na base** — é exatamente a
diferença entre as 135 notas do Obsidian e as 124 da base. Mapa de
pasta deve se chamar `mapa-do-<assunto>.md`.

**3. O título vem do NOME DO ARQUIVO**, não do `# H1`.
`secao-hero.md` vira "Secao hero". Para forçar outro nome, use `title:`
no frontmatter — ele vence. O nome do arquivo é a interface de busca
inteira: é por ele que a IA escolhe o que abrir.

**4. O resumo da busca tem 320 caracteres e descarta código, títulos e
imagens.**
Ele é gerado da primeira prosa do corpo. Medido: uma nota que abre com
um bloco de HTML produz o resumo "O primeiro passo pede só o e-mail",
que não diz do que trata — e a IA escolhe pelo resumo. **Toda nota
precisa abrir com uma frase que se explique sozinha**, antes de
qualquer título ou código.

**5. A leitura corta em 12.000 caracteres**, com um aviso "(truncado)".
Doze notas já passam disso e chegam cortadas ao modelo. As piores:

- `Advisors/Max/_conflitos-completo.md` — 128.639 chars (**10× o limite**)
- `Advisors/Max/_numeros-completo.md` — 88.552
- `Advisors/Max/_conflitos.md` — 64.740
- `Advisors/Max/_cobertura.md` — 44.766
- `Advisors/Max/_casos-de-teste.md` — 42.875
- `Advisors/Max/_autoria.md` — 30.483

Na prática a IA lê o primeiro décimo dessas e conclui a partir dele.

**6. Wikilinks `[[Nota]]` viram grafo** e a leitura devolve as conexões.
Resolvem por NOME do arquivo, como no Obsidian — não por caminho.

---

## 3. O que precisa ser feito

### Tarefa A — quebrar as seis notas gigantes

Cada uma vira várias notas de no máximo ~10.000 caracteres, ligadas por
wikilink, mais um `mapa-<assunto>.md` curto que aponta para as partes.

O corte é **por assunto, nunca por tamanho**: metade de um argumento em
cada nota é pior que a nota truncada, porque as duas metades passam a
ser encontradas separadamente e nenhuma se sustenta sozinha.

Cada parte precisa de nome próprio e específico. `conflitos-parte-2` não
é nome — `conflitos-frequencia-de-envio` é.

### Tarefa B — renomear os 11 `_index.md`

Para `mapa-do-<assunto>.md`, com `status: aprovado`. O conteúdo deles é
útil (dizem o que existe na pasta e por onde começar) e está invisível
hoje.

### Tarefa C — auditar os nomes de arquivo

Percorra as 124 notas e marque as que têm nome que não descreve o
assunto sozinho, fora do contexto da pasta. O catálogo mostra os títulos
agrupados por pasta, mas a busca semântica compara o texto todo — nome
genérico perde nas duas.

Casos a revisar (nomes que só fazem sentido dentro da pasta):
`o-que-e.md`, `segmentacao.md`, `frequencia.md`, `glossario.md`.
Proponha o nome novo e o porquê; **não renomeie sem confirmar** — os
wikilinks apontam por nome e quebram junto.

### Tarefa D — os tipos de nota que faltam

A base hoje é **100% doutrina de curso**: ensina o que fazer e por quê.
Não há uma nota que mostre COMO uma peça fica pronta, nem nada escrito
pela Convertfy. Faltam quatro tipos, em ordem de valor:

1. **Anti-exemplos** — o que a casa rejeita e por quê. A base ensina o
   que perseguir e nada sobre o que evitar; evitar é metade do
   julgamento.
2. **Decisões com número** — "trocamos X por Y e a conversão foi de A
   para B". É o que a IA não pode inventar.
3. **Paleta e tipografia nomeadas** — hex e nomes de fonte reais. Hoje
   "cores da marca" não significa nada para o modelo, então ele
   improvisa.
4. **Vocabulário da marca** — as palavras que a casa usa e as que não
   usa.

O molde e as convenções estão em
`Padrao Convertfy/como-escrever-uma-nota.md`, e há duas notas de
referência já escritas nesse formato em `Padrao Convertfy/`.

### Tarefa E — a persona tem 3.900 caracteres livres

`Advisors/Max/persona.md` tem 14.093 de 18.000. É o único bloco que
entra em TODA resposta, sem depender de busca — cada palavra ali vale
mais que uma nota inteira que talvez seja lida. O próprio vault já
registra a razão em `_arquitetura.md`: persona por prompt foi medida
como o maior multiplicador de fidelidade que existe, e é grátis.

Use o espaço para o que é **julgamento**, não informação: como ele
decide entre duas opções, o que ele recusa de saída, que pergunta ele
faz antes de opinar. Informação cabe em nota; julgamento só cabe aqui.

---

## 4. O que NÃO fazer

- **Não crie hierarquia mais profunda.** O catálogo agrupa por pasta e
  mostra títulos; pasta dentro de pasta dentro de pasta não melhora a
  escolha e piora o caminho do wikilink.
- **Não mova notas entre pastas sem atualizar os wikilinks.** Eles
  resolvem por nome, então mover é seguro, mas RENOMEAR quebra.
- **Não crie nota de menos de ~1.500 caracteres.** Ela ocupa uma linha
  do catálogo e não sustenta uma resposta; melhor virar seção de uma
  nota existente.
- **Não escreva mais doutrina.** Já há 1 MB dela. O que falta é
  execução.

---

## 5. Como conferir se deu certo

Depois de qualquer mudança, no admin: **Custo de IA → card ConvertIA ·
Saúde → "Re-sincronizar vault"**. Ele mostra quantas notas entraram,
quantas foram puladas e o motivo de cada uma. Nota que sumiu aparece
como diferença na contagem — hoje: 124.

O mesmo card lista as **lacunas**: as buscas que a IA fez e voltaram
vazias, ordenadas por frequência. É a melhor pauta do que escrever a
seguir, porque vem de quem perguntou de verdade.
