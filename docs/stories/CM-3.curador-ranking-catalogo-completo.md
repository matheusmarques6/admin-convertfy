---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
Epic: CM - Curador, Montador e Hero
Fase: Fase 1 / Arquitetura
Estimate: L
---

# Story CM-3 — Curador rankeia top-3 sobre o catálogo inteiro

## User Story

**Como** responsável pela personalização dos emails,
**quero** que o Curador veja toda a biblioteca da seção e devolva as 3
melhores em ordem de preferência,
**para que** a escolha deixe de ser limitada por um score que não conhece
a marca.

---

## Contexto

Hoje a seleção tem duas etapas antes do LLM:

1. `prefilterCandidates` corta cada posição para **8 candidatas**, por um
   score aritmético: `objectives ×3 · tones ×2 · density ×1`, com
   wildcards valendo frações.
2. `seededShuffle` embaralha a apresentação com semente
   `(loja, flow, email, bloco)` — porque o Curador tem viés de posição e,
   sem isso, "escolhe sempre os mesmos emails" (comentário no código).

O score é o problema: ele decide quem o LLM pode ver, usando três campos
categóricos, antes de qualquer leitura de marca. Uma variante perfeita para
a loja que não tenha `objectives` cadastrado corretamente nunca chega ao
Curador.

Esta story remove as duas etapas. O Curador recebe o catálogo completo,
agrupado por tipo de seção, e devolve **até 3 por posição em ordem de
preferência**.

Nesta story o código consome o **rank 1** — comportamento equivalente ao
de hoje, mas escolhido sobre a biblioteca inteira. Quem passa a escolher
entre os 3 é CM-4.

Prompts na íntegra:
[`agentes-curador-montador-hero.md`](../email-generation/agentes-curador-montador-hero.md),
seção 1.

---

## Acceptance Criteria

### AC CM-3.1 — Catálogo no system prompt, cacheável
- [ ] O catálogo vai no `system_prompt`, na var `{{catalogo}}`
- [ ] Ordem **estável**: `ORDER BY block_type, name`. Sem embaralhamento
- [ ] Catálogo **completo** — todas as seções, não só as do email. Igual
      para todo email de toda loja, que é o que deixa o cache quente
- [ ] Uma entrada por variante ativa e elegível, agrupada por
      `block_type`, com: `variant_id`, `name`, `description`,
      `quando_usar`, `quando_nao_usar`, `objectives`, `tones`, `density`,
      `product_slots`, `orientacao_copy`, `notas_implementacao`
- [ ] **Sem `campos_copy`** — o `output_schema` sai do Curador e passa a
      ser exclusividade do Montador
- [ ] Elegibilidade mantida: variante sem `{{PLACEHOLDER}}` no HTML
      efetivo fica fora, com o nome em
      `parsed_output.candidates_excluded_untagged`

### AC CM-3.2 — `invokeAgent` renderiza o system
- [ ] `invokeAgent` passa a renderizar `config.system_prompt` com as vars,
      como já faz com o `user_template`
- [ ] **Auditoria obrigatória antes**: varrer os `system_prompt` de todos
      os `agent_type` que usam `invokeAgent` procurando `{{ALGO}}` que não
      seja var conhecida. O `DEFAULT_ASSEMBLER_SYSTEM` atual cita
      `{{HERO_IMAGE}}`, `{{PRODUCT_N_IMAGE}}`, `{{HERO_HEADLINE}}`,
      `{{COUPON_CODE}}` e outras como exemplo — renderizar apagaria todas.
      Ver CM-1, que é o mesmo bug em outro agente
- [ ] Prompt que precise citar tag canônica passa a usar um formato que o
      renderer não consome (ex.: `[[HERO_IMAGE]]` no texto explicativo) ou
      o agente é excluído da renderização de system
- [ ] Teste que prova que nenhum system prompt em uso perde conteúdo ao
      passar pelo renderer

### AC CM-3.3 — Guard de catálogo ausente
- [ ] Se o system renderizado **não** contém o catálogo (edição
      descuidada na aba Agentes apagou a var), o run **falha explicitamente**
      com razão `catalogo_ausente`
- [ ] Nunca invocar o modelo sem biblioteca: escolher no vazio é pior que
      falhar
- [ ] Teste com system customizado sem `{{catalogo}}`

### AC CM-3.4 — Output: ranking de até 3
- [ ] Contrato:
      ```json
      [{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"..."},{"variant_id":"..."}]}]
      ```
- [ ] A **ordem do array** é a preferência. Sem campo de rank redundante
- [ ] Só a 1ª de cada posição leva `motivo`, com teto de 20 palavras
- [ ] Menos de 3 adequadas na seção → devolve quantas houver
- [ ] `max_tokens` de 2048 para **8192**

### AC CM-3.5 — Parser e validações
- [ ] `parseCuratorRanking(raw, catalogo, sections)` substitui
      `parseAssemblerOutput`
- [ ] `variant_id` inexistente no catálogo → descartado do ranking,
      registrado em `parsed_output.invalid_ids`
- [ ] `variant_id` cujo `block_type` **não** é a seção daquela posição →
      descartado, registrado em `parsed_output.wrong_type_ids`.
      Necessário porque o catálogo agora vai inteiro, sem pré-separação
- [ ] `block_index` fora da estrutura → ignorado, registrado
- [ ] Duplicata do mesmo `variant_id` na mesma posição → mantém a primeira
- [ ] Posição que sobra sem nenhum id válido → conta como **pulada**,
      alimentando `stats.skipped` (CM-2) e o selo (CM-7)

