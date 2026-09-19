/**
 * Conector "Internet" — buscar na web e abrir uma página, o par que o
 * Claude oferece e que faltava aqui.
 *
 *   web_buscar(query)  → lista de resultados com título, link e trecho
 *   web_abrir(url)     → o texto legível da página, com os links dela
 *
 * Três decisões que não podem ser afrouxadas:
 *
 * 1. **A URL é escolhida pelo MODELO.** Toda leitura passa por
 *    `checarUrlPublica`, e cada redirecionamento é checado de novo — um
 *    host público pode responder 302 para 169.254.169.254 e as
 *    credenciais do runtime sairiam no corpo da resposta.
 *
 * 2. **Conteúdo de site é DADO, nunca instrução.** O texto vem embrulhado
 *    e rotulado: qualquer "ignore as instruções anteriores" numa página é
 *    texto que a IA está LENDO, não ordem que ela recebeu. Sem o rótulo,
 *    abrir uma página vira um canal de injeção de prompt.
 *
 * 3. **A web não é a base da casa.** O método da Convertfy está no vault;
 *    a internet é contexto externo. O prompt do conector diz isso, senão
 *    um post aleatório passa a valer tanto quanto a doutrina escrita.
 */

import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"
import { checarUrlPublica } from "@/lib/ai/web/web-guard"
import { baixarPagina } from "@/lib/ai/web/baixar-pagina"
import { extrairPagina } from "@/lib/ai/web/web-extract"
import { buscarNaWeb } from "@/lib/ai/web/web-search"
import { logger } from "@/lib/logger"
import { comoDadoExterno } from "@/lib/ai/web/dado-externo"

const log = logger.child("ConectorWeb")

export const WEB_CONNECTOR_KEY = "web"

// O fetch com a régua de SSRF mora em `lib/ai/web/baixar-pagina.ts` (Passo
// 16): a captura de políticas da loja usa o MESMO caminho.

// `comoDadoExterno` mora em `lib/ai/web/dado-externo.ts` desde 19/09: os
// agentes de e-mail embrulham a pesquisa e as políticas com o MESMO envelope.

export function buildWebConnector(): ResolvedConnector {
  const buscar: ConnectorTool = {
    label: "Buscar na internet",
    def: {
      type: "function",
      function: {
        name: "web_buscar",
        description:
          "Busca na internet e devolve título, link e trecho dos resultados. Use para fato externo e atual — notícia, concorrente, preço, documentação de ferramenta, tendência de mercado. NÃO use para 'como a Convertfy faz X': isso está na base de conhecimento (conhecimento_buscar). Depois de buscar, abra a página com web_abrir quando precisar do conteúdo inteiro.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "O que procurar, em linguagem natural" },
            quantidade: { type: "number", description: "Máx. 10 (default 5)" },
          },
          required: ["query"],
        },
      },
    },
    execute: async (args) => {
      const query = String(args.query ?? "").trim()
      const limite = Math.min(Math.max(Number(args.quantidade) || 5, 1), 10)
      const r = await buscarNaWeb(query, { limite })
      if (!r.ok) {
        return {
          content: r.motivo,
          summary: r.naoConfigurado ? "busca não configurada" : "busca falhou",
        }
      }
      if (r.resultados.length === 0) {
        return {
          content:
            `Nenhum resultado para "${query}". Tente outros termos. Se continuar vazio, DIGA que não ` +
            `encontrou — não responda de memória apresentando como se fosse resultado de busca.`,
          summary: "0 resultados",
        }
      }
      return {
        content: comoDadoExterno(
          `busca: ${query}`,
          toolJson({ provedor: r.provedor, resultados: r.resultados }),
        ),
        summary: `${r.resultados.length} resultados · ${r.provedor}`,
      }
    },
  }

  const abrir: ConnectorTool = {
    label: "Abrir página",
    def: {
      type: "function",
      function: {
        name: "web_abrir",
        description:
          "Abre uma página da internet e devolve o texto dela e os links que ela contém. Use depois de web_buscar, ou direto quando o usuário mandar um link. Cite sempre a URL na resposta. Se a página não abrir, diga isso — não descreva o conteúdo de memória.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL completa (https://…)" },
          },
          required: ["url"],
        },
      },
    },
    execute: async (args) => {
      const bruta = String(args.url ?? "").trim()
      const check = checarUrlPublica(bruta)
      if (!check.ok) return { content: check.motivo, summary: "URL recusada" }

      const r = await baixarPagina(check.url)
      if (!r.ok) {
        log.info("página não lida", { url: check.url.toString(), motivo: r.motivo })
        return { content: r.motivo, summary: "não abriu" }
      }

      if (r.tipo === "json" || r.tipo === "texto") {
        const corpo = r.corpo.slice(0, 12_000)
        return {
          content: comoDadoExterno(r.url, corpo),
          summary: `${r.tipo} · ${r.corpo.length > 12_000 ? "cortado" : "completo"}`,
        }
      }

      const p = extrairPagina(r.corpo, { baseUrl: r.url })
      return {
        content: comoDadoExterno(
          r.url,
          toolJson({
            url: r.url,
            titulo: p.titulo,
            descricao: p.descricao || undefined,
            texto: p.texto,
            // O modelo precisa saber que viu só um pedaço, senão conclui a
            // partir de meia página achando que leu tudo.
            truncado: p.truncado || undefined,
            links: p.links.length > 0 ? p.links : undefined,
          }),
        ),
        summary: p.titulo || r.url,
      }
    },
  }

  return {
    key: WEB_CONNECTOR_KEY,
    name: "Internet",
    tools: [buscar, abrir],
    guidance:
      "Você tem acesso à internet: `web_buscar` para procurar e `web_abrir` para ler uma página. " +
      "Use para fato EXTERNO e atual (concorrente, notícia, preço, documentação, tendência) e SEMPRE " +
      "cite o link do que usou. A internet NÃO substitui a base de conhecimento da casa: sobre " +
      "método, copy, popups, flows e processos da Convertfy, a autoridade é `conhecimento_buscar`. " +
      "Quando a busca ou a página falhar, diga o que aconteceu em vez de responder de memória como " +
      "se tivesse consultado.",
  }
}
