# Plano de evolução do pipeline de e-mail — set/2026 (revisão 2, 13/09)

Base: batch 6249aef2 (Hero Boxers · Welcome 1, 11/09), código do repo em 13/09,
banco de produção em 13/09.

Decisões do dono: copy continua no n8n até validar um output ótimo; régua de
pronto = enviável sem toque humano; biblioteca varia por estratégia e por loja,
sem repetir bloco; anatomias faltantes são cadastradas pelo Bruno (depois por
um agente gerador); **incentivo é fixo por flow/e-mail, catalogado em
`email_outline_templates.coupon_code` (27 dos 34 toques têm código), com
tradução literal por idioma e override por loja**; top 5 produtos e banco de
reviews já existem; ninguém preenche ficha; prompt do n8n é editado e
exportado pelo Bruno; execução por Bruno + Matheus + Claude Code.

O que mudou da revisão 1 para esta (conferido no código em 13/09):

- **A9** deixou de derivar `existe` do Catalogador E deixou de reabrir o buraco
  do BEMVINDO10: o outline é a fonte, a tradução por idioma vira DADO no próprio
  outline, e a existência do código na plataforma vira check do QA.
- **A1** nasce em `shadow` com kill-switch, e os validadores por regex só
  bloqueiam claim de OFERTA (cupom, percentual de desconto, prazo de oferta).
  Atributo de produto e política permitida nunca bloqueiam.
- **A3** ganhou aceite possível com LLM e o pulo da shortlist subiu para a
  semana 1.
- **A6** trocou o teto de font-size por papel pela régua de line-height; o teto
  passa a ser relativo ao que a variante declara.
- **A7** ganhou uma conferência prévia: o código JÁ entrega briefing e
  top_products ao QA; o vazio medido é dado da loja.
- Toda coluna nova degrada com erro NOMEADO (regra da casa: migration é
  aplicada à mão e escorrega).
- As metas foram separadas entre o que o código entrega e o que depende da
  biblioteca.
- A semana 1 foi reordenada.

---

## Estado de partida medido (para comparar depois)

| Métrica | Hoje | Meta ao fim do plano | Quem entrega |
|---|---|---|---|
| Inversões decisão × entregue por e-mail | 3 de 6 posições | 0 | código detecta e para (A1, A2); biblioteca elimina (A10, B3) |
| Custo por e-mail | US$ 8,20 | ≤ US$ 3,50 | código (A3, A8) |
| Tempo por e-mail | 28 min | ≤ 12 min | código (A3, A8); a retentativa do n8n em A5 conta no tempo |
| Tokens de entrada do Curador | 150k | ≤ 30k | código (A3) |
| Ponto onde o batch morre com estratégia violada | QA (fim) | Curador (antes da imagem) | código (A1, A2) |
| E-mails enviáveis sem edição, em 5 consecutivos | 0 | 5 | **biblioteca** (A10 + Trilha B); o código só faz a falha ser cedo e nomeada |

A última linha é a que decide o cronograma. A1 a A9 fazem o batch falhar cedo,
alto e com nome. Quem faz falhar raro é o cadastro.

---

## TRILHA A — o que já existe e vamos melhorar

### A1. Contrato de decisão vinculante

**Hoje.** Seletor e Estruturador já emitem tudo o que um contrato precisa:
alvo (objeção, incentivo, insumos_permitidos, proibido_neste_toque),
`estrutura[].requisitos` (cupom, cta, preco, n_itens, campos, exige),
descartes, fio_narrativo. O que não existe é consumo obrigatório: o Curador usa
parte (eliminação por contrato), o resgate ignora descartes, o Blueprint cola
papel + copy_guidance num purpose só, o Subject não lê nada disso, o QA recebe
briefing vazio (ver A7 sobre a causa).

**O que muda.** Um objeto único, montado uma vez depois do Estruturador,
persistido, servido a todo nó a jusante, e validado na saída de cada nó. Nasce
em `shadow` (grava violações, não bloqueia) e vira `on` por kill-switch.

**Como.**

1. `src/lib/agents/shared/decisao-do-email.ts` — tipo `DecisaoDoEmail`:

   ```ts
   {
     versao: 1,
     alvo: { objecao_id, tipo_de_risco, aliviador, profundidade, dimensao },
     incentivo: { existe: boolean, codigo, valor, validade, condicoes,
                  origem: "outline" | "override_loja" },   // ver A9
     insumos_permitidos: string[],
     proibido: string[],            // deduplicado, uma língua
     posicoes: [{
       block_index, section, dispositivo,          // dispositivo entra em B3
       papel, requisitos: RequisitosDuros, exige: string[], imagem: string | null
     }],
     descartes: [{ section, dispositivo, motivo }],
     fio_narrativo
   }
   ```

   Função pura `montarDecisao(alvoDoSeletor, saidaDoEstruturador, incentivo)`.
   `incentivo.existe` sai sempre booleano (A9); `proibido` passa por dedupe
   entre idiomas (o Seletor emitiu 28 itens com pares PT/EN da mesma regra; o
   dedupe por chave de `texto.ts` não pega o par cruzado).

