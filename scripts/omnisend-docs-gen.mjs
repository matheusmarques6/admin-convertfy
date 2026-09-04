#!/usr/bin/env node
/**
 * Gera src/lib/integrations/omnisend/operation-docs.generated.ts a partir
 * dos markdowns em src/lib/integrations/omnisend/docs/.
 *
 * Por que existe: a ConvertIA precisa do MESMO material que o MCP oficial
 * da Omnisend entrega por operação (fluxo recomendado, campos
 * obrigatórios, receitas de payload, erros com significado). Sem isso ela
 * montava o body no chute, tomava 400 e concluía que "a plataforma não
 * deixa". Os .md são a fonte da verdade (editáveis por humanos); o TS
 * gerado é o que o bundle do Next carrega — arquivo .md não é importável
 * em runtime serverless.
 *
 *   node scripts/omnisend-docs-gen.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const docsDir = join(here, "..", "src", "lib", "integrations", "omnisend", "docs")
const outFile = join(here, "..", "src", "lib", "integrations", "omnisend", "operation-docs.generated.ts")

const files = readdirSync(docsDir)
  .filter((f) => f.endsWith(".md"))
  .sort()

const entries = files.map((f) => {
  const key = f.replace(/\.md$/, "")
  const body = readFileSync(join(docsDir, f), "utf8").replace(/\r\n/g, "\n").trimEnd()
  if (!body) throw new Error(`doc vazio: ${f}`)
  return [key, body]
})

const lines = [
  "/* eslint-disable */",
  "// GERADO por scripts/omnisend-docs-gen.mjs — NÃO edite à mão.",
  "// Fonte: src/lib/integrations/omnisend/docs/*.md",
  "",
  "export const OMNISEND_DOCS: Record<string, string> = {",
  ...entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
  "}",
  "",
]
writeFileSync(outFile, lines.join("\n"))
console.log(`${entries.length} docs → ${outFile}`)
