import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.AnalyzeHybrid")

export const runtime = "nodejs"
export const maxDuration = 60

// ============================================================================
// CONSTANTES
// ============================================================================

const TARGET_WIDTH = 600 // largura de análise = largura de output
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

// Claude Vision tem limite de ~5 MB em base64 (~3.7 MB em binário).
const CLAUDE_MAX_BYTES = 3.7 * 1024 * 1024

// Mínimo entre cortes (evita fatias muito pequenas)
const MIN_SECTION_HEIGHT = 150

// Refinamento por pixel: ao redor da sugestão do Claude, procura o gap
// de whitespace mais próximo pra alinhar o corte exatamente numa zona vazia.
const REFINE_RADIUS = 60 // ±N pixels ao redor da sugestão do Claude
const GAP_VARIANCE_MAX = 400 // linha uniforme

// ============================================================================
// PROMPT do Claude Vision
// ============================================================================

function buildClaudePrompt(height: number): string {
  return `Você é um especialista em email marketing que monta emails no Omnisend e Klaviyo. Analise esta imagem de email marketing e identifique as SEÇÕES VISUAIS DISTINTAS que devem virar fatias separadas.

A imagem tem 600 pixels de largura e ${height} pixels de altura.

## COMO PENSAR

Cada email tem SUA estrutura própria. Pode ter 3, 4, 5, 6, 7 ou 8 seções — depende do design. Você precisa olhar a imagem e IDENTIFICAR os blocos visuais funcionais distintos, sem forçar uma quantidade específica.

Cada fatia que você definir será uma imagem PNG separada. O operador vai empilhar as fatias no Omnisend/Klaviyo. Pra isso funcionar, você precisa identificar os BLOCOS FUNCIONAIS COMPLETOS do email, NÃO micro-transições de cor.

## 🚨 REGRAS INVIOLÁVEIS — NUNCA QUEBRAR

Estas são as 2 regras mais importantes. Elas SEMPRE se aplicam, em TODO email, sem exceção.

### REGRA 1 — FOOTER SEMPRE SOZINHO (no final do email)

O **footer** é SEMPRE a ÚLTIMA seção do email E SEMPRE fica sozinho numa seção isolada.

**Como identificar o footer:**
- Fica no final do email
- Contém: logo da marca + links de navegação (ex: "Startseite", "Contato", "Políticas") + copyright + email/telefone de contato
- Geralmente tem fundo escuro (preto, dark gray) ou branco com separadores entre os links
- Contém elementos de "rodapé corporativo" e não de venda

**Proibido fazer:**
- ❌ NUNCA colocar o footer junto com o CTA final
- ❌ NUNCA colocar o footer junto com trust badges
- ❌ NUNCA colocar um título/promoção acima do footer dentro da MESMA seção
- ❌ NUNCA deixar o footer no meio do email (footer é sempre o último)

**Passo a passo:**
1. Encontre o ponto EXATO onde o conteúdo promocional termina e começam os links corporativos/copyright
2. Essa é a fronteira do footer
3. A última seção começa nesse ponto e vai até o final da imagem
4. Essa é SEMPRE a seção do footer

### REGRA 2 — PRODUCT GRID SEMPRE SOZINHO (sem título junto)

Um **product grid** (grade de produtos) é SEMPRE uma seção sozinha, contendo APENAS os cards de produto.

**Como identificar um product grid:**
- Múltiplos cards arrumados em grid (2×1, 2×2, 3×3, etc)
- Cada card tem: imagem do produto + preço (às vezes) + botão "COMPRAR"/"BUY NOW"
- Fundo geralmente uniforme (branco ou escuro) entre os cards

**Proibido fazer:**
- ❌ NUNCA incluir um título "NOSSOS PRODUTOS" ou "PROFITIEREN SIE" etc acima do grid na MESMA seção — o título é uma SEÇÃO SEPARADA do grid
- ❌ NUNCA incluir o CTA abaixo do grid (ex: "15% RABATT SICHERN") na MESMA seção — o CTA é uma SEÇÃO SEPARADA
- ❌ NUNCA cortar o grid no meio (se tem 2×2 produtos, os 4 ficam juntos)
- ❌ NUNCA juntar grid com trust badges ou outros blocos

**Estrutura típica ao redor de um product grid:**
  Seção A (título opcional): "Confira nossos produtos", "Profitieren Sie", etc
  Seção B (O PRODUCT GRID): APENAS os cards de produto
  Seção C (CTA/outro bloco opcional): "15% RABATT SICHERN", etc

## REGRAS SECUNDÁRIAS

3. **NUNCA corte no meio de um bloco de texto/cupom.**
   Título + subtítulo + texto + cupom + botão formam UMA seção única quando são parte do mesmo "apelo". Ex: "ÚLTIMA OPORTUNIDADE" + "17% OFF" + "CUPOM ESPECIAL" + botão "RECUPERAR O CÓDIGO" = 1 seção.

4. **NUNCA separe um botão CTA do texto/bloco que ele pertence.**
   O botão faz parte da seção acima dele, nunca é uma seção sozinha.

5. **NUNCA quebre reviews individuais em fatias separadas.**
   Se há 3 depoimentos empilhados, todos formam UMA única seção.

6. **NUNCA corte o hero antes do headline/CTA terminar.**
   Hero = logo + imagem principal + headline + CTA principal. Tudo junto.

7. **NUNCA crie seções menores que 150 pixels.**
   Se uma seção ficaria menor que isso, ela deve ser mergida com a vizinha.

## DICAS PRÁTICAS

- Olhe pelo fundo: mudanças de cor de fundo (ex: escuro→branco→preto) são pistas fortes de fronteiras entre seções.
- Olhe pelo conteúdo funcional: "o que esse bloco está tentando comunicar?" Se a resposta é a mesma, é a mesma seção.
- Olhe pelo espaçamento: onde há faixas de fundo vazio entre blocos, geralmente é onde cortar.
- NÃO se prenda a 5 seções ou qualquer número fixo. Cada email pede um número diferente.
- SEMPRE reserve a última seção APENAS para o footer.
- SEMPRE isole product grids em seções próprias.

## VALIDAÇÃO

Antes de retornar, VERIFIQUE:
- [ ] A última seção contém APENAS o footer (logo + links + copyright)?
- [ ] Cada product grid está SOZINHO numa seção?
- [ ] Títulos acima de grids estão em seções separadas?
- [ ] CTAs abaixo de grids estão em seções separadas?
- [ ] sections[0].y_start === 0?
- [ ] sections[last].y_end === ${height}?
- [ ] Cada y_end é igual ao y_start da próxima?
- [ ] Cada seção tem altura >= 150 pixels?

Chame a tool \`report_sections\` com a análise.`
}

