---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: In Review
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
- [x] O catálogo vai no `system_prompt`, na var `{{catalogo}}`
- [x] Ordem **estável**: `ORDER BY block_type, name`. Sem embaralhamento
- [x] Catálogo **completo** — todas as seções, não só as do email. Igual
      para todo email de toda loja, que é o que deixa o cache quente
- [x] Uma entrada por variante ativa e elegível, agrupada por
      `block_type`, com: `variant_id`, `name`, `description`,
      `quando_usar`, `quando_nao_usar`, `objectives`, `tones`, `density`,
      `product_slots`, `orientacao_copy`, `notas_implementacao`
- [x] **Sem `campos_copy`** — o `output_schema` sai do Curador e passa a
      ser exclusividade do Montador
- [x] Elegibilidade mantida: variante sem `{{PLACEHOLDER}}` no HTML
      efetivo fica fora, com o nome em
      `parsed_output.candidates_excluded_untagged`

### AC CM-3.2 — Interpolação do system, sem renderer

**Desvio da spec, decidido pela auditoria.** A auditoria exigida encontrou
`{{TAG}}` no `DEFAULT_BLUEPRINT_SYSTEM`, usado como **notação genérica**
("as tags {{TAG}} do HTML"), duas vezes. Renderizar o system genericamente
repetiria o bug do CM-1 em outro agente. Em vez de adaptar prompts para
fugir do renderer, a interpolação passou a ser **literal por chave**:

- [x] `interpolateSystem(prompt, vars)`: substitui só as chaves passadas,
      via replacement por **função** (com string, `$&`/`$1` no valor seriam
      lidos como referências ao match e corromperiam o catálogo — pego por
      teste)
- [x] `invokeAgent` ganha 3º parâmetro `systemVars`, opcional. Sem ele o
      system vai byte a byte como está: nada muda para blueprint e subject
- [x] Auditoria registrada em teste: o `{{TAG}}` do blueprint sobrevive, e
      no prompt do Curador só o `{{catalogo}}` é substituído
- [x] Nenhum prompt precisou mudar de notação

### AC CM-3.2b — Cache no caminho certo

**Achado durante a implementação.** O Curador roda
`anthropic/claude-sonnet-4.6` — id com `/`, logo **OpenRouter**. O
`cache_control` só existia no caminho Anthropic-direto, então o catálogo no
system não cachearia nada e o ganho prometido não existiria.

- [x] `systemContent()` manda o system como array com
      `cache_control: {type:'ephemeral'}` quando o modelo é `anthropic/*`
- [x] Outros provedores seguem recebendo string (alguns rejeitam array)

### AC CM-3.3 — Guard de catálogo ausente
- [x] Se o system renderizado **não** contém o catálogo (edição
      descuidada na aba Agentes apagou a var), o run **falha explicitamente**
      com razão `catalogo_ausente`
- [x] Nunca invocar o modelo sem biblioteca: escolher no vazio é pior que
      falhar
- [x] Teste com system customizado sem `{{catalogo}}`

### AC CM-3.4 — Output: ranking de até 3
- [x] Contrato:
      ```json
      [{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"..."},{"variant_id":"..."}]}]
      ```
- [x] A **ordem do array** é a preferência. Sem campo de rank redundante
- [x] Só a 1ª de cada posição leva `motivo`, com teto de 20 palavras
- [x] Menos de 3 adequadas na seção → devolve quantas houver
- [x] `max_tokens` de 2048 para **8192**

### AC CM-3.5 — Parser e validações
- [x] `parseCuratorRanking(raw, catalogo, sections)` substitui
      `parseAssemblerOutput`
- [x] `variant_id` inexistente no catálogo → descartado do ranking,
      registrado em `parsed_output.invalid_ids`
- [x] `variant_id` cujo `block_type` **não** é a seção daquela posição →
      descartado, registrado em `parsed_output.wrong_type_ids`.
      Necessário porque o catálogo agora vai inteiro, sem pré-separação
- [x] `block_index` fora da estrutura → ignorado, registrado
- [x] Duplicata do mesmo `variant_id` na mesma posição → mantém a primeira
- [x] Posição que sobra sem nenhum id válido → conta como **pulada**,
      alimentando `stats.skipped` (CM-2) e o selo (CM-7)

