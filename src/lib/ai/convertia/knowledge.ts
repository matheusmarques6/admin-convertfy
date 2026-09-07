/**
 * Base de conhecimento no chat — item 9.
 *
 * Dois usos:
 *   - ADVISORS: notas da pasta de advisors ligadas no composer entram
 *     no bloco ESTÁVEL do system prompt como personas ("responda como
 *     este advisor responderia") — cacheáveis, mudam só quando o
 *     usuário troca a seleção;
 *   - CONECTOR "Conhecimento": tools de busca (semântica + full-text),
 *     leitura da nota com as CONEXÕES (links de saída, backlinks,
 *     tags — o grafo do Obsidian) e listagem por pasta. O modelo navega
 *     o vault como uma pessoa navega no Obsidian.
 *
 * Só nota ativa (status aprovado). Degrada sem a migration 20261115
 * (conector fora, bloco vazio) e sem embeddings (busca full-text).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ConnectorTool, ResolvedConnector } from "@/lib/ai/connectors/types"
import { toolJson } from "@/lib/ai/connectors/types"
import { logger } from "@/lib/logger"
import { embedQuery, embeddingsAvailable } from "./knowledge-embeddings"
import { fileTitle, normalizeNoteName } from "./knowledge-parse"

const log = logger.child("ConvertiaKnowledge")

const MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202"])
/**
 * A persona inteira precisa caber. A do Max tem ~15k caracteres e o corte
 * em 7k comia justamente o fim — "o que ele NUNCA diria" e os limites da
 * persona, que são a parte que impede o clone de inventar. Cortar uma
 * persona pela metade é pior que não ligar o advisor: sobra o tom sem as
 * restrições.
 */
const ADVISOR_MAX_CHARS = 18_000
const NOTE_MAX_CHARS = 12_000
/** Teto do catálogo: 122 notas do Max cabem folgadas; corta antes de virar prompt. */
const CATALOG_MAX_NOTES = 400

export const KNOWLEDGE_CONNECTOR_KEY = "conhecimento"

interface NoteRow {
  id: string
  path: string
  title: string
  folder: string
  kind: string
  tags: string[]
  links: string[]
  aliases: string[]
  excerpt: string | null
  body_md?: string
}

export interface KnowledgeForPrompt {
  block: string
  connector: ResolvedConnector | null
  advisors: Array<{ path: string; title: string }>
}

const NOTE_COLS = "id, path, title, folder, kind, tags, links, aliases, excerpt"

export async function loadKnowledgeForPrompt(
  admin: SupabaseClient,
  _orgId: string,
  advisorPaths: string[],
  opts: { enabled?: boolean } = {},
): Promise<KnowledgeForPrompt> {
  const empty: KnowledgeForPrompt = { block: "", connector: null, advisors: [] }
  try {
    const { count, error } = await admin
      .from("ai_knowledge_notes")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
    if (error) {
      if (!MISSING.has(error.code ?? "")) log.warn("contagem da base falhou", { error: error.message })
      return empty
    }
    const active = count ?? 0
    const parts: string[] = []
    const advisors: Array<{ path: string; title: string }> = []

    if (advisorPaths.length > 0) {
      const { data } = await admin
        .from("ai_knowledge_notes")
        .select(`${NOTE_COLS}, body_md`)
        .eq("is_active", true)
        .eq("kind", "advisor")
        .in("path", advisorPaths.slice(0, 10))
      for (const a of (data ?? []) as NoteRow[]) {
        advisors.push({ path: a.path, title: a.title })
        parts.push(
          `### Advisor: ${a.title}\nResponda como ${a.title} responderia — use o método, os critérios e o vocabulário abaixo quando o tema for da alçada dele; cite-o quando aplicar uma regra dele.\n${(a.body_md ?? "").slice(0, ADVISOR_MAX_CHARS)}`,
        )
        // A persona diz COMO ele responde; o catálogo diz o que ele já
        // escreveu. Sem o segundo, o modelo imita o tom e inventa o conteúdo.
        const catalogo = await advisorCatalog(admin, a)
        if (catalogo) parts.push(catalogo)
      }
    }

    const enabled = opts.enabled !== false && active > 0
    if (enabled) {
      // Índice = a ÁRVORE (advisors + pastas soltas), não a lista chapada de
      // caminhos: com tudo sob `Advisors/Max/...` a lista virava 12 linhas
      // repetindo o mesmo prefixo e nenhuma dizia que existe um advisor.
      const { advisors: arvore, outrasPastas } = await knowledgeOverview(admin)
      const linhas: string[] = []
      for (const a of arvore) {
        const subs = a.pastas.map((p) => `${p.pasta} (${p.notas})`).join(", ")
        linhas.push(`- Advisor **${a.advisor}**: ${a.notas} notas em ${a.base}/ — ${subs || "sem subpastas"}`)
      }
      for (const p of outrasPastas) linhas.push(`- ${p.pasta}: ${p.notas} nota${p.notas === 1 ? "" : "s"}`)
      parts.unshift(
        `## Base de conhecimento da casa (Obsidian) — ${active} notas aprovadas\nUse as tools conhecimento_buscar / conhecimento_ler / conhecimento_listar ANTES de responder sobre método, copy, popups, flows, ofertas e processos da Convertfy: a base é a autoridade sobre COMO a casa faz. Siga os links entre notas (a leitura devolve conexões) quando a resposta pedir contexto.\n${linhas.slice(0, 60).join("\n")}`,
      )
    }

    return {
      block: parts.join("\n\n"),
      connector: enabled ? buildConhecimentoConnector(admin) : null,
      advisors,
    }
  } catch (err) {
    log.warn("base de conhecimento indisponível", { error: err instanceof Error ? err.message : String(err) })
    return empty
  }
}

