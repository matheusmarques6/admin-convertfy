---
Prioridade: P1
Sprint: Backlog
Owner: "@architect"
Status: Draft
Epic: CM - Curador, Montador e Hero
---

# Épico CM — Curador, Montador e Hero

## Objetivo

Aumentar a variabilidade real da arquitetura por loja e tirar o LLM do
caminho da montagem do documento. Três movimentos:

1. O **Curador** deixa de escolher 1 entre 8 pré-filtradas e passa a
   **rankear até 3** sobre o catálogo inteiro da seção.
2. O **Montador** deixa de escrever HTML e passa a **escolher 1 entre 3**
   por posição, olhando o **email inteiro**.
3. A **montagem do documento vira código** — concatenação dos HTMLs
   canônicos das variantes escolhidas, na ordem, com marcadores.

Especificação completa, com os prompts na íntegra e os contratos de
output: [`docs/email-generation/agentes-curador-montador-hero.md`](../email-generation/agentes-curador-montador-hero.md).

## Fora de escopo

- **Hero finalizada fora do documento.** Avaliada e descartada em
  30/jul: o commit `408673b` (hero-graft) já entrega a variante canônica
  ao agente por enxerto, o que era o ganho pretendido.
- Texto, imagem, cores e QA. Só o que quebra neles está mapeado.
- Agente de Imagem: não é afetado.

## Stories

| # | Story | Estimate | Depende de |
|---|---|---|---|
| CM-1 | [Fix do renderer no system do hero](CM-1.hero-system-prompt-renderer-fix.md) | XS | — |
| CM-2 | [Montagem do documento por código](CM-2.concatenacao-documento-por-codigo.md) | M | — |
| CM-3 | [Curador rankeia top-3 sobre o catálogo inteiro](CM-3.curador-ranking-catalogo-completo.md) | L | — |
| CM-4 | [Montador vira selecionador de conjunto](CM-4.montador-selecao-de-conjunto.md) | M | CM-3 |
| CM-5 | [Relatório da hero e morte do full_doc](CM-5.hero-relatorio-e-fim-do-full-doc.md) | S | CM-2 |
| CM-6 | [Auditoria do rendered_html e hash de origem](CM-6.rendered-html-auditoria-e-hash.md) | M | CM-5 |
| CM-7 | [Selos de curadoria nos logs](CM-7.selos-de-curadoria-nos-logs.md) | S | CM-3, CM-4 |

Ordem sugerida: **CM-1 → CM-2 → CM-3 → CM-4 → CM-5 → CM-7 → CM-6**.

CM-1 é bug ativo e sai sozinha, hoje, sem depender do épico. CM-2 e CM-3
são independentes entre si — dá para paralelizar.

## Decisões tomadas (30/jul/2026)

| Tema | Decisão |
|---|---|
| Pré-filtro determinístico | Removido. O Curador vê o catálogo inteiro da seção |
| Quantidade por posição | Curador entrega **até 3**, em ordem de preferência |
| Quem decide o conjunto | Montador, vendo os finalistas de **todas** as posições de uma vez |
| Formato de output | UUID, não índice |
| Catálogo | No **system prompt**, ordem estável, para ativar prompt cache |
| Determinismo do shuffle | Abandonado. Estabilidade vem do guard de reuso do reference |
| Posição sem candidata | **Pulada** — o email sai com menos seções, com selo no log |
| Falha do Curador | Retry 1×, depois `failed`. Nunca composição arbitrária |
| Ranking no Montador | 1º por padrão; sair dele exige motivo. Consulta o histórico |
| `motivo` no rank 1 | **Proibido** — evita justificativa inventada e output inflado |
| Output da hero | Fragmento + relatório do que descartou (relatório opcional) |
| `rendered_html` | Deveria ser HTML estrutural; auditar os dados antes de reintroduzir |

## Métrica de sucesso

- **Variabilidade**: distribuição de `variant_id` por `flow_type ×
  email_number` entre lojas. Hoje concentrada pelo score + top-8; a meta é
  cauda mais longa sem perder adequação.
- **Desvios do ranking** (`parsed_output.desvios` do Montador): se ficar
  perto de 0, o Curador está rankeando bem e a segunda passada é barata;
  se passar de ~40%, o critério do Curador precisa revisão.
- **Custo por email**: o Montador sai de 16k tokens de output para ~500. O
  Curador ganha input maior, compensado pelo cache do catálogo.
- **Tags de imagem perdidas**: hoje um guard mede `image_tags_dropped`
  causado pelo Montador. Com montagem por código, tem que ir a zero por
  construção.
