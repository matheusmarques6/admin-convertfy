import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.Structure")

export const runtime = "nodejs"
export const maxDuration = 30

// ============================================================================
// CRITÉRIOS DE DETECÇÃO DE EMAIL
// ============================================================================
//
// Um frame só é considerado "email" se atende TODOS estes critérios:
//
//  1) type === "FRAME"
//  2) Largura entre 300 e 900 pixels
//     (emails marketing típicos: 480-650px)
//  3) Altura >= 1000 pixels
//     (emails são longos — seções internas raramente passam disso)
//  4) Aspect ratio (altura/largura) >= 1.6
//     (emails são retângulos altos — seções internas tendem a ser
//      mais quadradas ou retângulos largos)
//
// Esses critérios eliminam as SUB-FRAMES internas (Hero Section,
// Testimonial Section, Footer, etc) que tipicamente têm aspect entre
// 0.8 e 1.5 e altura menor que 1000px.
// ============================================================================
const MIN_EMAIL_WIDTH = 300
const MAX_EMAIL_WIDTH = 900
const MIN_EMAIL_HEIGHT = 1000
const MIN_EMAIL_ASPECT = 1.6

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
  const { width, height } = box
  if (width < MIN_EMAIL_WIDTH || width > MAX_EMAIL_WIDTH) return false
  if (height < MIN_EMAIL_HEIGHT) return false
  if (height / width < MIN_EMAIL_ASPECT) return false
  return true
}

/**
 * BFS na árvore do Figma. Retorna os email-frames encontrados no PRIMEIRO
 * nível que contém algum frame que atenda os critérios — junto com seus
 * frames pai (pra poder agrupar como "funil").
 *
 * Como funciona:
 *   - Começa da página (depth 0)
 *   - Expande o nível atual (depth 1 = filhos diretos da page)
 *   - Se algum frame do nível atual é email-frame → retorna TODOS os
 *     email-frames desse nível
 *   - Caso contrário, expande o próximo nível
 *   - Se em nenhum nível houver matches, retorna []
 *
 * Isso funciona pra as estruturas mais comuns:
 *   Page > Email (level 1)
 *   Page > FrameContainer > Email (level 2)
 *   Page > Folder > FrameContainer > Email (level 3)
 */
function findEmailFramesBFS(
  pageNode: FigmaNode
): Array<{ email: FigmaNode; parent: FigmaNode }> {
  let currentLevel: Array<{ node: FigmaNode; parent: FigmaNode }> = []
  for (const child of pageNode.children ?? []) {
    currentLevel.push({ node: child, parent: pageNode })
  }

  while (currentLevel.length > 0) {
    // Checa se este nível tem email-frames
    const foundInLevel: Array<{ email: FigmaNode; parent: FigmaNode }> = []
    for (const { node, parent } of currentLevel) {
      if (isEmailFrame(node)) {
        foundInLevel.push({ email: node, parent })
      }
    }

    if (foundInLevel.length > 0) {
      return foundInLevel
    }

    // Não tem — expande pro próximo nível
    const nextLevel: Array<{ node: FigmaNode; parent: FigmaNode }> = []
    for (const { node } of currentLevel) {
      for (const child of node.children ?? []) {
        nextLevel.push({ node: child, parent: node })
      }
    }
    currentLevel = nextLevel
  }

  return []
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
      log.warn("FIGMA_PERSONAL_TOKEN not configured")
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

    // Depth 5: cobre até estruturas bem profundas
    //   Page > Folder > SubFolder > Frame > Email
    const figmaRes = await fetch(
      `https://api.figma.com/v1/files/${fileKey}?depth=5`,
      { headers: { "X-Figma-Token": token } }
    )

    if (!figmaRes.ok) {
      if (figmaRes.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error: "O token do Figma não tem permissão para este arquivo.",
          },
          { status: 403 }
        )
      }
      if (figmaRes.status === 404) {
        return NextResponse.json(
          { success: false, error: "Arquivo do Figma não encontrado." },
          { status: 404 }
        )
      }
      const errorText = await figmaRes.text().catch(() => "")
      log.error("Figma API error", {
        status: figmaRes.status,
        body: errorText.slice(0, 300),
      })
      throw new Error(`Figma API: ${figmaRes.status}`)
    }

    const data = (await figmaRes.json()) as {
      name: string
      document: { children?: FigmaNode[] }
    }

    // Pra cada page, acha os email-frames e agrupa por parent
    const pages = (data.document?.children || []).map((page) => {
      const found = findEmailFramesBFS(page)

      // Agrupa por parent.id — cada parent distinto vira um "funil"
      const funnelsById = new Map<
        string,
        {
          id: string
          name: string
          emails: FigmaNode[]
        }
      >()

      for (const { email, parent } of found) {
        if (!funnelsById.has(parent.id)) {
          funnelsById.set(parent.id, {
            id: parent.id,
            name: parent.name || "Emails",
            emails: [],
          })
        }
        funnelsById.get(parent.id)!.emails.push(email)
      }

      const funnels = Array.from(funnelsById.values()).map((funnel) => {
        // Ordena por posição X no canvas (esquerda → direita)
        const sortedEmails = funnel.emails
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
      firstFewEmails: pages
        .flatMap((p) =>
          p.funnels.flatMap((f) =>
            f.emails.slice(0, 3).map((e) => `${e.name} (${e.width}×${e.height})`)
          )
        )
        .slice(0, 5),
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