/** Um advisor e a forma da biblioteca dele. */
interface AdvisorTree {
  advisor: string
  persona: string
  base: string
  notas: number
  pastas: Array<{ pasta: string; notas: number; prefixo: string }>
}

/**
 * A forma da base: cada advisor com as pastas dele + as pastas que não são de
 * advisor nenhum. É a MESMA função no prompt e na tool de listagem — servir
 * mapas diferentes nos dois lugares é como o modelo passa a pedir pasta que
 * não existe.
 *
 * Existe porque a listagem antiga agrupava pelo PRIMEIRO segmento do caminho:
 * com tudo sob `Advisors/`, a raiz devolvia uma linha só ("Advisors: 123
 * notas") e o modelo não tinha por onde começar.
 */
export async function knowledgeOverview(
  admin: SupabaseClient,
): Promise<{ advisors: AdvisorTree[]; outrasPastas: Array<{ pasta: string; notas: number }> }> {
  const { data } = await admin
    .from("ai_knowledge_notes")
    .select("path, title, folder, kind")
    .eq("is_active", true)
    .order("path")
    .limit(5000)
  const rows = (data ?? []) as Array<{ path: string; title: string; folder: string; kind: string }>

  const advisors: AdvisorTree[] = rows
    .filter((r) => r.kind === "advisor")
    .map((r) => ({ advisor: r.title, persona: r.path, base: r.folder, notas: 0, pastas: [] }))
  // Base mais longa primeiro: `Advisors/Max/copy` pertence ao Max, não a um
  // advisor de nota única que more em `Advisors/`.
  const porBase = [...advisors].sort((a, b) => b.base.length - a.base.length)
  const contagem = new Map<string, Map<string, number>>()
  const outras = new Map<string, number>()

  for (const r of rows) {
    if (r.kind === "advisor") continue
    const dono = porBase.find((a) => r.folder === a.base || r.folder.startsWith(`${a.base}/`))
    if (!dono) {
      const topo = r.folder.split("/")[0] || "(raiz)"
      outras.set(topo, (outras.get(topo) ?? 0) + 1)
      continue
    }
    dono.notas += 1
    const sub = r.folder === dono.base ? "(raiz)" : r.folder.slice(dono.base.length + 1).split("/")[0]
    const m = contagem.get(dono.persona) ?? new Map<string, number>()
    m.set(sub, (m.get(sub) ?? 0) + 1)
    contagem.set(dono.persona, m)
  }
  for (const a of advisors) {
    a.pastas = [...(contagem.get(a.persona) ?? new Map())]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([pasta, notas]) => ({
        pasta,
        notas,
        prefixo: pasta === "(raiz)" ? a.base : `${a.base}/${pasta}`,
      }))
  }
  return {
    advisors,
    outrasPastas: [...outras.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([pasta, notas]) => ({ pasta, notas })),
  }
}

/**
 * Catálogo do advisor ligado: TODAS as notas dele, agrupadas por pasta, só
 * nome. Custa ~800 tokens para as 122 notas do Max e mora no bloco estável
 * (cacheado). É o que substitui adivinhar palavra-chave: com o mapa à vista,
 * o modelo escolhe pelo nome e lê. Sem catálogo, uma busca full-text que não
 * casa radical devolve zero e ele responde de memória — em silêncio.
 */
async function advisorCatalog(admin: SupabaseClient, advisor: { title: string; folder: string }): Promise<string> {
  const base = advisor.folder
  if (!base) return ""
  const { data } = await admin
    .from("ai_knowledge_notes")
    .select("path, title, folder")
    .eq("is_active", true)
    .eq("kind", "nota")
    .or(`folder.eq.${pgQuote(base)},folder.like.${pgQuote(`${base}/%`)}`)
    .order("path")
    .limit(CATALOG_MAX_NOTES)
  const rows = (data ?? []) as Array<{ path: string; title: string; folder: string }>
  if (rows.length === 0) return ""

  const grupos = new Map<string, string[]>()
  for (const r of rows) {
    const sub = r.folder === base ? "(raiz)" : r.folder.slice(base.length + 1)
    const g = grupos.get(sub) ?? []
    g.push(r.title)
    grupos.set(sub, g)
  }
  const corpo = [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pasta, titulos]) => `**${pasta}/** (${titulos.length}) — ${titulos.join(" · ")}`)
    .join("\n")
  return (
    `### Biblioteca de ${advisor.title} — ${rows.length} notas\n` +
    `É tudo que existe escrito dele, agrupado por pasta. Escolha pelo nome e leia a nota ` +
    `inteira com \`conhecimento_ler\` (caminho = \`${base}/<pasta>/<nome-com-hifens>.md\`, ou passe só o nome). ` +
    `Se o tema tem nota aqui, a resposta sai da nota — não da sua memória.\n${corpo}`
  )
}

function slim(n: NoteRow) {
  return {
    path: n.path,
    titulo: n.title,
    pasta: n.folder,
    tipo: n.kind,
    tags: n.tags,
    resumo: n.excerpt,
  }
}

async function findNote(admin: SupabaseClient, ref: string): Promise<NoteRow | null> {
  const clean = ref.replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim()
  // 1) path exato
  const byPath = await admin.from("ai_knowledge_notes").select(`${NOTE_COLS}, body_md`).eq("path", clean).eq("is_active", true).maybeSingle()
  if (byPath.data) return byPath.data as NoteRow
  // 2) título/alias (normalizado, como o Obsidian resolve)
  const norm = normalizeNoteName(clean.split("/").pop() ?? clean)
  const name = clean.split("/").pop() ?? clean
  const { data } = await admin
    .from("ai_knowledge_notes")
    .select(`${NOTE_COLS}, body_md`)
    .eq("is_active", true)
    .or(
      [
        `title.ilike.${pgQuote(name)}`,
        `path.ilike.${pgQuote(`%/${name}.md`)}`,
        `path.ilike.${pgQuote(`${name}.md`)}`,
        `aliases.cs.{${pgQuote(norm)}}`,
      ].join(","),
    )
    .limit(5)
  const rows = (data ?? []) as NoteRow[]
  if (rows.length === 0) return null
  return rows.find((r) => normalizeNoteName(r.title) === norm) ?? rows[0]
}

/**
 * Valor para dentro de um `.or()` do PostgREST: aspas duplas protegem
 * vírgula, parêntese, ponto e espaço (título de nota tem tudo isso).
 */
