/**
 * Validador TEXTUAL da copy que volta do n8n, contra a decisão do e-mail.
 * Roda no callback (`/api/webhooks/n8n/email-copy`), sob o gate
 * `contrato_textual` — `shadow` só grava em `_contrato` da run `copy`.
 *
 * Três coisas: claims de oferta em campo de copy (régua de `claims.ts`),
 * campo OMITIDO pela arbitragem que voltou preenchido (o n8n inferiu do
 * purpose) e `max_len` estourado (já medido pelo `copy_fit`; aqui entra como
 * violação para o painel ler num lugar só). Puro.
 */

import type { DecisaoDoEmail } from "../decisao-do-email"
import { avaliarClaims } from "./claims"
import { resultado, type ResultadoValidacao, type Violacao } from "./tipos"

export interface BlocoDeCopy {
  block_index: number
  block_id?: string | null
  block_type?: string | null
  fields: Array<{ key: string; max_len?: number | null; omitir?: boolean; nature?: string; type?: string }>
  content: Record<string, unknown> | null
}

function ehCopy(f: { nature?: string; type?: string }): boolean {
  if (f.nature === "imagem_gerada" || f.nature === "asset_fixo") return false
  return f.type !== "image"
}

export function validarCopy(decisao: DecisaoDoEmail, blocos: BlocoDeCopy[]): ResultadoValidacao {
  const violacoes: Violacao[] = []
  for (const b of blocos) {
    const content = b.content ?? {}
    const base = {
      block_index: b.block_index,
      section: b.block_type ?? decisao.posicoes[b.block_index]?.section ?? null,
      variant_id: null,
    }
    for (const f of b.fields) {
      if (!ehCopy(f)) continue
      const v = content[f.key]
      if (typeof v !== "string" || !v.trim()) continue
      if (f.omitir === true) {
        violacoes.push({
          ...base,
          tipo: "omitido_preenchido",
          severidade: "high",
          campo: f.key,
          evidencia: v.slice(0, 80),
          esperado: "campo omitido pela decisão — deve chegar vazio",
        })
      }
      for (const c of avaliarClaims(v, decisao.incentivo, decisao.proibido)) {
        violacoes.push({
          ...base,
          tipo: c.tipo,
          severidade: c.severidade,
          campo: f.key,
          evidencia: c.trecho,
          esperado: c.esperado,
        })
      }
      if (typeof f.max_len === "number" && f.max_len > 0 && v.length > f.max_len) {
        violacoes.push({
          ...base,
          tipo: "max_len",
          severidade: "medium",
          campo: f.key,
          evidencia: `${v.length} chars`,
          esperado: `≤ ${f.max_len}`,
        })
      }
    }
  }
  return resultado(violacoes)
}
