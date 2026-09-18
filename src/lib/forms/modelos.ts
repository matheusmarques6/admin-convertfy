/**
 * Os modelos do "Novo formulário" — o que "Começar de" oferece.
 *
 * Cada modelo é a LISTA DE CAMPOS (o que vira linha em `crm_form_fields`)
 * mais o RASCUNHO do schema (o que só existe no schema: tela de abertura,
 * agrupamento, pontos, desvios, finais). Os dois se encontram pelo
 * `ref` provisório: o POST insere os campos, recebe os ids na ordem das
 * posições e troca os provisórios pelo id real (`mapaPorPosicao` +
 * `remapearRefs`), a MESMA mecânica do PATCH do editor. Sem isso a
 * regra "faturamento baixo → final abaixo do corte" nasceria apontando
 * para um endereço que nunca existirá, e a publicação a descartaria.
 *
 * Os textos são de partida — o modal diz "você pode mudar tudo depois".
 * Puro: sem I/O.
 */

import type { FormBlock, FormEnding, FormSchema } from "@/types/forms-conversational"

export const MODELOS_IDS = ["zero", "diag", "aplic", "contato", "nps", "cancel"] as const
export type ModeloId = (typeof MODELOS_IDS)[number]

export interface ModeloDeFormulario {
  id: ModeloId
  titulo: string
  descricao: string
  /** Etiqueta curta e a cor do quadradinho, como no handoff. */
  tag: string
  cor: string
  /** Quantas telas o visitante percorre no conversacional. */
  telas: number
}

export const MODELOS: readonly ModeloDeFormulario[] = [
  { id: "zero", titulo: "Do zero", descricao: "Nome e WhatsApp. Você monta o resto.", tag: "Básico", cor: "#6B7280", telas: 1 },
  { id: "diag", titulo: "Diagnóstico", descricao: "Qualifica loja por faturamento e dor, com desvios.", tag: "Tráfego pago", cor: "#4E62D8", telas: 7 },
  { id: "aplic", titulo: "Aplicação", descricao: "Filtro de fit + agenda de call no final.", tag: "Vendas", cor: "#7C3AED", telas: 5 },
  { id: "contato", titulo: "Contato rápido", descricao: "Três campos para bio do Instagram.", tag: "Embed", cor: "#0F766E", telas: 1 },
  { id: "nps", titulo: "NPS pós-compra", descricao: "Escala 0–10 + motivo, dispara CS se ≤ 6.", tag: "CS", cor: "#D97706", telas: 3 },
  { id: "cancel", titulo: "Pesquisa de cancelamento", descricao: "Motivo, oferta de retenção e confirmação.", tag: "CS", cor: "#DB2777", telas: 4 },
]

/** Uma linha de `crm_form_fields`, como o POST a insere. */
export interface CampoDoModelo {
  temp_ref: string
  field_type: FormBlock["type"]
  label: string
  placeholder?: string | null
  description?: string | null
  required: boolean
  options?: Array<{ label: string; value: string }>
  validation?: Record<string, unknown>
  map_to_lead_field?: string | null
}

export interface ModeloMontado {
  campos: CampoDoModelo[]
  /** Rascunho com os `ref` PROVISÓRIOS (os `temp_ref` dos campos). */
  draft_schema: FormSchema
}

const opcoes = (...labels: string[]) => labels.map((l) => ({ label: l, value: l }))

const contato = (): { campos: CampoDoModelo[]; blocks: FormBlock[] } => {
  const campos: CampoDoModelo[] = [
    { temp_ref: "nome", field_type: "text", label: "Nome", placeholder: "Seu primeiro nome", required: true, map_to_lead_field: "first_name" },
    { temp_ref: "whatsapp", field_type: "phone", label: "WhatsApp", placeholder: "(11) 99999-9999", required: true, validation: { countryCode: true }, map_to_lead_field: "phone" },
    { temp_ref: "email", field_type: "email", label: "E-mail", placeholder: "voce@sualoja.com", required: true, map_to_lead_field: "email" },
  ]
  const blocks: FormBlock[] = [
    { ref: "nome", type: "text", label: "Nome", alias: "nome", required: true, titulo_da_tela: "Para começar, como falamos com você?" },
    { ref: "whatsapp", type: "phone", label: "WhatsApp", alias: "whatsapp", required: true, mesma_tela: true },
    { ref: "email", type: "email", label: "E-mail", alias: "email", required: true, mesma_tela: true },
  ]
  return { campos, blocks }
}

const finalPadrao = (extra?: Partial<FormEnding>): FormEnding => ({
  ref: "ok",
  title: "Pronto, {{nome}}. Recebemos suas respostas.",
  description: "Em até 1 hora útil alguém do time chama você no WhatsApp.",
  ...extra,
})

