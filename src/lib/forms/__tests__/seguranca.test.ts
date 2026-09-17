import { describe, expect, it, vi, afterEach } from "vitest"
import { hostDe, normalizarPermitido, origemPermitida } from "../origem"
import {
  assinarTokenSessao,
  hashDeRetomada,
  novoTokenDeRetomada,
  verificarTokenSessao,
} from "../session-token"

process.env.FORM_SESSION_SECRET ||= "segredo-de-teste-que-nao-e-o-de-producao"

afterEach(() => vi.useRealTimers())

describe("origemPermitida", () => {
  it("lista vazia permite — o formulário existe para ser embutido", () => {
    const v = origemPermitida("https://loja-do-cliente.com", null, [])
    expect(v.permitida).toBe(true)
    expect(v.host).toBe("loja-do-cliente.com")
  })

  it("sem cabeçalho nenhum e sem lista, passa e registra null", () => {
    expect(origemPermitida(null, null, [])).toEqual({ permitida: true, host: null })
  })

  it("com lista, o domínio parecido NÃO passa — é o ataque por prefixo", () => {
    const lista = ["convertfy.me"]
    expect(origemPermitida("https://convertfy.me", null, lista).permitida).toBe(true)
    expect(origemPermitida("https://convertfy.me.atacante.com", null, lista).permitida).toBe(false)
    expect(origemPermitida("https://xconvertfy.me", null, lista).permitida).toBe(false)
  })

  it("curinga casa subdomínio e o domínio base, nunca o irmão", () => {
    const lista = ["*.loja.com"]
    expect(origemPermitida("https://a.loja.com", null, lista).permitida).toBe(true)
    expect(origemPermitida("https://loja.com", null, lista).permitida).toBe(true)
    expect(origemPermitida("https://outraloja.com", null, lista).permitida).toBe(false)
  })

  it("com lista, chamada sem origem é recusada — é o curl que a lista barra", () => {
    const v = origemPermitida(null, null, ["convertfy.me"])
    expect(v).toEqual({ permitida: false, host: null, motivo: "sem_origem" })
  })

  it("Referer é o fallback de Origin", () => {
    const v = origemPermitida(null, "https://convertfy.me/lp/diagnostico?x=1", ["convertfy.me"])
    expect(v.permitida).toBe(true)
    expect(v.host).toBe("convertfy.me")
  })

  it("a entrada da lista aceita as formas que uma pessoa digita", () => {
    expect(normalizarPermitido("  HTTPS://Loja.COM/pagina  ")).toBe("loja.com")
    expect(normalizarPermitido("loja.com")).toBe("loja.com")
    expect(normalizarPermitido("*.loja.com")).toBe("*.loja.com")
  })

  it("hostDe não lança com lixo", () => {
    expect(hostDe("não é url")).toBeNull()
    expect(hostDe(null)).toBeNull()
  })
})

describe("token de sessão", () => {
  it("ida e volta devolve o id", () => {
    const t = assinarTokenSessao("sess-1")
    expect(verificarTokenSessao(t)).toEqual({ valido: true, sessionId: "sess-1" })
  })

  it("assinatura trocada não passa — e não conta o id", () => {
    const t = assinarTokenSessao("sess-1")
    const adulterado = `sess-2.${t.split(".")[1]}.${t.split(".")[2]}`
    const v = verificarTokenSessao(adulterado)
    expect(v.valido).toBe(false)
    expect(v.sessionId).toBeNull()
    expect(v.motivo).toBe("assinatura")
  })

  it("esticar a validade na mão não funciona", () => {
    const t = assinarTokenSessao("sess-1")
    const [id, , sig] = t.split(".")
    const v = verificarTokenSessao(`${id}.${Date.now() + 9e12}.${sig}`)
    expect(v.motivo).toBe("assinatura")
  })

  it("token vencido é recusado como expirado, não como forjado", () => {
    const t = assinarTokenSessao("sess-1", 1000)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 5000))
    expect(verificarTokenSessao(t)).toEqual({ valido: false, sessionId: "sess-1", motivo: "expirado" })
  })

  it("formato errado não lança", () => {
    for (const t of [null, undefined, "", "abc", "a.b", "a.b.c.d"]) {
      expect(verificarTokenSessao(t).valido).toBe(false)
    }
  })
})

describe("token de retomada", () => {
  it("o banco guarda o hash, nunca o token", () => {
    const { token, hash } = novoTokenDeRetomada()
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain(token)
    expect(hashDeRetomada(token)).toBe(hash)
  })

  it("dois tokens seguidos são diferentes", () => {
    expect(novoTokenDeRetomada().token).not.toBe(novoTokenDeRetomada().token)
  })
})
