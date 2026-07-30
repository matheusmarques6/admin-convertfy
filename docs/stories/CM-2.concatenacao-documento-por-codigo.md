---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
Epic: CM - Curador, Montador e Hero
Fase: Fase 1 / Arquitetura
Estimate: M
---

# Story CM-2 — A montagem do documento sai do LLM e vira código

## User Story

**Como** responsável pelo pipeline,
**quero** que o documento da arquitetura seja concatenado por código a
partir dos HTMLs canônicos das variantes escolhidas,
**para que** nenhum LLM tenha a chance de achatar a variante, apagar tag
de imagem ou emitir marcador inválido.

---

## Contexto

Hoje o passo B do `component-assembler.service.ts` manda os HTMLs das
variantes escolhidas para o Opus 4.8 com a instrução de "harmonizar num
documento único". O prompt gasta mais de metade do seu tamanho tentando
impedir o modelo de estragar o insumo — e ainda assim estraga: existe um
guard dedicado (`findDroppedImageTags`) que mede tags de imagem que o
Montador removeu, e outro (`validateBlockMarkers`) que descarta os
marcadores quando saem malformados. O caso Luxe Lift (jul/2026) perdeu
banda escura de logo, segundo CTA e subtítulo antes de qualquer agente
rodar.

O `hero-graft` (commit `408673b`) já reconheceu isso e passou a
**reenxertar** a variante da hero por código depois do fato. Esta story
generaliza: o documento nasce das variantes canônicas, e não há o que
reenxertar.

Nesta story o **Curador segue escolhendo 1 por posição**, como hoje. A
mudança de papéis vem em CM-3 e CM-4 — as duas frentes são independentes.

### Já existe metade do caminho

`assembleReferenceHtml(chosen)` já concatena os HTMLs efetivos num shell
600px, hoje só como fallback quando o LLM falha. Falta: marcadores
`cfy:block` por posição, blocos sem variante, normalização de fontes e
promoção a caminho principal.

---

## Acceptance Criteria

### AC CM-2.1 — Módulo de concatenação
- [ ] Novo módulo `architect/assemble-document.ts`, **puro** (zero I/O)
- [ ] `assembleDocument(slots: AssemblySlot[], opts): { html, stats }`
- [ ] Para cada slot `kind='variant'`: usa `effectiveVariantHtml(variant)`
      — `html_tagged` aprovado, senão `html` — **byte a byte**, sem
      reescrever nada
- [ ] Envolve cada bloco com
      `<!-- cfy:block:{i}:{section}:start -->` / `:end`, exatamente no
      formato que `BLOCK_MARKER_PATTERN` reconhece
- [ ] Fragmento que começa com `<tr>` entra direto; que começa com
      `<table>` é embrulhado em `<tr><td>`; qualquer outra coisa é
      recusada e o slot vira `invalid_variant` (mesma matriz de decisão do
      `hero-graft.ts`)
- [ ] Shell de 600px centralizado, `:root` com as CSS variables de cor
      (`--bg`, `--text`, `--heading`, `--button-bg`, `--button-text`,
      `--accent`)
- [ ] `normalizeFonts` aplicado no documento final — componentes vêm de
      origens diferentes (Arial, Courier, Trebuchet) e sem isso o email sai
      com três tipografias. Mesma função que o graft já usa
- [ ] `stats` retorna: `blocks`, `variants`, `skipped`, `invalid`,
      `chars`

### AC CM-2.2 — Posição sem variante é pulada
- [ ] Slot `kind='missing'` **não** entra no documento e **não** puxa
      seção do template curado
- [ ] A posição é registrada em `stats.skipped` com `section` e `label`
- [ ] Nenhum comentário de nota é injetado no HTML (o
      `missingBlockNote` deixa de ser usado nesse caminho)
- [ ] O `block_index` dos marcadores permanece o índice **original** da
      estrutura, com lacunas — não é reindexado. Assim `slot_map`,
      blueprint e marcadores continuam falando o mesmo idioma

### AC CM-2.3 — O Montador LLM sai da montagem
- [ ] `assembleStoreReference` deixa de invocar o passo B
- [ ] O run de telemetria `agent='assembler'` continua existindo, agora
      registrando a **escolha** (ver CM-4). Nesta story, com o Curador
      ainda escolhendo 1, o run do Montador grava `status='skipped'`,
      `model='code'` e `parsed_output.reason='montagem_por_codigo'`
- [ ] `store_email_references` recebe `html` (do código),
      `variant_ids`, `slot_map`, `source='ai'` e `model='code'`
- [ ] `ReferenceSource` ganha o valor `'code'`, exibido na página de Logs

### AC CM-2.4 — Self-check da concatenação
- [ ] `validateBlockMarkers(html, slots)` roda sobre o **próprio** output
      do código. Status `'stripped'` ou `'absent'` é **bug de código**:
      loga `error`, grava em `parsed_output.marker_selfcheck` e segue com
      o documento sem marcadores (não derruba o email)
