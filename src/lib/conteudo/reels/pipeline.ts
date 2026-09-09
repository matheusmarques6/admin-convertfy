/**
 * Pipeline de Reels: as etapas do kanban e a meta por funil.
 *
 * O que este módulo decide, e por que não pode ficar na tela:
 *
 * - **A ordem das etapas é o fluxo de trabalho.** Ideia → roteiro → gravar
 *   → editar → agendado → publicado. Errar a ordem faz o card "voltar" no
 *   arrasto e o operador perde a confiança no board.
 * - **A meta por funil é semanal e conta o que SAIU**, não o que existe: um
 *   card parado em "gravar" há três semanas não é uma publicação feita.
 *   Contar o backlog como progresso é o jeito mais fácil de uma meta mentir.
 * - **A posição é fracionária.** Arrastar entre dois cards insere no meio
 *   sem reescrever a coluna inteira — e sem isso, dois arrastos simultâneos
 *   embaralham a coluna.
 *
 * Puro e testado. Quem lê o banco é o serviço; quem desenha é a tela.
 */

import type { EtapaFunil } from "../types"

export type EtapaReel = "ideias" | "roteiro" | "gravar" | "editar" | "agendado" | "publicado"

export const ETAPAS: EtapaReel[] = ["ideias", "roteiro", "gravar", "editar", "agendado", "publicado"]

export const ETAPA_LABEL: Record<EtapaReel, string> = {
  ideias: "Ideias",
  roteiro: "Roteiro",
  gravar: "Gravar",
  editar: "Editar",
  agendado: "Agendado",
  publicado: "Publicado",
}

export const FUNIL_LABEL: Record<EtapaFunil, string> = {
  topo: "Topo",
  meio: "Meio",
  fundo: "Fundo",
}

/** O que cada faixa do funil faz, e a meta semanal padrão da casa. */
export const FUNIL_META: Record<EtapaFunil, { titulo: string; descricao: string; meta: number; cor: string }> = {
  topo: { titulo: "Topo de funil", descricao: "Ganchos e afirmações fortes", meta: 2, cor: "#3B82F6" },
  meio: { titulo: "Meio de funil", descricao: "Listas, mecanismo, comparações", meta: 2, cor: "#10B981" },
  fundo: { titulo: "Fundo de funil", descricao: "Bastidor, prova, convite", meta: 1, cor: "#0E7490" },
}

export const FUNIS: EtapaFunil[] = ["topo", "meio", "fundo"]

export function ehEtapaReel(v: unknown): v is EtapaReel {
  return typeof v === "string" && (ETAPAS as string[]).includes(v)
}

export function ehFunil(v: unknown): v is EtapaFunil {
  return v === "topo" || v === "meio" || v === "fundo"
}

export interface ReelParaProgresso {
  funil: EtapaFunil
  etapa: EtapaReel
  /** ISO da publicação (quando publicado). */
  publicadoEm?: string | null
  /** ISO do agendamento (quando agendado). */
  agendadoPara?: string | null
}

export interface ProgressoFunil {
  funil: EtapaFunil
  /** Publicados + agendados DENTRO da semana. */
  feitos: number
  meta: number
  /** Quantos ainda estão em produção (não contam como feitos). */
  emProducao: number
}

/** Segunda-feira 00:00 da semana de `referencia`, no horário local. */
export function inicioDaSemana(referencia: Date): Date {
  const d = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate())
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

/**
 * Progresso da semana por funil.
 *
 * Conta publicado E agendado: o agendado já saiu das mãos de quem produz e
 * tem data — tratá-lo como pendente faria a meta acusar atraso na
 * quinta-feira de uma semana que já está resolvida. O que está em produção
 * aparece separado, porque é outra pergunta ("tem material vindo?").
 */
export function progressoDaSemana(reels: ReelParaProgresso[], referencia = new Date(), metas = FUNIL_META): ProgressoFunil[] {
  const inicio = inicioDaSemana(referencia).getTime()
  const fim = inicio + 7 * 24 * 3600 * 1000

  const naSemana = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return Number.isFinite(t) && t >= inicio && t < fim
  }

  return FUNIS.map((funil) => {
    const doFunil = reels.filter((r) => r.funil === funil)
    const feitos = doFunil.filter((r) =>
      r.etapa === "publicado" ? naSemana(r.publicadoEm) : r.etapa === "agendado" && naSemana(r.agendadoPara),
    ).length
    const emProducao = doFunil.filter((r) => r.etapa !== "publicado" && r.etapa !== "agendado").length
    return { funil, feitos, meta: metas[funil].meta, emProducao }
  })
}

/**
 * Como o card aparece no CALENDÁRIO. As cinco chaves são as mesmas da
 * legenda de lá (onde documento do Estúdio e reel convivem), então o
 * vocabulário é um só na tela: quem olha o dia 12 não precisa saber se
 * aquela pílula nasceu no Estúdio ou no pipeline.
 *
 * `roteiro`, `gravar` e `editar` viram "pronto"? Não: viram `producao` — o
 * "pronto" do Estúdio é peça FECHADA esperando data, e chamar de pronto o
 * que ainda está sendo gravado faria o calendário prometer o que não existe.
 */
export type StatusNoCalendario = "publicado" | "agendado" | "producao" | "ideia"

export function statusNoCalendario(etapa: EtapaReel): StatusNoCalendario {
  if (etapa === "publicado") return "publicado"
  if (etapa === "agendado") return "agendado"
  if (etapa === "ideias") return "ideia"
  return "producao"
}

/**
 * Nova posição ao soltar o card ENTRE `antes` e `depois` (ambos opcionais:
 * topo da coluna e fim da coluna). Fracionário de propósito — ver o
 * cabeçalho.
 */
export function posicaoEntre(antes: number | null, depois: number | null): number {
  if (antes == null && depois == null) return 0
  if (antes == null) return (depois as number) - 1
  if (depois == null) return antes + 1
  return (antes + depois) / 2
}

/** Duração legível: 45 → "45s", 90 → "1min30", 60 → "1min". */
export function duracaoLabel(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos) || segundos <= 0) return ""
  if (segundos < 60) return `${Math.round(segundos)}s`
  const min = Math.floor(segundos / 60)
  const resto = Math.round(segundos % 60)
  return resto === 0 ? `${min}min` : `${min}min${String(resto).padStart(2, "0")}`
}
