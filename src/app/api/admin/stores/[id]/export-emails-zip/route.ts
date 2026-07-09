/**
 * GET /api/admin/stores/[id]/export-emails-zip
 *
 * Exporta os emails prontos da loja (ou de 1 flow) como ZIP de PNGs
 * (e/ou HTMLs), renderizados server-side via Chromium headless.
 *
 * Query:
 *   scope   = store | flow   (default store)
 *   flow_id = uuid           (obrigatorio se scope=flow)
 *   format  = png | html | both (default png)
 *   scale   = 1 | 2          (default 2 — retina; 1 corta o peso em ~4x)
 *
 * Estrutura do ZIP:
 *   01-welcome/welcome-01-boas-vindas.png
 *   02-abandoned-cart/abandoned-cart-01-....png
 *   manifest.txt   (contagens + status por email)
 *
 * Limites: 40 emails por request (413 sugerindo scope=flow) e 200MB de
 * PNGs acumulados (413 sugerindo scale=1). Falha de render de 1 email
 * nao aborta o lote — vira linha no manifest.
 */

import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import {
  emailExportBasename,
  slugify,
} from "@/lib/email-workspace/export-naming"
import { renderEmailHtml } from "@/lib/email-workspace/render-html"
import { withRenderPage } from "@/lib/services/email-png-render.service"
import { logger } from "@/lib/logger"

const log = logger.child("StoreExportEmailsZip")

export const dynamic = "force-dynamic"
// ~34 emails x 1,5-3s de render cada + cold start do Chromium
export const maxDuration = 300

const MAX_EMAILS = 40
const MAX_TOTAL_BYTES = 200 * 1024 * 1024 // 200 MB

const querySchema = z
  .object({
    scope: z.enum(["store", "flow"]).default("store"),
    flow_id: z.string().uuid().optional(),
    format: z.enum(["png", "html", "both"]).default("png"),
    scale: z.coerce.number().int().min(1).max(2).default(2),
  })
  .refine((q) => q.scope !== "flow" || !!q.flow_id, {
    message: "flow_id obrigatorio quando scope=flow",
    path: ["flow_id"],
  })

interface FlowRow {
  id: string
  store_id: string
  name: string
  flow_type: string | null
  position: number | null
}

