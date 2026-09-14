/**
 * Decisão × entregue (B6) — o MESMO objeto para a API do e-mail, a métrica
 * dos logs e a tela (regra do `agent-executions.ts`: dois montadores
 * divergem e aparecem como "o painel mudou sozinho").
 */
import type { LinhaDeConformidade, ResumoDeConformidade } from "@/lib/agents/shared/conformidade"

export type { LinhaDeConformidade, ResumoDeConformidade }

export interface ConformidadeDoEmail {
  email_id: string
  batch_id: string | null
  decisao_presente: boolean
  linhas: LinhaDeConformidade[]
  resumo: ResumoDeConformidade
  /** Centavos (4 casas) gastos até a run do primeiro nó responsável; null sem divergência. */
  custo_ate_divergencia_cents: number | null
  custo_total_cents: number
}

export interface ConformidadeAgregada {
  emails: number
  posicoes: number
  conformes: number
  divergentes: number
  nao_avaliadas: number
  por_no: Partial<Record<"assembler_chooser" | "assembler" | "blueprint" | "seed" | "copy", number>>
  /** Quantos e-mails da janela entraram na conta (teto declarado). */
  amostra: number
  truncada: boolean
}
