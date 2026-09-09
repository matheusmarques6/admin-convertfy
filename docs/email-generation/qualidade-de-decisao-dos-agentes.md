# Qualidade de decisão dos agentes de e-mail

*09/09/2026 · proposta de arquitetura baseada no pipeline vigente e nas
últimas análises versionadas de produção.*

## Decisão

Os agentes não devem ser instruídos a simplesmente “pensar mais”. O pipeline
deve exigir um **artefato curto e verificável de decisão** nos pontos em que há
escolha editorial, e usar validação determinística nos pontos mecânicos.

O padrão recomendado é:

```text
enquadrar → propor → confrontar → decidir → verificar
```

Isso não significa guardar raciocínio privado ou pedir uma longa cadeia de
pensamento. O que atravessa o pipeline é uma **ficha de decisão** objetiva:

```json
{
  "objetivo": "o resultado que este agente precisa produzir",
  "restricoes_duras": ["fatos e proibições que não podem ser violados"],
  "alternativas": ["no máximo três opções realmente consideradas"],
  "decisao": "opção escolhida",
  "evidencias": ["IDs ou slugs das fontes usadas"],
  "riscos": ["como esta decisão pode estar errada"],
  "verificacoes": ["checks que foram executados"],
  "confianca": "alta | media | baixa",
  "pendencias": ["dados ausentes que impedem afirmar algo"]
}
```

Essa ficha é pequena, auditável e pode ser validada. “Pense passo a passo” é
difícil de medir, aumenta tokens e não garante que a conclusão obedeça aos
fatos. Uma decisão explícita permite conferir se o agente viu a restrição,
comparou alternativas e testou o próprio resultado.

## O que já está pronto — não refazer

O levantamento anterior misturava lacunas atuais com tarefas que já foram
entregues. No código vigente já existem:

- retry do Estruturador quando a saída vem ilegível ou truncada;
- Curador fail-closed: ranking inutilizável retenta e depois falha visivelmente,
  sem composição arbitrária;
- Curador do vault consumido no modo `on`, com decisão completa do
  Estruturador, lacunas, índice consultável e aprendizado;
- casos A/B do Curador transformados em testes das réguas puras;
- proteção da copy do hero, com retry quando o texto do merge desaparece;
- agentes de formatação limitados por região/operações e guards estruturais;
- telemetria com prompt segmentado, entrada estruturada, saída, custo, duração
  e proveniência;
- ciclo de orientação/revisão humana para Estruturador e Curador;
- criação de propostas de lacuna a partir da telemetria do Curador.

Essas entregas são fundação do mecanismo abaixo. A proposta não adiciona um
“agente revisor” indiscriminadamente depois de cada nó e não reabre trabalho já
concluído.

## Evidência externa usada como princípio

As fontes convergem em quatro ideias úteis para este pipeline:

