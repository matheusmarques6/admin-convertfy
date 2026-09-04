/**
 * Renderização do alvo do Seletor para os prompts (módulo PURO, testado).
 *
 * O MESMO bloco vai ao Estruturador (`<decisao_de_objecao>`) e ao Curador
 * (`<alvo>`); a diferença é só o texto de AUSÊNCIA — o Estruturador volta
 * a diagnosticar sozinho, o Curador volta a ler `<objecoes>` da loja. Sem
 * alvo declarado explicitamente, desligar o Seletor regrediria os dois.
 */

import { eixoObjecaoEquivalente } from "./aliviador-bridge"
import type { AlvoParaMedicao } from "../architect/curador-shadow"
import type { AlvoDoEmail } from "./vocabulario"

export const ALVO_AUSENTE_ESTRUTURADOR =
  "(sem decisão de objeção nesta geração — diagnostique você a objeção dominante em <perfil_da_marca> e cruze com o que a intenção deste email manda atacar)"

export const ALVO_AUSENTE_CURADOR =
  "(sem decisão de objeção nesta geração — <objecoes> é o que trava a compra desta loja; a variante escolhida precisa ter anatomia para responder à objeção que este email enfrenta)"

/** O alvo em linhas legíveis — o que o Estruturador e o Curador leem. */
export function renderAlvo(alvo: AlvoDoEmail | null | undefined, ausente: string): string {
  if (!alvo) return ausente
  const linhas: string[] = []
  linhas.push(`modo: ${alvo.modo}${alvo.trabalhos_fixos.length ? ` · trabalhos fixos: ${alvo.trabalhos_fixos.join(", ")}` : ""}`)
  if (alvo.lacuna) {
    linhas.push(`LACUNA: ${alvo.lacuna.motivo}${alvo.lacuna.detalhe ? ` — ${alvo.lacuna.detalhe}` : ""}`)
  }
  for (const a of alvo.alvos) {
    const eixos = eixoObjecaoEquivalente(a.tipo_de_risco, a.aliviador_pedido)
    linhas.push(
      `${a.primaria ? "ALVO PRIMÁRIO" : `ALVO ${a.ordem} (varredura)`} ${a.id} — "${a.objecao}"`,
      `  risco: ${a.tipo_de_risco ?? "?"} · aliviador pedido: ${a.aliviador_pedido ?? "?"} · profundidade de prova: ${a.profundidade_de_prova}` +
        (eixos.length ? ` · eixo objecao (vault) equivalente: ${eixos.join(", ")}` : ""),
      `  tratamento: ${a.tratamento}`,
    )
  }
  if (alvo.medos_alvo.length) linhas.push(`medos de categoria alvo: ${alvo.medos_alvo.join(" · ")}`)
  if (alvo.promessa_a_pagar) linhas.push(`promessa a pagar: ${alvo.promessa_a_pagar}`)
  if (alvo.dimensao_confianca) linhas.push(`dimensão de confiança: ${alvo.dimensao_confianca}`)
  if (alvo.angulo_do_tratamento.length) {
    linhas.push("veículos (ângulo do tratamento):")
    for (const g of alvo.angulo_do_tratamento) {
      linhas.push(`  ${g.ordem}. ${g.veiculo} — ${g.papel || "(sem papel declarado)"} · insumo disponível: ${String(g.insumo_disponivel)}`)
    }
  }
  if (alvo.suspeita_a_antecipar) linhas.push(`suspeita a antecipar: ${alvo.suspeita_a_antecipar}`)
  if (alvo.alerta_de_lastro) linhas.push(`ALERTA DE LASTRO: ${alvo.alerta_de_lastro}`)
  if (alvo.proibido_neste_toque.length) {
    linhas.push("proibido neste toque (força de veto):")
    for (const p of alvo.proibido_neste_toque) linhas.push(`  - ${p}`)
  }
  if (alvo.razao) linhas.push(`razão: ${alvo.razao}`)
  return linhas.join("\n")
}

/** `<objecoes_ja_atacadas>` do Estruturador — argumento, não estrutura. */
export function renderObjecoesJaAtacadas(alvo: AlvoDoEmail | null | undefined): string {
  const itens = alvo?.ja_atacadas ?? []
  if (itens.length === 0) return "(nenhuma — nenhum email anterior deste flow atacou objeção, ou o Seletor está desligado)"
  return itens
    .map((j) => `- ${j.id} · email #${j.email_number} · profundidade ${j.profundidade} · ${j.via === "primaria" ? "argumento principal" : "varredura"}`)
    .join("\n")
}

/** O que o medidor de veto do Curador precisa do alvo. */
export function alvoParaMedicao(alvo: AlvoDoEmail | null | undefined): AlvoParaMedicao | null {
  if (!alvo) return null
  const primaria = alvo.alvos.find((a) => a.primaria) ?? alvo.alvos[0]
  return { aliviador_pedido: primaria?.aliviador_pedido ?? null, proibicoes: alvo.proibido_neste_toque }
}
