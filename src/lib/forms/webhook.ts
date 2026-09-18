/**
 * O formulário avisa o n8n.
 *
 * O CRM é o destino final do cadastro, mas não é o único: a régua de
 * retomada, o alerta no grupo, a planilha do time — tudo isso mora no
 * n8n, e sem este aviso a única forma de chegar lá é alguém consultar o
 * banco de tempos em tempos.
 *
 * Três decisões, e as três vêm de defeito que este repositório já pagou:
 *
 * 1. **`await`, nunca `void`.** Em serverless a promise solta morre
 *    quando o processo congela depois do `return` — foi assim que os
 *    eventos de conversão da Meta e a cotação do câmbio se perderam. O
 *    preço é latência no submit, e por isso o relógio é curto.
 * 2. **Falhar não derruba o cadastro.** O lead já está no banco quando
 *    isto roda; um n8n fora do ar não pode fazer a pessoa ver erro numa
 *    tela que já registrou a resposta dela. O desfecho vai para o log.
 * 3. **A régua de host é a `checarUrlPublica`**, a mesma da internet da
 *    ConvertIA. Uma segunda régua de SSRF divergiria da primeira, e é
 *    justamente aqui que a URL é digitada por quem edita o formulário.
 */

import { createHmac } from "crypto"
import { checarUrlPublica } from "@/lib/ai/web/web-guard"
import type { FormAnswers, FormSchema } from "@/types/forms-conversational"

/** Quanto o cadastro espera pelo n8n antes de seguir sem ele. */
export const TIMEOUT_MS = 5_000

export interface RespostaLegivel {
  ref: string
  /** O apelido curto (`nome`, `faturamento_br`), quando existe. */
  alias?: string
  pergunta: string
  /** O que foi gravado — o mesmo que está em `form_submissions.answers`. */
  valor: string | string[] | number | boolean | null
  /** O rótulo que a pessoa LEU, quando a resposta é uma opção. */
  rotulo?: string
}

export interface PayloadDoFormulario {
  evento: "formulario.enviado" | "formulario.parcial"
  enviado_em: string
  formulario: { id: string; slug: string; nome: string }
  /** `null` no parcial: quem parou no meio não alcançou final nenhum. */
  final: { ref: string; titulo: string; desqualifica: boolean } | null
  lead_id: string | null
  deal_id: string | null
  submission_id: string | null
  contato: { nome: string | null; email: string | null; telefone: string | null }
  respostas: RespostaLegivel[]
  variaveis: Record<string, string | number>
  tags: string[]
  utm: Record<string, string | null>
}

/**
 * As respostas com o texto que a pessoa leu.
 *
 * O n8n recebendo `{"a91ca5a0-…-0050": "200_500k"}` teria de aprender o
 * schema para montar uma mensagem — e aprenderia uma cópia que
 * envelhece. Aqui a pergunta e o rótulo viajam junto do valor.
 */
export function respostasLegiveis(
  schema: FormSchema | null,
  answers: FormAnswers,
): RespostaLegivel[] {
  const out: RespostaLegivel[] = []
  for (const b of schema?.blocks ?? []) {
    if (!(b.ref in answers)) continue
    const valor = answers[b.ref]
    if (valor === undefined || valor === null || valor === "") continue
    const escolhas = Array.isArray(valor) ? valor.map(String) : [String(valor)]
    const rotulos = (b.options ?? [])
      .filter((o) => escolhas.includes(o.value))
      .map((o) => o.label)
    out.push({
      ref: b.ref,
      ...(b.alias ? { alias: b.alias } : {}),
      pergunta: b.label,
      valor,
      ...(rotulos.length > 0 ? { rotulo: rotulos.join(", ") } : {}),
    })
  }
  // Resposta de campo que não está no schema (oculto da URL, campo
  // antigo) entra crua: perdê-la seria esconder do n8n justamente o que
  // não temos como explicar.
  for (const [ref, valor] of Object.entries(answers)) {
    if (out.some((r) => r.ref === ref)) continue
    if (valor === undefined || valor === null || valor === "") continue
    out.push({ ref, pergunta: ref, valor })
  }
  return out
}

export interface DestinoDoWebhook {
  url: string
  secret?: string | null
}

/**
 * Lê a configuração do formulário. `null` = não há webhook, que é o caso
 * da maioria e não é erro.
 */
export function destinoDoWebhook(settings: unknown): DestinoDoWebhook | null {
  if (!settings || typeof settings !== "object") return null
  const s = settings as Record<string, unknown>
  const url = typeof s.webhook_url === "string" ? s.webhook_url.trim() : ""
  if (!url) return null
  const secret = typeof s.webhook_secret === "string" && s.webhook_secret ? s.webhook_secret : null
  return { url, secret }
}

export type ResultadoDoEnvio =
  | { ok: true; status: number }
  | { ok: false; motivo: "url_recusada" | "erro_de_rede" | "resposta_ruim"; detalhe: string }

export async function enviarWebhook(
  destino: DestinoDoWebhook,
  payload: PayloadDoFormulario,
): Promise<ResultadoDoEnvio> {
  const checagem = checarUrlPublica(destino.url)
  if (!checagem.ok) return { ok: false, motivo: "url_recusada", detalhe: checagem.motivo }

  const corpo = JSON.stringify(payload)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Convertfy-Forms/1.0",
  }
  // A assinatura é sobre o CORPO exato que vai no fio — recalcular do
  // objeto do outro lado daria um JSON com outra ordem de chaves e a
  // conferência falharia sem ninguém entender por quê.
  if (destino.secret) {
    headers["X-Convertfy-Signature"] =
      "sha256=" + createHmac("sha256", destino.secret).update(corpo).digest("hex")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(checagem.url.toString(), {
      method: "POST",
      headers,
      body: corpo,
      signal: controller.signal,
      // Um 302 do destino levaria o payload — com o contato de alguém —
      // para um host que a régua não checou.
      redirect: "manual",
    })
    if (!res.ok) {
      return { ok: false, motivo: "resposta_ruim", detalhe: `HTTP ${res.status}` }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      motivo: "erro_de_rede",
      detalhe: msg.includes("abort") ? `sem resposta em ${TIMEOUT_MS}ms` : msg,
    }
  } finally {
    clearTimeout(timer)
  }
}