2. Persistência: coluna `decisao jsonb` em `store_email_blueprints`
   (migration). Uma leitura por nó, nunca remontar. **Degradação nomeada**:
   coluna ausente (42703/PGRST204) → retry do write sem ela + `log.warn`
   `decisao.coluna_ausente` + a run grava `_contrato: { modo: "sem_coluna" }`.
   Sem isso a feature fica morta em silêncio até alguém aplicar a migration.

3. Kill-switch: `email_generation_settings.contrato_mode` (`off` | `shadow` |
   `on`), padrão `shadow`. Mesmo desenho de `seletor_mode`, `color_plano_mode`
   e `qa_mode`. Falha de leitura cai em `shadow`.

4. Validadores puros, um arquivo cada, em `src/lib/agents/shared/validadores/`:

   - `validarEscolhas(decisao, escolhas, contratosDasVariantes)` → viola se
     variante escolhida obriga cupom com `incentivo.existe:false`, se `n_itens`
     fora do intervalo, se `dispositivo ∈ descartes`, se variante repetida
     (`podeRepetir` já devolve `false` para tudo desde 10/09).
   - `validarResgate(decisao, resgate)` → mesma régua; `descartes` é veto
     absoluto.
   - `validarBlueprint(decisao, blueprint)` → campo de cupom/percentual/prazo
     em bloco cujo requisito nega → `omitir`; purpose não pode conter
     instrução de oferta quando `incentivo.existe:false`.
   - `validarCopy(decisao, callback)` → claims de OFERTA contra `proibido` e
     `incentivo`; campo omitido preenchido → viola; `max_len` estourado →
     viola.
   - `validarHtmlFinal(decisao, html)` → texto visível contra os mesmos claims
     + itens do lint da Trilha B.

   Saída padronizada: `{ ok, violacoes: [{ tipo, severidade, block_index,
   campo, evidencia, esperado }] }`.

5. **Régua dos claims (o que a regex pega, e o que ela NÃO pode pegar).**
   Bloqueia só claim de OFERTA:

   - percentual **adjacente a oferta**: `\d+\s?%` seguido/precedido de
     `off|desconto|discount|de desconto|rabatt|dto` numa janela de 3 palavras;
   - código: `code|cupom|coupon|use o código|use code` + token maiúsculo;
   - grátis como oferta: `free shipping|frete grátis|frete gratis|envío gratis`
     quando `insumos_permitidos` não traz frete;
   - prazo de oferta: `\d+\s?(days|dias|horas|hours)` junto de
     `ends|termina|expira|only|só até`;
   - preço quando `preco:false`: moeda + número.

   **Nunca bloqueia**: `100% cotton`, `100% algodão`, `30 dias para trocar`
   quando a troca está em `insumos_permitidos`, número de reviews, tamanho,
   peso. Cada regex tem teste com o par (claim de oferta reprova / atributo
   passa). Um falso positivo em enforce mata um batch inteiro, e é por isso
   que o modo nasce em `shadow`: uma semana lendo `_contrato.violacoes` de
   batches reais antes de ligar.

