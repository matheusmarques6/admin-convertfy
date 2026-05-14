/**
 * Bootstrap idempotente da pipeline de Onboarding por org.
 *
 * Cria 1 pipeline `onboarding` + 7 colunas com templates inline
 * (checklist, deliverables, whatsapp, automacoes) na primeira chamada.
 * Tambem garante 1 tutorial_page padrao publicada.
 *
 * Todos os textos vieram do PRD v2 (PRD-onboarding-convertfy.md secao 5).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  AutomationRule,
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

function chk(id: string, label: string, order: number): ChecklistItem {
  return { id, label, order }
}

const SEED_COLUMNS: ColumnSeed[] = [
  {
    name: "Entrada",
    slug: "entrada",
    position: 1,
    color: "#0EA5E9",
    is_initial: true,
    default_assignee_role: "cs",
    sla_hours: 2,
    checklist_template: [
      chk("c1", "Cliente cadastrado no admin com dados basicos", 1),
      chk("c2", "Loja vinculada ao cliente (URL e plataforma)", 2),
      chk("c3", "Grupo WhatsApp criado com cliente + time", 3),
      chk("c4", "Mensagem de boas-vindas enviada no grupo", 4),
      chk("c5", "Link unico do formulario enviado ao cliente", 5),
      chk("c6", "Instrucoes pra cliente criar conta Klaviyo/Omnisend", 6),
      chk("c7", "Link de pagamento Asaas gerado e enviado", 7),
    ],
    deliverables_template: [
      { slug: "whatsapp_group_screenshot", label: "Print do grupo WhatsApp", type: "upload", required: false },
      { slug: "contract_status", label: "Status do contrato", type: "select", required: true, options: ["pending", "sent", "signed"] },
    ],
    whatsapp_template:
      "Ola {{client_name}}! Seja muito bem-vindo a Convertfy.\n\nEsse e nosso grupo oficial pra acompanhar todo o processo da {{store_name}}.\n\nPrimeiro passo: responda esse formulario (5 minutos):\n{{form_url}}\n\nA IA gera um briefing direto no proprio formulario pra voce revisar.",
    automation_rules: [
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Cliente preenchendo formulario",
    slug: "cliente_formulario",
    position: 2,
    color: "#6366F1",
    default_assignee_role: "cs",
    sla_hours: 72,
    checklist_template: [
      chk("c1", "Formulario enviado ao cliente", 1),
      chk("c2", "Cliente abriu o link", 2),
      chk("c3", "Cliente preencheu Tela 1 (dados da loja)", 3),
      chk("c4", "IA gerou briefing inline", 4),
      chk("c5", "Cliente revisou e confirmou o briefing", 5),
      chk("c6", "Dominio confirmado pelo cliente", 6),
    ],
    deliverables_template: [
      { slug: "form_responses", label: "Respostas do formulario", type: "textarea", required: true },
      { slug: "briefing_approved", label: "Briefing aprovado pelo cliente", type: "checkbox", required: true },
      { slug: "store_url_confirmed", label: "URL da loja confirmada", type: "url", required: true },
    ],
    whatsapp_template: null,
    automation_rules: [
      { trigger: "form_submitted", action: "generate_briefing", params: {} },
      { trigger: "briefing_confirmed", action: "advance_to_next", params: {} },
      {
        trigger: "briefing_confirmed",
        action: "send_notification",
        params: { to_role: "estrategista", message: "Briefing aprovado por {{client_name}} ({{store_name}})" },
      },
    ],
  },
  {
    name: "Preview em producao",
    slug: "preview_producao",
    position: 3,
    color: "#A855F7",
    default_assignee_role: "designer",
    sla_hours: 48,
    checklist_template: [
      chk("c1", "Briefing aprovado lido e validado", 1),
      chk("c2", "Copy do email de preview revisada", 2),
      chk("c3", "Paleta da marca aplicada", 3),
      chk("c4", "Mobile e desktop renderizados e checados", 4),
      chk("c5", "Links e CTAs apontando pra URLs corretas", 5),
      chk("c6", "Spell check completo", 6),
      chk("c7", "Preview exportado em PDF e PNG", 7),
    ],
    deliverables_template: [
      { slug: "figma_link", label: "Link do Figma", type: "url", required: true, validation: "figma" },
      { slug: "preview_pdf", label: "Preview em PDF", type: "upload", required: true },
      { slug: "preview_png", label: "Preview em PNG", type: "upload", required: false },
      { slug: "language", label: "Idioma da entrega", type: "select", required: true, options: ["pt-BR", "en-US", "es", "fr"] },
      { slug: "designer_notes", label: "Notas do designer", type: "textarea", required: false },
    ],
    whatsapp_template: null,
    automation_rules: [
      {
        trigger: "completed",
        action: "create_task",
        params: { title: "Enviar preview pro cliente", assignee_role: "estrategista" },
      },
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Aprovacao do preview",
    slug: "preview_aprovacao",
    position: 4,
    color: "#F59E0B",
    default_assignee_role: "estrategista",
    sla_hours: 48,
    checklist_template: [
      chk("c1", "Preview enviado ao cliente no grupo WhatsApp", 1),
      chk("c2", "Cliente confirmou recebimento", 2),
      chk("c3", "Cliente respondeu (aprovou ou pediu ajustes)", 3),
      chk("c4", "Resposta documentada de forma estruturada", 4),
    ],
    deliverables_template: [
      {
        slug: "client_response_status",
        label: "Status da resposta",
        type: "select",
        required: true,
        options: ["aprovado", "ajustes_solicitados", "sem_resposta"],
      },
      { slug: "client_feedback", label: "Feedback estruturado (se ajustes)", type: "textarea", required: false },
      {
        slug: "feedback_severity",
        label: "Severidade dos ajustes",
        type: "select",
        required: false,
        options: ["small", "medium", "rework_part", "rework_all"],
      },
      { slug: "whatsapp_response_screenshot", label: "Print da resposta no WhatsApp", type: "upload", required: false },
    ],
    whatsapp_template:
      "Oi {{client_name}}! Acabamos o preview do welcome flow da {{store_name}}. Esse e o template base que guia os outros emails:\n\nFigma: {{figma_link}}\n\nOlha com calma e me da retorno. Se tiver ajuste, manda detalhado.",
    automation_rules: [
      {
        trigger: "completed",
        action: "advance_to_next",
        params: { only_if: { client_response_status: "aprovado" } },
      },
      {
        trigger: "completed",
        action: "go_back_to",
        params: {
          only_if: { client_response_status: "ajustes_solicitados" },
          target_slug: "preview_producao",
          increment_version: true,
        },
      },
    ],
  },
  {
    name: "Emails finais em producao",
    slug: "emails_finais",
    position: 5,
    color: "#10B981",
    default_assignee_role: "designer",
    sla_hours: 60,
    checklist_template: [
      chk("c1", "Preview aprovado lido como referencia", 1),
      chk("c2", "Copies dos demais emails revisadas", 2),
      chk("c3", "Paleta e identidade visual replicadas", 3),
      chk("c4", "Mobile e desktop checados em todos", 4),
      chk("c5", "Links e CTAs corretos", 5),
      chk("c6", "Spell check completo", 6),
      chk("c7", "Todos os emails exportados (PDF + PNGs)", 7),
    ],
    deliverables_template: [
      { slug: "figma_full_link", label: "Figma completo com todos os emails", type: "url", required: true },
      { slug: "emails_pdf", label: "PDF agrupado", type: "upload", required: true },
      { slug: "designer_notes", label: "Notas do designer", type: "textarea", required: false },
    ],
    whatsapp_template: null,
    automation_rules: [
      {
        trigger: "completed",
        action: "create_task",
        params: { title: "Configurar emails na Omnisend", assignee_role: "ops" },
      },
      { trigger: "completed", action: "generate_tutorial_token", params: {} },
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Implementacao",
    slug: "implementacao",
    position: 6,
    color: "#FBBF24",
    default_assignee_role: "ops",
    sla_hours: 36,
    checklist_template: [
      chk("c1", "Acesso a Klaviyo/Omnisend recebido e validado", 1),
      chk("c2", "Tutorial publico enviado ao cliente", 2),
      chk("c3", "DNS configurado (SPF, DKIM, DMARC verificados)", 3),
      chk("c4", "Dominio verificado na plataforma", 4),
      chk("c5", "Todos os emails criados na plataforma", 5),
      chk("c6", "UTMs aplicadas em todos os CTAs", 6),
      chk("c7", "Teste de envio realizado", 7),
    ],
    deliverables_template: [
      { slug: "tutorial_link", label: "Link do tutorial publico", type: "url", required: true, helpText: "Auto-gerado" },
      { slug: "platform_credentials_received", label: "Credenciais recebidas", type: "checkbox", required: true },
      { slug: "flow_link", label: "Link do flow na plataforma", type: "url", required: true },
      { slug: "config_screenshot", label: "Print da config final", type: "upload", required: true },
      { slug: "test_log", label: "Log do teste de envio", type: "textarea", required: true },
      { slug: "dns_spf", label: "SPF validado", type: "checkbox", required: true },
      { slug: "dns_dkim", label: "DKIM validado", type: "checkbox", required: true },
      { slug: "dns_dmarc", label: "DMARC validado", type: "checkbox", required: true },
      { slug: "spam_score", label: "Resultado do teste de spam (0-10)", type: "numeric", required: false },
    ],
    whatsapp_template:
      "Oi {{client_name}}! Aqui e da equipe de implementacao da Convertfy. Vou cuidar da parte tecnica agora.\n\nCriei esse tutorial completo pra voce, com video e passo a passo:\n\n{{tutorial_link}}\n\nLa tem como criar conta na {{platform_name}}, compartilhar acesso e configurar DNS. Quando concluir, finalizo a config na plataforma.",
    automation_rules: [
      {
        trigger: "completed",
        action: "create_task",
        params: { title: "Notificar cliente da entrega", assignee_role: "estrategista" },
      },
      { trigger: "completed", action: "advance_to_next", params: {} },
    ],
  },
  {
    name: "Cliente ativo",
    slug: "cliente_ativo",
    position: 7,
    color: "#22C55E",
    is_final: true,
    default_assignee_role: "estrategista",
    sla_hours: 8,
    checklist_template: [
      chk("c1", "Mensagem de entrega final enviada", 1),
      chk("c2", "Cliente confirmou recebimento", 2),
      chk("c3", "Primeiro check-in semanal agendado", 3),
      chk("c4", "Onboarding marcado como completo", 4),
      chk("c5", "Status da loja atualizado pra ativa", 5),
    ],
    deliverables_template: [
      { slug: "delivery_screenshot", label: "Print da mensagem de entrega", type: "upload", required: true },
      { slug: "first_checkin_date", label: "Data do primeiro check-in", type: "date", required: true },
      { slug: "client_confirmed", label: "Cliente confirmou", type: "checkbox", required: true },
    ],
    whatsapp_template:
      "{{client_name}}, comunicamos: sua maquina de email marketing da {{store_name}} esta oficialmente ATIVA.\n\nWelcome flow rodando, dominio verificado, tudo testado e aprovado.\n\nA partir de agora, acompanhamos resultados semanalmente. Ja agendei nosso primeiro check-in.\n\nVamos pra cima!",
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
