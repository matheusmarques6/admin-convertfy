/**
 * Pontuação, faixas, textos do sistema e acesso — o que a aba Configurar
 * escreve em `settings` e o que o submit e o renderer LEEM de lá.
 *
 * Tudo puro, e o motivo é o de sempre nesta parte do código: a chave
 * existia no schema desde o PR (a) e nenhum consumidor a lia. Configurar
 * "faixas de pontuação" numa tela que nada consome é o campo fantasma
 * que a espinha do editor existe para impedir — aqui a régua é uma só
 * e os dois lados (admin e público) a importam.
 */

import type { FaixaDePontuacao, FormAnswers, FormSchema, PoliticaDeDuplicado } from "@/types/forms-conversational"

// ─────────────────────────── pontuação ────────────────────────────────

export interface ResultadoDaPontuacao {
  total: number
  /** Quantas perguntas pontuam (têm `pontos`). */
  perguntasQuePontuam: number
  /** O maior total possível — o teto que a UI mostra ao lado das faixas. */
  maximo: number
  /** Quantas das que pontuam foram respondidas com uma opção pontuada. */
  respondidas: number
}

/**
 * Soma `pontos[resposta]` das perguntas respondidas.
 *
 * Múltipla escolha soma cada opção marcada. Resposta que não está na
 * tabela vale 0 — "Outro" digitado, opção renomeada — e não erro: a
 * pessoa respondeu, o cadastro é que não previu.
 */
export function pontuar(schema: FormSchema, answers: FormAnswers): ResultadoDaPontuacao {
  let total = 0
  let perguntasQuePontuam = 0
  let respondidas = 0
  let maximo = 0
  for (const b of schema.blocks ?? []) {
    if (!b.pontos || Object.keys(b.pontos).length === 0) continue
    perguntasQuePontuam += 1
    const valores = Object.values(b.pontos)
    maximo += b.type === "multi_select"
      ? valores.filter((v) => v > 0).reduce((s, v) => s + v, 0)
      : Math.max(0, ...valores)
    const r = answers[b.ref]
    if (r === undefined || r === null || r === "") continue
    const chaves = Array.isArray(r) ? r.map(String) : [String(r)]
    let pontuou = false
    for (const k of chaves) {
      const p = b.pontos[k]
      if (typeof p === "number" && Number.isFinite(p)) {
        total += p
        pontuou = true
      }
    }
    if (pontuou) respondidas += 1
  }
  return { total, perguntasQuePontuam, maximo, respondidas }
}

/** A faixa que contém o total — a PRIMEIRA que casa, na ordem cadastrada. */
export function faixaDaPontuacao(
  faixas: readonly FaixaDePontuacao[] | undefined,
  total: number,
): FaixaDePontuacao | null {
  for (const f of faixas ?? []) {
    if (total >= f.de && total <= f.ate) return f
  }
  return null
}

/**
 * Lacunas e sobreposições entre faixas — o aviso da UI.
 *
 * Sobreposição não é erro fatal (a primeira vence), mas é o que faz
 * "de 0 a 10" e "de 5 a 20" mandarem o 7 para a etapa que ninguém
 * esperava. Lacuna ("de 0 a 5" e "de 8 a 10") deixa o 6 sem etapa: cai
 * na etapa padrão do formulário, que é o comportamento de quem não
 * configurou faixa nenhuma.
 */
export function avaliarFaixas(faixas: readonly FaixaDePontuacao[]): string[] {
  const avisos: string[] = []
  const ordenadas = [...faixas].sort((a, b) => a.de - b.de)
  for (let i = 1; i < ordenadas.length; i++) {
    const ant = ordenadas[i - 1]
    const cur = ordenadas[i]
    if (cur.de <= ant.ate) avisos.push(`As faixas ${ant.de}–${ant.ate} e ${cur.de}–${cur.ate} se sobrepõem — a primeira cadastrada vence.`)
    else if (cur.de > ant.ate + 1) avisos.push(`Entre ${ant.ate + 1} e ${cur.de - 1} pontos nenhuma faixa vale — cai na etapa padrão.`)
  }
  for (const f of faixas) {
    if (!f.stage_id && !f.tag) avisos.push(`A faixa ${f.de}–${f.ate} não muda etapa nem etiqueta — não faz nada.`)
  }
  return avisos
}

// ─────────────────────────── textos do sistema ────────────────────────

export const TEXTOS_PADRAO = {
  obrigatorio: "Preencha para continuar.",
  escolha_obrigatoria: "Escolha uma opção para continuar.",
  email_invalido: "Confira o email — parece faltar algo.",
  telefone_invalido: "Confira o telefone — o número parece incompleto.",
  rotulo_avancar: "OK",
  dica_teclado: "pressione Enter",
  fechado: "Este formulário não está recebendo respostas no momento.",
} as const

export type ChaveDeTexto = keyof typeof TEXTOS_PADRAO
export type TextosDoSistema = Record<ChaveDeTexto, string>

/** Os textos com os padrões preenchidos — e sem chave vazia sobrescrevendo o padrão. */
export function textosDoSistema(settings: FormSchema["settings"] | undefined | null): TextosDoSistema {
  const out: TextosDoSistema = { ...TEXTOS_PADRAO }
  const t = settings?.textos ?? {}
  for (const k of Object.keys(TEXTOS_PADRAO) as ChaveDeTexto[]) {
    const v = t[k]
    if (typeof v === "string" && v.trim()) out[k] = v.trim()
  }
  // `rotulo_avancar` já existia solto em `settings` antes de `textos`;
  // o campo antigo vence quando os dois existem, porque é o que está no ar.
  if (typeof settings?.rotulo_avancar === "string" && settings.rotulo_avancar.trim()) {
    out.rotulo_avancar = settings.rotulo_avancar.trim()
  }
  return out
}

// ─────────────────────────── acesso ───────────────────────────────────

export type MotivoDeFechamento = "fechado" | "limite"

/**
 * O formulário aceita resposta agora?
 *
 * `submissionsCount` é o contador da coluna (trigger do banco). `null` =
 * não se sabe, e aí o limite NÃO fecha: recusar por um contador que não
 * foi lido é perder lead por falha de leitura.
 */
export function acessoAoFormulario(
  settings: FormSchema["settings"] | undefined | null,
  submissionsCount: number | null,
): { aberto: true } | { aberto: false; motivo: MotivoDeFechamento; mensagem: string } {
  const mensagem = (settings?.mensagem_fechado ?? "").trim() || textosDoSistema(settings).fechado
  if (settings?.fechado) return { aberto: false, motivo: "fechado", mensagem }
  const limite = settings?.limite_envios
  if (typeof limite === "number" && limite > 0 && submissionsCount !== null && submissionsCount >= limite) {
    return { aberto: false, motivo: "limite", mensagem }
  }
  return { aberto: true }
}

export function politicaDeDuplicado(settings: FormSchema["settings"] | undefined | null): PoliticaDeDuplicado {
  return settings?.duplicado ?? "atualiza"
}
