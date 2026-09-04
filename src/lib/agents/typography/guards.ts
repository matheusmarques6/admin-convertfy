/**
 * Guards ESTRUTURAIS da tipografia — "o documento continua o mesmo?".
 *
 * Não confundir com `rules.ts`: lá ficam as regras de GOSTO (teto de família
 * secundária, piso de 16px, escala de pesos), que descartam op a op e valem
 * para o agente. Aqui é o cinto que vale para qualquer escrita de tipografia,
 * humana ou de modelo: este passo só reescreve declarações de estilo, então
 * a contagem de tabelas e a de declarações de fonte são INVARIANTES. Se
 * alguma mudou, algo saiu do escopo e o resultado é recusado inteiro.
 *
 * Vivia solto dentro do STEP 3.5 do phase2-runner. Virou módulo quando a
 * tela do email passou a escrever tipografia pela rota: os dois caminhos
 * gravam no mesmo HTML, e um guard que existe só num deles é um guard que
 * não existe.
 *
 * Puro (zero I/O) — testável.
 */

import { extractTypographyInventory } from "./inventory"

export interface GuardEstruturalResult {
  ok: boolean
  /** Código legível do que quebrou — vai para o log e para a telemetria. */
  violacao: string | null
}

function contarTabelas(html: string): number {
  return (html.match(/<table[\s>]/gi) ?? []).length
}

/**
 * Compara o documento de saída com o de entrada. `inventarioAntes` é
 * opcional só para poupar uma varredura de quem já o tem em mãos (o runner
 * extrai o inventário para montar o prompt).
 */
export function checarInvariantesDeTipografia(
  antes: string,
  depois: string,
  inventarioAntes?: number,
): GuardEstruturalResult {
  if (contarTabelas(depois) !== contarTabelas(antes)) {
    return { ok: false, violacao: "table_count_changed_by_typography" }
  }
  const total = inventarioAntes ?? extractTypographyInventory(antes).length
  if (extractTypographyInventory(depois).length !== total) {
    return { ok: false, violacao: "font_declaration_count_changed" }
  }
  return { ok: true, violacao: null }
}
