# Execução passo a passo — evolução do pipeline de e-mail (set/2026)

Companheiro de `plano-evolucao-pipeline-set2026.md` (revisão 2) já com os
seis ajustes da revisão do agente absorvidos (Trilha B de volta com B2, B3 e
B6; `contrato_mode` em dois flags; fonte do QA corrigida; A9.6 como linha, não
issue; A4 na semana 1; divisão de trabalho). Este documento é o que se lê
ANTES de tocar em cada coisa e DEPOIS, para saber se ficou certo.

Revisão 3 (14/09): entra o **Passo 7, auditoria do output do Estruturador**,
porque é de lá que saem os parâmetros do filtro por contrato e hoje nada
confere isso; os passos seguintes foram renumerados (o antigo 7 é o 8, e
assim por diante, até o 23).

Base: código do repo em 13/09, banco de produção em 13/09 e 14/09.

---

## 0. Como usar este documento

Cada passo tem sempre as mesmas oito partes:

| Parte | O que responde |
|---|---|
| **O que muda** | A frase que descreve a mudança para quem não vai ler código. |
| **Onde** | Arquivo, função, tabela, coluna, tela ou prompt. Nada que não exista no repo em 13/09, salvo o que este passo cria. |
| **Como** | O que fazer, na ordem. |
| **Por quê** | O defeito medido que motiva. Sem defeito medido não há passo. |
| **Consequência** | O que muda no e-mail que o cliente recebe, ou no custo, ou no tempo, ou em nada (quando é só medição). |
| **Ficou correto se** | O que se olha, onde, e o valor esperado. |
| **NÃO ficou se** | O sintoma de erro mais provável e o que ele denuncia. |
| **Rollback** | Como desfazer sem deploy quando possível. |

Convenções de leitura:

- **Batch de referência**: 6249aef2 (Hero Boxers · Welcome 1, 11/09). Toda
  verificação "reproduzir o batch" é gerar Welcome 1 da Hero Boxers de novo
  com o MESMO catálogo de objeções e a MESMA biblioteca do momento.
- **Ler uma run**: `email_generation_runs` tem `agent`, `status`, `model`,
  `tokens_input`, `tokens_output`, `cost_cents`, `duration_ms`,
  `error_message`, `parsed_output`, `input_vars`, `batch_id`, `email_id`.
  O Estúdio (`/admin/agents/studio?tab=execs`) mostra o mesmo por nó.
- **Ler um e-mail**: `email_flow_emails` tem `status`, `failure_reason`,
  `qa_issues`, `html_pipeline_stage`, `generation_batch_id`.
- **Gate** = coluna de `email_generation_settings` lida em runtime. Trocar
  vale na próxima geração, sem deploy. Já existem `montador_mode`,
  `seletor_mode`, `blueprint_mode`, `merge_verifier_mode`,
  `color_plano_mode`, `qa_mode`. O padrão de leitura a copiar é
  `src/lib/agents/html/color-plano-mode.ts` (`normalizarModo` +
  `loadColorPlanoMode` com fallback em falha de leitura).
- **Degradação nomeada**: toda coluna nova é aplicada à mão e escorrega.
  Código que depende dela trata `42703`/`PGRST204`/`PGRST205` fazendo retry
  sem a coluna E gravando `log.warn` com nome próprio. Feature morta em
  silêncio é o pior modo de falha deste repo (a live view de agentes passou
  semanas assim).
- Antes de cada push: `npm run typecheck`, `npm run lint`, `npx vitest run
  <pasta tocada>`.

### 0.1 Consultas de medição (usar antes e depois de cada passo)

Custo, tempo e tokens por nó de um batch:

```sql
select agent, status, model, tokens_input, tokens_output,
       round(cost_cents / 100.0, 3) as usd, duration_ms,
       left(error_message, 80) as erro
from email_generation_runs
where batch_id = '<batch>'
order by created_at;
```

Total do batch (a linha "custo por e-mail" da tabela de metas):

```sql
select count(*) runs, sum(cost_cents) / 100.0 as usd,
       max(created_at) - min(created_at) as duracao
from email_generation_runs where batch_id = '<batch>';
```

Desfecho por e-mail:

```sql
select id, status, failure_reason, html_pipeline_stage,
       jsonb_array_length(coalesce(qa_issues, '[]')) as issues
from email_flow_emails where generation_batch_id = '<batch>';
```

Decisão × entregue (a inversão que o plano quer zerar), enquanto o painel B6
não existe:

```sql
-- o que o Estruturador decidiu por posição
select parsed_output -> 'estrutura' from email_generation_runs
where batch_id = '<batch>' and agent = 'estruturador';
-- o que o Curador escolheu / resgatou
select parsed_output -> 'escolhas', parsed_output -> 'resgates',
       parsed_output -> '_contrato'
from email_generation_runs
where batch_id = '<batch>' and agent = 'assembler_chooser';
```

Custódia do requisito (o que o Estruturador declarou chegou ao Curador e ao
Blueprint?), por e-mail:

```sql
select e.email_id,
  (select count(*) from jsonb_array_elements(e.parsed_output -> 'estrutura') p
     where p ? 'requisitos')                           as posicoes_com_requisito,
  jsonb_array_length(e.parsed_output -> 'estrutura')  as posicoes,
  e.parsed_output -> 'auditoria_requisitos' -> 'duras' as duras,
  c.parsed_output -> 'eliminadas_por_requisito'        as eliminadas_no_curador,
  b.parsed_output -> 'omitidos'                        as omitidos_no_blueprint
from email_generation_runs e
left join email_generation_runs c on c.email_id = e.email_id and c.agent = 'assembler_chooser' and c.batch_id = e.batch_id
left join email_generation_runs b on b.email_id = e.email_id and b.agent = 'blueprint' and b.batch_id = e.batch_id
where e.agent = 'estruturador' and e.batch_id = '<batch>';
```

Requisito declarado e `eliminadas_no_curador` vazio numa seção que tem
variante conflitante é perda na fronteira, não acerto.

Gates vigentes:

```sql
select montador_mode, seletor_mode, blueprint_mode, color_plano_mode,
       qa_mode, merge_verifier_mode
from email_generation_settings;
```

### 0.2 Régua de pronto

"Enviável sem toque humano" = `status = 'ready'` **e** zero issue `high` em
`qa_issues` **e** nenhuma violação em `_contrato` **e** o lint B2 sem
ocorrência. Os quatro juntos. `ready` sozinho não conta (o batch 57bf409d saiu
`ready` com 5 issues `high`).

### 0.3 Quem faz o quê

| Lado | Dono | Passos |
|---|---|---|
| Validadores, migrations, gates, lint, painel, tiering, captura de políticas | Matheus (+ Claude Code) | 1, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 21, 22, 23 |
| Prompts, vocabulário, campos do contrato, biblioteca, n8n | Bruno | 2, 7 (régua da auditoria), 10 (template), 18 (vocabulário), 20 (regras), A10, prompt do n8n |
| Interface entre os dois: `DecisaoDoEmail` (P6), a régua do Estruturador (P7) e `dispositivo` (P18) | Bruno define os campos e a régua; Matheus implementa e valida | — |

---

## SEMANA 1 — parar a sangria e ligar o contrato estrutural

### Passo 1 · A9 · O incentivo sai do outline, não do Catalogador

**O que muda.** Quem decide se o toque tem cupom é o catálogo de outlines
(`email_outline_templates.coupon_code`, 27 dos 34 toques com código, editado
em `/admin/outlines`). O Catalogador deixa de opinar. Até a coluna de
tradução existir (Passo 4), o código que sai é o do outline em pt-BR,
marcado como `traducao_faltante`.

**Onde.**

- `src/lib/agents/objecoes/incentivo.ts`: nova `incentivoDoOutline(outline,
  idioma, overrideDaLoja)`; `incentivoDoCatalogo` e
  `incentivoExisteDoCatalogo` removidas.
- Consumidores (os quatro): `src/lib/services/email-copy-webhook.service.ts`
  (linha ~991, `decisaoIncentivo`), `src/lib/agents/phase2-runner.service.ts`
  (linhas ~69, ~710, ~715, ~3808, ~4299),
  `src/lib/agents/objecoes/seletor-regras.ts`,
  `src/lib/email-workspace/outline-condicional.ts`
  (`condicionarOutline`, `couponCodeEfetivo`).
- Testes: `outline-condicional.test.ts`, `seletor-regras.test.ts`, os de
  `copy-merge`/`content-checks` que fixam `existe: null`.

**Como.**

1. Escrever `incentivoDoOutline`. Regra: `existe = !!(outline.coupon_codes ||
   outline.coupon_code)`; `codigo = overrideDaLoja ?? coupon_codes[idioma] ??
   coupon_code`; `origem = 'override_loja' | 'outline_traduzido' |
   'outline_pt'`; `traducao_faltante = existe && !coupon_codes?.[idioma] &&
   !overrideDaLoja && idioma !== 'pt-BR'`. Puro, com teste por ramo.
2. `outline-condicional.ts`: `condicionarOutline` e `couponCodeEfetivo`
   perdem o ramo `existe === null` (deixa de existir). O prefixo
   `PREFIXO_SEM_INCENTIVO` só entra quando `existe === false`, isto é, o
   outline do toque não tem código. `PREFIXO_INCENTIVO_NAO_CONFIRMADO` some.
3. Nos quatro consumidores, trocar a chamada. No webhook o override da loja
   é o `content.code` já preenchido no bloco `coupon` (a leitura que hoje
   está na linha ~1005, `existing`), e o idioma é `resolvedLang.code`, que
   já está resolvido na mesma função.
4. `seletor-regras.ts`: `trabalhos_fixos` recebe `entrega_de_incentivo`
   quando `existe`; a proibição "no incentive claim" sai de `proibido` quando
   `existe`.
5. `objection_catalog.incentivo` continua sendo gravado pelo Catalogador e
   exibido na aba Pesquisa como NOTA ("o anúncio da loja fala de oferta"),
   sem nenhum consumidor de agente. Grep final: zero ocorrências de
   `incentivoDoCatalogo` fora do arquivo da UI.
6. O `DecisaoDeIncentivo` ganha `valor: string | null` lido de uma coluna
   nova `coupon_value` do outline (Passo 4 cria). Sem ela, `valor` é `null`
   e o validador textual (Passo 9) não confere percentual, só presença.

**Por quê.** Em 09/09 o Catalogador passou a decidir e a Hero Boxers virou
"sem incentivo" com `null`; `couponCodeEfetivo` zerou o código,
`condicionarOutline` prefixou "não prometa", e o e-mail saiu com hero de
10% OFF (do example da variante) sobre uma estrutura montada sem cupom.
A decisão sempre foi do flow.

**Consequência.** Welcome 1 da Hero Boxers volta a ter cupom na estrutura,
no Seletor e na copy, coerentes entre si. Toque sem código no catálogo
(abandoned_cart 2 e 8, upsell 4, win_back 1 e 3, shipping_stages) sai sem
promessa. Nenhum LLM pode mais zerar o incentivo.

**Ficou correto se.** Reproduzindo o batch: na run `seletor`,
`parsed_output.alvo.trabalhos_fixos` contém `entrega_de_incentivo` e
`proibido_neste_toque` não contém "no incentive claim"; na run
`copy_dispatch`, `input_vars.payload.emails[0].decisao.incentivo` é
`{ existe: true, codigo: "BEMVINDO10", origem: "outline_pt",
traducao_faltante: true }` (até o Passo 4); em `email_blocks` o bloco
`coupon` do e-mail tem `content.code` preenchido; a `estrutura_geral` do
payload NÃO começa com "SEM INCENTIVO".

**NÃO ficou se.** (a) `existe: null` aparece em qualquer run: um consumidor
ainda lê o catálogo. (b) A `estrutura_geral` ainda tem o prefixo: o ramo
`null` do `condicionarOutline` sobreviveu. (c) QA reporta
`oferta_sem_incentivo` num toque que tem código: o `content-checks` ainda
recebe o `existe` do runner antigo (linha ~3808).

**Rollback.** Reverter o commit. Não há coluna nem gate envolvidos neste
passo.

**Esforço.** Meio dia. Dono: Matheus.

---

### Passo 2 · A3.1 · O prompt do Curador diz o que o código faz

**O que muda.** Três parágrafos do prompt in-code deixam de contradizer os
guards.

**Onde.** `src/lib/agents/architect/curador-shadow.ts`:
`DEFAULT_CURADOR_SHORTLIST_SYSTEM` e o prompt de escolha. Linhas de
referência em 13/09: 96 ("a seção DESAPARECE… não cai no template global"),
350 ("o sistema cai no template global"), 352 ("momento APOSENTADO"), 356
("REPETIR… É PERMITIDO"). Conferir que `email_agent_configs.assembler_chooser`
tem `system_prompt` vazio (o in-code é o vivo):

```sql
select agent_type, length(system_prompt) from email_agent_configs
where agent_type = 'assembler_chooser' and is_active;
```

