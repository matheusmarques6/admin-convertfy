/**
 * Image Chain — gera imagens para blocos de email via OpenRouter.
 *
 * OpenRouter expõe modelos de imagem via chat completions, não via
 * /images/generations. Usamos fetch direto no endpoint de chat.
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  getAspectDimensions,
  type AspectKey,
} from "../image/aspect-ratio"
import {
  OpenRouterEmptyBodyError,
  OpenRouterMidStreamError,
  withOpenRouterRetry,
} from "@/lib/agents/openrouter-invoke"

const log = logger.child("ImageChain")

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `ABSOLUTE RULE — NO TEXT, NO LETTERING, NO LOGO, NO WORDMARK, NO BUTTON, NO BADGE, NO PRICE TAG, NO WATERMARK anywhere in the image. Not a headline, not a product name, not a brand name, not a call to action, not a single legible character. Every word of this brief is DIRECTION for the composition, never something to draw. All copy, the logo and the buttons are placed in HTML on top of your image — text baked into the image renders twice and cannot be edited or translated. If the composition seems to call for a headline, leave that area CLEAN and let the layout breathe there instead.

PHOTOGRAPHIC DIRECTION — THIS IS YOUR PRIMARY BRIEF. It was written for this exact component by the person who designed it, and it governs HOW the photograph is made: light, framing, distance, lens feel, presence and pose of a model, setting, depth, colour treatment, which area stays clean for copy. Shoot to satisfy it. Everything below — niche, positioning, palette, products — is SUPPORTING CONTEXT that fills in what the direction leaves open, never a reason to contradict it. Empty means no direction was written: then compose from the context alone.
{PHOTO_DIRECTION}

BACKDROP COLOUR — NOT NEGOTIABLE. The section this image sits in is painted {BG_COLOR}. When the composition calls for a plain, continuous or studio backdrop, the photograph's background MUST be that exact hex, so photo and section read as ONE CONTINUOUS SURFACE with no visible seam. That continuity is the point of the layout, not a detail.
If the direction asks for a different backdrop, it still has to be one of the STORE's OWN colours — {primary_colors} {secondary_colors}. Never a neutral you chose yourself: no generic studio grey, no off-white, no colour from outside the brand palette.
The only thing that overrides this is a direction explicitly asking for a real setting (a room, a street, outdoors) — then shoot the setting.

FRAMING PEOPLE. When a person appears, the frame NEVER cuts the top of the head or crops the face out. Either the head is fully inside the frame, or the crop is a deliberate, recognisable one that starts BELOW the shoulders (a torso/detail shot). A head sliced by the top edge reads as a mistake and ruins the section.

EMAIL IDEA (the overall angle this image supports — compose to reinforce it; do NOT render this text): {EMAIL_IDEIA}

ART DIRECTION — per image slot (schema spec, the designer's slot comment, and the block copy this image accompanies — compose to fit, NEVER render any of this text):
{IMAGE_SLOTS}
{IMAGE_BRIEF}

Create a background banner image for an email marketing block ({block_purpose}).

Brand: {brand_name}
Niche: {nicho}
Positioning: {posicionamento}
Brand colors: {primary_colors}
Secondary colors: {secondary_colors}

Top products of the store: {top_products}

Email context: {block_purpose}

Requirements:
- Clean, modern e-commerce aesthetic aligned with the brand mood
- Show or evoke the niche/products (visual cues, lifestyle, product hints)
- ZERO text, letters, numbers, logos or buttons rendered in the image (see the absolute rule at the top) — leave clean areas where copy will sit
- Compose for the block's role in the email ({block_purpose}) — the exact aspect-ratio instruction is appended below
- Product/lifestyle photography style aligned with brand tone`

export function renderImagePrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "")
}

/**
 * Modelo de imagem padrão (OpenRouter). FONTE ÚNICA — telemetria e demais
 * consumidores importam daqui em vez de repetir a string (o id vivia
 * duplicado em 8 lugares e saía de sincronia a cada troca).
 *
 * Nano Banana 2 (jul/2026) substituiu o openai/gpt-5.4-image-2 em TODA a
 * geração de imagem. Os agentes `image` e `campaign_image` também têm o
 * modelo em email_agent_configs (migration 20260730) — a config do banco
 * vence; esta constante é o fallback e o rótulo default de telemetria.
 */
