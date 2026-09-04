/**
 * Conector "Omnisend" — MCP da loja sobre a omnisend_api_key dela.
 *
 * Leitura: as 8 tools do ritual chat (OMNISEND_TOOLS/executeOmnisendTool,
 * já batalhadas em produção), com o schema Anthropic convertido pro
 * formato OpenAI/OpenRouter.
 *
 * EXECUÇÃO (write): ações de maior valor do catálogo público da
 * Omnisend (validado contra o catálogo real da API 2026-03-15) —
 * contatos/tags, ligar/desligar automação, copiar/editar/testar/enviar/
 * cancelar campanha — mais o escape-hatch `omnisend_operacao`, que
 * expõe QUALQUER operação do catálogo (GET/POST/PATCH/PUT; DELETE fora
 * de propósito). O guard de uso é o contrato do system prompt: tools
 * EXECUTA só com pedido explícito do usuário.
 */

import {
  OMNISEND_TOOLS,
  executeOmnisendTool,
} from "@/lib/integrations/omnisend/ritual-tools"
import { OmnisendApiError, omnisendRequest } from "@/lib/integrations/omnisend/client"
import { searchOmnisendOperations } from "@/lib/integrations/omnisend/operation-catalog"
import {
  getOmnisendDoc,
  OMNISEND_DOC_MAX_CHARS,
  operationsWithDoc,
  suggestOmnisendDocs,
} from "@/lib/integrations/omnisend/operation-docs"
import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"

/**
 * O que o modelo precisa saber para OPERAR o Omnisend, não só ler.
 * Vai para o system prompt quando o conector está ativo.
 */
const OMNISEND_GUIDANCE = [
  "Fluxo obrigatório para qualquer criação/edição: omnisend_catalogo (descobrir a operação) → omnisend_doc(nome) (ler o guia: campos obrigatórios, receita de payload, erros) → omnisend_operacao (executar). Montar body sem ler o guia é chute — e chute vira 400.",
  "Formulários/popups (inclui ROLETA): NÃO escreva o `content` do zero. Parta de um template: get_form_templates(displayType=popup) → get_template_id → adapte o `content` (a roleta é o bloco `wheelOfFortune`, com `slices` 3–20 e `pointerColor`; a oferta usa o bloco `discount` com type `wheelOfFortune`) → post_forms → post_forms_form_id_render (preview) → post_forms_form_id_enable.",
  "A/B de popup: post_form_ab_setups a partir do popup atual cria as DUAS variantes como cópias; edite a variante B com patch_form_id (versions[].formID de get_ab_setup_id) — não crie um segundo formulário avulso. Inicie com post_form_ab_setups_ab_setup_id_start; compare TAXAS (submits/views) em get_forms_form_id_ab_setup_reports.",
  "Campanha de email exige templateID de um template existente (get_email_templates) já na criação; senderEmail/replyToEmail ficam de fora salvo endereço explícito do usuário; language só com código exato (pt_BR). Envio real (post_campaigns_id_send) é irreversível: confirme nomeando a campanha e prefira post_campaigns_id_test_email antes.",
  "Automação: leia omnisend_doc('automation_content') — abandono de carrinho/checkout exige seção product_cart_recovery no template; confirmação de pedido exige os blocos orderSummary/orderProducts/orderTotal; oferta de desconto é bloco `discount`, nunca texto com o código.",
  "Um 400/422 do Omnisend é PAYLOAD ERRADO, não recurso inexistente: leia a mensagem, releia o guia e refaça. Só afirme que algo não existe depois de olhar o catálogo e o guia.",
  "Analytics: post_analytics_reports (por data de ENVIO, igual à UI) para performance de campanha/automação; post_analytics_statistics (por data do EVENTO) para receita total da loja e crescimento de lista. Nunca misture os dois na mesma conta. Limite: 10/min e 55/dia por marca.",
].join("\n")

