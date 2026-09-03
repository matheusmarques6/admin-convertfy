/**
 * Direção fotográfica das variantes (migration 20261060), indexada por
 * `variant_id`.
 *
 * Vivia privada dentro do `phase2-runner.service.ts`, e por isso o caminho
 * da regeneração manual (`resolve-block-prompt.service`) nunca a carregou:
 * a var `PHOTO_DIRECTION` saía VAZIA e a imagem regerada à mão perdia a
 * direção de arte escrita no cadastro da variante. Módulo próprio para os
 * dois caminhos lerem do mesmo lugar.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("PhotoDirections")

/**
 * MEDIDA de produção — cota, formato de arquivo, escala, peso.
 *
 * A direção fotográfica é escrita para designer e traz, junto com a prosa
 * da foto, a ficha técnica do ativo: "Círculo da foto de Ø304px… com o
 * topo a 24px da borda", "Ativo final 544 × 424px (2x)", "PNG, < 110 KB".
 * Tudo isso ia INTEIRO ao gerador como PRIMARY BRIEF — e em 02/09 o
 * Welcome 1 da Innova Bay saiu com "24px" e "Ø304px" DESENHADOS dentro das
 * duas fotos do comparativo. O gerador reproduz o material que recebe; a
 * regra "no text" não vence uma cota escrita no brief.
 *
 * A primeira resposta (02/09) apagava a LINHA inteira que tivesse cota. Foi
 * longe demais: "Regra crítica: o terço superior (0–480px) tem que estar
 * fora de foco" é a regra central do componente e sumia por causa do
 * "480px"; a tabela "Adaptação por categoria" (linhas com TAB) sumia
 * inteira. Decisão do owner (03/09): a direção é a FONTE PRINCIPAL do
 * gerador — sai a MEDIDA, fica a frase.
 *
 * Só cai a linha inteira quando, sem as medidas, não sobra frase: ficha
 * de arquivo ("Ativo final 1196 × 1898px (2x)", "Formato PNG, < 110 KB",
 * "Exportar em PNG"). Linha de tabela com TAB vira "coluna — coluna"; se a
 * linha era só medida, cai como as outras.
 */
const MEDIDAS: RegExp[] = [
  // "(0–480px)", "(2x)", "(152px no slot)", "(26px no slot)"
  /\(\s*[^()]*?\d[^()]*?(?:px|kb|mb|2x)\s*[^()]*?\)/gi,
  // "1196 × 1898px", "598 x 949 px", "1265 × 1898"
  /\d+(?:[.,]\d+)?\s*[×x]\s*\d+(?:[.,]\d+)?\s*(?:px)?/gi,
  // "0–480px", "24px", "Ø304px", "Ø 304"
  /Ø\s*\d+(?:[.,]\d+)?\s*(?:px)?/gi,
  /\d+(?:[.,]\d+)?\s*[–-]\s*\d+(?:[.,]\d+)?\s*px/gi,
  /\d+(?:[.,]\d+)?\s*px/gi,
  // "< 300 KB", "110 KB", "2 MB"
  /<?\s*\d+(?:[.,]\d+)?\s*(?:kb|mb)\b/gi,
  // "PNG ou JPG", "JPG q80 ou WebP", "PNG"
  /\b(?:png|jpe?g|webp)(?:\s*q\d+)?\b/gi,
  /\b2x\b/gi,
]
/** Vocabulário de ficha de arquivo — a linha que só fala disso cai inteira. */
const FICHA_DE_ARQUIVO =
  /\b(?:ativo\s+final|formato|exportar|gerar\s+em|montagem\s+final|full-bleed|slot\s+de|no\s+slot)\b/i
/** Tabela: célula separada por TAB, ou markdown com 2+ pipes. */
const LINHA_DE_TABELA = /	|^\s*\|.*\|.*\|/

export interface DirecaoSanitizada {
  texto: string
  /** Linhas que caíram inteiras (ficha de arquivo, tabela de cota). */
  linhas_removidas: number
  /** Medidas apagadas de dentro de linhas que ficaram. */
  medidas_removidas: number
}