export const OPENROUTER_IMAGE_MODEL = "google/gemini-3.1-flash-image"

const OPENROUTER_IMAGE_TIMEOUT_MS = 90_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/**
 * Teto de tempo para LER o corpo — que o `fetchWithTimeout` não cobre.
 *
 * `fetch()` resolve quando chegam os HEADERS, e o `clearTimeout` do finally
 * desarma o abort exatamente aí: a leitura do corpo segue sem relógio
 * nenhum. Foi assim que uma chamada com "timeout de 90s" levou 235s — o
 * 200 OK chegou rápido e o `gpt-5.4-image-2` ficou pingando whitespace por
 * quase 4 minutos. Com o retry, as duas tentativas queimaram 455s do
 * orçamento da fase 2 e o email saiu sem a imagem da hero (Luxe Lift,
 * 10/08). É o MESMO defeito que o `whitespace_body` já detecta; a diferença
 * é que sem teto ele só era detectado depois de cobrar o tempo inteiro.
 *
 * Cortar o stream no timeout importa: sem o `cancel()` a leitura continua
 * em segundo plano segurando a conexão depois de a promise ter rejeitado.
 *
 * O TETO NÃO PODE SER O DO FETCH (90s). Numa geração de imagem o corpo é
 * onde o tempo passa: o provedor devolve os headers em segundos e o modelo
 * segue gerando com a conexão aberta. Runs BEM-SUCEDIDOS da Luxe Lift
 * levaram 116s, 122s, 126s, 127s, 133s, 138s e 239s — um teto de 90s
 * abortaria a maioria das gerações boas. 300s fica acima do máximo
 * observado com folga: é rede de segurança contra corpo que NÃO TERMINA,
 * não filtro de lentidão.
 */
const OPENROUTER_IMAGE_BODY_TIMEOUT_MS = 300_000

async function readTextWithTimeout(
  res: Response,
  ms: number,
  startedAt: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      res.text(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void res.body?.cancel().catch(() => {})
          reject(
            new OpenRouterMidStreamError({
              errorType: "body_read_timeout",
              status: res.status,
              ms: Date.now() - startedAt,
              snippet: `corpo não terminou em ${ms / 1000}s`,
              retryable: true,
            }),
          )
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Heuristica pra detectar erro "modelo nao suporta multimodal" no body
 * de uma resposta 4xx do OpenRouter. Conservadora: so dispara retry
 * em casos claros pra evitar loop com erros nao relacionados.
 */
function isMultimodalUnsupportedError(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes("image input not supported") ||
    lower.includes("image_url not supported") ||
    lower.includes("does not support image") ||
    lower.includes("multimodal not supported")
  )
}

/**
 * Heuristica pra "o provedor nao conseguiu BAIXAR a URL de referencia" (ex.:
 * OpenRouter 400 "Error while downloading file. Upstream status code: 400" com
 * param "url"/invalid_value). Diferente do multimodal-unsupported (o modelo
 * ACEITA imagem, mas a URL especifica falhou). Trata igual: rebaixa pra text2img
 * em vez de falhar duro — melhor imagem generica que erro.
 */
function isImageDownloadError(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes("error while downloading") ||
    lower.includes("failed to download") ||
    lower.includes("could not download") ||
    lower.includes("upstream status") ||
    (lower.includes('"param"') &&
      lower.includes('"url"') &&
      lower.includes("invalid"))
  )
}

/**
 * Heuristica pra detectar erro "modelo nao aceita role=system" no body
 * de uma resposta 4xx do OpenRouter. Quando dispara, a chain retry uma
 * vez concatenando system_prompt + "\n\n" + user prompt no mesmo user
 * message — sem perda de instrução, só perda da separação de roles.
 */