// ============================================================================
// PIXEL REFINE: encontra o ponto exato de corte próximo da sugestão do Claude
// ============================================================================

interface RowStats {
  avgR: number
  avgG: number
  avgB: number
  variance: number
}

/**
 * Calcula estatísticas (média RGB + variância horizontal) pra cada linha.
 */
function computeRowStats(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number
): RowStats[] {
  const rows: RowStats[] = new Array(height)
  const xStep = 2

  for (let y = 0; y < height; y++) {
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let samples = 0

    for (let x = 0; x < width; x += xStep) {
      const idx = (y * width + x) * channels
      sumR += pixels[idx]
      sumG += pixels[idx + 1]
      sumB += pixels[idx + 2]
      samples++
    }

    const avgR = sumR / samples
    const avgG = sumG / samples
    const avgB = sumB / samples

    let variance = 0
    for (let x = 0; x < width; x += xStep) {
      const idx = (y * width + x) * channels
      variance += Math.pow(pixels[idx] - avgR, 2)
      variance += Math.pow(pixels[idx + 1] - avgG, 2)
      variance += Math.pow(pixels[idx + 2] - avgB, 2)
    }
    variance = variance / (samples * 3)

    rows[y] = { avgR, avgG, avgB, variance }
  }

  return rows
}

/**
 * Dado uma sugestão de corte do Claude e as estatísticas das linhas,
 * encontra o ponto EXATO mais próximo onde há uma fronteira visual real.
 *
 * Estratégias, em ordem de prioridade:
 * 1. Procura a ZONA de whitespace (linhas uniformes consecutivas) mais próxima
 *    da sugestão, e retorna o CENTRO dessa zona.
 * 2. Se não encontrar whitespace, procura a maior transição de cor Y→Y+1
 *    dentro do raio.
 * 3. Se nada melhor for encontrado, mantém a sugestão original.
 */
