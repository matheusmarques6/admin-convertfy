/**
 * Rascunho de aprendizado a partir do feedback do COO (fase 4 — módulo
 * PURO, client-safe).
 *
 * O ciclo de calibração do Estruturador NÃO injeta feedback no prompt: o
 * caminho de volta é o vault (decisão 7/9 do ADR — material aprovado +
 * curadoria a-posteriori). Este módulo transforma run + feedback num
 * RASCUNHO de nota `aprendizado` no formato que o vault-parser valida
 * (`tipo: aprendizado`, corpo em markdown); o COO revisa no Obsidian e o
 * sync o serve ao agente na geração seguinte — já com peso de camada 2
 * (aprendizados CORRIGEM referências).
 */

export interface FeedbackParaDraft {
  rating: "up" | "down"
  comentario: string | null
  autor?: string | null
}

export interface DraftInput {
  flowType: string
  emailNumber: number
  storeName: string
  runId: string
  /** ISO date da run (o draft não usa Date.now — reprodutível). */
  dataIso: string
  feedbacks: FeedbackParaDraft[]
  /** parsed_output da run (shape do EstruturadorOutput, tolerante a parcial). */
  output: {
    diagnostico?: {
      objecao_dominante?: string
      referencia_base?: string
      traducao_do_mecanismo?: string
    }
    estrutura?: Array<{ section?: string; papel?: string; referencia?: string; porque?: string }>
    fio_narrativo?: string
    aprendizados_aplicados?: Array<{ slug?: string }>
  }
}

export interface AprendizadoDraft {
  /** Sugestão de slug (= nome do arquivo, identificador canônico do vault). */
  slug: string
  /** Caminho sugerido dentro do vault. */
  path: string
  /** Conteúdo markdown completo (frontmatter + corpo). */
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
 * Monta o rascunho. Determinístico: mesma run + mesmo feedback → mesmo
 * draft (a data vem da run, não do relógio).
 */
export function buildAprendizadoDraft(input: DraftInput): AprendizadoDraft {
  const dia = input.dataIso.slice(0, 10)
  const objecao = input.output.diagnostico?.objecao_dominante?.trim() || "objeção não registrada"
  const slug = slugify(`proposta-${input.flowType}-${input.emailNumber}-${objecao}`) ||
    slugify(`proposta-${input.flowType}-${input.emailNumber}`)
  const sequencia = (input.output.estrutura ?? [])
    .map((p) => p.section)
    .filter(Boolean)
    .join(" → ")

  const negativos = input.feedbacks.filter((f) => f.rating === "down")
  const positivos = input.feedbacks.filter((f) => f.rating === "up")

  const feedbackLinhas = input.feedbacks
    .map((f) => {
      const quem = f.autor?.trim() ? ` (${f.autor.trim()})` : ""
      const texto = f.comentario?.trim() || "(sem comentário)"
      return `- ${f.rating === "down" ? "👎" : "👍"}${quem}: ${texto}`
    })
    .join("\n")

  const estruturaLinhas = (input.output.estrutura ?? [])
    .map((p, i) => {
      const ref = p.referencia ? ` — ref: ${p.referencia}` : ""
      return `${i + 1}. **${p.section ?? "?"}** — ${p.papel ?? "(sem papel)"}${ref}`
    })
    .join("\n")

  const markdown = `---
tipo: aprendizado
status: proposta
origem: feedback-coo
flow: ${input.flowType}
email: ${input.emailNumber}
run_id: ${input.runId}
data: ${dia}
---

# ${objecao} — ${input.flowType} #${input.emailNumber} (${input.storeName})

> RASCUNHO gerado do feedback no Estúdio. Revise, generalize a regra
> (aprendizado corrige REFERÊNCIA, não uma loja) e mova para
> \`aprendizados/${input.flowType}/\` com o slug definitivo antes de aprovar.

## O que o agente decidiu

- **Objeção dominante**: ${objecao}
- **Referência base**: ${input.output.diagnostico?.referencia_base ?? "—"}
- **Tradução do mecanismo**: ${input.output.diagnostico?.traducao_do_mecanismo ?? "—"}
- **Sequência**: ${sequencia || "—"}
- **Fio narrativo**: ${input.output.fio_narrativo ?? "—"}

${estruturaLinhas ? `## Estrutura decidida\n\n${estruturaLinhas}\n` : ""}
## Feedback (${negativos.length} 👎 · ${positivos.length} 👍)

${feedbackLinhas || "- (nenhum comentário)"}

## Regra proposta

(escreva aqui a correção GENERALIZADA: qual escolha estava errada, em que
condição, e o que fazer no lugar — é isto que o agente vai ler)
`

  return {
    slug,
    path: `aprendizados/${input.flowType}/${slug}.md`,
    markdown,
  }
}
