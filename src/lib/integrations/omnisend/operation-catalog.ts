/**
 * Catálogo de operações da API pública do Omnisend — os 105 endpoints
 * expostos pelo MCP oficial (mcp.omnisend.com), com o NOME canônico de
 * cada operação (o mesmo que o MCP usa), extraído em 04/09/2026.
 *
 * É o "search" do padrão MCP: o modelo DESCOBRE a operação aqui, LÊ o
 * guia dela com omnisend_doc(nome) e EXECUTA via omnisend_operacao
 * (method + path + body). Paths com {param} são preenchidos pelo
 * chamador.
 *
 * a: query (leitura) | create | update | delete
 */

export interface OmnisendOperation {
  /** Nome canônico (chave do guia em operation-docs). */
  n: string
  a: "query" | "create" | "update" | "delete"
  m: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  p: string
  s: string
}

export const OMNISEND_OPERATIONS: OmnisendOperation[] = [
  // ── Automações (workflows) ──
  { n: "get_automations", a: "query", m: "GET", p: "/api/automations", s: "Listar automações (workflows)" },
  { n: "get_automations_id", a: "query", m: "GET", p: "/api/automations/{id}", s: "Detalhe de uma automação" },
  { n: "post_automations", a: "create", m: "POST", p: "/api/automations", s: "Criar automação (workflow)" },
  { n: "patch_automations_id", a: "update", m: "PATCH", p: "/api/automations/{id}", s: "Editar automação (parcial; não adiciona/remove blocos)" },
  { n: "put_automations_id_blocks", a: "update", m: "PUT", p: "/api/automations/{id}/blocks", s: "Substituir os blocos da automação" },
  { n: "post_automations_id_enable", a: "create", m: "POST", p: "/api/automations/{id}/enable", s: "ATIVAR automação" },
  { n: "post_automations_id_disable", a: "create", m: "POST", p: "/api/automations/{id}/disable", s: "PAUSAR automação" },
  { n: "post_automations_id_copy", a: "create", m: "POST", p: "/api/automations/{id}/copy", s: "Duplicar automação" },
  { n: "post_automations_id_blocks_block_id_test_email", a: "create", m: "POST", p: "/api/automations/{id}/blocks/{blockID}/test-email", s: "Enviar email de teste de um bloco" },
  { n: "get_automations_id_utm", a: "query", m: "GET", p: "/api/automations/{id}/utm", s: "UTMs agregadas da automação" },
  { n: "get_automations_id_blocks_block_id_utm", a: "query", m: "GET", p: "/api/automations/{id}/blocks/{blockID}/utm", s: "UTM de um bloco" },
  { n: "put_automations_id_blocks_block_id_utm", a: "update", m: "PUT", p: "/api/automations/{id}/blocks/{blockID}/utm", s: "Editar UTM de um bloco" },
  { n: "delete_automations_id", a: "delete", m: "DELETE", p: "/api/automations/{id}", s: "Excluir automação" },
  // ── Campanhas ──
  { n: "get_campaigns", a: "query", m: "GET", p: "/api/campaigns", s: "Listar campanhas (filtros nameContains/status/type + cursor)" },
  { n: "get_campaigns_id", a: "query", m: "GET", p: "/api/campaigns/{id}", s: "Detalhe da campanha" },
  { n: "post_campaigns", a: "create", m: "POST", p: "/api/campaigns", s: "Criar campanha (regular, abTest, booster)" },
  { n: "patch_campaigns_id", a: "update", m: "PATCH", p: "/api/campaigns/{id}", s: "Editar campanha (só rascunho)" },
  { n: "post_campaigns_id_copy", a: "create", m: "POST", p: "/api/campaigns/{id}/copy", s: "Duplicar campanha como rascunho" },
  { n: "post_campaigns_id_send", a: "update", m: "POST", p: "/api/campaigns/{id}/send", s: "ENVIAR campanha (lista real — irreversível)" },
  { n: "post_campaigns_id_test_email", a: "create", m: "POST", p: "/api/campaigns/{id}/test-email", s: "Enviar teste da campanha" },
  { n: "post_campaigns_id_cancel", a: "update", m: "POST", p: "/api/campaigns/{id}/cancel", s: "Cancelar campanha agendada/em envio" },
  { n: "post_campaigns_id_ab_test_stop", a: "create", m: "POST", p: "/api/campaigns/{id}/ab-test/stop", s: "Parar seleção de vencedor do A/B" },
  { n: "post_campaigns_id_ab_test_resume", a: "create", m: "POST", p: "/api/campaigns/{id}/ab-test/resume", s: "Retomar A/B test" },
  { n: "post_campaigns_id_ab_test_winner", a: "create", m: "POST", p: "/api/campaigns/{id}/ab-test/winner", s: "Escolher vencedor do A/B de campanha" },
  { n: "get_campaigns_id_utm", a: "query", m: "GET", p: "/api/campaigns/{id}/utm", s: "UTMs da campanha" },
  { n: "put_campaigns_id_utm", a: "update", m: "PUT", p: "/api/campaigns/{id}/utm", s: "Editar UTMs da campanha (rascunho)" },
  { n: "delete_campaigns_id", a: "delete", m: "DELETE", p: "/api/campaigns/{id}", s: "Excluir campanha" },
  // ── Formulários / popups ──
  { n: "get_forms", a: "query", m: "GET", p: "/api/forms", s: "Listar formulários/popups da marca" },
  { n: "get_form_id", a: "query", m: "GET", p: "/api/forms/{formID}", s: "Detalhe do formulário (content, targeting, status, abSetupID)" },
  { n: "post_forms", a: "create", m: "POST", p: "/api/forms", s: "Criar formulário/popup (inclui bloco wheelOfFortune)" },
  { n: "patch_form_id", a: "update", m: "PATCH", p: "/api/forms/{formID}", s: "Editar formulário (objetos aninhados completos)" },
  { n: "post_forms_form_id_enable", a: "update", m: "POST", p: "/api/forms/{formID}/enable", s: "ATIVAR formulário/popup" },
  { n: "post_forms_form_id_disable", a: "update", m: "POST", p: "/api/forms/{formID}/disable", s: "DESATIVAR formulário/popup" },
  { n: "post_forms_form_id_render", a: "query", m: "POST", p: "/api/forms/{formID}/render", s: "Renderizar formulário (preview HTML, sem publicar)" },
  { n: "get_forms_form_id_report", a: "query", m: "GET", p: "/api/forms/{formID}/report", s: "Report do formulário (views, submits, signups, device)" },
  { n: "get_forms_form_id_report_periodic", a: "query", m: "GET", p: "/api/forms/{formID}/report/periodic", s: "Report periódico do formulário" },
  { n: "get_forms_form_id_contacts", a: "query", m: "GET", p: "/api/forms/{formID}/contacts", s: "Contatos capturados pelo formulário" },
  { n: "get_form_templates", a: "query", m: "GET", p: "/api/form-templates", s: "Templates de formulário (content completo — ponto de partida)" },
  { n: "get_template_id", a: "query", m: "GET", p: "/api/form-templates/{templateID}", s: "Detalhe do template de formulário" },
  { n: "post_form_templates_template_id_render", a: "query", m: "POST", p: "/api/form-templates/{templateID}/render", s: "Renderizar template de formulário" },
  { n: "delete_form_id", a: "delete", m: "DELETE", p: "/api/forms/{formID}", s: "Excluir formulário" },
  // ── A/B de formulários ──
  { n: "get_form_ab_setups", a: "query", m: "GET", p: "/api/form-ab-setups", s: "Listar A/B de formulários" },
  { n: "get_ab_setup_id", a: "query", m: "GET", p: "/api/form-ab-setups/{abSetupID}", s: "Detalhe do A/B (versions[].formID)" },
  { n: "post_form_ab_setups", a: "create", m: "POST", p: "/api/form-ab-setups", s: "Criar A/B de formulário (2 variantes a partir do form principal)" },
  { n: "post_form_ab_setups_ab_setup_id_start", a: "update", m: "POST", p: "/api/form-ab-setups/{abSetupID}/start", s: "Iniciar A/B de formulário" },
  { n: "post_form_ab_setups_ab_setup_id_winner", a: "update", m: "POST", p: "/api/form-ab-setups/{abSetupID}/winner", s: "Escolher vencedor do A/B de formulário" },
  { n: "get_forms_form_id_ab_setup_reports", a: "query", m: "GET", p: "/api/forms/{formID}/ab-setup/reports", s: "Reports do A/B de formulário (por versão)" },
  { n: "delete_ab_setup_id", a: "delete", m: "DELETE", p: "/api/form-ab-setups/{abSetupID}", s: "Excluir A/B de formulário (rascunho)" },
  // ── Contatos ──
  { n: "get_contacts", a: "query", m: "GET", p: "/api/contacts", s: "Listar contatos" },
  { n: "get_contacts_id", a: "query", m: "GET", p: "/api/contacts/{id}", s: "Detalhe do contato" },
  { n: "post_contacts", a: "create", m: "POST", p: "/api/contacts", s: "Criar/atualizar contato" },
  { n: "patch_contacts", a: "update", m: "PATCH", p: "/api/contacts", s: "Atualizar contato por email" },
  { n: "patch_contacts_id", a: "update", m: "PATCH", p: "/api/contacts/{id}", s: "Atualizar contato por id" },
  { n: "post_contacts_tags", a: "update", m: "POST", p: "/api/contacts/tags", s: "Adicionar tags em lote" },
  { n: "delete_contacts_tags", a: "delete", m: "DELETE", p: "/api/contacts/tags", s: "Remover tags em lote" },
  // ── Segmentos ──
  { n: "get_segments", a: "query", m: "GET", p: "/api/segments", s: "Listar segmentos" },
  { n: "get_segment_id", a: "query", m: "GET", p: "/api/segments/{segmentID}", s: "Detalhe do segmento" },
  { n: "get_segments_segment_id_statistics", a: "query", m: "GET", p: "/api/segments/{segmentID}/statistics", s: "Estatísticas do segmento" },
  { n: "post_segments", a: "create", m: "POST", p: "/api/segments", s: "Criar segmento (conditionGroups)" },
  { n: "put_segment_id", a: "update", m: "PUT", p: "/api/segments/{segmentID}", s: "Editar segmento (substituição completa)" },
  { n: "delete_segment_id", a: "delete", m: "DELETE", p: "/api/segments/{segmentID}", s: "Excluir segmento" },
  // ── Analytics / eventos ──
  { n: "post_analytics_reports", a: "query", m: "POST", p: "/api/analytics/reports", s: "Report de campanhas/automações por data de ENVIO (igual UI)" },
  { n: "post_analytics_statistics", a: "query", m: "POST", p: "/api/analytics/statistics", s: "Report por data do EVENTO (receita total da loja, crescimento de lista)" },
  { n: "post_events_query", a: "query", m: "POST", p: "/api/events/query", s: "Eventos de um contato" },
  { n: "post_events_property_values_query", a: "query", m: "POST", p: "/api/events/property-values/query", s: "Valores de propriedade de eventos" },
  { n: "post_event_metadata_query", a: "query", m: "POST", p: "/api/event-metadata/query", s: "Metadata de eventos (nomes, origins, property paths)" },
  { n: "post_event_metadata", a: "create", m: "POST", p: "/api/event-metadata", s: "Criar metadata de evento custom" },
  { n: "put_event_metadata", a: "update", m: "PUT", p: "/api/event-metadata", s: "Editar metadata de evento custom" },
  // ── Email templates / conteúdo ──
  { n: "get_email_templates", a: "query", m: "GET", p: "/api/email-templates", s: "Listar templates de email" },
  { n: "get_email_templates_id", a: "query", m: "GET", p: "/api/email-templates/{id}", s: "Detalhe do template" },
  { n: "post_email_templates", a: "create", m: "POST", p: "/api/email-templates", s: "Criar template de email (sections/rows/columns/blocks)" },
  { n: "post_email_templates_import", a: "create", m: "POST", p: "/api/email-templates/import", s: "Importar template de HTML cru" },
  { n: "put_email_templates_id", a: "update", m: "PUT", p: "/api/email-templates/{id}", s: "Editar template (substituição completa)" },
  { n: "post_email_templates_id_render", a: "query", m: "POST", p: "/api/email-templates/{id}/render", s: "Renderizar template" },
  { n: "get_email_content_id", a: "query", m: "GET", p: "/api/email-content/{id}", s: "Conteúdo de email (design da campanha via contentID)" },
  { n: "put_email_content_id", a: "update", m: "PUT", p: "/api/email-content/{id}", s: "Editar conteúdo de email" },
  { n: "post_email_content_id_render", a: "query", m: "POST", p: "/api/email-content/{id}/render", s: "Renderizar conteúdo de email" },
  { n: "get_email_universal_layouts", a: "query", m: "GET", p: "/api/email-universal-layouts", s: "Listar layouts universais" },
  { n: "get_email_universal_layouts_id", a: "query", m: "GET", p: "/api/email-universal-layouts/{id}", s: "Detalhe do layout universal" },
  { n: "post_email_universal_layouts", a: "create", m: "POST", p: "/api/email-universal-layouts", s: "Criar layout universal" },
  { n: "put_email_universal_layouts_id", a: "update", m: "PUT", p: "/api/email-universal-layouts/{id}", s: "Editar layout universal" },
  { n: "delete_email_universal_layouts_id", a: "delete", m: "DELETE", p: "/api/email-universal-layouts/{id}", s: "Excluir layout universal" },
  { n: "delete_email_templates_id", a: "delete", m: "DELETE", p: "/api/email-templates/{id}", s: "Excluir template" },
  // ── Produtos / categorias ──
  { n: "get_products", a: "query", m: "GET", p: "/api/products", s: "Listar produtos" },
  { n: "get_product_id", a: "query", m: "GET", p: "/api/products/{productID}", s: "Detalhe do produto" },
  { n: "post_products", a: "create", m: "POST", p: "/api/products", s: "Criar produto" },
  { n: "put_product_id", a: "update", m: "PUT", p: "/api/products/{productID}", s: "Substituir produto" },
  { n: "delete_product_id", a: "delete", m: "DELETE", p: "/api/products/{productID}", s: "Excluir produto" },
  { n: "get_product_categories", a: "query", m: "GET", p: "/api/product-categories", s: "Listar categorias" },
  { n: "get_category_id", a: "query", m: "GET", p: "/api/product-categories/{categoryID}", s: "Detalhe da categoria" },
  { n: "post_product_categories", a: "create", m: "POST", p: "/api/product-categories", s: "Criar categoria" },
  { n: "patch_category_id", a: "update", m: "PATCH", p: "/api/product-categories/{categoryID}", s: "Editar categoria" },
  { n: "delete_category_id", a: "delete", m: "DELETE", p: "/api/product-categories/{categoryID}", s: "Excluir categoria" },
  // ── Imagens / batches / marca ──
  { n: "get_images", a: "query", m: "GET", p: "/api/images", s: "Listar imagens" },
  { n: "get_images_id", a: "query", m: "GET", p: "/api/images/{id}", s: "Detalhe da imagem" },
  { n: "post_images", a: "create", m: "POST", p: "/api/images", s: "Subir imagem por URL pública (devolve id para blocos)" },
  { n: "post_images_upload", a: "create", m: "POST", p: "/api/images/upload", s: "Subir arquivo de imagem (multipart)" },
  { n: "delete_images_id", a: "delete", m: "DELETE", p: "/api/images/{id}", s: "Excluir imagem" },
  { n: "get_batches", a: "query", m: "GET", p: "/api/batches", s: "Listar batches" },
  { n: "get_batch_id", a: "query", m: "GET", p: "/api/batches/{batchID}", s: "Status do batch" },
  { n: "get_batches_batch_id_items", a: "query", m: "GET", p: "/api/batches/{batchID}/items", s: "Itens do batch" },
  { n: "post_batches", a: "create", m: "POST", p: "/api/batches", s: "Criar batch (operações em massa)" },
  { n: "get_brands_current", a: "query", m: "GET", p: "/api/brands/current", s: "Dados da marca conectada (timezone, moeda)" },
  { n: "post_brands_current", a: "update", m: "POST", p: "/api/brands/current", s: "Conectar loja à marca" },
  { n: "get_brand_assets_current", a: "query", m: "GET", p: "/api/brand-assets/current", s: "Assets da marca (logo, cores)" },
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
    return (
      op.s.toLowerCase().includes(q) ||
      op.p.toLowerCase().includes(q) ||
      op.n.toLowerCase().includes(q)
    )
  })
}

