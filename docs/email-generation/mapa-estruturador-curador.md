# Mapa — Estruturador e Curador (o que recebem, como rodam, o que devolvem)

*02/09/2026 · branch `claude/resume-previous-session-UvATK` · levantamento
feito com caminho:linha no código, cruzado com as runs de produção
(Innova Bay nova, Welcome 1).*

## Decisões registradas

| Data | Decisão | Onde |
|---|---|---|
| 31/08 | Estruturador **desligado** em todas as orgs; a tese era o Curador do vault absorver estrutura + variantes num call só | migration `20261093`, `plano-curador-cerebro-vault.md` |
| 01/09 | Curador do vault vira o vigente (`curador_vault_mode='on'`), **seguindo** a sequência da aba Arquitetura (`conformarEstrutura`) | migration `20261101` |
| **02/09** | **Estruturador religado, e a SEQUÊNCIA de seções volta a ser dele.** A aba Arquitetura fica como intenção por bloco, usada só quando ele está desligado. Sem validador de conteúdo: o que ele devolver vale. O Curador do vault recebe a saída COMPLETA dele, as lacunas do vault e o índice do Obsidian com consulta sob demanda | migration `20261106` + este commit |

Efeito operacional de `on`: o reuso da fase 1 é desligado (ADR
`adr-estruturador-adaptativo`, decisão 6) — toda geração refaz Estruturador
+ Curador + Montador + blueprint.

---

## Ordem da fase 1

```
Pesquisa completa → ESTRUTURADOR → CURADOR (vault) → Montador → Blueprint → copy n8n (fase 2)
```

`generate.service.ts`: lê o modo (`email_generation_settings.estruturador_mode`)
ANTES do guard de reuso; chama `runEstruturador`; se consumiu, `structure` =
posições dele; chama `assembleStoreReference` (Curador + Montador) e
`generateStoreBlueprint`.

---

## 1 · ESTRUTURADOR (`agent='estruturador'`)

**Propósito.** Decide o esqueleto editorial de UM email de UMA loja: a
sequência de seções, o papel narrativo de cada posição, o fio que as liga
e o embasamento (referência de origem + porquê), traduzindo o material do
vault para a objeção dominante daquela loja.

**Gate.** `estruturador_mode` ∈ `off | shadow | on` (CHECK em `20261082`;
default da coluna e do código = `off`; interruptor em Configurações →
Estruturador, `settings-tab.tsx`, rota `PATCH /api/admin/email-generation-settings`
com `resolveOrgId`).

| Modo | O que acontece |
|---|---|
| `off` | não invoca LLM; grava run `skipped` (`skip_reason: estruturador_mode_off`); reuso da fase 1 vale |
| `shadow` | roda e grava a run; **nada é consumido** (`estruturadorOutput` fica null); reuso vale |
| `on` | roda e consome: `structure` do Montador/Curador, `estruturador_decisao` do Curador, papéis e fio no blueprint; reuso da fase 1 **desligado** |

Outras condições que o pulam: email `text_only`; flow sem
`email_structure_refs` (`sem_material`); sem intenção deste email em
`email_intents` (`sem_material`). Qualquer exceção é engolida pelo caller.

### Recebe

**SYSTEM** (cacheável por flow) — `estruturador-prompt.ts:buildSystemVars`,
origens em `SYSTEM_ORIGINS`:

| Bloco | Pasta do Obsidian → tabela | O que entra |
|---|---|---|
| `<intencao_do_flow>` | `intencoes/{flow}/_flow.md` → `email_intents` | texto inteiro |
| `<progressao_observada>` | `intencoes/{flow}/_progressao.md` → `email_intents` (kind `progressao`) | texto inteiro |
| `<referencias>` | **`estruturas/{flow}/*.md`** → `email_structure_refs` | TODOS os arquivos da pasta, cada um embrulhado por slug (`<referencia slug="…">`) |
| `<aprendizados>` | `aprendizados/{flow}/*.md` + `_global/*.md` com `aplica_a` → `email_learnings` | texto inteiro, embrulhado por slug |
| regras fixas | in-code (`DEFAULT_ESTRUTURADOR_SYSTEM`) | precedência (flow > revisão humana > orientação do COO > aprendizados > referências > preferência) · 5 passos · restrições (só seções de `<secoes_disponiveis>`; nunca `header`/`cta`; re-projetar `offer` preservando o mecanismo; `text_only` só como quebra de formato; nunca repetir a sequência de outro email do flow) |

**USER** — `estruturador.service.ts:userVars`, origens em `USER_ORIGINS`
(o teste `estruturador-origins.test.ts` falha se uma var do template ficar
sem origem):

