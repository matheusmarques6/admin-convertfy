# Telemetria e UI de Proveniência no Estúdio — **IMPLEMENTADO**

> **Status (27/08/2026)**: os 4 PRs foram entregues. Este documento deixou
> de ser plano e passou a descrever o que existe. O que mudou de rota está
> na seção "O que o caminho ensinou", no fim.

**Objetivo**: o drill-down do Estúdio (abas Execuções e Teste) mostra, para
CADA nó de CADA geração real, exatamente o que os artifacts "Anatomia de uma
Geração" e "Ensaio de Geração" mostram hoje: **Entrada** estruturada com
origem, **Prompt** segmentado por proveniência (template do agente · dados
da loja · biblioteca · saída de agente anterior · curadoria global · vault ·
derivado por código) e **Saída** legível — sem reconstrução a posteriori.

**Princípio**: a segmentação nasce NO MOMENTO da montagem do prompt, nunca é
re-derivada. Quem monta as vars sabe a origem de cada uma; gravar isso custa
um objeto a mais na run. Reconstruir depois (como foi preciso fazer para as
runs de 24/08) é o modo de falha que este plano elimina.

## Fundação (dados)

**T1 — Helper puro `prompt-provenance.ts`** (`src/lib/agents/shared/`):
`buildSegmentedPrompt(template, vars, origins)` onde `origins:
Record<varName, { cls, rotulo }>` com `cls ∈ agente|loja|biblioteca|
upstream|curadoria|vault|sistema`. Corta o template nos `{{placeholders}}`:
trecho literal → segmento `agente`; var → segmento com a origem declarada.
Devolve `{ prompt, segments }` — o `prompt` recomposto é byte-idêntico ao
render atual (mesma semântica do renderImageTemplate; testes garantem).
Um call site migrado = uma lista de origins de ~10 linhas.

**T2 — Migration**: `email_generation_runs.prompt_segments jsonb` +
`input_summary jsonb`. `prompt_segments` = `[{cls, rotulo, chars, texto?}]`;
`input_summary` = a Entrada estruturada `[{rotulo, cls, valor|resumo}]`.
`input_vars` e `rendered_prompt` continuam como estão (compat total).

**T3 — Regra de tamanho**: segmento acima de ~16k chars grava
`{cls, rotulo, chars, sha8, ref}` em vez do texto (caso único hoje: o
catálogo do Curador, ~120k). A UI resolve `ref` sob demanda
(`GET /api/admin/agents/prompt-segment?run=…&ref=catalogo` reconstrói por
`buildCatalog` + confere o sha8 — mesma técnica da reconstrução de 26/08,
mas verificada por hash).

**T4 — Cobertura por agente** (ordem de valor):
1. estruturador · assembler_chooser · assembler — fase 1, onde a decisão
   editorial mora (chooser/assembler já gravam rendered_prompt desde 26/08;
   falta segmentar);
2. subject · blueprint (input_summary; blueprint não tem prompt) ·
   copy_dispatch (payload como input_summary tipado);
3. chains da fase 2 (hero_section, image, image_format, color_format, qa) —
   os chains montam prompts próprios; mesmo helper, origins por chain;
4. callback de copy (auditoria como input_summary).

## UI (Estúdio)

**U1 — `PromptProvenanceView`** (`components/agent-studio/`): porte do
render dos artifacts (legenda + blocos com borda/cor por classe + selo por
segmento). Cores/classes idênticas às do ensaio. `NodeRunPanel` aba Prompt:
usa `prompt_segments` quando existir; fallback = texto plano atual (runs
antigas continuam legíveis).

**U2 — Entrada estruturada**: aba Entrada renderiza `input_summary` como
lista com chips de origem; fallback = JSON de `input_vars`.

**U3 — Saídas legíveis por agente**: já existem para copy_merge/
image_format (tabela campo a campo) e estruturador (embasamento). Estender:
chooser = ranking com motivos por posição; assembler = escolha + rank +
motivo; blueprint = blocks (papel/forma/fields); subject = par
subject/messaging. Padrão: componente por agente lendo `parsed_output`
(sem mudança de schema).

**U4 — Aba Teste**: usa o MESMO `NodeRunPanel` — herda tudo sem trabalho.

## Entregas (todas concluídas)

