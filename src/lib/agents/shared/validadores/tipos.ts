/**
 * Tipos dos validadores do contrato de decisão (Passo 8 do plano de
 * set/2026). Um validador compara o que um nó ENTREGOU (escolha do Curador,
 * resgate por código, blueprint) com o que a `DecisaoDoEmail` manda, e
 * devolve violações — nunca corrige sozinho: quem corrige é o call site,
 * sob o gate `contrato_estrutural` (`off` | `shadow` | `on`).
 *
 * `high` = a peça sairia contrária à decisão (cupom numa peça sem
 * incentivo, CTA negado, grade maior que o máximo). `medium` = concessão
 * de redação que a copy compensa (preço/avaliação ausentes). A régua é a
 * mesma de `resgate-de-posicao.ts`: anatomia é cara, redação é barata.
 */

export type SeveridadeDaViolacao = "high" | "medium"

export interface Violacao {
  tipo: string
  severidade: SeveridadeDaViolacao
  block_index: number
  section: string | null
  variant_id: string | null
  campo?: string
  evidencia: string
  esperado: string
}

export interface ResultadoValidacao {
  ok: boolean
  violacoes: Violacao[]
  /**
   * Regras que o contrato prevê e ainda não podem rodar por falta de dado
   * tipado — `dispositivo` nasce em B3. Declarado para o painel não ler
   * "zero violações" como "tudo conferido".
   */
  regra_pendente: string[]
}

export const REGRAS_PENDENTES = ["dispositivo"] as const

export function resultado(violacoes: Violacao[]): ResultadoValidacao {
  return {
    ok: !violacoes.some((v) => v.severidade === "high"),
    violacoes,
    regra_pendente: [...REGRAS_PENDENTES],
  }
}
