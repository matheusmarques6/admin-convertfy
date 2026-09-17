/**
 * Sessões de formulário: quem abriu, até onde foi, o que respondeu.
 *
 * É a peça que responde a pergunta que o módulo inteiro existe para
 * responder — **onde exatamente a pessoa parou** — e que hoje não tem
 * resposta nenhuma: a base tem 56 envios e zero registro de quem abriu e
 * não enviou.
 *
 * ## O lead parcial NÃO nasce no autosave
 *
 * Marcar `contact_captured_at` é medição e acontece na hora. Criar o
 * lead no CRM é outra coisa: o vendedor que vê um lead novo LIGA. Criar
 * no instante em que a pessoa digita o email faria o telefone tocar
 * enquanto ela ainda está respondendo a terceira pergunta — que é o
 * jeito mais rápido de perder a venda e de queimar o time com a
 * ferramenta. Quem cria o lead parcial é o cron, depois da janela de
 * inatividade, e é por isso que `abandon_processed_at` existe.
 *
 * ## Escrita sempre por service role, nunca por anon
 *
 * A sessão é pública por natureza; a autorização é o token assinado
 * (`session-token.ts`) mais a guarda de origem (`origem.ts`). As tabelas
 * ficam fechadas em RLS para que a anon key do browser não as alcance
 * pelo /rest/v1 — "a API valida" não protege o PostgREST direto.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import type { FormAnswers, FormSchema } from "@/types/forms-conversational"
import { blocoDoAbandono, totalRespondido, ultimoAlcancavel } from "@/lib/forms/engine"

const log = logger.child("FormSession")

export type StatusSessao =
  | "viewed"
  | "started"
  | "in_progress"
  | "contact_captured"
  | "abandoned"
  | "completed"
  | "disqualified"

/** Ordem de avanço. O status nunca ANDA PARA TRÁS num save. */
const ORDEM: Record<StatusSessao, number> = {
  viewed: 0,
  started: 1,
  in_progress: 2,
  contact_captured: 3,
  abandoned: 4,
  completed: 5,
  disqualified: 5,
}

/**
 * O status só avança.
 *
 * O autosave chega fora de ordem (rede lenta, aba que volta do
 * background, `sendBeacon` que sai depois do `fetch`). Sem esta régua,
 * um save atrasado com `in_progress` sobrescreveria o `completed` e o
 * cron de abandono mandaria ao CRM alguém que já converteu.
 */
export function statusAvancado(atual: StatusSessao, novo: StatusSessao): StatusSessao {
  return ORDEM[novo] > ORDEM[atual] ? novo : atual
}

export interface ContextoDaVisita {
  visitor_id?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
  gclid?: string | null
  fbclid?: string | null
  fbp?: string | null
  fbc?: string | null
  referrer?: string | null
  landing_url?: string | null
  device?: string | null
  browser?: string | null
  os?: string | null
  country?: string | null
  ab_variant?: string | null
}

export interface LinhaSessao {
  id: string
  org_id: string
  form_id: string
  status: StatusSessao
  answers: FormAnswers
  variables: Record<string, string | number>
  hidden: Record<string, string>
  current_field_ref: string | null
  furthest_step_index: number
  completed_at: string | null
  contact_captured_at: string | null
  lead_id: string | null
}

const COLUNAS_SESSAO =
  "id, org_id, form_id, status, answers, variables, hidden, current_field_ref, " +
  "furthest_step_index, completed_at, contact_captured_at, lead_id"

/** Cria a sessão no primeiro carregamento do formulário. */
export async function iniciarSessao(
  admin: SupabaseClient,
  params: {
    orgId: string
    formId: string
    formVersionId: string | null
    totalEstimado: number | null
    contexto: ContextoDaVisita
    hidden: Record<string, string>
  },
): Promise<LinhaSessao | null> {
  const { data, error } = await admin
    .from("form_sessions")
    .insert({
      org_id: params.orgId,
      form_id: params.formId,
      form_version_id: params.formVersionId,
      status: "viewed",
      total_steps_estimate: params.totalEstimado,
      hidden: params.hidden,
      ...params.contexto,
    })
    .select(COLUNAS_SESSAO)
    .single()

  if (error) {
    // Sessão é telemetria e captura de abandono; o formulário é o
    // produto. Falhar aqui não pode impedir alguém de responder.
    log.warn("sessao.nao_criada", { formId: params.formId, code: error.code, message: error.message })
    return null
  }
  return data as unknown as LinhaSessao
}

