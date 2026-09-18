/**
 * A agenda que o funil oferece — a nossa, sincronizada com o Google.
 *
 * O formulário de aplicação termina em "pré-aprovado". Deixar a pessoa
 * ali com "a gente te chama" é o pior momento possível para esfriar:
 * quem acabou de responder vinte telas está com a mão no teclado AGORA.
 * Este serviço é o que transforma esse instante numa call marcada, sem
 * mandar ninguém para um serviço de fora.
 *
 * O que ele NÃO faz de propósito:
 *
 * - **não recebe id nenhum do browser** além do par sessão+token que já
 *   é conferido no submit. Lead, negócio, org e organizador saem da
 *   SESSÃO. Aceitar `deal_id` no corpo deixaria alguém pendurar uma
 *   call no negócio de outra pessoa;
 * - **não confia no horário que chegou.** Gerar e aceitar passam pela
 *   MESMA função pura (`slotAgendavel`), porque duas réguas divergem e a
 *   divergência aqui é um POST feito à mão marcando domingo às 3h;
 * - **não trata falha do Google como agenda vazia.** Quando o freeBusy
 *   não responde, a resposta DIZ que a disponibilidade saiu só do nosso
 *   banco (`fonte: "somente_banco"`) — oferecer horário calado seria
 *   marcar por cima de um compromisso que existe.
 */

import { randomUUID } from "crypto"
import { GoogleCalendarService } from "@/lib/integrations/google-calendar"
import { getValidAccessToken } from "@/lib/services/google-auth.service"
import { syncMeetingToGoogle, updateGoogleEvent } from "@/lib/services/google-calendar-sync.service"
import { sendMeetingInviteEmails } from "@/lib/services/meeting-invite-email.service"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { aplicarRecall } from "@/lib/forms/recall"
import { normalizarSchema } from "@/lib/forms/schema"
import {
  agruparPorDia,
  gerarSlots,
  normalizarRegra,
  slotAgendavel,
  type DiaComSlots,
  type Ocupado,
  type RecusaDoSlot,
  type RegraDeAgenda,
} from "@/lib/meetings/disponibilidade"
import type { FormAnswers, FormSchema } from "@/types/forms-conversational"

const log = logger.child("AgendamentoPublico")

/** Quantos dias à frente o freeBusy do Google é consultado. */
const MARGEM_DE_CONSULTA_DIAS = 1

export interface AgendaDoFormulario {
  formId: string
  orgId: string
  slug: string
  nomeDoFormulario: string
  regra: RegraDeAgenda
  organizadorId: string
  /** Título da reunião; aceita `{{nome}}` como no resto do formulário. */
  titulo: string
  /** Finais que abrem a agenda (derivados do schema publicado). */
  finais: string[]
  schema: FormSchema
}

interface LinhaDoFormulario {
  id: string
  org_id: string
  name: string
  slug: string
  created_by: string | null
  settings: Record<string, unknown> | null
  published_version_id: string | null
}

/**
 * A agenda de um formulário, ou `null` quando ele não oferece nenhuma.
 *
 * Quais finais abrem a agenda vem do SCHEMA PUBLICADO, não de uma lista
 * à parte: é o mesmo lugar de onde a tela decide mostrar o seletor, e
 * duas fontes discordariam no primeiro Publicar — com o sintoma de a
 * pessoa ver os horários e o servidor recusar o clique.
 */
