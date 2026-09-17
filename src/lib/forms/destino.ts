/**
 * Para onde o lead vai quando termina o formulário.
 *
 * O funil qualifica e depois deixava a pessoa parada numa tela dizendo
 * "a gente te chama em até 1 dia útil" — o pior momento possível para
 * esfriar. Quem acabou de responder que fatura acima do corte está com a
 * mão no teclado AGORA; o destino existe para aproveitar esse instante:
 * abrir a conversa no WhatsApp com o texto já escrito, ou levar direto
 * para o horário no Calendly.
 *
 * **É por FINAL, nunca pelo formulário.** O diagnóstico tem quatro
 * finais e só um aprova. Um destino no nível do formulário mandaria para
 * o link de agendamento justamente quem acabou de ler que a conta não
 * fecha — e a agenda encheria de call que não deveria existir.
 *
 * Puro porque cada regra aqui erra em silêncio:
 *
 * 1. **`wa.me` sem DDI não resolve.** O erro só aparece na tela do
 *    WhatsApp, depois do clique, como "número inválido".
 * 2. **Texto não codificado é texto cortado.** Um `&` ou um `#` na
 *    mensagem corta o resto sem avisar.
 * 3. **`javascript:` num `location.href` é injeção.** O endereço vem de
 *    um campo gravado no banco, e destino é a única parte do formulário
 *    que o navegador EXECUTA.
 * 4. **Destino incompleto tem de virar tela final normal**, nunca um
 *    link quebrado: quem configurou pela metade não pode custar o lead.
 */

import { aplicarRecall, type ContextoRecall } from "./recall"
import { linkDoWhatsApp } from "@/lib/whatsapp/link"
import {
  TIPOS_DE_DESTINO,
  type DestinoDoFinal,
  type FormAnswers,
  type FormBlock,
  type TipoDeDestino,
} from "@/types/forms-conversational"

export type { DestinoDoFinal, TipoDeDestino }
export { TIPOS_DE_DESTINO }

export interface ContextoDoDestino extends ContextoRecall {
  /**
   * UTMs da visita. Só o Calendly os usa — é o que faz o agendamento
   * ser atribuível à campanha que pagou pelo lead.
   */
  utm?: Record<string, string | null | undefined>
}

export interface DestinoPronto {
  tipo: TipoDeDestino
  url: string
  rotulo: string
  automatico: boolean
}

/** O que impede este destino de existir. `null` = está utilizável. */
export type FalhaDoDestino =
  | "sem_numero"
  | "numero_invalido"
  | "sem_url"
  | "url_invalida"
  | "esquema_proibido"

/**
 * Quanto o destino automático espera antes de levar.
 *
 * Curto o bastante para ser "na mesma hora" e longo o bastante para duas
 * coisas que não aparecem em teste nenhum: o pixel do browser acabou de
 * ser disparado e a requisição dele ainda está no ar (navegar cancela o
 * que não saiu, e a conversão some do lado do navegador); e quem não tem
 * o WhatsApp instalado precisa de algo na tela para clicar.
 */
export const ESPERA_DO_DESTINO_MS = 1200

const ROTULO_PADRAO: Record<TipoDeDestino, string> = {
  whatsapp: "Falar no WhatsApp agora",
  calendly: "Escolher o meu horário",
  url: "Continuar",
}

/** UTMs que o Calendly carrega para dentro do agendamento. */
const UTMS_DO_CALENDLY = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const

/**
 * Coage o JSONB cru num destino utilizável, ou `null`.
 *
 * É a ÚNICA porta: a normalização do schema (que roda no GET público e
 * na publicação) e a rota que grava o destino do formato de página única
 * passam as duas por aqui. Um segundo saneador divergiria, e o sintoma
 * seria um campo que sobrevive num caminho e some no outro.
 *
 * Campo que este arquivo não conhece é DESCARTADO, como o resto do
 * normalizador faz — e é por isso que acrescentar um campo ao destino
 * obriga a mexer aqui, senão ele é apagado em silêncio no primeiro
 * clique em Publicar.
 */
export function normalizarDestino(raw: unknown): DestinoDoFinal | null {
  if (!raw || typeof raw !== "object") return null
  const d = raw as Record<string, unknown>
  if (!ehTipoDeDestino(d.tipo)) return null
  const texto = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null
  return {
    tipo: d.tipo,
    numero: texto(d.numero),
    mensagem: typeof d.mensagem === "string" && d.mensagem ? d.mensagem : null,
    url: texto(d.url),
    automatico: d.automatico === true,
    rotulo: texto(d.rotulo),
  }
}

export function ehTipoDeDestino(v: unknown): v is TipoDeDestino {
  return typeof v === "string" && (TIPOS_DE_DESTINO as readonly string[]).includes(v)
}

/**
 * Monta o endereço final. `null` quando o destino não é utilizável — e
 * aí a tela final aparece como sempre apareceu.
 */
