import { describe, it, expect } from "vitest"
import {
  conferirDestino,
  dadosDoLead,
  montarDestino,
  normalizarDestino,
  type DestinoDoFinal,
} from "../destino"
import { normalizarSchema } from "../schema"
import type { FormBlock } from "@/types/forms-conversational"

const blocos: FormBlock[] = [
  { ref: "f1", type: "text", label: "Nome", map_to_lead_field: "first_name" },
  { ref: "f2", type: "text", label: "Sobrenome", map_to_lead_field: "last_name" },
  { ref: "f3", type: "email", label: "E-mail", map_to_lead_field: "email" },
  { ref: "f4", type: "url", label: "Endereço da loja", alias: "loja" },
]

const ctx = {
  answers: {
    f1: "Ana",
    f2: "Souza Lima",
    f3: "ana@lojinha.com",
    f4: "lojinha.com",
  },
  blocks: blocos,
}

describe("montarDestino · WhatsApp", () => {
  it("põe o DDI que falta — wa.me/11999998888 não resolve", () => {
    const d: DestinoDoFinal = { tipo: "whatsapp", numero: "11999998888" }
    expect(montarDestino(d, ctx)?.url).toBe("https://wa.me/5511999998888")
  })

  it("codifica a mensagem: um & cru cortaria o texto no meio", () => {
    const d: DestinoDoFinal = {
      tipo: "whatsapp",
      numero: "+5511999998888",
      mensagem: "Oi! Vim do diagnóstico & quero falar de {{loja}}",
    }
    const url = montarDestino(d, ctx)!.url
    expect(url).toBe(
      "https://wa.me/5511999998888?text=" +
        encodeURIComponent("Oi! Vim do diagnóstico & quero falar de lojinha.com"),
    )
    expect(url).not.toContain("&text")
  })

  it("sem número não monta destino nenhum — a tela final aparece como sempre", () => {
    expect(montarDestino({ tipo: "whatsapp", numero: "" }, ctx)).toBeNull()
    expect(montarDestino({ tipo: "whatsapp", numero: "123" }, ctx)).toBeNull()
  })

  it("mensagem com recall não respondido não imprime o {{cru}}", () => {
    const d: DestinoDoFinal = { tipo: "whatsapp", numero: "11999998888", mensagem: "Oi, {{f9}}!" }
    expect(montarDestino(d, ctx)!.url).not.toContain("%7B%7B")
  })
})

describe("montarDestino · Calendly", () => {
  it("pré-preenche nome inteiro e email", () => {
    const d: DestinoDoFinal = { tipo: "calendly", url: "https://calendly.com/convertfy/diagnostico" }
    const u = new URL(montarDestino(d, ctx)!.url)
    expect(u.searchParams.get("name")).toBe("Ana Souza Lima")
    expect(u.searchParams.get("email")).toBe("ana@lojinha.com")
  })

  it("preserva a query que já estava no link", () => {
    const d: DestinoDoFinal = {
      tipo: "calendly",
      url: "https://calendly.com/convertfy/diag?hide_gdpr_banner=1",
    }
    const u = new URL(montarDestino(d, ctx)!.url)
    expect(u.searchParams.get("hide_gdpr_banner")).toBe("1")
    expect(u.searchParams.get("name")).toBe("Ana Souza Lima")
  })

  it("a UTM da visita vence a escrita no link: ela identifica o clique que pagou", () => {
    const d: DestinoDoFinal = {
      tipo: "calendly",
      url: "https://calendly.com/c/d?utm_source=site",
    }
    const u = new URL(montarDestino(d, { ...ctx, utm: { utm_source: "meta-ads" } })!.url)
    expect(u.searchParams.get("utm_source")).toBe("meta-ads")
  })

  it("UTM ausente na visita não apaga a do link nem escreve vazio", () => {
    const d: DestinoDoFinal = {
      tipo: "calendly",
      url: "https://calendly.com/c/d?utm_source=site",
    }
    const u = new URL(montarDestino(d, { ...ctx, utm: { utm_source: "  ", utm_medium: "" } })!.url)
    expect(u.searchParams.get("utm_source")).toBe("site")
    expect(u.searchParams.has("utm_medium")).toBe(false)
  })

  it("lead sem email não escreve email= vazio", () => {
    const d: DestinoDoFinal = { tipo: "calendly", url: "https://calendly.com/c/d" }
    const u = new URL(montarDestino(d, { answers: { f1: "Ana" }, blocks: blocos })!.url)
    expect(u.searchParams.has("email")).toBe(false)
    expect(u.searchParams.get("name")).toBe("Ana")
  })
})

