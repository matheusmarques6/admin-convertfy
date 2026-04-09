import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.Structure")

export const runtime = "nodejs"
export const maxDuration = 30

// Filtro crítico: só frames que parecem emails reais.
// Emails marketing têm tipicamente 600×>=800px. Botões são 143×36, ícones
// 24×24, etc. Esse threshold elimina praticamente todo o lixo.
const MIN_EMAIL_WIDTH = 400
const MIN_EMAIL_HEIGHT = 300

function extractFileKey(input: string): string | null {
  const trimmed = input.trim()
  if (/^[a-zA-Z0-9]{22,}$/.test(trimmed)) return trimmed
  const match = trimmed.match(
    /figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)/
  )
  return match ? match[1] : null
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
}

function isEmailFrame(node: FigmaNode): boolean {
  if (node.type !== "FRAME") return false
  const box = node.absoluteBoundingBox
  if (!box) return false
  return box.width >= MIN_EMAIL_WIDTH && box.height >= MIN_EMAIL_HEIGHT
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

    const token = process.env.FIGMA_PERSONAL_TOKEN
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error:
            "FIGMA_PERSONAL_TOKEN não configurado no servidor. Configure no Vercel.",
        },
        { status: 503 }
      )
    }

    const { figmaUrl } = (await request.json()) as { figmaUrl?: string }
    const fileKey = extractFileKey(figmaUrl || "")
    if (!fileKey) {
      return NextResponse.json(
        { success: false, error: "Link do Figma inválido." },
        { status: 400 }
      )
    }

    // Busca com depth=3: Page → Funis → Emails (filhos dos funis)
    const res = await fetch(
      `https://api.figma.com/v1/files/${fileKey}?depth=3`,
      { headers: { "X-Figma-Token": token } }
    )

    if (!res.ok) {
      if (res.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error: "O token do Figma não tem permissão para este arquivo.",
          },
          { status: 403 }
        )
      }
      if (res.status === 404) {
        return NextResponse.json(
          { success: false, error: "Arquivo do Figma não encontrado." },
          { status: 404 }
        )
      }
      const errorText = await res.text().catch(() => "")
      log.error("Figma API error", {
        status: res.status,
        body: errorText.slice(0, 300),
      })
      throw new Error(`Figma API: ${res.status}`)
    }

    const data = (await res.json()) as {
      name: string
      document: { children?: FigmaNode[] }
    }

    const pages = (data.document?.children || []).map((page) => {
      // Frames nível 1 dentro da page = FUNIS
      const topLevelFrames = (page.children || []).filter(
        (c) => c.type === "FRAME" || c.type === "SECTION"
      )

      const funnels = topLevelFrames
        .map((funnel) => {
          // Filtrar filhos: só frames que parecem emails reais
          const emailCandidates = (funnel.children || []).filter(isEmailFrame)

          // Ordenar por posição X (esquerda → direita, que é a ordem lógica
          // que o designer colocou os emails no frame do funil)
          const sortedEmails = emailCandidates
            .slice()
            .sort((a, b) => {
              const aX = a.absoluteBoundingBox?.x || 0
              const bX = b.absoluteBoundingBox?.x || 0
              return aX - bX
            })
            .map((email) => ({
              id: email.id,
              name: email.name,
              width: Math.round(email.absoluteBoundingBox!.width),
              height: Math.round(email.absoluteBoundingBox!.height),
            }))

          return {
            id: funnel.id,
            name: funnel.name,
            emailCount: sortedEmails.length,
            emails: sortedEmails,
          }
        })
        .filter((f) => f.emails.length > 0) // só funis com emails reais

      return { id: page.id, name: page.name, funnels }
    })

    log.info("Figma structure loaded", {
      fileKey,
      name: data.name,
      pagesCount: pages.length,
      totalFunnels: pages.reduce((sum, p) => sum + p.funnels.length, 0),
      totalEmails: pages.reduce(
        (sum, p) => sum + p.funnels.reduce((s, f) => s + f.emailCount, 0),
        0
      ),
    })

    return NextResponse.json({
      success: true,
      structure: { name: data.name, fileKey, pages },
    })
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
