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

# Story CM-4 — Montador vira selecionador de conjunto

## User Story

**Como** responsável pela qualidade da composição,
**quero** um agente que veja os finalistas de **todas** as posições de uma
vez e feche a composição do email,
**para que** a coerência entre blocos seja decidida por quem olha o email
inteiro, e não posição por posição.

---

## Contexto

Depois de CM-2 o Montador não monta mais nada, e depois de CM-3 o Curador
entrega 3 finalistas por posição com o código pegando o 1º. Esta story dá
ao Montador o papel novo: **escolher 1 entre 3, por posição, olhando o
conjunto**.

O que justifica a segunda passada — e o que a diferencia do Curador:

| | Curador | Montador |
|---|---|---|
| Escopo | uma posição, isolada | o email inteiro, de uma vez |
| Vê `output_schema` | não | **sim** |
| Decide | mérito da variante naquela posição | coerência e viabilidade do conjunto |

O `output_schema` é o insumo exclusivo dele: é o que revela que um bloco
vai **exigir** um campo obrigatório de cupom, ou 4 slots de produto numa
loja com 2 cadastrados.

Prompt na íntegra:
[`agentes-curador-montador-hero.md`](../email-generation/agentes-curador-montador-hero.md),
seção 2.

---

## Acceptance Criteria

### AC CM-4.1 — Prompt novo
- [ ] `system_prompt` do `assembler` substituído: sai toda instrução de
      montagem de HTML (slots de imagem, tags canônicas, marcadores de
      bloco, container 600px, CSS variables, blocos sem variante); entra o
      critério de conjunto
- [ ] Regra de decisão explícita: **1ª indicação do Curador por padrão**;
      sair dela exige uma das três razões — conjunto, viabilidade ou
      histórico
- [ ] Migration faz `UPDATE` in-place da linha ativa, como os demais
      prompts do projeto
- [ ] `max_tokens` de 16384 para **2048**
- [ ] Modelo permanece `anthropic/claude-opus-4.8`. `temperature` segue
      irrelevante (Opus 4.7/4.8 não a recebe, por `modelSupportsTemperature`)

### AC CM-4.2 — Input: finalistas de todas as posições
- [ ] `{{finalists_json}}` por posição: `block_index`, `section`, `label`
      e as opções com `rank`, `variant_id`, `name`, `description`,
      `quando_usar`, `quando_nao_usar`, `product_slots`,
      `orientacao_copy`, `notas_implementacao`, `motivo_curador` (só no
      rank 1) e `campos`
- [ ] `campos` é o `output_schema` **compacto**: `key`, `label`, `type`,
      `nature`, `max_len`, `required`. Sem `example` nem `guidance` —
      esses servem à copy e à imagem, não à escolha
- [ ] `{{memoria}}` presente: o mesmo objeto que o Curador recebe, com o
      email anterior da loja e o mesmo email em outras lojas.
      `loadCuradorMemory` já é carregado uma vez em
      `assembleStoreReference` — reusar, sem query nova
- [ ] `{{top_products}}` presente, para cruzar com `product_slots`
- [ ] Nenhum HTML de variante entra no prompt

### AC CM-4.3 — Output
- [ ] Contrato:
      ```json
      [{"block_index":0,"variant_id":"...","rank":1},{"block_index":1,"variant_id":"...","rank":2,"motivo":"..."}]
      ```
- [ ] `motivo` **obrigatório** quando `rank != 1` e **proibido** quando
      `rank = 1` — mantém o output curto e evita justificativa inventada
      para confirmar o óbvio
- [ ] Uma entrada por posição que tenha finalistas, na ordem de
      `block_index`

### AC CM-4.4 — Parser e validações
- [ ] `variant_id` fora dos finalistas daquela posição → cai para o rank 1
      do Curador, registrado em `parsed_output.forced_rank1`
- [ ] `rank` autodeclarado divergente do real → **corrigido pelo código**.
      O rank do output é telemetria, não fonte de verdade
- [ ] Posição ausente no output → cai para o rank 1, registrado
- [ ] `motivo` ausente com `rank != 1` → aceito e registrado em
      `parsed_output.missing_motivo`. Observabilidade não derruba email
