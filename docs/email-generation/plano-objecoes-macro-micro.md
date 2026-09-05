# Plano — Objeções: catalogação macro (Catalogador) e seleção micro (Seletor)

*04/09/2026 · spec de referência: "Objeções: catalogação macro e seleção
micro — v2" + ajustes do Estruturador e do Curador definidos pelo owner na
mesma data. Levantamento com caminho:linha no código e contagens do banco de
produção (somente leitura) em 04/09.*

> **Status (04/09, fim do dia):** fases 0–4 IMPLEMENTADAS na branch
> `claude/resume-previous-session-UvATK` (commits `32beb71`, `41594b3`,
> `e3c4a6f`, `7f66029` + fase 4). Migration `20261116` APLICADA em produção.
> Decisões do owner: catálogo em COLUNA (`client_stores.objection_catalog`),
> Seletor email por email em ordem, tradução de vocabulário em código com a
> nota do vault vencendo. `seletor_mode='off'` — ligar `shadow` é o próximo
> gesto (§4, fase 5). Pendências humanas: frontmatter das 8 intenções no
> Obsidian (`intencoes-welcome-frontmatter.md`), ordem de ranking no
> `_protocolo-de-selecao`, backfill (`POST /api/admin/objection-catalogs/batch`).
>
> **Ajustes pós-fase 4 (04/09, PR 6):** Seletor entrou ANTES do Estruturador
> nas telas (`TEST_BASE_AGENT_KEYS`, `PIPELINE_AGENT_ORDER` e nó próprio no
> mapa do Estúdio — `STUDIO_NODES`, com os nós seguintes deslocados 256px;
> `catalogador` também entrou na ordem dos logs). A run do Catalogador é de
> LOJA e não cabe na listagem por email do Estúdio: o painel "Catálogo de
> argumento" da aba Pesquisa ganhou "ver run do Catalogador" →
> `/admin/agents/runs?run=<id>` (o deep-link abre o `RunDetailDrawer`; o id
> vem do POST de regeneração ou do `GET .../regenerate-objections`, que
> devolve a última run). O Catalogador passou a rodar TAMBÉM no
> `pesquisa-completa` com `regeneration: true` (antes o `return` da regeneração
> vinha primeiro e a projeção ficava sem tipagem depois do callback `icp`).
>
> **PR 7 (05/09):** decisão do owner — sem botão de backfill em massa; o
> Catalogador segue sem chave (vivo em toda pesquisa nova/regerada) e o
> backfill é POR LOJA pela tela: aba Contexto → bloco "Catálogo de argumento
> ainda não gerado" (`ObjectionCatalogEmpty`) com "Catalogar objeções"
> (mesma rota v2; desabilitado sem pesquisa, régua `hasContext`). O botão
> do bloco de objeções passou a se chamar "Catalogar objeções"/"Recatalogar".
> `seletor_mode` continua `off` — ligar é gesto nas Configurações.

---

## 0. Resumo

Hoje a objeção é **dado presente e não usado**: `client_stores.icp_objections`
existe em 35 lojas e nenhum agente a lê. O Curador recebe `icp_frictions`
(dor) no bloco `<objecoes>`; o Estruturador infere a "objeção dominante" de
prosa; a copy recebe `icp.frictions` e nada de objeção. O plano cria dois
agentes (Catalogador, por loja, offline; Seletor, por email, runtime) e um
catálogo fixo de intenções tipadas, e liga o alvo declarado em Estruturador →
Curador → copy. A ordem de implantação segue a spec (§6), com uma correção
importante descoberta no mapeamento: **os vocabulários do vault
(`objecao` de 11 valores) e da spec (`tipo_de_risco` × `aliviador`) não
conversam** — sem uma ponte, o eixo novo do Curador não discrimina nada.

---

## 1. Mapa do que existe (04/09)

### 1.1 Objeções: onde nascem, onde moram, quem lê