export async function carregarSessao(
  admin: SupabaseClient,
  sessionId: string,
): Promise<LinhaSessao | null> {
  const { data, error } = await admin
    .from("form_sessions")
    .select(COLUNAS_SESSAO)
    .eq("id", sessionId)
    .maybeSingle()
  if (error) {
    log.warn("sessao.nao_lida", { sessionId, code: error.code, message: error.message })
    return null
  }
  return (data as unknown as LinhaSessao | null) ?? null
}

/** Um evento do caminho. `event_key` garante que o reenvio não duplica. */
export interface EventoDaSessao {
  type: string
  field_ref?: string | null
  step_index?: number | null
  payload?: Record<string, unknown>
  client_ts?: string | null
  event_key?: string | null
}

export interface PatchDaSessao {
  answers?: FormAnswers
  variables?: Record<string, string | number>
  current_field_ref?: string | null
  status?: StatusSessao
  /** ms na tela do último passo — alimenta "onde ela travou". */
  time_on_last_step_ms?: number | null
  ending_ref?: string | null
  consent?: { at: string; version: string } | null
}

/**
 * Grava o avanço.
 *
 * As respostas são MESCLADAS, nunca substituídas: o cliente manda o que
 * mudou, e um save que chega depois de outro com menos campos não pode
 * apagar o que já estava lá.
 *
 * Sessão `completed` é IMUTÁVEL daqui em diante — depois do submit, um
 * autosave atrasado reescreveria as respostas que já viraram lead.
 */
export async function salvarSessao(
  admin: SupabaseClient,
  sessao: LinhaSessao,
  patch: PatchDaSessao,
  schema: FormSchema,
  eventos: EventoDaSessao[] = [],
): Promise<{ ok: boolean; status: StatusSessao }> {
  if (sessao.completed_at) {
    // Não é erro do cliente: a aba dele ainda não sabe que o submit
    // passou. Registramos os eventos (o caminho continua sendo verdade)
    // e recusamos a mudança de estado.
    await gravarEventos(admin, sessao, eventos)
    return { ok: true, status: sessao.status }
  }

  const answers: FormAnswers = { ...(sessao.answers ?? {}), ...(patch.answers ?? {}) }
  const variables = { ...(sessao.variables ?? {}), ...(patch.variables ?? {}) }
  const ctx = { answers, hidden: sessao.hidden ?? {}, variables }

  const respondidos = totalRespondido(schema, ctx)
  const contatoAgora = temContato(schema, answers)

  let status: StatusSessao = sessao.status
  if (patch.status) status = statusAvancado(status, patch.status)
  if (respondidos > 0) status = statusAvancado(status, "in_progress")
  else if (patch.current_field_ref) status = statusAvancado(status, "started")
  if (contatoAgora) status = statusAvancado(status, "contact_captured")

  const alcancado = ultimoAlcancavel(schema, ctx)
  const indice = alcancado ? Math.max(respondidos, 1) : respondidos

  const update: Record<string, unknown> = {
    answers,
    variables,
    status,
    last_activity_at: new Date().toISOString(),
    furthest_step_index: Math.max(sessao.furthest_step_index ?? 0, indice),
  }
  if (patch.current_field_ref !== undefined) update.current_field_ref = patch.current_field_ref
  if (patch.time_on_last_step_ms !== undefined) update.time_on_last_step_ms = patch.time_on_last_step_ms
  if (patch.ending_ref !== undefined) update.ending_ref = patch.ending_ref
  if (respondidos > 0) update.last_answered_field_ref = ultimoRespondido(schema, ctx)
  if (contatoAgora && !sessao.contact_captured_at) update.contact_captured_at = new Date().toISOString()
  if (sessao.status === "viewed" && status !== "viewed") update.started_at = new Date().toISOString()
  if (patch.consent) {
    update.consent_at = patch.consent.at
    update.consent_text_version = patch.consent.version
  }

  const { error } = await admin.from("form_sessions").update(update).eq("id", sessao.id)
  if (error) {
    log.warn("sessao.nao_salva", { sessionId: sessao.id, code: error.code, message: error.message })
    return { ok: false, status: sessao.status }
  }

  await gravarEventos(admin, sessao, eventos)
  return { ok: true, status }
}

