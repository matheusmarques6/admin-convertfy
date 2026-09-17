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
 * **Pergunta inalcançável.** Não existe: a engine cai em
 * `proximoNaOrdem` quando nenhuma regra casa, então o bloco `i` sempre
 * tem o bloco `i-1` como antecessor possível. Medir alcance aqui
 * devolveria sempre "tudo alcançável" — número que não separa nada é
 * pior que número nenhum.
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

const PREFIXO_ENDING = "ending:"

/** Operadores em que o valor tem de existir entre as opções da pergunta. */
const OPERADORES_DE_IGUALDADE: ReadonlySet<string> = new Set([
  "equals",
  "not_equals",
  "in",
  "not_in",
])

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

export interface ProblemaDoFluxo {
  tipo: TipoDeProblema
  gravidade: "erro" | "aviso"
  /** Onde o problema mora: `ref` do bloco, ou do final em `final_orfao`. */
  ref: string | null
  /** Índice da regra dentro do bloco, que é como a tela a endereça. */
  regra?: number
  mensagem: string
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

  const emLaco = new Set(lacosDeTela(blocks))

  blocks.forEach((bloco, i) => {
    if (emLaco.has(bloco.ref)) {
      out.push({
        tipo: "laco_de_tela",
        gravidade: "erro",
        ref: bloco.ref,
        mensagem: `"${rotulo(bloco, i)}" avança sozinha e volta para si mesma — quem chegar aqui trava numa tela.`,
      })
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

        const pos = posicao.get(cond.ref) ?? 0
        if (pos > i) {
          out.push({
            tipo: "condicao_de_pergunta_posterior",
            gravidade: "aviso",
            ref: bloco.ref,
            regra: indice,
            mensagem: `A regra ${indice + 1} de "${rotulo(bloco, i)}" testa "${rotulo(alvo, pos)}", que só aparece depois — no caminho normal ela ainda estará sem resposta.`,
          })
        }
      })
    })
  })

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
