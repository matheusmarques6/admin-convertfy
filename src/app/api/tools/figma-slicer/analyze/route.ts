import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.Analyze")

export const runtime = "nodejs"
export const maxDuration = 30

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const SLICE_ANALYSIS_PROMPT = `Você é um especialista em email marketing design. Analise esta imagem de um email marketing completo e identifique cada seção visual distinta que deve ser cortada como uma imagem separada para montagem em plataforma de email marketing (Omnisend/Klaviyo).

REGRAS CRÍTICAS DE DETECÇÃO:
1. Cada seção é uma faixa horizontal que ocupa a LARGURA TOTAL do email
2. Seções típicas incluem (mas não se limitam a):
   - hero/banner (imagem principal com headline)
   - body/texto (bloco de texto com oferta/desconto)
   - cupom/oferta (bloco de cupom com código)
   - grid de produtos (2x2, 3x3 de produtos com botões "comprar")
   - benefícios/trust badges (ícones de envio, qualidade, segurança)
   - CTA final (chamada para ação com botão)
   - footer (logo, links, copyright)
3. O ponto de corte deve ser EXATAMENTE na fronteira visual entre duas seções — onde uma "faixa" termina e outra começa
4. Se duas áreas têm o mesmo fundo mas conteúdo FUNCIONALMENTE diferente (ex: bloco de texto vs grid de produtos, ambos fundo branco), são seções SEPARADAS
5. Se uma área tem conteúdo que forma uma unidade visual coesa (ex: 3 ícones de trust badges + texto abaixo de cada um), é UMA seção
6. O primeiro slice SEMPRE começa em y_start=0
7. O último slice SEMPRE termina em y_end=<altura total da imagem>
8. y_end de uma seção DEVE ser EXATAMENTE igual ao y_start da próxima — sem gaps, sem sobreposição
9. Cada seção deve ter um nome descritivo curto em snake_case (ex: hero_banner, coupon_code, product_grid, trust_badges, cta_final, footer)

RETORNE APENAS um JSON válido. Sem markdown, sem backticks, sem texto antes ou depois. O formato exato:

{
  "total_height": <altura total da imagem em pixels, deve ser um inteiro>,
  "sections": [
    {
      "name": "hero_banner",
      "y_start": 0,
      "y_end": 780,
      "description": "Banner principal com imagem de produto e headline de desconto"
    },
    {
      "name": "coupon_code",
      "y_start": 780,
      "y_end": 1230,
      "description": "Bloco com código de cupom ESPECIAL e countdown de 12h"
    }
  ]
}

VALIDAÇÃO FINAL antes de retornar:
- total_height é um número inteiro positivo?
- Primeiro y_start é 0?
- Último y_end é igual a total_height?
- Cada y_end === próximo y_start (sem gaps)?
- Todos os valores são inteiros (não decimais)?
- Pelo menos 2 seções detectadas?
Se qualquer validação falhar, corrija antes de retornar.`

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
      log.warn("ANTHROPIC_API_KEY not configured")
      return NextResponse.json(
        {
          success: false,
          error:
            "API do Claude não configurada. Configure ANTHROPIC_API_KEY nas variáveis de ambiente.",
        },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("image") as File | null

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nenhuma imagem enviada. Envie um arquivo no campo "image".',
        },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
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
        { success: false, error: "Arquivo muito grande. Máximo 10MB." },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString("base64")
    const mediaType = file.type as "image/png" | "image/jpeg" | "image/webp"

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const startTime = Date.now()

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
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
              text: SLICE_ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    })

    const analysisMs = Date.now() - startTime

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")

    const cleanJson = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim()

    let analysis: ClaudeAnalysis
    try {
      analysis = JSON.parse(cleanJson) as ClaudeAnalysis
    } catch (parseError) {
      log.error("Failed to parse Claude response", { responseText: cleanJson })
      return NextResponse.json(
        { success: false, error: "Claude retornou resposta inválida. Tente novamente." },
        { status: 500 }
      )
    }

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

    // Garantir que seções são contíguas (corrigir gaps)
    for (let i = 1; i < analysis.sections.length; i++) {
      if (analysis.sections[i].y_start !== analysis.sections[i - 1].y_end) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    // Garantir que começa em 0
    analysis.sections[0].y_start = 0

    // Arredondar todos os valores para inteiros
    for (const section of analysis.sections) {
      section.y_start = Math.round(section.y_start)
      section.y_end = Math.round(section.y_end)
    }

    if (typeof analysis.total_height === "number") {
      analysis.total_height = Math.round(analysis.total_height)
    }

    return NextResponse.json({
      success: true,
      analysis,
      duration_ms: analysisMs,
    })
  } catch (error: unknown) {
    log.error("Slice analysis failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message = error instanceof Error ? error.message : "Erro interno ao analisar imagem"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
