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
 * Linha de PRODUÇÃO — cota, formato de arquivo, tabela de especificação.
 *
 * A direção fotográfica é escrita para designer e traz, junto com a prosa
 * da foto, a ficha técnica do ativo: "Círculo da foto de Ø304px… com o
 * topo a 24px da borda", "Ativo final 544 × 424px (2x)", "PNG, < 110 KB".
 * Tudo isso ia INTEIRO ao gerador como PRIMARY BRIEF — e em 02/09 o
 * Welcome 1 da Innova Bay saiu com "24px" e "Ø304px" DESENHADOS dentro das
 * duas fotos do comparativo. O gerador reproduz o material que recebe; a
 * regra "no text" não vence uma cota escrita no brief.
 *
 * Só a LINHA sai. As seções ("Construção do ativo", "Montagem final",
 * "Checklist", "Adaptação por categoria") ficam — decisão do owner: é a
 * prosa dele, e o que atrapalha é a medida, não o parágrafo.
 */
const LINHA_DE_PRODUCAO: RegExp[] = [
  /\d+\s*(px|kb|mb)\b/i,
  /Ø\s*\d/,
  /\d+\s*[×x]\s*\d+/i,
  /\bPNG\b|\bJPE?G\b|\bWEBP\b/i,
  /\b2x\b/i,
  /\bexportar\b/i,
]
/** Tabela: célula separada por TAB, ou markdown com 2+ pipes. */
const LINHA_DE_TABELA = /\t|^\s*\|.*\|.*\|/

export interface DirecaoSanitizada {
  texto: string
  linhas_removidas: number
}

/**
 * Remove da direção as linhas de tabela e de cota de produção; o resto,
 * inclusive títulos de seção, fica byte a byte. Fail-open: se não sobrar
 * nada, devolve o original — pior que cota é foto sem direção.
 */
export function sanitizePhotoDirection(texto: string): DirecaoSanitizada {
  const linhas = texto.split("\n")
  const mantidas: string[] = []
  let removidas = 0
  for (const linha of linhas) {
    const t = linha.trim()
    if (t && (LINHA_DE_TABELA.test(linha) || LINHA_DE_PRODUCAO.some((re) => re.test(t)))) {
      removidas++
      continue
    }
    mantidas.push(linha)
  }
  const saida = mantidas.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!saida) return { texto, linhas_removidas: 0 }
  return { texto: saida, linhas_removidas: removidas }
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
    if (limpa.linhas_removidas > 0) {
      log.info("phase2.image.photo_direction_sanitized", {
        variantId: row.id,
        linhas_removidas: limpa.linhas_removidas,
        chars_antes: text.length,
        chars_depois: limpa.texto.length,
      })
    }
    out[row.id] = limpa.texto
  }
  return out
}
