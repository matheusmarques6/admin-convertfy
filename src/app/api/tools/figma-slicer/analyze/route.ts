import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { snapAllBoundaries } from "../lib/snap-to-boundary"
import { pdfBufferToPngBuffer } from "../lib/pdf-to-image"

const log = logger.child("FigmaSlicer.Analyze")

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const PDF_MIME_TYPE = "application/pdf"
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB (PDFs podem ser maiores)

const SLICE_ANALYSIS_PROMPT = `Você é um especialista em email marketing que monta emails em plataformas como Omnisend e Klaviyo. Sua tarefa é analisar esta imagem de email marketing e definir EXATAMENTE onde cortar para montar o email na plataforma.

## COMO PENSAR SOBRE OS CORTES

Imagine que você vai montar este email no Omnisend. Cada seção que você definir será uma IMAGEM SEPARADA empilhada verticalmente. Os cortes devem ser nos pontos onde, ao montar no Omnisend, você naturalmente separaria os blocos.

## REGRAS OBRIGATÓRIAS

1. MENOS É MAIS: Prefira MENOS cortes. Se uma área funciona como uma unidade visual, mantenha como UMA seção. Emails típicos têm entre 4 e 8 seções no total. Raramente mais de 8.

2. NÃO QUEBRE BLOCOS DE TEXTO: Se há um título + subtítulo + parágrafo + botão CTA, isso é UMA seção. Não separe o título do corpo de texto. Não separe o botão do texto acima dele.

3. NÃO QUEBRE BLOCOS DE CONTEÚDO RELACIONADO: Se há um título "ÚLTIMA OPORTUNIDADE" com um cupom "ESPECIAL" e um botão "RECUPERAR O CÓDIGO" abaixo — isso é TUDO UMA seção. São peças do mesmo bloco.

4. GRID DE PRODUTOS = UMA SEÇÃO: Se há 2x2 ou 3x3 de produtos com imagens + preço + botão "comprar", todo o grid é UMA seção. Não corte entre a linha de cima e a linha de baixo do grid.

5. TRUST BADGES = UMA SEÇÃO: Ícones de envio grátis + qualidade + pagamento seguro + o texto abaixo de cada ícone = UMA seção.

6. SOCIAL PROOF = UMA SEÇÃO: Bloco de "+25.000 clientes" + avaliações + estrelas = UMA seção.

7. CORTE NAS FRONTEIRAS VISUAIS ÓBVIAS: Corte onde há uma mudança CLARA de:
   - Cor de fundo (branco → preto, branco → azul, etc)
   - Tipo de conteúdo (texto → imagens de produto, banner → texto)
   - Função (conteúdo promocional → footer com links)

8. UM BLOCO COM BOTÃO CTA: Se uma seção termina com um botão (ex: "APROVEITAR AGORA", "COMPRAR COM 10% OFF"), o botão faz PARTE dessa seção. Não crie uma seção separada só para um botão.

## SEÇÕES TÍPICAS DE UM EMAIL MARKETING (para referência)

- hero_banner: Imagem principal no topo com logo, foto de produto/lifestyle, headline e CTA
- welcome_text: Bloco de texto de boas-vindas com headline, body text, e CTA (TUDO JUNTO)
- coupon_block: Bloco com código de cupom, porcentagem, timer, e botão para copiar/usar
- product_grid: Grid com múltiplos produtos (imagens, nomes, preços, botões "comprar") — TODO O GRID é 1 seção
- trust_badges: Ícones com benefícios (frete, qualidade, segurança) — TODOS juntos são 1 seção
- social_proof: Depoimentos, avaliações, número de clientes satisfeitos
- cta_final: Último bloco de chamada para ação antes do footer
- footer: Logo da marca, links de navegação, copyright, redes sociais

## FORMATO DE RESPOSTA

Retorne APENAS JSON válido. Sem markdown, sem backticks, sem texto antes ou depois.

{
  "total_height": <altura total em pixels inteiros>,
  "sections": [
    {
      "name": "hero_banner",
      "y_start": 0,
      "y_end": <onde termina o hero e começa a próxima seção>,
      "description": "Descrição curta do conteúdo desta seção"
    }
  ]
}

VALIDAÇÕES ANTES DE RETORNAR:
- total_height é inteiro positivo
- sections[0].y_start === 0
- sections[last].y_end === total_height
- Para cada i: sections[i].y_end === sections[i+1].y_start (sem gaps)
- Todos os y_start e y_end são inteiros
- Cada seção tem pelo menos 80px de altura (seções menores que 80px provavelmente estão erradas — merge com a seção adjacente)
- Total de seções está entre 3 e 10 (se tiver mais de 10, você está cortando demais — volte e merge seções relacionadas)`

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
          error: 'Nenhum arquivo enviado. Envie um arquivo no campo "image".',
        },
        { status: 400 }
      )
    }

    const isPdf = file.type === PDF_MIME_TYPE
    const isImage = ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
    )

    if (!isPdf && !isImage) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de arquivo não suportado: ${file.type}. Use PNG, JPG, WebP ou PDF.`,
        },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Arquivo muito grande. Máximo 15MB." },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString("base64")

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const startTime = Date.now()

    // Para PDF: enviar como documento. Para imagem: enviar como image.
    const fileContentBlock = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: file.type as "image/png" | "image/jpeg" | "image/webp",
            data: base64,
          },
        }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            fileContentBlock,
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
    } catch {
      log.error("Failed to parse Claude response", { responseText: cleanJson })
      return NextResponse.json(
        {
          success: false,
          error: "Claude retornou resposta inválida. Tente novamente.",
        },
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
          error:
            "Nenhuma seção detectada. O arquivo pode não ser um email marketing.",
        },
        { status: 422 }
      )
    }

    // Garantir que seções são contíguas (corrigir gaps)
    for (let i = 1; i < analysis.sections.length; i++) {
      if (
        analysis.sections[i].y_start !== analysis.sections[i - 1].y_end
      ) {
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

    // Obter um buffer PNG para:
    // (a) snap-to-boundary via análise de pixels
    // (b) retornar como preview quando a origem é PDF
    let pngBuffer: Buffer
    try {
      pngBuffer = isPdf ? await pdfBufferToPngBuffer(buffer, 2) : buffer
    } catch (pdfError) {
      log.error("PDF conversion failed", {
        error:
          pdfError instanceof Error ? pdfError.message : String(pdfError),
      })
      return NextResponse.json(
        {
          success: false,
          error:
            "Falha ao converter PDF para imagem. Verifique se o arquivo é válido.",
        },
        { status: 422 }
      )
    }

    // Descobrir dimensões reais da imagem PNG
    const pngMeta = await sharp(pngBuffer).metadata()
    const actualWidth = pngMeta.width ?? 0
    const actualHeight = pngMeta.height ?? 0

    // Se o Claude retornou coordenadas em uma escala diferente da imagem PNG,
    // reescalar antes do snap. (Comum em PDFs: Claude pode reportar coords
    // em unidades do PDF, não pixels.)
    if (actualHeight > 0 && analysis.total_height > 0) {
      const scale = actualHeight / analysis.total_height
      if (Math.abs(scale - 1) > 0.02) {
        for (const section of analysis.sections) {
          section.y_start = Math.round(section.y_start * scale)
          section.y_end = Math.round(section.y_end * scale)
        }
        analysis.total_height = actualHeight
      }
    }

    // Garantir limites após rescale
    analysis.sections[0].y_start = 0
    analysis.sections[analysis.sections.length - 1].y_end = actualHeight
    for (let i = 1; i < analysis.sections.length; i++) {
      if (
        analysis.sections[i].y_start !== analysis.sections[i - 1].y_end
      ) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    // Snap-to-boundary via análise de pixels
    try {
      analysis.sections = await snapAllBoundaries(
        pngBuffer,
        analysis.sections,
        60
      )
    } catch (snapError) {
      log.warn("Snap-to-boundary failed, using Claude's coordinates", {
        error:
          snapError instanceof Error ? snapError.message : String(snapError),
      })
    }

    // Se for PDF, retornar também o PNG como preview base64
    let previewImage: string | null = null
    let previewDimensions: { width: number; height: number } | null = null
    if (isPdf) {
      previewImage = pngBuffer.toString("base64")
      previewDimensions = { width: actualWidth, height: actualHeight }
    }

    return NextResponse.json({
      success: true,
      analysis,
      duration_ms: analysisMs,
      preview_image: previewImage,
      preview_dimensions: previewDimensions,
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
