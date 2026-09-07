import { describe, expect, it } from "vitest"
import { checarRedirecionamento, checarUrlPublica } from "./web-guard"

const recusa = (u: string) => {
  const r = checarUrlPublica(u)
  expect(r.ok).toBe(false)
  return r.ok === false ? r.motivo : ""
}

describe("checarUrlPublica", () => {
  it("aceita site público", () => {
    const r = checarUrlPublica("https://www.klaviyo.com/blog/welcome-flow")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.hostname).toBe("www.klaviyo.com")
  })

  it("completa o esquema quando o modelo esquece", () => {
    const r = checarUrlPublica("milled.com/brand/olipop")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.protocol).toBe("https:")
  })

  it("BLOQUEIA metadata da nuvem — o alvo clássico de SSRF", () => {
    // Quem escolhe a URL é o modelo. Uma página, um texto colado ou um
    // resultado de busca podem convencê-lo a abrir isto, e as credenciais
    // do runtime sairiam no corpo da resposta.
    expect(recusa("http://169.254.169.254/latest/meta-data/")).toContain("rede interna")
    expect(recusa("http://metadata.google.internal/computeMetadata/v1/")).toContain("interno")
  })

  it("BLOQUEIA loopback e redes privadas", () => {
    expect(recusa("http://localhost:3000/api/admin")).toContain("interno")
    expect(recusa("http://127.0.0.1/")).toContain("rede interna")
    expect(recusa("http://10.0.0.5/")).toContain("rede interna")
    expect(recusa("http://192.168.1.1/")).toContain("rede interna")
    expect(recusa("http://172.16.0.1/")).toContain("rede interna")
    expect(recusa("http://172.31.255.254/")).toContain("rede interna")
  })

  it("172.32 é PÚBLICO — a faixa privada termina em 172.31", () => {
    // Errar a borda da faixa bloquearia site legítimo (falso positivo) ou
    // deixaria passar rede interna (falso negativo). As duas doem.
    expect(checarUrlPublica("http://172.32.0.1/").ok).toBe(true)
    expect(checarUrlPublica("http://172.15.0.1/").ok).toBe(true)
  })

  it("BLOQUEIA IPv6 interno, inclusive IPv4 mapeado", () => {
    expect(recusa("http://[::1]/")).toContain("IPv6 interno")
    expect(recusa("http://[fd00::1]/")).toContain("IPv6 interno")
    expect(recusa("http://[fe80::1]/")).toContain("IPv6 interno")
    expect(recusa("http://[::ffff:127.0.0.1]/")).toContain("IPv6 interno")
  })

  it("BLOQUEIA protocolo que não é web", () => {
    expect(recusa("file:///etc/passwd")).toContain("não é permitido")
    expect(recusa("gopher://evil/")).toContain("não é permitido")
    expect(recusa("data:text/html,<script>")).toContain("não é permitido")
  })

  it("BLOQUEIA porta alta — é como se varre a rede interna", () => {
    expect(recusa("http://exemplo.com:8080/")).toContain("Porta 8080")
    expect(recusa("http://exemplo.com:22/")).toContain("Porta 22")
    expect(checarUrlPublica("https://exemplo.com:443/").ok).toBe(true)
  })

  it("BLOQUEIA sufixo e nome de máquina interna", () => {
    expect(recusa("http://servidor.local/")).toContain("interno")
    expect(recusa("http://db.internal/")).toContain("interno")
    expect(recusa("http://intranet/")).toContain("domínio público")
  })

  it("recusa lixo sem explodir", () => {
    expect(recusa("")).toContain("vazia")
    expect(recusa("   ")).toContain("vazia")
  })
})

describe("checarRedirecionamento", () => {
  const base = new URL("https://exemplo.com/pagina")

  it("aplica a MESMA régua ao destino", () => {
    // Um host público pode responder 302 para 127.0.0.1: validar só a
    // primeira URL não protege nada.
    const r = checarRedirecionamento("http://127.0.0.1/segredo", base)
    expect(r.ok).toBe(false)
  })

  it("resolve destino relativo contra a base", () => {
    const r = checarRedirecionamento("/outra", base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.toString()).toBe("https://exemplo.com/outra")
  })

  it("destino esquisito vira caminho no MESMO host, e isso é aceitável", () => {
    // `new URL("::::", base)` resolve como caminho relativo — continua o
    // mesmo host público, então não há o que recusar. O que precisa ser
    // recusado é troca de HOST, e isso o teste acima cobre.
    const r = checarRedirecionamento("::::", base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.hostname).toBe("exemplo.com")
  })

  it("recusa quando o destino troca para host interno com esquema", () => {
    expect(checarRedirecionamento("http://169.254.169.254/", base).ok).toBe(false)
    expect(checarRedirecionamento("file:///etc/passwd", base).ok).toBe(false)
  })
})
