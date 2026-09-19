# Por que as gerações ainda não estão excelentes

*19/09/2026 · diagnóstico medido em produção (`ppygkfeffknypfncsnlv`),
não estimado. Todas as contagens abaixo saíram de query, e as queries
estão reproduzidas no fim.*

## O retrato, em números

| o que | medido |
|---|---|
| Código do subsistema | 68.897 linhas (229 arquivos) + 43.374 de teste |
| Agentes ativos no pipeline de e-mail | 21 |
| Gastos em 21 dias | **US$ 158,69** |
| Batches em 21 dias | 75 |
| E-mails **distintos** nesses batches | **5** |
| Lojas exercitadas | 2 (Hero Boxers, Innova Bay) |
| Custo por batch | US$ 2,12 (pico de US$ 8,20) |
| Divisão do custo | 49% decisão · 51% execução |
| Peças que chegaram a `ready` | 3 — **todas com 7 a 8 issues de QA** |
| Peças que falharam | `hero_failed` ×2, `qa_failed` ×1, `execucao_manual_expirada` ×1 |

Três coisas saltam desse quadro antes de qualquer análise:

1. **Nenhuma peça saiu limpa.** As três que ficaram `ready` carregam 7, 8
   e 8 issues. Não existe, no banco, um e-mail gerado sem defeito
   registrado.
2. **O sistema nunca gerou um flow.** Todos os 75 batches são de UM
   e-mail. A promessa do produto é a sequência de boas-vindas inteira; o
   que foi exercitado é sempre o mesmo `welcome-1`.
3. **US$ 158 para cinco e-mails distintos** é o preço de regerar a mesma
   peça dezenas de vezes enquanto se ajusta o pipeline.

---

## Os cinco problemas, em ordem de impacto

### 1. O redator está fora do sistema — e ninguém mede o que ele deixa de fazer

O agente que escreve o texto que o cliente lê roda no **n8n**, fora deste
repositório. Consequências que a medição mostra:

- **custo zero e tokens zero** em toda run de `copy` — o gasto do redator
  não entra na telemetria nem no alerta de custo;
- o prompt dele **não está no controle de versão** (a linha `copy` em
  `email_agent_configs` tem 17.349 chars de system e não é o que roda);
- ele é o **único agente sem retry, sem guard de saída e sem contrato
  executável**;
- toda mudança nele é edição manual num flow de outra ferramenta.

E o efeito disso é medível. Nas duas gerações de 18/09:

```
batch d2bd526b  hero 7/9 · body 10/13 · body 6/10 · products 6/7 · offer 9/10
                → 38 de 49 campos = 78%   (11 campos não voltaram)

batch 27a236b4  hero 7/9 · body 10/13 · products 23/23 · offer 9/10 · footer 9/9
                → 58 de 64 campos = 91%   (6 campos não voltaram)
```

**As duas runs registraram `taxa_pct: 100`.**

Não é erro de arredondamento — a métrica mede outra coisa
(`email-copy/route.ts:586`):

```ts
const taxaContrato =
  keysRecebidas > 0
    ? Math.round((keysNoContrato / keysRecebidas) * 100)
    : null
```

O denominador é o **recebido**, não o **esperado**. A taxa responde "o
redator falou o vocabulário certo?", e é lida em tela como "o redator
preencheu o e-mail?". Se ele mandar 1 campo de 58 e esse 1 estiver no
schema, a taxa é 100%.

O guard que existe (`copy_fora_do_contrato` → `failed`) só dispara em
`taxaContrato === 0`, isto é, quando o flow ignora o schema **inteiro**.
O caso real medido — 78% — passa direto.

Os campos faltantes *são* detectados, viram desvio `missing` em
`findFieldDeviations` — e param num `log.warn`. Como nenhum campo da
biblioteca é `required: true`, nunca viram `required_empty`, que é o
único grau que alguém olharia.

**A cadeia causal fecha aqui**, e explica três das cinco issues `high`
que o QA reporta:

```
campo sem copy  →  o `example` da biblioteca fica no HTML
                →  "Link Here", "Lorem ipsum", "dolor sit amet", "[12]"
                   chegam ao cliente
                →  QA pega no FIM como texto_de_exemplo / label_generico
                   / links_quebrados (high) → reprova a peça inteira
```

Gasta-se a fase 1 completa, as imagens e a cadeia de formatação — US$ 3 a
US$ 8 — para reprovar no último passo por um buraco aberto no meio do
caminho, que uma conta de divisão detectaria de graça.

