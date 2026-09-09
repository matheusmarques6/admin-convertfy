/**
 * Motor da IA do Estúdio (servidor). Monta o prompt por ação, chama o
 * OpenRouter pela mesma infra da ConvertIA (`streamOpenRouterChat`), extrai
 * o JSON da resposta e valida com o schema da ação. JSON inválido → uma
 * segunda tentativa com a mensagem de erro; falhou de novo → erro claro.
 */

import { streamOpenRouterChat, type ChatContentPart, type ChatMessage } from "@/lib/ai/openrouter-chat"
import { logger } from "@/lib/logger"
import { SYSTEM_PROMPT } from "./prompt"
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

const frameLista = (frames: Array<{ frameId: string; tipo: string; label: string; campos: string[]; papel?: string }>) =>
  frames.map((f) => `- ${f.frameId} (${f.tipo}, ${f.label}${f.papel ? `, papel: ${f.papel}` : ""}): campos ${f.campos.join(", ")}`).join("\n")

const descreverPerfil = (p: { handle: string | null; nome: string; voz?: "marca" | "pessoal" }) =>
  `${[p.handle, p.nome].filter(Boolean).join(" · ") || "não informado"} — voz ${p.voz === "pessoal" ? "PESSOAL (primeira pessoa, bastidor, opinião)" : "de MARCA (nós, cases e dados, autoridade calma)"}`

const segundaPessoaTexto = (liberada: boolean | undefined) =>
  liberada === false ? "Segunda pessoa: PROIBIDA neste perfil (escreva como reportagem, sem \"você\")." : "Segunda pessoa: liberada (\"você\" é a voz da casa)."

const triagemTexto = (t: { transformacao: string; friccaoCentral: string; anguloDominante: string; evidencias: Array<{ rotulo: string; texto: string; fonte?: string }>; eixo: string; funil: string; promessa: string }) =>
  `Triagem (leitura do insumo, já aprovada):
- Transformação: ${t.transformacao}
- Fricção central: ${t.friccaoCentral}
- Ângulo dominante: ${t.anguloDominante}
- Evidências: ${t.evidencias.map((e) => `${e.rotulo}) ${e.texto}${e.fonte ? ` (${e.fonte})` : " (sem fonte: usar [confirmar])"}`).join(" · ")}
- Eixo: ${t.eixo} · Funil: ${t.funil}
- Promessa a cumprir antes do CTA: ${t.promessa}`

const espinhaTexto = (e: { headline: string; subtitulo?: string; hook: string; mecanismo: string; prova: string[]; aplicacao: string; direcao: string; fechamento: string }) =>
  `Espinha dorsal (aprovada — a copy é DERIVADA daqui, não da pauta):
- Headline: ${e.headline}${e.subtitulo ? ` / ${e.subtitulo}` : ""}
- Hook: ${e.hook}
- Mecanismo: ${e.mecanismo}
- Prova: ${e.prova.map((p, i) => `${String.fromCharCode(65 + i)}) ${p}`).join(" · ")}
- Aplicação: ${e.aplicacao}
- Direção: ${e.direcao}
- Fechamento: ${e.fechamento}`

const limitesCapaTexto = (l?: { titulo?: number; subtitulo?: number }) =>
  l ? `Limites do canvas: título até ${l.titulo ?? 56} caracteres, subtítulo até ${l.subtitulo ?? 90}.` : "Limites do canvas: título até 56 caracteres, subtítulo até 90."

const HEADLINE_JSON = `{"texto": string, "subtitulo": string, "padrao": id do padrão, "gatilhos": [id, id], "veredito": "aprovada"|"ressalva"|"reprovada", "motivo": string curta}`

