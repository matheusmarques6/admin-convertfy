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

// Claude Vision processa internamente imagens para um máximo de 1568px
// na maior dimensão. Se enviarmos uma imagem maior, o Claude reduz
// silenciosamente e retorna coordenadas na escala reduzida — o que quebra
// nosso rescale. Para garantir coordenadas previsíveis, redimensionamos
// nós mesmos para que a maior dimensão seja exatamente 1568px.
// Ref: https://docs.anthropic.com/en/docs/build-with-claude/vision#image-best-practices
const CLAUDE_MAX_DIMENSION = 1568

// Limite de 5 MB em base64 → ~3.7 MB em binário.
const CLAUDE_MAX_IMAGE_BYTES = 3.7 * 1024 * 1024

/**
 * Gera o prompt de análise injetando dinamicamente a altura real da
 * imagem que o Claude está vendo. Isso evita que ele tente adivinhar
 * a escala e erra o total_height.
 */
function buildSliceAnalysisPrompt(claudeHeight: number): string {
  return `Você é um especialista em email marketing que monta emails em plataformas como Omnisend e Klaviyo. Sua tarefa é analisar esta imagem de email e definir EXATAMENTE onde cortar para montar o email na plataforma.

Chame a tool \`report_email_sections\` com a análise completa.

## INFORMAÇÃO CRÍTICA SOBRE A IMAGEM

A imagem que você está vendo tem EXATAMENTE **${claudeHeight} pixels de altura**. Todas as coordenadas Y que você retornar DEVEM estar entre 0 e ${claudeHeight}.

- total_height DEVE ser exatamente ${claudeHeight}
- sections[0].y_start DEVE ser 0
- sections[last].y_end DEVE ser exatamente ${claudeHeight}
- Nenhuma coordenada pode ultrapassar ${claudeHeight}

## ABORDAGEM DE ANÁLISE — FAÇA NESTA ORDEM

**Passo 1**: Identifique visualmente TODOS os blocos distintos do email, de cima a baixo. Liste o que você vê: hero? texto? cupom? grid de produtos? reviews? footer?

**Passo 2**: Agrupe blocos relacionados em **4 a 6 seções lógicas**. Cada seção deve ser visualmente coesa por si só.

**Passo 3**: Para cada seção, defina as coordenadas y_start e y_end em pixels.

## TAXONOMIA SUGERIDA (não força — use quando fizer sentido natural)

Quando uma seção se encaixar perfeitamente em uma destas categorias, use o nome canônico:

- **01_hero**: logo + imagem grande do topo + headline grande + CTA principal
- **02_body_copy**: textos promocionais + cupom + trust badges + botões CTA do corpo (PODE ter várias centenas de pixels, incluindo título "BOAS-VINDAS", texto da oferta, cupom, botão APROVEITAR AGORA e ícones de benefício)
- **03_In-Klaviyo_Dynamic_Product_Section**: APENAS o grid de produtos (2×2, 3×3, etc.). NÃO inclua texto ou botões antes/depois do grid — só os cards dos produtos.
- **04_reviews**: "+N clientes", depoimentos, estrelas, social proof
- **05_cta_final**: APENAS se houver um bloco FINAL distinto com botão entre reviews e footer
- **06_footer**: logo + menu de navegação + copyright

Se uma seção não se encaixar claramente, use um nome descritivo em snake_case (ex: \`02_welcome_offer\`, \`03_coupon_block\`, \`04_product_grid\`, \`05_trust_badges\`). **É MELHOR usar um nome natural do que forçar uma categoria errada.**

## ⛔ ERROS CRÍTICOS QUE VOCÊ NÃO PODE COMETER

❌ **NUNCA crie seções minúsculas (<100 pixels de altura).** Se uma seção tem menos de 100px, você está dividindo demais — merge com a seção adjacente.

❌ **NUNCA force a taxonomia.** Se o email não tem um "body_copy" claro, não crie uma seção vazia chamada body_copy só pra ter. Pule e vá pra próxima categoria. Se o email não tem um "cta_final" distinto, NÃO crie um.

❌ **NUNCA corte no meio de um grid de produtos.** Se há um grid 2×2 com produtos 1,2,3,4 em quadrado, o corte NÃO fica entre a linha 1-2 e a linha 3-4. TODO o grid é UMA seção só. Pergunta para si: "Se eu cortasse aqui, ficaria um produto isolado numa fatia?" Se sim, o corte está errado.

❌ **NUNCA jogue o corpo do email dentro da seção de produtos.** Textos, cupons, trust badges que vêm ANTES do grid ficam em \`02_body_copy\`. A \`03_In-Klaviyo_Dynamic_Product_Section\` contém APENAS as imagens dos produtos + preços + botões "comprar".

❌ **NUNCA corte o hero antes do headline terminar.** O hero inclui: logo + imagem de fundo + headline grande. Se o hero tem curvatura ou degradê no final, o corte fica DEPOIS disso.

❌ **NUNCA separe um botão CTA da seção acima dele.** "APROVEITAR AGORA", "COMPRAR 10% OFF" fazem parte do bloco de texto/cupom acima, não são uma seção sozinha.

❌ **NUNCA quebre reviews individuais em seções separadas.**

❌ **NUNCA retorne mais de 7 seções.** Emails típicos têm 4-5 seções. Se você está tentando criar 8+, está cortando demais.

## ✅ REGRA MESTRE POSITIVA

Para cada corte, pergunte: "Se eu montasse isso no Omnisend, as duas fatias resultantes ficariam visualmente coesas e funcionais sozinhas?" Se a resposta é NÃO (fatia com texto cortado, meio grid, botão órfão, etc.), o corte está errado — recue ou avance até encontrar um espaço vazio claro.

Corte sempre em faixas de espaço vazio (fundo uniforme) entre blocos, nunca em cima de conteúdo.`
}

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
 * Prepara a imagem para o Claude Vision garantindo que:
 *
 * 1. A maior dimensão seja EXATAMENTE ≤ 1568px (limite interno do Claude).
 *    Se for maior, o Claude reduz silenciosamente e retorna coordenadas
 *    na escala reduzida, quebrando nosso rescale.
 * 2. O binário caiba no limite de ~5MB (base64) do Claude.
 *
 * Retorna também a altura e largura que o Claude efetivamente vai ver
 * (essenciais para reescalar as coordenadas de volta para o original).
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

  // Calcular as dimensões alvo: nunca exceder CLAUDE_MAX_DIMENSION na
  // maior dimensão; mantém aspect ratio; nunca faz upscale.
  let targetWidth = originalWidth
  let targetHeight = originalHeight

  const longestEdge = Math.max(originalWidth, originalHeight)
  if (longestEdge > CLAUDE_MAX_DIMENSION) {
    const scale = CLAUDE_MAX_DIMENSION / longestEdge
    targetWidth = Math.round(originalWidth * scale)
    targetHeight = Math.round(originalHeight * scale)
  }

  const needsResize =
    targetWidth !== originalWidth || targetHeight !== originalHeight

  // Caso 1: dimensões já são OK E binário cabe → envia como está.
  if (!needsResize && originalBuffer.length <= CLAUDE_MAX_IMAGE_BYTES) {
    return {
      buffer: originalBuffer,
      mediaType: originalMime,
      claudeWidth: originalWidth,
      claudeHeight: originalHeight,
    }
  }

  // Caso 2: precisa reescalar. Tenta primeiro PNG (sem perda), depois
  // JPEG com qualidade decrescente até caber nos bytes.
  const resizeOptions = {
    width: targetWidth,
    height: targetHeight,
    fit: "inside" as const,
    withoutEnlargement: true,
  }

  // Tenta PNG primeiro (preserva nitidez para detecção de boundaries)
  const pngBuffer = await sharp(originalBuffer)
    .resize(resizeOptions)
    .png({ compressionLevel: 9 })
    .toBuffer()

  if (pngBuffer.length <= CLAUDE_MAX_IMAGE_BYTES) {
    const pngMeta = await sharp(pngBuffer).metadata()
    return {
      buffer: pngBuffer,
      mediaType: "image/png",
      claudeWidth: pngMeta.width ?? targetWidth,
      claudeHeight: pngMeta.height ?? targetHeight,
    }
  }

  // PNG não coube — cai para JPEG com qualidade decrescente
  for (const quality of [90, 85, 80, 75, 70, 60]) {
    const jpegBuffer = await sharp(originalBuffer)
      .resize(resizeOptions)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()

    if (jpegBuffer.length <= CLAUDE_MAX_IMAGE_BYTES) {
      const jpegMeta = await sharp(jpegBuffer).metadata()
      return {
        buffer: jpegBuffer,
        mediaType: "image/jpeg",
        claudeWidth: jpegMeta.width ?? targetWidth,
        claudeHeight: jpegMeta.height ?? targetHeight,
      }
    }
  }

  // Último recurso: reduzir também as dimensões
  const fallbackBuffer = await sharp(originalBuffer)
    .resize({
      width: Math.min(targetWidth, 1000),
      height: Math.min(targetHeight, 1000),
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer()

  const fallbackMeta = await sharp(fallbackBuffer).metadata()
  return {
    buffer: fallbackBuffer,
    mediaType: "image/jpeg",
    claudeWidth: fallbackMeta.width ?? 0,
    claudeHeight: fallbackMeta.height ?? 0,
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
      claudeWidth,
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
        "Reporta as seções detectadas no email marketing analisado. Deve ser chamada uma única vez com todas as seções em ordem vertical, seguindo a taxonomia canônica do prompt.",
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
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Nome da seção no formato NN_categoria (ex: 01_hero, 02_body_copy, 03_In-Klaviyo_Dynamic_Product_Section, 04_reviews, 05_cta_final, 06_footer). Use exatamente esses nomes quando a seção se encaixar na taxonomia canônica. Pule categorias que não existirem no email e mantenha numeração sequencial.",
                },
                y_start: {
                  type: "integer",
                  description:
                    "Coordenada Y inicial em pixels da imagem original.",
                },
                y_end: {
                  type: "integer",
                  description:
                    "Coordenada Y final em pixels. Deve ser igual ao y_start da próxima seção.",
                },
                description: {
                  type: "string",
                  description:
                    "Descrição curta do conteúdo visual desta seção.",
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
              text: buildSliceAnalysisPrompt(claudeHeight),
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

    // Arredondar inteiros
    for (const section of analysis.sections) {
      section.y_start = Math.round(section.y_start)
      section.y_end = Math.round(section.y_end)
    }

    // Garantir que começa em 0 e termina no claudeHeight (a altura real
    // da imagem que enviamos) — isso normaliza erros do Claude sobre o
    // ponto final do email.
    analysis.sections[0].y_start = 0
    analysis.sections[analysis.sections.length - 1].y_end = claudeHeight

    // Clampar y_start/y_end ao intervalo [0, claudeHeight]
    for (const section of analysis.sections) {
      if (section.y_start < 0) section.y_start = 0
      if (section.y_start > claudeHeight) section.y_start = claudeHeight
      if (section.y_end < 0) section.y_end = 0
      if (section.y_end > claudeHeight) section.y_end = claudeHeight
    }

    // Corrigir gaps/sobreposições: y_end de uma = y_start da próxima
    for (let i = 1; i < analysis.sections.length; i++) {
      if (
        analysis.sections[i].y_start !== analysis.sections[i - 1].y_end
      ) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    log.info("Claude returned sections (pre-rescale)", {
      originalSize: `${originalWidth}x${originalHeight}`,
      claudeSentSize: `${claudeWidth}x${claudeHeight}`,
      claudeReportedHeight: analysis.total_height,
      sectionsCount: analysis.sections.length,
      sections: analysis.sections.map((s) => ({
        name: s.name,
        y_start: s.y_start,
        y_end: s.y_end,
        height: s.y_end - s.y_start,
      })),
    })

    // =====================================================================
    // AUTO-MERGE DE SEÇÕES MINÚSCULAS
    // Se o Claude criou uma seção com < 100px de altura (ainda na escala
    // dele), provavelmente forçou um nome canônico onde não devia.
    // Merge automático com a seção vizinha MAIOR para não perder conteúdo.
    // =====================================================================
    const MIN_SECTION_HEIGHT_CLAUDE_SCALE = 100
    let mergedSomething = true
    while (mergedSomething && analysis.sections.length > 1) {
      mergedSomething = false
      for (let i = 0; i < analysis.sections.length; i++) {
        const height = analysis.sections[i].y_end - analysis.sections[i].y_start
        if (height >= MIN_SECTION_HEIGHT_CLAUDE_SCALE) continue

        // Merge com vizinho mais alto (prioriza o de cima se existir)
        if (i === 0 && analysis.sections.length > 1) {
          // Primeira seção é minúscula — merge com a próxima (ela absorve)
          analysis.sections[1].y_start = analysis.sections[0].y_start
          analysis.sections.splice(0, 1)
        } else if (i === analysis.sections.length - 1) {
          // Última seção é minúscula — merge com a anterior
          analysis.sections[i - 1].y_end = analysis.sections[i].y_end
          analysis.sections.splice(i, 1)
        } else {
          // No meio — merge com a vizinha que tem nome mais "genérico"
          // (preferência: body_copy > outras). Na dúvida, com a anterior.
          analysis.sections[i - 1].y_end = analysis.sections[i].y_end
          analysis.sections.splice(i, 1)
        }
        mergedSomething = true
        break
      }
    }

    // =====================================================================
    // RESCALE: converte coordenadas da escala do Claude (claudeHeight) para
    // a escala da imagem original (originalHeight). claudeHeight é FIXO e
    // conhecido (é o tamanho da imagem que enviamos), então o scale é
    // determinístico. Nada de inferir "referenceHeight" do retorno do
    // Claude — isso quebrava quando o Claude reportava altura errada.
    // =====================================================================
    if (claudeHeight > 0 && originalHeight > 0 && claudeHeight !== originalHeight) {
      const scale = originalHeight / claudeHeight
      for (const section of analysis.sections) {
        section.y_start = Math.round(section.y_start * scale)
        section.y_end = Math.round(section.y_end * scale)
      }
    }

    // Garantir extremos e contiguidade depois do rescale
    analysis.total_height = originalHeight
    analysis.sections[0].y_start = 0
    analysis.sections[analysis.sections.length - 1].y_end = originalHeight
    for (let i = 1; i < analysis.sections.length; i++) {
      if (
        analysis.sections[i].y_start !== analysis.sections[i - 1].y_end
      ) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
      if (analysis.sections[i].y_end > originalHeight) {
        analysis.sections[i].y_end = originalHeight
      }
      if (analysis.sections[i].y_start > originalHeight) {
        analysis.sections[i].y_start = originalHeight
      }
    }

    // Filtrar seções degeneradas (altura ≤ 0)
    analysis.sections = analysis.sections.filter(
      (s) => s.y_end - s.y_start > 0
    )
    if (analysis.sections.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Todas as seções ficaram vazias após rescale.",
        },
        { status: 500 }
      )
    }

    // Snap-to-boundary via análise de pixels na IMAGEM ORIGINAL com
    // safeguard: guarda as coordenadas originais e aceita o snap apenas
    // se ele move a posição em menos de 8% da altura da imagem. Isso
    // impede que o snap grude em um gap errado muito distante.
    try {
      const beforeSnap = analysis.sections.map((s) => ({
        y_start: s.y_start,
        y_end: s.y_end,
      }))
      const snapped = await snapAllBoundaries(
        originalBuffer,
        analysis.sections,
        60
      )

      const maxSnapDistance = Math.round(originalHeight * 0.08)
      const safelyMerged = snapped.map((s, i) => {
        if (!beforeSnap[i]) return s
        const orig = beforeSnap[i]
        // Se o snap moveu y_start ou y_end em mais de 8%, rejeita o snap
        // dessa seção específica e mantém as coordenadas pré-snap.
        if (
          Math.abs(s.y_start - orig.y_start) > maxSnapDistance ||
          Math.abs(s.y_end - orig.y_end) > maxSnapDistance
        ) {
          return { ...s, y_start: orig.y_start, y_end: orig.y_end }
        }
        return s
      })

      // Re-garantir contiguidade após o merge seguro
      for (let i = 1; i < safelyMerged.length; i++) {
        if (safelyMerged[i].y_start !== safelyMerged[i - 1].y_end) {
          safelyMerged[i].y_start = safelyMerged[i - 1].y_end
        }
      }
      safelyMerged[0].y_start = 0
      safelyMerged[safelyMerged.length - 1].y_end = originalHeight

      analysis.sections = safelyMerged
    } catch (snapError) {
      log.warn("Snap-to-boundary failed, using Claude's coordinates", {
        error:
          snapError instanceof Error ? snapError.message : String(snapError),
      })
    }

    log.info("Final sections (post-snap)", {
      sections: analysis.sections.map((s) => ({
        name: s.name,
        y_start: s.y_start,
        y_end: s.y_end,
        height: s.y_end - s.y_start,
      })),
    })

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
