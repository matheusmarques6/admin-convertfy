/**
 * Rascunho de aprendizado a partir do feedback sobre uma decisão do
 * CURADOR (módulo PURO, client-safe).
 *
 * Gêmeo do `estruturador/aprendizado-draft.ts`, com um assunto diferente: o
 * Estruturador erra a SEQUÊNCIA, o Curador erra o BLOCO que ocupa uma
 * posição. Por isso o corpo lista posição → variante escolhida → motivo, e
 * a regra proposta pergunta pelo bloco que deveria ter entrado.
 *
 * O caminho de volta ao agente é o mesmo do Estruturador: o COO revisa o
 * rascunho no Obsidian e o sync o serve como `email_learnings` do flow — o
 * Curador já lê essa tabela (`loadAprendizadosResumo`, bloco
 * `<aprendizados>`). Feedback NUNCA entra direto no prompt.
 *
 * Quando a queixa é "não existe bloco que faça isso", a nota certa não é
 * `aprendizado` e sim `lacuna` (`componentes/lacunas/`, servida em
 * `<lacunas_da_biblioteca>`) — o rascunho diz isso em vez de fingir que a
 * regra conserta o que falta na biblioteca.
 */

import type { FeedbackParaDraft } from "../estruturador/aprendizado-draft"

export interface EscolhaDoCurador {
  block_index?: number
  section?: string
  /** Papel decidido pelo Estruturador para esta posição, quando houve. */
  papel?: string
  variante?: string
  variant_id?: string
  motivo?: string
  justificativa?: string
}

export interface DraftCuradorInput {
  flowType: string
  emailNumber: number
  storeName: string
  runId: string
  /** ISO da run — o rascunho não lê o relógio (é reprodutível). */
  dataIso: string
  feedbacks: FeedbackParaDraft[]
  /** parsed_output da run `assembler_chooser` (tolerante a parcial). */
  output: {
    fio_narrativo?: string
    estrutura?: Array<{ section?: string; papel?: string }>
    ranking_justificado?: Array<{
      block_index?: number
      section?: string
      justificativa?: string
      escolhas?: Array<{ variant_id?: string; variante?: string; motivo?: string }>
    }>
    ranking_detalhado?: Array<{
      block_index?: number
      section?: string
      opcoes?: Array<{ variant_id?: string; name?: string; motivo?: string }>
    }>
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/**
 * Uma linha por posição, com a variante que venceu. Os dois formatos de
 * telemetria convivem (`ranking_justificado` é o do Curador do vault,
 * `ranking_detalhado` o do antigo) — ler só um deixava o rascunho vazio
 * justamente nas runs do agente vigente.
 */
export function escolhasDoCurador(
  output: DraftCuradorInput["output"],
): EscolhaDoCurador[] {
  const papelDe = new Map<string, string>()
  for (const p of output.estrutura ?? []) {
    if (p.section && p.papel) papelDe.set(p.section.toLowerCase(), p.papel)
  }
  const comPapel = (e: EscolhaDoCurador): EscolhaDoCurador => ({
    ...e,
    papel: e.section ? papelDe.get(e.section.toLowerCase()) : undefined,
  })

  const justificado = output.ranking_justificado ?? []
  if (justificado.length > 0) {
    return justificado.map((p) =>
      comPapel({
        block_index: p.block_index,
        section: p.section,
        justificativa: p.justificativa,
        variante: p.escolhas?.[0]?.variante ?? p.escolhas?.[0]?.variant_id,
        variant_id: p.escolhas?.[0]?.variant_id,
        motivo: p.escolhas?.[0]?.motivo,
      }),
    )
  }
  return (output.ranking_detalhado ?? []).map((p) =>
    comPapel({
      block_index: p.block_index,
      section: p.section,
      variante: p.opcoes?.[0]?.name ?? p.opcoes?.[0]?.variant_id,
      variant_id: p.opcoes?.[0]?.variant_id,
      motivo: p.opcoes?.[0]?.motivo,
    }),
  )
}

/** Determinístico: mesma run + mesmo feedback → mesmo rascunho. */
export function buildAprendizadoCuradorDraft(
  input: DraftCuradorInput,
): AprendizadoDraft {
  const dia = input.dataIso.slice(0, 10)
  const escolhas = escolhasDoCurador(input.output)
  const slug =
    slugify(`curadoria-${input.flowType}-${input.emailNumber}-${input.storeName}`) ||
    slugify(`curadoria-${input.flowType}-${input.emailNumber}`)

  const negativos = input.feedbacks.filter((f) => f.rating === "down")
  const positivos = input.feedbacks.filter((f) => f.rating === "up")

  const feedbackLinhas = input.feedbacks
    .map((f) => {
      const quem = f.autor?.trim() ? ` (${f.autor.trim()})` : ""
      const texto = f.comentario?.trim() || "(sem comentário)"
      return `- ${f.rating === "down" ? "👎" : "👍"}${quem}: ${texto}`
    })
    .join("\n")

  const escolhaLinhas = escolhas
    .map((e, i) => {
      const pos = typeof e.block_index === "number" ? e.block_index + 1 : i + 1
      const papel = e.papel ? ` — papel: ${e.papel}` : ""
      const motivo = e.motivo?.trim() ? `\n   motivo: ${e.motivo.trim()}` : ""
      return `${pos}. **${e.section ?? "?"}**${papel}\n   escolheu: ${e.variante ?? "(nenhuma)"}${motivo}`
    })
    .join("\n")

  const markdown = `---
tipo: aprendizado
status: proposta
origem: feedback-curador
flow: ${input.flowType}
email: ${input.emailNumber}
run_id: ${input.runId}
data: ${dia}
---

# Escolha de blocos — ${input.flowType} #${input.emailNumber} (${input.storeName})

> RASCUNHO gerado do feedback no Estúdio. Revise, generalize a regra
> (aprendizado corrige a ESCOLHA em uma condição, não uma loja) e mova para
> \`aprendizados/${input.flowType}/\` com o slug definitivo antes de aprovar.
>
> Se a queixa for "nenhum bloco da biblioteca faz isso", a nota certa é uma
> **lacuna** em \`componentes/lacunas/\` — ela é servida ao Curador em
> \`<lacunas_da_biblioteca>\` e pesa contra as candidatas que a carregam.

## O que o Curador escolheu

- **Fio narrativo**: ${input.output.fio_narrativo?.trim() || "—"}

${escolhaLinhas || "- (nenhuma escolha registrada nesta run)"}

## Feedback (${negativos.length} 👎 · ${positivos.length} 👍)

${feedbackLinhas || "- (nenhum comentário)"}

## Regra proposta

(escreva aqui a correção GENERALIZADA: em que condição a escolha está
errada, qual anatomia deveria ter vencido e por quê — é isto que o agente
vai ler)
`

  return {
    slug,
    path: `aprendizados/${input.flowType}/${slug}.md`,
    markdown,
  }
}