describe("montarDestino · segurança e bordas", () => {
  it("javascript: é recusado — é o único lugar do formulário que o navegador executa", () => {
    expect(montarDestino({ tipo: "url", url: "javascript:alert(1)" }, ctx)).toBeNull()
    expect(montarDestino({ tipo: "url", url: "data:text/html,<script>" }, ctx)).toBeNull()
  })

  it("endereço vazio ou quebrado não monta destino", () => {
    expect(montarDestino({ tipo: "url", url: "" }, ctx)).toBeNull()
    expect(montarDestino({ tipo: "url", url: "calendly.com/sem-esquema" }, ctx)).toBeNull()
  })

  it("destino ausente ou de tipo desconhecido devolve null", () => {
    expect(montarDestino(null, ctx)).toBeNull()
    expect(montarDestino({ tipo: "pombo-correio" } as unknown as DestinoDoFinal, ctx)).toBeNull()
  })

  it("rótulo vazio cai no padrão do tipo", () => {
    expect(montarDestino({ tipo: "whatsapp", numero: "11999998888", rotulo: "  " }, ctx)!.rotulo).toBe(
      "Falar no WhatsApp agora",
    )
    expect(montarDestino({ tipo: "whatsapp", numero: "11999998888", rotulo: "Chamar" }, ctx)!.rotulo).toBe(
      "Chamar",
    )
  })
})

describe("conferirDestino", () => {
  it("aponta o que falta antes de alguém publicar", () => {
    expect(conferirDestino({ tipo: "whatsapp", numero: "" })).toBe("sem_numero")
    expect(conferirDestino({ tipo: "whatsapp", numero: "12" })).toBe("numero_invalido")
    expect(conferirDestino({ tipo: "calendly", url: "" })).toBe("sem_url")
    expect(conferirDestino({ tipo: "calendly", url: "calendly.com" })).toBe("url_invalida")
    expect(conferirDestino({ tipo: "url", url: "javascript:x" })).toBe("esquema_proibido")
  })

  it("recall no meio do endereço não reprova uma configuração certa", () => {
    // `{{loja}}` só resolve na hora de quem responde; no editor ele é
    // literal e o `new URL` reprovaria o que funciona em produção.
    expect(conferirDestino({ tipo: "url", url: "https://app.com/{{loja}}" })).toBeNull()
  })

  it("destino utilizável não tem falha", () => {
    expect(conferirDestino({ tipo: "whatsapp", numero: "+5511999998888" })).toBeNull()
    expect(conferirDestino({ tipo: "calendly", url: "https://calendly.com/c/d" })).toBeNull()
  })
})

describe("dadosDoLead", () => {
  it("compõe o nome inteiro a partir das duas metades", () => {
    expect(dadosDoLead(blocos, { f1: "Ana", f2: "Souza" }).nome).toBe("Ana Souza")
  })

  it("um campo 'name' inteiro vence a composição", () => {
    const b: FormBlock[] = [
      ...blocos,
      { ref: "f5", type: "text", label: "Nome completo", map_to_lead_field: "name" },
    ]
    expect(dadosDoLead(b, { f1: "Ana", f2: "Souza", f5: "Ana Maria Souza" }).nome).toBe(
      "Ana Maria Souza",
    )
  })

  it("sem bloco mapeado devolve vazio, não inventa", () => {
    expect(dadosDoLead(undefined, { f1: "Ana" })).toEqual({ nome: "", email: "" })
  })
})

describe("normalizarDestino", () => {
  it("descarta tipo desconhecido e objeto torto", () => {
    expect(normalizarDestino(null)).toBeNull()
    expect(normalizarDestino({ tipo: "pombo" })).toBeNull()
    expect(normalizarDestino("https://x")).toBeNull()
  })

  it("coage strings vazias para null e automatico para booleano", () => {
    expect(normalizarDestino({ tipo: "whatsapp", numero: "  ", automatico: "sim" })).toEqual({
      tipo: "whatsapp",
      numero: null,
      mensagem: null,
      url: null,
      automatico: false,
      rotulo: null,
    })
  })

  it("SOBREVIVE ao normalizador do schema — publicar não pode apagá-lo", () => {
    // O normalizador descarta todo campo que não conhece, e ele roda no
    // GET público e na publicação: sem `destino` na lista, o WhatsApp
    // configurado no editor sumiria no primeiro clique em Publicar, sem
    // erro nenhum.
    const schema = normalizarSchema({
      version: 1,
      display_mode: "conversational",
      blocks: [],
      endings: [
        {
          ref: "ok",
          title: "Pronto",
          destino: { tipo: "whatsapp", numero: "+5511999998888", automatico: true },
        },
      ],
    })
    expect(schema.endings?.[0].destino).toMatchObject({
      tipo: "whatsapp",
      numero: "+5511999998888",
      automatico: true,
    })
  })
})
