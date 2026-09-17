import { describe, it, expect } from "vitest"
import { CACHE_PREFIX_MARKER } from "../shared/cache-de-prompt"
import { DEFAULT_CHOOSER_VAULT_USER } from "./curador-shadow"
import {
  BLOCOS_QUE_VIRAM_CAUDA,
  CAUDA_POSICAO_USER,
  LEQUE_SYSTEM,
  idsBloqueadosPelaRepeticao,
  montarLequeUser,
  removerBloco,
  renderJaDecididas,
} from "./curador-leque-prompt"

describe("removerBloco", () => {
  it("tira o bloco inteiro, com abertura e fechamento", () => {
    const t = "antes\n<alvo>\nmiolo\nem duas linhas\n</alvo>\ndepois"
    expect(removerBloco(t, "alvo")).not.toContain("miolo")
    expect(removerBloco(t, "alvo")).toContain("antes")
    expect(removerBloco(t, "alvo")).toContain("depois")
  })

  it("LANÇA quando a tag não existe — renomear no prompt vivo não pode passar calado", () => {
    expect(() => removerBloco("<a>x</a>", "b")).toThrow(/curador_leque_bloco_ausente:b/)
  })

  it("não deixa a tag de fechamento para trás quando o bloco se repete", () => {
    const t = "<x>1</x>\nmeio\n<x>2</x>"
    const out = removerBloco(t, "x")
    expect(out).not.toContain("<x>")
    expect(out).not.toContain("</x>")
    expect(out).toContain("meio")
  })
})

describe("montarLequeUser", () => {
  const leque = montarLequeUser(DEFAULT_CHOOSER_VAULT_USER)

  it("remove EXATAMENTE os três blocos que passam a ser servidos por posição", () => {
    for (const tag of BLOCOS_QUE_VIRAM_CAUDA) {
      expect(leque, tag).not.toContain(`<${tag}>`)
      expect(leque, tag).not.toContain(`</${tag}>`)
    }
  })

  it("preserva as três marcas de cache — o prefixo é o que o leque existe para cachear", () => {
    const marcas = (s: string) => s.split(CACHE_PREFIX_MARKER).length - 1
    expect(marcas(leque)).toBe(marcas(DEFAULT_CHOOSER_VAULT_USER))
    expect(marcas(leque)).toBe(3)
  })

  it("mantém a sequência do e-mail no prefixo, e não o índice do vault", () => {
    // A sequência é o arco, e é dela que o modelo situa a posição desta
    // chamada. O índice saiu do prompt em 17/09 — as ferramentas de
    // consulta sob demanda nunca rodaram em produção, então ele descrevia
    // pastas que ninguém podia abrir.
    expect(leque).toContain("<estrutura_do_email>")
    expect(leque).toContain("{{blocks_json}}")
    expect(leque).not.toContain("{{indice_vault}}")
  })

  it("troca as duas frases que mandam decidir o conjunto", () => {
    expect(leque).not.toContain("Selecione a variante de cada posição")
    expect(leque).not.toContain("Sua tarefa: para cada posição")
    expect(leque).toContain("Você decide UMA posição")
  })

  it("LANÇA quando uma das frases sumiu do prompt vivo", () => {
    const semInstrucao = DEFAULT_CHOOSER_VAULT_USER.replace(
      "Selecione a variante de cada posição",
      "Escolha a variante de cada posição",
    )
    expect(() => montarLequeUser(semInstrucao)).toThrow(/curador_leque_frase_ausente/)
  })

  it("não sobra var de bloco removido — senão o render deixaria `{{…}}` cru no prompt", () => {
    for (const v of ["{{secoes_notas}}", "{{lacunas_biblioteca}}", "{{eliminadas_requisito}}"]) {
      expect(leque, v).not.toContain(v)
    }
  })
})