> **Este é o problema mais caro do sistema e o mais barato de corrigir.**

### 2. Investe-se em decidir onde não há escolha

A arquitetura tem **cinco camadas de decisão** antes de uma linha ser
escrita: Seletor → Estruturador → Curador → Montador → Blueprint.

A biblioteca sobre a qual elas decidem tem 64 variantes ativas. Cruzando
mecanismo × seção:

**18 das 35 combinações têm UMA variante só.**

Em mais da metade dos slots não existe escolha a fazer. O Curador é
chamado assim mesmo, e ele é:

- o **2º maior custo** do pipeline (US$ 45,35 em 21 dias);
- o agente com **maior taxa de erro — 27 de 86 runs, 31%**;
- o mais lento depois da imagem (154 s de média).

Os erros dele contam a história: `curador_shortlist_invalida` (5),
`shadow_json_ilegivel` (4), `watchdog: run órfão` (3), `escolha: timeout`
(3), `sem orçamento` (4). São falhas de **capacidade e relógio**, não de
julgamento — o sistema pede a ele um trabalho deliberativo caro num
espaço onde a resposta frequentemente já está determinada.

Existe `limiarSemChamada` para pular a shortlist com ≤5 elegíveis. Falta
o caso mais simples: **posição com uma variante elegível não precisa de
LLM nenhum.**

### 3. O dado que alimenta a decisão não existe

Toda a maquinaria de objeção macro/micro (Catalogador, Seletor, contrato
do toque, insumos permitidos, profundidade) roda sobre campos da loja.
Nas **65 lojas ativas**:

| campo | lojas |
|---|---|
| `tone_description` | 41 |
| `brand_thesis` | 41 |
| `icp_persona` | 38 |
| `icp_objections` | 36 |
| `objection_catalog` | **3** |
| `ficha_operacional` | **1** |
| `politicas` | **0** |

E na única loja com ficha operacional, **o campo `incentivo` está
vazio** — que é justamente o que decide se o e-mail pode prometer cupom.

O efeito é o documentado e agora medido: sem lastro verificado, o Seletor
proíbe quase tudo, `profundidade_minima` trava em `afirmacao`, e a copy
sai genérica **por construção**. Foi assim que nasceram as issues
`oferta_sem_incentivo` e `codigo_inventado` — o e-mail promete "10% OFF"
sobre um catálogo que diz `existe: null`.

Não é um problema de código. É um problema de operação que nenhum
prompt resolve.

### 4. Não existe definição operacional de "excelente"

Mede-se muito: custo, tokens, duração, status, proveniência do prompt,
violações de contrato, issues de QA. Tudo isso é **execução**.

Não existe, em lugar nenhum:

- uma **nota da peça** (nem humana nem automática);
- comparação **A/B** entre duas configurações;
- registro estruturado do julgamento humano por geração;
- **desempenho real** do e-mail enviado (abertura, clique, receita).

O `ai_eval_cases`/`ai_eval_runs` existe — para a ConvertIA, não para este
pipeline.

Sem isso, "excelente" não tem definição operacional, e **nenhuma mudança
no pipeline pode ser julgada**. Cada ajuste é avaliado por alguém abrindo
a peça e achando que melhorou ou piorou. É o motivo mais profundo pelo
qual o sistema não converge: não há como saber se convergiu.

### 5. Metade dos erros não é qualidade — é infraestrutura

Dos erros de 21 dias:

- **HTTP 402** (crédito/in-flight do OpenRouter): 11 ocorrências, em
  `hero_section`, `assembler_chooser`, `qa`, `copy_fit`;
- `watchdog: run órfão em 'running' há mais de 20min`: 6;
- `sem orçamento`/`timeout`: 7;
- `Reasoning is mandatory for this endpoint`: 4 (config de modelo);
- `n8n_sem_callback`: 2.

Dois batches levaram **726 e 850 minutos** (12 h e 14 h) — retomada por
watchdog atravessando a noite.

Isso contamina qualquer julgamento sobre os agentes: quando uma geração
sai ruim, não se sabe se foi decisão ruim ou se um pedaço do pipeline
morreu por falta de crédito.

---

## Achados menores, mas que vão ao cliente

- **`Robert, your questions answered directly`** — nome real hardcoded no
  assunto de uma peça `ready`.
- **`[FirstName], your cart still has it`** e
  **`Votre -10%, [Prénom]`** — merge tag em formato que o ESP não
  substitui. Chega assim na caixa de entrada.
