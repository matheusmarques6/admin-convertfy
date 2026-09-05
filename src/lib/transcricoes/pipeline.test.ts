import { describe, expect, it } from "vitest"
import {
  classificarErro,
  ehRetentavel,
  fmtDuracao,
  fmtDuracaoLonga,
  MAX_TENTATIVAS,
  mensagemDeErro,
  parseTimestamp,
  proximaTentativaMs,
  rotuloDaEtapa,
  segmentosDaEtapa,
} from "./pipeline"

describe("classificarErro", () => {
  it("reconhece bloqueio de IP nas frases reais das plataformas", () => {
    // É o erro mais comum em produção, não exceção rara: cada uma dessas
    // frases é uma saída real do yt-dlp.
    for (const bruto of [
      "ERROR: [youtube] Sign in to confirm you're not a bot",
      "HTTP Error 429: Too Many Requests",
      "ERROR: unable to download: HTTP Error 403: Forbidden",
      "Your request looks like unusual traffic",
    ]) {
      expect(classificarErro(bruto)).toBe("ip_bloqueado")
    }
  })

  it("separa login exigido de vídeo indisponível", () => {
    expect(classificarErro("ERROR: Private video. Login required")).toBe("login_exigido")
    expect(classificarErro("ERROR: Video unavailable")).toBe("indisponivel")
    expect(classificarErro("HTTP Error 404: Not Found")).toBe("indisponivel")
  })

  it("reconhece a resposta sem fala e NÃO a torna retentável", () => {
    // Áudio mudo devolve 200 com zero segmentos. Sem código próprio isso
    // caía em "desconhecido" e o item era retranscrito cinco vezes — cinco
    // chamadas cobradas para chegar ao mesmo lugar.
    expect(classificarErro("O provedor não devolveu nenhuma fala para este áudio.")).toBe("sem_fala")
    expect(classificarErro("a transcrição não produziu nenhuma fala")).toBe("sem_fala")
    expect(ehRetentavel("sem_fala", 0)).toBe(false)
    expect(mensagemDeErro("sem_fala", "YouTube")).toMatch(/mudo|sem voz/)
  })

  it("cai em desconhecido sem inventar categoria", () => {
    expect(classificarErro("ENOSPC: no space left on device")).toBe("desconhecido")
    expect(classificarErro("")).toBe("desconhecido")
  })
})

describe("mensagemDeErro", () => {
  it("bloqueio de IP tem mensagem própria e legível, nunca falha genérica", () => {
    const m = mensagemDeErro("ip_bloqueado", "YouTube")
    expect(m).toContain("YouTube")
    expect(m).toContain("bloqueou")
    expect(m).not.toMatch(/error|http|429/i)
  })

  it("login exigido diz o que fazer", () => {
    expect(mensagemDeErro("login_exigido", "Instagram")).toContain("upload")
  })
})

describe("retry", () => {
  it("bloqueio de IP é retentável até o teto; indisponível nunca é", () => {
    expect(ehRetentavel("ip_bloqueado", 0)).toBe(true)
    expect(ehRetentavel("ip_bloqueado", MAX_TENTATIVAS)).toBe(false)
    expect(ehRetentavel("indisponivel", 0)).toBe(false)
    expect(ehRetentavel("login_exigido", 0)).toBe(false)
  })

  it("backoff cresce e respeita o teto de 30 min", () => {
    const semJitter = () => 0.5
    const a = proximaTentativaMs(1, semJitter)
    const b = proximaTentativaMs(3, semJitter)
    expect(b).toBeGreaterThan(a)
    expect(proximaTentativaMs(20, semJitter)).toBeLessThanOrEqual(30 * 60_000)
  })

  it("tem jitter: cinco falhas do mesmo minuto não voltam juntas", () => {
    expect(proximaTentativaMs(2, () => 0)).not.toBe(proximaTentativaMs(2, () => 1))
  })
})

describe("segmentosDaEtapa", () => {
  it("a etapa de transcrição NUNCA tem porcentagem", () => {
    // É uma chamada síncrona ao provedor: não existe progresso real. Número
    // inventado aqui é o que faz o usuário achar que travou em 70%.
    const segs = segmentosDaEtapa("processando", 2, 70)
    const transcrevendo = segs[2]
    expect(transcrevendo.estado).toBe("atual")
    expect(transcrevendo.preenchimento).toBeNull()
  })

  it("etapa mensurável usa o valor real e as anteriores ficam cheias", () => {
    const segs = segmentosDaEtapa("processando", 0, 62)
    expect(segs[0]).toMatchObject({ estado: "atual", preenchimento: 62 })
    expect(segs[1].estado).toBe("futura")

    const depois = segmentosDaEtapa("processando", 3, 40)
    expect(depois[0].preenchimento).toBe(100)
    expect(depois[3]).toMatchObject({ estado: "atual", preenchimento: 40 })
  })

  it("pronta enche tudo", () => {
    expect(segmentosDaEtapa("pronta", 3, null).every((s) => s.preenchimento === 100)).toBe(true)
  })

  it("etapa mensurável sem progresso reportado não vira zero", () => {
    // Zero desenharia "0%" como se soubéssemos que nada andou.
    expect(segmentosDaEtapa("processando", 0, null)[0].preenchimento).toBeNull()
  })
})

describe("rotuloDaEtapa", () => {
  it("mostra porcentagem só onde ela existe", () => {
    expect(rotuloDaEtapa("processando", 0, 62)).toBe("Baixando 62%")
    expect(rotuloDaEtapa("processando", 2, 62)).toBe("Transcrevendo")
    expect(rotuloDaEtapa("aguardando", 0, null)).toBe("Na fila")
    expect(rotuloDaEtapa("erro", 1, null)).toBe("Erro")
  })
})

describe("formatação de tempo", () => {
  it("usa H:MM:SS só quando passa da hora", () => {
    expect(fmtDuracao(2832)).toBe("47:12")
    expect(fmtDuracao(4360)).toBe("1:12:40")
    expect(fmtDuracao(72)).toBe("1:12")
    expect(fmtDuracao(null)).toBe("—")
  })

  it("duração longa é o subtítulo da biblioteca", () => {
    expect(fmtDuracaoLonga(29520)).toBe("8h 12min")
    expect(fmtDuracaoLonga(600)).toBe("10min")
    expect(fmtDuracaoLonga(7200)).toBe("2h")
    expect(fmtDuracaoLonga(null)).toBe("—")
  })
})

describe("parseTimestamp", () => {
  it("aceita as formas que aparecem no ?t=", () => {
    expect(parseTimestamp("1:36")).toBe(96)
    expect(parseTimestamp("1:12:40")).toBe(4360)
    expect(parseTimestamp("96")).toBe(96)
  })

  it("recusa lixo em vez de posicionar o player em NaN", () => {
    expect(parseTimestamp("abc")).toBeNull()
    expect(parseTimestamp("-1:00")).toBeNull()
    expect(parseTimestamp(null)).toBeNull()
    expect(parseTimestamp("")).toBeNull()
  })
})
