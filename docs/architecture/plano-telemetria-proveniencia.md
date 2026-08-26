# Plano — Telemetria e UI de Proveniência no Estúdio

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

## Entregas (PRs pequenos, cada um utilizável sozinho)

| PR | Conteúdo | Critério de aceite |
|----|----------|--------------------|
| 1 | T1 + T2 + T4.1 + U1 | Geração nova → Prompt segmentado no Estúdio p/ Estruturador, Curador e Montador; byte-igual ao prompt enviado (teste de recomposição) |
| 2 | T4.2 + U2 + U3 (chooser/assembler/blueprint/subject) | Entrada estruturada + saídas legíveis na fase 1 inteira |
| 3 | T3 + T4.3 | Fase 2 segmentada; catálogo por ref+sha8 |
| 4 | T4.4 + U3 (restante) + varredura de paridade | Toda run nova, de todo agente, com as 3 abas na qualidade do ensaio |

**Guard-rails**: telemetria NUNCA bloqueia geração (todo write de segmento é
best-effort, mesmo padrão das runs); `prompt_segments` ausente nunca quebra a
UI; recomposição `segments → prompt` coberta por teste em cada agente
migrado (é a prova de que a marcação não mente).

*Criado em 26/08/2026 — decorrência direta dos artifacts "Anatomia de uma
Geração" (runs de 24/08 sem prompt persistido) e "Ensaio de Geração" (o
alvo de qualidade).*