| | Onde | Detalhe |
|---|---|---|
| Coluna | `client_stores.icp_objections jsonb` (migration `20260714`) | `[{objection, treatment}]`; comentário da coluna diz "5 objeções principais" |
| Escritor 1 | `POST /api/webhooks/n8n/icp` (`route.ts:106,128`) | n8n grava `objections[]` (1–12) na pesquisa |
| Escritor 2 | `POST /api/admin/stores/[id]/regenerate-objections` | Haiku 4.5, tool_use forçado, **exatamente 5**, in-process; botão em `pesquisa-section.tsx:272` |
| Escritor 3 | `PATCH /api/admin/stores/[id]/context` (`route.ts:123`) | edição manual (`edit-icp.tsx`, editor `[{objection, treatment}]`) |
| Leitor 1 | UI da Pesquisa (`pesquisa-section.tsx:619`) | só exibição/edição |
| **Não lê** | `resolveObjecoes` (`store-context.ts:169`) | lê **`icp_frictions`** — é dor, não objeção. Chega ao Curador do vault (`curador-shadow.ts`, bloco `<objecoes>`), ao Curador legado e ao Montador (`component-assembler.service.ts:232,345,286,388`) |
| **Não lê** | `pesquisaToFullText` (`briefing-text.ts:350`) | seção "03 · Cliente Ideal" leva persona, dia-na-vida, motivações e **frictions**; objeções ficam de fora → o Estruturador (`<perfil_da_marca>` = `{{pesquisa}}`) nunca as vê |
| **Não lê** | payload de copy (`email-copy-webhook.service.ts:1093`) | `icp: {persona, demographics, day_in_life, motivations, frictions}` — sem objeções |

**Banco (lojas ativas = 63):** 40 com pesquisa de marca · 37 com ICP · 37
com frictions · **35 com objeções (34 com exatamente 5)** · 13 com
`store_email_references` (fase 1 já rodou) · 7 com algum email
`ready/approved/live` · 52 com drafts · 0 jobs de dispatch ativos.

Amostra do shape atual (Rivo Coast, Cronos, Dellore): objeções boas, na voz
da pessoa, com tratamento concreto — mas **sem tipo de risco, sem aliviador,
sem lastro, sem momento de ciclo**, e com "já tenho sandálias suficientes"
(dor/histórico) contando como objeção. É exatamente o diagnóstico da spec §2.3.

### 1.2 Estruturador (`src/lib/agents/estruturador/`)

- Prompt: `estruturador-prompt.ts` — `DEFAULT_ESTRUTURADOR_SYSTEM` tem o
  passo "DIAGNÓSTICO: identifique em <perfil_da_marca> a objeção dominante";
  output `diagnostico.objecao_dominante` + `traducao_do_mecanismo`
  (`EstruturadorOutput`, `normalizarOutput`).
- Service: `estruturador.service.ts` — carrega `email_intents` (`_flow`,
  `progressao`, intenção do email por `email_number`), `email_structure_refs`,
  `email_learnings`; `USER_ORIGINS` declara a origem de cada var (o teste
  `estruturador-origins.test.ts` reprova var sem origem); anti-repetição =
  `loadEstruturasDosOutrosEmails` (só sequências, lidas das runs `success`
  dos irmãos).
- Consumo: `generate.service.ts:406` chama; `:544` serve o JSON inteiro ao
  Curador (`decisaoCompletaParaCurador`); `estruturador-consume.ts` leva
  papel/fio ao blueprint (`purpose`, `fio_narrativo`) → copy do n8n.
- Gate: `email_generation_settings.estruturador_mode` (hoje `on` na única org).
- Só welcome tem material (`email_structure_refs`: 8, todas welcome).

### 1.3 Curador (vault + legado) e Montador

- Vigente: `curador-shadow.ts` (`curador_vault_mode='on'`), sonnet-4.6,
  `SHADOW_TOP_N = 1`. Ranking no system: **"momento → objecao → registro →
  paleta → papel_na_peca"**; regra `<objecoes> é o que trava a compra`.
  Recebe `<decisao_do_estruturador>`, `<lacunas_da_biblioteca>`,
  `<indice_do_vault>` + ferramentas. `measureProtocolViolations` mede
  momento_vetado / hero_dupla / variante_repetida / convivencia — **não
  mede objeção nem aliviador**.
- Legado (fallback quando o vault falha): `component-assembler.service.ts`
  — `CHOOSER_TOP_N = 3` (`:127`), ranking `objecao → registro → paleta →
  papel_na_peca` (`:220`), `<objecoes>` (`:232`); Montador (`:332+`) com
  "Razão de OBJEÇÃO" (`:345`) — hoje `montador_mode='off'` (`20261107`).
- Eixos que chegam ao catálogo: `CatalogVaultExtra` (`catalog-builder.ts:30`)
  = momento, momento_vetado, objecao, registro, registro_vetado, paleta,
  papel_na_peca, peso, convivencia, exige — montados por
  `buildCatalogVaultExtras` (`curador-vault.ts:262`) a partir do frontmatter
  das notas `kind='variante'` de `email_vault_docs`.
- Protocolo: nota `_protocolo-de-selecao` (9 passos) servida como system —
  o passo 4 ("eliminar por `exige` contra o perfil de ativos") **não roda**
  porque o perfil de ativos não existe (a spec já registra a dependência).

### 1.4 Intenções (`email_intents`) e o vault

