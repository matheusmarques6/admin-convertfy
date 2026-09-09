/**
 * POST /api/conteudo/ia — IA do Estúdio de Carrosséis (uma ação por chamada).
 *
 * Ações de texto: gerar_estrutura, preencher_frame, headlines, legenda,
 * corrigir_legenda, distribuir, chat, analisar_inspiracao — saída validada
 * por schema. Ação `gerar_imagem`: reusa o pipeline de imagem da ConvertIA
 * (OpenRouter → sharp → bucket) e devolve URLs servidas pelo admin.
 * Erro do provedor traduzido (402 = sem crédito no OpenRouter).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { friendlyModelErrorText } from "@/lib/ai/convertia/model-errors"
import { rewriteStorageImageSrc } from "@/lib/ai/convertia-image-url"
import { generateEmailImage } from "@/lib/agents/chains/image.chain"
import { modelosParaVariacoes } from "@/lib/agents/image/model-policy"
import { aspectInstructionForPrompt } from "@/lib/agents/image/aspect-ratio"
import { entradaImagemSchema, entradaSchema, type EntradaIA } from "@/lib/conteudo/ia/schemas"
import { executarIA, IaJsonInvalidoError } from "@/lib/conteudo/ia/service"
import { blocoDeFontes, consultaDaPauta, verificarFontes, type FonteServida } from "@/lib/conteudo/editorial/evidencias"
import { blocoDeReferencias, selecionarReferencias, type ContextoSelecao } from "@/lib/conteudo/referencias"
import { ST_MOLDE_KEY } from "@/lib/conteudo/templates"
import { listarReferencias } from "@/lib/services/conteudo-referencias.service"
import { buscarNaWeb } from "@/lib/ai/web/web-search"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
// Gerar imagem é o caminho longo: o modelo primário pode ficar minutos sem
// devolver corpo (loop de whitespace do GPT Image 2, documentado em
// image/model-policy) e ainda há o fallback para o Gemini. Com 120s a rota
// morria antes do próprio timeout do gerador e o erro chegava sem causa.
export const maxDuration = 300

const log = logger.child("ConteudoIARoute")

/**
 * Molde e pilar do pedido, para escolher as referências mais parecidas.
 * `gerar_estrutura` traz os dois; as outras ações trazem o resumo do
 * documento, que declara "molde <nome>" — lê-se dali.
 */
function contextoDaEntrada(e: EntradaIA): ContextoSelecao {
  if (e.acao === "gerar_estrutura" || e.acao === "espinha") return { molde: ST_MOLDE_KEY[e.templateNome] ?? null, pilar: e.pilar ?? null }
  if (e.acao === "triagem") return { molde: e.templateNome ? (ST_MOLDE_KEY[e.templateNome] ?? null) : null, pilar: e.pilar ?? null }
  if ("resumo" in e && typeof e.resumo === "string") {
    const m = /molde ([^·\n]+)/.exec(e.resumo)
    const nome = m?.[1]?.trim()
    return { molde: nome ? (ST_MOLDE_KEY[nome] ?? null) : null }
  }
  return {}
}

