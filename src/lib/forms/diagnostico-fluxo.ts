/**
 * O fluxo tem buraco? — a régua estática dos saltos.
 *
 * O construtor de fluxo deixa alguém montar, com dois cliques, uma regra
 * que **nunca casa** ou que aponta para uma pergunta apagada. Nenhum dos
 * dois falha: o visitante simplesmente segue para a próxima pergunta na
 * ordem, como se a regra não existisse, e quem montou continua achando
 * que ela vale. É a mesma família do defeito que este produto já pagou
 * duas vezes — a condição do lead qualificado comparando texto que
 * nenhuma opção oferece, e o `LeadQualificado` que nunca saía.
 *
 * Por isso a régua roda **antes de publicar e sem depender de tráfego**.
 * O diagnóstico por cadastros recentes só responde depois que alguém
 * respondeu, e só enquanto houver cadastro na janela.
 *
 * ── O que NÃO é medido, e por quê ────────────────────────────────────
 *
 * **Laço entre telas por destino padrão.** Duas telas apontando uma
 * para a outra não travam: a pessoa responde e segue. O laço que trava
 * é o encadeamento entre telas sem resposta, abaixo.
 *
 * **Laço entre perguntas.** Saltar para trás não trava: a pessoa
 * responde de novo e segue. Vira AVISO, não erro. O laço que trava é o
 * encadeamento entre telas sem resposta (`statement`), que a engine
 * percorre sozinha — esse é erro.
 *
 * Puro: sem I/O, sem React. A tela e a rota chamam o mesmo módulo, senão
 * o editor aprovaria o que a publicação reprova.
 */