function isSystemRoleUnsupportedError(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes("system role not supported") ||
    lower.includes("system message not supported") ||
    lower.includes("unsupported role") ||
    lower.includes("role 'system'") ||
    lower.includes('role "system"')
  )
}

/**
 * Referencia visual por URL anexada ao content multimodal. `label` (opcional)
 * é um texto curto que precede a imagem pro modelo saber o PAPEL dela (ex.:
 * "Brand logo — match this exactly:"). Sem label, só a imagem é anexada.
 */
export type RefImage = { label?: string; url: string }

type UserMessage =
  | { role: "user"; content: string }
  | {
      role: "user"
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >
    }
type SystemMessage = { role: "system"; content: string }
type ChatMessage = UserMessage | SystemMessage

/**
 * Monta a user message. Com `refs` não-vazio: content array INTERLEAVED e
 * ROTULADO — para cada ref, empurra `{text:label}` (se houver label) seguido de
 * `{image_url:url}`, e por fim `{text:prompt}`. Com `refs` vazio: content é a
 * string crua do prompt (body legacy, idêntico ao caminho text2img).
 */
function buildUserMessage(prompt: string, refs: RefImage[]): UserMessage {
  if (refs.length > 0) {
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = []
    for (const ref of refs) {
      if (ref.label) content.push({ type: "text", text: ref.label })
      content.push({ type: "image_url", image_url: { url: ref.url } })
    }
    content.push({ type: "text", text: prompt })
    return { role: "user", content }
  }
  return { role: "user", content: prompt }
}

function buildMessages(
  prompt: string,
  refs: RefImage[],
  systemPrompt?: string,
): ChatMessage[] {
  const userMsg = buildUserMessage(prompt, refs)
  if (systemPrompt && systemPrompt.trim()) {
    return [{ role: "system", content: systemPrompt }, userMsg]
  }
  return [userMsg]
}

/**
 * Extrai `prompt_tokens`/`completion_tokens` e o `cost` (custo REAL em USD do
 * OpenRouter — usage accounting, sempre presente na resposta; `usage:{include:true}`
 * é deprecado) do bloco `"usage"` da resposta crua SEM `JSON.parse` (o body pode
 * ter ~5MB de base64). Ancora no primeiro índice de `"usage"` e regexa só num
 * recorte curto a partir dali — isola o envelope e evita colisão com dígitos de
 * um base64.
 */
function extractUsage(rawText: string): {
  tokensInput: number
  tokensOutput: number
  costUsd: number
} {
  const idx = rawText.indexOf('"usage"')
  if (idx === -1) return { tokensInput: 0, tokensOutput: 0, costUsd: 0 }
  const slice = rawText.slice(idx, idx + 600)
  const inMatch = slice.match(/"prompt_tokens"\s*:\s*(\d+)/)
  const outMatch = slice.match(/"completion_tokens"\s*:\s*(\d+)/)
  const costMatch = slice.match(/"cost"\s*:\s*([0-9.]+)/)
  return {
    tokensInput: inMatch ? Number(inMatch[1]) : 0,
    tokensOutput: outMatch ? Number(outMatch[1]) : 0,
    costUsd: costMatch ? Number(costMatch[1]) : 0,
  }
}

/**
 * Maior sequência contígua de whitespace no texto. Usado pra detectar o
 * "loop de whitespace" do gpt-5.4-image-2 (200 OK sem imagem, corpo com um
 * bloco enorme de espaço). Uma recusa em prosa nunca tem um run longo.
 */
function longestWhitespaceRun(s: string): number {
  let max = 0
  const re = /\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m[0].length > max) max = m[0].length
  }
  return max
}

/**
 * Recorte do texto começando no 1o caractere não-branco (até `len` chars).
 * Evita snippet de erro vazio quando o corpo tem whitespace no começo.
 */
function visibleSlice(s: string, len: number): string {
  const start = s.search(/\S/)
  return start === -1 ? "" : s.slice(start, start + len)
}