1. **Fluxos simples e verificáveis antes de autonomia extra.** O guia
   [Building effective agents, da Anthropic](https://www.anthropic.com/research/building-effective-agents)
   recomenda começar com padrões compostos simples e acrescentar complexidade
   apenas quando ela melhora resultados medidos.
2. **Crítica com feedback acionável.** O trabalho
   [Self-Refine](https://arxiv.org/abs/2303.17651) separa produção, feedback e
   refinamento iterativo. Para o Convertfy, o feedback precisa nomear a
   restrição violada; uma segunda chamada genérica só repete preferências.
3. **Reflexão precisa de memória e sinal do ambiente.** O trabalho
   [Reflexion](https://arxiv.org/abs/2303.11366) usa feedback observável para
   orientar tentativas seguintes. Aqui, guards, revisão humana e desempenho do
   email são o sinal; opinião do próprio modelo não é evidência suficiente.
4. **Raciocínio não substitui contrato.** As
   [práticas para modelos de raciocínio da OpenAI](https://platform.openai.com/docs/guides/reasoning-best-practices)
   favorecem objetivos claros, restrições e critérios de sucesso. Pedir uma
   cadeia de pensamento verbosa não corrige entrada contraditória.

> Limitação da pesquisa: os links são fontes primárias conhecidas, mas o
> acesso web da sessão respondeu `401 Unauthorized`; portanto não houve
> revalidação online do conteúdo em 09/09/2026. A decisão também foi cruzada
> com os contratos e diagnósticos versionados deste repositório.

## Por que uma reflexão em todos os agentes seria um erro

Nem todo nó toma uma decisão. `copy_merge`, aplicação de cores, splice de hero,
normalização de fonte e pós-processamento são transformações mecânicas. Pedir
reflexão nesses nós:

- aumenta custo e latência;
- cria uma nova oportunidade de alterar copy correta;
- torna uma transformação determinística menos reproduzível;
- produz justificativas plausíveis para erros que um guard detectaria melhor.

O esforço deliberativo deve crescer com duas variáveis:

```text
deliberacao = impacto_da_decisao × incerteza_dos_dados
```

| Impacto | Incerteza | Comportamento |
|---|---|---|
| baixo | baixa | uma passada + guard determinístico |
| alto | baixa | decisão estruturada + validação |
| baixo | alta | fallback conservador ou pendência |
| alto | alta | alternativas + crítico + decisão final; pode bloquear |

## O protocolo compartilhado

### 1. Enquadrar antes de gerar

O agente declara objetivo, fatos disponíveis, fatos ausentes, restrições duras
e critério de sucesso. Dados desconhecidos continuam desconhecidos; não viram
inferência.

### 2. Propor poucas alternativas reais

Agentes editoriais consideram até três opções. A lista não precisa existir
quando há uma única transformação válida. Cada alternativa referencia a fonte
que a sustenta e declara o principal custo.

### 3. Confrontar com um crítico dirigido

O crítico não recebe “critique sua resposta”. Recebe perguntas específicas:

- contradiz algum fato da loja?
- viola uma proibição do toque?
- depende de ativo não confirmado?
- repete a função de outro email da régua?
- o componente escolhido consegue realizar o papel?
- alguma etapa seguinte pode desfazer esta decisão?

Quando possível, essas perguntas são respondidas por código. O LLM crítico só
atua sobre adequação editorial, composição e ambiguidades que não podem ser
reduzidas a uma regra.

### 4. Decidir com precedência explícita

Em conflito, a ordem é:

1. fato confirmado da loja;
2. restrição legal, de marca ou deste toque;
3. revisão humana específica;
4. intenção e decisão upstream vigente;
5. aprendizado com origem;
6. doutrina;
7. referência e preferência estética.

Uma fonte inferior pode sugerir, mas nunca contrariar uma superior. Se duas
fontes do mesmo nível divergem, a ficha registra o conflito em `pendencias`.

### 5. Verificar o resultado, não a eloquência

O nó só termina quando seus critérios observáveis passam. A justificativa não
compensa um guard reprovado. Em segunda tentativa, o agente recebe exatamente
os checks que falharam; não recebe apenas “tente novamente”.

## Aplicação por agente

| Agente | Precisa deliberar? | Decisão e reflexão exigidas | Verificação |
|---|---|---|---|
| Seletor | sim, alta | comparar riscos/objeções e explicar por que este toque deve atacar uma delas agora | contrato de intenção, incentivo e não repetição |
| Catalogador | sim, média | separar fato observado de hipótese e declarar cobertura insuficiente | vocabulário fechado + origem de cada evidência |
| Estruturador | sim, alta | comparar 2–3 estruturas, simular progressão e escolher a que realiza o alvo com os ativos existentes | seções disponíveis, orçamento, progressão e restrições |
| Curador | sim, alta | comparar finalistas por capacidade anatômica antes de gosto/estética; declarar risco da escolha | IDs reais, schema resumido, convivência e ativos exigidos |
| Montador | só em ambiguidade | avaliar equilíbrio do conjunto quando duas candidatas continuam equivalentes | cobertura, duplicidade permitida e peso total |
| Blueprint | não por padrão | traduzir decisão upstream sem reinterpretá-la | coerência `papel × fields × omitir` por código |
| Copy | sim, alta | escolher ângulo e formulação sem criar fatos; revisar promessa, especificidade e continuidade | fatos permitidos, campos obrigatórios, idioma e limites |
| Copy fit | não | encurtar preservando fatos e polaridade | equivalência semântica + regras mecânicas |
| Imagem | sim, média/alta | escolher cena que realiza a intenção e usa referências válidas | produto, pessoa, composição, slot e política de marca |
| Hero | não sobre estratégia | executar a direção aprovada, sem reescrever copy | preservação da copy e região |
| Texto/Tipografia/Cor | média apenas na escolha estética | justificar a operação mínima e o risco de legibilidade | guards de estrutura, fonte, contraste e links |
| QA | sim como avaliador | classificar gravidade e citar evidência observável | checks determinísticos vencem opinião do modelo |

## Arquitetura recomendada: crítico seletivo, não universal

Adicionar uma camada compartilhada `decision-quality`, mas manter a execução
adaptativa:

```text
Agente
  ├─ ficha de decisão + saída
  ├─ guards determinísticos
  │    ├─ passou e confiança alta → segue
  │    └─ falhou → retry com falhas nomeadas
  └─ alto impacto + confiança baixa/conflito
       ├─ crítico editorial separado
       └─ agente decide novamente com o parecer
```

O crítico deve, idealmente, usar contexto menor que o executor: objetivo,
restrições, ficha, saída e evidências citadas. Reenviar o vault inteiro duplica
custo e ruído. O crítico não edita a resposta; ele devolve violações e
perguntas. O executor continua responsável pela decisão final.

## Contrato técnico incremental

### Biblioteca compartilhada

Criar `src/lib/agents/shared/decision-quality.ts` com:

- schema Zod de `DecisionCard` e `CritiqueResult`;
- severidade `info | warning | blocking`;
- motivos fechados (`fato_ausente`, `fonte_conflitante`,
  `restricao_violada`, `ativo_nao_confirmado`, `alternativa_nao_comparada`,
  `saida_nao_verificada`);
- função pura que decide `accept | retry | critic | block` a partir de impacto,
  confiança e violações;
- render compacto das instruções compartilhadas, versionado e com hash.

### Persistência

Na primeira fase, guardar a ficha dentro de `parsed_output._decisao`, sem nova
tabela. Guardar somente o resumo verificável, nunca raciocínio livre. Para
crítica adicional, registrar uma run própria com `agent='<agente>_critic'`,
ligada ao mesmo `batch_id`, `email_id` e `flow_id`.

Depois de validar o formato em shadow, uma migration pode promover métricas
consultadas com frequência (`decision_confidence`, `decision_outcome`,
`blocking_issues_count`) a colunas ou view.

### Compatibilidade

O rollout não deve alterar de uma vez todos os schemas dos agentes. A ficha
começa opcional e em `shadow`, calculada para Estruturador, Curador e Copy. A
saída operacional atual continua sendo a fonte do pipeline até que a medição
prove melhora.

## Métricas que decidem se “pensar mais” funcionou

Não medir qualidade pela quantidade de justificativa. Comparar controle e
tratamento por:

- taxa de violações factuais por email;
- placeholders e ativos ausentes no HTML final;
- divergência entre decisão upstream e resultado final;
- aprovação humana sem edição;
- número e tamanho das edições humanas;
- repetição indevida entre emails da régua;
- retries, fallback, latência e custo por email;
- confiança calibrada: decisões `baixa` realmente erram mais?
- desempenho posterior do email, quando houver amostra suficiente, sem atribuir
  causalidade a uma única geração.

Uma ficha é útil apenas se prediz erro ou melhora revisão. Se ela aumenta custo
sem mudar guards, aprovação ou resultado, deve ser removida.

## Rollout seguro

### Etapa 1 — contrato puro

Implementar schemas, política `accept/retry/critic/block` e testes, sem chamadas
extras nem mudança de comportamento.

### Etapa 2 — shadow em três decisões

Estruturador, Curador e Copy passam a produzir `_decisao`. Validar se citam
fontes existentes, capturam restrições e reconhecem pendências. Nenhum crítico
extra ainda.

### Etapa 3 — guards alimentam retry

Converter falhas atuais em `CritiqueResult` e enviar ao retry. Isso aproveita
checks já existentes e evita uma nova chamada apenas para descobrir o que o
código já sabe.

### Etapa 4 — crítico somente em incerteza alta

Ativar crítico editorial quando a decisão for de alto impacto e ocorrer pelo
menos uma condição: confiança baixa, fonte conflitante, ativo desconhecido,
empate real entre finalistas ou revisão humana anterior contrariada.

### Etapa 5 — experimento controlado

Comparar emails equivalentes por flow e nível de completude da loja. A promoção
para `on` exige melhora de qualidade sem estourar o orçamento de latência/custo.

## Critério de pronto

O mecanismo estará pronto quando, para uma geração escolhida ao acaso, for
possível responder sem ler raciocínio privado:

1. o que cada agente decidiu;
2. quais fatos e fontes sustentaram a decisão;
3. quais alternativas foram descartadas e por quê;
4. qual risco o próprio agente reconheceu;
5. quais checks objetivos passaram;
6. por que houve retry, crítico ou bloqueio;
7. em qual nó a intenção mudou até chegar ao HTML final.

Esse desenho faz os agentes “pensarem” no sentido operacional importante:
**considerar alternativas, respeitar precedência, expor incerteza e verificar
consequências**, sem transformar o pipeline em uma coleção cara de monólogos.
