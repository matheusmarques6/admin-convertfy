import { describe, expect, it } from "vitest"

import { liberarTextoNoDesenho, pedeTextoNoDesenho } from "./texto-no-desenho"

/** O trecho REAL do user_template ativo em `email_agent_configs` (11/09). */
const TEMPLATE_DO_BANCO = [
  "CFY_THIS_FRAME — THE ONE IMAGE YOU ARE MAKING NOW.",
  "When it says this image is DEPENDENT of another, keep the session and change the frame. NEVER render any of this text.",
  "{{#if IMAGE_SLOTS}}{{IMAGE_SLOTS}}{{/if}}",
  "",
  "UNIVERSAL RESTRICTIONS:",
  "- Photographic realism, campaign quality.",
  "- No text, letters, numbers, logos or watermarks rendered in the image (text is added in the design layer downstream).",
  "- No distorted faces, no deformed hands, no frame, no watermark.",
].join("\n")

/** O bloco de slots como `buildImageSlots` o monta para o selo 1. */
const SLOTS_COM_TEXTO = [
  "1. Slot de 166 × 166px. formato: 166x166px · proporção 1:1",
  'texto_no_desenho (DESENHE estas palavras DENTRO da imagem, exatamente como estão entre aspas — não traduza, não reescreva, não abrevie e não invente outras; esta grafia é a que chega ao cliente):',
  '- seal_1_center: "REAL FIT"',
  '- seal_1_arc: "BAMBOO · REAL BODY · ALL DAY"',
].join("\n")

const SLOTS_SEM_TEXTO = [
  "1. Slot de 600 × 700px. formato: 600x700px · proporção 6:7",
  "especificidade: homem de costas ajustando a cintura da cueca, luz de manhã",
  "areas_de_texto: terço inferior reservado para a headline",
].join("\n")

describe("pedeTextoNoDesenho", () => {
  it("reconhece o bloco de slots que pede letra desenhada", () => {
    expect(pedeTextoNoDesenho(SLOTS_COM_TEXTO)).toBe(true)
  })

  it("slot de foto comum não pede", () => {
    expect(pedeTextoNoDesenho(SLOTS_SEM_TEXTO)).toBe(false)
  })

  it("ausente, vazio ou nulo não pede — o lado seguro de errar", () => {
    // Sem sinal, o prompt continua proibindo letra: é o comportamento de
    // hoje, e liberar por engano faria o modelo escrever na imagem o que
    // leu do slot.
    expect(pedeTextoNoDesenho(undefined)).toBe(false)
    expect(pedeTextoNoDesenho(null)).toBe(false)
    expect(pedeTextoNoDesenho("")).toBe(false)
  })
})

describe("liberarTextoNoDesenho", () => {
  it("troca as DUAS frases do template real do banco", () => {
    const r = liberarTextoNoDesenho(TEMPLATE_DO_BANCO)
    expect(r.trocas).toEqual(["never_render", "no_text"])
    expect(r.template).not.toContain("NEVER render any of this text.")
    expect(r.template).not.toContain("- No text, letters, numbers, logos or watermarks rendered")
  })

  it("a restrição continua existindo — só a exceção é nomeada", () => {
    // Apagar as frases trocaria "nenhuma letra" por "qualquer letra": o
    // modelo escreveria na imagem a especificidade, o nome do bloco e a
    // ideia do e-mail, que é o que a frase original protege.
    const r = liberarTextoNoDesenho(TEMPLATE_DO_BANCO)
    expect(r.template).toContain("texto_no_desenho")
    expect(r.template).toMatch(/ONLY text allowed in the image/)
    expect(r.template).toMatch(/No other letters, numbers, logos or watermarks/)
  })

  it("NÃO mexe no realismo fotográfico nem nas outras restrições", () => {
    // `copy_no_desenho` também cobre rótulo sobre foto, onde o realismo é o
    // certo, e o schema não separa os dois casos. Fica como lacuna.
    const r = liberarTextoNoDesenho(TEMPLATE_DO_BANCO)
    expect(r.template).toContain("- Photographic realism, campaign quality.")
    expect(r.template).toContain("- No distorted faces, no deformed hands, no frame, no watermark.")
  })

  it("template sem as frases volta intacto, sem erro", () => {
    const outro = "Desenhe uma foto de produto em fundo claro."
    const r = liberarTextoNoDesenho(outro)
    expect(r.template).toBe(outro)
    expect(r.trocas).toEqual([])
  })

  it("é idempotente — rodar de novo não muda mais nada", () => {
    const um = liberarTextoNoDesenho(TEMPLATE_DO_BANCO)
    const dois = liberarTextoNoDesenho(um.template)
    expect(dois.template).toBe(um.template)
    expect(dois.trocas).toEqual([])
  })

  it("a marca do slot SOBREVIVE à troca — é ela que o texto novo cita", () => {
    // Se a reescrita apagasse a palavra `texto_no_desenho`, a instrução
    // nova apontaria para uma seção que o modelo não encontraria.
    const r = liberarTextoNoDesenho(TEMPLATE_DO_BANCO)
    expect(pedeTextoNoDesenho(SLOTS_COM_TEXTO)).toBe(true)
    expect(r.template.includes("texto_no_desenho")).toBe(true)
  })
})