import type { FormBlock, FormSchema, LogicCondition, LogicRule } from "@/types/forms-conversational"
import { TIPOS_DE_ESCOLHA, TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import { normalizeForCompare } from "@/lib/tracking/normalizar-comparacao"
import { blocoDoRecall, refsCitados } from "./recall"
import { derivadosDoSchema, origemDoDerivado, type RefDerivado } from "./derivados"

const PREFIXO_ENDING = "ending:"

/** Operadores em que o valor tem de existir entre as opções da pergunta. */
const OPERADORES_DE_IGUALDADE: ReadonlySet<string> = new Set([
  "equals",
  "not_equals",
  "in",
  "not_in",
])

/** Operadores de comparação aritmética — os únicos que o piso aceita. */
const OPERADORES_NUMERICOS: ReadonlySet<string> = new Set(["gt", "gte", "lt", "lte"])

/** Operadores que não fazem sentido sem um valor ao lado. */
const OPERADORES_QUE_EXIGEM_VALOR: ReadonlySet<string> = new Set([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
])

export type TipoDeProblema =
  | "destino_inexistente"
  | "regra_sem_condicao"
  | "condicao_sem_valor"
  | "condicao_sem_pergunta"
  | "valor_fora_das_opcoes"
  | "laco_de_tela"
  | "condicao_de_pergunta_posterior"
  | "salto_para_tras"
  | "final_orfao"
  | "sem_final"
  | "recall_da_mesma_tela"
  | "derivado_sem_origem"
  | "operador_incompativel"
  | "tela_inalcancavel"
  | "laco_de_destino_padrao"

export interface ProblemaDoFluxo {
  tipo: TipoDeProblema
  gravidade: "erro" | "aviso"
  /** Onde o problema mora: `ref` do bloco, ou do final em `final_orfao`. */
  ref: string | null
  /** Índice da regra dentro do bloco, que é como a tela a endereça. */
  regra?: number
  mensagem: string
}

/**
 * Os blocos que dividem a tela com `ref`.
 *
 * Roda sobre os VISÍVEIS, como a engine: um campo oculto no meio do
 * grupo não é parte da tela — o valor dele vem da URL e está disponível
 * desde o primeiro instante, então citá-lo num `{{}}` funciona.
 *
 * Reimplementa `blocosDaTela` de propósito: aqui o schema pode estar
 * pela metade (é o rascunho do editor). A régua é a mesma — anda para
 * trás enquanto `mesma_tela`, para frente idem.
 */
function telaDoBloco(visiveis: FormBlock[], ref: string): FormBlock[] {
  let ini = visiveis.findIndex((b) => b.ref === ref)
  if (ini < 0) return []
  while (ini > 0 && visiveis[ini].mesma_tela) ini -= 1
  const out: FormBlock[] = [visiveis[ini]]
  for (let j = ini + 1; j < visiveis.length && visiveis[j].mesma_tela; j++) out.push(visiveis[j])
  return out
}

/**
 * O número da TELA de cada bloco visível.
 *
 * Quem decide se uma condição testa resposta que ainda não existe é a
 * tela, não a posição da pergunta: com quatro campos juntos, a regra
 * escrita na cabeça pode testar o quarto sem problema nenhum — os quatro
 * são respondidos antes do mesmo clique em avançar. Comparar posições
 * de bloco acusaria "só aparece depois" sobre o caso mais comum de
 * agrupar.
 *
 * Bloco oculto fica FORA (indefinido): o valor dele vem da URL e está
 * disponível desde o primeiro instante, então citá-lo nunca é adiantado.
 */
function telaPorRef(visiveis: FormBlock[]): Map<string, number> {
  const out = new Map<string, number>()
  let tela = 0
  visiveis.forEach((b, i) => {
    if (i > 0 && !b.mesma_tela) tela += 1
    out.set(b.ref, tela)
  })
  return out
}

function rotulo(b: FormBlock | undefined, i?: number): string {
  if (!b) return "pergunta removida"
  const texto = (b.label ?? "").trim()
  if (texto) return texto.length > 48 ? `${texto.slice(0, 47)}…` : texto
  return i === undefined ? "pergunta sem título" : `pergunta ${i + 1} (sem título)`
}

function valoresDaCondicao(c: LogicCondition): string[] {
  const v = c.value
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((x) => x.trim() !== "")
  if (v === null || v === undefined) return []
  const s = String(v)
  return s.trim() === "" ? [] : [s]
}

/**
 * As opções da pergunta, quando ela tem lista fechada. `null` = lista
 * aberta (texto, número, data), onde cobrar correspondência reprovaria
 * toda regra legítima.
 */
export function opcoesDaPergunta(b: FormBlock | undefined): string[] | null {
  if (!b || !TIPOS_DE_ESCOLHA.has(b.type)) return null
  const opts = (b.options ?? []).map((o) => o.value || o.label).filter((s) => s.trim() !== "")
  return opts.length > 0 ? opts : null
}

/** O destino de uma regra, já classificado. */
export function destinoDaRegra(
  r: LogicRule,
): { tipo: "bloco"; ref: string } | { tipo: "fim"; ending: string | null } {
  if (r.goto.startsWith(PREFIXO_ENDING)) {
    const ref = r.goto.slice(PREFIXO_ENDING.length)
    return { tipo: "fim", ending: ref || null }
  }
  return { tipo: "bloco", ref: r.goto }
}

/**
 * Percorre o encadeamento entre telas sem resposta procurando ciclo.
 *
 * Só `statement` com lógica encadeia sozinho (é o que `proximoPasso`
 * faz). Um ciclo ali é a tela congelada que o visitante encontra — a
 * engine corta em `LIMITE_DE_SALTOS` e devolve `laco`, mas quem montou
 * não tem como saber antes de alguém tropeçar.
 */
function lacosDeTela(blocks: FormBlock[]): string[] {
  const porRef = new Map(blocks.map((b) => [b.ref, b]))
  const encadeia = (b: FormBlock) => TIPOS_SEM_RESPOSTA.has(b.type) && (b.logic ?? []).length > 0
  const emLaco = new Set<string>()

  for (const inicio of blocks) {
    if (!encadeia(inicio)) continue
    const visto = new Set<string>([inicio.ref])
    let atual: FormBlock | undefined = inicio
    while (atual && encadeia(atual)) {
      // Qualquer saída possível conta: basta UM caminho cíclico para a
      // tela poder congelar, e estaticamente não se sabe qual casa.
      const proximos: Array<{ tipo: "bloco"; ref: string }> = (atual.logic ?? [])
        .map(destinoDaRegra)
        .filter((d): d is { tipo: "bloco"; ref: string } => d.tipo === "bloco")
      const volta = proximos.find((d) => visto.has(d.ref))
      if (volta) {
        emLaco.add(inicio.ref)
        break
      }
      const seguinte: FormBlock | undefined = proximos
        .map((d) => porRef.get(d.ref))
        .find((b): b is FormBlock => b !== undefined && encadeia(b))
      if (!seguinte) break
      visto.add(seguinte.ref)
      atual = seguinte
    }
  }
  return [...emLaco]
}

/**
 * Tudo que está errado no fluxo, na ordem em que a tela mostra: erros
 * primeiro, depois avisos, e dentro de cada um a ordem das perguntas.
 */
export function diagnosticarFluxo(schema: FormSchema): ProblemaDoFluxo[] {
  const blocks = schema.blocks ?? []
  const endings = schema.endings ?? []
  const porRef = new Map(blocks.map((b) => [b.ref, b]))
  const posicao = new Map(blocks.map((b, i) => [b.ref, i]))
  const refsEndings = new Set(endings.map((e) => e.ref))
  const out: ProblemaDoFluxo[] = []

  const visiveis = blocks.filter((b) => !b.hidden)
  const emLaco = new Set(lacosDeTela(blocks))
  const daTela = telaPorRef(visiveis)
  const derivados = new Map<string, RefDerivado>(derivadosDoSchema(schema).map((d) => [d.ref, d]))

  /**
   * "Essa resposta ainda não existe aqui" — medido por TELA.
   *
   * Vale para a condição direta e para o derivado (que é calculado a
   * partir da resposta de uma pergunta, e portanto chega quando ela
   * chega). Oculto não entra: o valor vem da URL desde o primeiro
   * instante.
   */
  function avisarSePosterior(bloco: FormBlock, i: number, indice: number, refTestado: string) {
    const telaDoTeste = daTela.get(refTestado)
    const telaDaRegra = daTela.get(bloco.ref)
    if (telaDoTeste === undefined || telaDaRegra === undefined) return
    if (telaDoTeste <= telaDaRegra) return
    const alvo = porRef.get(refTestado)
    out.push({
      tipo: "condicao_de_pergunta_posterior",
      gravidade: "aviso",
      ref: bloco.ref,
      regra: indice,
      mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" testa "${rotulo(alvo, posicao.get(refTestado))}", que só aparece depois — no caminho normal ela ainda estará sem resposta.`,
    })
  }

  blocks.forEach((bloco, i) => {
    if (emLaco.has(bloco.ref)) {
      out.push({
        tipo: "laco_de_tela",
        gravidade: "erro",
        ref: bloco.ref,
        mensagem: `"${rotulo(bloco, i)}" avança sozinha e volta para si mesma — quem chegar aqui trava numa tela.`,
      })
    }

    // Recall de uma resposta que está sendo digitada NESTE momento.
    //
    // `{{nome}}` só tem valor depois que a pessoa responde e avança. Com
    // as duas perguntas na mesma tela, o texto sai VAZIO — "Prazer, .
    // Para onde mando?" — e nada acusa: o recall devolve o fallback
    // declarado, que quase nunca existe. É o preço de agrupar, e quem
    // agrupa precisa vê-lo no momento em que agrupa.
    if (bloco.mesma_tela || blocks[i + 1]?.mesma_tela) {
      const daTela = new Set(telaDoBloco(visiveis, bloco.ref).map((b) => b.ref))
      const citados = [
        ...refsCitados(bloco.label),
        ...refsCitados(bloco.description),
        ...refsCitados(bloco.titulo_da_tela),
      ]
      const jaAvisado = new Set<string>()
      for (const chave of citados) {
        const alvo = blocoDoRecall(chave, blocks)
        if (!alvo || !daTela.has(alvo.ref) || jaAvisado.has(alvo.ref)) continue
        jaAvisado.add(alvo.ref)
        out.push({
          tipo: "recall_da_mesma_tela",
          gravidade: "erro",
          ref: bloco.ref,
          mensagem: `"${rotulo(bloco, i)}" usa {{${chave}}}, que é respondida na MESMA tela — o texto sai vazio. Separe as duas telas ou tire o {{${chave}}}.`,
        })
      }
    }

    // O destino padrão cai pela mesma régua do `goto` de uma regra: quem
    // aponta para pergunta apagada deixa a pessoa numa tela morta, e a
    // publicação o descarta — sem aviso aqui, o operador só descobre
    // quando o fluxo volta à ordem sozinho.
    if (bloco.proximo) {
      const perdido = bloco.proximo.startsWith(PREFIXO_ENDING)
        ? Boolean(bloco.proximo.slice(PREFIXO_ENDING.length)) &&
          !refsEndings.has(bloco.proximo.slice(PREFIXO_ENDING.length))
        : !porRef.has(bloco.proximo)
      if (perdido) {
        out.push({
          tipo: "destino_inexistente",
          gravidade: "erro",
          ref: bloco.ref,
          mensagem: `"${rotulo(bloco, i)}" está configurada para seguir até algo que não existe mais. Ao publicar, o fluxo volta à ordem normal.`,
        })
      }
    }

    ;(bloco.logic ?? []).forEach((regra, indice) => {
      const destino = destinoDaRegra(regra)
      if (destino.tipo === "bloco" && !porRef.has(destino.ref)) {
        out.push({
          tipo: "destino_inexistente",
          gravidade: "erro",
          ref: bloco.ref,
          regra: indice,
          mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" aponta para uma pergunta que não existe mais. Ao publicar ela é descartada e quem chegar aqui segue para a próxima.`,
        })
      }
      if (destino.tipo === "fim" && destino.ending && !refsEndings.has(destino.ending)) {
        out.push({
          tipo: "destino_inexistente",
          gravidade: "erro",
          ref: bloco.ref,
          regra: indice,
          mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" aponta para um final que não existe mais.`,
        })
      }
      if (destino.tipo === "bloco" && porRef.has(destino.ref)) {
        const alvo = posicao.get(destino.ref) ?? 0
        if (alvo <= i) {
          out.push({
            tipo: "salto_para_tras",
            gravidade: "aviso",
            ref: bloco.ref,
            regra: indice,
            mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" volta para "${rotulo(porRef.get(destino.ref), alvo)}". Quem cair nela responde de novo — confira se é isso mesmo.`,
          })
        }
      }

      const conds = regra.conditions ?? []
      if (conds.length === 0) {
        out.push({
          tipo: "regra_sem_condicao",
          gravidade: "erro",
          ref: bloco.ref,
          regra: indice,
          mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" não tem condição nenhuma — ela nunca vai casar.`,
        })
      }

      conds.forEach((cond) => {
        // Endereço DERIVADO — o piso em real da faixa de faturamento.
        // Ele não é uma pergunta e nunca vai estar em `porRef`; sem esta
        // volta, a condição que sustenta o corte do funil sai como
        // "pergunta que não existe mais", o select do construtor fica sem
        // nada marcado, e quem for consertar o erro falso desliga o
        // corte. Só a origem apagada é erro de verdade.
        const derivado = derivados.get(cond.ref)
        if (derivado || origemDoDerivado(cond.ref)) {
          const origem = derivado?.origem ?? origemDoDerivado(cond.ref) ?? ""
          if (!derivado) {
            out.push({
              tipo: "derivado_sem_origem",
              gravidade: "erro",
              ref: bloco.ref,
              regra: indice,
              mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" compara o valor calculado de uma pergunta que não existe mais (ou que deixou de ter faixas por moeda) — ela nunca vai casar.`,
            })
            return
          }
          if (!OPERADORES_NUMERICOS.has(cond.operator)) {
            out.push({
              tipo: "operador_incompativel",
              gravidade: "erro",
              ref: bloco.ref,
              regra: indice,
              mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" usa "${derivado.label}", que é um número, com um operador de texto. Use maior/menor que.`,
            })
            return
          }
          if (valoresDaCondicao(cond).length === 0) {
            out.push({
              tipo: "condicao_sem_valor",
              gravidade: "erro",
              ref: bloco.ref,
              regra: indice,
              mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" compara "${derivado.label}" com um valor em branco — ela nunca vai casar.`,
            })
            return
          }
          avisarSePosterior(bloco, i, indice, origem)
          return
        }

        const alvo = porRef.get(cond.ref)
        if (!alvo) {
          out.push({
            tipo: "condicao_sem_pergunta",
            gravidade: "erro",
            ref: bloco.ref,
            regra: indice,
            mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" testa a resposta de uma pergunta que não existe mais — ela nunca vai casar.`,
          })
          return
        }

        const valores = valoresDaCondicao(cond)
        if (OPERADORES_QUE_EXIGEM_VALOR.has(cond.operator) && valores.length === 0) {
          out.push({
            tipo: "condicao_sem_valor",
            gravidade: "erro",
            ref: bloco.ref,
            regra: indice,
            mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" compara "${rotulo(alvo)}" com um valor em branco — ela nunca vai casar.`,
          })
          return
        }

        const opcoes = opcoesDaPergunta(alvo)
        if (opcoes && OPERADORES_DE_IGUALDADE.has(cond.operator)) {
          // A comparação é a MESMA do envio. Byte a byte acusaria
          // divergência onde a engine casa, e mandaria consertar o que
          // está funcionando.
          const conhecidos = new Set(opcoes.map((o) => normalizeForCompare(o)))
          for (const v of valores) {
            if (!conhecidos.has(normalizeForCompare(v))) {
              out.push({
                tipo: "valor_fora_das_opcoes",
                gravidade: "erro",
                ref: bloco.ref,
                regra: indice,
                mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" espera "${v}", que não é nenhuma das respostas possíveis de "${rotulo(alvo)}" — ninguém consegue casar essa condição.`,
              })
            }
          }
        }

        avisarSePosterior(bloco, i, indice, cond.ref)
      })
    })
  })

  /*
   * Tela que ninguém alcança.
   *
   * Isto NÃO era mensurável enquanto o caminho padrão fosse a ordem
   * crua: a tela `i` sempre tinha a `i-1` como antecessora, e a régua
   * devolveria "tudo alcançável" — número que não separa nada é pior que
   * número nenhum. Com o destino padrão configurável, uma tela pode ser
   * pulada por quem vem antes e não ser alvo de nenhum desvio: as
   * perguntas dela deixam de existir para o visitante, e nada falha.
   *
   * A régua é auto-limitada: sem nenhum `proximo` declarado, toda tela
   * continua sendo o destino natural da anterior e nada dispara.
   */
  const cabecas = visiveis.filter((b, i) => i === 0 || !b.mesma_tela)
  if (cabecas.length > 1) {
    const cabecaDe = (ref: string): string | null => {
      let k = visiveis.findIndex((b) => b.ref === ref)
      if (k < 0) return null
      while (k > 0 && visiveis[k].mesma_tela) k -= 1
      return visiveis[k].ref
    }
    const alcancadas = new Set<string>([cabecas[0].ref])
    cabecas.forEach((cabeca, k) => {
      const tela = telaDoBloco(visiveis, cabeca.ref)
      const declarado = tela.find((b) => typeof b.proximo === "string" && b.proximo)?.proximo
      const padrao = declarado ?? cabecas[k + 1]?.ref
      if (padrao && !padrao.startsWith(PREFIXO_ENDING)) {
        const alvo = cabecaDe(padrao)
        if (alvo) alcancadas.add(alvo)
      }
      for (const b of tela) {
        for (const r of b.logic ?? []) {
          const d = destinoDaRegra(r)
          if (d.tipo !== "bloco") continue
          const alvo = cabecaDe(d.ref)
          if (alvo) alcancadas.add(alvo)
        }
      }
    })
    /*
     * Laço no caminho PADRÃO — a tela que nunca termina.
     *
     * Isto também não existia antes: o caminho padrão era a ordem, e
     * ordem não faz ciclo. Com o destino configurável, dá para montar em
     * dois cliques uma tela que aponta para si mesma (responde, avança,
     * mesma tela, para sempre) ou um par que fica trocando de lugar.
     *
     * Regra com destino FORA do ciclo pode quebrá-lo, mas ninguém sabe
     * estaticamente se ela casa — então ali é AVISO. Sem nenhuma saída, é
     * erro: não existe resposta que solte o visitante.
     */
    const padraoDaTela = new Map<string, string | null>()
    cabecas.forEach((cabeca, k) => {
      const tela = telaDoBloco(visiveis, cabeca.ref)
      const declarado = tela.find((b) => typeof b.proximo === "string" && b.proximo)?.proximo
      const bruto = declarado ?? cabecas[k + 1]?.ref
      padraoDaTela.set(
        cabeca.ref,
        bruto && !bruto.startsWith(PREFIXO_ENDING) ? cabecaDe(bruto) : null,
      )
    })
    const jaAcusadas = new Set<string>()
    for (const inicio of cabecas) {
      if (jaAcusadas.has(inicio.ref)) continue
      const caminho: string[] = []
      let atual: string | null = inicio.ref
      while (atual && !caminho.includes(atual)) {
        caminho.push(atual)
        atual = padraoDaTela.get(atual) ?? null
      }
      if (!atual) continue
      const ciclo = caminho.slice(caminho.indexOf(atual))
      if (ciclo.some((r) => jaAcusadas.has(r))) continue
      ciclo.forEach((r) => jaAcusadas.add(r))
      const noCiclo = new Set(ciclo)
      const temSaida = ciclo.some((r) =>
        telaDoBloco(visiveis, r).some((b) =>
          (b.logic ?? []).some((regra) => {
            const d = destinoDaRegra(regra)
            if (d.tipo === "fim") return true
            const alvo = cabecaDe(d.ref)
            return Boolean(alvo) && !noCiclo.has(alvo as string)
          }),
        ),
      )
      const cabeca = visiveis.find((b) => b.ref === ciclo[0])
      const numero = cabecas.findIndex((c) => c.ref === ciclo[0]) + 1
      out.push({
        tipo: "laco_de_destino_padrao",
        gravidade: temSaida ? "aviso" : "erro",
        ref: ciclo[0],
        mensagem:
          ciclo.length === 1
            ? `A tela ${numero} ("${rotulo(cabeca, posicao.get(ciclo[0]))}") está configurada para seguir para ela mesma${temSaida ? " — só sai dela quem cair num desvio." : ": quem chegar aqui responde e volta para a mesma tela, sem fim."}`
            : `As telas ${ciclo.map((r) => cabecas.findIndex((c) => c.ref === r) + 1).join(", ")} apontam em círculo pelo caminho padrão${temSaida ? " — só sai delas quem cair num desvio." : ": quem entrar no círculo não chega ao fim do formulário."}`,
      })
    }

    cabecas.forEach((cabeca, k) => {
      if (alcancadas.has(cabeca.ref)) return
      const quantas = telaDoBloco(visiveis, cabeca.ref).length
      out.push({
        tipo: "tela_inalcancavel",
        gravidade: "erro",
        ref: cabeca.ref,
        mensagem:
          quantas > 1
            ? `Ninguém chega na tela ${k + 1} ("${rotulo(cabeca, posicao.get(cabeca.ref))}"): nenhuma tela leva até ela. As ${quantas} perguntas dela não vão ser respondidas por ninguém.`
            : `Ninguém chega em "${rotulo(cabeca, posicao.get(cabeca.ref))}": nenhuma tela leva até ela, então essa pergunta não vai ser respondida por ninguém.`,
      })
    })
  }

  // Finais: o primeiro é o desfecho de quem chega ao fim da ordem, então
  // ele nunca é órfão mesmo sem nenhuma regra apontando para ele.
  const alcancados = new Set<string>()
  for (const b of blocks) {
    for (const r of b.logic ?? []) {
      const d = destinoDaRegra(r)
      if (d.tipo === "fim" && d.ending) alcancados.add(d.ending)
    }
  }
  endings.slice(1).forEach((e) => {
    if (!alcancados.has(e.ref)) {
      out.push({
        tipo: "final_orfao",
        gravidade: "aviso",
        ref: e.ref,
        mensagem: `O final "${e.title || e.ref}" não é alcançado por nenhuma regra — ninguém vai vê-lo.`,
      })
    }
  })

  if (schema.display_mode === "conversational" && endings.length === 0 && blocks.length > 0) {
    out.push({
      tipo: "sem_final",
      gravidade: "aviso",
      ref: null,
      mensagem:
        "Não há tela final. Quem terminar vê a mensagem de sucesso padrão — dá para escrever uma tela própria.",
    })
  }

  const peso = (p: ProblemaDoFluxo) => (p.gravidade === "erro" ? 0 : 1)
  return out
    .map((p, i) => ({ p, i, ordem: p.ref ? (posicao.get(p.ref) ?? 999) : 999 }))
    .sort((a, b) => peso(a.p) - peso(b.p) || a.ordem - b.ordem || a.i - b.i)
    .map((x) => x.p)
}

/** Quantos erros e avisos — o que o selo da aba mostra. */
export function contarProblemas(lista: readonly ProblemaDoFluxo[]): {
  erros: number
  avisos: number
} {
  return {
    erros: lista.filter((p) => p.gravidade === "erro").length,
    avisos: lista.filter((p) => p.gravidade === "aviso").length,
  }
}