describe("LEQUE_SYSTEM", () => {
  it("não serve o catálogo — ele desce para a cauda, fatiado", () => {
    expect(LEQUE_SYSTEM).not.toContain("{{catalogo}}")
    expect(LEQUE_SYSTEM).toContain("{{protocolo}}")
    expect(LEQUE_SYSTEM).toContain("{{convivencias}}")
  })

  it("o contrato de saída descreve UMA posição", () => {
    expect(LEQUE_SYSTEM).toContain('"block_index":0')
    expect(LEQUE_SYSTEM).not.toContain("papeis")
  })

  it("as regras de conjunto apontam para blocos que a chamada realmente recebe", () => {
    // A lição de `momento` e `exige`: regra sobre dado não servido faz o
    // modelo procurar o que não recebeu.
    expect(LEQUE_SYSTEM).toContain("<ja_decididas>")
    expect(LEQUE_SYSTEM).not.toContain("<ainda_por_decidir>")
    for (const tag of ["<ja_decididas>", "<estrutura_do_email>"]) {
      expect(LEQUE_SYSTEM, tag).toContain(tag)
    }
  })

  it("toda tag citada pelo system chega pelo prefixo ou pela cauda", () => {
    const prefixo = montarLequeUser(DEFAULT_CHOOSER_VAULT_USER)
    const citadas = Array.from(LEQUE_SYSTEM.matchAll(/<([a-z_]+)>/g), (m) => m[1])
    // as do próprio system, que ele mesmo abre
    const proprias = new Set(["protocolo_de_selecao", "biblioteca", "convivencia"])
    for (const tag of new Set(citadas)) {
      if (proprias.has(tag)) continue
      const servida = prefixo.includes(`<${tag}>`) || CAUDA_POSICAO_USER.includes(`<${tag}>`)
      expect(servida, `<${tag}> é citada no system e não é servida`).toBe(true)
    }
  })
})

describe("CAUDA_POSICAO_USER", () => {
  it("traz a posição, as candidatas dela e o estado — não uma segunda cópia da sequência", () => {
    expect(CAUDA_POSICAO_USER).toContain("{{posicao_candidatas}}")
    expect(CAUDA_POSICAO_USER).toContain("{{ja_decididas}}")
    expect(CAUDA_POSICAO_USER).not.toContain("{{ainda_por_decidir}}")
    expect(CAUDA_POSICAO_USER).not.toContain("{{blocks_json}}")
  })

  it("nenhuma marca de cache — a cauda é o que muda entre as chamadas", () => {
    expect(CAUDA_POSICAO_USER).not.toContain(CACHE_PREFIX_MARKER)
  })
})

describe("renderJaDecididas", () => {
  it("declara a ausência na primeira posição em vez de deixar o bloco vazio", () => {
    expect(renderJaDecididas([])).toContain("PRIMEIRA")
  })

  it("lista o que já foi escolhido, com seção normalizada", () => {
    const out = renderJaDecididas([
      { block_index: 0, section: " Hero ", variant_id: "v1", nome: "hero 3", papel: "abre" },
    ])
    expect(out).toContain("[0] hero: v1")
    expect(out).toContain("hero 3")
    expect(out).toContain("abre")
  })
})

describe("idsBloqueadosPelaRepeticao", () => {
  const ja = [
    { block_index: 0, section: "hero", variant_id: "h1" },
    { block_index: 1, section: "body", variant_id: "b1" },
    { block_index: 2, section: "products", variant_id: "p1" },
  ]

  it("bloqueia em hero e products", () => {
    expect(idsBloqueadosPelaRepeticao("hero", ja)).toEqual(["h1"])
    expect(idsBloqueadosPelaRepeticao("products", ja)).toEqual(["p1"])
  })

  it("não bloqueia fora delas — repetir corpo é composição legítima", () => {
    expect(idsBloqueadosPelaRepeticao("body", ja)).toEqual([])
    expect(idsBloqueadosPelaRepeticao("footer", ja)).toEqual([])
  })

  it("normaliza a seção dos dois lados", () => {
    expect(idsBloqueadosPelaRepeticao(" HERO ", [{ block_index: 0, section: "Hero", variant_id: "h1" }])).toEqual(["h1"])
  })
})