- `contraste_baixo`: "texto #FFFFFF sobre #FFFFFF (1.00:1)".
- `compliance`: "LIFETIME WARRANTY. ZERO RISK." como manchete, sem lastro
  nos insumos permitidos.
- `copy_excede_max_len`: 13 ocorrências — a copy volta maior que o campo.

---

## O que falta, em ordem de efeito por esforço

### Primeiro — fechar o buraco do redator *(dias, não semanas)*

1. **Corrigir a taxa**: denominador = esperados. Uma linha.
2. **Piso de adesão que bloqueia**: abaixo de ~95%, a peça não segue para
   a fase 2. Hoje ela segue, gasta US$ 4 e reprova no QA pelo mesmo
   motivo, 15 minutos depois.
3. **Reenviar ao n8n os campos faltantes** em vez de aceitar o buraco —
   ou preencher por código quando houver regra (o `copy_fit` já faz isso
   para excesso; falta o simétrico para ausência).

Isso sozinho deve eliminar `texto_de_exemplo`, `label_generico` e boa
parte de `links_quebrados` — 3 das 5 issues `high`.

### Segundo — definir "excelente" antes de mexer em mais prompt

Uma rubrica curta (5 a 7 critérios), aplicada a toda peça gerada, com:
- nota automática pelos checks que já existem (é quase de graça: os dados
  estão em `qa_issues`);
- 👍/👎 humano **com motivo tipado**, gravado por geração;
- e, quando a peça for enviada de verdade, abertura/clique amarrados ao
  `generation_batch_id`.

Sem esta etapa, as outras não têm como ser avaliadas.

### Terceiro — preencher o dado de 3 lojas piloto

Ficha operacional completa (incentivo, troca, envio, garantia, prova,
pagamento, suporte) + catálogo de objeções, em três lojas reais. É
trabalho de operação, não de engenharia, e é o que destrava profundidade
da copy — hoje travada em `afirmacao` por falta de lastro.

### Quarto — encurtar a decisão onde ela é determinada

Pular o Curador quando a posição tem ≤1 variante elegível. Corta custo e
a maior fonte de erro do pipeline sem perder decisão nenhuma — porque
não há decisão a perder.

### Quinto — estabilizar a infraestrutura

Saldo do OpenRouter com folga e alerta (o painel de saúde da ConvertIA já
tem o mecanismo pronto — falta apontá-lo para este pipeline), e revisão
dos orçamentos de tempo da fase 1.

### Sexto — sair do n=1

Gerar o **flow inteiro** para 3 lojas diferentes antes de julgar qualquer
melhoria. Hoje todo ajuste é validado no mesmo `welcome-1` da mesma loja,
o que é o desenho perfeito para overfitting.

---

## A leitura arquitetural, em uma frase

O sistema investiu profundamente em **decidir o que dizer** — cinco
camadas de decisão, contratos tipados, telemetria de proveniência, vault,
réguas puras com 43 mil linhas de teste — e quase nada em **controlar
quem diz**. O redator é o único componente sem contrato executável, sem
retry, sem custo medido e sem versionamento; e é ele que escreve o e-mail.

O segundo desequilíbrio é medir execução com rigor e qualidade com
nenhum. Há proveniência de cada segmento de prompt e não há uma nota da
peça.

Nenhum dos dois se resolve com mais prompt, mais agente ou mais regra. O
pipeline não está com arquitetura errada — está com a **alavanca no lugar
errado**.

---

## Queries usadas

```sql
-- custo e erro por agente (21d)
select agent, count(*) runs, count(*) filter (where status='error') erro,
       round(sum(coalesce(cost_cents,0))/100.0,2) usd,
       round(avg(duration_ms)/1000.0) seg
from email_generation_runs where created_at > now() - interval '21 days'
group by agent order by 4 desc nulls last;

-- espaço de escolha real da biblioteca
select dispositivo, block_type, count(*) from email_component_variants
where is_active group by 1,2 order by 3;

-- lastro das lojas
select count(*) filter (where objection_catalog is not null) catalogo,
       count(*) filter (where ficha_operacional is not null) ficha,
       count(*) filter (where politicas is not null) politicas
from client_stores where is_active;

-- issues que chegam ao cliente
select i->>'type', i->>'severity', count(*)
from email_flow_emails e,
  lateral jsonb_array_elements(case when jsonb_typeof(e.qa_issues)='array'
    then e.qa_issues else '[]'::jsonb end) i
where e.updated_at > now() - interval '30 days' group by 1,2 order by 3 desc;
```