**Como.**

1. Linha 356: apagar o parágrafo inteiro. Substituir por: "A MESMA variante
   não pode ocupar duas posições. Se a melhor candidata da posição B é a que
   você já escolheu em A, escolha a segunda melhor em B; se não houver
   segunda, declare `escolhas: []` com a lacuna nomeada."
2. Linha 350 (passo 4 do protocolo): trocar "o sistema cai no template
   global" por "a posição SOME da peça; se a seção for hero, ou se mais de
   uma posição sumir, o batch para. Declare a lacuna, candidata por
   candidata."
3. Linha 352: apagar. O catálogo não traz `momento`; a frase só ocupa
   contexto.
4. Linha 1180 e 1296 (comentários de código com as mesmas premissas):
   corrigir para não enganar o próximo leitor.
5. `curador-shadow.test.ts`: adicionar um teste que lê
   `DEFAULT_CURADOR_SHORTLIST_SYSTEM` e o prompt de escolha e reprova se
   contiverem "É PERMITIDO" ou "cai no template global". É o embrião do
   teste de coerência do Passo 20.

**Por quê.** O Curador decide sob premissa falsa. No batch de referência ele
escreveu "a posição fica na peça e cai no template global" e devolveu
`escolhas: []` em `products`; não cai (`assembleDocument` não tem fallback
por bloco), e a posição sumiu.

**Consequência.** Menos posição vazia por "vai cair no global". Zero efeito
em custo.

**Ficou correto se.** O teste novo passa; numa geração, nenhuma
`justificativa` em `parsed_output` da run `assembler_chooser` cita
"template global".

**NÃO ficou se.** O modelo continua citando "template global": o prompt
vivo é outro. Conferir a query acima; se `length(system_prompt) > 0`, o
banco venceu e a edição tem de ser lá.

**Rollback.** Reverter o commit.

**Esforço.** 2 horas. Dono: Bruno escreve o texto, Matheus commita com o
teste.

---

### Passo 3 · A3.2 · A shortlist não chama LLM quando não há o que rankear

**O que muda.** Quando a eliminação por código deixa 3 ou menos candidatas
numa seção, a primeira chamada do Curador (shortlist) é pulada para essa
seção e as candidatas vão direto à escolha.

**Onde.** `src/lib/agents/architect/component-assembler.service.ts`, entre
`eliminarPorRequisitos` (linha ~1070) e a primeira `runCuradorShadow`
(linha ~1396). `curador-shadow.ts`, `runCuradorShadow` (linha ~895): o
parâmetro que diz quais seções chegam pré-rankeadas.

**Como.**

1. **Antes de tudo, tornar a eliminação um filtro de verdade.** Hoje
   `eliminarPorRequisitos` NÃO tira ninguém do catálogo: a lista vai ao
   prompt como `<eliminadas_por_requisito>` ("NÃO as escolha") e à
   telemetria, e o catálogo servido continua inteiro (comentário no ponto
   de chamada: "zero código veta a escolha"). Calcular `elegiveis =
   catálogo da seção − eliminadas` e servir SÓ as elegíveis à chamada de
   escolha. Contar elegíveis por seção; seção com `≤ 3` entra numa lista
   `shortlistPulada`. Corrigir junto a inconsistência de `n_itens: null`:
   `conflitoDeContrato` pula o mínimo quando a variante não tem família
   numerada (foi assim que products-4, de 1 item, escapou do mínimo de 2),
   enquanto o resgate trata `null` como 1; adotar 1 nos dois.
2. `runCuradorShadow` recebe a lista e, na etapa de shortlist, só inclui no
   prompt as seções fora dela; as puladas vão à etapa de escolha como
   finalistas, na ordem em que sobraram. Se TODAS as seções foram puladas, a
   chamada de shortlist não acontece.
3. Telemetria na run `assembler_chooser`: `parsed_output.shortlist_pulada:
   ["hero","body",…]` e `consumo_por_chamada.shortlist = null` quando não
   houve chamada.
4. Teste em `curador-shadow.test.ts` com o cenário do batch (hero 3, body 2,
   reviews 3, products 1, footer 3 → zero chamadas de shortlist).

**Por quê.** No batch de referência TODAS as seções chegaram à shortlist com
≤ 3 candidatas fora da lista de eliminadas. A chamada custou tokens de entrada (101k chars) para
devolver o que já estava decidido por código.

**Consequência.** Custo do Curador cai pela metade nos batches com
biblioteca pequena (hoje, todos). Tempo cai ~150 s. Zero efeito no e-mail.

**Ficou correto se.** Reproduzindo o batch: run `assembler_chooser` com
`shortlist_pulada` de 5 seções, `tokens_input` ≤ 60k (era ~150k),
`duration_ms` ≤ 200.000 (era 376.000), e o rank-1 por posição igual ao do
batch anterior (com ≤ 3 candidatas o rankeamento é entre as mesmas).

**NÃO ficou se.** (a) `tokens_input` não caiu: a shortlist ainda é chamada
(conferir `consumo_por_chamada`). (b) A escolha mudou de variante numa
seção pulada: a ordem das finalistas passou diferente do que a shortlist
passava; comparar `finalistas` no `parsed_output` antes/depois.

**Rollback.** Env `CURADOR_SHORTLIST_SEMPRE=1` (criar junto, lida em
`runCuradorShadow`) força a chamada. Sem deploy? Não: env exige deploy.
Alternativa sem deploy não existe aqui; por isso o teste com o cenário real
antes do push.

**Esforço.** Meio dia. Dono: Matheus.

---

### Passo 4 · A9.1 · Tradução do cupom como dado, na tela de outlines

**O que muda.** O outline ganha um código por idioma e o valor do desconto.

**Onde.**

- Migration nova: `email_outline_templates.coupon_codes jsonb` (`{"en":
  "WELCOME10", "es": "BIENVENIDO10", …}`) e `coupon_value text` ("10%").
  `coupon_code` (texto) fica como fallback pt-BR.
- API: `src/app/api/admin/outlines/[id]/route.ts`, `patchSchema` (linha ~15,
  hoje só `coupon_code`).
- Tela: `src/components/email-outlines/outlines-workspace.tsx`, campo
  "Cupom" (linha ~483). Vira: código pt-BR + valor + uma linha por idioma
  da lista de `resolveStoreLanguage` (pt-BR, en, es, de, fr, it, nl, sv,
  da, pl).
- `incentivoDoOutline` (Passo 1) passa a ler `coupon_codes[idioma]`.

**Como.**

1. Migration com `add column if not exists` nas duas colunas. Comentário na
   coluna dizendo que a tradução é decisão humana, não derivada.
2. `patchSchema`: `coupon_codes: z.record(z.string(), z.string().trim())
   .optional()`, `coupon_value: z.string().trim().max(20).nullable()`.
   Chaves fora da lista de idiomas → 422.
3. Tela: grade compacta (idioma × código) só quando `coupon_code` está
   preenchido. Idioma sem tradução mostra o pt-BR em cinza com o selo
   "usa pt-BR".
4. Degradação: `incentivoDoOutline` recebe `coupon_codes` possivelmente
   `undefined` (select com retry sem a coluna) e cai em `coupon_code` com
   `traducao_faltante: true`. O select do outline no webhook (linha ~547)
   ganha o retry.
5. Bruno preenche: 27 toques × idiomas que a carteira tem hoje (en, pl,
   da, de pelo menos; medir em `client_stores.language`).

**Por quê.** A migration 20260922 diz que a variação por idioma "é feita
depois, por loja, no bloco coupon"; isto é edição manual que ninguém fez.
BEMVINDO10 saiu numa loja inglesa. A mesma migration removeu uma coluna
`coupon_codes` jsonb que tinha nascido antes. E sem `coupon_value` não há
como o validador textual dizer que "15% OFF" está errado num cupom de 10%.

**Consequência.** O código que chega ao n8n e ao HTML é o do idioma da loja.
`traducao_faltante` vira issue `medium` no QA enquanto a tabela não estiver
completa, e some quando estiver.

**Ficou correto se.**

```sql
select flow_type, email_number, coupon_code, coupon_value, coupon_codes
from email_outline_templates where coupon_code is not null
order by 1, 2;
```

devolve `coupon_codes` com ao menos `en` nos 27; reproduzindo o batch, o
payload traz `codigo: "WELCOME10", origem: "outline_traduzido",
traducao_faltante: false`; o HTML final contém WELCOME10 e não contém
BEMVINDO10.

**NÃO ficou se.** (a) `log.warn incentivo.sem_traducao` aparece: a migration
não foi aplicada (é aplicada à mão). (b) O HTML tem BEMVINDO10 numa loja
`en`: o idioma resolvido no webhook não é o esperado; conferir
`email_copy.webhook.language_synced` no log e `client_stores.language`.

**Rollback.** Apagar as traduções na tela (o fallback pt-BR volta).
Coluna fica; não atrapalha.

**Esforço.** 1 dia de código, 2 horas de preenchimento. Dono: Matheus /
Bruno.

---

### Passo 5 · A7.0 · O QA lê a fonte certa de produtos e briefing

**O que muda.** O QA passa a receber os top products da tabela viva e o
briefing do onboarding.

**Onde.** `src/lib/agents/chains/qa.chain.ts`, vars `brand_json` (linha
~781, hoje `JSON.stringify(brand)`, com `brand` vindo de
`store_brand_identity`) e `briefing_json` (linha ~780, de `store_briefings`);
linha ~1102, `brand?.top_products[0]?.name`. `phase2-runner.service.ts`,
carga do contexto (linhas ~587 e ~594) e `loadTopProducts` (linha ~666), que
JÁ lê `store_top_products` para o agente de imagem.

**Como.**

1. O QA recebe `ctx.topProducts` (já carregado no runner) e monta
   `top_products_json` a partir dele. `brand.top_products` deixa de ser lido
   no QA.
2. `briefing_json`: se `store_briefings` não tem linha, cair em
   `onboardings.briefing` (o objeto existe para a Hero Boxers). Registrar a
   origem em `input_vars.briefing_origem: 'store_briefings' |
   'onboardings' | 'nenhum'`.
3. Segmento de proveniência (`prompt_segments`) muda o rótulo de
   `brand_json` → `top_products_json` com `cls: "loja", rotulo:
   "store_top_products"`.

**Por quê.** Medido em 14/09: `store_top_products` tem 5 linhas para a Hero
Boxers e `store_brand_identity.top_products` está vazio; o prompt lia a
identidade. `store_briefings` tem 0 linhas e `onboardings.briefing` existe.
O QA marcou "claim não coberto" sobre coisas que a loja tem.

**Consequência.** O QA para de reprovar verdade. Não muda custo.

**Ficou correto se.** Reproduzindo o batch: `input_vars` da run `qa` traz
`top_products_json` com 5 itens e `briefing_origem: 'onboardings'`; zero
issues `claim_nao_coberto` sobre produto ou sobre item que o Seletor pôs em
`insumos_permitidos`.

**NÃO ficou se.** `top_products_json: []` ainda: o runner carregou de outro
lugar para este chain; conferir `loadTopProducts` no ponto em que o QA é
chamado (linha ~2510).

**Rollback.** Reverter o commit.

**Esforço.** Meio dia. Dono: Matheus.

---

### Passo 6 · A1 · O contrato de decisão: tipo, coluna e gate

**O que muda.** Nasce `DecisaoDoEmail`, montado uma vez depois do
Estruturador, gravado no blueprint e lido por todo nó a jusante. Ainda sem
validador (Passos 8 e 9).

**Onde.**

- Novo `src/lib/agents/shared/decisao-do-email.ts` (tipo + `montarDecisao`,
  puro).
- Migration: `store_email_blueprints.decisao jsonb`;
  `email_generation_settings.contrato_estrutural text default 'on'` e
  `contrato_textual text default 'shadow'` (valores `off|shadow|on`).
- Novo `src/lib/agents/shared/contrato-mode.ts` copiando
  `color-plano-mode.ts`.
- Ponto de montagem: `component-assembler.service.ts` logo após a saída do
  Estruturador ser normalizada (antes de `eliminarPorRequisitos`, linha
  ~1070), porque o Curador já consome parte disso.
- Ponto de persistência: `blueprint-generator.service.ts`, no upsert do
  blueprint (perto de `fio_narrativo`, linha ~809), com o mesmo retry sem a
  coluna que `fio_narrativo` tem (linha ~1122).

**Como.**

1. Tipo (Bruno define os campos, Matheus tipa):

   ```ts
   interface DecisaoDoEmail {
     versao: 1
     alvo: { objecao_id; tipo_de_risco; aliviador; profundidade; dimensao }
     incentivo: { existe: boolean; codigo; valor; origem; traducao_faltante }
     insumos_permitidos: string[]
     proibido: string[]                 // deduplicado entre PT/EN
     posicoes: Array<{ block_index; section; dispositivo: string | null;
                       papel; requisitos: RequisitosDuros; exige: string[];
                       imagem: string | null }>
     descartes: Array<{ section; dispositivo: string | null; motivo }>
     fio_narrativo: string
   }
   ```

   `dispositivo` nasce `null` e é preenchido no Passo 18.

