import { describe, expect, it } from "vitest"
import { alvoDaResposta, donoDoNegocio, ehContatoDeComentario } from "./resposta-instagram"

describe("para quem a automação responde no Instagram", () => {
  it("comentário vira resposta no direct endereçada pelo id do comentário", () => {
    expect(alvoDaResposta({ event_kind: "comment", external_message_id: "18001", contact_external_id: "comment:media9" })).toEqual({
      via: "private_reply",
      para: "18001",
    })
  })

  it("direct vira DM para quem enviou", () => {
    expect(alvoDaResposta({ event_kind: "message", sender_external_id: "igsid-7", contact_external_id: "igsid-7" })).toEqual({
      via: "dm",
      para: "igsid-7",
    })
  })

  it("sem o remetente, o contato da thread de DM serve — o da thread de COMENTÁRIOS não", () => {
    expect(alvoDaResposta({ event_kind: "message", contact_external_id: "igsid-7" })).toEqual({ via: "dm", para: "igsid-7" })
    // `comment:<media>` é o post; mandar mensagem para ele é mandar para ninguém
    const r = alvoDaResposta({ event_kind: "message", contact_external_id: "comment:media9" })
    expect(r.via).toBeNull()
    expect(ehContatoDeComentario("comment:media9")).toBe(true)
    expect(ehContatoDeComentario("igsid-7")).toBe(false)
  })

  it("falta de dado devolve o motivo, nunca um destinatário inventado", () => {
    expect(alvoDaResposta({ event_kind: "comment" }).via).toBeNull()
    expect(alvoDaResposta({ event_kind: "comment" }).via === null && alvoDaResposta({ event_kind: "comment" })).toMatchObject({
      motivo: expect.stringContaining("id do comentário"),
    })
    expect(alvoDaResposta(null).via).toBeNull()
    expect(alvoDaResposta({}).via).toBeNull()
  })

  it("evento sem tipo declarado é tratado como direct", () => {
    expect(alvoDaResposta({ sender_external_id: "igsid-1" })).toEqual({ via: "dm", para: "igsid-1" })
  })
})

describe("donoDoNegocio: a conversa de comentários é do POST, não de uma pessoa", () => {
  it("thread de direct: o vínculo da própria conversa vale", () => {
    expect(donoDoNegocio({ contact_external_id: "17841400000" }, { sender_external_id: "17841400000" })).toEqual({
      escopo: "thread",
    })
    expect(donoDoNegocio(null, {})).toEqual({ escopo: "thread" })
  })

  it("thread de comentários: o dono é quem comentou, não o post", () => {
    expect(
      donoDoNegocio(
        { contact_external_id: "comment:media-9" },
        { event_kind: "comment", sender_external_id: "user-7", sender_name: "renata" },
      ),
    ).toEqual({ escopo: "pessoa", externalId: "user-7", nome: "renata" })
  })

  it("sem quem comentou, recusa: um negócio para o post inteiro é pior que nenhum", () => {
    const r = donoDoNegocio({ contact_external_id: "comment:media-9" }, { event_kind: "comment" })
    expect(r.escopo).toBeNull()
    if (r.escopo === null) expect(r.motivo).toContain("post inteiro")
  })

  it("nome ausente não vira string vazia", () => {
    expect(
      donoDoNegocio({ contact_external_id: "comment:m1" }, { sender_external_id: "u-1", sender_name: "   " }),
    ).toEqual({ escopo: "pessoa", externalId: "u-1", nome: null })
  })
})