async function handlePost(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)

    const json = await request.json().catch(() => null)

    // Imagem: fluxo próprio (não é JSON de modelo de texto).
    if (json && typeof json === "object" && (json as { acao?: string }).acao === "gerar_imagem") {
      const img = entradaImagemSchema.safeParse(json)
      if (!img.success) throw new AppError("Pedido de imagem inválido.", 400)
      const orgId = await resolveOrgId(user.id)
      const aspect = img.data.aspecto ?? "4:5"
      const n = img.data.quantidade ?? 1
      // Só o modo "completo" (slide inteiro pelo modelo) dispensa a
      // proibição de texto: nele o prompt do construtor já lista a copy
      // exata e as fontes. Nos demais, o sufixo é a rede de segurança —
      // um prompt editado à mão que esqueça de proibir texto ainda sai
      // sem letras, e o renderer segue dono da tipografia.
      const sufixo =
        img.data.modo === "completo"
          ? "Renderize como um slide finalizado: todo texto listado nítido e legível, nenhum outro texto além dele, sem marcas d'água."
          : "Estética editorial premium, sem texto na imagem, sem marcas d'água, paleta com azuis profundos e neutros, luz natural."
      const prompt = `${img.data.prompt.trim()}\n\n${sufixo}\n${aspectInstructionForPrompt(aspect)}`
      try {
        // Duas variações = uma do GPT Image 2 e uma do Gemini, mesmo
        // prompt — é comparação entre modelos, não duas tentativas do
        // mesmo. Uma só usa o primário. Regra em `image/model-policy`.
        // allSettled, não all: são modelos DIFERENTES no mesmo prompt, então
        // um recusar (política de conteúdo) ou travar não pode jogar fora a
        // imagem que o outro já entregou. Só é erro quando nenhuma vem.
        const resultados = await Promise.allSettled(
          modelosParaVariacoes(n).map((model) =>
            generateEmailImage(prompt, `org-${orgId}`, { aspect, mode: "text2img", model }).then(rewriteStorageImageSrc),
          ),
        )
        const urls = resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
        const falhas = resultados.flatMap((r) => (r.status === "rejected" ? [r.reason as Error] : []))
        if (urls.length === 0) throw falhas[0] ?? new Error("Nenhuma imagem foi gerada.")
        if (falhas.length > 0) log.warn("conteudo_ia.imagem_parcial", { pedidas: n, geradas: urls.length, erro: falhas[0]?.message })
        return successResponse(request, { dados: { urls, pedidas: n } })
      } catch (e) {
        log.warn("conteudo_ia.imagem", { erro: (e as Error).message })
        throw new AppError(friendlyModelErrorText(e), 502)
      }
    }

    const parsed = entradaSchema.safeParse(json)
    if (!parsed.success) {
      throw new AppError(`Pedido inválido: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, 400)
    }

    // Referências da casa: as ações que ESCREVEM recebem os exemplos de
    // estilo antes do pedido. Fail-open — sem tabela ou sem referência o
    // comportamento é o de sempre. É o que separa "escrever pela regra" de
    // "escrever como a casa escreve".
    let blocoReferencias = ""
    try {
      const orgId = await resolveOrgId(user.id)
      const admin = createAdminClient()
      const todas = await listarReferencias(admin, orgId)
      const sel = selecionarReferencias(todas, contextoDaEntrada(parsed.data))
      blocoReferencias = blocoDeReferencias(sel)
    } catch (e) {
      log.warn("conteudo_ia.referencias_indisponiveis", { erro: (e as Error).message })
    }

    // Triagem com fato externo: a busca roda ANTES do modelo, e as URLs
    // servidas são a lista fechada contra a qual cada citação é conferida
    // depois. Fonte inventada é pior que dado nenhum — parece conferida.
    let fontes: FonteServida[] = []
    let buscaIndisponivel: string | null = null
    if (parsed.data.acao === "triagem" && parsed.data.buscarNaWeb) {
      const consulta = consultaDaPauta(parsed.data.insumo)
      if (!consulta) {
        buscaIndisponivel = "A pauta não tem palavras suficientes para uma busca."
      } else {
        const r = await buscarNaWeb(consulta, { limite: 6 })
        if (r.ok) fontes = r.resultados.map((x) => ({ titulo: x.titulo, url: x.url, trecho: x.trecho }))
        // Falhar a busca NÃO derruba a triagem: ela roda como antes e a
        // tela diz por que veio sem fonte externa. O motivo de "não
        // configurado" vem escrito para o MODELO da ConvertIA (fala de
        // `web_abrir`, que não existe no Estúdio) — aqui ele é traduzido
        // para quem está olhando a tela.
        else if (r.naoConfigurado) {
          buscaIndisponivel = "a busca na internet ainda não está configurada nesta instalação (falta a variável SERPER_API_KEY, TAVILY_API_KEY ou BRAVE_SEARCH_API_KEY no ambiente)."
        } else buscaIndisponivel = r.motivo
      }
    }

    try {
      const r = await executarIA(parsed.data, {
        signal: request.signal,
        blocoReferencias,
        blocoFontes: blocoDeFontes(fontes),
      })
      let dados = r.dados
      let fontesDescartadas: string[] = []
      if (parsed.data.acao === "triagem") {
        const t = dados as { evidencias?: Array<{ rotulo: string; texto: string; fonte?: string }> }
        if (Array.isArray(t.evidencias)) {
          const v = verificarFontes(t.evidencias, fontes)
          fontesDescartadas = v.descartadas
          if (v.descartadas.length > 0) {
            log.warn("conteudo_ia.fonte_inventada", { quantas: v.descartadas.length, urls: v.descartadas })
          }
          dados = { ...t, evidencias: v.evidencias } as typeof dados
        }
      }
      return successResponse(request, {
        dados,
        fontes: fontes.map((f) => ({ titulo: f.titulo, url: f.url })),
        busca_indisponivel: buscaIndisponivel,
        fontes_descartadas: fontesDescartadas.length,
        meta: { modelo: r.modelo, ms: r.ms, custo_usd: r.custoUsd, tentativas: r.tentativas },
      })
    } catch (e) {
      if (e instanceof IaJsonInvalidoError) {
        throw new AppError("A ConvertIA respondeu fora do formato esperado. Tente de novo ou use o modo local.", 502)
      }
      log.warn("conteudo_ia.provedor", { acao: parsed.data.acao, erro: (e as Error).message })
      throw new AppError(friendlyModelErrorText(e), 502)
    }
  } catch (error) {
    return errorResponse(request, error, "conteudo-ia")
  }
}

export const POST = withTiming("conteudo-ia", handlePost, { slowMs: 60_000 })
