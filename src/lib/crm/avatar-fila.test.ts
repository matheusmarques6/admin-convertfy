import { describe, it, expect } from "vitest"
import {
  JANELA_ERRO_HORAS,
  ORDEM_DA_FILA,
  JANELA_RESPOSTA_DIAS,
  cabeMaisUma,
  contarMotivos,
  janelasDaFila,
  origemRespondeu,
  type AvatarMotivo,
} from "./avatar-fila"

describe("origemRespondeu", () => {
  it("conta como resposta o contato sem foto: voltar amanhã não muda nada", () => {
    expect(origemRespondeu("sem_foto")).toBe(true)
    expect(origemRespondeu("preenchido")).toBe(true)
  })

  it("conta como resposta o canal sem API de foto (WhatsApp Cloud)", () => {
    expect(origemRespondeu("sem_caminho")).toBe(true)
  })

  it("NÃO conta erro do provedor — é transitório e merece janela curta", () => {
    expect(origemRespondeu("erro_provedor")).toBe(false)
  })

  it("NÃO conta o que nem chegou a ser tentado", () => {
    const naoTentados: AvatarMotivo[] = [
      "canal_indisponivel",
      "sem_credencial",
      "cooldown",
      "sem_contato",
      "ja_espelhado",
    ]
    for (const m of naoTentados) expect(origemRespondeu(m)).toBe(false)
  })
})

describe("janelasDaFila", () => {
  const agora = new Date("2026-09-08T18:00:00.000Z")

  it("dá janela longa a quem respondeu e curta a quem falhou", () => {
    const { checadoAntesDe, falhouAntesDe } = janelasDaFila(agora)
    expect(checadoAntesDe).toBe("2026-09-01T18:00:00.000Z")
    expect(falhouAntesDe).toBe("2026-09-08T17:00:00.000Z")
  })

  it("a janela de erro é MUITO menor que a de resposta — é o que destrava a fila", () => {
    expect(JANELA_ERRO_HORAS).toBeLessThan(JANELA_RESPOSTA_DIAS * 24)
  })

  it("devolve ISO 8601 — o valor entra cru no or() do PostgREST", () => {
    const { checadoAntesDe } = janelasDaFila(agora)
    expect(checadoAntesDe).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe("contarMotivos", () => {
  it("agrega por motivo: 'filled: 0' não distingue canal off de contato sem foto", () => {
    expect(contarMotivos(["sem_foto", "erro_provedor", "sem_foto"])).toEqual({
      sem_foto: 2,
      erro_provedor: 1,
    })
  })

  it("rodada vazia devolve objeto vazio, não zeros inventados", () => {
    expect(contarMotivos([])).toEqual({})
  })
})

describe("cabeMaisUma", () => {
  it("para quando o orçamento acaba", () => {
    expect(cabeMaisUma(0, 239_000, 240_000)).toBe(true)
    expect(cabeMaisUma(0, 240_000, 240_000)).toBe(false)
    expect(cabeMaisUma(0, 999_000, 240_000)).toBe(false)
  })
})

describe("ORDEM_DA_FILA", () => {
  it("põe a falha ANTES do check: carimbar a falha não basta se quem falhou volta ao topo", () => {
    expect(ORDEM_DA_FILA[0].coluna).toBe("contact_avatar_failed_at")
    expect(ORDEM_DA_FILA[1].coluna).toBe("contact_avatar_checked_at")
  })

  it("nulo primeiro nas duas: quem nunca falhou e nunca foi tentado tem a vez", () => {
    expect(ORDEM_DA_FILA[0].nulosPrimeiro).toBe(true)
    expect(ORDEM_DA_FILA[1].nulosPrimeiro).toBe(true)
  })

  it("desempata pela conversa mais recente, que é a que o operador olha", () => {
    const ultimo = ORDEM_DA_FILA[ORDEM_DA_FILA.length - 1]
    expect(ultimo.coluna).toBe("last_message_at")
    expect(ultimo.ascendente).toBe(false)
  })
})
