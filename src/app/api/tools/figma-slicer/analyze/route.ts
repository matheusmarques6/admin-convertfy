import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.Analyze")

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

// Largura fixa de análise e output (padrão email marketing Klaviyo/Omnisend).
// Analisar na mesma escala do output final remove qualquer necessidade de
// rescale e elimina classes inteiras de bugs.
const TARGET_WIDTH = 600

const SLICE_PROMPT = `Você é um especialista em email marketing que monta emails no Omnisend e Klaviyo. Analise esta imagem de email marketing e defina EXATAMENTE onde cortar para separar em seções.

## COMO VOCÊ DEVE PENSAR

Cada seção que você definir será uma IMAGEM PNG SEPARADA de 600px de largura. O operador vai empilhar essas imagens verticalmente no Omnisend para montar o email. Você precisa definir os pontos de corte HORIZONTAIS.

## REGRAS ABSOLUTAS DE CORTE (NUNCA VIOLAR)

1. **HERO** = Logo + imagem principal + headline + botão CTA principal → TUDO JUNTO em 1 seção. Se o fundo é escuro/colorido com uma imagem grande, é o hero inteiro. NUNCA separar o botão do banner.

2. **BODY COPY** = Título de oferta + texto descritivo + cupom + botão → TUDO JUNTO em 1 seção. Se tem "ÚLTIMA OPORTUNIDADE" ou similar + porcentagem OFF + código de cupom + botão, isso é UMA seção. NUNCA separar o cupom do título de oferta.

3. **PRODUCT SECTION** = Grid de produtos (todas as linhas) → SEMPRE 1 seção. Se tem 2x2 produtos ou 2x3 produtos com imagens + preço + botões "comprar"/"buy now", TODO O GRID é 1 seção. NUNCA separar linha de cima da linha de baixo. Esta seção frequentemente é chamada "In-Klaviyo Dynamic Product Section" porque será substituída por conteúdo dinâmico no Klaviyo.

4. **TRUST BADGES** = Ícones de envio/qualidade/segurança com texto → 1 seção.

5. **REVIEWS/SOCIAL PROOF** = Depoimentos + estrelas + "+25.000 clientes" → TUDO JUNTO em 1 seção. NUNCA separar reviews individuais.

6. **CTA FINAL** = Último bloco de chamada para ação + trust badges se adjacentes + botão final → 1 seção. Se os trust badges estão GRUDADOS no CTA final (sem separação visual clara entre eles), ficam JUNTOS em 1 seção.

7. **FOOTER** = Logo + links de navegação + copyright → 1 seção. Normalmente fundo escuro.

## VALIDAÇÕES

- Total de seções: entre 3 e 8. Se você identificou mais que 8, volte e MERGE seções que são parte do mesmo bloco.
- Cada seção deve ter pelo menos 100px de altura. Seções menores que 100px provavelmente estão erradas.
- NUNCA crie uma seção que contenha APENAS um botão ou APENAS um título. Botões e títulos fazem parte da seção acima ou abaixo deles.
- O primeiro y_start DEVE ser 0. O último y_end DEVE ser a altura total da imagem.
- y_end de uma seção DEVE ser EXATAMENTE igual ao y_start da próxima.

## NOMENCLATURA

Use estes nomes em snake_case na ordem em que aparecem:
- hero
- body_copy (ou welcome_text, coupon_block)
- product_section (ou In-Klaviyo_Dynamic_Product_Section)
- trust_badges
- reviews (ou social_proof)
- cta_final
- footer

Adapte conforme o conteúdo real. Numere com prefixo: 01_, 02_, 03_...

## FORMATO DE RESPOSTA

Chame a tool \`report_email_sections\` com o resultado.`

interface ClaudeSection {
  name: string
  y_start: number
  y_end: number
  description?: string
}

interface ClaudeAnalysis {
  total_height: number
  sections: ClaudeSection[]
}

/**
 * Snap-to-boundary pontual: dado um Y sugerido pelo Claude, varre um raio
 * pequeno (±40px) procurando a linha horizontal com maior diferença de cor
 * RGB em relação à linha seguinte. Esse é o ponto onde termina uma seção
 * e começa outra visualmente.
 */
