/**
 * Os horários que a pessoa pode escolher — e quais ela NÃO pode.
 *
 * Este módulo existe para o funil de aplicação não terminar num "a gente
 * te chama": quem acabou de ser pré-aprovado escolhe o horário ali, na
 * mesma tela. A agenda é a NOSSA (a conta central que já recebe toda
 * reunião e sincroniza com o Google), não um serviço de fora.
 *
 * É puro porque cada regra aqui erra em SILÊNCIO — nenhuma delas dá
 * erro, todas produzem um horário plausível e errado:
 *
 * 1. **O slot tem de CABER inteiro na janela.** Testar só o início
 *    oferece 17:45 numa janela que fecha às 18:00, e a call de 30 min
 *    invade o jantar de alguém.
 * 2. **Ocupado é meio-aberto `[início, fim)`.** Uma reunião que termina
 *    às 10:00 não bloqueia o slot das 10:00 — comparar com `<=` apaga
 *    um horário livre por reunião existente, e a agenda parece cheia.
 * 3. **O fuso resolve o horário de verão PELA DATA.** "09:00 em São
 *    Paulo" é um instante UTC diferente em janeiro e em julho para boa
 *    parte do mundo; um offset fixo entrega a call uma hora deslocada, e
 *    o cliente entra na sala vazia.
 * 4. **A antecedência é contada de AGORA.** Sem ela, quem responde às
 *    14h58 marca para as 15h — e do outro lado ninguém abriu a loja
 *    dele ainda, que é a promessa que o formulário acabou de fazer.
 * 5. **O servidor NÃO confia no instante que o browser mandou.** A régua
 *    de gerar e a de aceitar são a MESMA função: duas divergiriam, e a
 *    divergência aqui é alguém marcando domingo às 3 da manhã.
 *
 * Janela que cruza a meia-noite não é suportada de propósito (`de` tem
 * de ser menor que `ate`): ela não existe numa agenda comercial, e
 * aceitá-la em silêncio produziria zero slots no dia sem dizer por quê.
 */

import { offsetForTimezone } from "@/lib/integrations/omnisend/timezone"

export interface JanelaDoDia {
  /** 0 = domingo … 6 = sábado (o mesmo índice de `Date#getUTCDay`). */
  dia: number
  /** "09:00", no fuso da agenda. */
  de: string
  /** "18:00", no fuso da agenda. Exclusivo: o slot termina até aqui. */
  ate: string
}

export interface RegraDeAgenda {
  /** IANA da agenda (não do visitante). */
  fuso: string
  duracaoMin: number
  /** Passo da grade: 30 ⇒ 09:00, 09:30, 10:00… */
  passoMin: number
  /** Quanto tempo no mínimo entre agora e o começo da call. */
  antecedenciaMinMin: number
  /** Quantos dias à frente a grade vai. */
  horizonteDias: number
  janelas: JanelaDoDia[]
  /** Teto de horários devolvidos. */
  maxSlots: number
}

/**
 * O padrão do funil de aplicação.
 *
 * São ESCOLHAS, não medições, e ficam aqui à vista para serem mudadas
 * sem procurar: meia hora porque é uma conversa de diagnóstico, não uma
 * apresentação; segunda a sexta em horário comercial de São Paulo, que é
 * onde a operação está; quatro horas de antecedência porque a call
 * pressupõe alguém ter aberto a loja e a conta antes; dez dias de
 * horizonte porque agenda aberta demais convida a marcar longe e
 * esquecer.
 */
export const AGENDA_PADRAO: RegraDeAgenda = {
  fuso: "America/Sao_Paulo",
  duracaoMin: 30,
  passoMin: 30,
  antecedenciaMinMin: 4 * 60,
  horizonteDias: 10,
  janelas: [1, 2, 3, 4, 5].map((dia) => ({ dia, de: "09:00", ate: "18:00" })),
  maxSlots: 60,
}

/** Um intervalo tomado — reunião nossa ou evento do Google. */
export interface Ocupado {
  inicio: string
  fim: string
}

export interface Slot {
  /** ISO em UTC. É este valor que o browser devolve no agendamento. */
  inicio: string
  fim: string
}

const MIN = 60_000

// ───────────────────────────── fuso ─────────────────────────────

