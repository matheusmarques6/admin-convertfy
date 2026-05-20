/**
 * Espelha respostas do formulário de onboarding (`onboardings.form_responses`
 * + `store_onboarding_data`) para os campos lidos pela aba Contexto
 * (`client_stores.*` + `store_brand_identity`).
 *
 * Idempotente: só preenche colunas vazias em `client_stores` — edições
 * manuais no admin nunca são sobrescritas. Para a logo, só cria uma versão
 * em `store_brand_identity` quando ainda não há nenhuma.
 *
 * Disparado automaticamente na transição `pending_approval` do onboarding
 * e via POST /api/admin/stores/[id]/sync-from-onboarding pelo admin.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingMirror")

// ── Mapeamento de enums (Form v2 → client_stores) ─────────────────────
// Form coleta 5 opções de tom; a tela tem 4 chips. Inspirador→afetivo,
// Técnico→formal. Aspiracional→premium, Nicho→medio.

const TOM_MAP: Record<string, "formal" | "casual" | "afetivo" | "divertido"> = {
  "formal": "formal",
  "casual / amigável": "casual",
  "casual / amigavel": "casual",
  "divertido / irreverente": "divertido",
  "técnico": "formal",
  "tecnico": "formal",
  "inspirador": "afetivo",
}

const POSICIONAMENTO_MAP: Record<string, "popular" | "medio" | "premium"> = {
  "premium": "premium",
  "aspiracional": "premium",
  "popular / acessível": "popular",
  "popular / acessivel": "popular",
  "popular": "popular",
  "nicho específico": "medio",
  "nicho especifico": "medio",
  "nicho": "medio",
}

function mapTom(value: unknown): "formal" | "casual" | "afetivo" | "divertido" | null {
  if (typeof value !== "string") return null
  return TOM_MAP[value.trim().toLowerCase()] ?? null
}

function mapPosicionamento(value: unknown): "popular" | "medio" | "premium" | null {
  if (typeof value !== "string") return null
  return POSICIONAMENTO_MAP[value.trim().toLowerCase()] ?? null
}

interface FormResponses {
  primary_persona?: string
  tone_of_voice?: string
  positioning?: string
  price_vs_quality?: string
  [k: string]: unknown
}

export interface MirrorResult {
  ok: boolean
  storeId: string
  mirrored: string[]   // nomes das colunas/recursos que foram preenchidos
  skipped: string[]    // nomes que foram pulados (já tinham valor manual)
  reason?: string      // motivo de bail-out (sem onboarding, etc)
}

export const onboardingMirrorService = {
  async syncStoreFromOnboarding(storeId: string): Promise<MirrorResult> {
    const admin = createAdminClient()
    const result: MirrorResult = {
      ok: true,
      storeId,
      mirrored: [],
      skipped: [],
    }

    // 1. Onboarding mais recente da loja (com form_responses)
    const { data: onb } = await admin
      .from("onboardings")
      .select("id, form_responses, briefing")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // 2. store_onboarding_data (logo_url, brand_manual_url)
    const { data: sod } = await admin
      .from("store_onboarding_data")
      .select("logo_url, brand_manual_url")
      .eq("store_id", storeId)
      .maybeSingle()

    // 3. client_stores atual (pra checar quais colunas já têm valor)
    const { data: cs } = await admin
      .from("client_stores")
      .select(
        "id, persona, tom_de_voz, posicionamento_preco, brand_manual_url",
      )
      .eq("id", storeId)
      .maybeSingle()

    if (!cs) {
      result.ok = false
      result.reason = "Loja não encontrada"
      return result
    }

    const fr = (onb?.form_responses ?? {}) as FormResponses

    // ── Patch em client_stores (só campos vazios) ─────────────────────
    const patch: Record<string, unknown> = {}

    if (!cs.persona && typeof fr.primary_persona === "string" && fr.primary_persona.trim()) {
      patch.persona = fr.primary_persona.trim()
      result.mirrored.push("client_stores.persona")
    } else if (cs.persona) {
      result.skipped.push("client_stores.persona")
    }

    if (!cs.tom_de_voz) {
      const mapped = mapTom(fr.tone_of_voice)
      if (mapped) {
        patch.tom_de_voz = mapped
        result.mirrored.push("client_stores.tom_de_voz")
      }
    } else {
      result.skipped.push("client_stores.tom_de_voz")
    }

    if (!cs.posicionamento_preco) {
      // Prioriza `positioning` (mais específico); fallback pra `price_vs_quality`
      const mapped = mapPosicionamento(fr.positioning) ?? mapPosicionamento(fr.price_vs_quality)
      if (mapped) {
        patch.posicionamento_preco = mapped
        result.mirrored.push("client_stores.posicionamento_preco")
      }
    } else {
      result.skipped.push("client_stores.posicionamento_preco")
    }

    if (!cs.brand_manual_url && sod?.brand_manual_url) {
      patch.brand_manual_url = sod.brand_manual_url
      result.mirrored.push("client_stores.brand_manual_url")
    } else if (cs.brand_manual_url) {
      result.skipped.push("client_stores.brand_manual_url")
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await admin
        .from("client_stores")
        .update(patch)
        .eq("id", storeId)
      if (error) {
        log.error("Falha ao espelhar client_stores", { error: error.message, storeId })
        result.ok = false
        result.reason = error.message
        return result
      }
    }

    // ── store_brand_identity (criar versão se ainda não houver) ───────
    if (sod?.logo_url) {
      const { data: existing } = await admin
        .from("store_brand_identity")
        .select("id, version, logo_main_png, logo_main_svg")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()

      const hasLogo = !!(existing?.logo_main_png || existing?.logo_main_svg)
      if (!hasLogo) {
        const isSvg = /\.svg(\?|$)/i.test(sod.logo_url)
        const insertRow: Record<string, unknown> = {
          store_id: storeId,
          version: (existing?.version ?? 0) + 1,
          source: "ai_capture",
          logo_main_svg: isSvg ? sod.logo_url : null,
          logo_main_png: isSvg ? null : sod.logo_url,
          colors_primary: [],
          colors_secondary: [],
          voice: [],
          trust_icons: [],
          top_products: [],
        }
        const { error: biErr } = await admin
          .from("store_brand_identity")
          .insert(insertRow)
        if (biErr) {
          log.error("Falha ao espelhar store_brand_identity", { error: biErr.message, storeId })
        } else {
          result.mirrored.push(isSvg ? "store_brand_identity.logo_main_svg" : "store_brand_identity.logo_main_png")
        }
      } else {
        result.skipped.push("store_brand_identity.logo_main")
      }
    }

    log.info("Espelhamento concluído", {
      storeId,
      mirrored: result.mirrored.length,
      skipped: result.skipped.length,
    })

    return result
  },
}
