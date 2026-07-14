/**
 * Bootstrap idempotente da pipeline de Onboarding por org.
 *
 * Cria 1 pipeline `onboarding` + 7 colunas com templates inline
 * (checklist, deliverables, whatsapp, automacoes) na primeira chamada.
 * Tambem garante 1 tutorial_page padrao publicada.
 *
 * Todos os textos vieram do PRD v2 (PRD-onboarding-convertfy.md secao 5).
 */

import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  AutomationRule,
  ChecklistAutoCompleteEvent,
  ChecklistItem,
  DeliverableField,
} from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingBootstrap")

interface ColumnSeed {
  name: string
  slug: string
  position: number
  color: string
  is_initial?: boolean
  is_final?: boolean
  default_assignee_role: string
  sla_hours: number
  checklist_template: ChecklistItem[]
  deliverables_template: DeliverableField[]
  whatsapp_template: string | null
  automation_rules: AutomationRule[]
}

function chk(
  id: string,
  label: string,
  order: number,
  extras?: { slug?: string; auto_complete_on?: ChecklistAutoCompleteEvent },
): ChecklistItem {
  return { id, label, order, ...extras }
}

export const SEED_COLUMNS: ColumnSeed[] = [
  {
    name: "Entrada",
    slug: "entrada",
    position: 1,
    color: "#0EA5E9",
    is_initial: true,
    // Canonico (matriz ONBOARDING_STAGE_RESPONSIBLE_ROLE). Legados cs/estrategista→suporte.
    default_assignee_role: "suporte",
    sla_hours: 2,
    checklist_template: [
      chk("entrada_welcome", "Dar boas vindas ao cliente e apresentar o time", 1, { slug: "entrada_welcome" }),
      chk("entrada_asaas", "Enviar instrucoes de pagamento do Asaas", 2, { slug: "entrada_asaas" }),
      chk("entrada_form_link", "Gerar link unico do formulario e enviar ao cliente", 3, { slug: "entrada_form_link" }),
    ],
    // Removido o deliverable "Print do grupo WhatsApp" (whatsapp_group_screenshot)
    // junto com a task "Criar grupo no WhatsApp" — a etapa Entrada não tem mais entregável.
    deliverables_template: [],
    whatsapp_template:
      "Ola {{client_name}}! Seja muito bem-vindo a Convertfy.\n\nEsse e nosso grupo oficial pra acompanhar todo o processo da {{store_name}}.\n\nPrimeiro passo: responda esse formulario (5 minutos):\n{{form_url}}\n\nA IA gera um briefing direto no proprio formulario pra voce revisar.",
    automation_rules: [
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Formulario - Cliente preenche briefing",
    slug: "cliente_formulario",
    position: 2,
    color: "#6366F1",
    default_assignee_role: "suporte",
    sla_hours: 72,
    checklist_template: [
      chk("form_marca", "Cliente preencheu secao \"Sobre a marca\"", 1, {
        slug: "form_marca",
        auto_complete_on: { event: "form_section_completed", sections: ["marca"] },
      }),
      chk("form_produtos_publico", "Cliente preencheu secao \"Produtos e publico\"", 2, {
        slug: "form_produtos_publico",
        auto_complete_on: { event: "form_section_completed", sections: ["loja", "cliente"] },
      }),
      chk("form_acessos", "Cliente enviou acessos (Klaviyo/Omnisend + Shopify)", 3, {
        slug: "form_acessos",
        // Manual: wizard nao tem secao de acessos hoje. CS marca quando recebe.
      }),
      chk("form_referencias", "Cliente enviou referencias visuais (logo, paleta, exemplos)", 4, {
        slug: "form_referencias",
        auto_complete_on: { event: "form_section_completed", sections: ["materiais"] },
      }),
    ],
    deliverables_template: [
      { slug: "form_100_percent_filled", label: "Formulario 100% preenchido", type: "checkbox", required: true },
      { slug: "shopify_partner_access_validated", label: "Acessos validados (Solicitar acesso como partner na Shopify)", type: "checkbox", required: true },
      { slug: "brand_brain_generated", label: "Brand Brain gerado pela IA - Sintese estruturada do briefing pro time usar", type: "checkbox", required: true },
    ],
    whatsapp_template: null,
    automation_rules: [
      { trigger: "form_submitted", action: "generate_briefing", params: {} },
      { trigger: "briefing_confirmed", action: "advance_to_next", params: {} },
      {
        trigger: "briefing_confirmed",
        action: "send_notification",
        params: { to_role: "suporte", message: "Briefing aprovado por {{client_name}} ({{store_name}})" },
      },
    ],
  },
  {
    name: "Preview - Designer cria pilotos",
    slug: "preview_producao",
    position: 3,
    color: "#A855F7",
    default_assignee_role: "designer",
    sla_hours: 48,
    checklist_template: [
      chk("preview_brand_brain", "Estudar Brand Brain + referencias do cliente", 1, { slug: "preview_brand_brain" }),
      chk("preview_email_welcome", "Criar email-piloto: Welcome (boas-vindas)", 2, { slug: "preview_email_welcome" }),
      chk("preview_email_carrinho_1", "Criar email-piloto: Carrinho abandonado (parte 1)", 3, { slug: "preview_email_carrinho_1" }),
      chk("preview_email_carrinho_2", "Criar email-piloto: Carrinho abandonado (parte 2)", 4, { slug: "preview_email_carrinho_2" }),
      chk("preview_email_pos_compra", "Criar email-piloto: Pos-compra (engajamento)", 5, { slug: "preview_email_pos_compra" }),
    ],
    deliverables_template: [
      // 4 uploads required (1 por piloto). Brand Brain e estudo, nao tem upload.
      // Cada upload e referenciado por slug pelo pre-fill service que copia
      // o file_url pro sub_item correspondente na Etapa 05 ao avancar de 04->05.
      { slug: "piloto_welcome_files", label: "Piloto Welcome - arquivos (PNG/PDF/Figma)", type: "upload", required: true },
      { slug: "piloto_carrinho_1_files", label: "Piloto Carrinho abandonado (parte 1) - arquivos", type: "upload", required: true },
      { slug: "piloto_carrinho_2_files", label: "Piloto Carrinho abandonado (parte 2) - arquivos", type: "upload", required: true },
      { slug: "piloto_pos_compra_files", label: "Piloto Pos-compra - arquivos", type: "upload", required: true },
      // allow_other: usuario pode escolher um idioma fora da lista (UI mostra
      // "Outros" e abre input de texto). default_value e injetado em runtime
      // pelo productivity API com client_stores.language.
      { slug: "language", label: "Idioma de entrega", type: "select", required: true, options: ["pt-BR", "en-US", "es", "fr"], allow_other: true },
      // Opcional — preserva interpolacao {{figma_link}} no template WhatsApp
      // da Etapa 04 e em qualquer relatorio que filtre por esse slug.
      { slug: "figma_link", label: "Link do Figma (opcional)", type: "url", required: false, validation: "figma" },
    ],
    whatsapp_template: null,
    automation_rules: [
      {
        trigger: "completed",
        action: "create_task",
        params: { title: "Enviar pilotos pro cliente", assignee_role: "suporte" },
      },
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Aprovacao do preview",
    slug: "preview_aprovacao",
    position: 4,
    color: "#F59E0B",
    default_assignee_role: "suporte",
    sla_hours: 48,
    checklist_template: [
      chk("aprovacao_enviar", "Enviar pilotos ao cliente via WhatsApp", 1, { slug: "aprovacao_enviar" }),
      chk("aprovacao_coleta_inicial", "Coleta inicial de feedback", 2, { slug: "aprovacao_coleta_inicial" }),
      chk("aprovacao_confirmacao_final", "Confirmacao final de aprovacao", 3, { slug: "aprovacao_confirmacao_final" }),
    ],
    deliverables_template: [
      {
        slug: "client_approval_record",
        label: "Registro de aprovacao do cliente",
        type: "select",
        required: true,
        options: ["aprovado", "ajustes_solicitados", "sem_resposta"],
      },
      // Mantidos como opcionais — alimentam a automation_rule go_back_to(increment_version)
      // que persiste severity em onboarding_versions. Remover quebraria o fluxo de rework.
      { slug: "client_feedback", label: "Feedback estruturado (se ajustes)", type: "textarea", required: false },
      {
        slug: "feedback_severity",
        label: "Severidade dos ajustes",
        type: "select",
        required: false,
        options: ["small", "medium", "rework_part", "rework_all"],
      },
    ],
    whatsapp_template:
      "Oi {{client_name}}! Acabamos o preview do welcome flow da {{store_name}}. Esse e o template base que guia os outros emails:\n\nFigma: {{figma_link}}\n\nOlha com calma e me da retorno. Se tiver ajuste, manda detalhado.",
    automation_rules: [
      {
        trigger: "completed",
        action: "advance_to_next",
        params: { only_if: { client_approval_record: "aprovado" } },
      },
      {
        trigger: "completed",
        action: "go_back_to",
        params: {
          only_if: { client_approval_record: "ajustes_solicitados" },
          target_slug: "preview_producao",
          increment_version: true,
        },
      },
    ],
  },
  {
    // Etapa 05 — 1 task por flow + sub_items listando os emails de cada flow.
    // Emails marcados com from_preview vem pre-completos do piloto aprovado
    // na Etapa 03 (copiados pelo onboarding-pre-fill.service ao avancar 04->05).
    name: "Emails finais em producao",
    slug: "emails_finais",
    position: 5,
    color: "#10B981",
    default_assignee_role: "designer",
    sla_hours: 60,
    checklist_template: [
      {
        id: "flow_welcome",
        slug: "flow_welcome",
        label: "Welcome Flow (8 emails)",
        order: 1,
        sub_items: [
          { slug: "welcome_email_1", label: "Email 1 - Boas-vindas", from_preview: "piloto_welcome_files" },
          { slug: "welcome_email_2", label: "Email 2" },
          { slug: "welcome_email_3", label: "Email 3" },
          { slug: "welcome_email_4", label: "Email 4" },
          { slug: "welcome_email_5", label: "Email 5" },
          { slug: "welcome_email_6", label: "Email 6" },
          { slug: "welcome_email_7", label: "Email 7" },
          { slug: "welcome_email_8", label: "Email 8" },
        ],
      },
      {
        id: "flow_site_abandoned",
        slug: "flow_site_abandoned",
        label: "Site Abandoned (1 email)",
        order: 2,
        sub_items: [
          { slug: "site_abandoned_email_1", label: "Email unico" },
        ],
      },
      {
        id: "flow_browse_abandoned",
        slug: "flow_browse_abandoned",
        label: "Browse Abandoned (5 emails)",
        order: 3,
        sub_items: [
          { slug: "browse_abandoned_email_1", label: "Email 1" },
          { slug: "browse_abandoned_email_2", label: "Email 2" },
          { slug: "browse_abandoned_email_3", label: "Email 3" },
          { slug: "browse_abandoned_email_4", label: "Email 4" },
          { slug: "browse_abandoned_email_5", label: "Email 5" },
        ],
      },
      {
        id: "flow_carrinho_abandonado",
        slug: "flow_carrinho_abandonado",
        label: "Carrinho Abandonado (8 emails)",
        order: 4,
        sub_items: [
          { slug: "carrinho_email_1", label: "Email 1 - Parte 1", from_preview: "piloto_carrinho_1_files" },
          { slug: "carrinho_email_2", label: "Email 2 - Parte 2", from_preview: "piloto_carrinho_2_files" },
          { slug: "carrinho_email_3", label: "Email 3" },
          { slug: "carrinho_email_4", label: "Email 4" },
          { slug: "carrinho_email_5", label: "Email 5" },
          { slug: "carrinho_email_6", label: "Email 6" },
          { slug: "carrinho_email_7", label: "Email 7" },
          { slug: "carrinho_email_8", label: "Email 8" },
        ],
      },
      {
        id: "flow_upsell",
        slug: "flow_upsell",
        label: "Upsell (4 emails)",
        order: 5,
        sub_items: [
          { slug: "upsell_email_1", label: "Email 1 - Pos-compra", from_preview: "piloto_pos_compra_files" },
          { slug: "upsell_email_2", label: "Email 2" },
          { slug: "upsell_email_3", label: "Email 3" },
          { slug: "upsell_email_4", label: "Email 4" },
        ],
      },
      {
        id: "flow_winback",
        slug: "flow_winback",
        label: "Winback (3 emails)",
        order: 6,
        sub_items: [
          { slug: "winback_email_1", label: "Email 1" },
          { slug: "winback_email_2", label: "Email 2" },
          { slug: "winback_email_3", label: "Email 3" },
        ],
      },
      {
        id: "flow_etapas_envio",
        slug: "flow_etapas_envio",
        label: "Etapas de Envio (5 emails)",
        order: 7,
        sub_items: [
          { slug: "envio_email_1", label: "Pedido Pago" },
          { slug: "envio_email_2", label: "Pedido em separação" },
          { slug: "envio_email_3", label: "Pedido em coleta" },
          { slug: "envio_email_4", label: "Atraso na Entrega" },
          { slug: "envio_email_5", label: "Pedido Enviado" },
        ],
      },
    ],
    deliverables_template: [
      // 1 export por flow (Figma + PDF agrupado). Required pra fechar a etapa.
      { slug: "export_welcome", label: "Welcome Flow - Figma + PDF", type: "upload", required: true },
      { slug: "export_site_abandoned", label: "Site Abandoned - Figma + PDF", type: "upload", required: true },
      { slug: "export_browse_abandoned", label: "Browse Abandoned - Figma + PDF", type: "upload", required: true },
      { slug: "export_carrinho_abandonado", label: "Carrinho Abandonado - Figma + PDF", type: "upload", required: true },
      { slug: "export_upsell", label: "Upsell - Figma + PDF", type: "upload", required: true },
      { slug: "export_winback", label: "Winback - Figma + PDF", type: "upload", required: true },
      { slug: "export_etapas_envio", label: "Etapas de Envio - Figma + PDF", type: "upload", required: true },
      { slug: "figma_full_link", label: "Figma master (todos os flows)", type: "url", required: false },
      { slug: "designer_notes", label: "Notas do designer", type: "textarea", required: false },
    ],
    whatsapp_template: null,
    automation_rules: [
      {
        trigger: "completed",
        action: "create_task",
        params: { title: "Configurar emails na Omnisend", assignee_role: "implementacao" },
      },
      { trigger: "completed", action: "generate_tutorial_token", params: {} },
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Implementacao na Omnisend",
    slug: "implementacao",
    position: 6,
    color: "#FBBF24",
    default_assignee_role: "implementacao",
    sla_hours: 36,
    checklist_template: [
      chk("impl_acesso_instrucoes", "Enviar instrucoes pra cliente criar conta Klaviyo/Omnisend", 1, { slug: "impl_acesso_instrucoes" }),
      chk("impl_dns", "Ensinar a configurar dominio + DKIM/SPF", 2, { slug: "impl_dns" }),
      chk("impl_welcome", "Configurar a automacao de Welcome Flow e subir os e-mails", 3, { slug: "impl_welcome" }),
      chk("impl_carrinho", "Configurar a automacao de Carrinho/checkout abandonado Flow e subir os e-mails", 4, { slug: "impl_carrinho" }),
      chk("impl_site_abandonado", "Configurar a automacao de Site abandonado Flow e subir os e-mails", 5, { slug: "impl_site_abandonado" }),
      chk("impl_browse_abandonado", "Configurar a automacao de Browse abandonado Flow e subir os e-mails", 6, { slug: "impl_browse_abandonado" }),
      chk("impl_post_purchase", "Configurar a automacao de Post Purchase e subir os e-mails", 7, { slug: "impl_post_purchase" }),
      chk("impl_winback", "Configurar a automacao de Winback e subir os e-mails", 8, { slug: "impl_winback" }),
      chk("impl_pedido_pago", "Configurar a automacao de Pedido pago e subir os e-mails", 9, { slug: "impl_pedido_pago" }),
      chk("impl_popup", "Implementar popup", 10, { slug: "impl_popup" }),
      chk("impl_teste_e2e", "Teste end-to-end (assinar lista + simular abandono)", 11, { slug: "impl_teste_e2e" }),
    ],
    deliverables_template: [
      { slug: "e2e_test_screenshot", label: "Teste end-to-end registrado (Print do email recebido na inbox de teste)", type: "upload", required: true },
      { slug: "active_automations_screenshot", label: "Print das automacoes ativas com data", type: "upload", required: true },
      // Read-only auto-populado pela automation generate_tutorial_token da Etapa 05.
      // Nao required (nao bloqueia avanco); fica visivel pro ops e cliente.
      { slug: "tutorial_link", label: "Link do tutorial publico", type: "url", required: false, helpText: "Auto-gerado pela Etapa 05" },
    ],
    whatsapp_template:
      "Oi {{client_name}}! Aqui e da equipe de implementacao da Convertfy. Vou cuidar da parte tecnica agora.\n\nCriei esse tutorial completo pra voce, com video e passo a passo:\n\n{{tutorial_link}}\n\nLa tem como criar conta na {{platform_name}}, compartilhar acesso e configurar DNS. Quando concluir, finalizo a config na plataforma.",
    automation_rules: [
      {
        trigger: "completed",
        action: "create_task",
        params: { title: "Notificar cliente da entrega", assignee_role: "suporte" },
      },
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Cliente ativo - Handoff pro time de Acompanhamento",
    slug: "cliente_ativo",
    position: 7,
    color: "#22C55E",
    is_final: true,
    // Matriz: cliente_ativo é responsabilidade do designer (handoff final).
    default_assignee_role: "designer",
    sla_hours: 8,
    checklist_template: [
      chk("ativo_email_conta", "Email automatico \"Conta ativa\" enviado ao cliente", 1, {
        slug: "ativo_email_conta",
        auto_complete_on: { event: "email_sent", template_slug: "conta_ativa" },
      }),
      // TODO(sprint-futura): integrar com modulo de Acompanhamento criando
      // weekly_reports row vazio (state=ramp-up) via fire-and-forget quando
      // este item for marcado. Hoje fica manual — estrategista vai em
      // /admin/stores/[id]/acompanhamento e cria/edita o registro.
      chk("ativo_acompanhamento_record", "Criar registro inicial no Acompanhamento (estado: Ramp-up)", 2, { slug: "ativo_acompanhamento_record" }),
      chk("ativo_call_30d", "Agendar primeira call mensal de alinhamento (em 30d)", 3, { slug: "ativo_call_30d" }),
    ],
    deliverables_template: [
      // Manuais e opcionais — fechamento por mudanca de status manual.
      // Antes existiam required (delivery_screenshot, first_checkin_date,
      // client_confirmed); removidos pra permitir handoff flexivel pelo
      // estrategista sem bloqueios.
      { slug: "delivery_screenshot", label: "Print da mensagem de entrega (opcional)", type: "upload", required: false },
      { slug: "first_checkin_date", label: "Data do primeiro check-in (opcional)", type: "date", required: false },
    ],
    whatsapp_template:
      "{{client_name}}, comunicamos: sua maquina de email marketing da {{store_name}} esta oficialmente ATIVA.\n\nWelcome flow rodando, dominio verificado, tudo testado e aprovado.\n\nA partir de agora, acompanhamos resultados mensalmente. Ja agendei nossa primeira call.\n\nVamos pra cima!",
    automation_rules: [
      { trigger: "completed", action: "send_notification", params: { to_role: "owner", message: "Loja {{store_name}} ATIVA" } },
    ],
  },
]

const TUTORIAL_DEFAULT_SLUG = "onboarding-implementacao"

interface TutorialBlockSeed {
  type: string
  content: Record<string, unknown>
}

const TUTORIAL_DEFAULT_BLOCKS: TutorialBlockSeed[] = [
  {
    type: "text",
    content: {
      markdown:
        "# Tutorial de implementacao\n\nOla **{{client_name}}**! Esse e o passo a passo pra deixar sua maquina de email marketing da **{{store_name}}** funcionando 100%.\n\nVai levar uns 15-20 minutos. Qualquer travamento, mande mensagem no nosso grupo do WhatsApp.",
    },
  },
  {
    type: "step",
    content: {
      number: 1,
      title: "Acesso a {{platform_name}}",
      description_markdown:
        "Se voce ainda nao tem conta na plataforma de email marketing, **crie agora gratuitamente** e compartilhe acesso com a Convertfy:\n\n- Email pra compartilhar: `acessos@convertfy.me`\n- Permissao recomendada: **Admin** (precisamos configurar flows e dominio)",
    },
  },
  {
    type: "step",
    content: {
      number: 2,
      title: "Configurar DNS (SPF, DKIM, DMARC)",
      description_markdown:
        "Pra seus emails nao caírem no spam, precisamos validar 3 registros DNS no provedor da sua loja (Cloudflare, Registro.br, GoDaddy, etc).\n\n**SPF**: autoriza nossos servidores a enviar emails em nome do seu dominio.\n\n**DKIM**: assina digitalmente cada email pra provar autenticidade.\n\n**DMARC**: politica de o que fazer com emails que falham SPF/DKIM.\n\nA {{platform_name}} vai mostrar os 3 registros pra voce copiar no painel de DNS.",
    },
  },
  {
    type: "faq",
    content: {
      items: [
        {
          question: "Quanto tempo leva pra DNS propagar?",
          answer_markdown:
            "Geralmente **15 minutos a 4 horas**. Em casos raros pode levar 24h. Se passar disso, manda mensagem no grupo que a gente investiga.",
        },
        {
          question: "Posso editar os emails depois da implementacao?",
          answer_markdown:
            "Sim! Como voce tem acesso admin a plataforma, pode editar qualquer coisa. Mas recomendamos avisar a gente antes de mexer em flows ja ativos, pra nao quebrar metricas.",
        },
        {
          question: "E se eu travar em alguma etapa?",
          answer_markdown:
            "Manda print do erro no nosso grupo do WhatsApp. A equipe de Ops responde rapido.",
        },
      ],
    },
  },
  {
    type: "cta_whatsapp",
    content: {
      label: "Falar com nossa equipe de Ops",
      message_prefill:
        "Oi! Estou seguindo o tutorial de implementacao da {{store_name}} e travei em [descreva onde]:",
    },
  },
]

export interface BootstrapResult {
  pipelineId: string
  columnIds: Record<string, string> // slug → id
  tutorialPageId: string
}

// Cache em memoria de quando o bootstrap completo (com re-sync de seed)
// rodou por org neste processo. TTL curto pra cobrir deploys — mesmo padrao
// do lazy re-sync em /api/productivity.
const SEED_SYNC_TTL_MS = 5 * 60 * 1000
const seedSyncAtByOrg = new Map<string, number>()

/**
 * Checagem barata (somente leitura) de que a org ja tem pipeline onboarding
 * ativo, todas as colunas-semente e o tutorial default.
 * Retorna o BootstrapResult quando completo, null caso contrario.
 */
export async function isOnboardingBootstrapped(
  orgId: string,
): Promise<BootstrapResult | null> {
  const admin = createAdminClient()

  const [pipeRes, tutRes] = await Promise.all([
    admin
      .from("operational_pipelines")
      .select("id, operational_pipeline_columns(id, slug)")
      .eq("org_id", orgId)
      .eq("type", "onboarding")
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("tutorial_pages")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", TUTORIAL_DEFAULT_SLUG)
      .maybeSingle(),
  ])

  const pipe = pipeRes.data as
    | { id: string; operational_pipeline_columns: Array<{ id: string; slug: string }> | null }
    | null
  const tutorialPageId = tutRes.data?.id
  if (!pipe?.id || !tutorialPageId) return null

  const columnIds: Record<string, string> = {}
  for (const c of pipe.operational_pipeline_columns ?? []) columnIds[c.slug] = c.id
  if (SEED_COLUMNS.some((s) => !columnIds[s.slug])) return null

  return { pipelineId: pipe.id, columnIds, tutorialPageId }
}

/**
 * Variante pra caminhos de leitura (GET): valida com uma checagem barata e,
 * quando o TTL do re-sync expirou, dispara o bootstrap completo (UPDATEs de
 * seed) em BACKGROUND via after() — o GET nao paga mais os ~13 round-trips
 * bloqueantes. O re-sync completo continua garantido a cada deploy/cold
 * start (fast check falha → caminho sincrono) e a cada SEED_SYNC_TTL_MS por
 * org (em background). Janela aceita: o primeiro GET apos um deploy que
 * mudou SEED_COLUMNS pode servir os valores antigos das colunas uma vez;
 * auto-corrige no request seguinte. Servicos que precisam forcar o re-sync
 * (resync de templates/tasks) devem continuar chamando
 * ensureOnboardingBootstrap direto.
 */
export async function ensureOnboardingBootstrapForRead(
  orgId: string,
  userId: string | null = null,
): Promise<BootstrapResult> {
  const fast = await isOnboardingBootstrapped(orgId)
  if (fast) {
    const syncedAt = seedSyncAtByOrg.get(orgId) ?? 0
    if (Date.now() - syncedAt >= SEED_SYNC_TTL_MS) {
      // set ANTES do dispatch: evita stampede de re-syncs no mesmo processo.
      // Em falha, desfaz o timestamp para o proximo request re-tentar (o
      // caminho sincrono antigo so avancava o TTL apos sucesso).
      seedSyncAtByOrg.set(orgId, Date.now())
      after(() =>
        ensureOnboardingBootstrap(orgId, userId).catch((err) => {
          seedSyncAtByOrg.delete(orgId)
          log.warn("background seed re-sync failed", { orgId, err })
        }),
      )
    }
    return fast
  }
  // Cold start (org sem pipeline/colunas/tutorial): o GET precisa das
  // colunas existirem — bootstrap completo continua sincrono.
  const result = await ensureOnboardingBootstrap(orgId, userId)
  seedSyncAtByOrg.set(orgId, Date.now())
  return result
}

/**
 * Garante que org tem pipeline + colunas + tutorial default.
 * Idempotente: chama múltiplas vezes sem duplicar.
 */
export async function ensureOnboardingBootstrap(
  orgId: string,
  userId: string | null = null,
): Promise<BootstrapResult> {
  const admin = createAdminClient()

  // 1. Pipeline
  let pipelineId: string
  const { data: existingPipe } = await admin
    .from("operational_pipelines")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "onboarding")
    .eq("is_active", true)
    .maybeSingle()

  if (existingPipe?.id) {
    pipelineId = existingPipe.id
  } else {
    const { data: newPipe, error: pipeErr } = await admin
      .from("operational_pipelines")
      .insert({
        org_id: orgId,
        type: "onboarding",
        name: "Onboarding de Novos Clientes",
        slug: "onboarding",
        description: "Pipeline padrao de onboarding de novas lojas",
        is_active: true,
        created_by: userId,
      })
      .select("id")
      .single()
    if (pipeErr || !newPipe) {
      throw new Error(`Falha bootstrap pipeline: ${pipeErr?.message}`)
    }
    pipelineId = newPipe.id
  }

  // 2. Colunas (idempotente por slug)
  const { data: existingCols } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug")
    .eq("pipeline_id", pipelineId)
  const existingSlugs = new Set((existingCols ?? []).map((c) => c.slug))
  const colsToInsert = SEED_COLUMNS.filter((c) => !existingSlugs.has(c.slug)).map((c) => ({
    pipeline_id: pipelineId,
    name: c.name,
    slug: c.slug,
    position: c.position,
    color: c.color,
    is_initial: c.is_initial ?? false,
    is_final: c.is_final ?? false,
    checklist_template: c.checklist_template,
    deliverables_template: c.deliverables_template,
    whatsapp_template: c.whatsapp_template,
    default_assignee_role: c.default_assignee_role,
    sla_hours: c.sla_hours,
    automation_rules: c.automation_rules,
  }))

  if (colsToInsert.length > 0) {
    const { error: colsErr } = await admin
      .from("operational_pipeline_columns")
      .insert(colsToInsert)
    if (colsErr) log.warn("Insert colunas falhou", { code: colsErr.code, msg: colsErr.message })
  }

  // 2b. Re-sync de templates pra colunas que ja existiam.
  // Necessario porque hoje nao ha UI pra editar colunas — todas vem do SEED.
  // Atualiza name, templates e automation_rules em cada deploy, garantindo
  // que mudancas no SEED_COLUMNS propaguem pra orgs antigas. Nao toca em
  // tasks/checklists ja instanciadas (essas usam snapshot do template).
  await Promise.all(
    SEED_COLUMNS.filter((seed) => existingSlugs.has(seed.slug)).map(async (seed) => {
      const { error: upErr } = await admin
        .from("operational_pipeline_columns")
        .update({
          name: seed.name,
          position: seed.position,
          color: seed.color,
          is_initial: seed.is_initial ?? false,
          is_final: seed.is_final ?? false,
          checklist_template: seed.checklist_template,
          deliverables_template: seed.deliverables_template,
          whatsapp_template: seed.whatsapp_template,
          default_assignee_role: seed.default_assignee_role,
          sla_hours: seed.sla_hours,
          automation_rules: seed.automation_rules,
        })
        .eq("pipeline_id", pipelineId)
        .eq("slug", seed.slug)
      if (upErr) log.warn("Re-sync coluna falhou", { slug: seed.slug, code: upErr.code, msg: upErr.message })
    }),
  )

  // Re-fetch para mapear slug → id
  const { data: allCols } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug")
    .eq("pipeline_id", pipelineId)
  const columnIds: Record<string, string> = {}
  for (const c of allCols ?? []) columnIds[c.slug] = c.id

  // 3. Tutorial page default
  let tutorialPageId: string
  const { data: existingTut } = await admin
    .from("tutorial_pages")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", TUTORIAL_DEFAULT_SLUG)
    .maybeSingle()

  if (existingTut?.id) {
    tutorialPageId = existingTut.id
  } else {
    const { data: newTut, error: tutErr } = await admin
      .from("tutorial_pages")
      .insert({
        org_id: orgId,
        slug: TUTORIAL_DEFAULT_SLUG,
        name: "Tutorial de Implementacao",
        description: "Guia passo a passo pro cliente na fase de implementacao",
        status: "published",
        current_version: 1,
        created_by: userId,
      })
      .select("id")
      .single()
    if (tutErr || !newTut) {
      throw new Error(`Falha bootstrap tutorial: ${tutErr?.message}`)
    }
    tutorialPageId = newTut.id

    // Inserir blocks default
    const blockRows = TUTORIAL_DEFAULT_BLOCKS.map((b, i) => ({
      page_id: tutorialPageId,
      type: b.type,
      position: i,
      content: b.content,
    }))
    await admin.from("tutorial_blocks").insert(blockRows)
  }

  return { pipelineId, columnIds, tutorialPageId }
}