function refineCut(
  rows: RowStats[],
  suggestedY: number,
  minY: number,
  maxY: number
): number {
  const height = rows.length
  const searchMin = Math.max(minY, Math.max(0, suggestedY - REFINE_RADIUS))
  const searchMax = Math.min(
    maxY,
    Math.min(height - 1, suggestedY + REFINE_RADIUS)
  )

  if (searchMin >= searchMax) return suggestedY

  // Estratégia 1: procurar zonas de whitespace próximas
  interface GapRange {
    start: number
    end: number
  }
  const gaps: GapRange[] = []
  let currentGapStart = -1

  for (let y = searchMin; y <= searchMax; y++) {
    const isUniform = rows[y].variance < GAP_VARIANCE_MAX
    if (isUniform) {
      if (currentGapStart === -1) currentGapStart = y
    } else {
      if (currentGapStart !== -1) {
        gaps.push({ start: currentGapStart, end: y - 1 })
        currentGapStart = -1
      }
    }
  }
  if (currentGapStart !== -1) {
    gaps.push({ start: currentGapStart, end: searchMax })
  }

  // Pega o gap mais próximo da sugestão (com tamanho >= 5px)
  const validGaps = gaps.filter((g) => g.end - g.start >= 5)
  if (validGaps.length > 0) {
    let closestGap: GapRange = validGaps[0]
    let closestDist = Math.abs(
      (closestGap.start + closestGap.end) / 2 - suggestedY
    )
    for (const g of validGaps) {
      const centerY = (g.start + g.end) / 2
      const dist = Math.abs(centerY - suggestedY)
      if (dist < closestDist) {
        closestGap = g
        closestDist = dist
      }
    }
    return Math.round((closestGap.start + closestGap.end) / 2)
  }

  // Estratégia 2: maior transição de cor no raio
  let bestY = suggestedY
  let bestScore = 0
  for (let y = searchMin; y < searchMax; y++) {
    const curr = rows[y]
    const next = rows[y + 1]
    const dist =
      Math.abs(curr.avgR - next.avgR) +
      Math.abs(curr.avgG - next.avgG) +
      Math.abs(curr.avgB - next.avgB)
    if (dist > bestScore) {
      bestScore = dist
      bestY = y
    }
  }

  return bestScore > 30 ? bestY : suggestedY
}

// ============================================================================
// TIPO da resposta do Claude
// ============================================================================

interface ClaudeSection {
  name: string
  y_start: number
  y_end: number
  description?: string
}

interface ClaudeAnalysis {
  sections: ClaudeSection[]
}