- [ ] `motivo` presente com `rank = 1` → descartado, registrado
- [ ] JSON inválido → retry 1×; segunda falha → **cai para o rank 1 em
      todas as posições** e o run fica `status='degraded'`. Aqui o
      fallback é legítimo: o ranking do Curador já é uma composição
      válida, ao contrário do cenário de CM-3

### AC CM-4.5 — Telemetria
- [ ] `parsed_output` do run `assembler` passa a carregar: `desvios`
      (quantas posições saíram do rank 1), `desvios_por_posicao`,
      `forced_rank1`, `missing_motivo`, `escolhas` (id + rank por posição)
- [ ] `desvios` é a métrica que mede se o Curador está rankeando bem — se
      ficar perto de 0, a segunda passada é barata; passando de ~40%, o
      critério do Curador precisa revisão
- [ ] Custo do run reflete o output novo (~500 tokens)

### AC CM-4.6 — Limpeza
- [ ] `extractHtml`, `looksLikeHtml` e `findDroppedImageTags` deixam de
      ser usados no caminho do Montador. `findDroppedImageTags` permanece
      como self-check da concatenação (CM-2)
- [ ] `resolveChoices` substituído pelo parser novo
- [ ] `DEFAULT_ASSEMBLER_SYSTEM` e `DEFAULT_ASSEMBLER_USER` de montagem
      removidos, junto com os testes que os cobrem

### AC CM-4.7 — Testes
- [ ] Parser: id fora dos finalistas, rank divergente, posição ausente,
      motivo ausente/indevido, JSON com fence, JSON truncado
- [ ] Fallback: segunda falha → rank 1 em todas as posições, run
      `degraded`
- [ ] Prompt: `finalists_json` sem `example`/`guidance` e sem HTML
- [ ] Integração: escolha do Montador chega ao `slot_map` e ao documento
      concatenado na ordem certa

---

## Tarefas

- [ ] Builder do `finalists_json`
- [ ] Parser de escolhas + validações
- [ ] Migration com o prompt novo e `max_tokens` 2048
- [ ] Telemetria de desvios
- [ ] Remover o que era da montagem
- [ ] Testes

---

## Dev Notes

### Por que o fallback aqui é diferente do CM-3

Se o Curador falha, não há composição nenhuma — cair para qualquer coisa
seria arbitrário, então o email falha. Se o **Montador** falha, o ranking
do Curador já existe e o rank 1 é uma composição legítima, avaliada
posição por posição. Degradar é melhor que falhar.

### Por que manter o Opus

O modelo caro se justificava por gerar 40KB de HTML. Agora ele faz a
decisão mais nobre do pipeline com output de ~500 tokens: o custo cai
sozinho pelo output, e a qualidade da composição é exatamente onde vale
gastar. Se a telemetria de `desvios` mostrar que ele quase sempre confirma
o Curador, aí sim vale testar um modelo menor.

---

## File List

### A criar
- `src/lib/agents/architect/assembler-choice.parser.ts`
- `src/lib/agents/architect/assembler-choice.parser.test.ts`
- `supabase/migrations/2026XXXX_montador_selecao.sql`

### A modificar
- `src/lib/agents/architect/component-assembler.service.ts`
- `src/lib/agents/architect/component-assembler.service.test.ts`

---

## Dependencias

- **Bloqueado por**: CM-3 (precisa do ranking de 3)
- **Bloqueia**: CM-7 (selo de desvios)

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| O Montador confirma o rank 1 em ~100% dos casos e a passada não paga | Média | É exatamente o que `desvios` mede. Se confirmar, a story seguinte é cortar o agente e usar o rank 1 direto |
| Prompt de conjunto é vago e o modelo inventa razões de desvio | Média | `motivo` proibido no rank 1 reduz a superfície; as três razões são enumeradas e fechadas no prompt |
| Loja com 12 posições × 3 finalistas estoura o input | Baixa | Sem HTML e com schema compacto, o `finalists_json` fica na casa de poucos milhares de tokens |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada |
