import { describe, it, expect } from "vitest"
import {
  alertaFalaDeTelefone,
  contarTentativas,
  lerPrioridade,
  motivoDeBloqueio,
  podeAbordar,
  segmentoCurto,
  sinaisDoNegocio,
} from "../prospeccao"

describe("contarTentativas", () => {
  it("lê número e string", () => {
    expect(contarTentativas(2)).toBe(2)
    expect(contarTentativas("3")).toBe(3)
  })

  it("ilegível vira 0, nunca NaN — NaN renderiza 'NaN' no badge", () => {
    expect(contarTentativas("abc")).toBe(0)
    expect(contarTentativas(NaN)).toBe(0)
    expect(contarTentativas(undefined)).toBe(0)
    expect(contarTentativas(null)).toBe(0)
    expect(contarTentativas("")).toBe(0)
  })

  it("negativo não conta como tentativa", () => {
    expect(contarTentativas(-1)).toBe(0)
  })
})

describe("lerPrioridade", () => {
  it("aceita a lista fechada, tolerando caixa e espaço", () => {
    expect(lerPrioridade("P1")).toBe("P1")
    expect(lerPrioridade(" p3 ")).toBe("P3")
  })

  it("valor fora do domínio vira null, não badge colorido mentindo", () => {
    expect(lerPrioridade("P9")).toBeNull()
    expect(lerPrioridade("alta")).toBeNull()
    expect(lerPrioridade(1)).toBeNull()
    expect(lerPrioridade(null)).toBeNull()
  })
})

describe("segmentoCurto", () => {
  it("usa o prefixo antes do · — é como o operador fala da coluna", () => {
    expect(segmentoCurto("A · Aluno Luan")).toBe("A")
    expect(segmentoCurto("D · MQL sem conversa")).toBe("D")
  })

  it("sem prefixo de letra, encurta pela primeira palavra", () => {
    expect(segmentoCurto("Aguardando liberação Luan")).toBe("Aguardando")
  })

  it("vazio vira null", () => {
    expect(segmentoCurto("  ")).toBeNull()
    expect(segmentoCurto(undefined)).toBeNull()
  })
})

describe("alertaFalaDeTelefone", () => {
  it("pega o radical sem acento", () => {
    expect(alertaFalaDeTelefone("telefone com 8 dígitos")).toBe(true)
    expect(alertaFalaDeTelefone("Sem WhatsApp")).toBe(true)
    expect(alertaFalaDeTelefone("DDD inválido")).toBe(true)
  })

  it("alerta de outra natureza não vira alerta de telefone", () => {
    expect(alertaFalaDeTelefone("e-mail duplicado")).toBe(false)
    expect(alertaFalaDeTelefone(null)).toBe(false)
  })
})

describe("sinaisDoNegocio", () => {
  it("lê o negócio real da importação", () => {
    const s = sinaisDoNegocio({
      prioridade: "P1",
      segmento_parceiro: "A · Aluno Luan",
      tentativas_contato: 2,
      alerta_dados: "telefone com 8 dígitos",
      angulo_abordagem: "Compra mais antiga",
      proximo_contato: "2026-09-22",
    })
    expect(s.prioridade).toBe("P1")
    expect(s.segmentoCurto).toBe("A")
    expect(s.segmento).toBe("A · Aluno Luan")
    expect(s.tentativas).toBe(2)
    expect(s.alertaDeTelefone).toBe(true)
    expect(s.angulo).toBe("Compra mais antiga")
    expect(s.proximoContato).toBe("2026-09-22")
    expect(s.followupVencido).toBe(false)
  })

  it("custom_fields nulo não quebra e não inventa valor", () => {
    const s = sinaisDoNegocio(null)
    expect(s.prioridade).toBeNull()
    expect(s.segmento).toBeNull()
    expect(s.alerta).toBeNull()
    expect(s.tentativas).toBe(0)
    expect(s.followupVencido).toBe(false)
  })

  it("alerta vazio não acende o ícone", () => {
    expect(sinaisDoNegocio({ alerta_dados: "   " }).alerta).toBeNull()
  })

  it("followup_vencido aceita booleano e a string do JSONB", () => {
    expect(sinaisDoNegocio({ followup_vencido: true }).followupVencido).toBe(true)
    expect(sinaisDoNegocio({ followup_vencido: "true" }).followupVencido).toBe(true)
    expect(sinaisDoNegocio({ followup_vencido: false }).followupVencido).toBe(false)
  })
})

describe("motivoDeBloqueio", () => {
  const ok = { etapa: "A · Aluno Luan", tags: ["parceiro-luan"], telefone: "+5511999998888" }

  it("libera quem tem telefone e não está bloqueado", () => {
    expect(motivoDeBloqueio(ok)).toBeNull()
    expect(podeAbordar(ok)).toBe(true)
  })

  it("quem pediu pra parar vence tudo, inclusive telefone válido", () => {
    expect(motivoDeBloqueio({ ...ok, tags: ["nao-contatar"] })).toBe("nao_contatar")
  })

  it("tag em qualquer caixa bloqueia — a origem é planilha", () => {
    expect(motivoDeBloqueio({ ...ok, tags: [" NAO-CONTATAR "] })).toBe("nao_contatar")
  })

  it("negociação com o parceiro bloqueia a abordagem por fora", () => {
    expect(motivoDeBloqueio({ ...ok, etapa: "Aguardando liberação Luan" })).toBe(
      "aguardando_parceiro",
    )
  })

  it("sem telefone o botão só saberia falhar", () => {
    expect(motivoDeBloqueio({ ...ok, telefone: "" })).toBe("sem_telefone")
    expect(motivoDeBloqueio({ ...ok, telefone: "1199" })).toBe("sem_telefone")
    expect(motivoDeBloqueio({ ...ok, telefone: null })).toBe("sem_telefone")
  })

  it("a ordem é fixa: o pedido da pessoa é o mais caro de furar", () => {
    expect(
      motivoDeBloqueio({ etapa: "Aguardando liberação Luan", tags: ["nao-contatar"], telefone: "" }),
    ).toBe("nao_contatar")
  })
})