export async function carregarAgenda(slug: string): Promise<AgendaDoFormulario | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("crm_forms")
    .select("id, org_id, name, slug, created_by, settings, published_version_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()

  if (error || !data) return null
  const form = data as LinhaDoFormulario

  // A versão PUBLICADA, não a mais alta: quem responde continua na que
  // abriu, e a agenda tem de concordar com o desfecho que ele leu. Ler
  // "a última" ofereceria horário por causa de uma versão que ninguém
  // publicou — e negaria o clique de quem está numa anterior.
  const { data: versao } = form.published_version_id
    ? await admin
        .from("form_versions")
        .select("schema")
        .eq("id", form.published_version_id)
        .maybeSingle()
    : { data: null }

  const schema = normalizarSchema((versao as { schema?: unknown } | null)?.schema)
  const finais = (schema.endings ?? [])
    .filter((e) => e.destino?.tipo === "agenda")
    .map((e) => e.ref)
  if (finais.length === 0) return null

  const cfg = ((form.settings ?? {}) as Record<string, unknown>).agenda as
    | Record<string, unknown>
    | undefined
  const organizadorId = await resolverOrganizador(form, cfg?.organizador_id)
  if (!organizadorId) {
    // Sem organizador não dá para inserir a reunião (`user_id` é NOT
    // NULL). Melhor a agenda não abrir — e dizer por quê no log — do
    // que abrir e falhar no clique de quem já escolheu o horário.
    log.warn("Formulário sem organizador para a agenda", { slug })
    return null
  }

  return {
    formId: form.id,
    orgId: form.org_id,
    slug: form.slug,
    nomeDoFormulario: form.name,
    regra: normalizarRegra(cfg?.regra),
    organizadorId,
    titulo: typeof cfg?.titulo === "string" && cfg.titulo.trim() ? cfg.titulo : "Diagnóstico · {{nome}}",
    finais,
    schema,
  }
}

async function resolverOrganizador(
  form: LinhaDoFormulario,
  configurado: unknown,
): Promise<string | null> {
  if (typeof configurado === "string" && configurado.trim()) return configurado.trim()
  if (form.created_by) return form.created_by
  // Último recurso: o dono da org. A reunião vai para a agenda CENTRAL
  // de qualquer jeito (`resolveSyncAccount`), então este campo é o
  // responsável no registro — não muda em que calendário ela cai.
  const admin = createAdminClient()
  const { data } = await admin
    .from("org_members")
    .select("profile_id")
    .eq("org_id", form.org_id)
    .eq("is_active", true)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { profile_id?: string } | null)?.profile_id ?? null
}

// ─────────────────────────── disponibilidade ───────────────────────────

export type FonteDaDisponibilidade = "google" | "somente_banco"

export interface HorariosDisponiveis {
  fuso: string
  duracaoMin: number
  dias: DiaComSlots[]
  fonte: FonteDaDisponibilidade
}

export async function horariosDisponiveis(
  agenda: AgendaDoFormulario,
  agora = new Date(),
): Promise<HorariosDisponiveis> {
  const ate = new Date(
    agora.getTime() + (agenda.regra.horizonteDias + MARGEM_DE_CONSULTA_DIAS) * 86_400_000,
  )
  const { ocupados, fonte } = await ocupadosNaJanela(agenda.orgId, agora, ate)
  const slots = gerarSlots(agenda.regra, agora, ocupados)
  return {
    fuso: agenda.regra.fuso,
    duracaoMin: agenda.regra.duracaoMin,
    dias: agruparPorDia(slots, agenda.regra.fuso),
    fonte,
  }
}

/**
 * O que já está tomado — do Google E do nosso banco.
 *
 * Os dois, e não um: o freeBusy vê o compromisso pessoal criado direto
 * no Google, e o banco vê a reunião que nasceu aqui e cujo sync falhou.
 * Ler só um dos lados marca em cima do outro.
 */
async function ocupadosNaJanela(
  orgId: string,
  de: Date,
  ate: Date,
): Promise<{ ocupados: Ocupado[]; fonte: FonteDaDisponibilidade }> {
  const admin = createAdminClient()
  const ocupados: Ocupado[] = []

  const { data: reunioes } = await admin
    .from("meetings")
    .select("scheduled_at, duration_minutes")
    .eq("org_id", orgId)
    .eq("status", "scheduled")
    .gte("scheduled_at", de.toISOString())
    .lte("scheduled_at", ate.toISOString())
  for (const r of (reunioes ?? []) as Array<{ scheduled_at: string; duration_minutes: number | null }>) {
    const inicio = Date.parse(r.scheduled_at)
    if (!Number.isFinite(inicio)) continue
    ocupados.push({
      inicio: new Date(inicio).toISOString(),
      fim: new Date(inicio + (r.duration_minutes ?? 60) * 60_000).toISOString(),
    })
  }

  let fonte: FonteDaDisponibilidade = "somente_banco"
  try {
    const token = await getValidAccessToken(orgId, "org")
    if (token) {
      const cal = new GoogleCalendarService({ accessToken: token, calendarId: "primary" })
      const busy = await cal.freeBusy({ timeMin: de.toISOString(), timeMax: ate.toISOString() })
      for (const b of busy) ocupados.push({ inicio: b.start, fim: b.end })
      fonte = "google"
    }
  } catch (err) {
    // Fail-open com a verdade declarada: a agenda continua abrindo com o
    // que o banco sabe, e quem chama recebe `somente_banco`.
    log.warn("freeBusy indisponível — disponibilidade sai só do banco", {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    })
  }

  return { ocupados, fonte }
}