function snapToBoundary(
  rawPixels: Buffer,
  width: number,
  height: number,
  channels: number,
  suggestedY: number,
  searchRadius = 40
): number {
  const minY = Math.max(1, suggestedY - searchRadius)
  const maxY = Math.min(height - 2, suggestedY + searchRadius)

  let bestY = suggestedY
  let bestScore = 0

  for (let y = minY; y < maxY; y++) {
    let totalDiff = 0
    let samples = 0

    // Amostra a cada 4 pixels horizontais (rápido, precisão suficiente)
    for (let x = 0; x < width; x += 4) {
      const idx1 = (y * width + x) * channels
      const idx2 = ((y + 1) * width + x) * channels
      totalDiff += Math.abs(rawPixels[idx1] - rawPixels[idx2])
      totalDiff += Math.abs(rawPixels[idx1 + 1] - rawPixels[idx2 + 1])
      totalDiff += Math.abs(rawPixels[idx1 + 2] - rawPixels[idx2 + 2])
      samples++
    }

    const avgDiff = totalDiff / (samples * 3)
    // Penaliza levemente distância do ponto sugerido
    const distPenalty = 1 - (Math.abs(y - suggestedY) / searchRadius) * 0.2
    const score = avgDiff * distPenalty

    if (score > bestScore) {
      bestScore = score
      bestY = y
    }
  }

  // Se nenhuma fronteira forte encontrada (diff muito baixo), mantém sugestão
  return bestScore > 10 ? bestY : suggestedY
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ANTHROPIC_API_KEY não configurada nas variáveis de ambiente.",
        },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("image") as File | null
    const imageBase64Input = formData.get("imageBase64") as string | null

    let buffer: Buffer
    let mediaType: "image/png" | "image/jpeg" | "image/webp" = "image/png"

    if (file) {
      if (
        !ALLOWED_IMAGE_TYPES.includes(
          file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Tipo de arquivo não suportado: ${file.type}. Use PNG, JPG ou WebP.`,
          },
          { status: 400 }
        )
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: "Arquivo muito grande. Máximo 20MB." },
          { status: 400 }
        )
      }
      buffer = Buffer.from(await file.arrayBuffer())
      if (file.type === "image/jpeg") mediaType = "image/jpeg"
      if (file.type === "image/webp") mediaType = "image/webp"
    } else if (imageBase64Input) {
      buffer = Buffer.from(imageBase64Input, "base64")
      mediaType = "image/png"
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Envie o arquivo no campo 'image' ou 'imageBase64'.",
        },
        { status: 400 }
      )
    }

    // Passo 1: normalizar para TARGET_WIDTH de largura.
    // Analisamos na MESMA escala do output — zero rescale, zero bugs.
    const meta = await sharp(buffer).metadata()
    const imgWidth = meta.width ?? 0
    const imgHeight = meta.height ?? 0
    if (!imgWidth || !imgHeight) {
      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível ler as dimensões da imagem.",
        },
        { status: 422 }
      )
    }

    let analysisBuffer = buffer
    let analysisWidth = imgWidth
    let analysisHeight = imgHeight

    if (imgWidth !== TARGET_WIDTH) {
      analysisHeight = Math.round((imgHeight / imgWidth) * TARGET_WIDTH)
      analysisWidth = TARGET_WIDTH
      analysisBuffer = await sharp(buffer)
        .resize(TARGET_WIDTH, analysisHeight, { fit: "fill" })
        .png()
        .toBuffer()
      mediaType = "image/png"
    }

    // Claude Vision tem limite de ~5MB em base64 = ~3.7MB binário.
    // Para imagens muito altas (e.g. 600×8000), mesmo em PNG pode passar.
    // Nesse caso caímos para JPEG com qualidade decrescente.
    const CLAUDE_MAX_BYTES = 3.7 * 1024 * 1024
    if (analysisBuffer.length > CLAUDE_MAX_BYTES) {
      for (const quality of [92, 88, 82, 75, 68, 60]) {
        const jpeg = await sharp(buffer)
          .resize(TARGET_WIDTH, analysisHeight, { fit: "fill" })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer()
        if (jpeg.length <= CLAUDE_MAX_BYTES) {
          analysisBuffer = jpeg
          mediaType = "image/jpeg"
          break
        }
      }
    }

    const base64 = analysisBuffer.toString("base64")
    const startTime = Date.now()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Tool use schema — força JSON estruturado, sem parsing de markdown
    const reportTool: Anthropic.Tool = {
      name: "report_email_sections",
      description:
        "Reporta as seções detectadas no email marketing, em ordem vertical.",
      input_schema: {
        type: "object",
        properties: {
          total_height: {
            type: "integer",
            description: `Altura total da imagem em pixels. Deve ser exatamente ${analysisHeight}.`,
          },
          sections: {
            type: "array",
            minItems: 2,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Nome em snake_case com prefixo numérico (ex: 01_hero, 02_body_copy, 03_product_section, 04_reviews, 05_cta_final, 06_footer).",
                },
                y_start: {
                  type: "integer",
                  description: "Coordenada Y inicial em pixels.",
                },
                y_end: {
                  type: "integer",
                  description: "Coordenada Y final em pixels.",
                },
                description: {
                  type: "string",
                  description: "Descrição curta do conteúdo visual da seção.",
                },
              },
              required: ["name", "y_start", "y_end"],
            },
          },
        },
        required: ["total_height", "sections"],
      },
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: [reportTool],
      tool_choice: { type: "tool", name: "report_email_sections" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `${SLICE_PROMPT}\n\nA imagem tem exatamente ${analysisHeight} pixels de altura e ${analysisWidth} pixels de largura. total_height DEVE ser ${analysisHeight}.`,
            },
          ],
        },
      ],
    })

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )

    if (!toolBlock || toolBlock.name !== "report_email_sections") {
      log.error("Claude did not return the expected tool", {
        stopReason: response.stop_reason,
        contentTypes: response.content.map((b) => b.type),
      })
      return NextResponse.json(
        {
          success: false,
          error:
            "A IA não retornou o formato esperado. Tente novamente em alguns segundos.",
        },
        { status: 502 }
      )
    }

    const analysis = toolBlock.input as unknown as ClaudeAnalysis

    if (
      !analysis.sections ||
      !Array.isArray(analysis.sections) ||
      analysis.sections.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhuma seção detectada. A imagem pode não ser um email marketing.",
        },
        { status: 422 }
      )
    }

    // Passo 2: normalizar, fixar extremos, contiguidade
    for (const s of analysis.sections) {
      s.y_start = Math.round(s.y_start)
      s.y_end = Math.round(s.y_end)
      if (s.y_start < 0) s.y_start = 0
      if (s.y_start > analysisHeight) s.y_start = analysisHeight
      if (s.y_end < 0) s.y_end = 0
      if (s.y_end > analysisHeight) s.y_end = analysisHeight
    }
    analysis.sections[0].y_start = 0
    analysis.sections[analysis.sections.length - 1].y_end = analysisHeight

    for (let i = 1; i < analysis.sections.length; i++) {
      if (analysis.sections[i].y_start !== analysis.sections[i - 1].y_end) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    log.info("Claude returned sections", {
      analysisSize: `${analysisWidth}x${analysisHeight}`,
      claudeReportedHeight: analysis.total_height,
      sectionsCount: analysis.sections.length,
      sections: analysis.sections.map((s) => ({
        name: s.name,
        y_start: s.y_start,
        y_end: s.y_end,
        height: s.y_end - s.y_start,
      })),
    })

    // Passo 3: refinar cada boundary com análise de pixels
    try {
      const { data: rawPixels, info } = await sharp(analysisBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true })
      const channels = info.channels

      for (let i = 0; i < analysis.sections.length - 1; i++) {
        const suggestedCut = analysis.sections[i].y_end
        const snappedCut = snapToBoundary(
          rawPixels,
          info.width,
          info.height,
          channels,
          suggestedCut,
          40
        )
        analysis.sections[i].y_end = snappedCut
        analysis.sections[i + 1].y_start = snappedCut
      }
    } catch (snapError) {
      log.warn("Snap-to-boundary failed, using original cuts", {
        error:
          snapError instanceof Error ? snapError.message : String(snapError),
      })
    }

    // Passo 4: auto-merge de seções < 50px (fallback de segurança)
    const filtered: ClaudeSection[] = []
    for (const s of analysis.sections) {
      const height = s.y_end - s.y_start
      if (height < 50 && filtered.length > 0) {
        filtered[filtered.length - 1].y_end = s.y_end
      } else if (height > 0) {
        filtered.push(s)
      }
    }

    if (filtered.length === 0) {
      return NextResponse.json(
        { success: false, error: "Todas as seções ficaram vazias." },
        { status: 500 }
      )
    }

    // Garante extremos após merge
    filtered[0].y_start = 0
    filtered[filtered.length - 1].y_end = analysisHeight
    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i].y_start !== filtered[i - 1].y_end) {
        filtered[i].y_start = filtered[i - 1].y_end
      }
    }

    const durationMs = Date.now() - startTime

    log.info("Final sections", {
      sections: filtered.map((s) => ({
        name: s.name,
        y_start: s.y_start,
        y_end: s.y_end,
        height: s.y_end - s.y_start,
      })),
    })

    return NextResponse.json({
      success: true,
      analysis: {
        total_height: analysisHeight,
        image_width: analysisWidth,
        sections: filtered,
      },
      duration_ms: durationMs,
    })
  } catch (error: unknown) {
    log.error("Slice analysis failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro interno ao analisar imagem"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
