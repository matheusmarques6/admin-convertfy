import { describe, expect, it } from "vitest"
import { campoDaLegenda, familiaDaPrevia, familiaDoMolde, previaDoMeuTemplate, previaDoMolde } from "./previa-de-template"
import { FAMILIAS, familiaDe } from "./familias"
import { ST_TEMPLATES, getTemplate } from "./templates"
import type { EstruturaDetectada, MeuTemplate } from "./types"

const ESTRUTURA: EstruturaDetectada[] = [{ tipo: "capa" }, { tipo: "texto" }, { tipo: "cta" }]

const tpl = (id: string, familia?: MeuTemplate["familia"]): Pick<MeuTemplate, "nome" | "estrutura" | "templateId" | "familia"> => ({
  nome: "Forma salva",
  estrutura: ESTRUTURA,
  templateId: id,
  ...(familia ? { familia } : {}),
})

describe("familiaDoMolde", () => {
  it("devolve a identidade que o molde pressupõe", () => {
    expect(familiaDoMolde("molde-post")).toBe("post")
    expect(familiaDoMolde("molde-historia")).toBe("post-largo")
  })

  it("id desconhecido devolve a identidade do molde que o clique VAI entregar", () => {
    // `getTemplate` cai no primeiro da prateleira; a prévia tem de mostrar
    // exatamente isso, senão volta o defeito original (prévia ≠ clique).
    expect(familiaDoMolde("molde-que-nao-existe")).toBe(ST_TEMPLATES[0].familia ?? "padrao")
  })

  it("sem molde base nenhum, a padrão", () => {
    expect(familiaDoMolde(undefined)).toBe("padrao")
  })
})

describe("familiaDaPrevia", () => {
  it("o que foi GRAVADO vence o palpite do molde base", () => {
    // Um "Print de post" salvo na paleta da casa é uma decisão da peça; o
    // molde base não pode desfazê-la na prateleira.
    expect(familiaDaPrevia(tpl("molde-post", "padrao"))).toBe("padrao")
    expect(familiaDaPrevia(tpl("molde-manchete", "post"))).toBe("post")
  })

  it("template anterior à coluna herda do molde base — nunca a padrão fixa", () => {
    expect(familiaDaPrevia(tpl("molde-post"))).toBe("post")
  })

  it("valor inválido vindo do banco não vira família", () => {
    // Cai no molde base em vez de virar família — nunca no valor do banco.
    expect(familiaDaPrevia({ templateId: "molde-manchete", familia: "roxo" as never })).toBe("manchete")
  })
})

describe("previaDoMolde", () => {
  it("TODO molde da casa desenha a prévia na identidade que ele aplica ao ser escolhido", () => {
    // É o defeito que o módulo conserta: a prévia nascia na padrão e o
    // clique aplicava outra família.
    for (const t of ST_TEMPLATES) {
      expect(familiaDe(previaDoMolde(t))).toBe(t.familia ?? "padrao")
    }
  })

  it("o print de post não guarda o gradiente da capa da família anterior", () => {
    const d = previaDoMolde(getTemplate("molde-post"))
    for (const f of d.frames) expect(d.fundoPorFrame[f.frameId]).toBe(FAMILIAS.post.fundoClaro)
  })

  it("a legenda pousa no campo que a capa DESENHA", () => {
    // Capa com subtítulo (Manchete). Print de post: desenha corpo — e
    // escrever no subtítulo fazia a descrição sumir da prévia em silêncio.
    const casa = previaDoMolde(getTemplate("molde-manchete"))
    expect(casa.frames[0].textos.subtitulo).toBe(getTemplate("molde-manchete").descricao.split(".")[0])
    const post = previaDoMolde(getTemplate("molde-post"))
    expect(post.frames[0].textos.corpo).toBe(getTemplate("molde-post").descricao.split(".")[0])
    expect(post.frames[0].textos.titulo).toBe("Print de post")
  })

  it("campoDaLegenda devolve null quando a capa não desenha nenhum dos dois", () => {
    expect(campoDaLegenda(["titulo", "botao"])).toBeNull()
    expect(campoDaLegenda(["titulo", "subtitulo", "corpo"])).toBe("subtitulo")
  })
})

describe("previaDoMeuTemplate", () => {
  it("desenha na identidade gravada com o template", () => {
    expect(familiaDe(previaDoMeuTemplate(tpl("molde-manchete", "post-largo"), ""))).toBe("post-largo")
  })

  it("mantém os textos-guia: a prévia é o que criar a partir dele entrega", () => {
    const d = previaDoMeuTemplate(tpl("molde-post", "post"), "")
    expect(d.frames).toHaveLength(ESTRUTURA.length)
    expect(d.frames[0].textos.titulo).toBeTruthy()
    expect(d.frames[0].textos.titulo).not.toBe("Forma salva")
  })
})
