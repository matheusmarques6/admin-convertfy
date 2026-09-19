/**
 * Rascunho de aprendizado a partir do feedback sobre uma decisão do
 * SELETOR (módulo PURO, client-safe) — S4, 19/09.
 *
 * Terceiro irmão de `estruturador/aprendizado-draft.ts` e
 * `architect/aprendizado-curador.ts`. O Estruturador erra a SEQUÊNCIA, o
 * Curador erra o BLOCO; o Seletor erra o ALVO — a objeção escolhida, o
 * aliviador pedido, a profundidade, o que proibiu. O corpo lista isso, e a
 * regra proposta pergunta pelo alvo que deveria ter sido escolhido.
 *
 * Quando a queixa é "o dado existe e o Seletor proibiu", a correção não é
 * aprendizado: é a FICHA OPERACIONAL da loja (é para lá que a pendência
 * dele já aponta). O rascunho diz isso para a nota não tentar consertar
 * por regra o que falta como dado.
 */

import type { FeedbackParaDraft } from "../estruturador/aprendizado-draft"

export interface DraftSeletorInput {
  flowType: string
  emailNumber: number
  storeName: string
  runId: string
  /** ISO da run — o rascunho não lê o relógio (é reprodutível). */
  dataIso: string
  feedbacks: FeedbackParaDraft[]
  /** parsed_output da run `seletor` (tolerante a parcial). */
  output: {
    modo?: string
    alvos?: Array<{ id?: string; objecao?: string; aliviador_pedido?: string; profundidade_de_prova?: string; primaria?: boolean }>
    criterio_de_selecao?: string
    razao?: string
    proibido_neste_toque?: string[]
    alertas_de_dado?: string[]
    lacuna?: { motivo?: string; detalhe?: string | null } | null
  }
}

export interface AprendizadoDraft {
  slug: string
  path: string
  markdown: string
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Determinístico: mesma run + mesmo feedback → mesmo rascunho. */
export function buildAprendizadoSeletorDraft(input: DraftSeletorInput): AprendizadoDraft {
  const dia = input.dataIso.slice(0, 10)
  const slug =
    slugify(`selecao-${input.flowType}-${input.emailNumber}-${input.storeName}`) ||
    slugify(`selecao-${input.flowType}-${input.emailNumber}`)

  const negativos = input.feedbacks.filter((f) => f.rating === "down")
  const positivos = input.feedbacks.filter((f) => f.rating === "up")

  const feedbackLinhas = input.feedbacks
    .map((f) => {
      const quem = f.autor?.trim() ? ` (${f.autor.trim()})` : ""
      const texto = f.comentario?.trim() || "(sem comentário)"
      return `- ${f.rating === "down" ? "👎" : "👍"}${quem}: ${texto}`
    })
    .join("\n")

  const alvoLinhas = (input.output.alvos ?? [])
    .map((a, i) => {
      const marca = a.primaria ? " (primária)" : ""
      return `${i + 1}. **${a.id ?? "?"}**${marca} — ${a.objecao?.trim() || "(objeção sem texto)"}\n   aliviador: ${a.aliviador_pedido ?? "?"} · profundidade: ${a.profundidade_de_prova ?? "?"}`
    })
    .join("\n")

  const proibicoes = (input.output.proibido_neste_toque ?? []).map((p) => `- ${p}`).join("\n")
  const alertas = (input.output.alertas_de_dado ?? []).map((p) => `- ${p}`).join("\n")
  const lacuna = input.output.lacuna?.motivo
    ? `- **Lacuna declarada**: ${input.output.lacuna.motivo}${input.output.lacuna.detalhe ? ` — ${input.output.lacuna.detalhe}` : ""}`
    : ""

  const markdown = `---
tipo: aprendizado
status: proposta
origem: feedback-seletor
flow: ${input.flowType}
email: ${input.emailNumber}
run_id: ${input.runId}
data: ${dia}
---

# Alvo do toque — ${input.flowType} #${input.emailNumber} (${input.storeName})

> RASCUNHO gerado do feedback no Estúdio. Revise, generalize a regra
> (aprendizado corrige a ESCOLHA DO ALVO em uma condição, não uma loja) e
> mova para \`aprendizados/${input.flowType}/\` com o slug definitivo antes
> de aprovar.
>
> Se a queixa for "o dado existe e o Seletor proibiu afirmá-lo", a correção
> é a **ficha operacional** da loja (aba Pesquisa → Ficha operacional), não
> uma nota: o Seletor já registra ali o que lhe faltou.

## O que o Seletor decidiu

- **Modo**: ${input.output.modo ?? "—"}
- **Critério**: ${input.output.criterio_de_selecao?.trim() || "—"}
- **Razão**: ${input.output.razao?.trim() || "—"}
${lacuna}

${alvoLinhas || "- (nenhum alvo — modo sem objeção ou lacuna)"}

### Proibições deste toque

${proibicoes || "- (nenhuma)"}

### Alertas de dado (o que a pesquisa não confirmou)

${alertas || "- (nenhum)"}

## Feedback (${negativos.length} 👎 · ${positivos.length} 👍)

${feedbackLinhas || "- (nenhum comentário)"}

## Regra proposta

(escreva aqui a correção GENERALIZADA: em que condição o alvo está errado,
qual objeção/aliviador/profundidade deveria ter vencido e por quê — é isto
que o agente vai ler)
`

  return { slug, path: `aprendizados/${input.flowType}/${slug}.md`, markdown }
}
