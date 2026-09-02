/**
 * Catálogo de operações da API pública do Omnisend — extraído do MCP
 * oficial (mcp.omnisend.com) em 02/09/2026. É o "search" do padrão
 * MCP da Omnisend: o modelo DESCOBRE a operação aqui e EXECUTA via
 * omnisend_operacao (method + path + body conforme
 * api-docs.omnisend.com). Paths com {param} são preenchidos pelo
 * chamador.
 *
 * a: query (leitura) | create | update | delete
 */

export interface OmnisendOperation {
  a: "query" | "create" | "update" | "delete"
  m: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  p: string
  s: string
}

export const OMNISEND_OPERATIONS: OmnisendOperation[] = [
  // ── Automações (workflows) ──
  { a: "query", m: "GET", p: "/api/automations", s: "Listar automações (workflows)" },
  { a: "query", m: "GET", p: "/api/automations/{id}", s: "Detalhe de uma automação" },
  { a: "create", m: "POST", p: "/api/automations", s: "Criar automação (workflow)" },
  { a: "update", m: "PATCH", p: "/api/automations/{id}", s: "Editar automação" },
  { a: "update", m: "PUT", p: "/api/automations/{id}/blocks", s: "Substituir os blocos da automação" },
  { a: "create", m: "POST", p: "/api/automations/{id}/enable", s: "ATIVAR automação" },
  { a: "create", m: "POST", p: "/api/automations/{id}/disable", s: "PAUSAR automação" },
  { a: "create", m: "POST", p: "/api/automations/{id}/copy", s: "Duplicar automação" },
  { a: "create", m: "POST", p: "/api/automations/{id}/blocks/{blockID}/test-email", s: "Enviar email de teste de um bloco" },
  { a: "query", m: "GET", p: "/api/automations/{id}/utm", s: "UTMs agregadas da automação" },
  { a: "update", m: "PUT", p: "/api/automations/{id}/blocks/{blockID}/utm", s: "Editar UTM de um bloco" },
  { a: "delete", m: "DELETE", p: "/api/automations/{id}", s: "Excluir automação" },
  // ── Campanhas ──
  { a: "query", m: "GET", p: "/api/campaigns", s: "Listar campanhas (filtros + cursor)" },
  { a: "query", m: "GET", p: "/api/campaigns/{id}", s: "Detalhe da campanha" },
  { a: "create", m: "POST", p: "/api/campaigns", s: "Criar campanha" },
  { a: "update", m: "PATCH", p: "/api/campaigns/{id}", s: "Editar campanha (só rascunho)" },
  { a: "create", m: "POST", p: "/api/campaigns/{id}/copy", s: "Duplicar campanha" },
  { a: "update", m: "POST", p: "/api/campaigns/{id}/send", s: "ENVIAR campanha (lista real — irreversível)" },
  { a: "create", m: "POST", p: "/api/campaigns/{id}/test-email", s: "Enviar teste da campanha" },
  { a: "update", m: "POST", p: "/api/campaigns/{id}/cancel", s: "Cancelar campanha agendada" },
  { a: "create", m: "POST", p: "/api/campaigns/{id}/ab-test/stop", s: "Parar A/B test" },
  { a: "create", m: "POST", p: "/api/campaigns/{id}/ab-test/resume", s: "Retomar A/B test" },
  { a: "create", m: "POST", p: "/api/campaigns/{id}/ab-test/winner", s: "Escolher vencedor do A/B" },
  { a: "query", m: "GET", p: "/api/campaigns/{id}/utm", s: "UTMs da campanha" },
  { a: "update", m: "PUT", p: "/api/campaigns/{id}/utm", s: "Editar UTMs da campanha" },
  { a: "delete", m: "DELETE", p: "/api/campaigns/{id}", s: "Excluir campanha" },
  // ── Formulários / popups ──
  { a: "query", m: "GET", p: "/api/forms", s: "Listar formulários/popups" },
  { a: "query", m: "GET", p: "/api/forms/{formID}", s: "Detalhe do formulário" },
  { a: "create", m: "POST", p: "/api/forms", s: "Criar formulário/popup" },
  { a: "update", m: "PATCH", p: "/api/forms/{formID}", s: "Editar formulário" },
  { a: "update", m: "POST", p: "/api/forms/{formID}/enable", s: "ATIVAR formulário/popup" },
  { a: "update", m: "POST", p: "/api/forms/{formID}/disable", s: "DESATIVAR formulário/popup" },
  { a: "query", m: "GET", p: "/api/forms/{formID}/report", s: "Report do formulário" },
  { a: "query", m: "GET", p: "/api/forms/{formID}/report/periodic", s: "Report periódico do formulário" },
  { a: "query", m: "GET", p: "/api/forms/{formID}/contacts", s: "Contatos capturados pelo formulário" },
  { a: "query", m: "GET", p: "/api/form-templates", s: "Templates de formulário" },
  { a: "query", m: "GET", p: "/api/form-templates/{templateID}", s: "Detalhe do template de formulário" },
  { a: "query", m: "POST", p: "/api/form-templates/{templateID}/render", s: "Renderizar template de formulário" },
  { a: "query", m: "POST", p: "/api/forms/{formID}/render", s: "Renderizar formulário" },
  { a: "delete", m: "DELETE", p: "/api/forms/{formID}", s: "Excluir formulário" },
  // ── A/B de formulários ──
  { a: "query", m: "GET", p: "/api/form-ab-setups", s: "Listar A/B de formulários" },
  { a: "query", m: "GET", p: "/api/form-ab-setups/{abSetupID}", s: "Detalhe do A/B de formulário" },
  { a: "create", m: "POST", p: "/api/form-ab-setups", s: "Criar A/B de formulário" },
  { a: "update", m: "POST", p: "/api/form-ab-setups/{abSetupID}/start", s: "Iniciar A/B de formulário" },
  { a: "update", m: "POST", p: "/api/form-ab-setups/{abSetupID}/winner", s: "Escolher vencedor do A/B de formulário" },
  { a: "query", m: "GET", p: "/api/forms/{formID}/ab-setup/reports", s: "Reports do A/B de formulário" },
  { a: "delete", m: "DELETE", p: "/api/form-ab-setups/{abSetupID}", s: "Excluir A/B de formulário" },
  // ── Contatos ──
  { a: "query", m: "GET", p: "/api/contacts", s: "Listar contatos" },
  { a: "query", m: "GET", p: "/api/contacts/{id}", s: "Detalhe do contato" },
  { a: "create", m: "POST", p: "/api/contacts", s: "Criar/atualizar contato" },
  { a: "update", m: "PATCH", p: "/api/contacts", s: "Atualizar contato por email" },
  { a: "update", m: "PATCH", p: "/api/contacts/{id}", s: "Atualizar contato por id" },
  { a: "update", m: "POST", p: "/api/contacts/tags", s: "Adicionar tags em lote" },
  { a: "delete", m: "DELETE", p: "/api/contacts/tags", s: "Remover tags em lote" },
  // ── Segmentos ──
  { a: "query", m: "GET", p: "/api/segments", s: "Listar segmentos" },
  { a: "query", m: "GET", p: "/api/segments/{segmentID}", s: "Detalhe do segmento" },
  { a: "query", m: "GET", p: "/api/segments/{segmentID}/statistics", s: "Estatísticas do segmento" },
  { a: "create", m: "POST", p: "/api/segments", s: "Criar segmento" },
  { a: "update", m: "PUT", p: "/api/segments/{segmentID}", s: "Editar segmento" },
  { a: "delete", m: "DELETE", p: "/api/segments/{segmentID}", s: "Excluir segmento" },
  // ── Analytics / eventos ──
  { a: "query", m: "POST", p: "/api/analytics/reports", s: "Report de campanhas por data de ENVIO (igual UI)" },
  { a: "query", m: "POST", p: "/api/analytics/statistics", s: "Report por data do EVENTO" },
  { a: "query", m: "POST", p: "/api/events/query", s: "Eventos de um contato" },
  { a: "query", m: "POST", p: "/api/events/property-values/query", s: "Valores de propriedade de eventos" },
  { a: "query", m: "POST", p: "/api/event-metadata/query", s: "Metadata de eventos" },
  { a: "create", m: "POST", p: "/api/event-metadata", s: "Criar metadata de evento custom" },
  { a: "update", m: "PUT", p: "/api/event-metadata", s: "Editar metadata de evento custom" },
  // ── Email templates / conteúdo ──
  { a: "query", m: "GET", p: "/api/email-templates", s: "Listar templates de email" },
  { a: "query", m: "GET", p: "/api/email-templates/{id}", s: "Detalhe do template" },
  { a: "create", m: "POST", p: "/api/email-templates", s: "Criar template de email" },
  { a: "create", m: "POST", p: "/api/email-templates/import", s: "Importar template de HTML" },
  { a: "update", m: "PUT", p: "/api/email-templates/{id}", s: "Editar template" },
  { a: "query", m: "POST", p: "/api/email-templates/{id}/render", s: "Renderizar template" },
  { a: "query", m: "GET", p: "/api/email-content/{id}", s: "Conteúdo de email" },
  { a: "update", m: "PUT", p: "/api/email-content/{id}", s: "Editar conteúdo de email" },
  { a: "query", m: "POST", p: "/api/email-content/{id}/render", s: "Renderizar conteúdo de email" },
  { a: "query", m: "GET", p: "/api/email-universal-layouts", s: "Listar layouts universais" },
  { a: "query", m: "GET", p: "/api/email-universal-layouts/{id}", s: "Detalhe do layout universal" },
  { a: "create", m: "POST", p: "/api/email-universal-layouts", s: "Criar layout universal" },
  { a: "update", m: "PUT", p: "/api/email-universal-layouts/{id}", s: "Editar layout universal" },
  { a: "delete", m: "DELETE", p: "/api/email-universal-layouts/{id}", s: "Excluir layout universal" },
  { a: "delete", m: "DELETE", p: "/api/email-templates/{id}", s: "Excluir template" },
  // ── Produtos / categorias ──
  { a: "query", m: "GET", p: "/api/products", s: "Listar produtos" },
  { a: "query", m: "GET", p: "/api/products/{productID}", s: "Detalhe do produto" },
  { a: "create", m: "POST", p: "/api/products", s: "Criar produto" },
  { a: "update", m: "PUT", p: "/api/products/{productID}", s: "Substituir produto" },
  { a: "delete", m: "DELETE", p: "/api/products/{productID}", s: "Excluir produto" },
  { a: "query", m: "GET", p: "/api/product-categories", s: "Listar categorias" },
  { a: "query", m: "GET", p: "/api/product-categories/{categoryID}", s: "Detalhe da categoria" },
  { a: "create", m: "POST", p: "/api/product-categories", s: "Criar categoria" },
  { a: "update", m: "PATCH", p: "/api/product-categories/{categoryID}", s: "Editar categoria" },
  { a: "delete", m: "DELETE", p: "/api/product-categories/{categoryID}", s: "Excluir categoria" },
  // ── Imagens / batches / marca ──
  { a: "query", m: "GET", p: "/api/images", s: "Listar imagens" },
  { a: "create", m: "POST", p: "/api/images", s: "Subir imagem por URL" },
  { a: "create", m: "POST", p: "/api/images/upload", s: "Subir arquivo de imagem" },
  { a: "delete", m: "DELETE", p: "/api/images/{id}", s: "Excluir imagem" },
  { a: "query", m: "GET", p: "/api/batches", s: "Listar batches" },
  { a: "query", m: "GET", p: "/api/batches/{batchID}", s: "Status do batch" },
  { a: "query", m: "GET", p: "/api/batches/{batchID}/items", s: "Itens do batch" },
  { a: "create", m: "POST", p: "/api/batches", s: "Criar batch (operações em massa)" },
  { a: "query", m: "GET", p: "/api/brands/current", s: "Dados da marca conectada" },
  { a: "query", m: "GET", p: "/api/brand-assets/current", s: "Assets da marca" },
]

/** Filtro simples por texto/ação — o "search" do catálogo. */
export function searchOmnisendOperations(
  query?: string,
  action?: string,
): OmnisendOperation[] {
  const q = (query ?? "").trim().toLowerCase()
  return OMNISEND_OPERATIONS.filter((op) => {
    if (action && op.a !== action) return false
    if (!q) return true
    return op.s.toLowerCase().includes(q) || op.p.toLowerCase().includes(q)
  })
}