| Bloco | Origem | Classe |
|---|---|---|
| `<perfil_da_marca>` | nome (`client_stores.store_name`) + dossiê completo da Pesquisa & Diagnóstico (`pesquisaToFullText`: 01 Perfil da Marca · 02 Sobre a loja · 03 Cliente Ideal · 04 Tom de Comunicação · 05 Review dos Anúncios) + Top 5 produtos com preço e link (`renderTopProducts`) | loja |
| `<email>` | `flow_type` + `email_number` + intenção DESTE email (`email_intents`) | sistema / vault |
| `<secoes_disponiveis>` | só os NOMES das categorias com variante ativa (`email_component_variants`) | sistema |
| `<estruturas_dos_outros_emails>` | sequência vigente dos irmãos do flow (última run `success` de cada) | sistema |
| `<orientacao_do_coo>` | `estruturador_orientacoes` (global → flow → email) | curadoria |
| `<revisao_humana>` | `email_structure_reviews` com `para_estruturador` | curadoria |

**Não recebe** (por decisão): catálogo/variantes, lacunas, intenções por
bloco da Arquitetura, memória de escolhas, outline.

### Como roda

`anthropic/claude-sonnet-4.6` via OpenRouter · T 0,4 · 8192 tokens ·
timeout 240 s (`ARCHITECT_INVOKE_TIMEOUT_MS`) · 2ª tentativa só quando o
JSON vem ilegível/truncado (o erro de parse volta anexado). Prompts do
banco (`email_agent_configs`, agente `estruturador`) estão vazios de
propósito → valem os defaults in-code.

### Devolve

```json
{
  "diagnostico": { "objecao_dominante", "referencia_base", "traducao_do_mecanismo" },
  "estrutura": [ { "section", "papel", "referencia", "adaptacao", "porque" } ],
  "fio_narrativo": "…",
  "fontes": [ { "ref", "o_que_pegou", "porque" } ],
  "aprendizados_aplicados": [ { "slug", "como" } ],
  "text_only": false,
  "descartes": [ { "section", "papel_na_referencia", "porque", "origem" } ]
}
```

### O que o código faz com isso

1. `normalizarOutput` (forma mínima: `estrutura[]` com `section` e `papel`;
   arrays default `[]`; `text_only` booleano estrito). **Sem validador de
   conteúdo** desde 02/09 — `estruturador-validator.ts` foi removido.
   Consequência: posição com seção que a biblioteca não tem chega ao
   Curador, que devolve `escolhas: []`, e o slot cai no template global.
2. `estruturaParaPosicoes` → `structure` do Montador e do Curador (rótulo =
   papel truncado em 90). `clampStructure` se `max_blocks_per_email` estourar.
3. `decisaoCompletaParaCurador` → var `estruturador_decisao` (JSON inteiro,
   clamp 24k com marcador).
4. Blueprint: `aplicarEstruturadorNoBlueprint` prepende o papel ao `purpose`
   de cada bloco (a forma da variante fica embaixo); `fio_narrativo` na
   coluna própria (`store_email_blueprints.fio_narrativo`, migration
   `20261083`). Por aí chega ao n8n (`bloco.purpose`) e à imagem (`EMAIL_IDEIA`).
5. Run: `input_vars` (slugs servidos, commit do vault, seções disponíveis,
   `system_sha8`), prompt segmentado por origem, `parsed_output` = output +
   `_validador` informativo (`retry_count`, `shadow`, `revisao_humana`
   seguida ou não, `repetiu_geracao_anterior`).

---

## 2 · CURADOR do vault (`agent='assembler_chooser'`, `curador-shadow.ts`)

**Propósito.** Para cada posição da sequência, escreve o papel (detalhando
o do Estruturador quando há decisão), o fio narrativo, e rankeia até 3
variantes da biblioteca com justificativa. Não vê HTML nem `output_schema`.
Não decide a sequência (`conformarEstrutura` garante).

**Gate.** `curador_vault_mode='on'` (migration `20261101`). Em falha (JSON
ilegível / ranking vazio) o Curador legado (Kimi,
`component-assembler.service.ts`) assume.

### Recebe

**SYSTEM**: protocolo de seleção (vault), convivências (vault), catálogo
COMPLETO com os eixos do vault fundidos (momento, objeção, registro,
paleta, papel na peça, peso). `{{catalogo}}` viaja na telemetria como
`{ref, sha8}`.

**USER** (dieta com o Estruturador ligado):