// ============================================================================
// HANDLER
// ============================================================================

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
          error: "ANTHROPIC_API_KEY não configurada no servidor.",
        },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const imageBase64 = formData.get("imageBase64") as string | null
    const file = formData.get("image") as File | null

    let buffer: Buffer
    if (imageBase64) {
      buffer = Buffer.from(imageBase64, "base64")
    } else if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: "Arquivo muito grande (máximo 20MB)." },
          { status: 400 }
        )
      }
      buffer = Buffer.from(await file.arrayBuffer())
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Envie a imagem no campo 'image' ou 'imageBase64'.",
        },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // ========================================================================
    // PASSO 1: normalizar para 600px de largura
    // ========================================================================
    const meta = await sharp(buffer).metadata()
    let width = meta.width ?? 0
    let height = meta.height ?? 0

    if (!width || !height) {
      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível ler as dimensões da imagem.",
        },
        { status: 422 }
      )
    }

    if (width !== TARGET_WIDTH) {
      height = Math.round((height / width) * TARGET_WIDTH)
      width = TARGET_WIDTH
      buffer = await sharp(buffer)
        .resize({
          width: TARGET_WIDTH,
          fit: "inside",
          withoutEnlargement: false,
        })
        .png()
        .toBuffer()
      // Re-ler dimensões reais após resize
      const newMeta = await sharp(buffer).metadata()
      height = newMeta.height ?? height
    }

    // ========================================================================
    // PASSO 2: preparar buffer pra enviar ao Claude (cabe em 5MB base64?)
    // Se não couber, reencoda como JPEG até caber.
    // ========================================================================
    let claudeBuffer = buffer
    let claudeMediaType: "image/png" | "image/jpeg" = "image/png"

    if (claudeBuffer.length > CLAUDE_MAX_BYTES) {
      for (const quality of [92, 85, 75, 65]) {
        const jpeg = await sharp(buffer)
          .jpeg({ quality, mozjpeg: true })
          .toBuffer()
        if (jpeg.length <= CLAUDE_MAX_BYTES) {
          claudeBuffer = jpeg
          claudeMediaType = "image/jpeg"
          break
        }
      }
    }

    // ========================================================================
    // PASSO 3: Claude Vision identifica as seções semanticamente
    // ========================================================================
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const reportTool: Anthropic.Tool = {
      name: "report_sections",
      description:
        "Reporta as seções visuais distintas do email marketing, em ordem vertical.",
      input_schema: {
        type: "object",
        properties: {
          sections: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Nome descritivo da seção em snake_case (hero, body_copy, product_section, trust_badges, cta_final, footer, etc)",
                },
                y_start: {
                  type: "integer",
                  description: "Coordenada Y inicial em pixels",
                },
                y_end: {
                  type: "integer",
                  description: "Coordenada Y final em pixels",
                },
                description: {
                  type: "string",
                  description: "Descrição curta do que há nesta seção",
                },
              },
              required: ["name", "y_start", "y_end"],
            },
          },
        },
        required: ["sections"],
      },
    }

    const claudeStart = Date.now()
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: [reportTool],
      tool_choice: { type: "tool", name: "report_sections" },
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
            { type: "text", text: buildClaudePrompt(height) },
          ],
        },
      ],
    })
    const claudeMs = Date.now() - claudeStart

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )
    if (!toolBlock || toolBlock.name !== "report_sections") {
      log.error("Claude did not return report_sections tool", {
        stopReason: response.stop_reason,
        contentTypes: response.content.map((b) => b.type),
      })
      return NextResponse.json(
        {
          success: false,
          error:
            "A IA não retornou o formato esperado. Tente novamente.",
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
        { success: false, error: "Nenhuma seção detectada pela IA." },
        { status: 422 }
      )
    }

    // ========================================================================
    // PASSO 4: normalização estrutural das seções do Claude
    // ========================================================================
    for (const s of analysis.sections) {
      s.y_start = Math.round(s.y_start)
      s.y_end = Math.round(s.y_end)
      if (s.y_start < 0) s.y_start = 0
      if (s.y_end > height) s.y_end = height
    }
    analysis.sections[0].y_start = 0
    analysis.sections[analysis.sections.length - 1].y_end = height
    for (let i = 1; i < analysis.sections.length; i++) {
      if (analysis.sections[i].y_start !== analysis.sections[i - 1].y_end) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    // ========================================================================
    // PASSO 5: refinamento por pixel — alinha cada corte ao gap mais próximo
    // ========================================================================
    const { data: rawPixels, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rows = computeRowStats(rawPixels, info.width, info.height, info.channels)

    for (let i = 0; i < analysis.sections.length - 1; i++) {
      const suggested = analysis.sections[i].y_end
      // Não pode mover pra antes da seção atual nem pra depois da próxima
      const minY = analysis.sections[i].y_start + MIN_SECTION_HEIGHT
      const maxY =
        analysis.sections[i + 1].y_end - MIN_SECTION_HEIGHT
      if (minY >= maxY) continue

      const refined = refineCut(rows, suggested, minY, maxY)
      analysis.sections[i].y_end = refined
      analysis.sections[i + 1].y_start = refined
    }

    // ========================================================================
    // PASSO 6: auto-merge de seções pequenas como safety net
    // ========================================================================
    let mergedSections = analysis.sections.map((s) => ({
      name: s.name,
      y_start: s.y_start,
      y_end: s.y_end,
    }))

    let mergedSomething = true
    while (mergedSomething && mergedSections.length > 1) {
      mergedSomething = false
      for (let i = 0; i < mergedSections.length; i++) {
        const h = mergedSections[i].y_end - mergedSections[i].y_start
        if (h >= MIN_SECTION_HEIGHT) continue

        if (i === 0) {
          mergedSections[1].y_start = mergedSections[0].y_start
          mergedSections.splice(0, 1)
        } else {
          mergedSections[i - 1].y_end = mergedSections[i].y_end
          mergedSections.splice(i, 1)
        }
        mergedSomething = true
        break
      }
    }

    // Renumerar como parte_1, parte_2, ...
    mergedSections = mergedSections.map((s, i) => ({
      ...s,
      name: `parte_${i + 1}`,
    }))

    const durationMs = Date.now() - startTime

    log.info("Hybrid analysis completed", {
      imageSize: `${width}x${height}`,
      claudeMs,
      totalMs: durationMs,
      claudeSectionsCount: analysis.sections.length,
      finalSectionsCount: mergedSections.length,
      sections: mergedSections.map((s) => ({
        name: s.name,
        y_start: s.y_start,
        y_end: s.y_end,
        height: s.y_end - s.y_start,
      })),
    })

    return NextResponse.json({
      success: true,
      analysis: {
        width,
        height,
        sections: mergedSections,
        cuts_found: Math.max(0, mergedSections.length - 1),
      },
      duration_ms: durationMs,
    })
  } catch (error: unknown) {
    log.error("Hybrid analysis failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro na análise"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