### AC CM-3.6 — Falha do Curador
- [x] Timeout, erro de rede ou JSON inválido → **retry 1×**
- [x] Segunda falha → `CuratorFailedError` com razão, **sem gravar
      arquitetura**. O run fica `status='error'` com a telemetria completa.
      **Nuance honesta:** o que o dispatch faz com a exceção é
      pré-existente — conta tentativa e, esgotadas as
      `MAX_ARCHITECT_ATTEMPTS`, settla como `failed` na fila, o que hoje
      significa cair no template global. Mudar isso para o email morrer de
      verdade afetaria todos os modos de falha do Architect, não só o
      Curador — fora do escopo desta story
- [x] Todas as posições sem id válido → `failed`, razão
      `curador_sem_escolhas`
- [x] **Não** existe mais fallback por score ou por ordem estável.
      Composição arbitrária é pior que falha visível

### AC CM-3.7 — Pré-filtro removido
- [x] `prefilterCandidates`, `scoreVariant`, `buildMatchContext`,
      `seededShuffle`, `seedFrom` e `DEFAULT_TOP_K` removidos junto com
      seus testes
- [x] `flowTypeToObjective` e `deriveToneKeys` (em
      `shared/component-dimensions.ts`) **permanecem** — `objectives` e
      `tones` continuam indo ao catálogo como informação para o Curador
      ler, e o derivador de componentes usa os mesmos helpers
- [x] `CHOOSER_TOP_K` removido
- [x] Nenhum import órfão; `npm run typecheck` limpo

### AC CM-3.8 — Consumo do rank 1
- [x] Enquanto CM-4 não existir, o código monta os `slots` com o **1º** de
      cada posição
- [x] `parsed_output.ranking` guarda o ranking completo, para CM-4 e para
      auditoria
- [x] Comportamento resultante é equivalente ao de hoje — a diferença é o
      pool de onde a escolha saiu

### AC CM-3.9 — Testes
- [x] Catálogo: ordem estável entre chamadas, agrupamento por
      `block_type`, ausência de `campos_copy`, exclusão de variante sem
      placeholder
- [x] Parser: id inexistente, tipo errado, `block_index` inválido,
      duplicata, posição vazia, JSON com fence, JSON com prosa em volta,
      JSON truncado
- [x] Falha: retry 1× e `failed` na segunda
- [x] Guard de catálogo ausente
- [x] Sem chamadas a `prefilterCandidates` em nenhum caminho

---

## Tarefas

- [x] Builder do catálogo (puro, testável)
- [x] Auditoria dos system prompts antes de ligar a renderização
- [x] `invokeAgent` renderiza system + guard de catálogo
- [x] `parseCuratorRanking` + validações
- [x] Retry e caminhos de falha
- [x] Migration: prompt novo do `assembler_chooser` + `max_tokens` 8192
- [x] Remover pré-filtro e shuffle, com os testes
- [x] Testes novos

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

## Achados durante a implementação

### 1. O CM-2 havia quebrado o settle da fila

`runArchitectForEmail` settla o email quando `referenceSource` está numa
lista fixa — que continha `llm`, `global` e `store`, mas **não** o `code`
introduzido no CM-2. Efeito: toda geração bem-sucedida contaria tentativa,
repagaria o Curador na segunda e terminaria como `failed`.

Corrigido, e a lista virou `SETTLED_REFERENCE_SOURCES` exportada, com teste
de **exaustividade** por `Record<ReferenceSource, boolean>`: adicionar um
valor novo à união quebra o typecheck até alguém decidir explicitamente se
settla ou re-tenta. Verificado injetando um valor novo — o typecheck acusa.

### 2. `replaceAll` com string interpreta `$&`

A primeira versão do `interpolateSystem` usava
`replaceAll('{{k}}', valor)`. Com string de substituição, `$&`, `$1` e `$'`
no **valor** são lidos como referências ao match. O catálogo carrega texto
livre de cadastro (nome com "R$", descrição com "$&"), então não era
hipotético. Trocado por replacement via função, com teste.

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
| 2026-07-30 | @dev (Dex) | `catalog-builder.ts` (catálogo estável, sem schema/html), `curator-ranking.parser.ts` (ranking + 6 validações), `interpolateSystem` + `systemVars` no `invokeAgent`, `cache_control` no caminho OpenRouter, guard de `{{catalogo}}`, retry 1× com `CuratorFailedError`. Pré-filtro removido inteiro (`component-deriver.ts` deletado — ficou sem consumidor). Migration `20261052`. 31 testes novos; agents+dispatch 893/893. **Dois achados abaixo.** Status → In Review |
