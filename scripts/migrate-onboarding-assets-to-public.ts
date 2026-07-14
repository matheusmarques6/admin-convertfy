/**
 * Migra assets do FORM PÚBLICO do onboarding do bucket PRIVADO legado
 * (`onboarding-assets`) para o bucket PÚBLICO novo (`onboarding-public`).
 *
 * Contexto: antes da separação em dois buckets, os uploads do form do cliente
 * (logo, refs, manual) caíam em `onboarding-assets`, que — por causa de uma
 * corrida na criação on-demand — acabava PRIVADO. As URLs `/object/public/...`
 * gravadas em form_responses/client_stores retornavam 404. Este script:
 *
 *   (a) lista recursivamente objetos em `onboarding-assets` cujo path contenha
 *       "/form-submissions/" (marca de upload do form público);
 *   (b) copia cada um pro `onboarding-public` no MESMO path (upsert), pulando
 *       os que já existem;
 *   (c) reescreve as URLs em `onboardings.form_responses` (chaves de arquivo
 *       e qualquer valor string que referencie onboarding-assets/...form-submissions)
 *       trocando `onboarding-assets` -> `onboarding-public`;
 *   (d) idem em `client_stores` (logo_url, design_direction_file_url, brand_manual_url).
 *
 * Idempotente: pode rodar várias vezes. Objetos/linhas já migrados são pulados.
 *
 * USO:
 *   # dry-run (padrão — não escreve nada, só relata):
 *   npx tsx scripts/migrate-onboarding-assets-to-public.ts
 *   npx tsx scripts/migrate-onboarding-assets-to-public.ts --dry-run
 *
 *   # execução real:
 *   npx tsx scripts/migrate-onboarding-assets-to-public.ts --execute
 *
 * Requer env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const SRC_BUCKET = "onboarding-assets"
const DST_BUCKET = "onboarding-public"
const FORM_MARKER = "/form-submissions/"

// Chaves de campo de arquivo espelhadas / gravadas nas tabelas.
const FILE_FIELD_KEYS = [
  "logo_url",
  "brand_manual_url",
  "design_direction_file_url",
  "design_refs_url",
]
const STORE_FILE_COLUMNS = [
  "logo_url",
  "design_direction_file_url",
  "brand_manual_url",
]

const EXECUTE = process.argv.includes("--execute")
const DRY_RUN = !EXECUTE // default dry-run

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, "public", any>

/**
 * Lista recursivamente todos os objetos (paths completos) dentro de `prefix`
 * no bucket. O storage.list não é recursivo — descemos manualmente nas pastas.
 */
async function listAllObjects(
  admin: Admin,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const out: string[] = []
  const pageSize = 100
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    })
    if (error) {
      throw new Error(`list(${prefix}) falhou: ${error.message}`)
    }
    if (!data || data.length === 0) break

    for (const entry of data) {
      // Convenção do supabase-js: pasta => id === null.
      const isFolder = entry.id === null || entry.id === undefined
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      if (isFolder) {
        const nested = await listAllObjects(admin, bucket, full)
        out.push(...nested)
      } else {
        out.push(full)
      }
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return out
}

