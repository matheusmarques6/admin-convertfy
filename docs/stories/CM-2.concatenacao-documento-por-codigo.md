---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: In Review
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
- [x] Novo módulo `architect/assemble-document.ts`, **puro** (zero I/O)
- [x] `assembleDocument(slots: AssemblySlot[], opts): { html, stats }`
- [x] Para cada slot `kind='variant'`: usa `effectiveVariantHtml(variant)`
      — `html_tagged` aprovado, senão `html` — **byte a byte**, sem
      reescrever nada
- [x] Envolve cada bloco com
      `<!-- cfy:block:{i}:{section}:start -->` / `:end`, exatamente no
      formato que `BLOCK_MARKER_PATTERN` reconhece
- [x] Fragmento que começa com `<tr>` entra direto; que começa com
      `<table>` é embrulhado em `<tr><td>`. **Desvio da spec:** qualquer
      outra coisa (um `<div>` solto) também é **embrulhada**, não recusada —
      email sem a seção é pior que variante cadastrada fora do padrão, e o
      caso vai para `stats.wrappedUnknown`. A matriz é compartilhada com o
      `hero-graft` via `html/fragment-fit.ts`, que ganhou o modo
      `wrapUnknown`: o enxerto segue conservador, porque lá ele substitui uma
      região existente e recusar é degradação segura. Só sobra
      `invalid_fragment` para fragmento sem nada aproveitável (ex.: só
      comentário)
- [x] Shell de 600px centralizado, `:root` com as CSS variables de cor
      (`--bg`, `--text`, `--heading`, `--button-bg`, `--button-text`,
      `--accent`)
- [x] `normalizeFonts` aplicado no documento final — componentes vêm de
      origens diferentes (Arial, Courier, Trebuchet) e sem isso o email sai
      com três tipografias. Mesma função que o graft já usa
- [x] `stats` retorna: `blocks`, `variants`, `skipped`, `wrappedUnknown`,
      `fontsNormalized`, `chars` e `expected` (insumo do self-check)

### AC CM-2.2 — Posição sem variante é pulada
- [x] Slot `kind='missing'` **não** entra no documento e **não** puxa
      seção do template curado
- [x] A posição é registrada em `stats.skipped` com `section` e `label`
- [x] Nenhum comentário de nota é injetado no HTML (o
      `missingBlockNote` deixa de ser usado nesse caminho)
- [x] O `block_index` dos marcadores permanece o índice **original** da
      estrutura, com lacunas — não é reindexado. Assim `slot_map`,
      blueprint e marcadores continuam falando o mesmo idioma

### AC CM-2.3 — O Montador LLM sai da montagem
- [x] `assembleStoreReference` deixa de invocar o passo B
- [x] O run de telemetria `agent='assembler'` continua existindo, agora
      registrando a **escolha** (ver CM-4). Nesta story, com o Curador
      ainda escolhendo 1, o run do Montador grava `status='skipped'`,
      `model='code'` e `parsed_output.reason='montagem_por_codigo'`
- [x] `store_email_references` recebe `html` (do código),
      `variant_ids`, `slot_map`, `source='ai'` e `model='code'`
- [x] `ReferenceSource` ganha o valor `'code'`. A página de Logs não tem
      exibição dedicada de fonte hoje (o `parsed_output` aparece como JSON no
      drawer, onde `reference_source` já é visível); selo dedicado fica no CM-7

### AC CM-2.4 — Self-check da concatenação
- [x] `validateBlockMarkers(html, slots)` roda sobre o **próprio** output
      do código. Status `'stripped'` ou `'absent'` é **bug de código**:
      loga `error`, grava em `parsed_output.marker_selfcheck` e segue com
      o documento sem marcadores (não derruba o email)
- [x] `findDroppedImageTags` roda como self-check: entrada é a
      concatenação dos HTMLs efetivos, saída é o documento. Precisa ser
      sempre `[]`; qualquer item é `error` de log