- 18 linhas, todas `welcome`: 8 ativas (`welcome-1..8`), `_flow`,
  `_progressao`, **8 inativas com slug `1..8`** (mesmo `body_md` — são os
  arquivos antes do rename; o sync desativa, nunca apaga:
  `vault-sync.service.ts:360`). Frontmatter das 8 ativas tem só
  `tipo, status, flow_type, email_number, revisado_por` — **zero campo
  estruturado**; a doutrina está no `body_md` (confirmado lendo welcome-2 e
  welcome-4: modo, riscos, proibições e trabalhos fixos estão lá, em prosa).
- `email_intents.frontmatter jsonb` já existe → os campos novos entram pelo
  sync **sem migration**. Mas o parser (`vault-parser.ts:84,98`) aceita só
  escalares de uma linha e array **inline** (`[a, b]`, split ingênuo por
  vírgula): nada de lista em bloco (`- item`), nada de `>` dobrado, nada de
  objeto aninhado. O frontmatter da spec (§4) usa os três.
- 34 outlines (`email_outline_templates`: welcome 8, abandoned_cart 8,
  browse 5, shipping 5, upsell 4, win_back 3, site_abandoned 1) — os 26 fora
  do welcome não têm intenção nem referência → **o rollout é welcome-only**,
  mesma fronteira do Estruturador hoje.

### 1.5 Achado: três vocabulários que não conversam

| Fonte | Vocabulário | Onde é usado |
|---|---|---|
| Vault, eixo `objecao` (11) | adesao-social, amplitude-de-catalogo, composicao-formulacao, confianca-no-canal, disponibilidade-urgencia, escolha-variedade, pertencimento, preco-valor, qualidade-eficacia, suporte-duvida, uso-aprendizado | frontmatter das 44 variantes (16 com `objecao: []`); 1º eixo discriminante do Curador |
| Spec, `tipo_de_risco` (7) | financeiro, desempenho, tempo, psicologico, social, seguranca, adequacao | saída do Catalogador/Seletor |
| Spec, `aliviador` (10) | garantia_de_devolucao, prova_de_terceiro, prova_por_volume, demonstracao_de_mecanismo, transparencia_de_politica, amostra_ou_teste, dado_de_adequacao, comparacao_de_categoria, seguranca_de_pagamento, reputacao_da_loja | eixo novo pedido para o Curador; ponte para `requisitos/` |
| Vault, `requisito` (52) | tres-reviews-distintos, depoimento-com-credencial, foto-do-depoente, selo-compra-verificada, tres-provas-verificaveis, cupom-ativo, prazo-real, quatro-criterios-objetivos, … | `exige` das variantes |

O Curador compara `vault.objecao` com "a objeção-alvo". Se o alvo chega como
`psicologico` + `prova_de_terceiro`, nenhuma variante tem esse valor no
eixo — o eixo vira neutro em 100% das posições e a decisão desce para
`registro`, que é a concentração que se quer desfazer. **Precisa de ponte**
(§2.6).

### 1.6 Concorrência da fase 1 (importa para `ja_atacadas`)

`email-dispatch-queue.service.ts:44,434`: `ARCHITECT_BATCH = 4` emails em
paralelo por tick, sem ordenação por `email_number`. O welcome-2 roda ao
mesmo tempo que o welcome-1. A anti-repetição do Estruturador já sofre
disso (lê o que existir); para o Seletor é fatal: `confirmacao_por_terceiros`
(welcome-4) **exige** `ja_atacadas`. O Seletor não pode rodar dentro do
call paralelo por email — precisa de um pré-passo sequencial (§2.4).

Pontos de entrada da fase 1 (os três precisam do mesmo pré-passo):
`email-dispatch-queue.service.ts:373` (cron), `test-generation.service.ts:219,309`
(aba Teste), `generate-blueprints/route.ts:70` (botão manual).

### 1.7 Outros pontos de contato

- CHECKs: `email_generation_runs.agent` (`20261102`) e
  `email_agent_configs.agent_type` (`20261082`) — precisam de `catalogador`
  e `seletor`; sem isso a run é descartada em silêncio (precedente 20261096).
- Labels de agente na UI/telemetria: `prompt-management.service.ts:158`,
  `agent-visual.ts:56`, `test-run-view.ts:28`, `prompts-workspace.tsx:36`,
  `telemetry-contract.ts:123` (`PROVENANCE_CONTRACT` — sem entrada, o teste
  de proveniência reprova).
- Settings: `settings-tab.tsx:112` + `PATCH /api/admin/email-generation-settings`
  + tipo em `types/email-generation.ts:270`.