export function montarDestino(
  destino: DestinoDoFinal | null | undefined,
  ctx: ContextoDoDestino,
): DestinoPronto | null {
  if (!destino || !ehTipoDeDestino(destino.tipo)) return null

  const rotulo = (destino.rotulo ?? "").trim() || ROTULO_PADRAO[destino.tipo]
  const automatico = Boolean(destino.automatico)

  if (destino.tipo === "whatsapp") {
    const numero = (destino.numero ?? "").trim()
    if (!numero) return null
    const texto = aplicarRecall(destino.mensagem ?? "", ctx)
    const url = linkDoWhatsApp(numero, texto)
    if (!url) return null
    return { tipo: "whatsapp", url, rotulo, automatico }
  }

  const base = aplicarRecall(destino.url ?? "", ctx).trim()
  const alvo = urlSegura(base)
  if (!alvo) return null

  if (destino.tipo === "calendly") preencherCalendly(alvo, ctx)

  return { tipo: destino.tipo, url: alvo.toString(), rotulo, automatico }
}

/**
 * Diz o que falta, para o editor avisar antes de alguém publicar.
 *
 * Separado do `montarDestino` de propósito: ele roda no formulário, com
 * as respostas de quem preencheu; este roda no editor, sem resposta
 * nenhuma — e `{{nome}}` ainda não resolvido não pode virar
 * "url_invalida" numa configuração que está certa.
 */
export function conferirDestino(destino: DestinoDoFinal | null | undefined): FalhaDoDestino | null {
  if (!destino || !ehTipoDeDestino(destino.tipo)) return null

  if (destino.tipo === "whatsapp") {
    const numero = (destino.numero ?? "").trim()
    if (!numero) return "sem_numero"
    return linkDoWhatsApp(numero, "") ? null : "numero_invalido"
  }

  const bruto = (destino.url ?? "").trim()
  if (!bruto) return "sem_url"
  // Recall no meio do endereço (`https://.../{{loja}}`) só resolve na
  // hora; aqui ele ainda é literal e não pode reprovar o cadastro.
  if (bruto.includes("{{")) return null
  let u: URL
  try {
    u = new URL(bruto)
  } catch {
    return "url_invalida"
  }
  return u.protocol === "http:" || u.protocol === "https:" ? null : "esquema_proibido"
}

export const MOTIVO_DO_DESTINO: Record<FalhaDoDestino, string> = {
  sem_numero: "Falta o número do WhatsApp que vai receber a mensagem.",
  numero_invalido: "Número sem DDI ou incompleto — o link do WhatsApp não vai abrir.",
  sem_url: "Falta o endereço.",
  url_invalida: "Endereço inválido. Comece com https://.",
  esquema_proibido: "Só http:// e https:// são aceitos aqui.",
}

/**
 * Nome e email do lead, tirados das respostas pelo `map_to_lead_field`.
 *
 * Nome e sobrenome perguntados separados compõem o nome inteiro — a
 * MESMA composição que o submit faz para o card do CRM. Mandar só o
 * primeiro nome ao Calendly faria o convite sair pela metade.
 */
export function dadosDoLead(
  blocks: readonly FormBlock[] | undefined,
  answers: FormAnswers,
): { nome: string; email: string } {
  let nome = ""
  let primeiro = ""
  let ultimo = ""
  let email = ""

  for (const b of blocks ?? []) {
    const v = answers[b.ref]
    if (v === undefined || v === null) continue
    const texto = String(Array.isArray(v) ? v[0] ?? "" : v).trim()
    if (!texto) continue
    switch (b.map_to_lead_field) {
      case "name":
        nome = texto
        break
      case "first_name":
        primeiro = texto
        break
      case "last_name":
        ultimo = texto
        break
      case "email":
        email = texto
        break
    }
  }

  return {
    nome: nome || [primeiro, ultimo].filter(Boolean).join(" "),
    email,
  }
}

function preencherCalendly(alvo: URL, ctx: ContextoDoDestino): void {
  const { nome, email } = dadosDoLead(ctx.blocks, ctx.answers)
  // Valor vazio NÃO é escrito: `?name=` deixa o campo em branco do mesmo
  // jeito e ainda suja o link com a aparência de ter sido preenchido.
  if (nome) alvo.searchParams.set("name", nome)
  if (email) alvo.searchParams.set("email", email)

  for (const k of UTMS_DO_CALENDLY) {
    const v = (ctx.utm?.[k] ?? "").toString().trim()
    // A UTM da VISITA vence a que estiver escrita no link configurado:
    // ela identifica o clique que pagou por este lead, enquanto a do
    // link é um rótulo fixo para todo mundo. O resto da query (um
    // `hide_gdpr_banner`, um `month`) fica intacto.
    if (v) alvo.searchParams.set(k, v)
  }
}

function urlSegura(bruto: string): URL | null {
  if (!bruto) return null
  try {
    const u = new URL(bruto)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u
  } catch {
    return null
  }
}