| PR | Commit | O que entregou |
|----|--------|----------------|
| 1 | `88952e8` | Helper + migration 20261085 + callback + fase 1 inteira segmentada + `PromptProvenanceView` no Estúdio + endpoint de `ref` |
| 2 | `5dbcdf0` | Dispatch com identidade (batch/email) + nó próprio "Dispatch" no grafo + callback de copy com batch e chars por bloco + saídas legíveis da fase 1 |
| 3 | `8dfad7e` | Fase 2 inteira: 3 chains + imagem por partes + **QA gravando prompt pela primeira vez** + determinísticos com Entrada |
| 4 | — | Paridade (campaign_image, component_test, imagem manual, avatares, teste de referência, fallback de copy), views de hero/imagem/QA, contrato e esta documentação |

**Guard-rails**: telemetria NUNCA bloqueia geração (todo write de segmento é
best-effort, mesmo padrão das runs); `prompt_segments` ausente nunca quebra a
UI; recomposição `segments → prompt` coberta por teste em cada agente
migrado (é a prova de que a marcação não mente).

*Criado em 26/08/2026 — decorrência direta dos artifacts "Anatomia de uma
Geração" (runs de 24/08 sem prompt persistido) e "Ensaio de Geração" (o
alvo de qualidade).*

---

## O que o caminho ensinou (mudanças de rota)

O plano previa fail-open sempre que o corte fosse difícil. Na prática, três
coisas mudaram o desenho:

1. **O guard virou a recomposição, não o formato do template.** Cada call
   site compara os segmentos com o prompt REALMENTE enviado e só grava a
   marcação quando batem. A invariante passou a ser verificada a cada run em
   produção, não só nos testes — e é o que torna seguro cortar prompts de
   renderers diferentes.
2. **Três dialetos, não um.** `{{var}}` (renderImageTemplate), `{var}`
   (renderImagePrompt, no prompt de imagem in-code) e o renderer próprio do
   QA, mais estrito. O helper ganhou o parâmetro `dialeto`; o guard cobre o
   resto.
3. **Block helper deixou de ser fail-open.** `{{#if}}`/`{{#case}}` são
   pré-resolvidos pela MESMA função do renderer (`resolveBlockHelpers`) antes
   do corte — sem isso o `campaign_image`, cujo prompt no banco é gated por
   `{{#if INCLUDE_*}}`, nunca teria proveniência. O trecho que sobrevive ao
   condicional é template, e sai marcado como tal.

E um caso que virou decisão de produto: o template do agente de **hero** era
o único da fase 2 com condicional. Em vez de deixá-lo opaco, o `{{#if}}` saiu
do template e a seção passa a ser montada no código
(`heroDesignSystemBlock`) — com teste provando que o texto enviado ao modelo
é byte-idêntico, com e sem `design_system`.

## Gaps fechados no caminho (que não estavam no plano)

- O **QA** nunca gravou prompt nenhum — o `userPrompt` existia montado a uma
  linha do `startGenerationRun`.
- O **`text_format`** era o único chain sem `withUsage`: erro de parse
  fechava a run com 0 token, $0 e sem prompt.
- O **dispatch** não tinha email/flow/batch — o payload ficava gravado e
  inalcançável pelas duas abas do Estúdio.
- A **regeneração manual de imagem** gravava o prompt truncado em 2.000
  chars e não registrava falha nenhuma.
- O **teste de prompt da aba Referências** gerava imagem paga sem gravar run.
- O `usageOf` (`chains/step-usage.ts`) **valida e copia campo a campo**:
  campo novo que não seja copiado explicitamente atravessa o guard e some.

## Pendências conhecidas

- `resolve-block-prompt.service` **não** aplica
  `productRefFidelityInstruction`, que o `phase2-runner` aplica: a imagem
  regenerada manualmente recebe um prompt diferente da gerada pelo pipeline.
  Divergência anterior a este épico; corrigi-la muda um prompt de produção.
- A view da lista (`v_email_generation_logs`) não expõe as colunas novas —
  **de propósito**: payloads só no drill-down por id.
- O agente de **QA** segue fora do fluxo (`EMAIL_QA_ENABLED != 'true'`), por
  decisão de produto anterior. A telemetria dele está pronta para quando
  religarem.

*Criado em 26/08/2026 como plano; concluído em 27/08/2026.*