- Gatilho da pesquisa: `POST /api/webhooks/n8n/pesquisa-completa` (`after()`
  → `enqueueDispatchJob`); não há tabela de reviews/tickets no banco — o
  Catalogador nasce só com os 5 pilares + produtos + objeções legadas.

---

## 2. Desenho proposto

### 2.1 Dados

**`store_objection_catalogs`** (nova, versionada — o §6.3 da spec pede que
"a saída antiga vire baseline de comparação"; versionar dá isso de graça):

```
id, store_id, version int, source ('catalogador_v2'|'legacy_import'|'manual'),
catalog jsonb  -- os 4 catálogos + cobertura + descartadas (schema §2.2 da spec)
model, run_id (email_generation_runs), pesquisa_sha8, is_current bool,
created_at, created_by
UNIQUE (store_id, version); índice parcial (store_id) where is_current
```

`client_stores.icp_objections` **vira projeção**: o Catalogador grava
`objecoes.map({objection: objecao, treatment: tratamento})` nela para a UI
atual, o `context` PATCH e o n8n continuarem funcionando sem mudar. Edição
manual na projeção passa a (a) marcar o catálogo como `manual` E (b) ser
lida como sinal de `verificado: true` para aquela objeção (é a única
revisão humana que existe hoje — não jogar fora).

**`store_email_objection_targets`** (nova — a decisão do Seletor por
loja × flow × email):

```
id, store_id, flow_type, email_number, catalog_version, version int,
target jsonb  -- schema §3.2 da spec (modo, alvos[], medos_alvo, promessa_a_pagar,
              --   angulo_do_tratamento, ja_atacadas, proibido_neste_toque, lacuna…)
consumido bool, run_id, is_current, created_at
UNIQUE (store_id, flow_type, email_number, version)
```

`ja_atacadas` de um email = `target.alvos` das linhas `is_current` do mesmo
`store × flow` com `email_number` menor. Regenerar o email 5 **não** move os
alvos de 1–4 (o reuso da fase 1 está desligado com o Estruturador `on`, mas
o alvo não é fase 1 — é contrato do flow).

**`email_generation_settings.seletor_mode`** `('off'|'shadow'|'on')`,
default `off` — mesma alavanca dos outros dois agentes. O Catalogador não
tem modo: é a nova implementação de `regenerate-objections`.

**CHECKs**: `+ 'catalogador', 'seletor'` nos dois; seed em
`email_agent_configs` com prompts vazios (defaults in-code, padrão do
Estruturador).

**`email_intents.frontmatter`**: sem migration. Contrato tipado por código
(§2.3).

### 2.2 Catalogador (Agente A)

- Arquivos: `src/lib/agents/objecoes/catalogador-prompt.ts` (puro: system
  da spec §2.1, vocabulários fechados como constantes exportadas, schema),
  `catalogador.service.ts` (I/O: carrega loja, invoca, valida, grava
  catálogo + projeção + run `catalogador` — store-level, sem email),
  `catalogo-regras.ts` (puro, testado): o que é **checável por código**
  não fica a cargo do modelo — regra 3 (mesmo risco + mesmo aliviador →
  reprova/funde), regra 6 (aliviador compatível com o risco, tabela §1.3),
  regra 1 (4–8), `verificado` sempre false, `dominante` no máximo uma,
  `flows_elegiveis` no domínio. Reprovou → 1 retry com o erro anexado
  (padrão do Estruturador); 2ª falha → run `error`, catálogo anterior
  continua `is_current`.
- Entradas: `pesquisaToFullText` inteiro + top 5 produtos com preço/link +
  **objeções legadas como evidência** (`icp_objections` atual, rotulado
  "material anterior, não é gabarito") + `icp_vocabulary` (tem quotes
  literais tipo "Objeção" — é a melhor fonte de `evidencia` que existe).
- Modelo: `anthropic/claude-sonnet-4.6` via `invokeAgent` (OpenRouter,
  mesma infra/telemetria do Estruturador). O Haiku da rota atual foi
  escolhido para 5 frases; o catálogo de 4 partes com lastro é trabalho de
  Sonnet. Custo ~US$ 0,05–0,10/loja, 1× por pesquisa.
- Gatilhos: (1) `pesquisa-completa` — roda **antes** do `enqueueDispatchJob`
  dentro do `after()` (maxDuration 300; ~30–60 s), fail-open: falhou →
  enfileira mesmo assim e o Seletor degrada para lacuna; roda também quando
  o callback vem com `regeneration: true` (a pesquisa mudou, o catálogo tem
  de acompanhar — só a copy não é re-disparada); (2) botão
  "Regenerar objeções" (mesma rota, corpo novo, resposta continua devolvendo
  a projeção para a UI); (3) `POST /api/admin/objection-catalogs/batch`
  para o backfill (§3) — 1 loja por chamada com `exclude_ids`, o padrão do
  `tag-batch` do Taguedor.
