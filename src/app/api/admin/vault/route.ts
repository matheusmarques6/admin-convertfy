/**
 * GET  /api/admin/vault — estado do conhecimento sincronizado, para a aba
 *      "Conhecimento" do hub: sync state, últimas runs do sync (com as notas
 *      puladas e o motivo), o material ativo agrupado por flow, e a HIGIENE
 *      das notas de componente (03/09): nota e cadastro descrevendo peças
 *      diferentes, nota apontando para variante inativa, variante ativa sem
 *      nota. Antes isso só existia dentro de uma run do Curador — quem vai
 *      corrigir o Obsidian não tinha onde olhar.
 * POST /api/admin/vault — sincronização manual (botão "Sincronizar agora";
 *      `force: true` re-sincroniza mesmo sem commit novo).
 *
 * Auth: canManagePrompts (admin/owner OU tag `dev`) — mesmo gate do hub.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { syncVault } from "@/lib/vault/vault-sync.service"
import {
  buildCatalog,
  levantarHigieneDoVault,
  type NotaDeVariante,
} from "@/lib/agents/architect/catalog-builder"
import {
  buildCatalogVaultExtras,
  indexVaultDocs,
  type VaultDocRow,
} from "@/lib/agents/architect/curador-vault"
import type { EmailComponentVariant } from "@/types/email-generation"
import { logger } from "@/lib/logger"

const log = logger.child("AdminVaultRoute")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const [stateRes, runsRes, intentsRes, refsRes, learningsRes, docsRes, variantsRes] = await Promise.all([
      admin.from("vault_sync_state").select("*").eq("id", "default").maybeSingle(),
      admin.from("vault_sync_runs").select("*").order("created_at", { ascending: false }).limit(10),
      admin.from("email_intents")
        .select("id, flow_type, kind, email_number, slug, status, is_active, updated_at")
        .order("flow_type").order("email_number", { ascending: true, nullsFirst: true }),
      admin.from("email_structure_refs")
        .select("id, flow_type, slug, emails, escopo, amostra, procedencia, secoes, secoes_normalizadas, status, is_active, updated_at")
        .order("flow_type").order("slug"),
      admin.from("email_learnings")
        .select("id, flow_type, slug, aplica_a, origem_estrutura, autor, status, is_active, updated_at")
        .order("flow_type", { nullsFirst: true }).order("slug"),
      admin.from("email_vault_docs")
        .select("kind, grupo, slug, variant_id, frontmatter, body_md, file_path, status, is_active")
        .eq("is_active", true),
      admin.from("email_component_variants")
        .select("id, name, block_type, description, when_use, when_not_use, objectives, tones, density, product_slots, copy_guidance, long_description")
        .eq("is_active", true),
    ])

    // Higiene: a mesma medida de divergência que a geração usa (buildCatalog),
    // mais os dois descasamentos que ela não vê — nota órfã e variante sem
    // nota. Fail-open: tabela ausente ou erro devolve listas vazias, como o
    // resto do vault.
    const higiene = (() => {
      try {
        const variantes = (variantsRes.data ?? []) as EmailComponentVariant[]
        const docs = (docsRes.data ?? []) as VaultDocRow[]
        const conhecimento = indexVaultDocs(docs)
        const extras = buildCatalogVaultExtras(conhecimento, variantes)
        const { divergentes } = buildCatalog(variantes, extras)
        const notas: NotaDeVariante[] = docs
          .filter((d) => d.kind === "variante")
          .map((d) => ({
            slug: d.slug,
            variant_id: d.variant_id ?? null,
            nome_no_banco: (d.frontmatter?.nome_no_banco as string | undefined) ?? null,
          }))
        return levantarHigieneDoVault(
          notas,
          variantes.map((v) => ({ id: v.id, name: v.name, block_type: v.block_type })),
          divergentes,
        )
      } catch (e) {
        log.warn("higiene do vault falhou", e)
        return { divergentes: [], notas_orfas: [], variantes_sem_nota: [] }
      }
    })()

    return successResponse(request, {
      state: stateRes.data ?? null,
      runs: runsRes.data ?? [],
      intents: intentsRes.data ?? [],
      structure_refs: refsRes.data ?? [],
      learnings: learningsRes.data ?? [],
      higiene,
      configured: Boolean(process.env.VAULT_REPO && process.env.VAULT_GITHUB_TOKEN),
    })
  } catch (error) {
    log.error("GET vault error", error)
    return errorResponse(request, error, "admin-vault-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = (await request.json().catch(() => ({}))) as { force?: boolean }
    const result = await syncVault({ trigger: "manual", force: body.force === true })
    return successResponse(request, result)
  } catch (error) {
    log.error("POST vault sync error", error)
    return errorResponse(request, error, "admin-vault-sync")
  }
}