async function callOpenRouterImage(
  apiKey: string,
  prompt: string,
  refs: RefImage[],
  systemPrompt?: string,
  model: string = OPENROUTER_IMAGE_MODEL,
): Promise<Response> {
  try {
    return await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(prompt, refs, systemPrompt),
          response_format: "b64_json",
          // Saída de IMAGEM precisa ser declarada no OpenRouter para os
          // modelos GEMINI (sem isto o Nano Banana responde só texto e a
          // extração cai no fallback).
          //
          // O guard é por `gemini` e não por `image` no nome: o
          // openai/gpt-5.4-image-2 também casa "image", e ele rodou por
          // meses SEM este campo. Mandá-lo para um modelo que não o
          // espera é uma variável nova num caminho que já era testado —
          // e a falha apareceria só na hora de gerar.
          ...(/gemini/i.test(model) ? { modalities: ["image", "text"] } : {}),
        }),
      },
      OPENROUTER_IMAGE_TIMEOUT_MS,
    )
  } catch (err) {
    // AbortError do timeout vira mensagem previsivel pra phase2-runner
    // decidir marcar failure_reason='image_failed'.
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.message === "The operation was aborted.")
    ) {
      throw new Error(
        `image_timeout: OpenRouter excedeu ${OPENROUTER_IMAGE_TIMEOUT_MS / 1000}s`,
      )
    }
    throw err
  }
}

