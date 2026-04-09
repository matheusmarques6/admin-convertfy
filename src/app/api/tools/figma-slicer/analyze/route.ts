import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { snapAllBoundaries } from "../lib/snap-to-boundary"

const log = logger.child("FigmaSlicer.Analyze")

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB — cliente aceita até 15, margem

// Claude Vision limita cada imagem a ~5 MB em base64. Base64 cresce ~33%,
// então o PNG binário precisa caber em ~3.7 MB para sobrar margem.
const CLAUDE_MAX_IMAGE_BYTES = 3.7 * 1024 * 1024

const SLICE_ANALYSIS_PROMPT = `Você é um especialista em email marketing que monta emails em plataformas como Omnisend e Klaviyo. Sua tarefa é analisar esta imagem de email marketing e definir EXATAMENTE onde cortar para montar o email na plataforma.

Chame a tool \`report_email_sections\` com a análise completa.

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

## VALIDAÇÕES OBRIGATÓRIAS

- total_height deve ser a altura total em pixels inteiros
- sections[0].y_start deve ser 0
- sections[last].y_end deve ser igual a total_height
- Para cada i: sections[i].y_end === sections[i+1].y_start (sem gaps)
- Todos os y_start e y_end são inteiros
- Cada seção deve ter pelo menos 80px de altura
- Total de seções entre 3 e 10
- Nome da seção em snake_case curto (hero_banner, product_grid, etc)`

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
 * Prepara a imagem para caber no limite de 5 MB (base64) do Claude Vision.
 * Se o binário original já cabe, envia como está. Se não, redimensiona
 * progressivamente e converte para JPEG (mais eficiente) mantendo proporção.
 *
 * Retorna o buffer enviado ao Claude + seu mime type + a altura da imagem
 * que o Claude viu (necessária para reescalar coordenadas de volta ao
 * original).
 */
