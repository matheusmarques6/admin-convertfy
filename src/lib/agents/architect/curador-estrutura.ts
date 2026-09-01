/**
 * conformarEstrutura — a arquitetura do email é da pessoa, não do agente.
 *
 * A aba Arquitetura é onde alguém desenha a sequência de blocos de cada
 * email. O Curador recebe essa sequência e devolve, por posição, o PAPEL
 * (o que aquele bloco faz neste email) e as variantes rankeadas. A sequência
 * em si não é assunto dele.
 *
 * Por que isto existe como código, e não só como frase no prompt: o prompt
 * do shadow dizia "Você PODE adaptar a sequência — trocar/remover/reordenar
 * seções", e a estrutura chegava numa tag chamada `<sequencia_sugerida>`.
 * Em 01/09, no Welcome 1 da Innova Bay, ele obedeceu ao que estava escrito:
 * cortou `offer` e `body`, subiu `reviews` e devolveu 4 posições onde havia
 * 6. O prompt foi reescrito — mas prompt é pedido, e pedido não é garantia.
 * Aqui é a garantia: a estrutura de ENTRADA vence, sempre, e o desvio vira
 * número em vez de sumir.
 *
 * Mesma doutrina do `aceitarReescrita` do encurtador e do `apply-patches` do
 * Integrador: o LLM devolve intenção, quem escreve é o código.
 *
 * Puro (zero I/O) — testável.
 */

/** Uma posição da arquitetura: o que a pessoa desenhou. */
export interface PosicaoDaArquitetura {
  section: string
  /** Rótulo humano da tela ("Prova Social"). Só viaja; não decide nada. */
  label?: string | null
}

/** O que o Curador devolveu por posição. `block_index` é opcional. */
export interface PapelDevolvido {
  section: string
  papel: string
  block_index?: number | null
}

export type MotivoDeDivergencia =
  /** Devolveu quantidade diferente de posições. */
  | "contagem"
  /** Na posição i veio outra seção. */
  | "secao_trocada"
  /** Não veio papel para a posição. */
  | "sem_papel"
  /** Não devolveu estrutura nenhuma (JSON sem a chave, ou vazia). */
  | "sem_estrutura"

export interface DivergenciaEstrutura {
  motivo: MotivoDeDivergencia
  /** Índice na estrutura da ARQUITETURA (a que vale). */
  posicao: number | null
  esperado: string | null
  recebido: string | null
}

export interface EstruturaConformada {
  /** A estrutura vigente — SEMPRE a da arquitetura, na ordem dela. */
  posicoes: Array<{ section: string; papel: string }>
  /** Só os papéis, alinhados por índice (`""` onde não veio). */
  papeis: string[]
  divergencias: DivergenciaEstrutura[]
  /** Nenhuma divergência de sequência (papel faltando não reprova sozinho). */
  conforme: boolean
}

/** `"Prova Social"` e `"prova_social"` são a mesma seção para comparar. */
function chave(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, "")
}

/**
 * Casa o que voltou com o que foi pedido, e devolve a estrutura da
 * arquitetura preenchida com os papéis que deram para aproveitar.
 *
 * O casamento tem três tentativas, nesta ordem, e cada papel é usado UMA
 * vez (um email pode repetir seção — products → cta → products):
 *
 * 1. `block_index` explícito, quando aponta para uma posição da mesma seção;
 * 2. mesmo índice, quando a seção bate (o caso normal, sequência obedecida);
 * 3. primeira ocorrência ainda livre daquela seção.
 *
 * Sobrou posição sem papel → `""`. Papel nunca é inventado nem herdado de
 * outra posição: um papel errado é pior que nenhum, porque ele desce até o
 * `purpose` do bloco e vira diretiva de copy.
 */