export async function generateEmailImage(
  prompt: string,
  storeId: string,
  options?: {
    aspect?: AspectKey
    /**
     * Dimensões EXATAS declaradas no campo de imagem do output_schema
     * (image_width × image_height). Quando presentes (ambas > 0), o resize
     * usa ESTAS dimensões com PRIORIDADE sobre o aspect tipado do layout —
     * o designer decidiu o formato do slot. Ausentes → cai no `aspect`.
     */
    customDims?: { width: number; height: number } | null
    /**
     * Informativo apenas — propagado em logs. A instrucao textual no
     * prompt e responsabilidade do caller (phase2-runner).
     */
    overlayReserveBottom?: boolean
    /**
     * AE-13: modo de geracao. Quando `product_ref` + `referenceImageUrl`,
     * envia content array multimodal ao OpenRouter. Em qualquer outro
     * caso usa body legacy (string content). Default: `text2img`.
     */
    mode?: "product_ref" | "text2img"
    /**
     * AE-13: URL da imagem real do produto pra usar como referencia
     * visual quando mode='product_ref'. Sem isso, mode degrada
     * automaticamente pra text2img (caller ja deveria ter resolvido via
     * `resolveImageMode`, mas a chain tambem se defende).
     *
     * Retrocompat: tratado como UMA ref sem rótulo. Quando `referenceImages`
     * é passado (length>0), ele SUPERSEDE este campo.
     */
    referenceImageUrl?: string
    /**
     * Múltiplas referências visuais por URL (base + logo + produto), cada uma
     * com um `label` opcional que diz ao modelo o papel da imagem. Quando
     * presente (length>0), supersede `referenceImageUrl`. Cap de 3 (excedente
     * é descartado com log.warn). Caminho de campanha usa isto; o de email
     * continua com o `referenceImageUrl` único.
     */
    referenceImages?: RefImage[]
    /**
     * Callback OPT-IN de instrumentação. Quando fornecido, a chain captura o
     * `usage` da resposta do OpenRouter (tokens de input de imagem) e reporta
     * quais refs foram efetivamente anexadas. Sem ele, ZERO trabalho extra
     * (caminho de email intocado, sem overhead).
     */
    onMeta?: (m: {
      tokensInput: number
      tokensOutput: number
      costCents: number
      refsSent: RefImage[]
    }) => void
    /**
     * Master Prompt v2: prompt de sistema do agente de imagem (Part A do
     * `email_agent_configs.system_prompt`). Enviado como `role:"system"` na
     * mensagem inicial. Se o modelo retornar 4xx com sinal de role não
     * suportado, retry UMA vez concatenando `system + "\n\n" + user` no mesmo
     * user message (sem perda de instrução).
     */
    systemPrompt?: string
    /**
     * Modelo de imagem a usar no OpenRouter. Default: `OPENROUTER_IMAGE_MODEL`
     * (constante). Config-driven: callers que carregam o agente do DB
     * (`email_agent_configs.model`) passam o valor pra cá — ex.: o pipeline de
     * imagens de campanha usa o model do agent_type `campaign_image`.
     */
    model?: string
  },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada")

  const mode = options?.mode ?? "text2img"
  // Normaliza as refs: `referenceImages` supersede `referenceImageUrl` (que vira
  // 1 ref sem rótulo, retrocompat). Cap em 3 (base+logo+produto); excedente é
  // descartado com aviso pra ops.
  let refs: RefImage[] = options?.referenceImages?.length
    ? options.referenceImages
    : options?.referenceImageUrl
      ? [{ url: options.referenceImageUrl }]
      : []
  if (refs.length > 3) {
    log.warn("image.refs.capped", { storeId, passed: refs.length, kept: 3 })
    refs = refs.slice(0, 3)
  }
  const useMultimodal = mode === "product_ref" && refs.length > 0
  const onMeta = options?.onMeta
  const systemPrompt = options?.systemPrompt?.trim() || undefined
  const model = options?.model?.trim() || OPENROUTER_IMAGE_MODEL

  log.info("image.generate.start", {
    storeId,
    promptLength: prompt.length,
    aspect: options?.aspect,
    overlayReserveBottom: options?.overlayReserveBottom,
    mode,
    useMultimodal,
    refCount: refs.length,
    hasSystemPrompt: !!systemPrompt,
    systemPromptLength: systemPrompt?.length ?? 0,
  })
  const t0 = Date.now()

  if (useMultimodal) {
    log.info("image.multimodal.attempted", {
      storeId,
      refUrl: refs[0]?.url,
      model,
    })
    log.info("image.refs.attached", {
      count: refs.length,
      labels: refs.map((r) => r.label ?? null),
      model,
    })
  }

  // Captura de usage só roda quando `onMeta` existe (opt-in). `lastUsage` é
  // preenchido dentro do fetch da última tentativa bem-sucedida e reportado
  // após o retry resolver.
  let lastUsage = { tokensInput: 0, tokensOutput: 0, costUsd: 0 }
  // Refs EFETIVAMENTE enviadas na tentativa bem-sucedida. Difere de `refs` quando
  // o fallback de multimodal-unsupported reenvia SEM imagens (text2img) — aí
  // `refs_sent` precisa refletir [] (senão a telemetria mentiria que o modelo viu
  // o logo/produto quando na verdade foram removidos). É a prova de ingestão.
  let lastRefsSent: RefImage[] = []

  // ── Uma tentativa completa: chama OpenRouter + extrai o buffer ──────────
  //
  // Encapsulada pra rodar sob `withOpenRouterRetry`: respostas vazias / SSE
  // com error-frame são falhas TRANSITÓRIAS do OpenRouter (provider disconnect/
  // timeout mid-stream, documentado) — viram erros nomeados retryable e ganham
  // 1 retry com backoff. Erros HTTP e "nenhuma imagem extraível" (refusal de
  // texto, formato inesperado) NÃO são retryable: propagam direto.
  const fetchImageBuffer = async (attempt: number): Promise<Buffer> => {
    const attemptT0 = Date.now()
    // Vira true se o fallback de multimodal-unsupported remover as imagens nesta
    // tentativa (o reenvio sai puro text2img, sem refs).
    let strippedThisAttempt = false
    let res = await callOpenRouterImage(
      apiKey,
      prompt,
      useMultimodal ? refs : [],
      systemPrompt,
      model,
    )

    // Master Prompt v2: se o modelo rejeitou role=system, retry UMA vez
    // concatenando system + user no mesmo user message. Decidido antes do
    // fallback de multimodal pra evitar mascarar drift de role como drift
    // de multimodal (logs ficam mais limpos pra ops).
    if (
      !res.ok &&
      systemPrompt &&
      res.status >= 400 &&
      res.status < 500
    ) {
      const errText = await res.text().catch(() => "")
      if (isSystemRoleUnsupportedError(errText)) {
        log.warn("image.system_prompt.fallback_concatenated", {
          storeId,
          attempt,
          status: res.status,
          errorSnippet: errText.slice(0, 200),
        })
        const concatenated = `${systemPrompt}\n\n${prompt}`
        res = await callOpenRouterImage(
          apiKey,
          concatenated,
          useMultimodal ? refs : [],
          undefined,
          model,
        )
      } else {
        // Reembrulha pra cair na 4xx genérica abaixo sem perder o body
        // (Response já foi consumida via .text() — recria sintética).
        res = new Response(errText, {
          status: res.status,
          statusText: res.statusText,
        })
      }
    }

    // AE-13: se multimodal foi tentado e o modelo nao aceita, retry
    // UMA vez em modo text2img puro. Apenas pra 4xx; 5xx propaga.
    if (!res.ok && useMultimodal && res.status >= 400 && res.status < 500) {
      const errText = await res.text().catch(() => "")
      if (isMultimodalUnsupportedError(errText) || isImageDownloadError(errText)) {
        log.warn("image.multimodal.fallback_text2img", {
          storeId,
          attempt,
          status: res.status,
          reason: isImageDownloadError(errText) ? "ref_download_failed" : "unsupported",
          errorSnippet: errText.slice(0, 200),
        })
        strippedThisAttempt = true
        res = await callOpenRouterImage(apiKey, prompt, [], systemPrompt, model)
      } else {
        // AE-13 review: se o body menciona "image" mas nao casa keywords
        // conhecidas, OpenRouter pode ter mudado a mensagem — logar pra
        // ops detectar drift e atualizar isMultimodalUnsupportedError.
        if (/image/i.test(errText)) {
          log.warn("image.multimodal.4xx_with_image_keyword_no_match", {
            storeId,
            status: res.status,
            errorSnippet: errText.slice(0, 300),
          })
        }
        throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 300)}`)
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
    }

    // A resposta contém base64 gigante (~5MB+) que pode truncar com res.json().
    // Ler como text e extrair via regex é mais seguro. Sob relógio próprio:
    // o do fetch morreu quando chegaram os headers.
    const rawText = await readTextWithTimeout(
      res,
      OPENROUTER_IMAGE_BODY_TIMEOUT_MS,
      attemptT0,
    )
    const ms = Date.now() - attemptT0

    // ── Falhas transitórias do OpenRouter (200 OK enganoso) ──────────────
    // Body vazio: provider desconectou antes do primeiro byte útil. SSE com
    // error-frame: erro entregue in-band depois do 200 OK. Ambos são
    // transitórios → erro nomeado retryable (resolvidos pelo retry na maioria).
    if (rawText.trim() === "") {
      throw new OpenRouterEmptyBodyError({ status: res.status, ms })
    }
    if (/^(\s*:|\s*data:)/m.test(rawText)) {
      throw new OpenRouterMidStreamError({
        errorType: "midstream_error",
        status: res.status,
        ms,
        snippet: rawText.slice(0, 200),
      })
    }

    let imageBuffer: Buffer | null = null

    // Formato atual do OpenRouter pra modelos de imagem: a imagem vem em
    // choices[].message.images[].image_url.url — que pode ser um LINK http OU um
    // data URL base64. Lemos esse campo PRIMEIRO (regex no texto, sem JSON.parse
    // do payload que pode ser gigante). Antes só procurávamos base64 solto, então
    // toda resposta que entregava a imagem por LINK falhava aqui.
    const urlMatch = rawText.match(/"image_url"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/)
    const imageUrlField = urlMatch?.[1]
    if (imageUrlField) {
      if (/^https?:\/\//i.test(imageUrlField)) {
        // Link http: baixar a imagem do link e seguir pro MESMO fluxo de upload +
        // signed URL 365d abaixo (URL de referência, igual ao logo — nunca base64
        // inline no HTML). Falha no download cai nos fallbacks de base64.
        try {
          const imgRes = await fetchWithTimeout(
            imageUrlField,
            {},
            OPENROUTER_IMAGE_TIMEOUT_MS,
          )
          if (imgRes.ok) {
            imageBuffer = Buffer.from(await imgRes.arrayBuffer())
          } else {
            log.warn("image.url_download_non_ok", { storeId, status: imgRes.status })
          }
        } catch (err) {
          log.warn("image.url_download_failed", {
            storeId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } else {
        // data URL base64 dentro do campo url (data:image/...;base64,XXXX).
        const dataUrlB64 = imageUrlField.match(/^data:image\/[^;]+;base64,(.+)$/)
        if (dataUrlB64?.[1]) {
          imageBuffer = Buffer.from(dataUrlB64[1], "base64")
        }
      }
    }

    // Fallback 1: data:image/...;base64,XXXX solto na resposta bruta.
    if (!imageBuffer) {
      const b64Match = rawText.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/]+=*)/)
      if (b64Match?.[1]) {
        imageBuffer = Buffer.from(b64Match[1], "base64")
      }
    }

    // Fallback 2: b64_json direto.
    if (!imageBuffer) {
      const b64JsonMatch = rawText.match(/"b64_json"\s*:\s*"([A-Za-z0-9+/]+=*)"/)
      if (b64JsonMatch?.[1]) {
        imageBuffer = Buffer.from(b64JsonMatch[1], "base64")
      }
    }

    if (!imageBuffer) {
      // Body DEGENERADO em whitespace: 200 OK, content-type json, milhares de
      // chars de espaço/newline e nenhum payload útil (gpt-5.4-image-2 entra
      // em loop de whitespace — ocorrências provadas em Luxe Lift jul/2026,
      // cada uma custou uma imagem do email). É estocástico → RETRYABLE, igual
      // ao body vazio. Detecção por 3 sinais: <40 chars visíveis, <5% de
      // densidade, OU uma sequência longa (>=200) de whitespace. Este 3o
      // sinal pega o caso que escapava dos outros dois — corpo grande com
      // >5% de visível mas com um bloco enorme de espaço no começo (o snippet
      // dos 1os 500 chars saía vazio). Uma recusa em prosa nunca tem 200
      // chars de whitespace seguidos, então continua não-retryable.
      const visibleLen = rawText.replace(/\s/g, "").length
      const longestWsRun = longestWhitespaceRun(rawText)
      if (
        visibleLen < 40 ||
        visibleLen / rawText.length < 0.05 ||
        longestWsRun >= 200
      ) {
        throw new OpenRouterMidStreamError({
          errorType: "whitespace_body",
          status: res.status,
          ms,
          snippet: visibleSlice(rawText, 120),
          retryable: true,
        })
      }
      // Não-retryable: body não-vazio mas sem imagem extraível — quase sempre é
      // refusal textual do modelo (ex.: política de conteúdo sobre rostos, agora
      // que testimonials gera avatares) ou formato inesperado. Retry não ajuda.
      // Instrumentação rica: status + content-type + length tornam o erro
      // acionável mesmo quando o snippet é curto/vazio (o bug que originou este
      // fix mostrava "Resposta (truncada): " sem nenhum metadado). O snippet
      // começa no 1o caractere não-branco pra nunca sair vazio quando o corpo
      // tem whitespace no começo. O phase2-runner grava esse `errorMessage` no
      // run → aparece na UI sem depender dos logs.
      const snippet = visibleSlice(rawText, 500)
      const contentType = res.headers?.get?.("content-type") ?? "unknown"
      log.error("image.parse_failed", {
        storeId,
        attempt,
        status: res.status,
        contentType,
        responseLength: rawText.length,
        first500: snippet,
      })
      throw new Error(
        `Não foi possível extrair imagem da resposta do OpenRouter ` +
          `(status=${res.status}, content-type=${contentType}, length=${rawText.length}). ` +
          `Resposta (truncada): ${snippet}`,
      )
    }

    // Instrumentação OPT-IN: imagem extraída com sucesso → captura o `usage`
    // do envelope (tokens de input de imagem). Só quando `onMeta` existe; no
    // caminho de email (sem onMeta) este bloco nem roda.
    if (onMeta) {
      lastUsage = extractUsage(rawText)
      // Refs reais desta tentativa: [] se o multimodal foi removido no fallback.
      lastRefsSent = useMultimodal && !strippedThisAttempt ? refs : []
    }

    return imageBuffer
  }

  const imageBuffer = await withOpenRouterRetry(
    (n) => fetchImageBuffer(n),
    {
      onRetry: (err, n) =>
        log.warn("image.retry", {
          storeId,
          attempt: n,
          errorName: (err as Error)?.name,
          message: (err as Error)?.message,
        }),
    },
  )

  // Reporta a instrumentação ao caller (opt-in): tokens de input/output e quais
  // refs foram efetivamente anexadas (vazio quando não foi multimodal).
  if (onMeta) {
    onMeta({
      tokensInput: lastUsage.tokensInput,
      tokensOutput: lastUsage.tokensOutput,
      // USD real do OpenRouter → centavos (cost_cents é NUMERIC(10,4)). Arredonda
      // pra 4 casas de centavo pra evitar ruído de float (0.0412*100 = 4.11999…).
      costCents: Math.round(lastUsage.costUsd * 1_000_000) / 10_000,
      refsSent: lastRefsSent,
    })
  }

  // AE-12: resize via sharp pra forcar aspect ratio. Best-effort: se o
  // resize falhar, segue com o buffer original (pipeline nao quebra).
  // Prioridade: dimensões declaradas no schema (customDims) > aspect tipado.
  let finalBuffer: Buffer = imageBuffer
  const custom =
    options?.customDims &&
    options.customDims.width > 0 &&
    options.customDims.height > 0
      ? options.customDims
      : null
  const resizeDims = custom
    ? custom
    : options?.aspect
      ? getAspectDimensions(options.aspect)
      : null
  if (resizeDims) {
    const dims = resizeDims
    try {
      finalBuffer = await sharp(imageBuffer)
        .resize(dims.width, dims.height, {
          fit: "cover",
          position: "center",
        })
        .png()
        .toBuffer()
      log.info("image.resize", {
        storeId,
        aspect: options?.aspect,
        source: custom ? "custom_dims" : "aspect",
        to: dims,
        bytesOriginal: imageBuffer.length,
        bytesResized: finalBuffer.length,
      })
    } catch (err) {
      log.warn("image.resize_failed", {
        storeId,
        aspect: options?.aspect,
        error: err instanceof Error ? err.message : String(err),
      })
      // fallback: mantem buffer original
      finalBuffer = imageBuffer
    }
  }

  // Upload pro Supabase Storage
  const admin = createAdminClient()
  const uuid = crypto.randomUUID()
  const path = `stores/${storeId}/email-assets/${uuid}.png`

  const { error: uploadErr } = await admin.storage
    .from("onboarding-visual-assets")
    .upload(path, finalBuffer, {
      contentType: "image/png",
      upsert: false,
    })

  if (uploadErr) {
    log.error("image.upload.failed", { storeId, path, error: uploadErr.message })
    throw new Error(`Falha ao fazer upload da imagem: ${uploadErr.message}`)
  }

  const { data: signedData, error: signErr } = await admin.storage
    .from("onboarding-visual-assets")
    .createSignedUrl(path, 365 * 24 * 60 * 60)

  if (signErr || !signedData?.signedUrl) {
    const { data: publicData } = admin.storage
      .from("onboarding-visual-assets")
      .getPublicUrl(path)
    log.warn("image.signed_url.fallback_public", { storeId, path })
    return publicData.publicUrl
  }

  const durationMs = Date.now() - t0
  log.info("image.generate.done", { storeId, path, durationMs })

  return signedData.signedUrl
}

/**
 * Test-only exports — permitem testar a montagem de mensagens e a extração de
 * usage sem mockar fetch + supabase. NÃO usar em produção.
 */
export {
  buildMessages as __buildMessagesForTest,
  buildUserMessage as __buildUserMessageForTest,
  extractUsage as __extractUsageForTest,
}