/** Copia um objeto do bucket origem pro destino, no mesmo path. */
async function copyObject(admin: Admin, path: string): Promise<"copied" | "exists" | "error"> {
  // Já existe no destino? Pula (idempotência).
  const parent = path.split("/").slice(0, -1).join("/")
  const name = path.split("/").pop() as string
  const { data: existing } = await admin.storage
    .from(DST_BUCKET)
    .list(parent, { search: name, limit: 100 })
  if (existing?.some((e) => e.name === name)) {
    return "exists"
  }

  const { data: blob, error: dlErr } = await admin.storage
    .from(SRC_BUCKET)
    .download(path)
  if (dlErr || !blob) {
    console.error(`  [download falhou] ${path}: ${dlErr?.message}`)
    return "error"
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from(DST_BUCKET)
    .upload(path, buffer, {
      contentType: blob.type || "application/octet-stream",
      upsert: true,
    })
  if (upErr) {
    console.error(`  [upload falhou] ${path}: ${upErr.message}`)
    return "error"
  }
  return "copied"
}

/**
 * Reescreve referências ao bucket legado num valor string. Só troca quando o
 * valor referencia onboarding-assets E um path de form-submissions (não mexe
 * em deliverables/tutoriais internos, que continuam no bucket privado).
 */
function rewriteValue(value: string): string {
  if (
    value.includes(SRC_BUCKET) &&
    (value.includes(FORM_MARKER) || value.includes("form-submissions"))
  ) {
    return value.split(SRC_BUCKET).join(DST_BUCKET)
  }
  return value
}

/** Reescreve todas as strings de um form_responses (shallow). Retorna se mudou. */
function rewriteFormResponses(
  responses: Record<string, unknown>,
): { next: Record<string, unknown>; changed: boolean } {
  let changed = false
  const next: Record<string, unknown> = { ...responses }
  for (const [k, v] of Object.entries(responses)) {
    if (typeof v === "string") {
      const nv = rewriteValue(v)
      if (nv !== v) {
        next[k] = nv
        changed = true
      }
    }
    // Reforço: chaves de arquivo conhecidas mesmo que a heurística acima já
    // cubra (mantém explícito o intent). FILE_FIELD_KEYS documenta o escopo.
    void FILE_FIELD_KEYS
  }
  return { next, changed }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.",
    )
    process.exit(1)
  }

  const admin = createClient(url, key)

  console.log(
    `\n== Migração onboarding-assets -> onboarding-public ==\nModo: ${
      DRY_RUN ? "DRY-RUN (nada será escrito)" : "EXECUTE (escrevendo)"
    }\n`,
  )

  // ---- (a) + (b) Copiar objetos de form-submissions ----
  console.log("[1/3] Listando objetos em onboarding-assets…")
  const allObjects = await listAllObjects(admin, SRC_BUCKET)
  const formObjects = allObjects.filter((p) => p.includes(FORM_MARKER))
  console.log(
    `  Total no bucket: ${allObjects.length} | form-submissions: ${formObjects.length}`,
  )

  let copied = 0
  let existed = 0
  let copyErrors = 0
  for (const path of formObjects) {
    if (DRY_RUN) {
      console.log(`  [dry] copiaria ${path}`)
      copied++
      continue
    }
    const res = await copyObject(admin, path)
    if (res === "copied") {
      copied++
      console.log(`  [copiado] ${path}`)
    } else if (res === "exists") {
      existed++
    } else {
      copyErrors++
    }
  }
  console.log(
    `  Objetos: ${copied} ${DRY_RUN ? "seriam copiados" : "copiados"}, ${existed} já existiam, ${copyErrors} erros.`,
  )

  // ---- (c) Reescrever onboardings.form_responses ----
  console.log("\n[2/3] Reescrevendo onboardings.form_responses…")
  const { data: onbs, error: onbErr } = await admin
    .from("onboardings")
    .select("id, form_responses")
  if (onbErr) {
    console.error(`  Falha ao listar onboardings: ${onbErr.message}`)
    process.exit(1)
  }
  let onbUpdated = 0
  for (const onb of onbs ?? []) {
    const responses = (onb.form_responses ?? null) as Record<
      string,
      unknown
    > | null
    if (!responses || typeof responses !== "object") continue
    const { next, changed } = rewriteFormResponses(responses)
    if (!changed) continue
    onbUpdated++
    if (DRY_RUN) {
      console.log(`  [dry] atualizaria onboarding ${onb.id}`)
      continue
    }
    const { error } = await admin
      .from("onboardings")
      .update({ form_responses: next })
      .eq("id", onb.id)
    if (error) {
      console.error(`  [update falhou] onboarding ${onb.id}: ${error.message}`)
    } else {
      console.log(`  [atualizado] onboarding ${onb.id}`)
    }
  }
  console.log(
    `  Onboardings: ${onbUpdated} ${DRY_RUN ? "seriam atualizados" : "atualizados"}.`,
  )

  // ---- (d) Reescrever client_stores ----
  console.log("\n[3/3] Reescrevendo client_stores (logo/design/manual)…")
  const { data: stores, error: storeErr } = await admin
    .from("client_stores")
    .select(`id, ${STORE_FILE_COLUMNS.join(", ")}`)
  if (storeErr) {
    console.error(`  Falha ao listar client_stores: ${storeErr.message}`)
    process.exit(1)
  }
  let storeUpdated = 0
  for (const store of stores ?? []) {
    const s = store as unknown as Record<string, unknown>
    const patch: Record<string, string> = {}
    for (const col of STORE_FILE_COLUMNS) {
      const v = s[col]
      if (typeof v === "string" && v) {
        const nv = rewriteValue(v)
        if (nv !== v) patch[col] = nv
      }
    }
    if (Object.keys(patch).length === 0) continue
    storeUpdated++
    if (DRY_RUN) {
      console.log(
        `  [dry] atualizaria store ${s.id} (${Object.keys(patch).join(", ")})`,
      )
      continue
    }
    const { error } = await admin
      .from("client_stores")
      .update(patch)
      .eq("id", s.id as string)
    if (error) {
      console.error(`  [update falhou] store ${s.id}: ${error.message}`)
    } else {
      console.log(`  [atualizado] store ${s.id}`)
    }
  }
  console.log(
    `  Stores: ${storeUpdated} ${DRY_RUN ? "seriam atualizados" : "atualizados"}.`,
  )

  console.log(
    `\n== Fim ==\n${
      DRY_RUN
        ? "Dry-run concluído. Rode com --execute pra aplicar."
        : "Migração aplicada."
    }\n`,
  )
}

main().catch((e) => {
  console.error("Erro inesperado:", e)
  process.exit(1)
})
