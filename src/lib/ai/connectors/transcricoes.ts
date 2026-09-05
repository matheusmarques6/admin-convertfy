/**
 * Conector "Transcrições" — a biblioteca de aulas, calls e referências
 * como fonte de consulta da ConvertIA.
 *
 * Só entram as coleções marcadas com a FAÍSCA
 * (`na_base_de_conhecimento`). É o contrato do toggle: ligar inclui na
 * recuperação, desligar exclui — sem apagar os embeddings, para que
 * religar seja instantâneo.
 *
 * Toda resposta carrega o TIMESTAMP e o link `?t=MM:SS`. É o que permite
 * a IA citar "a aula 03 explica isso aos 1:36" com um link que abre o
 * player no ponto — e é o que separa uma citação verificável de uma
 * afirmação sem lastro.
 *
 * Leitura apenas: nada aqui muda estado.
 */

import { embedQuery, embeddingsAvailable } from "@/lib/ai/convertia/knowledge-embeddings"
import { fmtDuracao } from "@/lib/transcricoes/pipeline"
import { toolJson, type ConnectorTool, type ConnectorToolContext, type ResolvedConnector } from "./types"

/** Chave do toggle no composer. */
export const TRANSCRICOES_CONNECTOR_KEY = "transcricoes"

interface LinhaSemantica {
  chunk_id: number
  transcricao_id: string
  titulo: string
  s: number
  fim: number
  contexto: string | null
  texto: string
  similaridade: number
}

interface LinhaExata {
  transcricao_id: string
  titulo: string
  s: number
  locutor: string | null
  trecho: string
}

const link = (id: string, s: number) => `/admin/transcricoes/${id}?t=${encodeURIComponent(fmtDuracao(s))}`

/** Ids das coleções na base — o recorte de tudo neste conector. */
async function colecoesNaBase(ctx: ConnectorToolContext): Promise<string[]> {
  const { data } = await ctx.admin
    .from("transcricoes_colecoes")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("na_base_de_conhecimento", true)
  return ((data ?? []) as Array<{ id: string }>).map((c) => c.id)
}

const buscar: ConnectorTool = {
  label: "Buscar nas transcrições",
  def: {
    type: "function",
    function: {
      name: "transcricoes_buscar",
      description:
        "Busca trechos falados nas transcrições da casa (aulas, calls, referências) por significado e por palavras. Devolve o trecho, o título, o TIMESTAMP e o link que abre o player no ponto exato. Use quando a pergunta for sobre o que foi DITO numa aula, treino ou call — e cite o timestamp na resposta.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "O que procurar, em linguagem natural" },
          limite: { type: "number", description: "Máx. 12 (default 6)" },
        },
        required: ["query"],
      },
    },
  },
  execute: async (args, ctx) => {
    const query = String(args.query ?? "").trim()
    if (!query) return { content: "Query vazia." }
    const limite = Math.min(Math.max(Number(args.limite) || 6, 1), 12)

    const colecaoIds = await colecoesNaBase(ctx)
    if (!colecaoIds.length) {
      // Estado honesto: nenhuma coleção foi marcada. Dizer isso é melhor
      // que devolver lista vazia como se nada casasse com a busca.
      return {
        content:
          "Nenhuma coleção de transcrições está marcada como base da ConvertIA. Ligue a faísca de uma coleção em Transcrições para que o conteúdo entre na consulta.",
        summary: "sem coleções na base",
      }
    }

    const achados = new Map<string, Record<string, unknown>>()

    // Exata primeiro: quem pergunta por um termo literal espera vê-lo.
    const { data: exatas } = await ctx.admin.rpc("transcricoes_busca_exata", {
      p_org_id: ctx.orgId,
      p_termo: query,
      p_limite: limite,
      p_colecao_ids: colecaoIds,
    })
    for (const e of (exatas ?? []) as LinhaExata[]) {
      const chave = `${e.transcricao_id}:${Math.round(Number(e.s))}`
      achados.set(chave, {
        transcricao: e.titulo,
        timestamp: fmtDuracao(Number(e.s)),
        link: link(e.transcricao_id, Number(e.s)),
        // O ts_headline devolve <mark>; o modelo não precisa da marcação.
        trecho: e.trecho.replace(/<\/?mark>/g, ""),
        locutor: e.locutor,
        origem: "termo exato",
      })
    }

    if (embeddingsAvailable() && achados.size < limite) {
      const vetor = await embedQuery(query)
      if (vetor) {
        const { data } = await ctx.admin.rpc("transcricoes_busca_semantica", {
          query_embedding: JSON.stringify(vetor),
          p_org_id: ctx.orgId,
          match_count: limite,
          p_colecao_ids: colecaoIds,
          somente_base: true,
        })
        for (const s of (data ?? []) as LinhaSemantica[]) {
          const chave = `${s.transcricao_id}:${Math.round(Number(s.s))}`
          if (achados.has(chave)) continue
          if (achados.size >= limite) break
          achados.set(chave, {
            transcricao: s.titulo,
            timestamp: fmtDuracao(Number(s.s)),
            link: link(s.transcricao_id, Number(s.s)),
            contexto: s.contexto,
            trecho: s.texto.slice(0, 900),
            origem: "significado",
            similaridade: Math.round(Number(s.similaridade) * 100) / 100,
          })
        }
      }
    }

    const lista = [...achados.values()]
    if (!lista.length) return { content: "Nenhum trecho encontrado.", summary: `0 trechos · ${query}` }
    return { content: toolJson(lista), summary: `${lista.length} trechos · ${query}` }
  },
}