async function prepareImageForClaude(
  originalBuffer: Buffer,
  originalMime: "image/png" | "image/jpeg" | "image/webp"
): Promise<{
  buffer: Buffer
  mediaType: "image/png" | "image/jpeg" | "image/webp"
  claudeWidth: number
  claudeHeight: number
}> {
  const meta = await sharp(originalBuffer).metadata()
  const originalWidth = meta.width ?? 0
  const originalHeight = meta.height ?? 0

  // Caso 1: binário já cabe
  if (originalBuffer.length <= CLAUDE_MAX_IMAGE_BYTES) {
    return {
      buffer: originalBuffer,
      mediaType: originalMime,
      claudeWidth: originalWidth,
      claudeHeight: originalHeight,
    }
  }

  // Caso 2: redimensionar. Tenta larguras progressivamente menores
  // até caber. 1600 -> 1200 -> 900 -> 700.
  const candidateWidths = [1600, 1200, 900, 700]

  for (const targetWidth of candidateWidths) {
    if (originalWidth > 0 && targetWidth >= originalWidth) {
      // Não aumenta imagem — tenta só com o quality
    }

    const resized = await sharp(originalBuffer)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()

    if (resized.length <= CLAUDE_MAX_IMAGE_BYTES) {
      const resizedMeta = await sharp(resized).metadata()
      return {
        buffer: resized,
        mediaType: "image/jpeg",
        claudeWidth: resizedMeta.width ?? targetWidth,
        claudeHeight: resizedMeta.height ?? 0,
      }
    }
  }

  // Último recurso: 500px + JPEG 75%
  const tiny = await sharp(originalBuffer)
    .resize({ width: 500, withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer()

  const tinyMeta = await sharp(tiny).metadata()
  return {
    buffer: tiny,
    mediaType: "image/jpeg",
    claudeWidth: tinyMeta.width ?? 500,
    claudeHeight: tinyMeta.height ?? 0,
  }
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

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de arquivo não suportado: ${file.type}. Envie PNG, JPG ou WebP (PDFs devem ser convertidos no cliente).`,
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

    const originalBuffer = Buffer.from(await file.arrayBuffer())
    const originalMeta = await sharp(originalBuffer).metadata()
    const originalWidth = originalMeta.width ?? 0
    const originalHeight = originalMeta.height ?? 0

    if (!originalWidth || !originalHeight) {
      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível ler as dimensões da imagem.",
        },
        { status: 422 }
      )
    }

    // Redimensionar (se necessário) para caber no limite do Claude
    const {
      buffer: claudeBuffer,
      mediaType: claudeMediaType,
      claudeHeight,
    } = await prepareImageForClaude(
      originalBuffer,
      file.type as "image/png" | "image/jpeg" | "image/webp"
    )

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Tool use schema — força Claude a retornar JSON estruturado no
    // formato exato, sem depender de parsing de markdown/regex.
    const reportSectionsTool: Anthropic.Tool = {
      name: "report_email_sections",
      description:
        "Reporta as seções detectadas no email marketing analisado. Deve ser chamada uma única vez com todas as seções em ordem vertical.",
      input_schema: {
        type: "object",
        properties: {
          total_height: {
            type: "integer",
            description: "Altura total da imagem em pixels inteiros.",
          },
          sections: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Nome curto em snake_case (ex: hero_banner, product_grid).",
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
                  description: "Descrição curta do conteúdo da seção.",
                },
              },
              required: ["name", "y_start", "y_end"],
            },
          },
        },
        required: ["total_height", "sections"],
      },
    }

    const startTime = Date.now()

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      tools: [reportSectionsTool],
      tool_choice: { type: "tool", name: "report_email_sections" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: claudeMediaType,
                data: claudeBuffer.toString("base64"),
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

    // Extract the tool_use block — Tool Use guarantees valid JSON matching
    // the schema, so no regex parsing is needed.
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    )

    if (!toolUseBlock || toolUseBlock.name !== "report_email_sections") {
      // Fallback: attempt to parse text block as JSON (older behaviour)
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")

      log.error("Claude did not return a tool_use block", {
        stopReason: response.stop_reason,
        contentTypes: response.content.map((b) => b.type),
        textPreview: responseText.slice(0, 500),
      })

      return NextResponse.json(
        {
          success: false,
          error:
            "Claude não retornou o formato esperado. Tente novamente em alguns segundos.",
        },
        { status: 502 }
      )
    }

    const analysis = toolUseBlock.input as unknown as ClaudeAnalysis

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

    // Reescalar coordenadas da escala do Claude para a escala da imagem
    // original. O Claude viu uma imagem de altura `claudeHeight`, então
    // precisamos multiplicar suas coordenadas por (originalHeight / claudeHeight).
    // Usamos claudeHeight (a altura real da imagem enviada) como referência,
    // não analysis.total_height (que o Claude pode ter reportado incorretamente).
    const referenceHeight = claudeHeight > 0 ? claudeHeight : analysis.total_height
    if (referenceHeight > 0 && originalHeight > 0) {
      const scale = originalHeight / referenceHeight
      if (Math.abs(scale - 1) > 0.02) {
        for (const section of analysis.sections) {
          section.y_start = Math.round(section.y_start * scale)
          section.y_end = Math.round(section.y_end * scale)
        }
      }
    }
    analysis.total_height = originalHeight

    // Garantir extremos depois do rescale
    analysis.sections[0].y_start = 0
    analysis.sections[analysis.sections.length - 1].y_end = originalHeight
    for (let i = 1; i < analysis.sections.length; i++) {
      if (
        analysis.sections[i].y_start !== analysis.sections[i - 1].y_end
      ) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    // Snap-to-boundary via análise de pixels na IMAGEM ORIGINAL
    try {
      analysis.sections = await snapAllBoundaries(
        originalBuffer,
        analysis.sections,
        60
      )
    } catch (snapError) {
      log.warn("Snap-to-boundary failed, using Claude's coordinates", {
        error:
          snapError instanceof Error ? snapError.message : String(snapError),
      })
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
    const message =
      error instanceof Error ? error.message : "Erro interno ao analisar imagem"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