/** Offset do fuso NAQUELE instante, em minutos. */
function offsetMin(fuso: string, quando: Date): number {
  const iso = offsetForTimezone(fuso, quando)
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(iso)
  if (!m) return 0
  const sinal = m[1] === "-" ? -1 : 1
  return sinal * (Number(m[2]) * 60 + Number(m[3]))
}

/**
 * O instante UTC de uma hora de PAREDE num fuso.
 *
 * Duas passadas porque o offset depende do instante que estamos
 * calculando: na virada do horário de verão, o offset do palpite é o do
 * lado errado da mudança e a primeira conta erra em uma hora.
 */
export function instanteLocal(
  fuso: string,
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto)
  let ts = palpite - offsetMin(fuso, new Date(palpite)) * MIN
  ts = palpite - offsetMin(fuso, new Date(ts)) * MIN
  return new Date(ts)
}

/** A data de calendário (Y-M-D) daquele instante, no fuso. */
export function dataLocal(fuso: string, quando: Date): { ano: number; mes: number; dia: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(quando)
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0")
  return { ano: get("year"), mes: get("month"), dia: get("day") }
}

function minutosDoRelogio(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

// ───────────────────────────── grade ─────────────────────────────

/**
 * Os horários livres, do mais próximo ao mais distante.
 *
 * `agora` é parâmetro — testar uma agenda com o relógio do processo
 * seria um teste que muda de resultado às 18h01.
 */
export function gerarSlots(regra: RegraDeAgenda, agora: Date, ocupados: Ocupado[]): Slot[] {
  const duracao = Math.max(1, Math.round(regra.duracaoMin))
  const passo = Math.max(1, Math.round(regra.passoMin))
  const cedoDemais = agora.getTime() + Math.max(0, regra.antecedenciaMinMin) * MIN
  const janelasPorDia = new Map<number, JanelaDoDia[]>()
  for (const j of regra.janelas) {
    const de = minutosDoRelogio(j.de)
    const ate = minutosDoRelogio(j.ate)
    // Janela ilegível ou invertida é descartada aqui, e não silenciada
    // lá na frente: o dia inteiro some, o que é visível.
    if (de === null || ate === null || ate <= de) continue
    const lista = janelasPorDia.get(j.dia) ?? []
    lista.push(j)
    janelasPorDia.set(j.dia, lista)
  }

  const bloqueios = ocupados
    .map((o) => ({ de: Date.parse(o.inicio), ate: Date.parse(o.fim) }))
    .filter((o) => Number.isFinite(o.de) && Number.isFinite(o.ate) && o.ate > o.de)

  const hoje = dataLocal(regra.fuso, agora)
  const slots: Slot[] = []

  for (let d = 0; d <= Math.max(0, regra.horizonteDias); d++) {
    // Aritmética de CALENDÁRIO em UTC: somar 86.400.000 ms ao instante
    // pularia ou repetiria um dia na virada do horário de verão.
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + d))
    const ano = base.getUTCFullYear()
    const mes = base.getUTCMonth() + 1
    const dia = base.getUTCDate()
    const semana = base.getUTCDay()

    for (const j of janelasPorDia.get(semana) ?? []) {
      const de = minutosDoRelogio(j.de) as number
      const ate = minutosDoRelogio(j.ate) as number
      for (let m = de; m + duracao <= ate; m += passo) {
        const inicio = instanteLocal(regra.fuso, ano, mes, dia, Math.floor(m / 60), m % 60)
        const ts = inicio.getTime()
        if (ts < cedoDemais) continue
        const fim = ts + duracao * MIN
        // Meio-aberto dos DOIS lados: encostar não é sobrepor.
        if (bloqueios.some((b) => ts < b.ate && fim > b.de)) continue
        slots.push({ inicio: new Date(ts).toISOString(), fim: new Date(fim).toISOString() })
        if (slots.length >= regra.maxSlots) return ordenar(slots)
      }
    }
  }
  return ordenar(slots)
}

function ordenar(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => a.inicio.localeCompare(b.inicio))
}

export type RecusaDoSlot = "fora_da_grade" | "cedo_demais" | "ocupado" | "instante_invalido"

/**
 * O instante que o browser mandou é agendável?
 *
 * Reusa `gerarSlots` de propósito: a régua de OFERECER e a de ACEITAR
 * precisam ser a mesma, e escrever uma segunda comparação aqui deixaria
 * a porta aberta exatamente onde ninguém olha — um POST feito à mão com
 * um domingo às 3 da manhã, ou com o horário que outra pessoa acabou de
 * tomar entre a listagem e o clique.
 */