- [ ] `findDroppedImageTags` roda como self-check: entrada é a
      concatenação dos HTMLs efetivos, saída é o documento. Precisa ser
      sempre `[]`; qualquer item é `error` de log
- [ ] Teste que prova que os dois self-checks passam num documento de 8
      blocos com hero, produtos e footer

### AC CM-2.5 — O graft da hero continua vivo
- [ ] `graftHeroVariant` **não** é removido nem desabilitado
- [ ] Com arquitetura nova, o graft vira no-op: a região já é a variante.
      O status do graft registrado passa a ser `grafted` com
      `replaced_len ≈ variant_len` — ou um status novo `already_canonical`
      se for barato distinguir
- [ ] Teste: documento gerado por `assembleDocument` + `graftHeroVariant`
      resulta em HTML equivalente (idempotência do graft)
- [ ] Reference legada, gravada pelo Montador LLM, continua sendo
      enxertada normalmente — não é regerada sem `force`

### AC CM-2.6 — Prompt e config do Montador
- [ ] O `DEFAULT_ASSEMBLER_SYSTEM` de montagem deixa de ser usado. Manter
      a constante exportada até CM-4 substituí-la (evita quebrar import)
- [ ] Migration: `email_agent_configs` do `assembler` **não** é desativado
      — CM-4 reaproveita a linha com o prompt novo
- [ ] `ARCHITECT_INVOKE_TIMEOUT_MS` e o `TICK_BUDGET_MS` do cron de
      dispatch, ambos calibrados para o Montador gerar 40KB de HTML, são
      reavaliados. Registrar o novo valor no comentário do código

### AC CM-2.7 — Testes
- [ ] `assemble-document.test.ts`: ordem preservada, marcadores válidos,
      slot missing pulado com índice preservado, fragmento `<table>`
      embrulhado, fragmento inválido recusado, fontes normalizadas,
      placeholders intactos
- [ ] Teste de integração de `assembleStoreReference`: sem chamada de LLM
      no passo B, `slot_map` e `html` persistidos, `stats.skipped`
      refletido na telemetria
- [ ] Regressão: `extractStructureFromReference` extrai o esqueleto do
      documento novo com cobertura 100% (é o insumo do blueprint
      determinístico)

---

## Tarefas

- [ ] `architect/assemble-document.ts` + testes
- [ ] Ligar em `assembleStoreReference`, removendo a invocação do passo B
- [ ] `ReferenceSource` + exibição na página de Logs
- [ ] Self-checks e telemetria
- [ ] Reavaliar timeouts e o budget do tick do cron
- [ ] Regressão do esqueleto do blueprint

---

## Dev Notes

### Por que os marcadores não são reindexados

O `slot_map`, o `blueprint.blocks` e os marcadores `cfy:block` são três
representações da mesma sequência. Reindexar ao pular um bloco
desalinharia as três — e `resolveHeroVariant` casa por `section`, mas
`blocksInsideHeroRegion` casa por **posição**. Manter lacuna é mais
barato que sincronizar.

### O que se perde sem harmonização

O prompt do Montador pedia para "harmonizar espaçamentos, larguras,
tipografia num documento único". Na prática o que ele fazia de útil era a
normalização de fonte — que o `normalizeFonts` já faz por código, e
melhor. Espaçamento entre blocos é responsabilidade do
`orphan-spacer.ts`, que já roda. Largura é fixa em 600px pelo shell.

---

## File List

### A criar
- `src/lib/agents/architect/assemble-document.ts`
- `src/lib/agents/architect/assemble-document.test.ts`

### A modificar
- `src/lib/agents/architect/component-assembler.service.ts` — passo B sai
- `src/lib/agents/html/hero-graft.ts` — status `already_canonical`
- `src/lib/agents/architect/llm-invoke.ts` — comentário do timeout
- `src/lib/services/email-dispatch-queue.service.ts` — `TICK_BUDGET_MS`
- `src/components/email-generation-logs/logs-workspace.tsx` — fonte `code`
- `src/types/email-generation.ts` — `ReferenceSource`

---

## Dependencias

- **Bloqueado por**: nada
- **Bloqueia**: CM-5 (o `full_doc` só morre com segurança quando os
  marcadores são sempre válidos)

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Variantes da biblioteca não são fragmentos válidos para concatenar | Média | A matriz `<tr>`/`<table>`/recusa é a mesma que o graft já usa em produção; slot recusado é pulado e registrado |
| Documento concatenado fica visualmente pior que o harmonizado | Média | É o mesmo HTML que o graft já injeta hoje na hero, e a cadeia 7a-7d refaz acabamento. Comparar 3 emails em staging antes de ligar |
| Esqueleto do blueprint muda de forma e derruba a cobertura | Baixa | AC CM-2.7 tem regressão específica; cobertura <100% cai na rota B do blueprint, que continua funcional |
| Emails com reference legada se comportam diferente dos novos | Alta — é esperado | Documentado; o graft cobre os legados. Regerar em massa é decisão separada (`force=true`) |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada. Escopo ajustado após o hero-graft: o graft permanece como rede para reference legada |