/** Marca concluída e amarra ao que o submit criou. */
export async function concluirSessao(
  admin: SupabaseClient,
  sessionId: string,
  params: { leadId?: string | null; dealId?: string | null; submissionId?: string | null; endingRef?: string | null; disqualified?: boolean },
): Promise<void> {
  const agora = new Date().toISOString()
  const { error } = await admin
    .from("form_sessions")
    .update({
      status: params.disqualified ? "disqualified" : "completed",
      completed_at: agora,
      last_activity_at: agora,
      // Fecha a fila do abandono: quem concluiu nunca é abandono, e sem
      // este carimbo o cron o pegaria assim que a inatividade vencesse.
      abandon_processed_at: agora,
      lead_id: params.leadId ?? null,
      deal_id: params.dealId ?? null,
      submission_id: params.submissionId ?? null,
      ending_ref: params.endingRef ?? null,
    })
    .eq("id", sessionId)
  if (error) {
    log.warn("sessao.nao_concluida", { sessionId, code: error.code, message: error.message })
  }
}

async function gravarEventos(
  admin: SupabaseClient,
  sessao: LinhaSessao,
  eventos: EventoDaSessao[],
): Promise<void> {
  if (eventos.length === 0) return
  const linhas = eventos.slice(0, 200).map((e) => ({
    org_id: sessao.org_id,
    form_id: sessao.form_id,
    session_id: sessao.id,
    type: e.type,
    field_ref: e.field_ref ?? null,
    step_index: e.step_index ?? null,
    payload: e.payload ?? {},
    client_ts: e.client_ts ?? null,
    event_key: e.event_key ?? null,
  }))

  // `ignoreDuplicates` em `(session_id, event_key)`: o reenvio do lote
  // quando a rede volta não pode virar linha nova.
  //
  // O índice NÃO pode ser parcial, e o comentário que estava aqui dizia o
  // contrário — que um predicado sobre a própria coluna do índice não
  // atrapalharia a inferência. Atrapalha: o Postgres exige que a
  // statement REPITA o predicado, e o `on_conflict=` do PostgREST manda
  // só as colunas. O resultado, medido em 17/09, foi 42P10 em TODA
  // gravação e a tabela vazia com sessões reais no banco (migration
  // 20261164 tirou o `where`).
  const { error } = await admin
    .from("form_session_events")
    .upsert(linhas, { onConflict: "session_id,event_key", ignoreDuplicates: true })

  if (error) {
    // `error`, não `warn`: sem evento o funil por pergunta da aba
    // Resultados fica VAZIO, e foi um aviso discreto que escondeu o 42P10
    // por três semanas. A gravação continua sem derrubar a resposta — a
    // sessão é telemetria, o formulário é o produto.
    log.error("sessao.eventos_nao_gravados", {
      sessionId: sessao.id,
      code: error.code,
      message: error.message,
      quantos: linhas.length,
    })
  }
}

/** Há email OU telefone respondido? É o que torna o abandono acionável. */
export function temContato(schema: FormSchema, answers: FormAnswers): boolean {
  return Boolean(contatoDaSessao(schema, answers).email || contatoDaSessao(schema, answers).phone)
}

export interface ContatoDaSessao {
  name: string | null
  email: string | null
  phone: string | null
}

/**
 * O contato, lido pelo `map_to_lead_field` — a mesma chave que o submit
 * usa. Ler por nome de campo ("Email") acertaria neste formulário e
 * erraria no próximo.
 */
export function contatoDaSessao(schema: FormSchema, answers: FormAnswers): ContatoDaSessao {
  const out: ContatoDaSessao = { name: null, email: null, phone: null }
  for (const b of schema.blocks) {
    const alvo = b.map_to_lead_field
    if (!alvo || !(alvo in out)) continue
    const v = answers[b.ref]
    if (v === null || v === undefined) continue
    const txt = Array.isArray(v) ? v.join(", ") : String(v)
    if (txt.trim()) out[alvo as keyof ContatoDaSessao] = txt.trim()
  }
  // Campo de email sem mapeamento ainda é email — o formulário antigo
  // pode não ter o `map_to_lead_field` preenchido, e perder o contato
  // por isso deixaria o abandono sem como ser contactado.
  if (!out.email) {
    const b = schema.blocks.find((x) => x.type === "email")
    const v = b ? answers[b.ref] : undefined
    if (typeof v === "string" && v.trim()) out.email = v.trim()
  }
  if (!out.phone) {
    const b = schema.blocks.find((x) => x.type === "phone")
    const v = b ? answers[b.ref] : undefined
    if (typeof v === "string" && v.trim()) out.phone = v.trim()
  }
  return out
}

function ultimoRespondido(
  schema: FormSchema,
  ctx: { answers: FormAnswers; hidden?: Record<string, string>; variables?: Record<string, string | number> },
): string | null {
  const parou = blocoDoAbandono(schema, ctx, null)
  if (!parou) return null
  const vis = schema.blocks.filter((b) => !b.hidden)
  const i = vis.findIndex((b) => b.ref === parou.ref)
  return i > 0 ? vis[i - 1].ref : null
}