function schema(
  blocks: FormBlock[],
  endings: FormEnding[],
  displayMode: "classic" | "conversational",
  welcome?: NonNullable<FormSchema["settings"]>["welcome"],
): FormSchema {
  return {
    version: 0,
    display_mode: displayMode,
    locale: "pt-BR",
    blocks,
    endings,
    hidden_fields: [],
    settings: { mostrar_progresso: true, enter_avanca: true, ...(welcome ? { welcome } : {}) },
  }
}

/** Monta campos + rascunho de um modelo no formato pedido. */
export function montarModelo(id: ModeloId, displayMode: "classic" | "conversational"): ModeloMontado {
  switch (id) {
    case "zero": {
      const campos: CampoDoModelo[] = [
        { temp_ref: "nome", field_type: "text", label: "Nome", placeholder: "Seu primeiro nome", required: true, map_to_lead_field: "first_name" },
        { temp_ref: "whatsapp", field_type: "phone", label: "WhatsApp", placeholder: "(11) 99999-9999", required: true, validation: { countryCode: true }, map_to_lead_field: "phone" },
      ]
      const blocks: FormBlock[] = [
        { ref: "nome", type: "text", label: "Nome", alias: "nome", required: true, titulo_da_tela: "Como falamos com você?" },
        { ref: "whatsapp", type: "phone", label: "WhatsApp", alias: "whatsapp", required: true, mesma_tela: true },
      ]
      return { campos, draft_schema: schema(blocks, [finalPadrao()], displayMode) }
    }
    case "contato": {
      const c = contato()
      return {
        campos: c.campos,
        draft_schema: schema(c.blocks, [finalPadrao({ destino: { tipo: "whatsapp", rotulo: "Falar agora no WhatsApp" } })], displayMode),
      }
    }
    case "diag": {
      const c = contato()
      const campos: CampoDoModelo[] = [
        ...c.campos,
        { temp_ref: "loja", field_type: "url", label: "Endereço da loja", placeholder: "https://sualoja.com", required: true, map_to_lead_field: "custom_deal:url_da_sua_loja" },
        { temp_ref: "instagram", field_type: "text", label: "@ do Instagram", placeholder: "@sualoja", required: false, map_to_lead_field: "custom_deal:qual_seu_instagram" },
        { temp_ref: "plataforma", field_type: "radio", label: "Para onde a sua loja vende hoje?", required: true, options: opcoes("Shopify", "Nuvemshop", "VTEX", "WooCommerce", "Outra") },
        { temp_ref: "faturamento", field_type: "radio", label: "Qual o faturamento mensal médio?", required: true, options: opcoes("Até R$ 30 mil", "R$ 30–100 mil", "R$ 100–500 mil", "Acima de R$ 500 mil"), map_to_lead_field: "custom_deal:faturamento_medio_mensal" },
        { temp_ref: "dor", field_type: "multi_select", label: "O que mais trava o crescimento hoje?", required: true, options: opcoes("Tráfego pago caro", "Baixa conversão", "Recompra fraca", "Time pequeno", "Não sei medir") },
        { temp_ref: "urgencia", field_type: "nps", label: "De 0 a 10, quanto você quer resolver isso nos próximos 30 dias?", required: true },
        { temp_ref: "orcamento", field_type: "yes_no", label: "Nosso trabalho começa em R$ 2.500/mês. Faz sentido conversar?", required: true },
      ]
      const blocks: FormBlock[] = [
        ...c.blocks,
        { ref: "loja", type: "url", label: "Endereço da loja", alias: "loja", required: true, titulo_da_tela: "Prazer, {{nome}}. Onde fica a sua loja?" },
        { ref: "instagram", type: "text", label: "@ do Instagram", alias: "instagram", required: false, mesma_tela: true },
        { ref: "plataforma", type: "radio", label: "Para onde a sua loja vende hoje?", alias: "plataforma", required: true, options: opcoes("Shopify", "Nuvemshop", "VTEX", "WooCommerce", "Outra") },
        {
          ref: "faturamento",
          type: "radio",
          label: "Qual o faturamento mensal médio?",
          alias: "faturamento",
          required: true,
          options: opcoes("Até R$ 30 mil", "R$ 30–100 mil", "R$ 100–500 mil", "Acima de R$ 500 mil"),
          pontos: { "Até R$ 30 mil": 0, "R$ 30–100 mil": 2, "R$ 100–500 mil": 4, "Acima de R$ 500 mil": 5 },
          logic: [{ conditions: [{ ref: "faturamento", operator: "in", value: ["Até R$ 30 mil"] }], logic: "or", goto: "ending:abaixo-do-corte" }],
        },
        {
          ref: "dor",
          type: "multi_select",
          label: "O que mais trava o crescimento hoje?",
          alias: "dor",
          required: true,
          options: opcoes("Tráfego pago caro", "Baixa conversão", "Recompra fraca", "Time pequeno", "Não sei medir"),
          logic: [{ conditions: [{ ref: "dor", operator: "in", value: ["Não sei medir"] }], logic: "or", goto: "ending:sem-fit" }],
        },
        { ref: "urgencia", type: "nps", label: "De 0 a 10, quanto você quer resolver isso nos próximos 30 dias?", alias: "nota", required: true, escala: { min_label: "Nem um pouco", max_label: "Urgente" } },
        {
          ref: "orcamento",
          type: "yes_no",
          label: "Nosso trabalho começa em R$ 2.500/mês. Faz sentido conversar?",
          alias: "orcamento",
          required: true,
          logic: [{ conditions: [{ ref: "orcamento", operator: "equals", value: "nao" }], logic: "or", goto: "ending:sem-orcamento" }],
        },
      ]
      const endings: FormEnding[] = [
        finalPadrao({ title: "Pronto, {{nome}}. Recebemos seu diagnóstico.", destino: { tipo: "whatsapp", rotulo: "Falar agora no WhatsApp" } }),
        { ref: "abaixo-do-corte", title: "Obrigado, {{nome}}.", description: "Sua loja ainda está na fase de tração. Preparamos um material gratuito para esse momento.", disqualified: true, cria_negocio: false },
        { ref: "sem-fit", title: "Valeu, {{nome}}.", description: "Sem problema. Quando fizer sentido, é só voltar aqui.", disqualified: true, cria_negocio: false },
        { ref: "sem-orcamento", title: "Obrigado pela sinceridade, {{nome}}.", description: "Vamos te enviar o diagnóstico por e-mail para você olhar com calma.", disqualified: true },
      ]
      return {
        campos,
        draft_schema: schema(blocks, endings, displayMode, {
          title: "Diagnóstico gratuito da sua loja",
          description: "Leva 2 minutos. No final você recebe um plano de ação por WhatsApp.",
          button_label: "Começar",
        }),
      }
    }
    case "aplic": {
      const c = contato()
      const campos: CampoDoModelo[] = [
        ...c.campos,
        { temp_ref: "loja", field_type: "url", label: "Qual o link da sua loja?", placeholder: "https://sualoja.com", required: true, map_to_lead_field: "custom_deal:url_da_sua_loja" },
        { temp_ref: "operacao", field_type: "radio", label: "E como é a sua operação hoje?", required: true, options: opcoes("Marca própria, vendendo todo dia", "Dropshipping, vendendo todo dia", "Tenho loja, mas as vendas são irregulares", "Não tenho loja própria") },
        { temp_ref: "faturamento", field_type: "radio", label: "Quanto a loja fatura por mês hoje?", required: true, options: opcoes("Até R$ 100 mil", "R$ 100–200 mil", "R$ 200–500 mil", "R$ 500 mil – 1 milhão", "Acima de R$ 1 milhão"), map_to_lead_field: "custom_deal:faturamento_medio_mensal" },
        { temp_ref: "compromisso", field_type: "yes_no", label: "Se a sua aplicação for aprovada, você se compromete a estar na chamada no horário que escolher?", required: true },
      ]
      const blocks: FormBlock[] = [
        ...c.blocks,
        { ref: "loja", type: "url", label: "{{nome}}, qual o link da sua loja?", alias: "loja", required: true },
        {
          ref: "operacao",
          type: "radio",
          label: "E como é a sua operação hoje?",
          alias: "operacao",
          required: true,
          options: opcoes("Marca própria, vendendo todo dia", "Dropshipping, vendendo todo dia", "Tenho loja, mas as vendas são irregulares", "Não tenho loja própria"),
          logic: [{ conditions: [{ ref: "operacao", operator: "in", value: ["Não tenho loja própria"] }], logic: "or", goto: "ending:sem-fit" }],
        },
        {
          ref: "faturamento",
          type: "radio",
          label: "Quanto a loja fatura por mês hoje?",
          alias: "faturamento",
          required: true,
          options: opcoes("Até R$ 100 mil", "R$ 100–200 mil", "R$ 200–500 mil", "R$ 500 mil – 1 milhão", "Acima de R$ 1 milhão"),
          pontos: { "Até R$ 100 mil": 0, "R$ 100–200 mil": 1, "R$ 200–500 mil": 3, "R$ 500 mil – 1 milhão": 4, "Acima de R$ 1 milhão": 5 },
        },
        {
          ref: "compromisso",
          type: "yes_no",
          label: "Se a sua aplicação for aprovada, você se compromete a estar na chamada no horário que escolher?",
          alias: "compromisso",
          required: true,
          logic: [{ conditions: [{ ref: "compromisso", operator: "equals", value: "nao" }], logic: "or", goto: "ending:sem-compromisso" }],
        },
      ]
      const endings: FormEnding[] = [
        { ref: "aprovado", title: "Aprovado, {{nome}}. Escolha o horário da sua call.", description: "A agenda abaixo é a nossa — o horário fica reservado na hora.", destino: { tipo: "agenda", rotulo: "Agendar diagnóstico" } },
        { ref: "sem-fit", title: "Valeu, {{nome}}.", description: "A gente trabalha em cima de base e histórico de compra. Quando a loja estiver vendendo, volte a falar com a gente.", disqualified: true, cria_negocio: false },
        { ref: "sem-compromisso", title: "Sem problema, {{nome}}.", description: "Quando tiver um horário que consiga garantir, é só voltar aqui.", disqualified: true },
      ]
      return { campos, draft_schema: schema(blocks, endings, displayMode) }
    }
    case "nps": {
      const campos: CampoDoModelo[] = [
        { temp_ref: "nota", field_type: "nps", label: "De 0 a 10, o quanto você recomendaria a gente para um amigo?", required: true },
        { temp_ref: "motivo", field_type: "textarea", label: "O que pesou mais na sua nota?", placeholder: "Conte com detalhes…", required: false },
        { temp_ref: "email", field_type: "email", label: "Seu e-mail, para a gente responder", placeholder: "voce@email.com", required: true, map_to_lead_field: "email" },
      ]
      const blocks: FormBlock[] = [
        {
          ref: "nota",
          type: "nps",
          label: "De 0 a 10, o quanto você recomendaria a gente para um amigo?",
          alias: "nota",
          required: true,
          escala: { min_label: "Nem um pouco", max_label: "Com certeza" },
          pontos: { "9": 2, "10": 2 },
        },
        { ref: "motivo", type: "textarea", label: "O que pesou mais na sua nota?", alias: "motivo", required: false },
        {
          ref: "email",
          type: "email",
          label: "Seu e-mail, para a gente responder",
          alias: "email",
          required: true,
          logic: [{ conditions: [{ ref: "nota", operator: "lte", value: 6 }], logic: "or", goto: "ending:cs" }],
        },
      ]
      const endings: FormEnding[] = [
        { ref: "ok", title: "Obrigado pela nota!", description: "A sua resposta ajuda a gente a melhorar." },
        { ref: "cs", title: "Obrigado pela sinceridade.", description: "Alguém do nosso time vai te chamar para entender o que aconteceu.", tags: ["nps-detrator"] },
      ]
      return { campos, draft_schema: schema(blocks, endings, displayMode) }
    }
    case "cancel": {
      const campos: CampoDoModelo[] = [
        { temp_ref: "motivo", field_type: "radio", label: "O que pesou na decisão de cancelar?", required: true, options: opcoes("Preço", "Não vi resultado", "Falta de atendimento", "Mudei de plataforma", "Outro") },
        { temp_ref: "detalhe", field_type: "textarea", label: "Quer contar mais?", required: false },
        { temp_ref: "oferta", field_type: "yes_no", label: "Se a gente resolvesse isso nos próximos 30 dias, você ficaria?", required: true },
        { temp_ref: "email", field_type: "email", label: "Seu e-mail", required: true, map_to_lead_field: "email" },
      ]
      const blocks: FormBlock[] = [
        { ref: "motivo", type: "radio", label: "O que pesou na decisão de cancelar?", alias: "motivo", required: true, options: opcoes("Preço", "Não vi resultado", "Falta de atendimento", "Mudei de plataforma", "Outro"), outro: true },
        { ref: "detalhe", type: "textarea", label: "Quer contar mais?", alias: "detalhe", required: false },
        {
          ref: "oferta",
          type: "yes_no",
          label: "Se a gente resolvesse isso nos próximos 30 dias, você ficaria?",
          alias: "oferta",
          required: true,
          logic: [{ conditions: [{ ref: "oferta", operator: "equals", value: "sim" }], logic: "or", goto: "email" }],
          proximo: "ending:confirmado",
        },
        { ref: "email", type: "email", label: "Seu e-mail", alias: "email", required: true },
      ]
      const endings: FormEnding[] = [
        { ref: "retencao", title: "Combinado. Vamos te chamar.", description: "Alguém do time entra em contato em até 1 dia útil para resolver isso.", tags: ["retencao"] },
        { ref: "confirmado", title: "Cancelamento registrado.", description: "Obrigado pela sinceridade. As portas continuam abertas." },
      ]
      return { campos, draft_schema: schema(blocks, endings, displayMode) }
    }
  }
}