function instrucaoDaAcao(e: EntradaIA): { texto: string; imagens?: string[] } {
  switch (e.acao) {
    case "triagem":
      return {
        texto: `Faça a TRIAGEM deste insumo antes de qualquer headline. Leia em três camadas e classifique.

Perfil que publica: ${descreverPerfil(e.perfil)}
${e.pilar ? `Pilar pretendido: ${e.pilar}` : ""}
${e.etapaFunil ? `Etapa do funil pretendida: ${e.etapaFunil}` : ""}
${e.templateNome ? `Molde pretendido: ${e.templateNome}` : ""}

Insumo (texto, ideia, dado ou transcrição):
"""
${e.insumo}
"""

Campos:
- transformacao: o que mudou, com costura e consequência (2 a 4 frases).
- friccaoCentral: a tensão REAL do fenômeno (conflito, não só tema) para quem vende online.
- anguloDominante: a leitura mais forte para o carrossel, em uma frase.
- evidencias: A), B), C) (até 6) — só o que está no insumo ou nos resultados de busca (quando houver, vêm no fim deste pedido); cada uma com "fonte": a URL INTEIRA de um dos resultados, ou o nome + ano quando o dado veio do insumo. Sem fonte, deixe o campo fora e o dado será marcado [confirmar].
- eixo: mercado | cases | noticias | cultura | produto.
- funil: topo (alcançar gente nova) | meio (aquecer quem segue) | fundo (converter).
- promessa: o que o hook vai prometer e a peça TEM de cumprir antes do CTA.
Nunca invente número, fonte, nome de cliente ou data. Se o insumo é fraco, diga isso na fricção e sugira o ângulo possível sem inventar.
Responda com JSON: {"transformacao": string, "friccaoCentral": string, "anguloDominante": string, "evidencias": [{"rotulo": "A", "texto": string, "fonte": string opcional}], "eixo": string, "funil": string, "promessa": string}`,
      }
    case "ajustar_headline": {
      const mistura = e.misturarCom != null ? e.opcoes[e.misturarCom] : null
      return {
        texto: `Ajuste UMA headline mantendo as demais.
${e.triagem ? triagemTexto(e.triagem) : ""}
${limitesCapaTexto(e.limites)}
${segundaPessoaTexto(e.segundaPessoa)}

Opções atuais:
${e.opcoes.map((o, i) => `${i + 1}. ${o.texto}${o.subtitulo ? ` / ${o.subtitulo}` : ""} [${o.padrao}; ${o.gatilhos.join("+")}]`).join("\n")}

Reescreva a opção ${e.indice + 1}${mistura ? ` misturando com a opção ${(e.misturarCom ?? 0) + 1} ("${mistura.texto}")` : ""}.${e.instrucao ? ` Direção do usuário: "${e.instrucao}".` : ""}
Mantenha o padrão declarado a menos que a direção peça outro; passe pelo checklist de rejeição; declare gatilhos e veredito honestos.
Responda com JSON: {"opcao": ${HEADLINE_JSON}}`,
      }
    }
    case "espinha":
      return {
        texto: `Monte a ESPINHA DORSAL do carrossel a partir da triagem e da headline escolhida. A copy dos slides será derivada daqui: escreva cada campo como prosa completa (2 a 5 frases), com os dados e as fontes da triagem.

Perfil que publica: ${descreverPerfil(e.perfil)}
Molde: ${e.templateNome} · Papéis que os frames vão receber, na ordem: ${e.papeis.join(" → ")}
${e.pilar ? `Pilar: ${e.pilar}` : ""}
${segundaPessoaTexto(e.segundaPessoa)}
${triagemTexto(e.triagem)}

Headline escolhida: "${e.headline.texto}"${e.headline.subtitulo ? ` / "${e.headline.subtitulo}"` : ""} (padrão ${e.headline.padrao})
${e.atual ? `Espinha anterior:\n${espinhaTexto(e.atual)}\n${e.instrucao ? `Ajuste pedido: "${e.instrucao}".` : "Refaça com outro ângulo interno, mantendo a headline."}` : ""}

Campos:
- hook: contextualiza a tensão da headline numa cena concreta (o slide 2 tem de recompensar o toque na capa).
- mecanismo: por que o fenômeno acontece — o motor, com causa e dado.
- prova: lista de 1 a 5 evidências, cada uma com número + fonte + ano quando existir; sem fonte, [confirmar].
- aplicacao: a consequência traduzida para a loja do leitor (a conta com os números dele, quando der).
- direcao: o próximo passo lógico, sem venda — prepara o CTA.
- fechamento: virada temática genuína; nunca resumo.
A promessa da triagem ("${e.triagem.promessa}") tem de estar cumprida entre hook e aplicação.
Responda com JSON: {"headline": string, "subtitulo": string, "hook": string, "mecanismo": string, "prova": [string], "aplicacao": string, "direcao": string, "fechamento": string}`,
      }
    case "revisar":
      return {
        texto: `REVISE esta copy pelos 7 parâmetros do motor editorial (nota 0 a 10 cada; abaixo de 8 reprova). Seja rigoroso: nota 8 é "publicável por um jornalista da Folha", não "aceitável".

Perfil que publica: ${descreverPerfil(e.perfil)}
${segundaPessoaTexto(e.segundaPessoa)}
${e.triagem ? triagemTexto(e.triagem) : ""}
${e.espinha ? espinhaTexto(e.espinha) : ""}

Slides:
${e.frames.map((f, i) => `${String(i + 1).padStart(2, "0")} [${f.frameId}] ${f.tipo}${f.papel ? ` · papel ${f.papel}` : ""}: ${Object.entries(f.textos).filter(([, v]) => v).map(([k, v]) => `${k}: "${v}"`).join(" | ") || "(vazio)"}`).join("\n")}

Legenda:
"""
${e.legenda || "(vazia)"}
"""

${e.violacoes.length ? `O filtro editorial (código) já encontrou estas violações — confirme-as na nota e proponha a reescrita:\n${e.violacoes.map((v) => `- ${v.frameId ? `[${v.frameId}${v.campo ? `.${v.campo}` : ""}] ` : "[legenda] "}${v.nome}: "${v.trecho}" → ${v.sugestao}`).join("\n")}` : "O filtro editorial (código) não achou violação de padrão; procure o que ele não enxerga (genérico, promessa não cumprida, artigo omitido, texto picotado)."}

Para CADA slide dê nota e problemas; quando a nota for menor que 8, inclua "reescrita" com os campos corrigidos (só os campos que mudam, respeitando os limites do tipo). Nunca invente dado na reescrita: mantenha [confirmar] onde não há fonte.
Responda com JSON: {"parametros": [{"id": "gramatica"|"fluidez"|"ai_slop"|"fatos"|"estrutura"|"densidade"|"tom", "nota": number, "problemas": [string]}], "slides": [{"frameId": string, "nota": number, "problemas": [string], "reescrita": {campo: valor} opcional}], "resumo": string}`,
      }
    case "gerar_estrutura":
      return {
        texto: `Gere o conteúdo completo de um carrossel.

Nome de trabalho: "${e.nome}"
Perfil que publica: ${descreverPerfil(e.perfil)}
${segundaPessoaTexto(e.segundaPessoa)}
Molde: ${e.templateNome}
${e.triagem ? triagemTexto(e.triagem) : ""}
${e.espinha ? espinhaTexto(e.espinha) : ""}
${e.espinha ? "Pauta original (só como contexto — a espinha manda):" : "Pauta:"} ${e.pauta}
${e.pilar ? `Pilar: ${e.pilar}` : ""}
${e.etapaFunil ? `Etapa do funil: ${e.etapaFunil}` : ""}
${e.objetivoCta ? `Objetivo do CTA: ${e.objetivoCta}` : "Objetivo do CTA: comment gate"}
${e.prova ? `Dado ou prova a usar: ${e.prova}` : "Nenhuma prova fornecida: onde o molde pedir número ou case, use o marcador [confirmar] em vez de inventar."}
${e.atuais ? `Textos já escritos pelo usuário (preserve o que não for texto-guia, melhore o resto): ${JSON.stringify(e.atuais)}` : ""}

Frames do documento (escreva EXATAMENTE estes frameIds, só os campos listados, respeitando os limites por tipo${e.espinha ? "; cada frame realiza o PAPEL indicado, com o texto da espinha correspondente" : ""}):
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
    case "headlines": {
      const n = e.quantidade ?? 10
      const diag = e.modo === "diagnosticar" && e.atual
      return {
        texto: `${e.triagem ? triagemTexto(e.triagem) : ""}
${e.resumo ? `Contexto do carrossel aberto:\n${e.resumo}` : ""}
${e.perfil ? `Perfil que publica: ${descreverPerfil(e.perfil)}` : ""}
${limitesCapaTexto(e.limites)}
${segundaPessoaTexto(e.segundaPessoa)}
${e.atual ? `Headline atual da capa: "${e.atual}".` : ""}
${diag ? `Primeiro DIAGNOSTIQUE a atual: padrão dominante, força (0 a 10), principal problema e oportunidade.` : ""}

Gere exatamente ${n} headlines para a capa, cada uma com subtítulo (texto 2, independente do texto 1), padrão declarado (id da tabela), 2 gatilhos e veredito honesto. Distribua os padrões: nenhum repetido mais de 2 vezes. Passe cada uma pelo checklist de rejeição ANTES de responder; reprovada é reescrita, não entregue. Ordene da mais forte para a mais fraca. Sem emoji, sem travessão, dentro dos limites do canvas.
Responda com JSON: {${diag ? `"diagnostico": {"padraoAtual": string, "forca": number, "problema": string, "oportunidade": string}, ` : ""}"opcoes": [${HEADLINE_JSON}]}`,
      }
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
    case "transcrever_referencia":
      return {
        imagens: e.imagens,
        texto: `As imagens em anexo são os slides de um carrossel que o time da Convertfy considera BOM (na ordem). Ele vai virar referência de estilo para os próximos carrosséis. Faça a leitura completa:
1. Transcreva a COPY de cada slide, fiel ao que está escrito (título e texto de apoio, separados). Não resuma, não corrija, não invente o que não está legível — deixe o campo vazio.
2. Classifique cada slide entre capa, dado, texto, prova, lista, mec, cta.
3. Diga em 3 a 5 bullets curtos POR QUE a peça funciona (gancho da capa, ritmo, tipo de prova, como fecha no CTA) — é o que a próxima geração vai imitar.
4. Sugira pilar (Case, Educacional, Bastidor, Benchmark) e molde (Turbo, MEC, Benchmark, Lista, Bastidor) mais próximos, e a palavra-chave do comment gate se houver.
5. "nome" = a headline da capa.
${e.legenda ? `Legenda publicada com o post (use para entender o fechamento e a palavra-chave):\n"""\n${e.legenda}\n"""` : ""}
${e.nome ? `Nome de trabalho informado: "${e.nome}".` : ""}
Responda com JSON: {"nome": string, "slides": [{"ordem": number, "tipo": string, "titulo": string, "corpo": string}], "porQueFunciona": [string], "pilar": string opcional, "molde": string opcional, "palavraChave": string opcional}`,
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

/** Ações que ESCREVEM copy — só elas recebem as referências de estilo. */
const ACOES_COM_REFERENCIAS = new Set<EntradaIA["acao"]>(["gerar_estrutura", "preencher_frame", "headlines", "ajustar_headline", "espinha", "legenda", "distribuir", "chat"])

const MAX_TOKENS: Partial<Record<EntradaIA["acao"], number>> = { gerar_estrutura: 6000, transcrever_referencia: 6000, revisar: 7000, headlines: 5000, espinha: 4000, triagem: 3000 }
const TEMPERATURA: Partial<Record<EntradaIA["acao"], number>> = { headlines: 0.8, ajustar_headline: 0.8, revisar: 0.2, triagem: 0.4 }

export async function executarIA<K extends keyof SaidaPorAcao>(
  entrada: Extract<EntradaIA, { acao: K }>,
  opts: {
    model?: string
    signal?: AbortSignal
    /**
     * Bloco de referências da casa (`blocoDeReferencias`), já renderizado.
     * Vai ANTES do pedido nas ações que escrevem copy; vazio = comportamento
     * de antes. Quem carrega do banco é a rota — este módulo não faz I/O.
     */
    blocoReferencias?: string
    /**
     * Resultados de busca já renderizados (`blocoDeFontes`), servidos SÓ na
     * triagem. Quem chama a internet é a rota — este módulo não faz I/O.
     */
    blocoFontes?: string
  } = {},
): Promise<ResultadoIA<K>> {
  const model = opts.model ?? CONTEUDO_IA_MODEL
  const instrucao = instrucaoDaAcao(entrada)
  const usaReferencias = Boolean(opts.blocoReferencias) && ACOES_COM_REFERENCIAS.has(entrada.acao)
  const base = usaReferencias ? `${opts.blocoReferencias}\n\n---\n\n${instrucao.texto}` : instrucao.texto
  // As fontes vão DEPOIS do pedido, coladas nas regras de citação: assim a
  // última coisa que o modelo lê antes de responder é a lista fechada de
  // URLs e a proibição de inventar outra.
  const texto = opts.blocoFontes && entrada.acao === "triagem" ? `${base}\n\n${opts.blocoFontes}` : base
  const imagens = instrucao.imagens
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
      maxTokens: MAX_TOKENS[entrada.acao] ?? 3000,
      temperature: TEMPERATURA[entrada.acao] ?? 0.5,
      timeoutMs: entrada.acao === "revisar" ? 110_000 : 90_000,
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
      log.info("conteudo_ia.ok", { acao: entrada.acao, model, ms: Date.now() - inicio, custo, tentativa, referencias: usaReferencias })
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