6. Cada chain chama o validador correspondente antes de persistir. Em `on`:
   violação `high` → `status: error` na run com `error_message` tipado
   (`contrato: <tipo>`), retry 1× com as violações no prompt (não "tente de
   novo"), 2ª falha → e-mail `failed: contrato_<no>` e o batch para. Em
   `shadow`: só grava. Violação `medium` nunca para: vai ao QA como issue.

7. Telemetria: `parsed_output._contrato = { modo, violacoes, retry }` em toda
   run que valida.

8. Testes: fixtures das 3 inversões do batch 6249aef2 (hero com SHOP 10% OFF;
   body-4 no lugar de garantias; products-7 sem preço). Cada validador tem que
   reprová-las. **O diagnóstico do batch 6249aef2 precisa entrar no repo**
   (`docs/email-generation/`), como o de 09/09: as fixtures saem dele.

**Quando.** Semana 1 (dias 3 a 5) em `shadow`; `on` na semana 2 depois de ler
os falsos positivos.

**Aceite.** As 3 fixtures reprovam; nenhum atributo de produto do corpus de
teste reprova; uma geração nova da Hero Boxers com o mesmo catálogo, em `on`,
para no Curador ou no callback, não no QA.

**Depende de.** A9 (meio dia, entra antes).

---

### A2. Resgate de posição restrito

**Hoje.** `resgate-de-posicao.ts` escolhe a "menos incompatível" por custo
numérico (cupom 100, cta 5, n_itens 40/10, preço 3). Não conhece descartes
nem dispositivo. Foi assim que a comparação vetada (body-4) entrou na posição
3 e a products-7 sem preço na posição 5. O docstring assume "preço entra pela
copy" e ainda diz que "fora de hero e products repetir é composição legítima"
enquanto `podeRepetir` devolve `false` para tudo.

**O que muda.** Resgate só entre variantes do mesmo dispositivo; `descartes` é
veto; preço exigido e ausente deixa de ser barato. Sem candidata → posição
cai, batch para no Curador com lacuna nomeada.

**Como.**

1. Parte 1 (semana 2, sem depender de B3): `custoDeIncompatibilidade` recebe
   `descartes` e devolve `Infinity` se a variante realiza um dispositivo
   descartado. Por enquanto o mapeamento é por tags/nome da variante
   (`comparativ*`, `gift*`, data comemorativa) e vai DECLARADO na telemetria
   como `dispositivo_por_nome: true`, porque casar por nome é o modo de falha
   que este repo já pagou com apelidos. B3 substitui pelo campo tipado.
   `preco:true && !tem_preco` sobe de 3 para 40 (é anatomia, não redação: a
   copy não criou o preço no batch medido). Corrigir o docstring da repetição.
2. Parte 2 (semana 3, após B3): `menosIncompativel` filtra
   `candidatas.filter(c => c.dispositivo === requisito.dispositivo)` antes de
   pontuar.
3. Sem candidata: `assembleDocument` recebe `posicoesSemVariante`; se a seção
   é hero ou se mais de 1 posição cai, o batch termina em
   `failed: lacuna_biblioteca` com `slot_map` mostrando a lacuna. Uma posição
   não-hero caindo continua permitido, registrado como aviso `high` no QA.
4. Lacuna vira proposta imediata em `vault_propostas` (hoje só após 3
   ocorrências em 14 dias no cron `vault-lacunas-propostas`): limiar 1 quando
   o motivo é `sem_dispositivo`.
5. Prompt do Curador (A3) passa a dizer a verdade: "posição sem escolha some ou
   derruba o batch; não existe template global".

**Quando.** Parte 1 semana 2 (dia 1); parte 2 semana 3.

**Aceite.** Reproduzir o batch: posição 3 não recebe body-4; posição 5 não
recebe products-7; batch para com `lacuna_biblioteca: body_garantias,
products_grade_preco`.

---

### A3. Curador: prompt em sincronia com o código + dieta de contexto

**Hoje.** `curador-shadow.ts` (66 KB) afirma (a) na linha 356 "REPETIR A MESMA
VARIANTE EM DUAS POSIÇÕES É PERMITIDO" enquanto `repeticao.ts` proíbe em toda
seção desde 10/09; (b) na linha 96 "a seção DESAPARECE, não cai no template
global" e na linha 350 "o sistema cai no template global"; (c) carrega
histórico ("eixo momento APOSENTADO (07/09)"). Contexto: 101k chars na 1ª
chamada + 12 notas abertas na 2ª = 150k tokens, US$ 2,82, 376 s.

**O que muda.** Prompt vira spec sem histórico, com teste de coerência contra
os guards. Escolha final vê só o que decide. A shortlist só chama LLM quando
há o que rankear.

**Como.**

1. Semana 1 (dia 2): editar `DEFAULT_CURADOR_SHORTLIST_SYSTEM` e o prompt de
   escolha: remover o parágrafo "REPETIR É PERMITIDO", trocar o passo 4 por
   "posição sem candidata cai da peça e o batch pode parar; declare a lacuna",
   apagar os avisos de "APOSENTADO/SUPERADO" (o catálogo já não traz momento).
   Confirmar que `email_agent_configs.assembler_chooser` continua com
   `system_prompt` vazio (o in-code é o vivo).
2. Semana 1 (dia 2, junto): **shortlist pula a chamada LLM quando a eliminação
   por código deixa ≤ 3 candidatas na seção**. No batch medido: hero 3, body 2,
   reviews 3, products 1, footer 3. A shortlist inteira era dispensável. É
   puro, barato e corta metade do custo do Curador hoje; não precisa esperar a
   dieta. Run `assembler_chooser` grava `shortlist_pulada: true` por seção.
3. Semana 3: mover as regras vivas para `docs/email-generation/curador.rules.md`
   (ou `email_vault_docs` kind=protocolo, que já existe e já é servido); o
   prompt in-code passa a ser montado desse texto. Teste
   `curador-prompt.coerencia.test.ts`: asserções sobre frases-chave
   (`podeRepetir` false ↔ prompt não diz "permitido"; `assembleDocument` sem
   fallback por bloco ↔ prompt não diz "template global").
4. Dieta (semana 3), na chamada de escolha:
   - Entra: `decisao.posicoes[i]` (papel, requisitos, exige), contrato resumido
     + nota de cada finalista (≤ 3 por posição), fio, aprendizados filtrados
     por `section` (hoje entram 14,5k chars de todos), 3 escolhas anteriores
     da memória (não 2k chars).
   - Sai: "Índice de pastas do Obsidian" (11,3k, zero uso), "Lacunas da
     biblioteca" completas (15,2k; só as da seção, máximo 3), "Perfil da
     marca" completo (9,9k; posicionamento + tom + vocabulário, ~1k), índice
     compacto (13,1k; só serve à shortlist).
   - Medir em `consumo_por_chamada` antes/depois.

**Quando.** Itens 1 e 2 semana 1; itens 3 e 4 semana 3.

**Aceite.** Teste de coerência passa; `tokens_input` da escolha ≤ 30k; custo do
Curador ≤ US$ 0,60; duração ≤ 90 s. **Para a dieta**: em 5 runs por loja nas 3
lojas de teste, a escolha rank-1 por posição coincide com a do prompt cheio
em ≥ 80% das posições, e a `justificativa` cita a mesma regra do protocolo
nas divergentes. "Ranking igual" não é aceite possível com LLM em
temperatura > 0.

---

### A4. Subject e messaging depois do Estruturador

**Hoje.** `generateSubjectHint` (`blueprint-generator.service.ts`) lê só
`outline_objective`/`outline_guidance` + `copy_guidance_resumo` das variantes
e escreveu "abra entregando o código de boas-vindas". Roda em Fable,
`max_tokens` 4000 no default in-code (o banco pode diferir), temp 0,7, para
uma linha de 55 chars.

**O que muda.** Roda depois de `montarDecisao`, lê a decisão, sai validado.

**Como.**

1. Input: `fio_narrativo`, alvo (objeção em uma linha, `insumos_permitidos`,
   `proibido` deduplicado), incentivo resolvido (A9), tom/vocabulário da loja,
   produto herói. Remover `outline_*` e `copy_guidance_resumo` do template
   (são os que carregam "entregue o código").
2. Output passa por `validarCopy` (A1). Subject e messaging com claim proibido
   → retry 1× com a violação, depois fallback determinístico (subject =
   headline da hero do Estruturador truncada; messaging = fio).
3. Modelo: Sonnet ou Haiku, `max_tokens` 600, temp 0,5. Atualizar
   `email_agent_configs.subject` (ver A8 sobre a barra no slug).
4. Origem no `prompt_segments`: `upstream` (Estruturador) em vez de
   `curadoria` (outline).

**Quando.** Semana 2 (dia 2).

**Aceite.** Hero Boxers: subject e messaging sem oferta; custo do nó ≤
US$ 0,01.

---

### A5. Payload do n8n com uma voz + callback que valida

**Hoje.** O n8n recebe `decisao.incentivo` (null), `alvo.proibido`,
`estrutura_geral` (outline prefixado), `blueprint.messaging` ("entregue o
código") e `blocks[].fields[].example` ("SHOP 10% OFF"). Obedece ao example.
`copy_fit` inventou `column_b_item_6` (motivo `ausente`) depois de
`copy_dispatch` tê-lo omitido, e cortou `column_a_item_3` no meio da frase (o
`apararNoLimite` corta na última PALAVRA, não na fronteira de frase). O
callback audita desvios "sem rejeitar".

**O que muda.** Uma instrução por campo, validação no retorno, um reenvio com
violação nomeada.

**Como.**

1. `email-copy-webhook.service.ts`, montagem do payload:
   - `fields[].example`: se casar com a régua de claims de A1 e o requisito da
     posição negar (cupom/preco/prazo), substituir por `null` e preencher
     `fields[].directive` com o `exige` da posição. Manter `example` quando é
     só forma ("Name. 1", "Verified Buyer 1").
   - `blueprint.messaging` e `subject_hint` vêm de A4.
   - `estrutura_geral`: enviar `null` quando `decisao` existe (o Estruturador
     já absorveu o outline). Manter só em `text_only`.
   - `decisao.incentivo.existe`: booleano, com `codigo` já traduzido (A9).
   - `blocks[].campos_omitidos: string[]` explícito por bloco (hoje só vai à
     telemetria).
   - `blocks[].requisitos` e `decisao.proibido` no nível do e-mail, uma vez,
     deduplicados.
   - `copy_prompt_version` obrigatório no callback: o n8n devolve o valor de
     uma variável do workflow; callback sem ele grava aviso `high`.
2. Callback `/api/webhooks/n8n/email-copy`:
   - roda `validarCopy` antes de gravar. Em `contrato_mode: on`, violação
     `high` em campo obrigatório → não grava `copy_ready`; grava run `copy`
     com `status: error`, `error_message: contrato:<tipo>`, e reenvia ao n8n
     o mesmo payload + `violacoes[]` (campo, motivo, esperado). Uma vez.
     Segunda violação → `failed: copy_contrato`. Em `shadow` só grava.
   - campo omitido preenchido → descartado, aviso.
   - reviews: o n8n devolve, por depoimento usado, `origem: { fonte: "banco",
     id }`; o callback grava em `content.items[].origem` e o QA (A7) aceita
     depoimento com origem no banco sem marcar "não coberto". No payload de
     ida, `prova.reviews_disponiveis: N` para o Seletor não rebaixar a
     profundidade da prova por "não conferido".
3. `copy_fit`:
   - remover a via `ausente` (nunca cria campo);
   - `aparado_por_codigo` só corta em fronteira de frase (`. ! ?`) ou, se não
     houver, devolve para a via LLM com instrução "reescreva em ≤ N chars,
     frase completa"; nunca corta no meio de palavra/frase;
   - `comparativa_mantida` deixa de existir como recusa: item comparativo
     acima do limite é reescrito, não mantido estourando;
   - travessão vira vírgula/dois-pontos por código antes do LLM (já é assim
     desde 11/09; manter).
4. n8n (Bruno edita e exporta): adicionar ao prompt a leitura de `directive`,
   `campos_omitidos`, `decisao.proibido`, `decisao.incentivo`; variável de
   workflow `COPY_PROMPT_VERSION` (semver manual) ecoada no callback. Exportar
   o JSON para `docs/n8n/email-copy.workflow.json` (a pasta já existe, com
   dois markdowns) a cada mudança, no mesmo commit da mudança de payload; um
   teste lê o JSON exportado, extrai o system prompt do nó de copy e confere
   que menciona os campos novos. Callback com `copy_prompt_version` diferente
   do JSON versionado grava aviso `high`.

**Quando.** Semana 2 (dias 3 a 5 admin) e semana 3 (dia 1 n8n).

**Aceite.** Hero Boxers: `cta_label` da hero sem percentual; comparativo sem
frase cortada; nenhum campo omitido preenchido; run `copy` mostra
`copy_prompt_version`. O tempo por e-mail com UMA retentativa do n8n fica
dentro dos 12 min da meta (medir o tempo do n8n; se não couber, a meta é
revista, não o reenvio).

---

### A6. Cadeia de formatação: fail-closed com fallback correto

**Hoje.** `color_format` inseriu dois botões porque o inventário `extrairCtas`
(heurística: `<a>` com `display:block` + `padding`, casado à faixa por offset)
não viu os CTAs de body-3 e products-7; o segundo saiu branco sobre branco
porque a cor foi decidida pela faixa que o agente imaginou, não pelo `<td>`
real. Recebe a Pesquisa & Diagnóstico inteira (`{{pesquisa_full_text}}`,
15,5k chars). Se falha 2×, mantém o HTML anterior (fail-open declarado na
linha 19 do chain). `typography` só mexe em peso/caixa/tracking; título de
50px com line-height 43px passa.

**O que muda.** Inventário por contrato, botão herda o contêiner real,
fallback determinístico, tipografia com régua de LINE-HEIGHT.

**Como.**

1. `color_format`:
   - inventário de CTAs passa a vir do contrato: `output_schema` da variante
     (campos `cta`/`*_cta_label`) + região `cfy:block`; a heurística
     `extrairCtas` vira verificação secundária, nunca fonte da op `adicionar`.
     Investigar por que a heurística falhou (hipótese: marcadores `cfy:block`
     ausentes ou `locateBlockRegions` com índices errados) e registrar em
     teste.
   - op `adicionar` só quando o contrato diz que o bloco não tem CTA e o
     requisito da posição pede `cta:true`.
   - cor do botão inserido: calculada por código a partir do
     `bgcolor`/`background` do `<td>` ancestral mais próximo, com AA
     (`color-contrast.ts` já existe); o agente decide "inserir ou não", o
     código decide a cor.
   - input: remover `pesquisa_full_text`; manter paleta com papéis, tons,
     fontes.
   - fallback: 2ª falha → `plano-de-cor.ts` + `color-roles.ts` aplicam a
     paleta por código (já existem como módulos puros) em vez de manter o
     HTML anterior.
2. `typography`:
   - regra determinística pós-agente: `line-height ≥ 1,1 × font-size` em todo
     `<td>`/`<div>` de texto. Aplicar por código, telemetria
     `line_height_corrigidos`. Era isso, e só isso, que deixava o título de
     50px com 43px passar.
   - **Sem teto absoluto de font-size por papel.** A peça medida tem título
     de 50px e corpo de 24px por desenho da variante; um teto de 40px
     reescreveria a biblioteca em todo e-mail. Se houver teto, é RELATIVO ao
     que a variante declara (por exemplo, o agente não pode aumentar um
     tamanho além de 1,25× o original), nunca um número fixo.
   - agente continua decidindo peso/caixa/tracking/segunda fonte.
3. `text_format` e `image_format` já são determinísticos; sem mudança.
4. `hero_section` (LLM, Sonnet): guards `heroCopyPreserved` e
   `heroTextoInventado` já existem; adicionar diff de texto visível
   antes/depois com rejeição se a copy do merge sumiu.

**Quando.** Semana 2 (dias 3 a 5).

**Aceite.** Reprocessar o HTML do batch: nenhum botão inserido (os blocos
tinham CTA); nenhum botão com contraste < 4,5:1 contra o contêiner real;
nenhum texto com line-height < font-size; nenhum font-size da biblioteca
reduzido.

---

### A7. QA com o mesmo contexto que todo mundo

**Hoje.** `qa_mode: enforce` (ligado em 11/09). Pegou tudo, mas no fim, depois de
US$ 8,20. Na run medida recebeu `briefing = {}` e `top_products = []` e por
isso marcou como "não coberto" o que o Seletor tinha verificado. **Conferido
no código em 13/09: o runner JÁ passa `ctx.briefing` (de `store_briefings`) e
`ctx.topProducts` (de `store_top_products`) ao QA.** O vazio é dado da loja
(sem linha de briefing, sem top products gravados), não desenho do código.
Prompt de 50k chars.

**O que muda.** Antes de tudo, conferir a causa do vazio. Depois: recebe
`DecisaoDoEmail` + políticas capturadas; checks determinísticos crescem; LLM
só julga o que código não decide.

**Como.**

0. Conferência prévia (meio dia): `select` em `store_briefings` e
   `store_top_products` da Hero Boxers. Se vazio, é lacuna de dado e entra em
   A10 como item de cadastro; se cheio e chegou vazio, é bug de leitura e
   entra aqui como correção.
1. Input do QA: `decisao` (insumos, proibido, incentivo, requisitos por
   posição), políticas capturadas (A9.7), `store_top_products`, origem dos
   reviews (A5), `slot_map` com dispositivo escolhido por posição.
2. Checks determinísticos novos (`qa-schema-checks.ts` / `content-checks.ts`):
   claim de oferta fora de `insumos_permitidos` pela régua de A1;
   `validarHtmlFinal`; itens do lint da Trilha B; **cupom citado na peça
   existe na plataforma** (A9.6). Todos `high` quando a régua é envio.
3. LLM (Sonnet, não Fable): recebe só texto visível por bloco + decisão +
   lista de checks já feitos; julga adequação editorial e claims não
   regexáveis. `max_tokens` 2000.
4. `qa_issues` ganha campo `no_responsavel`
   (`seletor|estruturador|curador|copy|imagem|formatacao|biblioteca|loja`),
   que alimenta o painel B7.

**Quando.** Item 0 semana 1; determinístico semana 2; LLM semana 3.

**Aceite.** Em geração com decisão coerente, QA não reporta "claim não
coberto" para item presente em `insumos_permitidos`; custo do QA ≤ US$ 0,05.

---

### A8. Modelo por nó

**Hoje.** Medido no banco em 13/09: 20 dos 24 agentes ativos rodam em
`anthropic/claude-fable-latest`, inclusive subject, typography, color_format,
image_format, copy_fit, qa. Reasoning consome teto. **A tabela é do banco, não
do repo**: a fonte é `email_agent_configs` e a receita de troca é
`supabase/migrations/TROCAR_modelo_agentes.sql`.

**O que muda.** Fable onde há decisão editorial; Sonnet nas transformações;
Haiku no trivial.

| Nó | Modelo | max_tokens |
|---|---|---|
| seletor, estruturador, assembler_chooser (escolha) | Fable | 24k / 32k / 16k |
| subject, copy_fit, typography, color_format, image_format, qa (LLM), hero_section | Sonnet 4.6 | 600 / 8k / 4k / 8k / 4k / 2k / 8k |
| catalogador | Sonnet | 8k |
| image | manter gpt-5.4-image-2, com fallback gemini já existente | — |

**Como.** SQL em `email_agent_configs` com `is_active = true` no WHERE. Três
armadilhas da receita: a barra no slug escolhe o provedor E a conta cobrada
(`anthropic/claude-sonnet-4.6` vai pelo OpenRouter, `claude-sonnet-4-6` pelo
SDK da Anthropic); `max_tokens` NÃO acompanha a troca e tem de ir na mesma
statement; `resolverTetoDoCurador` lê `max(8192, config)` com env por cima.
Teste de regressão de saída nos 3 e-mails de referência (aceite de A3).

**Quando.** Semana 3, depois da dieta de A3 (para não misturar o efeito da
dieta com o do modelo).

**Aceite.** Custo por e-mail ≤ US$ 3,50 com output equivalente.

---

### A9. Incentivo: o outline decide, a tradução é dado, a existência é check

**Hoje.** O incentivo É fixo por flow/e-mail e JÁ está catalogado:
`email_outline_templates.coupon_code`, editado em `/admin/outlines`
(`outlines-workspace.tsx`). Estado do banco em 13/09, 27 dos 34 toques com
código:

| flow | toques com código | código |
|---|---|---|
| welcome | 1 a 8 | BEMVINDO10 |
| abandoned_cart | 1, 3, 4, 5 / 6, 7 | DESCONTO10 / DESCONTO12 (2 e 8 sem) |
| browse_abandonment | 1, 2, 3 / 4, 5 | EXCLUSIVO12 / EXCLUSIVO14 |
| upsell | 1, 2, 3 | ESPECIAL (4 sem) |
| win_back | 2 | VOLTEI15 (1 e 3 sem) |
| site_abandoned | 1 | VOLTEI12 |
| shipping_stages | nenhum | — |

Override por loja: bloco `coupon` de `email_blocks` ("respeita código já
preenchido, manual ou por loja"). A migration 20260922 diz que "a variação
por idioma/loja é feita depois, por loja, no bloco coupon". Isto é edição
MANUAL, e não existe função que traduza BEMVINDO10 para WELCOME10. A mesma
migration DROPOU uma coluna `coupon_codes` jsonb que tinha nascido antes.

A mudança de 09/09 pôs o Catalogador por cima disso: `incentivoDoCatalogo`
→ `couponCodeEfetivo` zera o código quando o LLM grava `null`, e
`condicionarOutline` prefixa "não prometa". Foi assim que a Hero Boxers virou
"sem incentivo" e o e-mail saiu contraditório (hero com 10% OFF, estrutura
sem cupom). Consumidores hoje: `email-copy-webhook.service.ts`,
`seletor-regras.ts`, `phase2-runner.service.ts`, `outline-condicional.ts`.

**O que muda.** O flow decide se o toque tem incentivo; o código vem do
outline TRADUZIDO para o idioma da loja, com override por loja; nenhum LLM
opina sobre existência; a existência do código na plataforma vira check.

**Como.**

1. **Tradução como dado.** "Tradução literal" é decisão sua, não regra que um
   programa deduza (BEMVINDO10 → WELCOME10 é mapeamento humano). Coluna
   `coupon_codes jsonb` em `email_outline_templates`, um código por idioma
   (`{"pt-BR":"BEMVINDO10","en":"WELCOME10","es":"BIENVENIDO10",...}`), com
   `coupon_code` (texto) mantido como fallback pt-BR. Migration + campo na
   tela `/admin/outlines` (uma linha por idioma que a loja pode ter; a lista
   vem de `resolveStoreLanguage`). Degradação nomeada: coluna ausente → usa
   `coupon_code` e loga `incentivo.sem_traducao`.
2. **Derivação**, em `incentivo.ts`: `incentivoDoOutline(outline, idioma,
   overrideDaLoja)` →
   `existe = !!(outline.coupon_code || outline.coupon_codes)`;
   `codigo = overrideDaLoja ?? coupon_codes[idioma] ?? coupon_code`;
   `origem = override_loja | outline_traduzido | outline_pt`. Toque com
   `existe:true` e sem tradução para o idioma da loja usa o pt-BR e marca
   `traducao_faltante: true` (vai ao QA como `medium`: código em português
   numa loja inglesa é o sintoma da Hero Boxers).
   `incentivoDoCatalogo` é removido. `objection_catalog.incentivo` fica só
   como nota do Catalogador na UI (sugestão de que há anúncio com oferta),
   sem leitura por agente.
3. Os quatro consumidores passam a receber a decisão derivada.
   `condicionarOutline` e `couponCodeEfetivo` perdem o ramo `null` (ele deixa
   de existir); o prefixo "SEM INCENTIVO" só entra quando o outline do toque
   não tem código.
4. Seletor: `trabalhos_fixos: entrega_de_incentivo` acompanha `existe`
   derivado; `proibido` deixa de listar "no incentive claim" quando
   `existe:true`.
5. Override por loja continua onde está (bloco `coupon`). Se quiser um lugar
   único por loja em vez de por bloco, é uma coluna `coupon_code_override` em
   `client_stores`, opcional.
6. **O código existe na plataforma?** Nada no repo cria cupom no Shopify nem
   no Omnisend, e traduzido não quer dizer cadastrado: e-mail prometendo
   WELCOME10 numa loja sem esse desconto é pior que o código em português.
   Não vira bloqueio (ninguém preenche ficha). Vira check do QA (A7.2): loja
   com token Shopify → consulta `discountCodes` pelo código e marca `high` se
   não existir; sem token → `medium` "cupom não conferido na plataforma".
   Custo zero de LLM.
7. Políticas de troca e frete (único fato que hoje não existe em lugar nenhum
   e que podou a faixa de garantias da Hero Boxers): job pequeno que lê
   `https://<loja>/policies/refund-policy` e `/policies/shipping-policy`
   (URL fixa em toda loja Shopify, sem token), extrai janela de dias,
   "grátis", prazo por regex; quando a página existe e o número não é
   extraível, uma chamada Sonnet cita o trecho literal com URL. Grava em
   `client_stores.politicas jsonb { troca, frete, capturado_em, url }`
   (degradação nomeada). Entra em `insumos_permitidos` do Seletor com a URL.
   Roda no fim do `pesquisa-completa`.

**Quando.** Semana 1, dia 1 (itens 2 a 5: é a correção de uma decisão errada,
meio dia; até a coluna de tradução existir, `codigo` sai do `coupon_code` com
`traducao_faltante`); item 1 dia 2; item 6 semana 2; item 7 semana 2.

**Aceite.** Hero Boxers: `decisao.incentivo.existe:true` com o código inglês
do welcome 1; Estruturador monta com cupom; QA não reporta
`oferta_sem_incentivo` nem `traducao_faltante`. Nenhum nó lê
`objection_catalog.incentivo`.

---

### A10. Biblioteca existente: higiene

**Hoje.** 37 ativas; 5 no banco sem schema (body-6, 7, 8, 9 + 1) invisíveis ao
Curador; duplicatas (reviews-3a/3b, hero-8/10); footer-1 com 6 "Link Here"
sem campo; briefs com hex de outra marca ("círculo chapado em #2A4439 (cor
primária)"); 16 variantes sem `objecao`; nomes por campanha de origem.

**O que muda.** Cadastro completo e coerente antes de entrar anatomia nova.
**É esta trilha que entrega a última linha da tabela de metas.**

**Como** (Bruno, na tela "Editar variante"; lista exata por variante sob
pedido).

1. Schema para body-6, 7, 8, 9 (campos enumerados, exemplo literal, `max_len`,
   slots de imagem com proporção única).
2. Desativar reviews-3b e hero-8 (ou fundir).
3. footer-1: 6 campos `nav_label_1..6` + 6 `nav_url_1..6`, com
   `applyStructuralFills` lendo `nav_url_*` da loja.
4. Todos os `photo_direction` e `image_brief`: trocar hex por papel ("cor
   principal da marca", "fundo"); o builder de imagem já resolve papel → hex.
5. `objecao`/`aliviador` preenchidos nas 16 sem eixo (vocabulário fechado do
   vault).
6. `rendered_html` para as 7 que não têm (2 heros, 1 body, 3 reviews, 2
   products): é a referência-ouro da hero chain e do lint.
7. Hero com hrefs de exemplo (`URL_CTA_PRIMARIO` e afins) e copy de página de
   suporte: com `qa_mode: enforce` toda peça que a usar reprova em
   `link_sem_endereco`. Primeiro item da lista.
8. Se A7.0 mostrar que a Hero Boxers está sem briefing/top products: cadastro
   aqui.

**Quando.** Semanas 1 e 2, em paralelo ao código.

**Aceite.** Lacunas de cadastro do vault zeradas; 41 variantes ativas com
schema e `rendered_html`; nenhuma variante ativa com href de exemplo.

---

## Cronograma consolidado

| Semana | Código (Matheus + Claude Code) | Biblioteca / n8n (Bruno) |
|---|---|---|
| 1 | d1: A9.2–5 (incentivo do outline). d2: A3.1 (prompt coerente) + A3.2 (pulo da shortlist) + A9.1 (coluna de tradução). d3–5: A1 em `shadow` (tipo, coluna, validadores, fixtures). Meio dia: A7.0. | A10.7 (hero com href de exemplo), A10.1 (schemas), traduções dos cupons na tela |
| 2 | d1: A2 parte 1. d2: A4. d3–5: A5 (admin) + A6 + A7 determinístico + A9.6 e A9.7. Ler `_contrato.violacoes` da semana 1 e ligar `contrato_mode: on`. | A10.2–6; prompt do n8n (A5.4) |
| 3 | A3.3–4 (dieta), A2 parte 2 (após B3), A7 LLM, A8 (modelos). | JSON do n8n versionado; B3 (anatomias) |

---

## Pendências que este documento não cobre

- **Trilha B** (B2 lint, B3 dispositivo tipado, B7 painel por responsável) não
  está aqui. A2 parte 2, A6 e A7 dependem dela.
- O diagnóstico do batch 6249aef2 está fora do repo. Entra em
  `docs/email-generation/` antes de A1 (as fixtures saem dele).
- A tabela de modelos de A8 é afirmação sobre o banco em 13/09 e envelhece;
  conferir com `TROCAR_modelo_agentes.sql` antes de trocar.
