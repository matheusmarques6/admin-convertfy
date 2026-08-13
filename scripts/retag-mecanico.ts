/**
 * Retagueamento MECÂNICO da biblioteca — sem modelo, sem token, em segundos.
 *
 * O Taguedor com LLM leva 1–3 min por variante e depende de chave de modelo.
 * Mas as regras 1–3 dele (achar o exemplo · achar o placeholder · renomear
 * para a key do schema) são DETERMINÍSTICAS: o endereço de um campo é
 * `{{MAIÚSCULA_DA_KEY}}`, e só existem dois jeitos de chegar nele —
 *
 *   1. o HTML já tem uma tag no papel do campo  → renomeia para a key
 *   2. o HTML tem a FRASE do `example`          → troca a frase pelo placeholder
 *
 * Este script aplica os dois, nessa ordem, usando exatamente as funções que
 * a tela usa (`auditSchemaTags`, `renameTagInHtml`, `findExampleAnchor`,
 * `anchorByExample`) — o resultado aqui e o do painel Schema × HTML são o
 * mesmo por construção.
 *
 * O que ele NÃO faz: inventar elemento que não existe na arte. Campo sem tag
 * e sem a frase no HTML sai no relatório como `sem_lugar` — é cadastro, e
 * nem o LLM resolve (é a regra 6, `not_found`).
 *
 * Uso:
 *   npx tsx scripts/retag-mecanico.ts            # DRY — só mede, não grava
 *   npx tsx scripts/retag-mecanico.ts --apply    # grava as propostas
 *
 * Grava `html_tagged` + `tagging_status='pending'` + `tagging_meta`. NÃO
 * aprova nada e NÃO toca no `html` de origem. `tagging_meta.previous_status`
 * guarda o status anterior — é o caminho de volta.
 *
 * ATENÇÃO: variante hoje `approved` volta para `pending`, e produção passa a
 * usar o `html` de origem até você aprovar a nova proposta. É o mesmo efeito
 * do botão "Retaguear desalinhadas" na tela.
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { auditSchemaTags } from "../src/lib/email-workspace/schema-tag-coherence"
import type { ComponentOutputField } from "../src/types/email-generation"

// ── env ──────────────────────────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const v = m[2].trim().replace(/^["']|["']$/g, "")
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local).",
  )
  process.exit(1)
}

const APPLY = process.argv.includes("--apply")
const db = createClient(URL, KEY, { auth: { persistSession: false } })

interface Row {
  id: string
  name: string
  block_type: string
  output_schema: ComponentOutputField[] | null
  html: string | null
  html_tagged: string | null
  tagging_status: string | null
}

/** HTML que produção consome hoje. */
function effective(r: Row): string {
  return r.tagging_status === "approved" && r.html_tagged?.trim()
    ? r.html_tagged
    : (r.html ?? "")
}

import { retag, type FieldOutcome } from "../src/lib/email-workspace/retag-mecanico"

async function main() {
  const { data, error } = await db
    .from("email_component_variants")
    .select("id, name, block_type, output_schema, html, html_tagged, tagging_status")
    .eq("is_active", true)
    .order("block_type")
    .order("name")
  if (error) throw error

  const rows = (data ?? []) as Row[]
  let tocadas = 0
  let ancoradas = 0
  let semLugar = 0
  const pendentes: string[] = []

  for (const r of rows) {
    const schema = Array.isArray(r.output_schema) ? r.output_schema : []
    if (schema.length === 0) continue // sem schema = curadoria, não retag
    if (auditSchemaTags(effective(r), schema).ok) continue // já alinhada

    const base = r.html ?? ""
    const { html: tagged, outcomes } = retag(base, schema)
    const ganhos = outcomes.filter((o) => o.via === "renomeada" || o.via === "exemplo")
    const perdas = outcomes.filter((o) => o.via === "sem_lugar")
    ancoradas += ganhos.length
    semLugar += perdas.length

    const depois = auditSchemaTags(tagged, schema)
    const marca = depois.missing.length === 0 ? "OK " : "   "
    console.log(
      `${marca}[${r.block_type}] ${r.name} — +${ganhos.length} ancorado(s), ${depois.missing.length} sem tag, ${depois.orphans.length} tag(s) sem campo`,
    )
    for (const o of ganhos) {
      console.log(
        `      ${o.key} ← ${o.via === "renomeada" ? `{{${o.from}}}` : `“${o.from}”`}`,
      )
    }
    for (const o of perdas) console.log(`      ${o.key} — SEM LUGAR na arte`)

    if (ganhos.length === 0) continue // nada a propor
    tocadas++
    pendentes.push(r.name)

    if (!APPLY) continue
    const { error: upErr } = await db
      .from("email_component_variants")
      .update({
        html_tagged: tagged,
        tagging_status: "pending",
        tagging_meta: {
          model: "mecanico",
          generated_at: new Date().toISOString(),
          previous_status: r.tagging_status,
          fields: outcomes.map((o) => ({
            key: o.key,
            placeholder: o.placeholder,
            anchored_by:
              o.via === "renomeada"
                ? "renamed"
                : o.via === "exemplo"
                  ? "exact"
                  : o.via === "ja_ancorada"
                    ? "exact"
                    : "not_found",
            note: o.from ? `âncora: ${o.from}` : undefined,
          })),
          issues: perdas.map(
            (o) => `campo ${o.key}: sem tag e sem a frase do exemplo no HTML`,
          ),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
    if (upErr) console.error(`      FALHA ao gravar: ${upErr.message}`)
  }

  console.log(
    `\n${APPLY ? "GRAVADO" : "DRY-RUN"} — ${tocadas} variante(s) com proposta, ${ancoradas} campo(s) ancorado(s), ${semLugar} sem lugar na arte.`,
  )
  if (!APPLY && tocadas > 0) {
    console.log("Rode de novo com --apply para gravar as propostas.")
  }
  if (APPLY && pendentes.length > 0) {
    console.log(
      `\nAs ${pendentes.length} viraram proposta PENDENTE. Até você aprovar na aba Componentes, produção usa o HTML de origem delas.`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