const listar: ConnectorTool = {
  label: "Listar transcrições",
  def: {
    type: "function",
    function: {
      name: "transcricoes_listar",
      description:
        "Lista as transcrições disponíveis na base da ConvertIA, com coleção, duração e tópicos detectados. Use para saber O QUE existe antes de procurar dentro; para o conteúdo falado, use transcricoes_buscar.",
      parameters: {
        type: "object",
        properties: {
          colecao: { type: "string", description: "Filtra pelo nome da coleção" },
          limite: { type: "number", description: "Máx. 40 (default 20)" },
        },
        required: [],
      },
    },
  },
  execute: async (args, ctx) => {
    const colecaoIds = await colecoesNaBase(ctx)
    if (!colecaoIds.length) {
      return { content: "Nenhuma coleção marcada como base da ConvertIA.", summary: "sem coleções na base" }
    }
    const limite = Math.min(Math.max(Number(args.limite) || 20, 1), 40)
    const nomeColecao = typeof args.colecao === "string" ? args.colecao.trim().toLowerCase() : null

    const { data: colecoes } = await ctx.admin
      .from("transcricoes_colecoes")
      .select("id, nome")
      .in("id", colecaoIds)
    const porId = new Map(((colecoes ?? []) as Array<{ id: string; nome: string }>).map((c) => [c.id, c.nome]))

    const alvo = nomeColecao
      ? colecaoIds.filter((id) => (porId.get(id) ?? "").toLowerCase().includes(nomeColecao))
      : colecaoIds
    if (!alvo.length) return { content: `Nenhuma coleção com "${args.colecao}" na base.` }

    const { data } = await ctx.admin
      .from("transcricoes")
      .select("id, titulo, canal, duracao_seg, colecao_id, topicos, publicado_em")
      .eq("org_id", ctx.orgId)
      .eq("status", "pronta")
      .in("colecao_id", alvo)
      .order("publicado_em", { ascending: false, nullsFirst: false })
      .limit(limite)

    const itens = ((data ?? []) as Array<{
      id: string
      titulo: string
      canal: string | null
      duracao_seg: number | null
      colecao_id: string | null
      topicos: unknown
      publicado_em: string | null
    }>).map((t) => ({
      titulo: t.titulo,
      colecao: t.colecao_id ? porId.get(t.colecao_id) ?? null : null,
      canal: t.canal,
      duracao: t.duracao_seg != null ? fmtDuracao(t.duracao_seg) : null,
      link: `/admin/transcricoes/${t.id}`,
      topicos: Array.isArray(t.topicos)
        ? (t.topicos as Array<{ s?: number; titulo?: string }>)
            .filter((x) => typeof x?.titulo === "string")
            .map((x) => `${fmtDuracao(Number(x.s ?? 0))} ${x.titulo}`)
        : [],
    }))
    return { content: toolJson(itens), summary: `${itens.length} transcrições` }
  },
}

