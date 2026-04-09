import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.Structure")

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Extrai o fileKey de uma URL do Figma.
 * Aceita:
 *   - https://www.figma.com/design/ABC123/Name
 *   - https://www.figma.com/file/ABC123/Name
 *   - ABC123 (já é um fileKey)
 */
function extractFileKey(input: string): string | null {
  const trimmed = input.trim()
  if (/^[a-zA-Z0-9]{22,}$/.test(trimmed)) return trimmed
  const match = trimmed.match(/figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)/)
  return match ? match[1] : null
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      )
    }

    const figmaToken = process.env.FIGMA_PERSONAL_TOKEN
    if (!figmaToken) {
      log.warn("FIGMA_PERSONAL_TOKEN not configured")
      return NextResponse.json(
        {
          success: false,
          error:
            "FIGMA_PERSONAL_TOKEN não configurado no servidor. Adicione a variável de ambiente no Vercel.",
        },
        { status: 503 }
      )
    }

    const { figmaUrl } = (await request.json()) as { figmaUrl?: string }
    if (!figmaUrl || typeof figmaUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "Cole o link do arquivo Figma." },
        { status: 400 }
      )
    }

    const fileKey = extractFileKey(figmaUrl)
    if (!fileKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Link do Figma inválido. Cole o link completo (ex: https://figma.com/design/abc123/Nome).",
        },
        { status: 400 }
      )
    }

    // Busca a estrutura do arquivo com profundidade 3:
    // documento → pages → funnel frames → email frames
    const figmaRes = await fetch(
      `https://api.figma.com/v1/files/${fileKey}?depth=3`,
      {
        headers: { "X-Figma-Token": figmaToken },
      }
    )

    if (!figmaRes.ok) {
      if (figmaRes.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error:
              "O token do Figma não tem permissão para acessar este arquivo.",
          },
          { status: 403 }
        )
      }
      if (figmaRes.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "Arquivo do Figma não encontrado. Verifique o link.",
          },
          { status: 404 }
        )
      }
      const errorText = await figmaRes.text().catch(() => "")
      log.error("Figma API error", {
        status: figmaRes.status,
        body: errorText.slice(0, 300),
      })
      throw new Error(`Figma API retornou status ${figmaRes.status}`)
    }

    const data = (await figmaRes.json()) as {
      name: string
      lastModified: string
      document: { children?: FigmaNode[] }
    }

    const pages = data.document?.children || []

    const structure = {
      name: data.name,
      fileKey,
      lastModified: data.lastModified,
      pages: pages.map((page) => {
        // Frames nível 1 dentro da page = FUNIS
        const funnelFrames = (page.children || []).filter(
          (c) => c.type === "FRAME" || c.type === "SECTION"
        )

        const funnels = funnelFrames
          .map((funnel) => {
            // Frames nível 2 dentro do funil = EMAILS
            const emailFrames = (funnel.children || []).filter(
              (c) => c.type === "FRAME"
            )

            return {
              id: funnel.id,
              name: funnel.name,
              emails: emailFrames.map((email) => ({
                id: email.id,
                name: email.name,
                width: email.absoluteBoundingBox
                  ? Math.round(email.absoluteBoundingBox.width)
                  : undefined,
                height: email.absoluteBoundingBox
                  ? Math.round(email.absoluteBoundingBox.height)
                  : undefined,
              })),
            }
          })
          .filter((f) => f.emails.length > 0)

        return { id: page.id, name: page.name, funnels }
      }),
    }

    log.info("Figma structure loaded", {
      fileKey,
      name: data.name,
      pagesCount: structure.pages.length,
      totalFunnels: structure.pages.reduce(
        (sum, p) => sum + p.funnels.length,
        0
      ),
    })

    return NextResponse.json({ success: true, structure })
  } catch (error: unknown) {
    log.error("Figma structure fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro ao acessar o Figma"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