interface EmailRow {
  id: string
  flow_id: string
  number: number
  name: string
  status: string | null
  html: string | null
  [key: string]: unknown
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const rawQuery = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Query invalida",
        422,
        "invalid_query",
      )
    }
    const { scope, flow_id: flowId, format, scale } = parsed.data

    const { data: store } = await admin
      .from("client_stores")
      .select("store_name")
      .eq("id", storeId)
      .maybeSingle<{ store_name: string }>()
    if (!store) {
      throw new AppError("Loja nao encontrada.", 404, "store_not_found")
    }

    // Flows alvo
    let flowsQuery = admin
      .from("email_flows")
      .select("id, store_id, name, flow_type, position")
      .eq("store_id", storeId)
      .order("position", { ascending: true })
    if (scope === "flow" && flowId) {
      flowsQuery = flowsQuery.eq("id", flowId)
    }
    const { data: flowRows, error: flowsErr } = await flowsQuery
    if (flowsErr) throw flowsErr
    const flows = (flowRows ?? []) as FlowRow[]
    if (flows.length === 0) {
      throw new AppError(
        scope === "flow"
          ? "Flow nao encontrado ou nao pertence a esta loja."
          : "Loja sem flows de email.",
        404,
        "flows_not_found",
      )
    }
    const flowById = new Map(flows.map((f) => [f.id, f]))

    // Emails dos flows alvo
    const { data: emailRows, error: emailsErr } = await admin
      .from("email_flow_emails")
      .select("*")
      .in(
        "flow_id",
        flows.map((f) => f.id),
      )
      .order("number", { ascending: true })
    if (emailsErr) throw emailsErr
    const allEmails = (emailRows ?? []) as EmailRow[]

    // Elegiveis: prontos OU com html persistido (cobre legado sem status)
    const eligible = allEmails.filter(
      (e) => e.status === "ready" || !!e.html,
    )
    const skipped = allEmails.filter(
      (e) => !(e.status === "ready" || !!e.html),
    )

    if (eligible.length === 0) {
      throw new AppError(
        "Nenhum email pronto para exportar (status ready ou com HTML).",
        404,
        "no_eligible_emails",
      )
    }
    if (eligible.length > MAX_EMAILS) {
      throw new AppError(
        `Muitos emails (${eligible.length} > ${MAX_EMAILS}). Exporte por flow (scope=flow).`,
        413,
        "too_many_emails",
      )
    }

    // Blocks de todos os emails sem html persistido, em 1 query
    const needBlocks = eligible.filter((e) => !e.html).map((e) => e.id)
    const blocksByEmail = new Map<string, Array<Record<string, unknown>>>()
    if (needBlocks.length > 0) {
      const { data: blockRows } = await admin
        .from("email_blocks")
        .select("*")
        .in("email_id", needBlocks)
        .order("position", { ascending: true })
      for (const b of (blockRows ?? []) as Array<Record<string, unknown>>) {
        const key = b.email_id as string
        if (!blocksByEmail.has(key)) blocksByEmail.set(key, [])
        blocksByEmail.get(key)!.push(b)
      }
    }

    const zip = new JSZip()
    const manifest: string[] = []
    let okCount = 0
    let failCount = 0
    let totalPngBytes = 0
    const t0 = Date.now()

    const needsPng = format === "png" || format === "both"
    const needsHtml = format === "html" || format === "both"

    const runExport = async (
      render: ((html: string, o?: { deviceScaleFactor?: number }) => Promise<Buffer>) | null,
    ) => {
      for (const email of eligible) {
        const flow = flowById.get(email.flow_id)
        if (!flow) continue
        const folder = `${String(flow.position ?? 0).padStart(2, "0")}-${slugify(flow.flow_type || flow.name)}`
        const basename = emailExportBasename(flow, email)
        const html = renderEmailHtml(
          email as never,
          (blocksByEmail.get(email.id) ?? []) as never,
        )

        if (needsHtml) {
          zip.file(`${folder}/${basename}.html`, html)
        }

        if (needsPng && render) {
          try {
            const png = await render(html, { deviceScaleFactor: scale })
            totalPngBytes += png.length
            if (totalPngBytes > MAX_TOTAL_BYTES) {
              throw new AppError(
                "Export excede 200MB. Use scale=1 ou exporte por flow.",
                413,
                "zip_too_large",
              )
            }
            // PNG ja e comprimido — STORE evita CPU inutil no zip
            zip.file(`${folder}/${basename}.png`, png, {
              compression: "STORE",
            })
            okCount++
            manifest.push(`OK      ${folder}/${basename}.png`)
          } catch (err) {
            if (err instanceof AppError && err.statusCode === 413) throw err
            failCount++
            const msg = err instanceof Error ? err.message : String(err)
            manifest.push(`FALHOU  ${folder}/${basename}.png — ${msg}`)
            log.warn("render_failed", { emailId: email.id, error: msg })
          }
        } else if (needsHtml) {
          okCount++
          manifest.push(`OK      ${folder}/${basename}.html`)
        }
      }
    }

    if (needsPng) {
      await withRenderPage(async (render) => {
        await runExport(render)
      })
    } else {
      await runExport(null)
    }

    if (needsPng && okCount === 0) {
      throw new AppError(
        "Nenhum email pode ser renderizado em PNG.",
        502,
        "all_renders_failed",
      )
    }

    for (const e of skipped) {
      const flow = flowById.get(e.flow_id)
      manifest.push(
        `PULADO  ${flow ? slugify(flow.flow_type || flow.name) : "?"}-${String(e.number).padStart(2, "0")} — sem HTML (status ${e.status ?? "?"})`,
      )
    }

    const header = [
      `Export de emails — ${store.store_name}`,
      `Data: ${new Date().toISOString()}`,
      `Scope: ${scope}${flowId ? ` (flow ${flowId})` : ""} · Formato: ${format} · Scale: ${scale}x`,
      `OK: ${okCount} · Falhas: ${failCount} · Pulados: ${skipped.length}`,
      "",
    ]
    zip.file("manifest.txt", [...header, ...manifest].join("\n"))

    const bytes = await zip.generateAsync({ type: "uint8array" })
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer

    const storeSlug = slugify(store.store_name)
    const flowSlug =
      scope === "flow" && flows[0]
        ? `-${slugify(flows[0].flow_type || flows[0].name)}`
        : ""
    const filename = `${storeSlug}${flowSlug}-emails.zip`

    log.info("exported", {
      storeId,
      scope,
      format,
      scale,
      ok: okCount,
      failed: failCount,
      skipped: skipped.length,
      zipBytes: bytes.byteLength,
      durationMs: Date.now() - t0,
    })

    return new NextResponse(ab, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "export-emails-zip")
  }
}
