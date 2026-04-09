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

// ============================================================================
// AGRUPAMENTO INTELIGENTE POR PADRÃO DE NOME
//
// Quando os emails estão todos no mesmo parent (caso comum: arquivos que
// não usam sections do Figma pra agrupar), caímos nestes padrões regex
// pra agrupar por "funil lógico" baseado nos nomes.
//
// A ordem importa: patterns mais específicos antes (ex: "post purchase"
// antes de "purchase" puro).
// ============================================================================

interface GroupPattern {
  regex: RegExp
  group: string
}

const GROUP_PATTERNS: GroupPattern[] = [
  { regex: /^welcome/i, group: "Welcome Flow" },
  { regex: /^(cart|carrinho)\s*abandon/i, group: "Carrinho Abandonado" },
  { regex: /^browse\s*abandon/i, group: "Browse Abandoned" },
  { regex: /^site\s*abandon/i, group: "Site Abandoned" },
  { regex: /^post[\s_-]*purchase|p[óo]s[\s_-]*compra/i, group: "Pós-Compra / Upsell" },
  { regex: /^winback|win[\s_-]*back/i, group: "Winback" },
  // "Pedido pago", "Pedido em separação", "Pedido enviado", "Atraso na entrega"...
  { regex: /^(pedido|atraso|entrega|envio|shipment|order|tracking)/i, group: "Etapas de Envio" },
  // "Birthday flow", "Anniversary", etc
  { regex: /^(birthday|anivers[áa]rio|anniversary)/i, group: "Aniversário" },
  // "Review request"
  { regex: /^review/i, group: "Reviews / Feedback" },
  // "Newsletter"
  { regex: /^newsletter/i, group: "Newsletter" },
]

/**
 * Detecta o grupo lógico de um nome de email. Retorna null se nada bater.
 */
function detectGroupFromName(name: string): string | null {
  const trimmed = name.trim()
  for (const { regex, group } of GROUP_PATTERNS) {
    if (regex.test(trimmed)) return group
  }
  return null
}

/**
 * Fallback: extrai o prefixo do nome (tudo antes de "#" ou antes do
 * primeiro número). Usado quando nenhum padrão bate.
 */
function extractNamePrefix(name: string): string {
  const trimmed = name.trim()
  // "Welcome Email #4" → "Welcome Email"
  const hashMatch = trimmed.match(/^(.+?)\s*#\s*\d+/)
  if (hashMatch) return hashMatch[1].trim()
  // "Welcome Email 4" → "Welcome Email"
  const numMatch = trimmed.match(/^(.+?)\s+\d+\s*$/)
  if (numMatch) return numMatch[1].trim()
  // Sem número: usa o nome completo como "grupo próprio"
  return trimmed
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

    // Pra cada page, acha os email-frames e agrupa
    const pages = (data.document?.children || []).map((page) => {
      const found = findEmailFramesBFS(page)

      // Agrupa 1ª tentativa: por parent.id — funciona quando o Figma tem
      // sections/frames nomeados agrupando emails.
      const byParent = new Map<
        string,
        {
          id: string
          name: string
          emails: FigmaNode[]
        }
      >()

      for (const { email, parent } of found) {
        if (!byParent.has(parent.id)) {
          byParent.set(parent.id, {
            id: parent.id,
            name: parent.name || "Emails",
            emails: [],
          })
        }
        byParent.get(parent.id)!.emails.push(email)
      }

      // Se só há UM parent (todos os emails num container genérico tipo
      // "Frame 1" ou direto na page), descarta e agrupa por PADRÃO DE NOME.
      // Isso cria os funis lógicos: Welcome Flow, Carrinho Abandonado, etc.
      let groupedEmails: Array<{
        id: string
        name: string
        emails: FigmaNode[]
      }>

      if (byParent.size > 1) {
        // Confia na organização do Figma
        groupedEmails = Array.from(byParent.values())
      } else {
        // Agrupa por padrão de nome
        const byGroup = new Map<
          string,
          { id: string; name: string; emails: FigmaNode[] }
        >()

        for (const { email } of found) {
          const pattern = detectGroupFromName(email.name)
          const groupName = pattern ?? extractNamePrefix(email.name)
          const groupId = `group::${groupName}`

          if (!byGroup.has(groupId)) {
            byGroup.set(groupId, {
              id: groupId,
              name: groupName,
              emails: [],
            })
          }
          byGroup.get(groupId)!.emails.push(email)
        }

        groupedEmails = Array.from(byGroup.values())
      }

      // Ordena funis: alfabético mas "Welcome Flow" sempre primeiro
      const FUNNEL_ORDER: Record<string, number> = {
        "Welcome Flow": 1,
        "Browse Abandoned": 2,
        "Site Abandoned": 3,
        "Carrinho Abandonado": 4,
        "Pós-Compra / Upsell": 5,
        "Winback": 6,
        "Etapas de Envio": 7,
      }

      groupedEmails.sort((a, b) => {
        const orderA = FUNNEL_ORDER[a.name] ?? 99
        const orderB = FUNNEL_ORDER[b.name] ?? 99
        if (orderA !== orderB) return orderA - orderB
        return a.name.localeCompare(b.name)
      })

      const funnels = groupedEmails.map((funnel) => {
        // Ordena emails dentro do funil por número no nome,
        // caindo pra posição X como fallback.
        const sortedEmails = funnel.emails
          .slice()
          .sort((a, b) => {
            // Extrai número de "Welcome Email #3"
            const aNum = parseInt(a.name.match(/#\s*(\d+)/)?.[1] || "0", 10)
            const bNum = parseInt(b.name.match(/#\s*(\d+)/)?.[1] || "0", 10)
            if (aNum !== bNum && (aNum || bNum)) return aNum - bNum
            // Fallback: posição X no canvas
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