/** Normaliza um path preenchido (`/api/forms/abc123`) para o template (`/api/forms/{formID}`). */
function pathMatches(template: string, actual: string): boolean {
  const t = template.split("/")
  const a = actual.split("?")[0].split("/")
  if (t.length !== a.length) return false
  return t.every((seg, i) => seg.startsWith("{") || seg === a[i])
}

/**
 * Localiza a operação pelo nome canônico OU por method + path (o path
 * pode vir com os params preenchidos). Nome vence.
 */
export function findOmnisendOperation(
  nameOrPath: string,
  method?: string,
): OmnisendOperation | null {
  const key = nameOrPath.trim()
  if (!key) return null
  const byName = OMNISEND_OPERATIONS.find((op) => op.n === key.toLowerCase())
  if (byName) return byName

  // "POST /api/forms" numa string só
  let m = method?.toUpperCase()
  let path = key
  const combo = /^(GET|POST|PATCH|PUT|DELETE)\s+(\/\S+)$/i.exec(key)
  if (combo) {
    m = combo[1].toUpperCase()
    path = combo[2]
  }
  if (!path.startsWith("/")) return null
  const candidates = OMNISEND_OPERATIONS.filter((op) => pathMatches(op.p, path))
  if (candidates.length === 0) return null
  if (m) return candidates.find((op) => op.m === m) ?? null
  // Sem method: só é inequívoco quando há UMA operação naquele path
  return candidates.length === 1 ? candidates[0] : null
}