2. `montarDecisao(alvo, estruturador, incentivo)`: puro. Dedupe de
   `proibido` por chave normalizada (sem acento, minúsculas) E por
   tradução literal PT↔EN das seis famílias que o Seletor usa (o dedupe por
   chave de `texto.ts` não pega "não prometa nota média" × "no average
   rating claim").
3. Gravar no blueprint. Lê-se de lá em: Curador (Passo 8), resgate (Passo
   10), `packageBlueprint`/`arbitrarCampos` (Passo 8), webhook do n8n e
   callback (Passo 13), `color_format` (Passo 14), QA (Passo 15).
4. Telemetria: toda run que valida grava `parsed_output._contrato =
   { modo_estrutural, modo_textual, violacoes: [], retry: 0 }`, mesmo
   vazio. É o que o painel B6 lê.
5. Testes: `montarDecisao` com a saída real do Seletor e do Estruturador do
   batch de referência (colar os `parsed_output` como fixture). Snapshot
   do objeto.

**Por quê.** As decisões existem hoje em quatro lugares (alvo do Seletor,
saída do Estruturador, catálogo, outline) e cada nó lê um subconjunto
diferente. A inversão acontece na fronteira, não dentro do agente.

**Consequência.** Nenhuma ainda no e-mail. É a fundação dos Passos 8 e 9.

**Ficou correto se.** Reproduzindo o batch: `store_email_blueprints.decisao`
preenchido para o e-mail, com 6 posições, `incentivo.existe: true` e
`proibido` sem pares PT/EN.

**NÃO ficou se.** `decisao` nulo e `log.warn decisao.coluna_ausente`: a
migration não rodou. `proibido` com 28 itens: o dedupe entre idiomas não
está casando.

**Rollback.** `update email_generation_settings set contrato_estrutural =
'off', contrato_textual = 'off'` desliga a leitura sem deploy.

**Esforço.** 1 dia. Dono: Bruno (campos), Matheus (código).

---

### Passo 7 · Auditoria do output do Estruturador (o filtro só vale se o requisito sair certo)

**O que muda.** Toda run do Estruturador passa por uma auditoria de código
ANTES de a decisão seguir para o Curador: forma dos `requisitos`, coerência
com o alvo do Seletor, coerência com a capacidade da biblioteca, custódia
até o Curador e o Blueprint. Incoerência DURA volta ao modelo uma vez com o
motivo; na segunda, o e-mail falha nomeado. O resto vira aviso na run e no
Estúdio.

**Por que este passo existe.** A eliminação por contrato (Passo 3) e os
validadores (Passos 8 e 9) comparam a variante com `requisitos`. Se o
Estruturador não declarar o requisito, ou declarar errado, tudo a jusante
filtra em cima de nada e parece funcionar: `null` é "indiferente", a
normalização é fail-open e descarta valor inválido em SILÊNCIO (um `cupom:
"não"` vira `null`, sem log), e o serviço só faz retry quando o JSON é
ilegível. Hoje não existe nenhum lugar que diga "este e-mail saiu com 6
posições e 2 requisitos".

**Onde.**

- Novo `src/lib/agents/estruturador/auditoria-requisitos.ts` (puro).
- `normalizarRequisitos` (`estruturador-prompt.ts`, linha ~101): passa a
  devolver também `descartados: Array<{campo, valor_cru}>`.
- `estruturador.service.ts`: após `normalizarOutput` (linha ~695) e antes
  de `finishGenerationRun`; o retry reusa `planejarRetentativa` (linha
  ~653, hoje só para JSON ilegível ou truncado).
- Gate: `email_generation_settings.auditoria_estruturador text default
  'on'` (`off|shadow|on`).
- Estúdio: a Saída da run `estruturador` mostra a tabela posição × requisito
  × veredito da auditoria.

**Como.** A régua (Bruno fecha a lista; Matheus implementa), cada item com
severidade:

| Regra | Detecta | Severidade |
|---|---|---|
| `sem_requisitos` | posição sem objeto `requisitos` | aviso; **dura** se TODAS as posições estão sem |
| `valor_descartado` | campo fora do domínio (`cupom: "sim"`, `n_itens: "2-3"`) | aviso, com o valor cru; **dura** se 3+ campos num e-mail |
| `cupom_contradiz_incentivo` | `incentivo.existe === false` e alguma posição com `cupom: true` | **dura** |
| `incentivo_sem_lugar` | `incentivo.existe === true`, `trabalhos_fixos` contém `entrega_de_incentivo`, e NENHUMA posição com `cupom: true` | **dura** (a peça promete cupom e não tem onde entregá-lo) |
| `exige_fora_da_capacidade` | `preco: true` numa seção com `com_preco = 0`; `n_itens.min` acima do maior grade da seção; `avaliacao: true` sem variante com avaliação | aviso + registra em `exige` como lacuna; vai a `vault_propostas` |
| `secao_fora_da_lista` | `section` fora de `<secoes_disponiveis>` | **dura** |
| `papel_diz_requisito_nao` | o texto de `papel` fala em preço, cupom, "N produtos", avaliação e o campo tipado correspondente é `null` | aviso (é exatamente a prosa-sem-tipo que motivou 09/09) |
| `descarte_sem_dispositivo` | item de `descartes` sem `section` nem `papel_na_referencia` | aviso |

1. `auditarRequisitos(saida, alvo, capacidade)` → `{ duras: [], avisos:
   [], descartados: [], posicoes, com_requisito }`. Puro, com fixture da
   saída real do batch de referência.
2. No serviço: `on` + `duras.length > 0` → retry 1× com o bloco
   `<auditoria>` no prompt ("sua decisão anterior violou: …; corrija
   SOMENTE os requisitos apontados, mantendo a sequência"); segunda vez →
   e-mail `failed`, `failure_reason: 'estruturador_incoerente'`. `shadow`
   → só grava. Avisos nunca param.
3. Telemetria: `parsed_output.auditoria_requisitos` na run, sempre, mesmo
   vazio. É a fonte da query de custódia da seção 0.1 e do painel (Passo
   23).
4. Custódia: teste de integração que pega o `parsed_output` do
   Estruturador, passa por `requisitosDaDecisao` e confere que
   `eliminarPorRequisitos` recebe o MESMO número de posições com
   requisito. É a fronteira onde "a string `estruturadorDecisao` não é o
   `parsed_output`" faria tudo sumir sem erro.
5. Prompt do Estruturador (Bruno): acrescentar um exemplo COMPLETO de
   `requisitos` preenchido (hoje o formato só mostra tudo `null`), porque
   o modelo copia o exemplo.

**Por quê.** É o ponto único de onde saem os parâmetros do filtro mais
importante do pipeline, e hoje ele não tem nenhuma verificação além de
"o JSON abriu".

**Consequência.** Requisito errado deixa de atravessar em silêncio.
Batches com Estruturador incoerente falham no PRIMEIRO nó, antes do
Curador, custando uma chamada.

**Ficou correto se.** Reproduzindo o batch: run `estruturador` com
`auditoria_requisitos.duras = []`, `com_requisito = posicoes`, e (com o
Passo 1 aplicado) ao menos uma posição com `cupom: true`; a query de
custódia mostra `eliminadas_no_curador` não vazio em `products` (8 de 9
sem preço). Monitoramento contínuo, semanal:

```sql
select date_trunc('day', created_at) as dia,
  count(*) as runs,
  avg((parsed_output -> 'auditoria_requisitos' ->> 'com_requisito')::int
      / nullif((parsed_output -> 'auditoria_requisitos' ->> 'posicoes')::int, 0)) as cobertura,
  sum(jsonb_array_length(parsed_output -> 'auditoria_requisitos' -> 'duras')) as duras
from email_generation_runs
where agent = 'estruturador' and created_at > now() - interval '7 days'
group by 1 order by 1;
```

Meta: cobertura ≥ 0,9 e `duras = 0` em regime.

**NÃO ficou se.** (a) `descartados` cheio em toda run: o modelo devolve
texto onde se espera booleano; é o exemplo do prompt (item 5), não o
código. (b) `duras` em toda run com `cupom_contradiz_incentivo`: o alvo
chegou vazio (Seletor `skipped`); conferir a run `seletor` antes de mexer
no Estruturador. (c) Requisito declarado e `eliminadas_no_curador` vazio
numa seção com variante conflitante: a custódia quebrou entre a run e o
Curador; o teste do item 4 aponta onde.

**Rollback.** `auditoria_estruturador = 'shadow'`. Sem deploy.

**Esforço.** 1 dia. Dono: Matheus (código), Bruno (régua e exemplo do
prompt). Entra no dia 3 da semana 1, antes do contrato; A1 desliza para os
dias 4 e 5 e o textual em shadow fecha no dia 1 da semana 2.

---

### Passo 8 · A1 · Validadores estruturais, ligados desde o dia 1

**O que muda.** Três validadores puros reprovam escolha, resgate e blueprint
que contradizem a decisão. Em `on`, a violação para o batch ANTES da imagem.

**Onde.** Novos `src/lib/agents/shared/validadores/{escolhas,resgate,
blueprint}.ts`. Chamadas em: `component-assembler.service.ts` após
`runCuradorShadow` (linha ~1396 e ~1679) e após `menosIncompativel` (linha
~1968); `blueprint-generator.service.ts` após `packageBlueprint`.

**Como.**

1. `validarEscolhas(decisao, escolhas, contratos)`: viola se (a) a variante
   tem `tem_cupom` e `incentivo.existe === false`; (b) `n_itens` da variante
   fora de `requisitos.n_itens`; (c) a mesma variante em duas posições; (d)
   `preco: true` e `!tem_preco`. A regra "dispositivo em descartes" fica
   como `severidade: shadow` até o Passo 18 (casa por nome).
2. `validarResgate(decisao, resgate)`: mesma régua, e `descartes` é veto
   absoluto quando `dispositivo` existir.
3. `validarBlueprint(decisao, blueprint)`: campo de cupom/percentual/prazo
   em bloco cujo requisito nega → `omitir` (reusa `arbitrarCampos`);
   `purpose` com instrução de oferta quando `existe === false` → viola.
4. Ação em `on`: run com `status: 'error'`, `error_message: 'contrato:
   <tipo>'`, retry 1× do MESMO nó com as violações no prompt (texto: "sua
   escolha anterior violou: …; escolha outra"), 2ª falha → e-mail
   `failed`, `failure_reason: 'contrato_<no>'`, batch para. Em `shadow`: só
   grava `_contrato.violacoes`.
5. Fixtures: as três inversões do batch de referência, REFEITAS para o
   cenário com cupom (Passo 1 mudou a primeira): (i) hero com slot de cupom
   é VÁLIDA agora; o que viola é hero com cupom quando `existe: false`
   (usar abandoned_cart 2 como fixture); (ii) body-4 comparativo na posição
   3 com `descartes` contendo comparação; (iii) products-7 sem preço com
   `preco: true`. Cada validador reprova a sua.

**Por quê.** Nenhuma das três inversões passa por regex nem tem falso
positivo; são comparações de campo. E hoje a eliminação por contrato é só
uma recomendação no prompt: o catálogo chega inteiro e o modelo pode
escolher uma eliminada (o medidor registra `requisito_violado` depois, sem
impedir). Este passo é o que fecha a porta. Deixá-las em shadow é pagar US$ 8 por
batch para confirmar o que já foi medido.

**Consequência.** Batch com estratégia violada morre no Curador, antes de
gerar imagem (US$ 0,60 gastos, não 8,20), com o tipo da violação no
`failure_reason`. Enquanto a biblioteca não tiver a anatomia certa, isto
vai fazer batches FALHAREM que hoje "passam". É o desejado: e-mail errado
não é sucesso.

**Ficou correto se.** As três fixtures reprovam nos testes; reproduzindo o
batch, o e-mail termina `failed: contrato_curador` (ou
`contrato_resgate`) com `_contrato.violacoes` nomeando body-4 e products-7,
e NENHUMA run de `image` existe no batch.

**NÃO ficou se.** (a) O batch chega ao QA com as mesmas inversões:
`contrato_estrutural` não está `on` ou o validador não é chamado no ponto
certo (conferir `_contrato` na run `assembler_chooser`). (b) Batch morre
com violação que não é violação: ler `evidencia` e `esperado`; se for
regra de dispositivo, ela deveria estar em `shadow` até o Passo 18.

**Rollback.** `contrato_estrutural = 'shadow'`. Sem deploy.

**Esforço.** 1,5 dia. Dono: Matheus.

---

### Passo 9 · A1 · Validadores textuais, em shadow por uma semana

**O que muda.** `validarCopy` (no callback do n8n) e `validarHtmlFinal` (antes
do QA) comparam o texto com a decisão. Só gravam, por uma semana.

**Onde.** Novos `validadores/{copy,html-final}.ts` e a régua compartilhada
`validadores/claims.ts`. Chamadas: `src/app/api/webhooks/n8n/email-copy/
route.ts` antes de gravar `copy_ready`; `phase2-runner.service.ts` antes do
QA (linha ~2510).

**Como.**

1. `claims.ts`: bloqueia SÓ oferta.
   - percentual adjacente a oferta: `\d+\s?%` a até 3 palavras de
     `off|desconto|discount|de desconto|rabatt|dto|korting|zniżki`;
   - código: `code|cupom|coupon|use o código|use code|kod` + token em
     maiúsculas;
   - frete como oferta: `free shipping|frete grátis|frete gratis|envío
     gratis|gratis verzending|darmowa dostawa` quando `insumos_permitidos`
     não traz frete;
   - prazo de oferta: `\d+\s?(days|dias|horas|hours|dni|godzin)` a até 3
     palavras de `ends|termina|expira|only|só até|tylko`;
   - preço quando `preco: false`: símbolo de moeda + número.
   - **Lista de nunca**: `100% cotton`, `100% algodão`, `30 dias para
     trocar` com troca em insumos, número de reviews, tamanho, peso. Cada
     regex tem teste em par (oferta reprova / atributo passa) nos 4 idiomas
     da carteira.
2. `validarCopy`: por campo devolvido; também viola campo omitido
   preenchido e `max_len` estourado. Com `incentivo.valor` conhecido,
   percentual diferente do valor → viola.
3. `validarHtmlFinal`: texto visível por bloco (reusa `qa-views.ts`) contra
   a mesma régua.
4. Telemetria: `_contrato.violacoes` nas runs `copy` e `qa`. Em shadow,
   nada muda de status.
5. Fim da semana: query de falsos positivos:

   ```sql
   select r.email_id, v ->> 'tipo', v ->> 'evidencia'
   from email_generation_runs r,
        jsonb_array_elements(r.parsed_output -> '_contrato' -> 'violacoes') v
   where r.agent in ('copy', 'qa') and r.created_at > now() - interval '7 days';
   ```

   Ler cada linha. Evidência que é atributo → ajustar a regex antes de
   ligar (Passo 17).

**Por quê.** Uma regex ingênua reprova "100% cotton" e "30 dias para
trocar"; em `on` isso mata batches inteiros. O padrão da casa é ler uma
semana de shadow.

**Consequência.** Nenhuma no e-mail durante a semana. Depois do Passo 17:
copy com oferta indevida volta ao n8n uma vez com o motivo, e HTML final
com claim proibido reprova.

**Ficou correto se.** A query acima devolve linhas nos batches da semana
com `tipo` coerente com a decisão (oferta em toque sem cupom, percentual
divergente) e ZERO linhas de atributo de produto.

**NÃO ficou se.** Linhas com "100% cotton", "30 days" de política, contagem
de reviews: a janela de adjacência está larga; apertar antes do Passo 17.

**Rollback.** `contrato_textual = 'off'`.

**Esforço.** 1 dia. Dono: Matheus.

---

### Passo 10 · A4 · Subject e messaging lidos da decisão

**O que muda.** O subject deixa de ler o outline e passa a ler fio, alvo e
incentivo resolvido; sai validado.

**Onde.** `blueprint-generator.service.ts`, `generateSubjectHint` (linha
~394, chamada em ~755): vars `outline_objective`, `outline_guidance`,
`copy_guidance_resumo` (linhas ~439–442) e templates (linhas ~343–346).
`email_agent_configs` linha `subject`.

**Como.**

1. A chamada move para DEPOIS de `montarDecisao` (Passo 6) e recebe a
   decisão.
2. Vars novas: `fio_narrativo`, `alvo_uma_linha` (objeção + aliviador),
   `insumos_permitidos`, `proibido`, `incentivo` (`existe`, `codigo`,
   `valor` ou "sem incentivo neste toque"), tom/vocabulário, produto herói.
   As três vars antigas saem do template e da origem
   (`SUBJECT_VAR_ORIGINS` → `upstream`).
3. Saída passa por `validarCopy` (Passo 9) mesmo em shadow do textual:
   aqui é `on` desde já, porque subject sem oferta indevida é barato de
   garantir e o fallback é determinístico (subject = headline da hero do
   Estruturador cortada em 55; messaging = fio).
4. Config no banco: modelo Sonnet 4.6 via OpenRouter
   (`anthropic/claude-sonnet-4.6`), `max_tokens` 600, `temperature` 0,5,
   na MESMA statement, com `is_active = true` no WHERE
   (`TROCAR_modelo_agentes.sql`).

**Por quê.** O subject escreveu "abra entregando o código de boas-vindas"
lendo o outline cru. O messaging é o tom que o n8n lê para a peça inteira.

**Consequência.** Subject e messaging coerentes com o toque: com cupom
citam o código certo; sem cupom não prometem. Custo do nó ≤ US$ 0,01.

**Ficou correto se.** Reproduzindo o batch: run `subject` com `model =
'anthropic/claude-sonnet-4.6'`, `cost_cents ≤ 1`, `_contrato.violacoes`
vazio; `store_email_blueprints.subject_hint` e `messaging` sem "código"
quando o toque não tem cupom (testar com abandoned_cart 2) e com o código
traduzido quando tem.

**NÃO ficou se.** `finish_reason = length` com resposta vazia: o modelo está
gastando o teto em raciocínio; subir `max_tokens` para 2000 antes de
concluir que o prompt está errado (foi assim que o Fable com 400 morreu em
08/09).

**Rollback.** Reverter o commit; SQL da config de volta ao anterior.

**Esforço.** Meio dia. Dono: Bruno (template), Matheus (código + SQL).

---

### Biblioteca na semana 1 (Bruno, em paralelo)

| Item | Onde | Ficou correto se |
|---|---|---|
| A10.7 hero com hrefs de exemplo (`URL_CTA_PRIMARIO`, `URL_DO_SITE_AQUI`, `URL_FACEBOOK`) e copy de página de suporte | tela "Editar variante" da hero usada no welcome 1 | `content-checks` não reporta `link_sem_endereco` numa geração nova; a copy da variante não contém "help center" |
| A10.1 schema em body-6, 7, 8, 9 | mesma tela | `select count(*) from email_component_variants where is_active and output_schema is null` = 0 |
| Traduções dos cupons (Passo 4) | `/admin/outlines` | query do Passo 4 |

---

## Executado — Semana 1 (14/09, branch `claude/resume-previous-session-UvATK`)

Os dez passos da semana 1 estão em código, testados (6.534 testes, 443
arquivos) e as migrations aplicadas em produção (`20261144`, `20261145`,
`20261146`). O que DIVERGIU do desenho, e por quê:

| Passo | Desenho | Executado | Motivo |
|---|---|---|---|
| 8 | violação `high` → 1 retentativa do Curador; 2ª → `contrato_curador` | violação `high` → a escolha é TROCADA por código pela próxima finalista limpa do ranking; sem finalista limpa a posição cai para o resgate (pool = elegíveis); resgate anatomicamente contrário à decisão é recusado | desde o Passo 3 a shortlist já é a interseção com as elegíveis — repetir o Curador com a mesma lista devolveria a mesma escolha, a US$ 2 e 400 s. A substituição é determinística e fica em `_contrato.substituicoes` |
| 9 (`on`) | não grava `copy_ready`, reenvio único ao n8n com as violações, 2ª → `failed` | `on` + `high` → e-mail `failed: copy_contrato`, run `copy` `error`, fase 2 não dispara | o reenvio precisa de contagem de tentativas e de `dispatchEmailCopyWebhook` para UM e-mail; fica para depois da leitura em `shadow` (`DIAGNOSTICO_contrato_textual.sql`) |
| 11 | 15 agentes Fable → Sonnet 4.6 | **13** agentes (o banco tinha 16 em Fable, 3 ficam) | contagem medida na hora: `assembler, blueprint, catalogador, color_format, copy, copy_fit, hero_section, image_format, merge_verifier, qa, subject, text_format, typography` |
| 7 | — | `cupom: "false"` (string) passou a ser DESCARTE REGISTRADO e dura; a fixture real revelou que `products` diz "sem avaliação" em prosa e deixou `avaliacao: null` (aviso `papel_diz_requisito_nao`) | a auditoria pegou na fixture o que o plano previa em abstrato |

Gates no banco em 14/09: `contrato_estrutural = on`, `contrato_textual =
shadow`, `auditoria_estruturador = on` (`estruturador_mode`, `seletor_mode`
e `color_plano_mode` já estavam `on`; `qa_mode = enforce`).

**Cupons traduzidos (14/09, depois da execução)**: os 24 outlines ativos com
cupom receberam `coupon_codes` nos 14 idiomas (tradução literal, ASCII;
ja/zh/ko = inglês) e `coupon_value` pelo sufixo (ESPECIAL sem valor). Tabela e
SQL em `supabase/migrations/DADOS_20260914_coupon_codes_traducao.sql`. A Hero
Boxers (inglês) passa a sair com `WELCOME10` · `10%` · `outline_traduzido`.

## Executado — Trilha B (14/09, mesma branch; commits 494eabc → 17a0adf)

Os seis itens da Trilha B (B1 gate · B2 lint/pós-processador/prints · B6
painel · B3 dispositivo · B5 tokens · B4 gerador) estão em código, testados
e com as migrations aplicadas em produção (`20261147` gate/lint/runs,
`20261148` + `20261148b` RPC `email_decisao_vs_entrega`, `20261149`
colunas de dispositivo/tokens/source, `20261151` config do gerador). Ordem
executada: B1 → B2 → B6 → B3 → B5 → B4 — B6 antes de B3/B5 porque é ele que
mede se os dois funcionaram; B4 por último porque consome B2, B3 e B5.

| Item | O que entrou | Onde se lê |
|---|---|---|
| B1 | `avaliarProntidao` (5 bloqueios, 5 avisos) + `aplicarGate` no topo do `enqueueDispatchJob` e nas 3 rotas manuais (422 `store_not_ready`; `override_motivo` ≥ 10 chars grava run `gate_override`); card "Prontidão para geração" na aba Produção; gate `gate_mode` (on) no banco | runs `gate`/`gate_override`; `GET /api/admin/stores/[id]/prontidao` |
| B2 | `lintEnvio` (15 regras, 7 bloqueantes) + `posProcessar` (8 fixes idempotentes) rodando DEPOIS do strip de marcadores e ANTES do QA; prints 600/375 no Storage (`render_previews`); `lint_mode` (enforce) no banco; `failure_reason` `lint_<id>` | run `lint_envio`; miniaturas no cabeçalho da execução |
| B6 | RPC `email_decisao_vs_entrega(uuid[])` (por posição: pedido · curador · blueprint · montado · entregue · violações com origem) + `montarConformidade` puro (nó responsável na primeira fronteira; validação RETROATIVA quando a run não tem `_contrato`); painel "Conformidade" na execução e KPI agregado nos logs | `GET /api/admin/emails/[emailId]/conformidade` |
| B3 | vocabulário fechado de 22 (`shared/dispositivos.ts`; teste compara com o CHECK); `requisitos.dispositivo` no Estruturador (fora da seção = descarte), `dispositivo_ausente`/`dispositivo_sem_variante` na auditoria; `conflitoDeContrato` elimina por dispositivo ANTES de tudo; +150 no custo do resgate; `<secoes_disponiveis>` com contagem por dispositivo; select na aba Componentes; memória de uso por LOJA | `assembler_chooser.eliminadas_por_requisito`; coluna Dispositivo na Conformidade |
| B5 | 11 tokens resolvidos no `fitFragment` (montagem e enxerto veem o MESMO fragmento); `color_format` pulado (`skipped: tokens_de_identidade`) com todos os blocos tokenizados, misto → agente vê só os legados e `preservarBlocos` desfaz o recolor global; papéis de cor fechados (`principal|fundo|texto|destaque|superficie`, 422 com duas principais); tokenização de variantes existentes com prévia nas paletas Luxe Lift/Innova Bay | `assembler.blocos_tokenizados`; `color_format.blocos_preservados` |
| B4 | agente `gerador_anatomia` (Sonnet 4.6; 3ª tentativa em `GERADOR_ANATOMIA_MODELO_FINAL`), saída em dois blocos cercados, validador puro (lint + largura + tokens + cobertura example↔HTML pelo casador da produção + contrato do dispositivo), grava `is_active=false, source='gerada'` com prévias | run `gerador_anatomia`; selo roxo na aba Componentes |

**O que DIVERGIU do desenho, e por quê:**

| Item | Desenho | Executado | Motivo |
|---|---|---|---|
| B3 backfill | tabela dos 44 entregue para revisão ANTES de aplicar; depois `20261150` NOT NULL | **aplicado** como proposta REVERSÍVEL (`DADOS_20260914_backfill_dispositivo.sql`, confiança por linha; rollback no fim); NOT NULL **não** criado | sem o backfill o filtro por dispositivo é fail-open em 100% da biblioteca e nada do B3 seria medível; a coluna segue nullable e editável na tela — reclassificar é um select |
| B5 migração das 41 | POST por `ids` após revisão | rota + dialog prontos, **nenhuma variante tokenizada** em produção | inferência errada sai em toda peça que usar a variante; a prévia nas duas paletas existe para a revisão humana, e ela não aconteceu nesta sessão |
| B4 rodada de 12 | disparada pelo executor, custo somado no commit | **não executada** | exige sessão autenticada na rota e as chaves do ambiente (ausentes no container); o botão "Gerar anatomia" e a rota estão prontos; custo esperado ≤ US$ 0,15 por tentativa |
| B2 largura | `auditEmailWidth` do documento | régua reescrita para DOCUMENTO (o container, não a calha 100%) | o auditor da biblioteca julga blocos; no e-mail montado a calha 100% é a raiz legítima |
| B6 | view SQL | RPC (`SECURITY DEFINER`, `service_role`) + módulo puro | o índice `escolhas[].block_index` do Curador é da ESTRUTURA e colapsa sobre `blocks_skipped` — a regra mora numa função, não numa view |
| Gate B1 | `gate_mode` só no B1 | avisos do batch entram no in-app do `notifyBatchComplete` (template de e-mail tem assinatura fixa) | declarado |

**Medido nesta sessão (sem geração real — a rodada de verificação depende
do deploy):** fixture do lint = o HTML real do e-mail `bb2ef22d` do batch
6249aef2 → 11 achados (css_var 3, style 6, comentário 85, mso 1 "DIGITAL
GIFT CARD" ≠ "BAMBOO BOXERS", img_sem_src 6, anchor_sem_href 4,
texto_de_example 12, line_height 3, alt 9, ano 2025, container 598px); o
pós-processador zera 8 e sobram `anchor_sem_href`, `texto_de_example` e
`largura` — que são de BIBLIOTECA. Conformidade retroativa do mesmo batch:
com o dispositivo no contrato, 4 posições divergentes (hero_pergunta ×
hero_apresentacao; body_garantias × body_tese; body_comparacao ×
body_garantias; products_galeria × products_grade_preco) e 2 conformes.
Backfill: 44 variantes classificadas, 0 sem `anatomia_slug`; lacunas que
o backfill REVELA (nenhuma ativa): `products_grade_preco`, `reviews_2`,
`body_faq`, `body_passos`, `hero_apresentacao` — exatamente as famílias da
rodada inicial do gerador. Tokenização sobre duas variantes reais (body 3,
hero 3): 5 tokens inferidos cada, zero conflito, VML e raio acompanham.

**Perguntas para o Bruno (Raia 1), não bloqueiam:** (1) "varredura numerada
de 3–4 razões" não tem dispositivo entre os 22 — o mais próximo é
`body_passos`; criar um 23º ou o Estruturador passa a pedir `body_passos`?
(2) autoria no vault das 22 notas `componentes/eixos/dispositivo/<slug>.md`
e do campo `dispositivo:` nas 44 notas de variante; (3) revisão da tabela
de backfill (confiança `baixa` em body 6/8, produtos 2).

## Executado — Semana 2 (14/09, mesma branch; commits 0ce622b → f7a57de)

Passos 11 → 15 → 14 → 13 → 16, nessa ordem (o 15 logo depois do 11 porque é
ele que dá dono ao que o 11 produz; o 16 por último porque nasce inerte).
Migration 20261153 aplicada. Suíte completa, typecheck e lint no fecho.
Leitura pós-deploy em `supabase/migrations/DIAGNOSTICO_semana2.sql`.

| Passo | O que entrou | Onde se lê |
|---|---|---|
| 11 | descartes da decisão no resgate (Infinity pelo dispositivo da VARIANTE; descarte que nomeia o pedido da posição é ignorado); `preco` 3 → 40; `null` sem candidata finita; `posicoes_sem_variante` coletadas ANTES da cobertura; hero vazia ou 2+ lacunas → `ReferenceSource "lacuna"` + `failed: lacuna_biblioteca` pela fase 1 (`fase1-failure.ts`); dispatch pula; `lacuna_biblioteca` no vault com limiar 1 | run `assembler` (`resgates`, `posicoes_sem_variante`, `lacuna_biblioteca`); `vault_propostas` |
| 15 | `no_responsavel` em toda issue (tabela exaustiva); `filtrarClaimsCobertos`; vars `decisao_json`/`slot_map_json`; checks `posicao_sem_variante` e `traducao_faltante` | run `qa` (`claims_filtrados`, `decisao_presente`); `qa_issues[].no_responsavel` |
| 14 | `cta-inventario.ts` (contrato × heurística), `cor-do-botao.ts` (AA por código, faixa decidida no mesmo plano), pesquisa fora do prompt, `paleta-por-codigo.ts` na 2ª falha, line-height 1,1× ampliado, `checarReducaoDeFonte`, `texto_diff` da hero | run `color_format` (`cta_inventario_divergente`, `ajustes_de_cor`, `fallback`); run `lint_envio`; run `hero_section` |
| 13 | `directive` por campo (exemplo removido por claim), `decisao.proibido`, `estrutura_geral: null` com alvo, `blocks[].campos_omitidos`, `payload_version v3.2`, `copy_prompt_version` no callback (aviso); `copy_fit` sem via `ausente`, aparo só em frase, comparativa ao modelo com `par` | run `copy_dispatch` (`exemplos_removidos`); run `copy` (`copy_prompt_version`, `avisos`); run `copy_fit` (`por_codigo`) |
| 16 | `ShopifyService.graphql` + `discount-lookup.ts` (issue `cupom_inexistente_na_plataforma` / nota `cupom_nao_conferido`); `client_stores.politicas` + `politicas.ts`/`.service.ts`, captura em `pesquisa-completa`, botão na aba Pesquisa, insumo do Seletor, `<politicas_publicas>` no Catalogador, gate | run `qa` (`notas`); run `seletor` (`insumos_de_politica`); `client_stores.politicas` |

**O que DIVERGIU do desenho, e por quê:**

| Passo | Desenho | Executado | Motivo |
|---|---|---|---|
| 11 | `dispositivoPorNome(nome, tags)` com mapa curto | lê a coluna `dispositivo` (B3, backfillada) | a coluna existe desde a Trilha B; NULL é fail-open |
| 11 | descarte ⇒ Infinity | descarte que nomeia o dispositivo PEDIDO pela posição é ignorado | a decisão de referência pede `body_garantias` em [2] E o lista nos descartes — aplicar mataria a posição certa |
| 11 | sem gate | sem gate (decisão do dono, 14/09) | welcome-1 da Hero Boxers reprova até `products_grade_preco` existir; a lacuna chega ao vault no mesmo dia |
| 13 | reenvio único ao n8n com `violacoes[]` em `on` | NÃO construído | decisão do dono: fica para o Passo 17, depois da leitura do shadow |
| 13 | `content.items[].origem` para reviews | fora | o callback não recebe a fonte do review — o n8n não a envia |
| 13 | JSON do workflow + teste que o abre | pendente (Bruno) | `docs/n8n/email-copy-flow.md` lista o que o flow precisa ler |
| 14 | migration editando o `user_template` do `color_format` | sem migration | a config ativa está VAZIA no banco (`user_template` len 0) — os defaults in-code valem |
| 15 | `no_responsavel` reusando o vocabulário da Conformidade | enum PRÓPRIO (ação) + `mapearParaConformidade` | a Conformidade nomeia fronteiras entre agentes; a issue nomeia quem corrige |
| 16 | coluna `politicas` (doc) | coluna `politicas` SEPARADA da ficha, com precedência ficha > políticas | captura automática não pode ganhar o selo `verificado` |

**Medido nesta sessão (sem geração real):** `resgate-de-posicao` 24 testes
(descarte, null, preço); fixture do lint agora acusa **14** correções de
line-height no HTML de 11/09 (eram 3 com a régua antiga); `cor-do-botao`
recusa branco sobre branco e inverte na faixa preta; `paleta-por-codigo`
tira `#D00000` e `#B1B3B6` do documento de teste; `block-copy-schema`
remove "SHOP 10% OFF" numa posição `cupom:false` e devolve `directive`;
`politicas.ts` extrai 30 dias (pt/en/pl) e "frete grátis acima de R$ 199 ·
5 a 10 dias úteis"; `discount-lookup` sem token devolve `sem_token` sem
chamar a API. Produção: `client_stores.politicas` criada; gates inalterados.

**Pendências declaradas:** geração real (Hero Boxers welcome 1 → esperado
`failed: lacuna_biblioteca` com `products_grade_preco` no `slot_map` e a
proposta no vault; Luxe Lift welcome 1 no caminho feliz com dono em toda
issue); captura real das políticas (egress bloqueado daqui); Bruno: flow
do n8n (`directive`, `campos_omitidos`, `decisao.proibido`,
`copy_prompt_version`) + export do JSON; Passo 17 (reenvio) após a leitura
do shadow; cupom só protege quando alguma loja tiver `shopify_access_token`.

## Executado — Passo 19 (15/09, mesma branch)

**O que entrou.** O dispositivo PEDIDO virou filtro em vez de preço.
`doDispositivoPedido` (puro, exportado) tira do pool quem realiza
dispositivo CONHECIDO e diferente, antes de pontuar; pool vazio depois do
filtro devolve `null` e a posição cai com o motivo novo
`dispositivo_indisponivel`, que é o único dos quatro que nomeia o cadastro
que falta. O preço de 150 saiu de `custoDeIncompatibilidade`: duas regras
para a mesma coisa deixariam a finita vencer em silêncio.

**O buraco que isto fecha.** `filtrarPorRequisitos` é fail-open no
CONJUNTO (zerou a seção, devolve todas). Uma posição que pedia
`body_garantias` numa seção sem nenhuma chegava ao resgate com o pool
inteiro, e a "menos incompatível" era uma `body_comparacao` — outra FORMA
entregue ao cliente no lugar da decidida, por 150 de custo finito. O
caminho da ESCOLHA já estava coberto (`violacoesDaEscolha` →
`conflitoDeContrato` → `conflitoDeDispositivo`, `high`); faltava o do
resgate, e agora os dois usam a MESMA comparação.

**O que DIVERGIU do desenho:** o filtro literal do plano
(`c.dispositivo === posicao.dispositivo`) não foi escrito. Medido em
15/09: **8 das 17 variantes ativas de `hero` têm `dispositivo` NULL** — o
backfill da B3 subiu como proposta reversível e o NOT NULL ainda não
existe. O literal apagaria 47% da hero, e hero vazia é FATAL desde o
Passo 11: transformaria falta de CADASTRO em falha de geração. Variante
não classificada FICA (fail-open, a régua do repo), e a comparação é
`conflitoDeDispositivo` — um `===` local divergiria em caixa e acento.
`dispositivoPorNome`/`dispositivo_por_nome` não existiam (o Passo 11 já lia
a coluna), então não houve o que remover.

**Medido antes de subir (30 dias de runs do Estruturador):** 250 posições
SEM dispositivo pedido (o filtro é no-op nelas) e 29 COM — `body_tese`,
`body_garantias`, `footer_nav`, `hero_oferta_cupom`,
`products_grade_sem_preco`, `reviews_com_credencial`, `reviews_3plus` —,
**todas existentes na biblioteca, na própria seção**. Nenhuma posição do
histórico teria caído: a mudança é guarda, não mudança de comportamento no
tráfego de hoje.

**Onde se lê.** Run `assembler`: `resgates.fora_do_dispositivo` (candidatas
de outra forma) e `resgates.dispositivo_indisponivel` (posições que caíram
por isso) — contagens SEPARADAS de `recusados_por_dispositivo`, porque
descarte da decisão é acerto do filtro e "não existe a forma" é lacuna de
biblioteca, e as duas pedem ações opostas. A issue do QA passa a dizer "a
seção não tem variante que realize `<dispositivo>`", e a proposta do vault
já era chaveada por `dispositivo_pedido` (nada mudou lá). 31 testes no
módulo.

## SEMANA 2 — a falha nomeada vira e-mail certo

### Passo 11 · A2 parte 1 · Resgate que respeita descartes e preço

**O que muda.** O resgate deixa de escolher variante de dispositivo
descartado e deixa de tratar "sem preço" como barato. Sem candidata, a
posição cai e o batch pode parar.

**Onde.** `src/lib/agents/architect/resgate-de-posicao.ts`
(`custoDeIncompatibilidade`, `menosIncompativel`); chamada em
`component-assembler.service.ts` linha ~1968; `assemble-document.ts`
(`coberturaSuficiente`, linha ~206); `src/lib/vault/vault-propostas.service.ts`
(limiar, linha ~33, hoje 3 em 14 dias).

**Como.**

1. `custoDeIncompatibilidade(c, r, descartes)`: `Infinity` quando a variante
   realiza um dispositivo descartado. Até o Passo 18, o dispositivo da
   variante vem de `dispositivoPorNome(nome, tags)` com um mapa CURTO
   (`comparativ*` → comparação, `gift*` → presente, `natal|black friday|
   dia das mães` → data comemorativa), e a run grava
   `resgate.dispositivo_por_nome: true`. `preco: true && !tem_preco` sobe
   de 3 para 40. Corrigir o docstring que diz "repetir é composição
   legítima fora de hero/products".
2. `menosIncompativel` devolve `null` quando todas as candidatas têm custo
   `Infinity`.
3. No assembler: coletar `posicoesSemVariante`. Se contém `hero` OU tem
   mais de 1 posição → e-mail `failed`, `failure_reason:
   'lacuna_biblioteca'`, `slot_map` com as lacunas nomeadas e o motivo. Uma
   posição não-hero → segue, com aviso `high` que o QA registra
   (`posicao_sem_variante`).
4. Cron `vault-lacunas-propostas`: limiar 1 quando o motivo é
   `sem_dispositivo` ou `lacuna_biblioteca`.
5. Testes: as posições 3 e 5 do batch (body-4 vetada; products-7 sem preço).

**Por quê.** Foi o resgate que pôs body-4 (comparação, descartada pelo
Estruturador) na posição 3 e products-7 (sem preço, com `preco: true`) na
posição 5. O comentário do módulo assumia "preço entra pela copy"; não
entrou.

**Consequência.** Nenhuma seção entra contra a decisão. Batches param mais
cedo e mais vezes ATÉ a biblioteca ter a anatomia (A10 + B3). A lacuna
chega ao vault no mesmo dia, como proposta, em vez de esperar 3 ocorrências.

**Ficou correto se.** Reproduzindo o batch: posição 3 sem body-4, posição
5 sem products-7, `failure_reason: 'lacuna_biblioteca'`, `slot_map` com
`body: garantias`, `products: grade_com_preco`; em `vault_propostas` uma
proposta nova com esses dois nomes no mesmo dia.

**NÃO ficou se.** (a) body-4 ainda entra: o mapa por nome não casou
(conferir `dispositivo_por_nome` e o nome da variante). (b) O batch morre
em `hero_failed` em vez de `lacuna_biblioteca`: `coberturaSuficiente`
rodou antes da coleta de posições sem variante; a ordem importa.

**Rollback.** Reverter o commit. Sem gate próprio; o Passo 8 (`shadow`)
não afeta este.

**Esforço.** 1 dia. Dono: Matheus.

---

### Passo 12 · B2 · Lint do HTML e pós-processador, por código

**O que muda.** Antes do QA, um módulo puro varre o HTML final e (a) corrige
o que é corrigível sem julgamento, (b) reporta o resto como issue `high`.

**Onde.** Novo `src/lib/agents/html/lint.ts` (puro) + chamada em
`phase2-runner.service.ts` logo antes de `computeContentChecks`
(`content-checks.ts`, linha ~74). Reusa `extrairCtas` de `color-faixas.ts`
(o `somente_outlook` já existe), `color-contrast.ts`, `qa-views.ts`.

**Como.** Os nove defeitos medidos no HTML de 11/09, cada um com regra,
ação e teste:

| # | Defeito | Ação | Como detecta |
|---|---|---|---|
| 1 | `var(--bg)` e outras CSS vars em `style=` | corrige: resolve pela paleta (`color-roles.ts`), senão remove a declaração | regex `var\(--` em atributo style |
| 2 | Seis blocos `<style>` | corrige: funde num só no `<head>`, ordem preservada | contar `<style` |
| 3 | Comentário de dev (`<!-- TODO`, `<!-- cfy:` fora da fronteira) | corrige: remove | regex de comentário não-MSO |
| 4 | MSO com "DIGITAL GIFT CARD" e ramo `!mso` vazio | reporta `high`: `cta_somente_outlook` (já detectado por `extrairCtas`) | `somente_outlook: true` |
| 5 | `<img src="">` | corrige: remove a linha da imagem quando o slot não tem URL; reporta `medium` | `src=""` ou `src="{{` |
| 6 | Botão branco sobre branco | reporta `high`: `cta_sem_contraste` (< 4,5:1 contra o `<td>` real) | `extrairCtas` + `color-contrast` |
| 7 | `alt` lixo ("image", "img_1", vazio em imagem de conteúdo) | corrige: `alt` = rótulo do slot do blueprint | comparar com lista de lixo |
| 8 | Ano errado / `{{YEAR}}` | corrige: ano corrente | regex `20\d\d` no rodapé + placeholder |
| 9 | `line-height < font-size` | corrige: `line-height = 1,1 × font-size` (reusa a régua do Passo 14) | inventário de tipografia |

Telemetria: run `lint` (agent novo no CHECK de `email_generation_runs`,
migration junto; sem isso o step roda e some da telemetria, incidente do
`typography` em 04/09) com `parsed_output.corrigidos[]` e
`reportados[]`. `qa_issues` recebe os `reportados`.

**Por quê.** Nenhum dos nove depende de biblioteca nem de LLM. Sem eles o
e-mail continua não enviável mesmo com A1 a A9 perfeitos.

**Consequência.** Sete defeitos somem por código; dois viram reprovação
com nome (o MSO órfão e o contraste), que a régua de envio exige.

**Ficou correto se.** Reprocessando o HTML do batch de 11/09 (fixture) o
lint devolve exatamente 7 corrigidos e 2 reportados, e o HTML de saída não
contém `var(--`, tem 1 `<style>`, zero `src=""`. Numa geração nova, a run
`lint` existe com `status: success`.

**NÃO ficou se.** A run `lint` não aparece: o CHECK do `agent` não tem o
valor (a migration escorregou). O QA passa a reprovar tudo por
`cta_sem_contraste`: a cor do `<td>` real está sendo lida errada; conferir
contra o render no Chromium antes de mexer na régua.

**Rollback.** Env `EMAIL_LINT_MODE=off|shadow` (criar) ou gate
`lint_mode` em `email_generation_settings` (preferível, sem deploy).

**Esforço.** 2 dias. Dono: Matheus.

---

### Passo 13 · A5 · Payload do n8n com uma voz, callback que valida

**O que muda.** O n8n recebe uma instrução por campo, o callback valida e
reenvia uma vez, o `copy_fit` deixa de inventar e de cortar no meio.

**Onde.**

- `email-copy-webhook.service.ts`: montagem de `fields[]` (linha ~1349,
  `example`), `decisao` (linha ~1272), `estrutura_geral` (linha ~1276),
  `campos_omitidos` (linha ~1778, hoje só telemetria).
- `src/app/api/webhooks/n8n/email-copy/route.ts`: antes de gravar
  `copy_ready` (linha ~266).
- `src/lib/agents/chains/copy-fit.chain.ts`: via `ausente` (linhas ~260,
  ~415, ~473), `comparativa_mantida` (linha ~506);
  `src/lib/email-workspace/copy-fit.ts`: `apararNoLimite` (linha ~160,
  corta na última PALAVRA).
- Prompt do n8n (Bruno) + `docs/n8n/email-copy.workflow.json` (novo; a
  pasta existe).

**Como.**

1. Payload: `fields[].example` que casa com `claims.ts` (Passo 9) numa
   posição cujo requisito nega → `example: null` + `directive: <exige da
   posição>`. `example` de forma ("Name. 1") fica. `blueprint.messaging` e
   `subject_hint` vêm do Passo 10. `estrutura_geral: null` quando `decisao`
   existe (exceto `text_only`). `decisao.incentivo` completo (Passo 1).
   `blocks[].campos_omitidos: string[]`. `blocks[].requisitos` e
   `decisao.proibido` no nível do e-mail, uma vez.
2. Callback: `validarCopy`; em `contrato_textual: on`, violação `high` em
   campo obrigatório → run `copy` com `status: error`, `error_message:
   contrato:<tipo>`, reenvio do MESMO payload + `violacoes[]` ao n8n, uma
   vez; segunda → `failed: copy_contrato`. Campo omitido preenchido →
   descartado, aviso. `copy_prompt_version` obrigatório (aviso `high` sem
   ele). Reviews com `origem: { fonte: "banco", id }` gravados em
   `content.items[].origem`.
3. `copy_fit`: remover `criar_item_da_lista`/via `ausente` (item ausente
   sai do e-mail pelo merge, que é o certo); `apararNoLimite` só corta em
   `. ! ?` e, sem fronteira, devolve `null` (vai ao LLM com "reescreva em
   ≤ N chars, frase completa"); `comparativa_mantida` vira reescrita.
4. n8n: Bruno adiciona a leitura de `directive`, `campos_omitidos`,
   `decisao.proibido`, `decisao.incentivo`; variável `COPY_PROMPT_VERSION`
   ecoada no callback; exporta o JSON para `docs/n8n/` no mesmo commit do
   payload. Teste que abre o JSON, acha o nó de copy pelo nome e confere
   que o system prompt menciona `directive` e `campos_omitidos`.

**Por quê.** O n8n obedeceu ao `example` "SHOP 10% OFF"; o `copy_fit` criou
`column_b_item_6` que o dispatch tinha omitido e cortou `column_a_item_3`
no meio; o callback "audita sem rejeitar", então tudo isso foi para o HTML.

**Consequência.** `cta_label` sem oferta copiada do exemplo; comparativo
inteiro; nenhum campo inventado; copy que viola volta ao n8n com o motivo
em vez de ir para a peça. Tempo por e-mail cresce em UM ciclo do n8n
quando há reenvio (medir; se não couber nos 12 min, revê-se a meta, não o
reenvio).

**Ficou correto se.** Reproduzindo o batch: `input_vars.payload` da run
`copy_dispatch` sem `example` com percentual; run `copy` com
`copy_prompt_version`; run `copy_fit` com `com_ausente: 0` e
`comparativas_mantidas: 0`; no HTML, `column_a_item_3` termina em
pontuação; `email_blocks.content` sem `column_b_item_6`.

**NÃO ficou se.** (a) O n8n devolve `copy_prompt_version` vazio: o Bruno
ainda não exportou a versão nova; o aviso `high` no callback denuncia. (b)
`apararNoLimite` passa a devolver `null` em quase tudo e o custo do
`copy_fit` sobe: revisar os `max_len` de review em
`DIAGNOSTICO_max_len.sql` (subir para ~260) antes de culpar a regra.

**Rollback.** `contrato_textual = 'shadow'` desliga o reenvio; o resto é
commit.

**Esforço.** 2 dias admin + meio dia n8n. Dono: Matheus / Bruno.

---

### Passo 14 · A6 · Formatação fail-closed com fallback determinístico

**O que muda.** `color_format` deixa de inserir botão onde há botão, decide
a cor pelo `<td>` real, perde a pesquisa inteira do prompt e, se falhar
duas vezes, aplica a paleta por código. `typography` ganha a régua de
line-height.

**Onde.** `src/lib/agents/chains/color-format.chain.ts` (linha ~19
fail-open, ~159 `{{pesquisa_full_text}}`, ~288 parseOps);
`src/lib/agents/html/color-faixas.ts` (`extrairCtas`, linha ~308);
`html/plano-de-cor.ts`, `html/color-roles.ts`, `html/cta-template.ts`,
`html/escala-do-botao.ts`; `src/lib/agents/typography/guards.ts`.

**Como.**

1. Inventário de CTAs por CONTRATO: para cada bloco, `output_schema` da
   variante (campos `cta`/`*_cta_label`) + região `cfy:block`. `extrairCtas`
   passa a verificação secundária e, quando os dois discordam, a run grava
   `cta_inventario_divergente` com o bloco (é o teste de regressão para
   descobrir por que a heurística não viu body-3 e products-7).
2. Op `adicionar` só quando contrato diz "sem CTA" E requisito pede
   `cta: true`.
3. Cor do botão inserido e recolorido: por código, a partir do
   `bgcolor`/`background` do `<td>` ancestral, com AA via
   `color-contrast.ts`. O agente decide inserir; o código decide a cor.
4. `{{pesquisa_full_text}}` sai do prompt (migration que edita o
   `user_template` ativo do `color_format`, como a 20261139 fez). Fica
   paleta com papéis, tons, fontes, `faixas_json`, `ctas_json`.
5. Segunda falha → `aplicarPaletaPorCodigo(html, paleta)` com
   `plano-de-cor.ts` + `color-roles.ts` (já são puros) em vez de manter o
   HTML anterior. Run com `fallback: 'paleta_por_codigo'`.
6. `typography/guards.ts`: pós-agente, `line-height ≥ 1,1 × font-size`
   em todo `<td>`/`<div>` com texto; telemetria `line_height_corrigidos`.
   **Sem teto absoluto de font-size.** Se houver teto, é relativo: o agente
   não pode aumentar além de 1,25× o original da variante.
7. `hero.chain.ts`: os guards `heroCopyPreserved`/`heroTextoInventado` já
   existem; adicionar o diff de texto visível antes/depois como issue.

**Por quê.** Dois botões inseridos onde já havia CTA (a heurística não os
viu), o segundo branco sobre branco (cor decidida pela faixa imaginada). A
pesquisa inteira (15,5k chars) no prompt sem uso. Título de 50px com
line-height 43px passando. Fail-open mantendo HTML velho.

**Consequência.** Sem botão duplicado; sem botão ilegível; títulos legíveis;
falha do agente não deixa o HTML de outra etapa no ar. Não reescreve os
tamanhos da biblioteca.

**Ficou correto se.** Reprocessando o HTML de 11/09: zero ops `adicionar`
(os blocos tinham CTA), `cta_inventario_divergente` lista body-3 e
products-7, nenhum CTA com contraste < 4,5:1, nenhum texto com
line-height < font-size, nenhum `font-size` reduzido em relação à
variante. Run `color_format` com `tokens_input` ~30% menor.

**NÃO ficou se.** O agente insere CTA num bloco que tem: o `output_schema`
da variante não declara o campo (é cadastro, vai para A10). O fallback por
código pinta tudo de `surface`: a paleta da loja não tem papéis derivados;
conferir `color-roles`.

**Rollback.** `color_plano_mode = 'shadow'` volta a decidir sem aplicar.

**Esforço.** 2 dias. Dono: Matheus.

---

### Passo 15 · A7 determinístico · QA com a decisão e com responsável

**O que muda.** O QA recebe `DecisaoDoEmail`, roda os checks por código
novos e cada issue diz de quem é.

**Onde.** `qa.chain.ts` (vars), `html/content-checks.ts`
(`computeContentChecks`), `qa_issues` (JSONB; sem migration, campo novo
dentro do objeto), `types/email-generation.ts` (`QaIssue.no_responsavel`).

**Como.**

1. Var `decisao_json` no QA (insumos, proibido, incentivo, requisitos por
   posição) e `slot_map` com a variante por posição.
2. Checks novos em `content-checks.ts`: `validarHtmlFinal` (Passo 9, com o
   modo textual valendo); `posicao_sem_variante` (Passo 11);
   `cupom_nao_conferido` como UMA linha por peça (Passo 16);
   `traducao_faltante` (Passo 4). Os do lint (Passo 12) já entram.
3. `no_responsavel` em cada issue: `seletor | estruturador | curador | copy
   | imagem | formatacao | biblioteca | loja`, atribuído pelo check que a
   gerou (tabela fixa no módulo).
4. `claim_nao_coberto` do LLM: só vale se o claim NÃO está em
   `insumos_permitidos` nem em `top_products`; o código filtra antes de
   gravar.

**Por quê.** O QA reprovou "Shopify PCI" e "testemunhos do site" que o
Seletor tinha verificado; e uma issue sem dono não vira correção.

**Consequência.** Menos reprovação falsa; o painel B6 passa a ter de onde
ler.

**Ficou correto se.** Reproduzindo o batch com decisão coerente: zero
`claim_nao_coberto` para item de `insumos_permitidos`; toda issue em
`qa_issues` tem `no_responsavel`.

**NÃO ficou se.** Issues sem `no_responsavel`: um check antigo não passou
pela tabela; grep por `issues.push` em `content-checks.ts`.

**Rollback.** Commit. `qa_mode = 'shadow'` desliga a reprovação sem deploy.

**Esforço.** 1 dia. Dono: Matheus.

---

### Passo 16 · A9.6 e A9.7 · Cupom conferido na plataforma; políticas lidas da loja

**O que muda.** (a) O QA diz, numa linha, se o cupom da peça foi conferido
na plataforma. (b) Troca e frete passam a ser lidos das páginas públicas da
loja.

**Onde.** (a) `content-checks.ts` + novo `src/lib/integrations/shopify/
discount-lookup.ts`. (b) Novo `src/lib/stores/politicas.service.ts`,
coluna `client_stores.politicas jsonb`, chamada no fim do callback
`/api/webhooks/n8n/pesquisa-completa`, leitura no Seletor
(`insumos_permitidos`).

**Como.**

- (a) Loja com `shopify_access_token` → GraphQL `discountNodes(query:
  "code:<codigo>")`; existe → nada; não existe → issue `high`
  `cupom_inexistente_na_plataforma`. Sem token → UMA linha
  `cupom_nao_conferido` no `parsed_output.notas` da run `qa` (NÃO em
  `qa_issues`). **Hoje zero lojas têm token**: o check nasce inerte e não
  pode ser contado como proteção.
- (b) `GET https://<loja>/policies/refund-policy` e `/shipping-policy`;
  regex de "N dias", "grátis/free", "prazo"; sem número extraível e com
  página existente → uma chamada Sonnet que cita o trecho literal com URL.
  Grava `{ troca: {dias, texto, url}, frete: {gratis, prazo, texto, url},
  capturado_em }`. Seletor lê e põe em `insumos_permitidos` com a URL.
  Degradação: coluna ausente → não grava, loga `politicas.coluna_ausente`.

**Por quê.** (a) Traduzido não é cadastrado; e-mail com WELCOME10 numa loja
sem esse desconto é pior que em português. (b) A faixa de garantias da
Hero Boxers foi podada porque ninguém tinha o fato de troca; a página
pública tem.

**Consequência.** (a) Nenhuma hoje; passa a valer quando houver token. (b)
O Seletor deixa de proibir "prometer troca" quando a loja promete na
própria página; a seção de garantias volta a ser possível.

**Ficou correto se.** (b) Depois de rodar `pesquisa-completa` na Hero
Boxers, `client_stores.politicas.troca.dias` preenchido com URL; na run
`seletor`, `insumos_permitidos` contém a troca com a URL.

**NÃO ficou se.** (b) `politicas` nulo em loja Shopify com página: a URL
não segue o padrão (loja com domínio próprio redireciona); logar o status
HTTP.

**Rollback.** (a) remover o check. (b) coluna fica; Seletor ignora se nula.

**Esforço.** 1 dia. Dono: Matheus.

---

### Passo 17 · Ligar o contrato textual

**O que muda.** `contrato_textual` de `shadow` para `on`, depois de ler a
semana de violações.

**Onde.** `email_generation_settings`.

**Como.** Rodar a query do Passo 9 item 5; corrigir regex com falso
positivo; `update email_generation_settings set contrato_textual = 'on'`.
Anunciar no canal do time: a partir daqui, copy com oferta indevida volta
ao n8n e HTML com claim proibido reprova.

**Ficou correto se.** Nos 3 batches seguintes, toda violação textual em
`_contrato` é oferta indevida de verdade (ler uma a uma).

**NÃO ficou se.** Batch morre por atributo de produto: voltar a `shadow`,
apertar a regex, religar.

**Esforço.** 2 horas. Dono: Matheus, com Bruno lendo as violações.

---

### Biblioteca na semana 2 (Bruno)

A10.2 (desativar reviews-3b e hero-8), A10.3 (footer-1 com `nav_label_1..6`
e `nav_url_1..6`), A10.4 (hex → papel nos briefs), A10.5 (`objecao`/
`aliviador` nas 16 sem eixo), A10.6 (`rendered_html` nas 7 sem). Prompt do
n8n (Passo 13.4). Verificação agregada:

```sql
select
  count(*) filter (where output_schema is null) as sem_schema,
  count(*) filter (where rendered_html is null) as sem_rendered,
  count(*) filter (where coalesce(html_tagged, html) ~ 'URL_[A-Z_]+') as com_href_exemplo
from email_component_variants where is_active;
```

Meta: 0, 0, 0.

---

## SEMANA 3 — dispositivo tipado, dieta, modelos, painel

### Passo 18 · B3 · Dispositivo tipado na biblioteca e na decisão

**O que muda.** `dispositivo` deixa de ser palavra em prosa e vira campo
fechado: na variante, na decisão do Estruturador e no resgate.

**Onde.** Vocabulário em `src/lib/agents/shared/dispositivos.ts` (Bruno
define a lista: `apresentacao | prova_social | comparacao | garantia |
oferta | presente | data_comemorativa | vitrine | cta_isolado | encerramento`,
a fechar); coluna `email_component_variants.dispositivo text` com CHECK;
`estruturador-prompt.ts` (`<secoes_disponiveis>` passa a listar
dispositivos disponíveis por seção); `estruturador-consume.ts`
(`normalizarRequisitos` aceita `dispositivo`); `decisao-do-email.ts`
(`posicoes[].dispositivo`, `descartes[].dispositivo`);
`resgate-de-posicao.ts` (Passo 19); tela "Editar variante" (select).

**Como.**

1. Vocabulário + teste que reprova valor fora da lista.
2. Migration da coluna + backfill: um `UPDATE` por variante das 41 ativas
   (lista de/para escrita pelo Bruno a partir do nome e do
   `long_description`; o script vai em `supabase/migrations/
   APPLY_MANUALLY_backfill_dispositivo.sql`).
3. O Estruturador passa a devolver `dispositivo` por posição e nos
   descartes; `montarDecisao` copia; o Curador recebe no catálogo e no
   `<decisao_do_estruturador>`.
4. A regra "dispositivo em descartes" do Passo 8 sai de `shadow`.

**Por quê.** Sem campo tipado, "comparativo vetado" é casamento por nome,
que este repo já pagou com apelidos.

**Consequência.** Resgate e validador comparam campo com campo; a lacuna
nomeada diz "falta `garantia` em body", que é o pedido de cadastro exato.

**Ficou correto se.** `select count(*) from email_component_variants where
is_active and dispositivo is null` = 0; reproduzindo o batch, run
`estruturador` com `dispositivo` em todas as posições e no descarte da
comparação; `_contrato` sem a regra em shadow.

**NÃO ficou se.** Estruturador devolve dispositivo fora da lista:
`normalizarRequisitos` deve descartar o valor e logar, não falhar.

**Rollback.** Coluna fica; resgate volta ao mapa por nome se
`dispositivo` for nulo.

**Esforço.** 1,5 dia código + meio dia de backfill. Dono: Bruno
(vocabulário e de/para), Matheus.

---

### Passo 19 · A2 parte 2 · Resgate por dispositivo

**Onde.** `resgate-de-posicao.ts`, `menosIncompativel`.

**Como.** `candidatas.filter(c => c.dispositivo === posicao.dispositivo)`
antes de pontuar; sem candidata do mesmo dispositivo → `null` (a posição
cai, Passo 11 decide). Remover `dispositivoPorNome` e a flag
`dispositivo_por_nome`.

**Ficou correto se.** Reproduzindo o batch: posição 3 (`garantia`) sem
candidata → lacuna nomeada `body: garantia`; teste do módulo com a fixture.

**Esforço.** 2 horas. Dono: Matheus.

---

### Passo 20 · A3.3 e A3.4 · Regras do Curador como texto versionado + dieta

**O que muda.** As regras vivas saem do TS para um markdown que o prompt
monta; a chamada de escolha recebe só o que decide.

**Onde.** Novo `docs/email-generation/curador.rules.md` (ou nota
`email_vault_docs` kind=protocolo, já servida); `curador-shadow.ts`
(montagem do prompt, blocos `<indice_do_vault>`, `<lacunas_da_biblioteca>`,
`<aprendizados>`, perfil da marca); teste
`curador-prompt.coerencia.test.ts`.

**Como.**

1. Bruno escreve `curador.rules.md` a partir do prompt atual, sem
   histórico. O TS lê o arquivo em build (import de texto) e monta o
   prompt.
2. Teste de coerência: `podeRepetir` false ↔ texto não diz "permitido";
   `assembleDocument` sem fallback ↔ texto não diz "template global";
   vocabulário de dispositivos ↔ texto lista os mesmos.
3. Dieta na chamada de escolha: entra `decisao.posicoes[i]`, contrato +
   nota das ≤ 3 finalistas, fio, aprendizados filtrados por `section`, 3
   escolhas anteriores da memória. Sai: índice do Obsidian, lacunas
   completas (só as da seção, máx. 3), perfil completo (posicionamento +
   tom + vocabulário), índice compacto.
4. Medir `consumo_por_chamada` antes/depois nos 3 e-mails de referência,
   5 runs cada.

**Ficou correto se.** `tokens_input` da escolha ≤ 30k; custo do Curador ≤
US$ 0,60; duração ≤ 90 s; em 5 runs × 3 lojas, rank-1 por posição coincide
com o prompt cheio em ≥ 80% das posições e a `justificativa` cita a mesma
regra nas divergentes.

**NÃO ficou se.** Coincidência < 80%: um bloco que saiu era usado (provável:
os aprendizados da seção). Repor um bloco por vez e medir.

**Rollback.** Flag `CURADOR_PROMPT_LEGADO=1` (env) por uma semana.

**Esforço.** 2 dias. Dono: Bruno (texto), Matheus (montagem, teste, medição).

---

### Passo 21 · A7 LLM · O QA julga só o que o código não decide

**Onde.** `qa.chain.ts` (prompt) + `email_agent_configs.qa`.

**Como.** Prompt recebe texto visível por bloco + decisão + lista dos checks
já feitos ("não repita estes"); julga adequação editorial e claim não
regexável. Sonnet 4.6, `max_tokens` 2000, na mesma statement.

**Ficou correto se.** Run `qa` com `cost_cents ≤ 5`; issues do LLM não
duplicam as do código (mesmo `block_id` + mesmo tipo).

**Esforço.** Meio dia. Dono: Bruno (prompt), Matheus (SQL).

---

### Passo 22 · A8 · Modelo por nó

**Onde.** `email_agent_configs`, via `TROCAR_modelo_agentes.sql`.

**Como.** UMA statement por agente, com `is_active = true` no WHERE,
`model` E `max_tokens` juntos. Barra no slug = OpenRouter; sem barra = SDK
da Anthropic e outra fatura. Tabela do plano (Fable em seletor,
estruturador, escolha do Curador; Sonnet 4.6 no resto; imagem inalterada).
Rodar DEPOIS do Passo 20 para não misturar efeitos.

**Ficou correto se.** Batch da Hero Boxers com `sum(cost_cents) ≤ 350` e
os três e-mails de referência com saída equivalente (mesma escolha de
variante, subject sem oferta indevida, zero issue `high` nova).

**NÃO ficou se.** Run com `finish_reason = length` e saída vazia: teto
baixo para o modelo novo pensar; subir `max_tokens` daquele nó.

**Rollback.** O mesmo SQL com os valores anteriores (anotar antes).

**Esforço.** 2 horas + medição. Dono: Matheus.

---

### Passo 23 · B6 · Painel decisão × entregue

**O que muda.** Uma aba no Estúdio mostra, por batch e por posição: o que o
Estruturador decidiu, o que o Curador escolheu, o que o resgate fez, o que
saiu no HTML, e as violações de `_contrato` com responsável.

**Onde.** `src/app/admin/agents/studio/page.tsx` (aba nova `contrato`),
rota `GET /api/admin/agents/contrato?batch=` lendo `email_generation_runs`
(`parsed_output.estrutura`, `escolhas`, `resgates`, `_contrato`) e
`email_flow_emails.qa_issues`.

**Como.** Tabela por posição: seção · dispositivo decidido · variante
escolhida · dispositivo da variante · violação (tipo, responsável) ·
issue do QA. Linha vermelha quando decidido ≠ entregue. Rodapé: custo,
tempo, ponto onde o batch parou. É a query de 0.1 em tela.

**Por quê.** Sem ele ninguém sabe se o Passo 8 está funcionando sem SQL.

**Ficou correto se.** Abrindo o batch de referência (o antigo) a tela
mostra 3 linhas vermelhas; abrindo um batch pós-Passo 8, mostra onde parou
e por quê.

**Esforço.** 1,5 dia. Dono: Matheus.

---

## Como saber que o PLANO ficou correto (não cada passo)

Ao fim da semana 3, gerar 5 e-mails consecutivos (Welcome 1 e 3 da Hero
Boxers, Welcome 1 de duas outras lojas, um abandoned_cart 2 sem cupom) e
medir:

| Métrica | Como medir | Meta |
|---|---|---|
| Inversões decisão × entregue | Painel B6, linhas vermelhas | 0 |
| Custo por e-mail | `sum(cost_cents)/100` por batch | ≤ 3,50 |
| Tempo por e-mail | `max(created_at) - min(created_at)` das runs | ≤ 12 min |
| Tokens do Curador | `tokens_input` da run `assembler_chooser` | ≤ 30k |
| Onde morre com violação | `failure_reason` | `contrato_*` ou `lacuna_biblioteca`, nunca `qa_failed` |
| Requisitos declarados pelo Estruturador | query de cobertura do Passo 7 | cobertura ≥ 0,9, duras = 0 |
| Enviável sem edição | régua 0.2 nos 5 | 5 de 5 |

Se a última linha falhar com as outras cinco passando, o problema é
biblioteca: `slot_map` e `vault_propostas` dizem qual anatomia falta, e a
resposta é cadastro, não código.

## O que fica de fora deste documento, de propósito

- B4 (agente gerador de anatomias) e B5: só depois de medir os 5 de 5; até
  lá as anatomias que faltam são do Bruno.
- Quaisquer trocas em `image`: o modelo e o fallback de 08/09 ficam.
- O diagnóstico do batch 6249aef2 precisa ser commitado em
  `docs/email-generation/` antes do Passo 8 (as fixtures saem dele).

---

## Executado — otimização por agente, passos 2 a 6 (14/09)

Análise de custo por agente (artifact "Otimização por agente") e as
descobertas que mudaram o plano ao ler o código e a doc da Anthropic:

1. **O cache entre as duas chamadas do Curador (c08177d) nunca pôde
   acertar**: o cache é hierárquico (system antes de messages) e as duas
   chamadas usavam systems diferentes. Agora há UM system
   (`DEFAULT_CHOOSER_VAULT_SYSTEM`) e a tarefa da shortlist vai na cauda
   do user (`CAUDA_SHORTLIST_USER`), depois da última marca.
2. **A cadeia de formatação nunca cacheou**: `openrouter-invoke.ts:callOnce`
   mandava o system como string. Passa a mandar bloco com `cache_control`
   (regra em `shared/cache-de-prompt.ts`), e cada step grava
   `parsed_output.cache = {tokens_lidos, tokens_escritos}`.
3. **Quatro e-mails em paralelo = quatro escritas** (125% cada). Gate de
   prefixo em `invokeAgent` (`shared/gate-de-prefixo.ts`,
   `CACHE_STAGGER_MS`, 15 s): o primeiro chamador de um prefixo passa; os
   demais esperam ele escrever.
4. **Prefill está morto na família 4.6+** (400 em Sonnet 4.6, Sonnet 5,
   Opus 5, Fable). `aceitaPrefill` devolve `false` para eles; o item saiu.
5. **A shortlist decidia 3 de 4**: `limiarSemChamada()` = 5 — posição com
   até 5 elegíveis vai inteira às finalistas, sem chamar o modelo.
6. **Vault por toque** (`lib/vault/toque.ts`): `emails: [N]` nas
   estruturas e `serve_a: [flow-N]` nos aprendizados; global fica no
   system (cacheado), o do toque vai no user (`<material_do_toque>`,
   `<aprendizados_do_toque>`), o de outro toque sai; fail-open quando nada
   sobra; kill-switch `VAULT_POR_TOQUE=off`; seletor "O que o toque
   recebe" na aba Conhecimento.

Ordem dos blocos do user por frequência de mudança, com três marcas:
Curador `[global+flow] [loja] [e-mail] [cauda]`; Estruturador
`[perfil + seções] [e-mail]`; Seletor `[loja + catálogo + oferta]
[e-mail]`. `blocosDeCache` funde segmento vazio e respeita o teto de 4
breakpoints; `prompt-provenance` remove a marca antes de segmentar.

JSON compacto onde é gerado por código: decisão do Estruturador para o
Curador (`decisaoCompletaParaCurador`), `format-context`, `build-vars`
(top_products) e `qa.chain`. `catalog-builder.json` fica (sha8 de runs
antigas).

**Leitura pós-deploy**: `supabase/migrations/DIAGNOSTICO_cache_por_chamada.sql`
— `tokens_cache_escrita` uma vez por prefixo por lote e `tokens_cache` ≈
prefixo nas chamadas seguintes; `shortlist_fonte = codigo` quando toda
posição tem ≤ 5 elegíveis; `refs_descartadas_por_toque` no Estruturador.
Estimativa: Curador 2,45 → 1,3–1,5 por e-mail no lote; total ≈ 5,9 →
4,5–4,7. Qualidade esperada igual ou melhor (mesmo conteúdo, só ordem;
escolha com as notas completas de até 5 candidatas), medida por B6,
auditoria de requisitos e QA contra as 3 últimas gerações.

---

## Executado — Leque do Curador, Fase 0 (16/09)

Seis defeitos de produção que o plano do leque expôs, e que valem por si.
O leque não sobe antes disto; a medição que fecha a fase é uma geração real
com `ARCHITECT_BATCH=1`, que dirá se seis chamadas em série cabem na janela.

**O que a medição derrubou.** Três afirmações que viviam em comentário:

| afirmação | o que o banco diz |
|---|---|
| `45s + 240s ≤ maxDuration 300s` dimensionava o tick | a fase 1 de UM e-mail leva **363s de mediana, 681s no p90, 1213s no máximo** (43 e-mails, 14 dias). Nunca coube |
| a reserva de 150s cobre o Curador (97s no 4.6, n=3) | o Curador está em **210s de mediana, 336s no p90, 376s no máximo** — a reserva era menor que a mediana da etapa que ela protege |
| a ordem dos e-mails do job | **três jobs** têm o welcome como `2,5,8,6,4,1,3,7` — a mesma permutação, porque era a ordem determinística do PostgREST |

**O que mudou:**

- **`CUSTO_TIPICO_MS`** (`fase1-orcamento.ts`): custo MEDIDO por agente, que
  `cabeNaJanela` passa a usar no lugar do teto de tokens. Os dois respondem
  perguntas diferentes — o teto é o RELÓGIO (o provedor reserva
  `prompt + max_tokens` em voo), o medido é "vale a pena começar". Estimar
  pelo teto **e** reservar para o Curador é pedir duas vezes o mesmo tempo,
  e foi exatamente isso que desligou o Estruturador em 11/09. Agente fora da
  tabela cai no teto — nada fora da fase 1 muda. Um teste reprova quem
  "simplificar" de volta para `relogioParaTeto`.
- **`RESERVA_POS_ESTRUTURADOR_MS` 150s → 400s** (Curador 340 + Blueprint 22
  + Subject 7 + folga). A conta só fecha porque o custo do Estruturador
  passou a ser medido (270s) e não o teto (371s): dos 742s que restam quando
  ele é consultado sobram 342 — 72s acima do pior caso dele.
- **`maxDuration` do cron 300 → 800** (o teto da Vercel, o mesmo das rotas
  de fase 2), com `CRON_MAX_DURATION_S` no serviço e um teste que lê o
  arquivo da rota e compara. A fase 1 não é retomável no meio: a função
  morria, o lease expirava e o e-mail **recomeçava pagando o Curador de
  novo**. `JANELA_DO_TICK_MS`, `TICK_BUDGET_MS` e `LEASE_MS` passaram a ser
  derivados dela, com a invariante em teste.
- **`comOrcamentoDeFase1` aberto no dispatch.** Sem ele
  `restanteDoOrcamento()` era `null` no cron e TODO o guard de
  `fase1-orcamento` era código morto justamente em produção — o módulo só
  estava ligado na aba Teste e em três rotas do Catalogador.
- **O pré-passo do Seletor para limpo quando a janela acaba.** Abrir o
  orçamento criou um caminho de falha novo: `invokeAgent` LANÇA "sem
  orçamento", e o laço do pré-passo não tem `try` por e-mail — o throw
  abortaria o pré-passo inteiro e os e-mails seguintes iriam para a fase 1
  **sem alvo, em silêncio**. Agora a guarda vem antes da chamada, o
  resultado traz `semOrcamento` (que não é `skipped`: não foram
  dispensados, foram adiados) e o próximo tick continua de onde parou.
- **`ordemDosEmails`** é a fonte única: o enqueue ordena o que grava e o
  tick reordena o que lê, porque o array desordenado mora no JSONB dos jobs
  antigos e nenhuma migration o alcança. A ordem é decisão, não
  apresentação — o `ja_atacadas` do Seletor depende dela.
- **`logCuradorChoice` com `await`, depois da persistência, e só quando
  `source === "code"`.** `void` em serverless morre no congelamento (a
  armadilha dos eventos de conversão da Meta), e escolha de montagem
  recusada não virou e-mail nenhum: gravá-la faria a janela de repetição
  (B1) tratar como entrega o que foi descartado.
- **Heartbeat por e-mail** dentro do lote. Não é o que impede a reclamação
  (o lease é derivado do `maxDuration`); é o que mantém o progresso visível
  num lote de 11 minutos, e o que mantém a premissa de pé quando o lote for
  de um e-mail só.

**Honestidade sobre o risco.** A corrida de lease é **latente, não
observada**: dos 25 e-mails que pagaram o Curador duas vezes no mesmo
batch, a maioria é retry legítimo (`error` → `success`), não reclamação
concorrente. O caminho do cron também é pouco usado hoje — **1 job em 30
dias**; tudo tem passado pela aba Teste, que já tinha janela. Os defeitos
eram reais e agora estão fechados, mas nenhum deles estava queimando
dinheiro esta semana.

**Leitura pós-deploy**: `supabase/migrations/DIAGNOSTICO_fase1_relogio.sql`
— as mesmas seis queries que produziram os números acima, com o retrato de
16/09 no cabeçalho. Trocar o modelo de um agente da fase 1 obriga a rodá-las
de novo.
