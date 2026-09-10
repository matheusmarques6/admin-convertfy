import { describe, expect, it } from "vitest"
import {
  avaliarCanal,
  estadoDaLista,
  explicacaoDoCaminho,
  motivoDeNenhumCanal,
  separarCanais,
  type CanalParaAbertura,
} from "./nova-conversa"

const canal = (over: Partial<CanalParaAbertura> = {}): CanalParaAbertura => ({
  id: "c1",
  type: "whatsapp",
  display_name: "Loja",
  provider: "evolution",
  ...over,
})

describe("quem pode puxar a primeira mensagem", () => {
  it("Evolution manda texto livre — é o número falando pelo aparelho", () => {
    const a = avaliarCanal(canal({ provider: "evolution" }))
    expect(a.pode).toBe(true)
    expect(a.caminho).toBe("texto_livre")
  })

  it("WhatsApp Cloud só por template: na conversa nova a janela está fechada por definição", () => {
    const a = avaliarCanal(canal({ provider: "whatsapp_cloud" }))
    expect(a.pode).toBe(true)
    expect(a.caminho).toBe("template")
  })

  it("Instagram nunca inicia, e o motivo diz que a pessoa precisa escrever primeiro", () => {
    const a = avaliarCanal(canal({ type: "instagram", provider: null }))
    expect(a.pode).toBe(false)
    expect(a.motivo).toMatch(/escrever/i)
  })

  it("Evolution desconectado é recusado COM o estado no motivo — 'não funciona' não diz o que fazer", () => {
    const a = avaliarCanal(canal({ connection_state: "close" }))
    expect(a.pode).toBe(false)
    expect(a.motivo).toContain("close")
    expect(a.motivo).toMatch(/Canais/)
  })

  it("Evolution com estado desconhecido PASSA — inclusive o literal 'unknown' que o GET devolve", () => {
    expect(avaliarCanal(canal({ connection_state: null })).pode).toBe(true)
    expect(avaliarCanal(canal({ connection_state: undefined })).pode).toBe(true)
    expect(avaliarCanal(canal({ connection_state: "unknown" })).pode).toBe(true)
    expect(avaliarCanal(canal({ connection_state: "open" })).pode).toBe(true)
  })

  it("canal desativado sai da lista, mas com motivo", () => {
    const a = avaliarCanal(canal({ is_active: false }))
    expect(a.pode).toBe(false)
    expect(a.motivo).toMatch(/desativado/)
  })

  it("provedor desconhecido é recusado — inventar capacidade custa mensagem rejeitada sem explicação", () => {
    expect(avaliarCanal(canal({ provider: "twilio" })).pode).toBe(false)
    expect(avaliarCanal(canal({ provider: null })).pode).toBe(false)
  })

  it("tipo que não envia mensagem nomeia o próprio tipo", () => {
    const a = avaliarCanal(canal({ type: "email", provider: null }))
    expect(a.pode).toBe(false)
    expect(a.motivo).toContain("email")
  })
})

describe("separarCanais", () => {
  it("texto livre vem primeiro: é o caminho sem fricção", () => {
    const sep = separarCanais([
      canal({ id: "cloud", provider: "whatsapp_cloud" }),
      canal({ id: "evo", provider: "evolution" }),
    ])
    expect(sep.disponiveis.map((d) => d.canal.id)).toEqual(["evo", "cloud"])
    expect(sep.bloqueados).toHaveLength(0)
  })

  it("bloqueado não some: fica na lista com o motivo", () => {
    const sep = separarCanais([
      canal({ id: "ig", type: "instagram", provider: null }),
      canal({ id: "evo" }),
    ])
    expect(sep.disponiveis.map((d) => d.canal.id)).toEqual(["evo"])
    expect(sep.bloqueados.map((b) => b.canal.id)).toEqual(["ig"])
  })
})

describe("motivoDeNenhumCanal", () => {
  it("com canal disponível não há aviso — null, não string vazia", () => {
    expect(motivoDeNenhumCanal(separarCanais([canal()]))).toBeNull()
  })

  it("nenhum canal conectado manda conectar em Canais", () => {
    const msg = motivoDeNenhumCanal(separarCanais([]))
    expect(msg).toMatch(/Nenhum canal conectado/)
  })

  it("só Instagram é um caso próprio: a limitação é da plataforma, não da conta", () => {
    const sep = separarCanais([
      canal({ id: "ig1", type: "instagram", provider: null }),
      canal({ id: "ig2", type: "instagram", provider: null }),
    ])
    expect(motivoDeNenhumCanal(sep)).toMatch(/Instagram não permite iniciar/)
  })

  it("bloqueio misto manda ler os motivos, em vez de escolher um deles", () => {
    const sep = separarCanais([
      canal({ id: "ig", type: "instagram", provider: null }),
      canal({ id: "evo", connection_state: "close" }),
    ])
    expect(motivoDeNenhumCanal(sep)).toMatch(/Confira os motivos/)
  })
})

describe("explicacaoDoCaminho", () => {
  it("o Cloud diz POR QUE abre bloqueado — senão a restrição parece defeito nosso", () => {
    const t = explicacaoDoCaminho("template")
    expect(t).toMatch(/TEMPLATE/)
    expect(t).toMatch(/24h/)
  })

  it("o texto livre promete o composer inteiro, que é o motivo de abrir a conversa", () => {
    const t = explicacaoDoCaminho("texto_livre")
    for (const recurso of [/texto/i, /imagem/i, /áudio/i, /arquivo/i]) {
      expect(t).toMatch(recurso)
    }
  })
})

describe("estadoDaLista", () => {
  it("carregando sem canal é 'não sei ainda' — nunca 'não há canal'", () => {
    const e = estadoDaLista(separarCanais([]), true)
    expect(e.tipo).toBe("carregando")
    expect(e.tipo === "carregando" && e.texto).toMatch(/Carregando/)
  })

  it("carregando COM canal já é ok: o dado que importa chegou", () => {
    expect(estadoDaLista(separarCanais([canal()]), true).tipo).toBe("ok")
  })

  it("terminado sem canal mantém o aviso de hoje", () => {
    const e = estadoDaLista(separarCanais([]), false)
    expect(e.tipo).toBe("aviso")
    expect(e.tipo === "aviso" && e.texto).toMatch(/Nenhum canal conectado/)
  })

  it("terminado só com Instagram mantém o motivo da plataforma", () => {
    const e = estadoDaLista(separarCanais([canal({ type: "instagram", provider: null })]), false)
    expect(e.tipo === "aviso" && e.texto).toMatch(/Instagram não permite iniciar/)
  })
})
