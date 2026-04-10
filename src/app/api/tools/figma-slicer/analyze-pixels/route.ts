import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.AnalyzeHybrid")

export const runtime = "nodejs"
export const maxDuration = 120 // Opus é mais lento (~15-30s) que Sonnet (~5s)

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
// Max 40px — mais que isso e o refine começa a pegar transições falsas
// (bordas de botão, linhas entre cards de produtos, etc).
const REFINE_RADIUS = 40 // ±N pixels ao redor da sugestão do Claude
const GAP_VARIANCE_MAX = 400 // linha uniforme

// ============================================================================
// PROMPT do Claude Vision
// ============================================================================

function buildClaudePrompt(height: number): string {
  return `Você é um especialista em email marketing que monta emails no Omnisend e Klaviyo. Analise esta imagem de email marketing e identifique as SEÇÕES VISUAIS DISTINTAS que devem virar fatias separadas.

Você está recebendo um PDF (para qualidade visual) e uma imagem PNG de 600 pixels de largura por ${height} pixels de altura. Use o PDF para entender o conteúdo visual com clareza. As coordenadas Y que você retornar devem ser em PIXELS da imagem PNG de 600×${height}px.

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

## COMO RACIOCINAR SOBRE OS BOUNDARIES (FUNDAMENTAL)

Para cada fronteira entre seções, siga este raciocínio exato:

1. **Inspeção visual primeiro**: Antes de definir coordenadas, entenda O QUE cada bloco é semanticamente (hero? body? grid de produtos? CTA? footer?). A classificação semântica vem antes da análise de pixels.

2. **Olhe pelo fundo**: Mudanças de cor de fundo (escuro→branco→preto) são pistas fortes de fronteiras entre seções. Um bloco de fundo escuro que vira branco é quase sempre um boundary real.

3. **Olhe pelo conteúdo funcional**: "O que esse bloco está tentando comunicar?" Se a resposta é a mesma, é a mesma seção.

4. **Anti-aliasing vai pra seção SEGUINTE**: Se há 2-3 pixels de transição gradual entre duas cores (borda de bloco escuro "sangrando" no fundo branco), o boundary vai ANTES desses pixels de transição. Assim o final da seção anterior fica LIMPO (cor pura) e a próxima seção absorve os pixels de transição.

5. **Breathing room**: Não corte rente a botões ou elementos visuais. Deixe 3-5 pixels de margem (fundo uniforme) depois de um botão antes de começar o boundary. Se o boundary cai exatamente em cima de um botão, recue até encontrar fundo limpo.

6. **Títulos são seções separadas de grids**: Se um título diz "NOSSOS PRODUTOS" ou "ESCOLHA SEU FAVORITO" seguido de um grid de cards, o título é uma seção SEPARADA do grid (ou faz parte da seção anterior ao grid).

7. **NÃO se prenda a 5 seções ou qualquer número fixo.** Cada email pede um número diferente.

8. **SEMPRE reserve a última seção APENAS para o footer.**

9. **SEMPRE isole product grids em seções próprias.**

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
 * REFINAMENTO 3-PASS + ANTI-ALIASING
 *
 * Replica a metodologia exata do Claude Opus quando faz cortes perfeitos:
 *
 * PASS 1 (grosso, cada 10 linhas): mapeia as zonas de cor na janela ±60px
 * ao redor da sugestão. Encontra a região aproximada de transição.
 *
 * PASS 2 (fino, cada 3 linhas): escaneia ±15px ao redor do hit do Pass 1.
 * Estreita a zona pra ~10px.
 *
 * PASS 3 (pixel-perfect, cada 1 linha): encontra o pixel EXATO da transição.
 *
 * ANTI-ALIASING RULE: Quando há 2-3 pixels de transição gradual entre duas
 * cores (anti-aliasing de bordas de blocos), o boundary vai no ÚLTIMO pixel
 * limpo da seção que TERMINA — assim a seção seguinte absorve os pixels de
 * transição e o final da seção anterior fica "clean".
 *
 * BREATHING ROOM: Se o boundary cai exatamente em cima de um botão ou
 * elemento visual (detectado por alta variância), recua 3-5px pra dar
 * respiro visual.
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
    Math.min(height - 2, suggestedY + REFINE_RADIUS)
  )

  if (searchMin >= searchMax) return suggestedY

  // Helper: diferença de cor RGB entre duas linhas adjacentes
  function colorDiff(y: number): number {
    if (y < 0 || y + 1 >= height) return 0
    const curr = rows[y]
    const next = rows[y + 1]
    return (
      Math.abs(curr.avgR - next.avgR) +
      Math.abs(curr.avgG - next.avgG) +
      Math.abs(curr.avgB - next.avgB)
    )
  }

  // ---- PASS 1: Gross scan (every 10 rows) ----
  // Encontra a região aproximada com maior transição de cor.
  let pass1BestY = suggestedY
  let pass1BestScore = 0

  for (let y = searchMin; y < searchMax; y += 10) {
    const score = colorDiff(y)
    if (score > pass1BestScore) {
      pass1BestScore = score
      pass1BestY = y
    }
  }

  // Se nenhuma transição forte foi encontrada no scan grosso,
  // tenta encontrar um whitespace gap (faixa de linhas uniformes)
  if (pass1BestScore < 20) {
    // Procura o gap mais próximo da sugestão
    let gapStart = -1
    let bestGapCenter = suggestedY
    let bestGapDist = Infinity

    for (let y = searchMin; y <= searchMax; y++) {
      const isUniform = rows[y].variance < GAP_VARIANCE_MAX
      if (isUniform) {
        if (gapStart === -1) gapStart = y
      } else {
        if (gapStart !== -1 && y - gapStart >= 5) {
          const center = Math.round((gapStart + y - 1) / 2)
          const dist = Math.abs(center - suggestedY)
          if (dist < bestGapDist) {
            bestGapDist = dist
            bestGapCenter = center
          }
        }
        gapStart = -1
      }
    }
    // Gap no final
    if (gapStart !== -1 && searchMax - gapStart >= 5) {
      const center = Math.round((gapStart + searchMax) / 2)
      const dist = Math.abs(center - suggestedY)
      if (dist < bestGapDist) {
        bestGapCenter = center
      }
    }

    if (bestGapDist < REFINE_RADIUS) {
      return bestGapCenter
    }
    return suggestedY
  }

  // ---- PASS 2: Fine scan (every 3 rows) ±15px around Pass 1 hit ----
  const pass2Min = Math.max(searchMin, pass1BestY - 15)
  const pass2Max = Math.min(searchMax, pass1BestY + 15)

  let pass2BestY = pass1BestY
  let pass2BestScore = pass1BestScore

  for (let y = pass2Min; y < pass2Max; y += 3) {
    const score = colorDiff(y)
    if (score > pass2BestScore) {
      pass2BestScore = score
      pass2BestY = y
    }
  }

  // ---- PASS 3: Pixel-perfect scan (every 1 row) ±5px around Pass 2 hit ----
  const pass3Min = Math.max(searchMin, pass2BestY - 5)
  const pass3Max = Math.min(searchMax, pass2BestY + 5)

  let finalY = pass2BestY
  let finalScore = pass2BestScore

  for (let y = pass3Min; y < pass3Max; y++) {
    const score = colorDiff(y)
    if (score > finalScore) {
      finalScore = score
      finalY = y
    }
  }

  // ---- ANTI-ALIASING RULE ----
  // Se há transição gradual (2-3 pixels com mudança intermediária),
  // mover o boundary pra ANTES dos pixels de transição — assim o
  // final da seção anterior fica "limpo" e a seção seguinte absorve
  // o anti-aliasing.
  //
  // Checo: se a linha ANTES do boundary também tem uma mudança
  // moderada (score 10-50% do peak), é anti-aliasing. Recuo.
  if (finalY > searchMin + 2) {
    const prevDiff = colorDiff(finalY - 1)
    const prevPrevDiff = colorDiff(finalY - 2)

    // Se a diferença no pixel anterior é significativa (>25% do peak)
    // mas menor que o peak, isso indica anti-aliasing gradual.
    if (prevDiff > finalScore * 0.2 && prevDiff < finalScore * 0.8) {
      finalY -= 1 // recua 1px
      // Se o anterior também é anti-aliasing, recua mais 1px
      if (prevPrevDiff > finalScore * 0.1 && prevPrevDiff < prevDiff) {
        finalY -= 1
      }
    }
  }

  // ---- BREATHING ROOM ----
  // Se o boundary cai numa linha de alta variância (dentro de conteúdo
  // visual, não numa zona limpa), recua até encontrar uma linha uniforme.
  if (rows[finalY] && rows[finalY].variance > GAP_VARIANCE_MAX) {
    for (let retreat = 1; retreat <= 5; retreat++) {
      const candidateY = finalY - retreat
      if (
        candidateY >= searchMin &&
        rows[candidateY] &&
        rows[candidateY].variance < GAP_VARIANCE_MAX
      ) {
        finalY = candidateY
        break
      }
    }
  }

  return Math.max(searchMin, Math.min(searchMax, finalY))
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
    const pdfBase64 = formData.get("pdfBase64") as string | null
    const imageFile = formData.get("image") as File | null

    // PDF pro Claude (qualidade vetorial, sem compressão)
    let pdfBuffer: Buffer | null = null
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, "base64")
    }

    // PNG/JPEG pro pixel refinement e dimensões
    let imageBuffer: Buffer | null = null
    if (imageFile) {
      if (imageFile.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: "Arquivo muito grande (máximo 20MB)." },
          { status: 400 }
        )
      }
      imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    }

    if (!pdfBuffer && !imageBuffer) {
      return NextResponse.json(
        {
          success: false,
          error: "Envie 'pdfBase64' e/ou 'image'.",
        },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // ========================================================================
    // PASSO 1: Normalizar a IMAGEM pra 600px (pra pixel refinement + coords)
    // Se só tem PDF e não tem imagem, erro (frontend deveria mandar ambos).
    // ========================================================================
    let pngBuffer: Buffer
    let width: number
    let height: number

    if (imageBuffer) {
      const meta = await sharp(imageBuffer).metadata()
      width = meta.width ?? 0
      height = meta.height ?? 0

      if (!width || !height) {
        return NextResponse.json(
          { success: false, error: "Não foi possível ler dimensões da imagem." },
          { status: 422 }
        )
      }

      // Normaliza pra 600px de largura
      if (width !== TARGET_WIDTH) {
        height = Math.round((height / width) * TARGET_WIDTH)
        width = TARGET_WIDTH
        pngBuffer = await sharp(imageBuffer)
          .resize({ width: TARGET_WIDTH, fit: "inside", withoutEnlargement: false })
          .png()
          .toBuffer()
        const newMeta = await sharp(pngBuffer).metadata()
        height = newMeta.height ?? height
      } else {
        pngBuffer = imageBuffer
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Imagem PNG/JPEG necessária além do PDF." },
        { status: 400 }
      )
    }

    // ========================================================================
    // PASSO 2: Enviar pro Claude Opus
    //
    // Se tem PDF: envia como DOCUMENT block (qualidade vetorial total —
    // EXATAMENTE como o Claude web faz quando funciona perfeitamente).
    // Se não tem PDF: envia a imagem como fallback.
    // ========================================================================
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Manda PDF + PNG juntos pro Claude.
    // PDF = qualidade vetorial pra entender conteúdo (igual ao Claude web).
    // PNG de 600px = referência de escala pra coordenadas Y.
    const contentBlocks: Anthropic.ContentBlockParam[] = []

    if (pdfBuffer) {
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdfBuffer.toString("base64"),
        },
      })
    }

    // Sempre manda o PNG de 600px pra referência de escala
    let claudePngBase64 = pngBuffer.toString("base64")
    let claudePngType: "image/png" | "image/jpeg" = "image/png"
    if (pngBuffer.length > CLAUDE_MAX_BYTES) {
      for (const q of [90, 80, 70]) {
        const jpg = await sharp(pngBuffer).jpeg({ quality: q, mozjpeg: true }).toBuffer()
        if (jpg.length <= CLAUDE_MAX_BYTES) {
          claudePngBase64 = jpg.toString("base64")
          claudePngType = "image/jpeg"
          break
        }
      }
    }

    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: claudePngType,
        data: claudePngBase64,
      },
    })

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
            maxItems: 12,
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
                  description: "Coordenada Y inicial em pixels da imagem de 600px de largura",
                },
                y_end: {
                  type: "integer",
                  description: "Coordenada Y final em pixels da imagem de 600px de largura",
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
      model: "claude-opus-4-6",
      max_tokens: 8192,
      tools: [reportTool],
      tool_choice: { type: "tool", name: "report_sections" },
      messages: [
        {
          role: "user",
          content: [
            ...contentBlocks,
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
    // PASSO 5: DESATIVADO — confia 100% nas coordenadas do Claude Opus
    //
    // O pixel refinement estava PIORANDO os cortes do Claude. O Opus
    // com PDF funciona perfeitamente no Claude web sem nenhum refinamento.
    // Cada vez que o refine tentava "melhorar", ele achava transições
    // falsas (bordas de botão, linhas entre cards de produto) e movia
    // os cortes pra posições erradas.
    //
    // As coordenadas do Claude Opus são usadas EXATAMENTE como retornadas.
    // ========================================================================
    for (let i = 0; i < analysis.sections.length - 1; i++) {
      log.info(`  Cut ${i + 1}: Claude=${analysis.sections[i].y_end} (used as-is)`)
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