const ler: ConnectorTool = {
  label: "Ler trecho da transcrição",
  def: {
    type: "function",
    function: {
      name: "transcricoes_ler",
      description:
        "Lê as falas de uma transcrição numa janela de tempo, com locutor e timestamp. Use depois de transcricoes_buscar quando precisar do raciocínio inteiro em volta do trecho, não só do pedaço encontrado.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título (ou parte dele) da transcrição" },
          de_segundos: { type: "number", description: "Início da janela (default 0)" },
          ate_segundos: { type: "number", description: "Fim da janela (default: início + 300)" },
        },
        required: ["titulo"],
      },
    },
  },
  execute: async (args, ctx) => {
    const titulo = String(args.titulo ?? "").trim()
    if (!titulo) return { content: "Informe o título." }
    const colecaoIds = await colecoesNaBase(ctx)
    if (!colecaoIds.length) return { content: "Nenhuma coleção marcada como base da ConvertIA." }

    const { data: achadas } = await ctx.admin
      .from("transcricoes")
      .select("id, titulo, duracao_seg")
      .eq("org_id", ctx.orgId)
      .eq("status", "pronta")
      .in("colecao_id", colecaoIds)
      // `%` e `_` do termo digitado são curingas do LIKE e casariam demais.
      .ilike("titulo", `%${titulo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
      .limit(4)
    const lista = (achadas ?? []) as Array<{ id: string; titulo: string; duracao_seg: number | null }>
    if (!lista.length) return { content: `Nenhuma transcrição com "${titulo}" na base.` }
    if (lista.length > 1) {
      // Ambíguo: devolver o primeiro palpite faria a IA citar a aula errada.
      return {
        content: toolJson({
          ambiguo: true,
          candidatas: lista.map((t) => t.titulo),
          instrucao: "Chame de novo com o título completo de uma das candidatas.",
        }),
        summary: `${lista.length} candidatas`,
      }
    }

    const alvo = lista[0]
    const de = Math.max(0, Number(args.de_segundos) || 0)
    const ate = Number(args.ate_segundos) || de + 300

    const { data: blocos } = await ctx.admin
      .from("transcricoes_blocos")
      .select("s, texto, locutor")
      .eq("transcricao_id", alvo.id)
      .gte("s", de)
      .lte("s", ate)
      .order("s", { ascending: true })
      .limit(400)

    const { data: locutores } = await ctx.admin
      .from("transcricoes_locutores")
      .select("rotulo_original, nome")
      .eq("transcricao_id", alvo.id)
    const nomes = new Map(
      ((locutores ?? []) as Array<{ rotulo_original: string; nome: string }>).map((l) => [l.rotulo_original, l.nome]),
    )

    const falas = ((blocos ?? []) as Array<{ s: number; texto: string; locutor: string | null }>).map((b) => ({
      timestamp: fmtDuracao(Number(b.s)),
      link: link(alvo.id, Number(b.s)),
      locutor: b.locutor ? nomes.get(b.locutor) ?? b.locutor : null,
      texto: b.texto,
    }))

    return {
      content: toolJson({ transcricao: alvo.titulo, de: fmtDuracao(de), ate: fmtDuracao(ate), falas }),
      summary: `${falas.length} falas · ${alvo.titulo}`,
    }
  },
}

export function buildTranscricoesConnector(): ResolvedConnector {
  return { key: TRANSCRICOES_CONNECTOR_KEY, name: "Transcrições", tools: [buscar, listar, ler] }
}

/**
 * Bloco do system prompt: quantas transcrições estão na base e em que
 * coleções. Sem esse inventário o modelo não sabe que a fonte existe e
 * nunca chama a tool.
 */
export async function blocoTranscricoes(
  admin: ConnectorToolContext["admin"],
  orgId: string,
): Promise<{ bloco: string; disponivel: boolean }> {
  const { data: colecoes } = await admin
    .from("transcricoes_colecoes")
    .select("id, nome")
    .eq("org_id", orgId)
    .eq("na_base_de_conhecimento", true)
  const naBase = (colecoes ?? []) as Array<{ id: string; nome: string }>
  if (!naBase.length) return { bloco: "", disponivel: false }

  const { count } = await admin
    .from("transcricoes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pronta")
    .in(
      "colecao_id",
      naBase.map((c) => c.id),
    )

  const total = count ?? 0
  if (total === 0) return { bloco: "", disponivel: false }

  return {
    disponivel: true,
    bloco: `## Transcrições da casa — ${total} ${total === 1 ? "peça" : "peças"} na base
Aulas, calls e referências viradas texto com timestamp. Use transcricoes_buscar quando a pergunta for sobre o que foi DITO (método explicado numa aula, decisão numa call, argumento de um treino). SEMPRE cite o timestamp e o link que a tool devolve — é o que torna a citação verificável. Coleções: ${naBase.map((c) => c.nome).join(" · ")}`,
  }
}
