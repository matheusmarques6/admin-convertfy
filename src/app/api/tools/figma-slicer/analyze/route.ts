import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { snapAllBoundaries } from "../lib/snap-to-boundary"
import { drawCutLinesOverlay } from "../lib/draw-cut-lines"

const log = logger.child("FigmaSlicer.Analyze")

export const runtime = "nodejs"
// Dupla verificação (Sonnet + Opus) pode demorar um pouco mais
export const maxDuration = 120

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB — cliente aceita até 15, margem

// =========================================================================
// DIMENSÕES DA IMAGEM ENVIADA AO CLAUDE VISION
//
// Estratégia CRÍTICA: nunca deixar a largura ficar estreita demais.
// Emails marketing são sempre altos (1200×5000+ px típico). Se usarmos
// "maior dimensão ≤ 1568px", uma imagem 1200×8000 vira 234×1568, ficando
// ilegível para o Claude e retornando coordenadas completamente erradas.
//
// Nova abordagem: target LARGURA 1024px (legível), altura cresce
// proporcionalmente até o limite absoluto do Claude (8000px).
//
// Ref: https://docs.anthropic.com/en/docs/build-with-claude/vision
// =========================================================================
const CLAUDE_TARGET_WIDTH = 1024
const CLAUDE_MAX_HEIGHT = 8000

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
 * Prepara a imagem para o Claude Vision preservando LEGIBILIDADE.
 *
 * Regra principal: target LARGURA = 1024px. Altura cresce
 * proporcionalmente. Isso garante que o texto, produtos e elementos
 * do email fiquem visíveis ao Claude — ao contrário de forçar a maior
 * dimensão a ≤1568 (que para emails altos gera imagens ultra-estreitas).
 *
 * Casos:
 * - Largura < 1024: usa a largura original (não faz upscale)
 * - Largura > 1024: reduz para 1024, altura proporcional
 * - Após reduzir, se altura > 8000 (limite Claude): reduz mais ainda
 *
 * Depois tenta PNG (preserva boundaries); se passar de 3.7MB, cai
 * para JPEG com qualidade decrescente.
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

  // Passo 1: calcular dimensões alvo preservando aspect ratio
  let targetWidth = originalWidth
  let targetHeight = originalHeight

  // Se a imagem é mais larga que CLAUDE_TARGET_WIDTH, reduz
  if (originalWidth > CLAUDE_TARGET_WIDTH) {
    const scale = CLAUDE_TARGET_WIDTH / originalWidth
    targetWidth = CLAUDE_TARGET_WIDTH
    targetHeight = Math.round(originalHeight * scale)
  }

  // Se após redução a altura ainda passa do limite Claude, reduz mais
  if (targetHeight > CLAUDE_MAX_HEIGHT) {
    const scale = CLAUDE_MAX_HEIGHT / targetHeight
    targetHeight = CLAUDE_MAX_HEIGHT
    targetWidth = Math.round(targetWidth * scale)
  }

  const needsResize =
    targetWidth !== originalWidth || targetHeight !== originalHeight

  // Caso 1: dimensões já são OK E binário cabe → envia como está
  if (!needsResize && originalBuffer.length <= CLAUDE_MAX_IMAGE_BYTES) {
    return {
      buffer: originalBuffer,
      mediaType: originalMime,
      claudeWidth: originalWidth,
      claudeHeight: originalHeight,
    }
  }

  // Caso 2: precisa reescalar ou reencodar
  const resizeOptions = {
    width: targetWidth,
    height: targetHeight,
    fit: "inside" as const,
    withoutEnlargement: true,
  }

  // Tenta PNG primeiro (preserva nitidez para snap-to-boundary)
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

  // PNG não coube — tenta JPEG com qualidade decrescente mantendo
  // as mesmas dimensões (não reduz mais para manter legibilidade)
  for (const quality of [92, 88, 82, 75, 68, 60]) {
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

  // Último recurso: reduz a largura para 800 (ainda legível) + JPEG 65
  const fallbackScale = 800 / targetWidth
  const fallbackBuffer = await sharp(originalBuffer)
    .resize({
      width: 800,
      height: Math.round(targetHeight * fallbackScale),
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 65, mozjpeg: true })
    .toBuffer()

  const fallbackMeta = await sharp(fallbackBuffer).metadata()
  return {
    buffer: fallbackBuffer,
    mediaType: "image/jpeg",
    claudeWidth: fallbackMeta.width ?? 800,
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
    // DUPLA VERIFICAÇÃO VISUAL (Opus revisor)
    // Desenha as linhas de corte propostas sobre a imagem e pede para
    // o Claude Opus (mais preciso em tarefas visuais) revisar se cada
    // linha está no lugar certo. Se alguma está cortando no meio de
    // conteúdo, Opus retorna a coordenada Y corrigida.
    //
    // Só roda se houver pelo menos 2 seções (1 ou mais cortes intermediários).
    // =====================================================================
    if (analysis.sections.length >= 2) {
      try {
        const cutLinesForReview = analysis.sections
          .slice(0, -1)
          .map((s, idx) => ({
            y: s.y_end,
            label: `CUT ${idx + 1} → y=${s.y_end} (between ${s.name} and ${analysis.sections[idx + 1].name})`,
          }))

        const annotatedBuffer = await drawCutLinesOverlay(
          claudeBuffer,
          cutLinesForReview
        )

        // A imagem anotada pode ter ficado maior — se passar do limite,
        // cai para JPEG com qualidade menor
        let reviewBuffer = annotatedBuffer
        let reviewMediaType: "image/png" | "image/jpeg" = "image/jpeg"
        if (reviewBuffer.length > CLAUDE_MAX_IMAGE_BYTES) {
          for (const quality of [80, 70, 60]) {
            reviewBuffer = await sharp(annotatedBuffer)
              .jpeg({ quality, mozjpeg: true })
              .toBuffer()
            if (reviewBuffer.length <= CLAUDE_MAX_IMAGE_BYTES) break
          }
        }

        const verifyTool: Anthropic.Tool = {
          name: "verify_cut_lines",
          description:
            "Retorna a verificação e correções das linhas de corte marcadas em vermelho na imagem.",
          input_schema: {
            type: "object",
            properties: {
              all_correct: {
                type: "boolean",
                description:
                  "true se TODAS as linhas vermelhas estão em posições corretas (em espaço vazio entre seções). false se alguma precisa ser corrigida.",
              },
              corrections: {
                type: "array",
                description:
                  "Lista de correções. Vazia se all_correct=true. Inclua APENAS as linhas que precisam mudar.",
                items: {
                  type: "object",
                  properties: {
                    cut_index: {
                      type: "integer",
                      description:
                        "Índice da linha de corte (começa em 1, conforme rotulado na imagem: CUT 1, CUT 2, ...).",
                    },
                    corrected_y: {
                      type: "integer",
                      description:
                        "Nova coordenada Y correta, em pixels da imagem anotada. Deve estar em um espaço vazio entre duas seções.",
                    },
                    reason: {
                      type: "string",
                      description:
                        "Por que a linha original estava errada (ex: 'cortava no meio do grid de produtos', 'separava botão do texto acima').",
                    },
                  },
                  required: ["cut_index", "corrected_y", "reason"],
                },
              },
            },
            required: ["all_correct", "corrections"],
          },
        }

        const reviewPrompt = `Você está revisando cortes de um email marketing. A imagem que você está vendo tem linhas horizontais VERMELHAS desenhadas sobre ela — são cortes propostos por um modelo anterior entre as seções visuais do email.

A imagem tem exatamente ${claudeHeight} pixels de altura.

Sua tarefa: verificar se cada linha vermelha (CUT 1, CUT 2, ...) está no lugar CORRETO.

## REGRAS DE VERIFICAÇÃO

Uma linha de corte está CORRETA quando:
✅ Está em um espaço vazio (fundo uniforme) entre duas seções visuais distintas
✅ Não atravessa texto, botões, imagens de produto, reviews ou qualquer conteúdo
✅ Está em uma mudança clara de cor de fundo ou tipo de conteúdo

Uma linha está ERRADA quando:
❌ Corta no meio de um texto
❌ Corta no meio de uma imagem, foto de produto, logo, ou ícone
❌ Corta no meio de um grid de produtos (entre a linha de cima e a de baixo de um grid 2x2)
❌ Separa um botão CTA da seção acima dele
❌ Corta um bloco visualmente coeso ao meio

## PROCEDIMENTO

1. Olhe CADA linha vermelha individualmente
2. Verifique se ela está em um espaço vazio apropriado
3. Se estiver errada, determine onde o espaço vazio CORRETO fica (geralmente a poucos pixels acima ou abaixo)
4. Retorne a lista de correções com as novas coordenadas Y

Se TODAS as linhas estão corretas, retorne \`all_correct: true\` com \`corrections: []\`.

Se alguma está errada, retorne \`all_correct: false\` e liste APENAS as que precisam mudar com sua nova coordenada Y.

Seja crítico mas não mova linhas que já estão OK. Toda coordenada deve estar entre 0 e ${claudeHeight}.`

        const reviewStart = Date.now()
        const reviewResponse = await anthropic.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 4096,
          tools: [verifyTool],
          tool_choice: { type: "tool", name: "verify_cut_lines" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: reviewMediaType,
                    data: reviewBuffer.toString("base64"),
                  },
                },
                {
                  type: "text",
                  text: reviewPrompt,
                },
              ],
            },
          ],
        })
        const reviewMs = Date.now() - reviewStart

        const reviewToolBlock = reviewResponse.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        )

        if (reviewToolBlock && reviewToolBlock.name === "verify_cut_lines") {
          const reviewInput = reviewToolBlock.input as {
            all_correct: boolean
            corrections: Array<{
              cut_index: number
              corrected_y: number
              reason: string
            }>
          }

          log.info("Opus review completed", {
            reviewMs,
            allCorrect: reviewInput.all_correct,
            correctionsCount: reviewInput.corrections?.length ?? 0,
            corrections: reviewInput.corrections,
          })

          // Aplicar correções
          if (
            !reviewInput.all_correct &&
            Array.isArray(reviewInput.corrections)
          ) {
            for (const correction of reviewInput.corrections) {
              // cut_index é 1-based (CUT 1, CUT 2, ...) — converte para 0-based
              const i = correction.cut_index - 1
              if (i < 0 || i >= analysis.sections.length - 1) continue

              let newY = Math.round(correction.corrected_y)
              // Clampar ao intervalo válido
              newY = Math.max(0, Math.min(claudeHeight, newY))
              // Garantir que não crie seções inválidas
              const minY = analysis.sections[i].y_start + 40
              const maxY = analysis.sections[i + 1].y_end - 40
              if (minY >= maxY) continue
              newY = Math.max(minY, Math.min(maxY, newY))

              analysis.sections[i].y_end = newY
              analysis.sections[i + 1].y_start = newY
            }
          }
        } else {
          log.warn("Opus review did not return verify_cut_lines tool", {
            stopReason: reviewResponse.stop_reason,
          })
        }
      } catch (reviewError) {
        // Review é best-effort — se falhar, usa os cortes iniciais
        log.warn("Opus review failed, using Sonnet's original cuts", {
          error:
            reviewError instanceof Error
              ? reviewError.message
              : String(reviewError),
        })
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