### AC CM-3.6 — Falha do Curador
- [ ] Timeout, erro de rede ou JSON inválido → **retry 1×**
- [ ] Segunda falha → email vai a `failed`, razão `curador_failed`, sem
      gravar arquitetura
- [ ] Todas as posições sem id válido → `failed`, razão
      `curador_sem_escolhas`
- [ ] **Não** existe mais fallback por score ou por ordem estável.
      Composição arbitrária é pior que falha visível

### AC CM-3.7 — Pré-filtro removido
- [ ] `prefilterCandidates`, `scoreVariant`, `buildMatchContext`,
      `seededShuffle`, `seedFrom` e `DEFAULT_TOP_K` removidos junto com
      seus testes
- [ ] `flowTypeToObjective` e `deriveToneKeys` (em
      `shared/component-dimensions.ts`) **permanecem** — `objectives` e
      `tones` continuam indo ao catálogo como informação para o Curador
      ler, e o derivador de componentes usa os mesmos helpers
- [ ] `CHOOSER_TOP_K` removido
- [ ] Nenhum import órfão; `npm run typecheck` limpo

### AC CM-3.8 — Consumo do rank 1
- [ ] Enquanto CM-4 não existir, o código monta os `slots` com o **1º** de
      cada posição
- [ ] `parsed_output.ranking` guarda o ranking completo, para CM-4 e para
      auditoria
- [ ] Comportamento resultante é equivalente ao de hoje — a diferença é o
      pool de onde a escolha saiu

### AC CM-3.9 — Testes
- [ ] Catálogo: ordem estável entre chamadas, agrupamento por
      `block_type`, ausência de `campos_copy`, exclusão de variante sem
      placeholder
- [ ] Parser: id inexistente, tipo errado, `block_index` inválido,
      duplicata, posição vazia, JSON com fence, JSON com prosa em volta,
      JSON truncado
- [ ] Falha: retry 1× e `failed` na segunda
- [ ] Guard de catálogo ausente
- [ ] Sem chamadas a `prefilterCandidates` em nenhum caminho

---

## Tarefas

- [ ] Builder do catálogo (puro, testável)
- [ ] Auditoria dos system prompts antes de ligar a renderização
- [ ] `invokeAgent` renderiza system + guard de catálogo
- [ ] `parseCuratorRanking` + validações
- [ ] Retry e caminhos de falha
- [ ] Migration: prompt novo do `assembler_chooser` + `max_tokens` 8192
- [ ] Remover pré-filtro e shuffle, com os testes
- [ ] Testes novos

---

## Dev Notes

### O determinismo abandonado

O `seededShuffle` garantia que "o mesmo email regenera com a mesma ordem".
Isso não se perde de fato: quem garante estabilidade é o guard de reuso em
`generateBlueprintAndReference` — arquitetura já persistida não é regerada
sem `force`. O email do cliente não muda debaixo dele; só regeração
explícita produz composição nova.

### Cache: o que esperar

TTL de 5 minutos, renovado a cada acerto. Um lote de 12 emails em
sequência mantém vivo do começo ao fim. Editar a biblioteca invalida por
conteúdo — a primeira chamada seguinte reescreve o cache (1,25×) e as
demais leem (0,1×). Não há invalidação manual a implementar.

### Por que o catálogo completo, e não só as seções do email

Um catálogo filtrado por email muda de conteúdo entre emails e nunca
cacheia. Completo, o prefixo é idêntico para todos os emails de todos os
flows de todas as lojas. O custo do prefixo maior é pago a 0,1× a partir
do segundo email.

---

## File List

### A criar
- `src/lib/agents/architect/catalog-builder.ts`
- `src/lib/agents/architect/catalog-builder.test.ts`
- `src/lib/agents/architect/curator-ranking.parser.ts`
- `src/lib/agents/architect/curator-ranking.parser.test.ts`
- `supabase/migrations/2026XXXX_curador_ranking.sql`

### A modificar
- `src/lib/agents/architect/component-assembler.service.ts`
- `src/lib/agents/architect/llm-invoke.ts` — renderiza system
- `src/lib/agents/architect/component-deriver.ts` — esvaziado ou removido
- `src/lib/agents/shared/component-dimensions.ts` — mantém os helpers

### A remover
- `src/lib/agents/architect/component-deriver.test.ts` — parte do score

---

## Dependencias

- **Bloqueado por**: nada. Independente de CM-2
- **Bloqueia**: CM-4 (precisa do ranking), CM-7 (precisa dos selos)

---

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Renderizar o system quebra prompt de outro agente | **Alta se não auditar** | AC CM-3.2 exige auditoria + teste antes de ligar. É o mesmo bug do CM-1 |
| Catálogo grande estoura o input com a biblioteca crescendo | Média | Medir tokens do catálogo no primeiro run e registrar na telemetria. Passando de ~40 variantes por seção, reavaliar (teto configurável foi considerado e adiado) |
| Sem score, o Curador escolhe variante de tipo errado | Média | AC CM-3.5 valida `block_type` e descarta |
| Viés de posição volta sem o shuffle | Média | Ordem alfabética declarada como sem julgamento no prompt; a variedade passa a vir do histórico, presente nos dois agentes. Medir concentração de `variant_id` por email (métrica do épico) |
| JSON de 2,5k tokens truncado derruba o email | Média | Retry 1×. Se recorrer, o caminho é `response_format: json_schema` no OpenRouter |

---

## Change Log

| Data | Autor | Descricao |
|------|-------|-----------|
| 2026-07-30 | @architect | Story criada |
