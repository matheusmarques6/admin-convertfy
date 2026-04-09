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

const SLICE_ANALYSIS_PROMPT = `Você é um especialista em email marketing que monta emails em plataformas como Omnisend e Klaviyo. Sua tarefa é analisar esta imagem de email marketing e definir EXATAMENTE onde cortar para montar o email na plataforma.

Chame a tool \`report_email_sections\` com a análise completa.

## TAXONOMIA CANÔNICA — USE SEMPRE QUE POSSÍVEL

Mapeie as seções do email para esta hierarquia na ordem em que aparecerem. Pule categorias que não existirem. Use exatamente estes nomes:

- **01_hero** — Logo + imagem principal (banner) + headline + CTA principal
- **02_body_copy** — Copy da oferta, urgência, cupom, benefícios, blocos de texto promocional, trust badges
- **03_In-Klaviyo_Dynamic_Product_Section** — Grid completo de produtos dinâmicos
- **04_reviews** — Reviews, depoimentos, social proof ("+25.000 clientes"), avaliações/estrelas
- **05_cta_final** — Último bloco antes do footer (APENAS se existir um CTA de fechamento distinto)
- **06_footer** — Logo da marca + menu de navegação + copyright + redes sociais

## ⛔ ERROS CRÍTICOS QUE VOCÊ NÃO PODE COMETER

Estas são as violações mais comuns. NÃO faça nenhuma delas:

❌ **NUNCA corte no meio de um grid de produtos.** Se há um grid 2×2 ou 3×3 com imagens de produto + preço + botão "comprar", TODO o grid é UMA única seção chamada \`03_In-Klaviyo_Dynamic_Product_Section\`. A fronteira entre a linha de cima (produtos 1-2) e a linha de baixo (produtos 3-4) NÃO é um ponto de corte — é parte do mesmo bloco. Se a seção tem 4 produtos em 2 linhas, ela vai do topo do primeiro produto até o final do último produto, em uma fatia só.

❌ **NUNCA nomeie trust badges como \`cta_final\`.** Ícones de "envio grátis", "parcelamento", "compra segura", "frete", "garantia", "suporte" — isso é **trust_badges** e faz parte de \`02_body_copy\` (se estiver antes do grid) ou de \`05_cta_final\` (se for logo antes do footer). Sozinhos, NÃO são uma seção \`cta_final\` — cta_final exige um botão de chamada à ação explícito.

❌ **NUNCA corte o hero antes do headline terminar.** O \`01_hero\` inclui: logo + imagem principal + headline grande + CTA principal. Só termine o hero quando esses 4 elementos já passaram. Se o hero tem uma curvatura ou degradê no final, o corte fica DEPOIS da curvatura, não no meio dela.

❌ **NUNCA separe um botão CTA da seção que ele pertence.** "APROVEITAR AGORA", "COMPRAR COM 10% OFF", "RECUPERAR CÓDIGO" — esses botões fazem parte do bloco acima deles (body_copy, coupon, etc). Não crie uma seção só pra um botão.

❌ **NUNCA quebre reviews individuais.** Se há 3 depoimentos empilhados, eles formam UMA seção \`04_reviews\`.

❌ **NUNCA retorne mais de 8 seções.** Emails típicos têm 4-6 seções. Se você está tentando criar 9-10, está cortando demais — volte e agrupe.

## ✅ REGRA POSITIVA MESTRE

Pergunte para cada corte: "Se eu fizesse isso no Omnisend, as duas fatias resultantes ficariam visualmente coesas sozinhas?" Se uma delas ficaria "cortada no meio" (meio grid, meio texto, meio curvatura), o corte está errado.

## COMO IDENTIFICAR OS BOUNDARIES

Corte SEMPRE em **zonas de espaço vazio** (faixas horizontais de cor de fundo uniforme) entre seções. Tipicamente:
- Fim de uma área com fundo colorido e início de uma com fundo branco
- Espaço horizontal em branco entre blocos de texto
- Linha horizontal ou separador visual
- Mudança drástica de tipo de conteúdo (texto → imagens, banner → texto)

Use coordenadas Y em pixels. O primeiro slice começa em y_start=0. O último termina em y_end=altura_total. Cada y_end deve ser igual ao y_start da próxima seção.

## VALIDAÇÕES OBRIGATÓRIAS

- total_height é inteiro positivo
- sections[0].y_start === 0
- sections[last].y_end === total_height
- Para cada i: sections[i].y_end === sections[i+1].y_start
- Todos os y são inteiros
- Cada seção tem pelo menos 80px de altura
- Total de seções entre 3 e 8 (idealmente 4-6)
- Nomes seguem o padrão NN_nome`

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

    // Arredondar todos os valores para inteiros
    for (const section of analysis.sections) {
      section.y_start = Math.round(section.y_start)
      section.y_end = Math.round(section.y_end)
    }

    // Garantir que começa em 0
    analysis.sections[0].y_start = 0

    // Corrigir gaps (y_end de uma deve ser y_start da próxima)
    for (let i = 1; i < analysis.sections.length; i++) {
      if (
        analysis.sections[i].y_start !== analysis.sections[i - 1].y_end
      ) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    // ===================================================================
    // RESCALE: o Claude vê uma imagem de tamanho potencialmente diferente
    // da original (porque redimensionamos para ≤1568px, ou porque o
    // Claude fez downscaling interno). Suas coordenadas são na escala
    // que ELE viu. Precisamos escalar de volta para a imagem original.
    //
    // A escala é inferida da última seção: lastSection.y_end representa
    // o "fim do email" na escala do Claude. Se ele viu uma imagem de
    // 1568 de altura, a última seção termina em ~1568. Dividimos a
    // altura original por esse valor para obter o fator de escala.
    // ===================================================================
    const lastSection = analysis.sections[analysis.sections.length - 1]
    const claudeMaxY = Math.max(
      lastSection.y_end,
      analysis.total_height || 0
    )

    log.info("Claude returned sections", {
      originalSize: `${originalWidth}x${originalHeight}`,
      claudeSentSize: `${claudeWidth}x${claudeHeight}`,
      claudeReportedHeight: analysis.total_height,
      claudeMaxY,
      sectionsCount: analysis.sections.length,
      firstSectionYEnd: analysis.sections[0].y_end,
      lastSectionYEnd: lastSection.y_end,
    })

    if (claudeMaxY > 0 && originalHeight > 0) {
      const scale = originalHeight / claudeMaxY
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
      // Clampar pra não passar da altura original
      if (analysis.sections[i].y_end > originalHeight) {
        analysis.sections[i].y_end = originalHeight
      }
      if (analysis.sections[i].y_start > originalHeight) {
        analysis.sections[i].y_start = originalHeight
      }
    }

    // Filtrar seções degeneradas (altura ≤ 0) que podem ter aparecido
    // depois do rescale se o Claude colapsou algumas
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