function pgQuote(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

export function buildConhecimentoConnector(admin: SupabaseClient): ResolvedConnector {
  const buscar: ConnectorTool = {
    label: "Buscar na base de conhecimento",
    def: {
      type: "function",
      function: {
        name: "conhecimento_buscar",
        description:
          "Busca notas da base de conhecimento da Convertfy (Obsidian) por significado e por palavras — método da casa, copy, popups, flows, ofertas, processos, advisors. Devolve caminho, título, pasta, tags e resumo; leia a nota inteira com conhecimento_ler. Use ANTES de responder sobre 'como a Convertfy faz X'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "O que procurar, em linguagem natural" },
            pasta: { type: "string", description: "Restringe a uma pasta (ex.: 'Popups', 'Advisors')" },
            limite: { type: "number", description: "Máx. 12 (default 6)" },
          },
          required: ["query"],
        },
      },
    },
    execute: async (args) => {
      const query = String(args.query ?? "").trim()
      if (!query) return { content: "Query vazia." }
      const limit = Math.min(Math.max(Number(args.limite) || 6, 1), 12)
      const pasta = typeof args.pasta === "string" && args.pasta.trim() ? args.pasta.trim().replace(/\/+$/, "") : null
      const results = new Map<string, Record<string, unknown> & { _score: number }>()

      // semântica
      let semantic = 0
      if (embeddingsAvailable()) {
        const vec = await embedQuery(query)
        if (vec) {
          const { data, error } = await admin.rpc("ai_knowledge_search", {
            query_embedding: JSON.stringify(vec),
            match_count: limit,
            folder_prefix: pasta,
          })
          if (!error) {
            for (const r of (data ?? []) as Array<NoteRow & { similarity: number }>) {
              semantic++
              results.set(r.path, { ...slim(r), similaridade: Math.round(r.similarity * 100) / 100, _score: r.similarity })
            }
          }
        }
      }
      // full-text (sempre — completa a semântica e é o fallback)
      let q = admin
        .from("ai_knowledge_notes")
        .select(NOTE_COLS)
        .eq("is_active", true)
        .textSearch("search", query, { type: "websearch", config: "portuguese" })
        .limit(limit)
      if (pasta) q = q.or(`folder.eq.${pgQuote(pasta)},folder.like.${pgQuote(`${pasta}/%`)}`)
      const ft = await q
      for (const r of (ft.data ?? []) as NoteRow[]) {
        const prev = results.get(r.path)
        if (prev) prev._score += 0.2
        else results.set(r.path, { ...slim(r), _score: 0.5 })
      }
      const list = [...results.values()]
        .sort((a, b) => b._score - a._score)
        .slice(0, limit)
        .map(({ _score, ...rest }) => rest)
      if (list.length === 0) {
        return { content: "Nenhuma nota encontrada. Tente outros termos ou conhecimento_listar para ver as pastas.", summary: "0 notas" }
      }
      return {
        content: toolJson({ busca: semantic > 0 ? "semântica + texto" : "texto", notas: list }),
        summary: `${list.length} nota${list.length === 1 ? "" : "s"}`,
      }
    },
  }

  const ler: ConnectorTool = {
    label: "Ler nota com conexões",
    def: {
      type: "function",
      function: {
        name: "conhecimento_ler",
        description:
          "Lê uma nota inteira da base de conhecimento e devolve as CONEXÕES dela no grafo do Obsidian: notas que ela cita (links de saída), notas que a citam (backlinks) e tags. Aceita o caminho (de conhecimento_buscar), o título ou um wikilink [[Nome]]. Siga os links quando precisar de mais contexto.",
        parameters: {
          type: "object",
          properties: { nota: { type: "string", description: "Caminho, título ou [[wikilink]]" } },
          required: ["nota"],
        },
      },
    },
    execute: async (args) => {
      const ref = String(args.nota ?? "").trim()
      if (!ref) return { content: "Informe a nota." }
      const note = await findNote(admin, ref)
      if (!note) return { content: `Nota "${ref}" não encontrada (ou não aprovada). Use conhecimento_buscar.`, summary: "não encontrada" }
      // O Obsidian resolve [[link]] pelo NOME DO ARQUIVO (ou alias) — os
      // wikilinks ficam gravados assim; o título do frontmatter/H1 pode
      // ser outro. As duas direções usam a mesma chave.
      const myNames = [normalizeNoteName(fileTitle(note.path)), ...note.aliases].filter(Boolean)
      type Lite = { path: string; title: string; folder: string; aliases: string[] }
      const [all, backlinks] = await Promise.all([
        note.links.length > 0
          ? admin.from("ai_knowledge_notes").select("path, title, folder, aliases").eq("is_active", true).limit(3000)
          : Promise.resolve({ data: [] as Lite[] }),
        admin
          .from("ai_knowledge_notes")
          .select("path, title, folder")
          .eq("is_active", true)
          .overlaps("links", myNames)
          .neq("path", note.path)
          .limit(40),
      ])
      const wanted = new Set(note.links)
      const resolved: Lite[] = []
      const resolvedKeys = new Set<string>()
      for (const r of (all.data ?? []) as Lite[]) {
        if (r.path === note.path) continue
        const keys = [normalizeNoteName(fileTitle(r.path)), ...(r.aliases ?? [])]
        const hit = keys.find((k) => wanted.has(k))
        if (hit) {
          resolved.push(r)
          for (const k of keys) resolvedKeys.add(k)
        }
      }
      const unresolved = note.links.filter((l) => !resolvedKeys.has(l))
      const body = (note.body_md ?? "").slice(0, NOTE_MAX_CHARS)
      return {
        content: toolJson({
          ...slim(note),
          conteudo: body + ((note.body_md ?? "").length > NOTE_MAX_CHARS ? "\n…(truncado)" : ""),
          conexoes: {
            cita: resolved.map((r) => ({ path: r.path, titulo: r.title })),
            citada_por: ((backlinks.data ?? []) as Array<{ path: string; title: string }>).map((r) => ({ path: r.path, titulo: r.title })),
            links_sem_nota: unresolved,
            tags: note.tags,
          },
        }, 16_000),
        summary: note.title,
      }
    },
  }

  const listar: ConnectorTool = {
    label: "Listar pasta da base",
    def: {
      type: "function",
      function: {
        name: "conhecimento_listar",
        description:
          "Lista as notas de uma pasta da base de conhecimento (ou as pastas da raiz quando sem pasta). Use para navegar quando não sabe o que buscar.",
        parameters: {
          type: "object",
          properties: { pasta: { type: "string", description: "Ex.: 'Popups' ou 'Advisors'. Vazio = raiz" } },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const pasta = typeof args.pasta === "string" ? args.pasta.trim().replace(/\/+$/, "") : ""
      let q = admin.from("ai_knowledge_notes").select(NOTE_COLS).eq("is_active", true).order("path").limit(200)
      if (pasta) q = q.or(`folder.eq.${pgQuote(pasta)},folder.like.${pgQuote(`${pasta}/%`)}`)
      const { data } = await q
      const rows = (data ?? []) as NoteRow[]
      if (!pasta) {
        // Árvore, não contagem pelo 1º segmento: com tudo sob `Advisors/` a
        // resposta antiga era uma linha ("Advisors: 123 notas") e o modelo
        // não tinha por onde entrar. Cada pasta vem com o `prefixo` pronto
        // para ser devolvido nesta mesma tool.
        const { advisors: arvore, outrasPastas } = await knowledgeOverview(admin)
        return {
          content: toolJson({
            advisors: arvore,
            outras_pastas: outrasPastas,
            raiz: rows.filter((r) => !r.folder).map(slim),
          }),
          summary: `${arvore.length} advisor${arvore.length === 1 ? "" : "s"} · ${outrasPastas.length} pastas`,
        }
      }
      return { content: toolJson({ pasta, notas: rows.map(slim) }), summary: `${rows.length} notas` }
    },
  }

  return {
    key: KNOWLEDGE_CONNECTOR_KEY,
    name: "Conhecimento",
    tools: [buscar, ler, listar],
    guidance:
      "A base de conhecimento é o método da Convertfy escrito pela equipe: quando a pergunta for sobre COMO fazer (copy, popup, flow, oferta, processo) ou sobre um advisor, busque nela antes de responder de memória e cite a nota usada (título). Siga os links entre notas quando a resposta pedir contexto; uma busca + uma ou duas leituras costuma bastar.",
  }
}

/** Advisors disponíveis para o composer (bootstrap). */
export async function listAdvisors(admin: SupabaseClient): Promise<Array<{ path: string; title: string; excerpt: string | null }>> {
  const { data, error } = await admin
    .from("ai_knowledge_notes")
    .select("path, title, excerpt")
    .eq("is_active", true)
    .eq("kind", "advisor")
    .order("title")
    .limit(50)
  if (error) return []
  return (data ?? []) as Array<{ path: string; title: string; excerpt: string | null }>
}