- [x] Teste que prova que os dois self-checks passam num documento de 8
      blocos com hero, produtos e footer

### AC CM-2.5 — O graft da hero continua vivo
- [x] `graftHeroVariant` **não** é removido nem desabilitado
- [x] Status novo `already_canonical` distingue o no-op de um enxerto real —
      a telemetria mostra que o enxerto deixou de ser necessário em vez de
      virar no-op silencioso
- [x] Teste: documento gerado por `assembleDocument` + `graftHeroVariant`
      resulta em HTML equivalente (idempotência do graft)
- [x] Reference legada, gravada pelo Montador LLM, continua sendo
      enxertada normalmente — não é regerada sem `force`

### AC CM-2.6 — Prompt e config do Montador
- [x] O `DEFAULT_ASSEMBLER_SYSTEM` de montagem deixa de ser usado. Manter
      a constante exportada até CM-4 substituí-la (evita quebrar import)
- [x] Migration: `email_agent_configs` do `assembler` **não** é desativado
      — CM-4 reaproveita a linha com o prompt novo
- [x] `ARCHITECT_INVOKE_TIMEOUT_MS` e `TICK_BUDGET_MS` reavaliados:
      **valores mantidos**. O teto do tick é o timeout do invoke (240s), não
      a duração do modelo — e o timeout agora protege o Curador. Baixá-lo
      depende de medir a latência real do Curador com catálogo completo
      (CM-3) em produção. Comentários dos dois atualizados para não citar o
      Montador como agente lento

### AC CM-2.7 — Testes
- [x] `assemble-document.test.ts`: ordem preservada, marcadores válidos,
      slot missing pulado com índice preservado, fragmento `<table>`
      embrulhado, fragmento inválido recusado, fontes normalizadas,
      placeholders intactos
- [x] Teste de integração de `assembleStoreReference`: sem chamada de LLM
      no passo B, `slot_map` e `html` persistidos, `stats.skipped`
      refletido na telemetria
- [x] Regressão: `extractStructureFromReference` extrai o esqueleto do
      documento novo com cobertura 100% (é o insumo do blueprint
      determinístico)

---

## Tarefas

- [x] `architect/assemble-document.ts` + testes
- [x] Ligar em `assembleStoreReference`, removendo a invocação do passo B
- [x] `ReferenceSource` + exibição na página de Logs
- [x] Self-checks e telemetria
- [x] Reavaliar timeouts e o budget do tick do cron
- [x] Regressão do esqueleto do blueprint

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

### Achado durante a implementação: o tag-locator pode engolir vizinhos

Um teste de dupla invocação do enxerto expôs um bug **pré-existente** no
`hero-locator`, modo `tag`: sem marcadores `cfy:block`, a região da hero é
inferida pela `<table>` balanceada mais externa que a contém. Se os blocos
vizinhos **não têm tag canônica**, eles não disparam a validação de
"invade o próximo bloco" — a região passa a englobar o container inteiro e
o splice apaga o footer.

Não afeta o caminho novo: com montagem por código os marcadores são sempre
válidos e o locator opera em modo `marker` (há teste garantindo). Afeta
reference legada sem marcadores. Endereçamento natural: CM-5, que já mexe
nos modos do locator.

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada. Escopo ajustado após o hero-graft: o graft permanece como rede para reference legada |
| 2026-07-30 | @dev (Dex) | `assemble-document.ts` (montagem + marcadores + self-checks) e `html/fragment-fit.ts` (matriz de encaixe compartilhada com o enxerto, agora com modo `wrapUnknown`). Passo B do LLM removido; `source='code'`; fontes da loja carregadas na fase 1. Código morto removido junto: `assembleReferenceHtml`, `referenceShell`, `missingBlockNote`, `shuffle` (Math.random sem consumidor) e os dois prompts de montagem. 26 testes no módulo novo + testes do fallback reescritos. Suíte 849/849, typecheck limpo, lint no baseline. **Achado registrado abaixo.** Status → In Review |
