/**
 * Prints do HTML final (B2, set/2026): 600px (desktop) e 375px (celular),
 * tirados DEPOIS do pós-processador — o print é do documento que vai ao
 * cliente, não de um estágio.
 *
 * Reusa `email-png-render.service.ts` (puppeteer-core + @sparticuz/chromium,
 * já na Vercel pelo export de PNG). Caminho FIXO no Storage por e-mail,
 * com `upsert`: regenerar sobrescreve, e a ficha do e-mail sempre aponta
 * para o print mais recente.
 *
 * FAIL-OPEN por construção: erro do Chromium (binário ausente na lambda,
 * timeout, HTML que não carrega) vira log e `null` — o print é auxílio de
 * revisão, nunca condição de entrega. Quem chama decide se há orçamento.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { withRenderPage } from "@/lib/services/email-png-render.service"
import { EMAIL_ASSETS_BUCKET } from "../image/upload-email-asset"

const log = logger.child("RenderPreviews")

export interface RenderPreviews {
  desktop: string | null
  mobile: string | null
  captured_at: string
}

export const PREVIEW_WIDTHS = { desktop: 600, mobile: 375 } as const

/** Mínimo de orçamento para tentar: dois renders + dois uploads. */
export const PREVIEW_BUDGET_MIN_MS = 25_000

function caminho(storeId: string, emailId: string, qual: keyof typeof PREVIEW_WIDTHS): string {
  return `stores/${storeId}/email-assets/${emailId}/render-${qual}.png`
}

async function subir(storeId: string, emailId: string, qual: keyof typeof PREVIEW_WIDTHS, png: Buffer): Promise<string> {
  const admin = createAdminClient()
  const path = caminho(storeId, emailId, qual)
  const { error } = await admin.storage.from(EMAIL_ASSETS_BUCKET).upload(path, png, { contentType: "image/png", upsert: true })
  if (error) throw new Error(`upload ${qual}: ${error.message}`)
  const { data: signed } = await admin.storage.from(EMAIL_ASSETS_BUCKET).createSignedUrl(path, 365 * 24 * 60 * 60)
  if (signed?.signedUrl) return signed.signedUrl
  return admin.storage.from(EMAIL_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Tira os dois prints, sobe e grava `email_flow_emails.render_previews`.
 * Devolve o que conseguiu (um lado pode falhar sozinho). Nunca lança.
 */
export async function capturarPreviews(input: {
  storeId: string
  emailId: string
  html: string
  timeoutMs?: number
}): Promise<RenderPreviews | null> {
  const t0 = Date.now()
  const out: RenderPreviews = { desktop: null, mobile: null, captured_at: new Date().toISOString() }
  // Kill switch e ambiente de teste: o @sparticuz/chromium descomprime
  // ~150 MB ao resolver o executável — num vitest isso é um timeout de 5 s
  // em todo teste que atravessa a fase 2, sem nenhum print para mostrar.
  if (process.env.EMAIL_RENDER_PREVIEWS === "off" || process.env.VITEST || process.env.NODE_ENV === "test") {
    log.info("render_previews.skipped", { emailId: input.emailId, motivo: process.env.EMAIL_RENDER_PREVIEWS === "off" ? "EMAIL_RENDER_PREVIEWS=off" : "ambiente de teste" })
    return null
  }
  try {
    await withRenderPage(async (render) => {
      for (const qual of ["desktop", "mobile"] as const) {
        try {
          const png = await render(input.html, {
            width: PREVIEW_WIDTHS[qual],
            deviceScaleFactor: 1,
            timeoutMs: input.timeoutMs ?? 15_000,
          })
          out[qual] = await subir(input.storeId, input.emailId, qual, png)
        } catch (err) {
          log.warn("render_previews.side_failed", { emailId: input.emailId, qual, error: err instanceof Error ? err.message : String(err) })
        }
      }
    })
  } catch (err) {
    log.warn("render_previews.failed", { emailId: input.emailId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
  if (!out.desktop && !out.mobile) return null
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("email_flow_emails").update({ render_previews: out }).eq("id", input.emailId)
    if (error) log.warn("render_previews.persist_failed", { emailId: input.emailId, error: error.message, hint: "aplicar a migration 20261147" })
  } catch (err) {
    log.warn("render_previews.persist_failed", { emailId: input.emailId, error: err instanceof Error ? err.message : String(err) })
  }
  log.info("render_previews.ok", { emailId: input.emailId, desktop: !!out.desktop, mobile: !!out.mobile, ms: Date.now() - t0 })
  return out
}
