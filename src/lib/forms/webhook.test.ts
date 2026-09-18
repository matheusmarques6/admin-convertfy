import { describe, expect, it, vi, afterEach } from "vitest"
import {
  destinoDoWebhook,
  enviarWebhook,
  respostasLegiveis,
  TIMEOUT_MS,
  type PayloadDoFormulario,
} from "./webhook"
import type { FormSchema } from "@/types/forms-conversational"

const schema: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "u-1", alias: "nome", type: "text", label: "Seu nome" },
    { ref: "u-2", alias: "faturamento", type: "radio", label: "Quanto fatura?", options: [
      { label: "De R$200 mil a R$500 mil", value: "200_500k" },
      { label: "Até R$100 mil", value: "ate_100k" },
    ] },
    { ref: "u-3", type: "multi_select", label: "Já aconteceu?", options: [
      { label: "Seguraram meu dinheiro", value: "reserva" },
      { label: "Conta desligada", value: "conta" },
    ] },
  ],
}

const payload = (): PayloadDoFormulario => ({
  evento: "formulario.enviado",
  enviado_em: "2026-09-18T03:00:00.000Z",
  formulario: { id: "f", slug: "aplicacao", nome: "Aplicação" },
  final: { ref: "ok", titulo: "Aprovado", desqualifica: false },
  lead_id: "l", deal_id: "d", submission_id: "s",
  contato: { nome: "Ana", email: null, telefone: null },
  respostas: [], variaveis: {}, tags: [], utm: {},
})

afterEach(() => vi.unstubAllGlobals())

describe("respostasLegiveis", () => {
  it("leva a pergunta e o rótulo que a pessoa leu, não só o valor cru", () => {
    const r = respostasLegiveis(schema, { "u-1": "Ana", "u-2": "200_500k" })
    expect(r).toEqual([
      { ref: "u-1", alias: "nome", pergunta: "Seu nome", valor: "Ana" },
      {
        ref: "u-2",
        alias: "faturamento",
        pergunta: "Quanto fatura?",
        valor: "200_500k",
        rotulo: "De R$200 mil a R$500 mil",
      },
    ])
  })

  it("resposta múltipla junta os rótulos", () => {
    const r = respostasLegiveis(schema, { "u-3": ["reserva", "conta"] })
    expect(r[0].rotulo).toBe("Seguraram meu dinheiro, Conta desligada")
  })

  it("resposta de campo fora do schema entra crua, em vez de sumir", () => {
    // Campo oculto vindo da URL, ou pergunta apagada depois do envio.
    const r = respostasLegiveis(schema, { utm_source: "meta" })
    expect(r).toEqual([{ ref: "utm_source", pergunta: "utm_source", valor: "meta" }])
  })

  it("resposta vazia não vira linha", () => {
    expect(respostasLegiveis(schema, { "u-1": "", "u-2": null })).toEqual([])
  })
})

describe("destinoDoWebhook", () => {
  it("sem configuração é null — e isso não é erro", () => {
    expect(destinoDoWebhook(null)).toBeNull()
    expect(destinoDoWebhook({})).toBeNull()
    expect(destinoDoWebhook({ webhook_url: "   " })).toBeNull()
  })

  it("lê a URL e o segredo", () => {
    expect(destinoDoWebhook({ webhook_url: " https://n8n.x/y ", webhook_secret: "s" })).toEqual({
      url: "https://n8n.x/y",
      secret: "s",
    })
  })
})

describe("enviarWebhook", () => {
  it("recusa host interno antes de abrir conexão", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const r = await enviarWebhook({ url: "http://169.254.169.254/latest/meta-data" }, payload())
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ motivo: "url_recusada" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("assina o CORPO exato que vai no fio", async () => {
    let corpoVisto = ""
    let assinatura = ""
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      corpoVisto = String(init.body)
      assinatura = (init.headers as Record<string, string>)["X-Convertfy-Signature"]
      return { ok: true, status: 200 } as Response
    })
    const p = payload()
    const r = await enviarWebhook({ url: "https://n8n.exemplo/hook", secret: "segredo" }, p)
    expect(r).toEqual({ ok: true, status: 200 })

    const { createHmac } = await import("crypto")
    const esperado = "sha256=" + createHmac("sha256", "segredo").update(corpoVisto).digest("hex")
    expect(assinatura).toBe(esperado)
    // Recalcular do OBJETO daria outra ordem de chaves e a conferência
    // falharia do outro lado sem ninguém entender por quê.
    expect(corpoVisto).toBe(JSON.stringify(p))
  })

  it("sem segredo não manda assinatura", async () => {
    let headers: Record<string, string> = {}
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>
      return { ok: true, status: 204 } as Response
    })
    await enviarWebhook({ url: "https://n8n.exemplo/hook" }, payload())
    expect(headers["X-Convertfy-Signature"]).toBeUndefined()
  })

  it("não segue redirecionamento — o payload leva o contato de alguém", async () => {
    let init: RequestInit = {}
    vi.stubGlobal("fetch", async (_u: string, i: RequestInit) => {
      init = i
      return { ok: true, status: 200 } as Response
    })
    await enviarWebhook({ url: "https://n8n.exemplo/hook" }, payload())
    expect(init.redirect).toBe("manual")
  })

  it("destino fora do ar devolve o motivo, sem lançar", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 502 }) as Response)
    expect(await enviarWebhook({ url: "https://n8n.exemplo/hook" }, payload())).toEqual({
      ok: false,
      motivo: "resposta_ruim",
      detalhe: "HTTP 502",
    })

    vi.stubGlobal("fetch", async () => {
      throw new Error("The operation was aborted")
    })
    const r = await enviarWebhook({ url: "https://n8n.exemplo/hook" }, payload())
    expect(r).toMatchObject({ ok: false, motivo: "erro_de_rede" })
    expect((r as { detalhe: string }).detalhe).toContain(String(TIMEOUT_MS))
  })
})