- UI: a aba Pesquisa ganha, ao lado do editor atual, a leitura do catálogo
  (objeções com risco/aliviador/lastro, veículos, medos, incentivo,
  cobertura, descartadas). Edição estruturada do catálogo fica para depois
  do shadow — a projeção cobre o editor de hoje.

### 2.3 Intenções (Catálogo B) — autoria + contrato

- `src/lib/agents/objecoes/intent-contract.ts` (puro, testado):
  `parseIntentContract(frontmatter)` → `{modo, n_objecoes, fonte_das_objecoes,
  riscos_elegiveis, riscos_vetados, profundidade_minima, aliviadores_admissiveis,
  veiculos_exigidos, trabalhos_fixos, permite_reataque, exige_dominante_da_categoria,
  dimensao_alvo, promessa_a_pagar, proibicoes}` com validação de domínio.
  Frontmatter sem `modo` → contrato `null` → Seletor grava run `skipped`
  (`sem_contrato`) e o pipeline segue como hoje. **Nunca inventa modo.**
- Parser (`vault-parser.ts`): adicionar lista em bloco (`- item`) e string
  entre aspas com vírgula dentro (o split ingênuo hoje quebraria
  `proibicoes`). Sem `>` dobrado: `estado_do_leitor` fica no corpo, onde já
  está. Teste no `vault-parser.test.ts`.
- Sync: `validateNote` passa a avisar (não reprovar) intenção de email sem
  `modo` — `skipped_invalid` é fail-open, e as 26 sem contrato precisam
  continuar entrando.
- Autoria (Obsidian, fora deste repo): extrair o frontmatter das 8 do
  welcome (a informação já está no `body_md` — welcome-2 e welcome-4 lidos
  batem com os exemplos da spec §4); escrever as 26 restantes já no
  formato. Proposta: eu gero os 8 frontmatters como PR de revisão (markdown
  pronto para colar) a partir do `body_md` sincronizado — quem aprova é
  quem revisa o vault.
- Limpeza: `DELETE FROM email_intents WHERE flow_type='welcome' AND NOT
  is_active AND slug ~ '^[0-9]+$'` — SQL one-off (`APPLY_MANUALLY_*`), não
  migration (é dado, não schema). São inofensivas hoje (todo loader filtra
  `is_active`), mas poluem o Estúdio.

### 2.4 Seletor (Agente C)

- Arquivos: `seletor-prompt.ts` (system da spec §3.1 + user com os blocos
  `<catalogo_da_loja>`, `<intencao_do_toque>` (contrato tipado + corpo),
  `<sinal_do_trigger>`, `<ja_atacadas>`, `<oferta_e_produtos>`),
  `seletor.service.ts`, `seletor-regras.ts` (puro, testado — o mesmo
  princípio do Catalogador: elegibilidade dupla (regra 2), dominante (3),
  não-repetir + profundidade nunca desce (4/5), veículo `aplicavel:false`
  some em silêncio (6), lastro não vira promessa dura (7), quantidade por
  modo (1) — tudo isso é conferível contra o catálogo e o contrato; o LLM
  escolhe, o código confere, reprovou → retry com o erro, 2ª → `lacuna`
  sintética `{motivo: 'seletor_falhou'}` gravada, nunca alvo inventado).
- **Quando roda**: pré-passo do job de dispatch, **sequencial por
  `email_number`** dentro do flow (o Seletor é barato: sem catálogo de
  variantes, ~4–6k tokens de entrada, ~10 s) — grava
  `store_email_objection_targets` de todos os emails do job ANTES dos lotes
  paralelos do Architect. Os outros dois callers (aba Teste, botão manual)
  chamam o mesmo `ensureObjectionTargets(storeId, flowType, emails[])`,
  que reaproveita o alvo `is_current` quando o catálogo não mudou
  (`catalog_version` igual) e só re-seleciona o que falta ou o que foi
  pedido com `force`.
- Modo `shadow`: roda, persiste com `consumido=false`, run `seletor` com
  `parsed_output.shadow=true`. Métricas para o flip, gravadas na run e
  visíveis no Estúdio: (a) concordância entre `alvos[0].tipo_de_risco` e o
  `objecao_dominante` que o Estruturador ainda inferiu sozinho; (b) rank-1
  do Curador tem anatomia do `aliviador_pedido`? (derivação §2.6); (c)
  distribuição de `aliviador_pedido` **por loja** — se todas as lojas
  pedem o mesmo, o eixo continua constante e o problema é o catálogo, não o
  Curador; (d) % de lacunas por toque.
