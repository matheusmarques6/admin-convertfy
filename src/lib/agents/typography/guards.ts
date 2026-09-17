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

/** Teto de aumento de fonte em relação ao original da variante (Passo 14). */
export const FATOR_MAX_AUMENTO = 1.25

export interface FaixaDeFonteResult {
  ok: boolean
  /** Itens (índice do inventário) que saíram da faixa, com o de/para. */
  fora: Array<{ index: number; de: number; para: number; motivo: "reduzida" | "acima_do_teto" }>
}

/**
 * Nenhum texto pode ficar MENOR que a variante o entregou, nem mais de
 * 1,25× maior — sem teto absoluto, porque o tamanho da biblioteca é
 * decisão de quem a desenhou (Passo 14). Compara item a item, pelo índice
 * do inventário (a contagem é invariante — `checarInvariantesDeTipografia`
 * já garante). Item sem tamanho declarado num dos lados fica de fora.
 */
export function checarReducaoDeFonte(antes: string, depois: string): FaixaDeFonteResult {
  const a = extractTypographyInventory(antes)
  const d = extractTypographyInventory(depois)
  const fora: FaixaDeFonteResult["fora"] = []
  const n = Math.min(a.length, d.length)
  for (let i = 0; i < n; i++) {
    const de = a[i].sizePx
    const para = d[i].sizePx
    if (de == null || para == null || de <= 0) continue
    if (para < de) fora.push({ index: a[i].index, de, para, motivo: "reduzida" })
    else if (para > de * FATOR_MAX_AUMENTO + 0.01) fora.push({ index: a[i].index, de, para, motivo: "acima_do_teto" })
  }
  return { ok: fora.length === 0, fora }
}