export function slotAgendavel(
  regra: RegraDeAgenda,
  agora: Date,
  ocupados: Ocupado[],
  inicioISO: string,
): { ok: true; slot: Slot } | { ok: false; motivo: RecusaDoSlot } {
  const ts = Date.parse(inicioISO)
  if (!Number.isFinite(ts)) return { ok: false, motivo: "instante_invalido" }
  const alvo = new Date(ts).toISOString()

  // Sem o teto, um instante muito à frente pararia na fatia devolvida e
  // seria recusado como "fora da grade" mesmo estando na janela.
  const cheia = gerarSlots({ ...regra, maxSlots: Number.MAX_SAFE_INTEGER }, agora, [])
  const naGrade = cheia.find((s) => s.inicio === alvo)
  if (!naGrade) {
    return {
      ok: false,
      motivo: ts < agora.getTime() + regra.antecedenciaMinMin * MIN ? "cedo_demais" : "fora_da_grade",
    }
  }
  const fim = Date.parse(naGrade.fim)
  const conflita = ocupados.some((o) => {
    const de = Date.parse(o.inicio)
    const ate = Date.parse(o.fim)
    return Number.isFinite(de) && Number.isFinite(ate) && ts < ate && fim > de
  })
  if (conflita) return { ok: false, motivo: "ocupado" }
  return { ok: true, slot: naGrade }
}

// ─────────────────────────── apresentação ───────────────────────────

export interface DiaComSlots {
  /** "2026-09-22", no fuso da agenda. */
  data: string
  /** "seg, 22 de set" */
  rotulo: string
  slots: Slot[]
}

/**
 * Agrupa por dia LOCAL da agenda.
 *
 * Agrupar pelo dia UTC quebraria todo slot da tarde: 18:00 em São Paulo
 * é 21:00 UTC no mesmo dia, mas 17:00 no Havaí é o dia seguinte lá — e a
 * lista mostraria "sexta" em cima de um horário de quinta.
 */
export function agruparPorDia(slots: Slot[], fuso: string): DiaComSlots[] {
  const fmtData = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const fmtRotulo = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
  const mapa = new Map<string, DiaComSlots>()
  for (const s of slots) {
    const d = new Date(s.inicio)
    const data = fmtData.format(d)
    let grupo = mapa.get(data)
    if (!grupo) {
      grupo = { data, rotulo: fmtRotulo.format(d).replace(/\.$/, ""), slots: [] }
      mapa.set(data, grupo)
    }
    grupo.slots.push(s)
  }
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data))
}

/** "09:30" no fuso da agenda. */
export function horaDoSlot(inicio: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(inicio))
}

/** Regra vinda do banco (JSONB) sem derrubar nada: o que falta vira padrão. */
export function normalizarRegra(bruto: unknown): RegraDeAgenda {
  const o = (bruto ?? {}) as Partial<RegraDeAgenda>
  const num = (v: unknown, padrao: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : padrao
  }
  const janelas = Array.isArray(o.janelas)
    ? o.janelas
        .filter((j): j is JanelaDoDia => !!j && typeof j.de === "string" && typeof j.ate === "string")
        .filter((j) => Number.isInteger(j.dia) && j.dia >= 0 && j.dia <= 6)
    : AGENDA_PADRAO.janelas
  return {
    fuso: typeof o.fuso === "string" && o.fuso.trim() ? o.fuso.trim() : AGENDA_PADRAO.fuso,
    duracaoMin: num(o.duracaoMin, AGENDA_PADRAO.duracaoMin, 5, 480),
    passoMin: num(o.passoMin, AGENDA_PADRAO.passoMin, 5, 480),
    antecedenciaMinMin: num(o.antecedenciaMinMin, AGENDA_PADRAO.antecedenciaMinMin, 0, 60 * 24 * 30),
    // Teto de 60 dias: horizonte aberto faria `gerarSlots` varrer o ano
    // inteiro a cada abertura da tela.
    horizonteDias: num(o.horizonteDias, AGENDA_PADRAO.horizonteDias, 1, 60),
    janelas: janelas.length > 0 ? janelas : AGENDA_PADRAO.janelas,
    maxSlots: num(o.maxSlots, AGENDA_PADRAO.maxSlots, 1, 500),
  }
}