- Modo `on`: `consumido=true` e a saída desce (§2.5–2.7).

### 2.5 Estruturador — as 5 mudanças do owner

1. **Diagnóstico vira tradução.** Bloco novo `<decisao_de_objecao>` no user
   (classe `upstream`, origem "Seletor — store_email_objection_targets");
   o passo DIAGNÓSTICO do system passa a ser o texto do owner ("A
   objeção-alvo NÃO é sua decisão…"). `diagnostico.objecao_dominante` sai
   do output; entra `diagnostico.alvo_id` (eco do `id` do alvo, para
   auditoria) e `traducao_do_mecanismo` fica. `normalizarOutput` tolera os
   dois formatos (runs antigas continuam legíveis).
2. **Modos sem objeção**: regra explícita para `manutencao_de_confianca` e
   `fechamento_de_ciclo` ("qual promessa está sendo paga…").
3. **Anti-repetição de argumento**: bloco `<objecoes_ja_atacadas>` (com
   profundidade e via) + a regra "estrutura diferente não basta".
4. **Varredura muda a natureza**: regra ligada a `modo=varredura_de_objecoes`
   (várias razões curtas escaneáveis, não argumento encadeado).
5. **Veículos com insumo**: `angulo_do_tratamento[].insumo_disponivel`
   chega no mesmo bloco; regra "não posicione seção para veículo com
   insumo `false`".

**Fallback obrigatório**: com `seletor_mode` ≠ `on` (ou alvo ausente/lacuna),
o bloco chega como `(sem decisão de objeção — diagnostique você a objeção
dominante em <perfil_da_marca>)` e a regra antiga permanece no system como
o caminho declarado. Sem isso, desligar o Seletor regride o Estruturador.

### 2.6 Curador — as 4 mudanças do owner + a ponte

1. **`<objecoes>` → `<alvo>`**: um bloco por email com modo, alvos
   (objeção, risco, tratamento, `aliviador_pedido`, profundidade), medos
   (varredura de canal) e `promessa_a_pagar`; regra do owner ("aliviador é
   vocabulário fechado — não substitua por equivalente"). Sem Seletor, o
   bloco cai para as objeções da loja (`icp_objections`, projeção) com o
   texto de hoje — nunca mais `icp_frictions`.
2. **Ordem de ranking**: `momento → objecao → aliviador → profundidade →
   registro → paleta → papel_na_peca` — no `DEFAULT_CHOOSER_VAULT_SYSTEM`,
   no legado (`DEFAULT_CHOOSER_SYSTEM`) **e na nota `_protocolo-de-selecao`
   do vault, na mesma janela** (o prompt diz que o vault vence; protocolo e
   código não podem discordar).
3. **`<proibido_neste_toque>`** com força de `quando_nao_usar`; entra em
   `measureProtocolViolations` como `proibicao_violada` quando for checável
   (ex.: "cupom" proibido + variante com `exige: cupom-ativo`).
4. **`aliviador → requisito`**: ranking com alerta agora (`requisito
   sugerido: tres-reviews-distintos`), veto duro só com perfil de ativos
   (fora deste plano).

**A ponte (§1.5)** — `src/lib/agents/objecoes/aliviador-bridge.ts` (puro,
testado), duas tabelas em código:

- `(tipo_de_risco, aliviador) → eixo objecao do vault[]` — ex.:
  `psicologico + prova_de_terceiro → [adesao-social, qualidade-eficacia]`,
  `seguranca + reputacao_da_loja → [confianca-no-canal]`,
  `financeiro + comparacao_de_categoria → [preco-valor]`,
  `adequacao + dado_de_adequacao → [escolha-variedade]`,
  `tempo + transparencia_de_politica → [suporte-duvida, disponibilidade-urgencia]`.
  O `<alvo>` sai com `eixo_objecao_equivalente` para o eixo `objecao` de
  hoje continuar discriminando enquanto as notas não têm o novo vocabulário.
- `variante → aliviador[] + profundidade` derivados de `block_type` +
  `objecao` + `exige` — ex.: `exige: tres-reviews-distintos |
  depoimento-com-credencial | selo-compra-verificada → prova_de_terceiro`,
  `reviews/* → prova_de_terceiro`, `body comparativo (quatro-criterios-
  objetivos) → comparacao_de_categoria + mecanismo`, `hero → afirmacao`.
  Entra no catálogo como `aliviador_derivado`/`profundidade_derivada`
  (`CatalogVaultExtra` + `buildCatalogVaultExtras`). **Frontmatter da nota
  vence a derivação** quando existir (`aliviador:` / `profundidade:` —
  autoria nas 44 notas, no vault; o sync já carrega qualquer chave).

### 2.7 Copy, telemetria, UI

- Payload do n8n (`email-copy-webhook.service.ts`): `emails[].alvo`
  (aditivo — o n8n ignora até consumir; doc `email-copy-payload-v2.md`
  ganha a seção). O papel/fio do Estruturador já leva a tradução.
- Proveniência: origens das vars novas (`USER_ORIGINS` do Estruturador,
  `origins` do Curador — classe `upstream`); `PROVENANCE_CONTRACT` ganha
  `catalogador` e `seletor`.
- Estúdio: labels nos 5 pontos do §1.7; aba de saída do Seletor
  (`agent-output-views.tsx`) mostrando alvo/lacuna/ja_atacadas; catálogo
  na aba Pesquisa.
- Lacunas do Seletor: o runtime não escreve no Obsidian. Persistem em
  `store_email_objection_targets.target.lacuna` e viram lista agregada no
  Estúdio ("o que falta catalogar por loja/toque"); exportar para
  `componentes/lacunas/` é gesto humano.

### 2.8 Montador e `CHOOSER_TOP_N`

- Agora: `CHOOSER_TOP_N` deriva de `montador_mode` (1 quando `off`) — só
  afeta o fallback kimi (o vault já está em 1), custo zero, sem perda.
- Depois do Seletor medido: religar o Montador como **verificador de
  cobertura** ("o conjunto das posições entrega o alvo, ou nenhuma
  entrega?") — devolve `cobertura: {alvo_coberto, posicoes_que_cobrem,
  troca_sugerida?}`; não troca peça por gosto. É a fase 6 da spec.

---

## 3. Lojas que já têm Pesquisa & Diagnóstico

Princípios: **nada é regerado sozinho**; catálogo novo não invalida
`store_email_references`, blueprint nem email pronto; o alvo entra na
**próxima** geração de cada email (com o Estruturador `on` a fase 1 já roda
inteira a cada geração). As 7 lojas com email `ready/approved/live` ficam
como estão até alguém pedir regeração.

| Tier | Lojas | O que acontece |
|---|---|---|
| T1 — com objeções legadas | 35 | (a) na fase 0, `resolveObjecoes` já passa a servir ESSAS objeções ao Curador (ganho imediato, sem agente novo); (b) `legacy_import` vira `version 0` de `store_objection_catalogs` (mapeadas com `tipo_de_risco: null`, `source='legacy_import'`) — o baseline; (c) batch do Catalogador v2 gera `version 1` e atualiza a projeção |
| T2 — com ICP, sem objeções | ~2–5 | só (c) |
| T3 — sem pesquisa | ~23 | nada; o gatilho `pesquisa-completa` cobre quando a pesquisa rodar |

Ordem do backfill: fase 0 → batch T1+T2 (~40 lojas × US$ 0,10 ≈ US$ 4, 1
loja por chamada) → conferir 5 catálogos à mão (Rivo, Cronos, Dellore + 2
sem objeção legada) contra a v0 → Seletor `shadow` só em welcome → 2–3
gerações comparadas → `on`. Ninguém precisa "refazer a pesquisa".

O que muda para a Pesquisa em curso: nenhum campo antigo some; o n8n
continua gravando `icp_objections` e, em seguida, o Catalogador roda no
`pesquisa-completa` e sobrescreve a projeção com a versão tipada.

---

## 4. Ordem de implantação

| Fase | Entrega | Toca | Testes |
|---|---|---|---|
| **0** (½ dia) | `resolveObjecoes` → `icp_objections`; seção "O que trava o checkout" em `pesquisaToFullText`; `CHOOSER_TOP_N` por `montador_mode`; parser com lista em bloco; SQL one-off das duplicatas | `store-context.ts`, `briefing-text.ts`, `component-assembler.service.ts`, `vault-parser.ts` | `store-context.test.ts`, `pesquisa-full-text.test.ts`, `vault-parser.test.ts` |
| **1** | Catalogador: migration (tabela + CHECKs + `seletor_mode` + seed de config), prompt, regras, service, rota v2 (mesmo path do botão), hook no `pesquisa-completa`, rota batch, leitura na aba Pesquisa | `src/lib/agents/objecoes/*`, rotas, `pesquisa-section.tsx` | `catalogo-regras.test.ts`, `catalogador-prompt.test.ts` (proveniência), rota batch |
| **2** | Contrato das intenções (`intent-contract.ts`), sync tolerante, proposta dos 8 frontmatters do welcome para revisão no vault | `intent-contract.ts`, `vault-sync.service.ts` | `intent-contract.test.ts` |
| **3** | Seletor em `shadow`: tabela de alvos, prompt, regras, service, pré-passo sequencial nos 3 callers, ponte de vocabulário, métricas na run, Estúdio | `seletor*.ts`, `aliviador-bridge.ts`, `email-dispatch-queue.service.ts`, `test-generation.service.ts`, `generate-blueprints/route.ts` | `seletor-regras.test.ts`, `aliviador-bridge.test.ts`, dispatch-queue test (ordem sequencial) |
| **4** | Consumo (gated por `seletor_mode='on'`): Estruturador §2.5, Curador §2.6 (código + protocolo do vault), payload de copy, eixos derivados no catálogo | `estruturador-prompt.ts`, `estruturador.service.ts`, `curador-shadow.ts`, `component-assembler.service.ts`, `catalog-builder.ts`, `curador-vault.ts`, `email-copy-webhook.service.ts` | origins tests, `curador-shadow.test.ts` (violações novas), `estruturador-prompt.test.ts` |
| **5** | Ligar; 2–3 gerações comparadas; decidir o Montador-cobertura | settings | — |
| Paralelo | 26 intenções restantes; `aliviador`/`profundidade` nas 44 notas; perfil de ativos da loja (destrava o `exige`) | vault (Obsidian) | — |

Cada fase é um PR; fases 0–3 não mudam o comportamento vivo (0 muda só o
insumo, para melhor). Rollback de qualquer fase = `seletor_mode='off'`
(4–5) ou revert do PR (0–3).

---

## 5. Decisões em aberto (precisam do owner)

1. **Storage do catálogo** — tabela versionada + projeção em
   `icp_objections` (recomendo) ou coluna nova `client_stores.objection_catalog`
   (mais simples, sem baseline).
2. **Modelos** — sonnet-4.6 nos dois (recomendo). Seletor em Haiku 4.5
   economizaria ~US$ 0,02/email, mas é o alvo de tudo que vem depois.
3. **Seletor por email, sequencial no pré-passo** (recomendo, é a spec) vs
   um call por flow que distribui os N alvos de uma vez (mais coerente,
   diverge da spec, e um erro contamina o flow inteiro).
4. **Ponte de vocabulário** — derivação por código como bootstrap + autoria
   de `aliviador`/`profundidade` nas notas (recomendo os dois; a derivação
   entra primeiro para o shadow medir algo).
5. **Catalogador inline no `pesquisa-completa`** antes do enqueue,
   fail-open (recomendo) vs etapa do job de dispatch (mais robusto a
   timeout, mais código).
6. **Edição manual = verificação?** — editar a projeção marca `verificado`
   na objeção correspondente (recomendo; é a única revisão humana que há).
7. **Autoria** — eu gero os 8 frontmatters do welcome como proposta a partir
   do `body_md` sincronizado; as 26 restantes e o `_protocolo-de-selecao`
   novo são autoria no vault. Confirmar quem revisa.

---

## 6. Riscos e armadilhas conhecidas

- **Lacuna legítima vs falha**: a Medicube sem `desempenho` é lacuna certa.
  As métricas do shadow separam "lacuna por catálogo" de "lacuna por
  contrato" (`lacuna.motivo`) — sem isso, % de lacuna vira ruído.
- **Vault × código**: a ordem de ranking vive nos dois. Mudar um sem o
  outro cria a contradição que o prompt manda resolver a favor do vault.
- **Concorrência**: qualquer caller novo da fase 1 que pule o pré-passo
  volta a rodar o Seletor sem `ja_atacadas`. O helper `ensureObjectionTargets`
  é o único caminho — e loga quando chamado com alvo ausente.
- **Prompt do Estruturador sem Seletor**: o fallback do §2.5 é obrigatório,
  senão `seletor_mode='off'` regride o agente que está `on` hoje.
- **Editor v1 da UI**: edita a projeção, não o catálogo. Até o editor v2, a
  regra 6 do §5 é o que impede a edição humana de se perder.
- **Parser do vault**: lista inline com vírgula dentro do item quebra em
  silêncio hoje — a fase 0 corrige antes de qualquer frontmatter novo.
- **Custo**: Catalogador 1×/pesquisa; Seletor ~US$ 0,03/email/geração
  (sem catálogo de variantes no prompt). Menor que o Estruturador.

---

*Referências: spec v2 (upload 04/09), `mapa-estruturador-curador.md`,
`plano-curador-cerebro-vault.md`, ADR `adr-estruturador-adaptativo.md`.*
