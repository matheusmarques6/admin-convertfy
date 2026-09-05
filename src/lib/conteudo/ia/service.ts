/**
 * Motor da IA do Estúdio (servidor). Monta o prompt por ação, chama o
 * OpenRouter pela mesma infra da ConvertIA (`streamOpenRouterChat`), extrai
 * o JSON da resposta e valida com o schema da ação. JSON inválido → uma
 * segunda tentativa com a mensagem de erro; falhou de novo → erro claro.
 */

import { streamOpenRouterChat, type ChatContentPart, type ChatMessage } from "@/lib/ai/openrouter-chat"
import { logger } from "@/lib/logger"
import { PROVAS_CONHECIDAS, SYSTEM_PROMPT } from "./prompt"
import { SAIDA_SCHEMA, type EntradaIA, type SaidaPorAcao } from "./schemas"

const log = logger.child("ConteudoIA")

export const CONTEUDO_IA_MODEL = process.env.CONTEUDO_IA_MODEL || "anthropic/claude-sonnet-4.6"

export class IaJsonInvalidoError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = "IaJsonInvalidoError"
  }
}

/** Extrai o primeiro objeto JSON de um texto (tolera cercas e prosa em volta). */
export function extrairJson(texto: string): unknown {
  const limpo = texto.replace(/```(?:json)?/gi, "").trim()
  const ini = limpo.indexOf("{")
  const fim = limpo.lastIndexOf("}")
  if (ini < 0 || fim <= ini) throw new IaJsonInvalidoError("Resposta sem objeto JSON")
  try {
    return JSON.parse(limpo.slice(ini, fim + 1))
  } catch (e) {
    throw new IaJsonInvalidoError(`JSON inválido: ${(e as Error).message}`)
  }
}

const frameLista = (frames: Array<{ frameId: string; tipo: string; label: string; campos: string[] }>) =>
  frames.map((f) => `- ${f.frameId} (${f.tipo}, ${f.label}): campos ${f.campos.join(", ")}`).join("\n")

function instrucaoDaAcao(e: EntradaIA): { texto: string; imagens?: string[] } {
  switch (e.acao) {
    case "gerar_estrutura":
      return {
        texto: `Gere o conteúdo completo de um carrossel.

Nome de trabalho: "${e.nome}"
Perfil que publica: ${e.perfil === "bruno" ? "@brunoconvertfy (primeira pessoa, bastidor, opinião)" : "@convertfy (marca, nós, autoridade calma)"}
Molde: ${e.templateNome}
Pauta: ${e.pauta}
${e.pilar ? `Pilar: ${e.pilar}` : ""}
${e.etapaFunil ? `Etapa do funil: ${e.etapaFunil}` : ""}
${e.objetivoCta ? `Objetivo do CTA: ${e.objetivoCta}` : "Objetivo do CTA: comment gate"}
${e.prova ? `Dado ou prova a usar: ${e.prova}` : `Provas disponíveis: ${PROVAS_CONHECIDAS.join("; ")}`}
${e.atuais ? `Textos já escritos pelo usuário (preserve o que não for texto-guia, melhore o resto): ${JSON.stringify(e.atuais)}` : ""}

Frames do documento (escreva EXATAMENTE estes frameIds, só os campos listados, respeitando os limites por tipo):
${frameLista(e.frames)}

Responda com JSON: {"nome": string opcional (headline final, se melhorar o nome de trabalho), "frames": [{"frameId": string, "textos": {campo: valor}}], "legenda": string (150 a 180 palavras), "palavraChave": string (caixa alta, curta)}`,
      }
    case "preencher_frame":
      return {
        texto: `Contexto do carrossel:
${e.resumo}

${e.regenerar ? "Reescreva" : "Preencha"} o frame ${e.frame.frameId} (${e.frame.tipo}, ${e.frame.label}) com os campos ${e.frame.campos.join(", ")}, coerente com os frames vizinhos e sem repetir ideia já usada.${e.atual ? ` Texto atual: ${JSON.stringify(e.atual)}.` : ""}
Responda com JSON: {"textos": {campo: valor}}`,
      }
    case "headlines":
      return {
        texto: `Contexto do carrossel:
${e.resumo}

Headline atual da capa: "${e.atual}". Escreva 5 variações de headline para a capa, cada uma com um ângulo diferente (número, contraste, pergunta específica, afirmação universal, provocação), até 56 caracteres cada, sem emoji e sem travessão.
Responda com JSON: {"opcoes": [string, string, string, string, string]}`,
      }
    case "legenda":
      return {
        texto: `Contexto do carrossel:
${e.resumo}

Escreva a legenda do post (150 a 180 palavras) seguindo a estrutura da casa e o comment gate${e.palavraChave ? ` com a palavra-chave "${e.palavraChave}"` : " (escolha uma palavra-chave curta em caixa alta que saia do conteúdo)"}.
Responda com JSON: {"legenda": string, "palavraChave": string}`,
      }
    case "corrigir_legenda":
      return {
        texto: `Legenda atual:
"""
${e.legenda}
"""
Problemas de compliance apontados: ${e.problemas.join("; ")}.
Reescreva o mínimo necessário para resolver TODOS os problemas mantendo voz, estrutura e comment gate. Sem travessão, sem emoji, sem promessa financeira, sem engagement bait, com CTA claro, até 2.200 caracteres.
Responda com JSON: {"legenda": string}`,
      }
    case "distribuir":
      return {
        texto: `Contexto do carrossel:
${e.resumo}

O usuário colou este conteúdo bruto:
"""
${e.texto}
"""
Distribua uma ideia por slide nos frames do meio abaixo (ignore capa e CTA), na ordem. Cada proposta tem título curto (respeitando o limite do tipo) e corpo de apoio. Se houver mais ideias que frames, funda as menores; se houver menos, deixe frames de fora.
Frames disponíveis:
${frameLista(e.frames)}
Responda com JSON: {"props": [{"frameId": string, "titulo": string, "corpo": string opcional}]}`,
      }
    case "chat":
      return {
        imagens: e.anexos,
        texto: `Você está dentro do editor com este carrossel aberto:
${e.resumo}

Frames (frameIds válidos para propostas):
${frameLista(e.frames)}

${e.historico?.length ? `Conversa até aqui:\n${e.historico.map((m) => `${m.de === "eu" ? "Usuário" : "ConvertIA"}: ${m.t}`).join("\n")}\n` : ""}
Mensagem do usuário: """${e.mensagem || "(sem texto, só anexos)"}"""
${e.anexos?.length ? `O usuário anexou ${e.anexos.length} imagem(ns) de referência visual (em anexo).` : ""}

Responda de forma curta (até 3 frases) e proponha UMA ação aplicável com um clique, escolhendo o tipo:
- "estrutura": você distribuiu conteúdo em slides → preencha "props" com frameIds válidos (título + corpo). Label: "Aplicar em N slides".
- "headline": você propôs headlines para a capa → preencha "opcoes" com 5 strings (até 56 caracteres).
- "legenda": você escreveu a legenda → preencha "legenda" e "palavraChave". Label: "Aplicar legenda".
- "estilo": direção visual a partir de referência → preencha "estilo" (fundoEscuroTipos, escalaTituloCapa, angulo) e "detalhes" (3 bullets do que muda). Label: "Aplicar direção visual".
- "imagens": sugestão de imagens para slots vazios → "detalhes" descreve cada imagem. Label: "Preencher slots".
- "gerar": o usuário quer uma estrutura nova sem ter colado conteúdo → label "Gerar estrutura".
- "exportar": o assunto é exportação/publicação → label "Abrir exportação".
- "nenhuma": resposta informativa, sem ação.
Regras: se a mensagem tem 2 ou mais linhas de conteúdo, é "estrutura". Se menciona headline ou título, é "headline". Se pede legenda, é "legenda". Se só há anexo, é "estilo".
Responda com JSON: {"texto": string, "acao": {"tipo": string, "label": string} opcional, "props": [...] opcional, "opcoes": [...] opcional, "detalhes": [...] opcional, "legenda": string opcional, "palavraChave": string opcional, "estilo": {...} opcional}`,
      }
    case "analisar_inspiracao":
      return {
        imagens: e.imagens,
        texto: `As imagens em anexo são os slides de um carrossel de referência (na ordem). Leia a ESTRUTURA (não o conteúdo): para cada slide, classifique o tipo entre capa, dado, texto, prova, lista, mec, cta e descreva o layout em poucas palavras (ex.: "imagem full + título 2 linhas", "número gigante + apoio serif", "citação sobre foto escura"). Marque slotImagem quando o slide depende de fotografia. Estime a fidelidade (0 a 100) com que os moldes da casa reproduzem essa estrutura e sugira o molde mais próximo (molde-turbo, molde-benchmark, molde-lista, molde-mec ou molde-bastidor).
Responda com JSON: {"frames": [{"tipo": string, "descricao": string, "slotImagem": boolean}], "fidelidade": number, "observacoes": string, "templateSugerido": string}`,
      }
  }
}

export interface ResultadoIA<K extends keyof SaidaPorAcao> {
  dados: SaidaPorAcao[K]
  modelo: string
  ms: number
  custoUsd: number
  tentativas: number
}

export async function executarIA<K extends keyof SaidaPorAcao>(
  entrada: Extract<EntradaIA, { acao: K }>,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<ResultadoIA<K>> {
  const model = opts.model ?? CONTEUDO_IA_MODEL
  const { texto, imagens } = instrucaoDaAcao(entrada)
  const schema = SAIDA_SCHEMA[entrada.acao]

  const conteudoUsuario: string | ChatContentPart[] = imagens?.length
    ? [{ type: "text", text: texto }, ...imagens.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : texto

  const mensagens: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: conteudoUsuario },
  ]

  const inicio = Date.now()
  let custo = 0
  let ultimoErro: Error | null = null

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const r = await streamOpenRouterChat({
      model,
      messages: mensagens,
      maxTokens: entrada.acao === "gerar_estrutura" ? 6000 : 3000,
      temperature: entrada.acao === "headlines" ? 0.8 : 0.5,
      timeoutMs: 90_000,
      signal: opts.signal,
      promptCache: true,
    })
    custo += r.costUsd
    try {
      const bruto = extrairJson(r.text)
      const parsed = schema.safeParse(bruto)
      if (!parsed.success) {
        throw new IaJsonInvalidoError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))
      }
      log.info("conteudo_ia.ok", { acao: entrada.acao, model, ms: Date.now() - inicio, custo, tentativa })
      return { dados: parsed.data as SaidaPorAcao[K], modelo: model, ms: Date.now() - inicio, custoUsd: custo, tentativas: tentativa }
    } catch (e) {
      ultimoErro = e as Error
      log.warn("conteudo_ia.json_invalido", { acao: entrada.acao, tentativa, erro: ultimoErro.message })
      // segunda volta: devolve a resposta e o erro para o modelo corrigir
      mensagens.push({ role: "assistant", content: r.text })
      mensagens.push({
        role: "user",
        content: `A resposta anterior não passou na validação: ${ultimoErro.message}. Responda de novo APENAS com o JSON válido no formato pedido.`,
      })
    }
  }
  throw ultimoErro ?? new IaJsonInvalidoError("Falha ao obter JSON válido")
}
