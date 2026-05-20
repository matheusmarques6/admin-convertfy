/**
 * Espelha respostas do formulário de onboarding (`onboardings.form_responses`,
 * fonte primária; `store_onboarding_data`, fallback legacy) para os campos
 * lidos pela aba Contexto (`client_stores.*` + `store_brand_identity`).
 *
 * Dois modos:
 *  - `fill-empty` (default): só preenche colunas vazias. Edições manuais no
 *    admin são preservadas. Usado no trigger automático de `pending_approval`.
 *  - `overwrite`: substitui valores divergentes. Usado quando o admin clica
 *    "Sincronizar do formulário" explicitamente.
 *
 * Em ambos os modos, a logo cria uma nova versão em `store_brand_identity`
 * quando a URL do form é diferente da última versão (preservando histórico).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingMirror")

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

// Faixas do form -> ponto médio em centavos. Aproximação intencional;
// o admin pode refinar manualmente na aba Operação.
const TICKET_RANGE_MAP: Record<string, number> = {
  "< r$ 100": 5000,
  "r$ 100 - 250": 17500,
  "r$ 250 - 500": 37500,
  "r$ 500 - 1.000": 75000,
  "r$ 500 - 1000": 75000,
  "> r$ 1.000": 150000,
  "> r$ 1000": 150000,
}

function mapTom(value: unknown): "formal" | "casual" | "afetivo" | "divertido" | null {
  if (typeof value !== "string") return null
  return TOM_MAP[value.trim().toLowerCase()] ?? null
}

function mapPosicionamento(value: unknown): "popular" | "medio" | "premium" | null {
  if (typeof value !== "string") return null
  return POSICIONAMENTO_MAP[value.trim().toLowerCase()] ?? null
}

function mapTicketRange(value: unknown): number | null {
  if (typeof value !== "string") return null
  return TICKET_RANGE_MAP[value.trim().toLowerCase()] ?? null
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

interface FormResponses {
  primary_persona?: unknown
  tone_of_voice?: unknown
  positioning?: unknown
  price_vs_quality?: unknown
  vertical?: unknown
  ticket_avg?: unknown
  obs?: unknown
  logo_url?: unknown
  brand_manual_url?: unknown
  [k: string]: unknown
}

export type MirrorMode = "fill-empty" | "overwrite"

export interface MirrorResult {
  ok: boolean
  storeId: string
  mode: MirrorMode
  mirrored: string[]    // colunas que estavam vazias e foram preenchidas
  overwritten: string[] // colunas com valor antigo substituído (só em overwrite)
  skipped: string[]     // colunas puladas (já com valor, modo fill-empty)
  reason?: string       // motivo de bail-out
}

export const onboardingMirrorService = {
  async syncStoreFromOnboarding(
    storeId: string,
    opts: { mode?: MirrorMode } = {},
  ): Promise<MirrorResult> {
    const mode: MirrorMode = opts.mode ?? "fill-empty"
    const admin = createAdminClient()
    const result: MirrorResult = {
      ok: true,
      storeId,
      mode,
      mirrored: [],
      overwritten: [],
      skipped: [],
    }

    const { data: onb } = await admin
      .from("onboardings")
      .select("id, form_responses")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: sod } = await admin
      .from("store_onboarding_data")
      .select("logo_url, brand_manual_url")
      .eq("store_id", storeId)
      .maybeSingle()

    const { data: cs } = await admin
      .from("client_stores")
      .select(
        "id, niche, persona, tom_de_voz, posicionamento_preco, ticket_medio_cents, additional_notes, brand_manual_url",
      )
      .eq("id", storeId)
      .maybeSingle()

    if (!cs) {
      result.ok = false
      result.reason = "Loja não encontrada"
      return result
    }

    const fr = (onb?.form_responses ?? {}) as FormResponses
    const hasFormData = onb && fr && Object.keys(fr).length > 0
    if (!hasFormData && !sod) {
      result.ok = false
      result.reason = "Nenhum onboarding com respostas para esta loja"
      return result
    }

    // ── Coleta valores candidatos do form (com fallback legacy onde aplicável) ─

    type Candidate = { column: string; next: unknown; current: unknown }
    const candidates: Candidate[] = []

    candidates.push({
      column: "niche",
      next: pickString(fr.vertical),
      current: cs.niche,
    })

    candidates.push({
      column: "persona",
      next: pickString(fr.primary_persona),
      current: cs.persona,
    })

    candidates.push({
      column: "tom_de_voz",
      next: mapTom(fr.tone_of_voice),
      current: cs.tom_de_voz,
    })

    candidates.push({
      column: "posicionamento_preco",
      next: mapPosicionamento(fr.positioning) ?? mapPosicionamento(fr.price_vs_quality),
      current: cs.posicionamento_preco,
    })

    candidates.push({
      column: "ticket_medio_cents",
      next: mapTicketRange(fr.ticket_avg),
      current: cs.ticket_medio_cents,
    })

    candidates.push({
      column: "additional_notes",
      next: pickString(fr.obs),
      current: cs.additional_notes,
    })

    const brandManualFromForm = pickString(fr.brand_manual_url)
    const brandManualFromSod = pickString(sod?.brand_manual_url)
    candidates.push({
      column: "brand_manual_url",
      next: brandManualFromForm ?? brandManualFromSod,
      current: cs.brand_manual_url,
    })

    // ── Decide patch baseado no modo ────────────────────────────────────

    const patch: Record<string, unknown> = {}

    for (const c of candidates) {
      if (c.next === null || c.next === undefined) continue
      const isEmpty = c.current === null || c.current === undefined || c.current === ""
      const isDifferent = c.current !== c.next

      if (isEmpty) {
        patch[c.column] = c.next
        result.mirrored.push(`client_stores.${c.column}`)
      } else if (mode === "overwrite" && isDifferent) {
        patch[c.column] = c.next
        result.overwritten.push(`client_stores.${c.column}`)
      } else if (!isEmpty) {
        result.skipped.push(`client_stores.${c.column}`)
      }
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

    // ── store_brand_identity ────────────────────────────────────────────

    const logoFromForm = pickString(fr.logo_url)
    const logoFromSod = pickString(sod?.logo_url)
    const logoUrl = logoFromForm ?? logoFromSod

    if (logoUrl) {
      const { data: existing } = await admin
        .from("store_brand_identity")
        .select("id, version, logo_main_png, logo_main_svg")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()

      const currentLogo = existing?.logo_main_svg || existing?.logo_main_png || null
      const hasLogo = !!currentLogo
      const isSvg = /\.svg(\?|$)/i.test(logoUrl)
      const slotLabel = isSvg ? "logo_main_svg" : "logo_main_png"

      const shouldInsert =
        !hasLogo || (mode === "overwrite" && currentLogo !== logoUrl)

      if (shouldInsert) {
        const insertRow: Record<string, unknown> = {
          store_id: storeId,
          version: (existing?.version ?? 0) + 1,
          source: "ai_capture",
          logo_main_svg: isSvg ? logoUrl : null,
          logo_main_png: isSvg ? null : logoUrl,
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
        } else if (hasLogo) {
          result.overwritten.push(`store_brand_identity.${slotLabel}`)
        } else {
          result.mirrored.push(`store_brand_identity.${slotLabel}`)
        }
      } else {
        result.skipped.push("store_brand_identity.logo_main")
      }
    }

    log.info("Espelhamento concluído", {
      storeId,
      mode,
      mirrored: result.mirrored.length,
      overwritten: result.overwritten.length,
      skipped: result.skipped.length,
    })

    return result
  },
}
