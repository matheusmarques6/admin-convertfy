/**
 * Conector "Geração de imagem" da ConvertIA — SEMPRE disponível no
 * chat (não é um toggle do composer): expõe a tool
 * `convertia_gerar_imagem`, que reusa o MESMO pipeline de imagem dos
 * emails/campanhas (`generateEmailImage` → OpenRouter → sharp →
 * upload no bucket `onboarding-visual-assets` com signed URL de 365
 * dias). O resultado volta como markdown `![](url)` — o chat renderiza
 * a imagem inline.
 *
 * A telemetria de custo é reportada ao caller via `onCost` (a rota do
 * chat soma no custo do turno — o guard-rail diário enxerga imagem
 * como qualquer outro gasto da ConvertIA).
 */

import {
  generateEmailImage,
  OPENROUTER_IMAGE_MODEL,
} from "@/lib/agents/chains/image.chain"
import {
  aspectInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "@/lib/agents/image/aspect-ratio"
import { rewriteStorageImageSrc, storagePathFromUrl } from "@/lib/ai/convertia-image-url"
import { publicConvertiaAssetUrl } from "@/lib/ai/convertia-asset-signature"
import type { ConnectorTool, ResolvedConnector } from "./types"

const ASPECTS: AspectKey[] = ["1:1", "4:5", "3:4", "4:3", "16:9", "9:16", "2:1", "3:5"]

export function buildImagemConnector(opts: {
  /** Soma o custo real da geração no total do turno (centavos USD). */
  onCost?: (costCents: number, tokensInput: number, tokensOutput: number) => void
  /**
   * Origem pública do admin (publicOrigin). Com ela a tool devolve
   * também a URL assinada e SEM login que o Omnisend/Klaviyo/Shopify
   * conseguem baixar — sem isso a arte gerada não entra num popup.
   */
  origin?: string
}): ResolvedConnector {
  const gerarImagem: ConnectorTool = {
    label: "Gerar imagem",
    // Gera conteúdo novo mas não muda estado de sistema externo —
    // não marca `write` (sem confirmação prévia exigida).
    def: {
      type: "function",
      function: {
        name: "convertia_gerar_imagem",
        description:
          "EXECUTA: gera uma imagem por IA (fotografia, arte de campanha, banner de email) a partir de uma descrição e devolve a URL pronta. Use quando o usuário pedir uma imagem, foto, banner ou arte. Descreva a cena em detalhe (estilo, iluminação, composição, cores da marca se conhecidas). A imagem sai hospedada — inclua-a na resposta como markdown ![descrição](url).",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description:
                "Descrição detalhada da imagem (pode ser em português ou inglês): assunto, estilo visual, iluminação, composição, paleta.",
            },
            aspecto: {
              type: "string",
              enum: ASPECTS,
              description:
                "Proporção da imagem. 1:1 quadrada, 4:5/3:4 retrato (feed), 16:9/4:3/2:1 paisagem (banner), 9:16/3:5 vertical (story). Default: 1:1.",
            },
            referencia_url: {
              type: "string",
              description:
                "Opcional: URL de uma imagem de referência visual (ex.: foto real do produto) para o modelo respeitar.",
            },
          },
          required: ["prompt"],
        },
      },
    },
    execute: async (args, ctx) => {
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : ""
      if (!prompt) {
        return { content: "Erro: descreva a imagem no campo prompt.", summary: "sem prompt" }
      }
      const aspect: AspectKey = isAspectKey(args.aspecto) ? args.aspecto : "1:1"
      const referenceUrl =
        typeof args.referencia_url === "string" && /^https:\/\//.test(args.referencia_url)
          ? args.referencia_url
          : undefined

      // Pasta de upload: a loja da conversa; sem loja, a pasta da org
      // (o path é só organização de bucket — nada é lido de lá).
      const folder = ctx.storeId ?? `org-${ctx.orgId}`
      const fullPrompt = `${prompt}\n\n${aspectInstructionForPrompt(aspect)}`

      const storageUrl = await generateEmailImage(fullPrompt, folder, {
        aspect,
        mode: referenceUrl ? "product_ref" : "text2img",
        ...(referenceUrl ? { referenceImageUrl: referenceUrl } : {}),
        model: OPENROUTER_IMAGE_MODEL,
        onMeta: (m) => opts.onCost?.(m.costCents, m.tokensInput, m.tokensOutput),
      })

      // A signed URL do Storage vinha quebrada (token assinando um path
      // diferente do objeto) e a imagem dava erro no chat. Entregamos a
      // rota do admin, que autentica e transmite o objeto — e que
      // também não expira. Se a URL não for do bucket, segue como veio.
      const url = rewriteStorageImageSrc(storageUrl)

      // URL pública assinada: é a que vai para post_images do Omnisend,
      // para o Klaviyo ou para o Shopify. A do chat exige login e a
      // plataforma externa não consegue baixá-la.
      const objectPath = storagePathFromUrl(storageUrl)
      let publicUrl: string | null = null
      if (opts.origin && objectPath) {
        try {
          publicUrl = publicConvertiaAssetUrl(opts.origin, objectPath)
        } catch {
          /* sem ENCRYPTION_KEY — segue só com a URL do chat */
        }
      }

      return {
        content: [
          `Imagem gerada com sucesso (${aspect}).`,
          `URL: ${url}`,
          `Inclua na resposta como: ![${prompt.slice(0, 60)}](${url})`,
          "Use EXATAMENTE essa URL — não a reescreva nem invente outra.",
          publicUrl
            ? `URL pública (para subir em plataformas — Omnisend post_images, Klaviyo, Shopify): ${publicUrl}\nPasse-a inteira, com o ?sig=. A URL do chat NÃO funciona fora do admin.`
            : "Sem URL pública nesta instalação — para usar a arte numa plataforma externa, peça ao usuário para subir a imagem manualmente.",
        ].join("\n"),
        summary: `imagem ${aspect}`,
      }
    },
  }

  return { key: "imagem", name: "Geração de imagem", tools: [gerarImagem] }
}