export function conformarEstrutura(
  arquitetura: ReadonlyArray<PosicaoDaArquitetura>,
  devolvido: ReadonlyArray<PapelDevolvido> | null | undefined,
): EstruturaConformada {
  const alvo = arquitetura.map((p) => ({ section: p.section, chave: chave(p.section) }))
  const papeis: string[] = new Array(alvo.length).fill("")
  const divergencias: DivergenciaEstrutura[] = []

  const lista = (devolvido ?? []).filter((d) => d && typeof d.section === "string")

  if (lista.length === 0) {
    // Sem estrutura devolvida a sequência não é violada — ela simplesmente
    // não foi respondida. Vale como divergência (o papel some), não como
    // desobediência.
    divergencias.push({
      motivo: "sem_estrutura",
      posicao: null,
      esperado: `${alvo.length} posição(ões)`,
      recebido: null,
    })
    return {
      posicoes: alvo.map((a) => ({ section: a.section, papel: "" })),
      papeis,
      divergencias,
      conforme: false,
    }
  }

  if (lista.length !== alvo.length) {
    divergencias.push({
      motivo: "contagem",
      posicao: null,
      esperado: String(alvo.length),
      recebido: String(lista.length),
    })
  }

  const usados = new Set<number>()
  const ocupada = (i: number) => papeis[i] !== "" || usados.has(i)

  for (let j = 0; j < lista.length; j++) {
    const d = lista[j]
    const k = chave(d.section)
    const papel = (d.papel ?? "").trim()

    // 1) block_index explícito e coerente com a seção.
    const bi = typeof d.block_index === "number" ? d.block_index : null
    if (bi != null && bi >= 0 && bi < alvo.length && alvo[bi].chave === k && !ocupada(bi)) {
      papeis[bi] = papel
      usados.add(bi)
      continue
    }
    // 2) mesmo índice, seção bate — a sequência foi obedecida.
    if (j < alvo.length && alvo[j].chave === k && !ocupada(j)) {
      papeis[j] = papel
      usados.add(j)
      continue
    }
    // 3) primeira ocorrência livre da mesma seção.
    const i = alvo.findIndex((a, idx) => a.chave === k && !ocupada(idx))
    if (i >= 0) {
      papeis[i] = papel
      usados.add(i)
      continue
    }
    // A seção não existe na arquitetura (ou já foi toda ocupada): o papel é
    // descartado — foi escrito para um bloco que ninguém pediu.
    divergencias.push({
      motivo: "secao_trocada",
      posicao: j < alvo.length ? j : null,
      esperado: j < alvo.length ? alvo[j].section : null,
      recebido: d.section,
    })
  }

  // Ordem trocada sem sobra/falta (hero,offer → offer,hero) não cai no ramo
  // acima, porque a regra 3 acha a seção em outro índice. Compara posição a
  // posição para registrar.
  for (let i = 0; i < alvo.length && i < lista.length; i++) {
    if (chave(lista[i].section) !== alvo[i].chave) {
      const jaRegistrada = divergencias.some(
        (x) => x.motivo === "secao_trocada" && x.posicao === i,
      )
      if (!jaRegistrada) {
        divergencias.push({
          motivo: "secao_trocada",
          posicao: i,
          esperado: alvo[i].section,
          recebido: lista[i].section,
        })
      }
    }
  }

  for (let i = 0; i < alvo.length; i++) {
    if (!papeis[i]) {
      divergencias.push({
        motivo: "sem_papel",
        posicao: i,
        esperado: alvo[i].section,
        recebido: null,
      })
    }
  }

  return {
    posicoes: alvo.map((a, i) => ({ section: a.section, papel: papeis[i] })),
    papeis,
    divergencias,
    // `sem_papel` é lacuna de conteúdo, não desobediência de sequência: o
    // bloco segue no lugar, só sem direção editorial própria.
    conforme: !divergencias.some((d) => d.motivo !== "sem_papel"),
  }
}

/** Resumo curto para `parsed_output` e para o log. `null` = obedeceu. */
export function resumoDaDivergencia(
  r: EstruturaConformada,
): { total: number; motivos: Record<string, number>; detalhe: string } | null {
  if (r.divergencias.length === 0) return null
  const motivos: Record<string, number> = {}
  for (const d of r.divergencias) motivos[d.motivo] = (motivos[d.motivo] ?? 0) + 1
  const detalhe = r.divergencias
    .map((d) => {
      const onde = d.posicao != null ? `pos ${d.posicao}` : "geral"
      if (d.motivo === "secao_trocada") {
        return `${onde}: esperava ${d.esperado}, veio ${d.recebido}`
      }
      if (d.motivo === "sem_papel") return `${onde}: ${d.esperado} sem papel`
      if (d.motivo === "contagem") {
        return `contagem: esperava ${d.esperado}, veio ${d.recebido}`
      }
      return "não devolveu estrutura"
    })
    .join(" · ")
  return { total: r.divergencias.length, motivos, detalhe }
}