// ───────────────────────────── agendamento ─────────────────────────────

export type FalhaDoAgendamento =
  | "sessao_invalida"
  | "final_sem_agenda"
  | RecusaDoSlot

export interface ReuniaoAgendada {
  meetingId: string
  inicio: string
  fim: string
  fuso: string
  meetLink: string | null
  /** `true` quando a sessão já tinha uma call e ela foi remarcada. */
  remarcada: boolean
}

interface LinhaDaSessao {
  id: string
  form_id: string
  org_id: string
  lead_id: string | null
  deal_id: string | null
  ending_ref: string | null
  answers: FormAnswers | null
  hidden_fields: Record<string, string> | null
}

export async function agendarDaSessao(params: {
  agenda: AgendaDoFormulario
  sessionId: string
  inicio: string
  agora?: Date
}): Promise<{ ok: true; reuniao: ReuniaoAgendada } | { ok: false; motivo: FalhaDoAgendamento }> {
  const agora = params.agora ?? new Date()
  const admin = createAdminClient()

  const { data } = await admin
    .from("form_sessions")
    .select("id, form_id, org_id, lead_id, deal_id, ending_ref, answers, hidden_fields")
    .eq("id", params.sessionId)
    .maybeSingle()
  const sessao = data as LinhaDaSessao | null
  if (!sessao || sessao.form_id !== params.agenda.formId) {
    return { ok: false, motivo: "sessao_invalida" }
  }
  // A agenda é do FINAL. Sem esta guarda, quem foi recusado por
  // faturamento marcaria a call que o texto acabou de dizer que não
  // existe — e a agenda encheria de conversa que não deveria acontecer.
  if (!sessao.ending_ref || !params.agenda.finais.includes(sessao.ending_ref)) {
    return { ok: false, motivo: "final_sem_agenda" }
  }

  const janelaAte = new Date(
    agora.getTime() + (params.agenda.regra.horizonteDias + MARGEM_DE_CONSULTA_DIAS) * 86_400_000,
  )
  const { ocupados } = await ocupadosNaJanela(sessao.org_id, agora, janelaAte)

  // A reunião que esta sessão já marcou não conta como ocupada: senão
  // remarcar para o mesmo horário seria recusado por conflito consigo.
  const existente = await reuniaoDaSessao(sessao.id)
  const semAPropria = existente
    ? ocupados.filter(
        (o) =>
          !(
            Date.parse(o.inicio) === Date.parse(existente.scheduled_at) &&
            Math.round((Date.parse(o.fim) - Date.parse(o.inicio)) / 60_000) ===
              (existente.duration_minutes ?? 60)
          ),
      )
    : ocupados

  const veredicto = slotAgendavel(params.agenda.regra, agora, semAPropria, params.inicio)
  if (!veredicto.ok) return { ok: false, motivo: veredicto.motivo }

  const respostas = sessao.answers ?? {}
  const ctx = { schema: params.agenda.schema, answers: respostas, hidden: sessao.hidden_fields ?? {} }
  const titulo = aplicarRecall(params.agenda.titulo, ctx).trim() || params.agenda.nomeDoFormulario
  const email = emailDaSessao(params.agenda.schema, respostas)

  let meetingId = existente?.id ?? null
  let remarcada = false

  if (meetingId) {
    remarcada = true
    const { error } = await admin
      .from("meetings")
      .update({
        scheduled_at: veredicto.slot.inicio,
        duration_minutes: params.agenda.regra.duracaoMin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetingId)
    if (error) {
      log.error("Falha ao remarcar", { meetingId, erro: error.message })
      return { ok: false, motivo: "sessao_invalida" }
    }
  } else {
    const novo = {
      id: randomUUID(),
      org_id: sessao.org_id,
      user_id: params.agenda.organizadorId,
      created_by: params.agenda.organizadorId,
      deal_id: sessao.deal_id,
      form_session_id: sessao.id,
      source: "form",
      title: titulo,
      scheduled_at: veredicto.slot.inicio,
      duration_minutes: params.agenda.regra.duracaoMin,
      timezone: params.agenda.regra.fuso,
      guest_emails: email ? [email] : [],
      notes: `Agendado pelo formulário "${params.agenda.nomeDoFormulario}".`,
    }
    const { error } = await admin.from("meetings").insert(novo)
    if (error) {
      // 23505 = o índice único da sessão. Clique duplo ou retry: a call
      // que passou primeiro vale, e nós a adotamos em vez de inserir uma
      // segunda — checar antes sem tratar o conflito depois é o padrão
      // que duplica.
      if (error.code === "23505") {
        const jaExiste = await reuniaoDaSessao(sessao.id)
        if (!jaExiste) return { ok: false, motivo: "sessao_invalida" }
        return {
          ok: true,
          reuniao: {
            meetingId: jaExiste.id,
            inicio: jaExiste.scheduled_at,
            fim: new Date(
              Date.parse(jaExiste.scheduled_at) + (jaExiste.duration_minutes ?? 60) * 60_000,
            ).toISOString(),
            fuso: params.agenda.regra.fuso,
            meetLink: jaExiste.meeting_url,
            remarcada: true,
          },
        }
      }
      log.error("Falha ao inserir reunião do formulário", { erro: error.message, code: error.code })
      return { ok: false, motivo: "sessao_invalida" }
    }
    meetingId = novo.id
  }

  // AWAIT, nunca `void`: em serverless a promise solta morre quando o
  // processo congela depois do `return`, e o que se perde aqui é o
  // evento na agenda de quem vai atender — a reunião existiria só no
  // nosso banco, e ninguém apareceria.
  let meetLink: string | null = existente?.meeting_url ?? null
  try {
    const r = remarcada
      ? await updateGoogleEvent(meetingId)
      : await syncMeetingToGoogle(meetingId, params.agenda.organizadorId)
    meetLink = r.meet_link ?? meetLink
  } catch (err) {
    // A call está marcada no nosso banco e aparece no admin. Falhar aqui
    // não pode desmarcá-la na cara de quem acabou de escolher o horário.
    log.error("Sync da reunião do formulário falhou", {
      meetingId,
      erro: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    await sendMeetingInviteEmails(meetingId)
  } catch (err) {
    log.warn("Convite por e-mail não saiu", { meetingId, erro: String(err) })
  }

  if (sessao.deal_id) {
    try {
      await admin.from("crm_deal_activities").insert({
        deal_id: sessao.deal_id,
        type: "system",
        content: `${remarcada ? "Call remarcada" : "Call agendada"} pelo próprio lead para ${veredicto.slot.inicio}.`,
        created_by: params.agenda.organizadorId,
        is_internal: true,
      })
    } catch {
      // Timeline é registro, não a reunião.
    }
  }

  return {
    ok: true,
    reuniao: {
      meetingId,
      inicio: veredicto.slot.inicio,
      fim: veredicto.slot.fim,
      fuso: params.agenda.regra.fuso,
      meetLink,
      remarcada,
    },
  }
}

async function reuniaoDaSessao(sessionId: string): Promise<{
  id: string
  scheduled_at: string
  duration_minutes: number | null
  meeting_url: string | null
} | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("meetings")
    .select("id, scheduled_at, duration_minutes, meeting_url")
    .eq("form_session_id", sessionId)
    .maybeSingle()
  return (data as { id: string; scheduled_at: string; duration_minutes: number | null; meeting_url: string | null } | null) ?? null
}

/**
 * O e-mail do lead, pelo MAPEAMENTO e não pelo rótulo.
 *
 * Procurar "e-mail" no texto da pergunta quebraria no primeiro
 * formulário em inglês, e em silêncio — a mesma régua de
 * `contatoCapturado`.
 */
function emailDaSessao(schema: FormSchema, answers: FormAnswers): string | null {
  for (const b of schema.blocks ?? []) {
    if ((b.map_to_lead_field ?? "").trim() !== "email") continue
    const v = answers[b.ref]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}
