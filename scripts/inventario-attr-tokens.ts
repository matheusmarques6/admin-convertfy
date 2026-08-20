/**
 * Inventário do vocabulário de tokens de atributo da biblioteca — read-only.
 *
 * Varre o `html` das variantes ativas de email_component_variants e imprime,
 * agrupado, tudo que aparece como valor de src/alt/href:
 *   - TOKENS (forma SCREAMING_SNAKE) com contagem e em quais variantes
 *   - ARTE FIXA (data:image/... — nunca é slot)
 *   - RESÍDUOS (URLs http reais — export esquecido)
 *   - candidatos ESTRUTURAIS (tokens fora do padrão URL_ / ALT_ — revisar
 *     se entram em STRUCTURAL_TOKENS de attr-token-vocabulary.ts)
 *
 * É a fonte do arquivo src/lib/agents/html/attr-token-vocabulary.ts: rode
 * depois de qualquer leva nova de variantes e confira se apareceu forma nova.
 *
 * Uso: npx tsx scripts/inventario-attr-tokens.ts
 */

import { createClient } from "@supabase/supabase-js"
import { existsSync, readFileSync } from "node:fs"

import {
  isAltToken,
  isAttrToken,
  isStructuralToken,
  FIXED_ART_SRC,
  isResidualUrl,
  parseAttrToken,
} from "../src/lib/agents/html/attr-token-vocabulary"

// ── env (mesmo padrão dos demais scripts) ────────────────────────────
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
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local).")
  process.exit(1)
}

const db = createClient(URL, KEY, { auth: { persistSession: false } })

const ATTR_RE = /\b(src|alt|href)\s*=\s*"([^"]*)"/gi

async function main() {
  const { data, error } = await db
    .from("email_component_variants")
    .select("id, name, block_type, html")
    .eq("is_active", true)

  if (error) {
    console.error("Falha ao ler variantes:", error.message)
    process.exit(1)
  }

  const tokens = new Map<string, { count: number; attrs: Set<string>; variantes: Set<string> }>()
  let arteFixa = 0
  const residuos = new Map<string, number>()

  for (const v of data ?? []) {
    const html = (v.html as string | null) ?? ""
    for (const m of html.matchAll(ATTR_RE)) {
      const attr = m[1].toLowerCase()
      const value = m[2].trim()
      if (!value) continue
      if (FIXED_ART_SRC.test(value)) {
        arteFixa++
        continue
      }
      if (isResidualUrl(value)) {
        if (attr === "src") residuos.set(value.slice(0, 80), (residuos.get(value.slice(0, 80)) ?? 0) + 1)
        continue
      }
      if (!isAttrToken(value)) continue
      const entry = tokens.get(value) ?? { count: 0, attrs: new Set(), variantes: new Set() }
      entry.count++
      entry.attrs.add(attr)
      entry.variantes.add(v.name as string)
      tokens.set(value, entry)
    }
  }

  const sorted = [...tokens.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  console.log(`\n═══ TOKENS DE ATRIBUTO (${sorted.length} distintos) ═══`)
  for (const [raw, e] of sorted) {
    const parsed = parseAttrToken(raw)
    const classe = isStructuralToken(raw)
      ? "ESTRUTURAL"
      : isAltToken(raw)
        ? "alt"
        : "slot"
    const ord = parsed?.ordinal != null ? ` ord=${parsed.ordinal}${parsed.sub ?? ""}` : parsed?.sub ? ` sub=${parsed.sub}` : ""
    console.log(
      `  ${raw.padEnd(32)} ${classe.padEnd(11)} [${[...e.attrs].join(",")}] ×${e.count}${ord} — ${[...e.variantes].slice(0, 3).join(" · ")}${e.variantes.size > 3 ? " …" : ""}`,
    )
  }

  // Candidato estrutural = token que não segue URL_*/ALT_* e não está na
  // lista — se aparecer algo aqui, revisar STRUCTURAL_TOKENS.
  const candidatos = sorted.filter(
    ([raw]) => !/^(URL_|ALT_)/.test(raw) && !isStructuralToken(raw),
  )
  console.log(`\n═══ CANDIDATOS ESTRUTURAIS FORA DA LISTA (${candidatos.length}) ═══`)
  for (const [raw, e] of candidatos) {
    console.log(`  ${raw} — [${[...e.attrs].join(",")}] em ${[...e.variantes].join(" · ")}`)
  }

  console.log(`\n═══ ARTE FIXA (data:image) ═══  ${arteFixa} ocorrências (nunca são slot)`)

  console.log(`\n═══ RESÍDUOS DE EXPORT (URL real em src) ═══`)
  for (const [url, n] of residuos) console.log(`  ×${n}  ${url}`)

  console.log()
}

void main()