function writeTool(
  name: string,
  label: string,
  description: string,
  parameters: Record<string, unknown>,
  run: (args: Record<string, unknown>) => Promise<{ content: string; summary?: string }>,
  /** Gate de confirmação da UI para ação IRREVERSÍVEL (ver ConnectorTool.confirm). */
  confirm?: (args: Record<string, unknown>) => string | null,
): ConnectorTool {
  return {
    label,
    write: true,
    ...(confirm ? { confirm } : {}),
    def: { type: "function", function: { name, description, parameters } },
    execute: run,
  }
}

/**
 * Operações do catálogo que passam pelo gate de confirmação: DELETE de
 * qualquer recurso e o envio real de campanha. Agendar, pausar, editar
 * rascunho e criar são reversíveis — executam direto.
 */
export function omnisendOperationNeedsConfirmation(method: string, path: string): string | null {
  const m = method.toUpperCase()
  if (m === "DELETE") return `Excluir definitivamente o recurso ${path} no Omnisend`
  if (m === "POST" && /\/campaigns\/[^/]+\/send\/?$/.test(path)) {
    return `Enviar a campanha ${path.split("/")[3]} para a lista REAL no Omnisend (irreversível)`
  }
  return null
}

export function buildOmnisendConnector(apiKey: string): ResolvedConnector {
  const readTools: ConnectorTool[] = OMNISEND_TOOLS.map((t) => ({
    label: t.name.replace(/^omnisend_/, "").replace(/_/g, " "),
    def: {
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? t.name,
        parameters: (t.input_schema as unknown as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      },
    },
    execute: async (args) => {
      const content = await executeOmnisendTool(t.name, args, apiKey)
      return { content }
    },
  }))

  const call = async (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ) => {
    const res = await omnisendRequest<unknown>(apiKey, path, {
      method,
      body,
      logTag: "ConvertIA",
      // A recusa da API precisa CHEGAR ao modelo. Sem isto, um 400 de
      // validação virava `null` → `{}` na tool, e ele concluía que a
      // operação não existia (caso real: criar formulário/popup).
      throwOnError: true,
    })
    return res
  }

  /**
   * Executa devolvendo texto legível para o modelo. Erro da API vira
   * instrução acionável — status, corpo do Omnisend e a ordem de
   * corrigir o payload em vez de declarar impossibilidade.
   */
  const runCall = async (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body: Record<string, unknown> | undefined,
    okSummary: string,
  ): Promise<{ content: string; summary?: string }> => {
    try {
      const res = await call(method, path, body)
      return {
        content:
          res === null || res === undefined
            ? `OK — ${method} ${path} respondeu sucesso sem corpo (204).`
            : toolJson(res, 8000),
        summary: okSummary,
      }
    } catch (err) {
      if (err instanceof OmnisendApiError) {
        return {
          content: [
            `A API do Omnisend RECUSOU a chamada: HTTP ${err.status} em ${method} ${path}.`,
            `Resposta do Omnisend: ${err.body.slice(0, 1500) || "(sem corpo)"}`,
            err.status === 400 || err.status === 422
              ? `Isso é payload inválido, NÃO ausência do recurso: leia os campos apontados acima, chame omnisend_doc("${method} ${path.replace(/\/[0-9a-f]{24}(?=\/|$)/g, "/{id}")}") para ver os campos obrigatórios e a receita, corrija o corpo e chame de novo. Não conclua que a operação não existe.`
              : err.status === 404
                ? "Confira se o path e os {params} estão certos (use omnisend_catalogo) antes de concluir qualquer coisa."
                : err.status === 409
                  ? "Conflito de ESTADO do recurso (ex.: campanha não é rascunho, formulário já tem A/B): leia o guia da operação em omnisend_doc — ele diz o que fazer para cada tipo de 409. Não repita a mesma chamada."
                  : "Reveja a chamada antes de concluir qualquer coisa sobre limitação da plataforma.",
          ].join("\n"),
          summary: `HTTP ${err.status}`,
        }
      }
      return {
        content: `Falha ao chamar ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
        summary: "erro",
      }
    }
  }

  // O "search" do padrão MCP da Omnisend: descobre a operação no
  // catálogo embutido, lê o guia com omnisend_doc, executa via
  // omnisend_operacao. É o que permite "criar popup", "criar workflow"
  // etc. sem uma tool por endpoint.
  const catalogo: ConnectorTool = {
    label: "Catálogo de operações",
    def: {
      type: "function",
      function: {
        name: "omnisend_catalogo",
        description:
          "Lista as 105 operações da API pública do Omnisend (o mesmo catálogo do MCP oficial): automações/workflows, campanhas, formulários/popups (inclui roleta), A/B de formulário, segmentos, contatos, templates, imagens, analytics. Filtre por texto e/ou ação. Cada linha traz o NOME canônico e se há guia. Fluxo: 1) descubra aqui; 2) omnisend_doc(nome) para ler campos obrigatórios e a receita do payload; 3) execute com omnisend_operacao.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto livre (ex.: 'popup', 'workflow', 'ab')" },
            action: { type: "string", enum: ["query", "create", "update", "delete"] },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const ops = searchOmnisendOperations(
        typeof args.query === "string" ? args.query : undefined,
        typeof args.action === "string" ? args.action : undefined,
      )
      const withDoc = operationsWithDoc()
      // Uma linha por operação: mais denso que JSON e cabe inteiro.
      const lines = ops.map(
        (o) =>
          `${o.n} · ${o.m} ${o.p} · ${o.s}${withDoc.has(o.n) ? " · [guia: omnisend_doc]" : ""}`,
      )
      const header =
        "nome · METHOD path · descrição · [guia disponível]\nPara criar/editar: leia omnisend_doc(nome) ANTES de montar o body.\n"
      return {
        content: (header + lines.join("\n")).slice(0, 14_000),
        summary: `${ops.length} operações`,
      }
    },
  }

  // O "tool_schema" do padrão MCP da Omnisend: o guia da operação
  // (fluxo recomendado, campos obrigatórios, receitas, erros). É o que
  // faltava quando ela disse que "não existe bloco de roleta".
  const doc: ConnectorTool = {
    label: "Guia da operação",
    def: {
      type: "function",
      function: {
        name: "omnisend_doc",
        description:
          "Devolve o GUIA de uma operação do Omnisend: quando usar, fluxo recomendado passo a passo, campos obrigatórios, receitas de payload em JSON e o significado de cada erro (400/409/422). Chame ANTES de montar qualquer body de criação/edição — e ao receber um 400. Aceita o nome canônico (post_forms), 'METHOD /path' (POST /api/forms) ou um tópico: automation_content (regras por tipo de automação), email_templates (seções/blocos/presets), campaigns, contacts.",
        parameters: {
          type: "object",
          properties: {
            operacao: {
              type: "string",
              description:
                "Nome canônico do omnisend_catalogo (ex.: post_forms, post_form_ab_setups, post_campaigns, post_automations, post_segments) ou 'POST /api/forms' ou tópico (automation_content, email_templates, campaigns, contacts).",
            },
          },
          required: ["operacao"],
        },
      },
    },
    execute: async (args) => {
      const key = typeof args.operacao === "string" ? args.operacao : ""
      const hit = getOmnisendDoc(key)
      if (hit) {
        return {
          content: hit.markdown.slice(0, OMNISEND_DOC_MAX_CHARS),
          summary: hit.operation ?? hit.key,
        }
      }
      const suggestions = suggestOmnisendDocs(key)
      return {
        content: [
          `Não há guia para "${key}".`,
          suggestions.length > 0
            ? `Operações parecidas: ${suggestions
                .map((s) => `${s.operation} (${s.method} ${s.path})${s.has_doc ? " [guia]" : ""}`)
                .join("; ")}.`
            : "Nenhuma operação parecida no catálogo — confira o nome em omnisend_catalogo.",
          "Sem guia, monte o body pela documentação pública (api-docs.omnisend.com) e trate o 400 como correção de payload, não como impossibilidade.",
        ].join("\n"),
        summary: "sem guia",
      }
    },
  }

  const writeTools: ConnectorTool[] = [
    catalogo,
    doc,
    writeTool(
      "omnisend_upsert_contato",
      "Criar/atualizar contato",
      "EXECUTA: cria ou atualiza um contato no Omnisend (email, nome, tags, consentimento). Use para inscrever alguém ou marcar tags.",
      {
        type: "object",
        properties: {
          email: { type: "string", description: "Email do contato" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          tags: { type: "array", items: { type: "string" }, description: "Tags a aplicar" },
          subscribed: {
            type: "boolean",
            description: "true = canal email como subscribed; false = nonSubscribed",
          },
        },
        required: ["email"],
      },
      async (args) => {
        const res = await call("POST", "/v3/contacts", {
          identifiers: [
            {
              type: "email",
              id: String(args.email),
              channels: {
                email: {
                  status: args.subscribed === false ? "nonSubscribed" : "subscribed",
                  statusDate: new Date().toISOString(),
                },
              },
            },
          ],
          ...(args.first_name ? { firstName: String(args.first_name) } : {}),
          ...(args.last_name ? { lastName: String(args.last_name) } : {}),
          ...(Array.isArray(args.tags) ? { tags: args.tags.map(String) } : {}),
        })
        return {
          content: res ? toolJson(res, 2000) : "Omnisend não confirmou — verifique o contato.",
          summary: `contato ${String(args.email)}`,
        }
      },
    ),
    writeTool(
      "omnisend_automacao_toggle",
      "Ligar/desligar automação",
      "EXECUTA: ativa ou pausa uma automação (flow) do Omnisend pelo id. Use omnisend_list_automations antes para achar o id.",
      {
        type: "object",
        properties: {
          automation_id: { type: "string" },
          enable: { type: "boolean", description: "true = ativar, false = pausar" },
        },
        required: ["automation_id", "enable"],
      },
      async (args) => {
        const id = String(args.automation_id)
        const action = args.enable === true ? "enable" : "disable"
        const res = await call("POST", `/api/automations/${id}/${action}`, {})
        return {
          content: res ? toolJson(res, 1500) : `Automação ${id} → ${action} enviado.`,
          summary: `automação ${action === "enable" ? "ativada" : "pausada"}`,
        }
      },
    ),
    writeTool(
      "omnisend_copiar_campanha",
      "Copiar campanha",
      "EXECUTA: duplica uma campanha existente como rascunho (o jeito certo de criar campanha nova a partir de uma que performou). Retorna o id do novo rascunho para editar assunto/agendar.",
      {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      async (args) => {
        return runCall("POST", `/api/campaigns/${String(args.campaign_id)}/copy`, {}, "rascunho criado")
      },
    ),
    writeTool(
      "omnisend_editar_campanha_rascunho",
      "Editar rascunho de campanha",
      "EXECUTA: edita uma campanha em RASCUNHO (assunto, preheader, nome). Só funciona em draft — campanha enviada é imutável.",
      {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          subject: { type: "string" },
          preheader: { type: "string" },
          name: { type: "string", description: "Nome interno da campanha" },
        },
        required: ["campaign_id"],
      },
      async (args) => {
        const body: Record<string, unknown> = {}
        if (typeof args.subject === "string") body.subject = args.subject
        if (typeof args.preheader === "string") body.preheader = args.preheader
        if (typeof args.name === "string") body.name = args.name
        return runCall("PATCH", `/api/campaigns/${String(args.campaign_id)}`, body, "rascunho editado")
      },
    ),
    writeTool(
      "omnisend_enviar_teste_campanha",
      "Enviar teste de campanha",
      "EXECUTA: envia um email de TESTE de uma campanha para endereços internos (não vai pra lista).",
      {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          emails: { type: "array", items: { type: "string" }, description: "Destinatários do teste" },
        },
        required: ["campaign_id", "emails"],
      },
      async (args) => {
        return runCall(
          "POST",
          `/api/campaigns/${String(args.campaign_id)}/test-email`,
          { emails: Array.isArray(args.emails) ? args.emails.map(String) : [] },
          "teste enviado",
        )
      },
    ),
    writeTool(
      "omnisend_enviar_campanha",
      "ENVIAR campanha (lista real)",
      "EXECUTA E É IRREVERSÍVEL: dispara a campanha para a lista/segmento REAL configurado nela. Use SOMENTE depois que o usuário confirmar explicitamente o envio, nomeando a campanha. Prefira antes omnisend_enviar_teste_campanha.",
      {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      async (args) => {
        return runCall("POST", `/api/campaigns/${String(args.campaign_id)}/send`, {}, "CAMPANHA ENVIADA")
      },
      (args) => `Enviar a campanha ${String(args.campaign_id)} para a lista REAL no Omnisend (irreversível)`,
    ),
    writeTool(
      "omnisend_cancelar_campanha",
      "Cancelar campanha agendada",
      "EXECUTA: cancela uma campanha agendada/na fila antes do envio.",
      {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      async (args) => {
        return runCall("POST", `/api/campaigns/${String(args.campaign_id)}/cancel`, {}, "campanha cancelada")
      },
    ),
    writeTool(
      "omnisend_operacao",
      "Operação Omnisend (executar do catálogo)",
      "EXECUTA: o 'execute' do padrão MCP — chama QUALQUER operação da API pública do Omnisend. Fluxo: omnisend_catalogo (achar) → omnisend_doc(nome) (ler campos obrigatórios e receita) → esta tool com os {params} do path PREENCHIDOS e o body conforme o guia. Cobre criar/editar automações (workflows), popups/formulários (inclui roleta), A/B de formulário, campanhas, segmentos, templates, imagens. Operações destrutivas (DELETE, enviar campanha) só com pedido explícito do usuário.",
      {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST", "PATCH", "PUT", "DELETE"] },
          path: { type: "string", description: "Ex.: /api/segments (do omnisend_catalogo)" },
          body: { type: "object", description: "Corpo JSON da requisição (quando aplicável)" },
        },
        required: ["method", "path"],
      },
      async (args) => {
        const path = String(args.path ?? "")
        if (!/^\/(api|v3|v5)\//.test(path)) {
          return { content: "Path inválido — precisa começar com /api/, /v3/ ou /v5/." }
        }
        // Param do template ainda no lugar ("/api/forms/{formID}") —
        // mandar isso à API é um 404 garantido que o modelo leria como
        // "o formulário não existe".
        if (/\{[a-zA-Z]+\}/.test(path)) {
          return {
            content: `O path ainda tem um parâmetro por preencher: ${path}. Substitua {…} pelo id real (ex.: vindo de get_forms / get_campaigns) e chame de novo.`,
            summary: "path com {param}",
          }
        }
        const method = ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(String(args.method))
          ? (args.method as "GET")
          : "GET"
        return runCall(
          method,
          path,
          typeof args.body === "object" && args.body !== null
            ? (args.body as Record<string, unknown>)
            : undefined,
          `${method} ${path}`,
        )
      },
      (args) => omnisendOperationNeedsConfirmation(String(args.method ?? "GET"), String(args.path ?? "")),
    ),
  ]

  return {
    key: "omnisend",
    name: "Omnisend",
    tools: [...readTools, ...writeTools],
    guidance: OMNISEND_GUIDANCE,
  }
}