/** Conta letras de verdade — o que sobra de frase quando a medida sai. */
function palavras(t: string): number {
  return (t.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []).length
}

/** Limpa os restos que a remoção de medida deixa: "( )", " ,", " ." e espaço duplo. */
function limparRestos(t: string): string {
  return t
    .replace(/\(\s*(?:ou|e|,|;|·)?\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])\s*(?=[,.;:])/g, "")
    .replace(/[ 	]{2,}/g, " ")
    .replace(/\s+—\s*$/g, "")
    .replace(/^\s*[—·,;]\s*/, "")
    .trim()
}

/**
 * Apaga as medidas de dentro da direção e derruba só a linha que era pura
 * ficha de arquivo. O resto — títulos, regras, tabela de categorias — fica
 * com a frase inteira. Fail-open: se não sobrar nada, devolve o original;
 * pior que cota é foto sem direção.
 */
export function sanitizePhotoDirection(texto: string): DirecaoSanitizada {
  const linhas = texto.split("\n")
  const mantidas: string[] = []
  let removidas = 0
  let medidas = 0
  for (const linhaCrua of linhas) {
    const t = linhaCrua.trim()
    if (!t) {
      mantidas.push("")
      continue
    }
    const tabela = LINHA_DE_TABELA.test(linhaCrua)
    let linha = tabela
      ? t.split(/	+|\s*\|\s*/).filter(Boolean).join(" — ")
      : t
    let apagouMedida = false
    for (const re of MEDIDAS) {
      const antes = linha
      linha = linha.replace(re, "")
      if (linha !== antes) apagouMedida = true
    }
    linha = limparRestos(linha)
    // Sem medida a linha era só ficha ("Ativo final … (2x)", "Slot — 272 ×
    // 212px", "Exportar em PNG.") → cai. Regra com uma cota dentro
    // ("…terço superior (0–480px) tem que estar fora de foco…") → fica.
    const ficha = FICHA_DE_ARQUIVO.test(linha) && palavras(linha) <= 12
    if (!linha || (apagouMedida && (palavras(linha) < 3 || ficha))) {
      removidas++
      continue
    }
    if (apagouMedida) medidas++
    mantidas.push(linha)
  }
  const saida = mantidas.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!saida) return { texto, linhas_removidas: 0, medidas_removidas: 0 }
  return { texto: saida, linhas_removidas: removidas, medidas_removidas: medidas }
}

/**
 * Uma query por email em vez de uma por bloco: os blocos de um email
 * costumam repetir variantes (dois blocos de produto da mesma grade), e a
 * direção é o mesmo texto. Blueprint ausente, legado (sem `variant_id`) ou
 * nenhuma direção escrita → mapa vazio, e o prompt de imagem fica idêntico
 * ao de antes.
 */
export async function loadPhotoDirections(
  admin: SupabaseClient,
  blocks: Array<{ variant_id?: string | null }> | undefined,
): Promise<Record<string, string>> {
  const ids = [
    ...new Set(
      (blocks ?? [])
        .map((b) => (b.variant_id ?? "").trim())
        .filter((id): id is string => id.length > 0),
    ),
  ]
  if (ids.length === 0) return {}

  const { data, error } = await admin
    .from("email_component_variants")
    .select("id, photo_direction")
    .in("id", ids)
  if (error) {
    // Sem direção o agente compõe como sempre compôs — não é motivo para
    // derrubar a geração da imagem.
    log.warn("phase2.image.photo_direction_load_failed", {
      error: error.message,
      ids: ids.length,
    })
    return {}
  }

  const out: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{
    id: string
    photo_direction: string | null
  }>) {
    const text = (row.photo_direction ?? "").trim()
    if (!text) continue
    const limpa = sanitizePhotoDirection(text)
    if (limpa.linhas_removidas > 0 || limpa.medidas_removidas > 0) {
      log.info("phase2.image.photo_direction_sanitized", {
        variantId: row.id,
        linhas_removidas: limpa.linhas_removidas,
        medidas_removidas: limpa.medidas_removidas,
        chars_antes: text.length,
        chars_depois: limpa.texto.length,
      })
    }
    out[row.id] = limpa.texto
  }
  return out
}