| Bloco | Origem | Situação |
|---|---|---|
| `<decisao_do_estruturador>` | saída COMPLETA do Estruturador (JSON) | **novo no template do vault** (02/09) |
| `<estrutura_do_email>` | sequência do Estruturador (rótulo = papel truncado) ou da Arquitetura | fixa; `conformarEstrutura` |
| `<notas_de_secao>` | `componentes/secoes` (vault), das seções do email | existente |
| `<lacunas_da_biblioteca>` | `componentes/lacunas` (vault), das seções do email + gerais | **novo** — o kind era sincronizado e nunca servido |
| `<aprendizados>` | `email_learnings` do flow + globais | existente |
| `<indice_do_vault>` | árvore de pastas do Obsidian (derivada do `file_path` das 4 tabelas) | **novo** |
| `<intencao_do_email>` | intenção do flow + deste email + restrições da Arquitetura | existente |
| `<momento>`, `<perfil_marca>`, `<objecoes>`, `<vocabulario>`, `<top_products>`, `<memoria>`, `<revisao_humana>` | loja / vault / código | existentes |
| `<estruturas_de_referencia>`, `<outline>` | — | **omitidos quando há decisão do Estruturador** (ele já traduziu esse material); voltam sem decisão |

### Como roda

`anthropic/claude-sonnet-4.6` via OpenRouter · T 0,2 · 8192 · prompts
in-code. **Consulta ao Obsidian sob demanda**: ferramentas
`listar_pasta(pasta)` e `ler_nota(caminho)` (`curador-vault-tools.ts`),
resolvidas por código contra `email_vault_docs`, `email_intents`,
`email_structure_refs` e `email_learnings` pelo `file_path`. Teto de 4
consultas; a volta seguinte vai com `tool_choice: "none"`. Loop em
`llm-invoke.ts:invokeAgentWithTools` — cada volta reenvia o histórico
(≈ +US$0,20 e 15-30 s por consulta). Erro na ferramenta vira texto para o
modelo; erro no loop cai numa chamada sem ferramentas
(`fallback_sem_ferramentas`).

### Devolve (inalterado)

```json
{ "papeis": [ { "block_index", "section", "papel" } ],
  "fio_narrativo": "…",
  "escolhas": [ { "block_index", "justificativa", "escolhas": [ { "variant_id", "motivo" } ] } ] }
```

`justificativa` por posição obrigatória; com decisão do Estruturador o
`papel` detalha o recebido e o ranking é pela anatomia que entrega aquele
papel. Depois: `conformarEstrutura` → `parseCuratorRanking` → Montador
(`assembler`) escolhe 1 por posição → `garantirHeroUnica` → montagem por
código (`assembleDocument`) → `store_email_references` (html, slot_map) e
`email_generation_choices` (memória).

### Telemetria da run (o que o Estúdio mostra)

`estruturador_consumido`, `lacunas_servidas`, **`consultas_ao_vault`**
(`{ferramenta, argumento, chars, ms, erro?}` na ordem), `consultou_vault`,
`voltas`, `fallback_sem_ferramentas`, `ranking_justificado`,
`posicoes_sem_variante`, `catalogo_divergente`, `protocol_violations`.
Tokens e custo somam todas as voltas. Entrada: "Decisão do Estruturador",
"Lacunas da biblioteca (vault)", "Índice do vault (Obsidian)".

---

## 3 · Relação entre os dois

| | Estruturador OFF | Estruturador ON |
|---|---|---|
| Sequência | aba Arquitetura (+ intenção por bloco casada por índice) | do Estruturador |
| `estruturador_decisao` | "(sem decisão…)" | JSON completo |
| `<estruturas_de_referencia>` / `<outline>` do Curador | servidos | omitidos |
| Papéis no blueprint | Curador do vault (+ intenção humana na 1ª linha) | Estruturador (`combinarIntencaoComPapel` sem intenção) |
| Fio | Curador | Estruturador |
| Reuso da fase 1 | vale | desligado |

## 4 · Riscos operacionais

- **Orçamento do cron** (`email-dispatch-queue`): fase 1 ≈ Estruturador
  (80-90 s) + Curador (~116 s + consultas) + Montador (~18 s). Lotes
  começam até `DISPATCH_TICK_BUDGET_MS` (45 s) e o `maxDuration` é 300 s —
  recomendado `DISPATCH_TICK_BUDGET_MS=15000` no ambiente enquanto o
  Estruturador estiver `on`; medir `duration_ms` das primeiras runs.
- **Custo**: ~US$0,40 por email por geração (reuso desligado) + até
  US$0,80 em consultas ao vault.
- **Sem validador**: seção inexistente ou slug inventado passam; a lacuna
  aparece como `posicoes_sem_variante` no Curador, não como reprovação.
