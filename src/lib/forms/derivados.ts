/**
 * O que o servidor calcula a partir da resposta, e que vale mais que ela.
 *
 * A pergunta de faturamento devolve um TEXTO — "US$50k – US$100k" — e é
 * assim que ela deve ficar no CRM, porque é o que a pessoa disse. Mas
 * qualificar por texto é o defeito que este repositório já pagou com um
 * mês de `LeadQualificado` sem sair: basta alguém renomear uma opção no
 * editor para a condição apontar para uma frase que ninguém mais
 * responde, sem erro em lugar nenhum.
 *
 * Então, ao lado da resposta, o submit grava o **piso em real** daquela
 * faixa, num endereço derivado e estável. A régua de negócio passa a ser
 * aritmética (`piso >= 200000`) e vale igual para real, dólar e euro —
 * uma condição em vez de vinte rótulos.
 *
 * O derivado é do SERVIDOR. Ele não vem do corpo do POST: o browser
 * manda a escolha, a conversão é nossa. Aceitar o piso do cliente seria
 * deixá-lo dizer se é qualificado.
 */

import type { FormSchema } from "@/types/forms-conversational"
import {
  opcoesDeFaturamento,
  moedaDaRegiao,
  pisoDaResposta,
  todasAsOpcoesDeFaturamento,
} from "./moeda"

/**
 * Sufixo do endereço derivado.
 *
 * Dois sublinhados porque o `ref` real é um uuid do `crm_form_fields` e
 * nunca contém isso — a colisão com um campo de verdade é impossível por
 * construção, e não por convenção que alguém precise lembrar.
 */
export const SUFIXO_PISO = "__piso_brl"

export function refDoPiso(ref: string): string {
  return `${ref}${SUFIXO_PISO}`
}

export interface Derivados {
  /** Respostas extras, para juntar às do formulário na avaliação. */
  answers: Record<string, number>
  /** Campos extras, para o diagnóstico ter um rótulo legível. */
  fields: Array<{ id: string; label: string }>
  /** Chave → valor para gravar em `deals.custom_fields`. */
  custom_deal: Record<string, number>
}

const VAZIO: Derivados = { answers: {}, fields: [], custom_deal: {} }

/**
 * Calcula os derivados de um envio.
 *
 * Resposta que não corresponde a nenhuma faixa conhecida **não gera
 * piso** — nem zero. Zero desqualificaria o lead por causa de um rótulo
 * que mudou, que é a falha oposta e mais cara; sem a chave, a condição
 * `gte` simplesmente não casa e o diagnóstico da tela mostra a lacuna,
 * que é onde alguém conserta.
 */
export function camposDerivados(
  schema: FormSchema | null | undefined,
  answers: Record<string, unknown>,
): Derivados {
  if (!schema || schema.blocks.length === 0) return VAZIO
  const out: Derivados = { answers: {}, fields: [], custom_deal: {} }

  for (const b of schema.blocks) {
    if (!b.opcoes_por_moeda) continue
    const resposta = answers[b.ref]
    if (typeof resposta !== "string" || !resposta) continue

    // A lista da moeda respondida primeiro: ela é a que a pessoa viu, e
    // restringir a busca evita casar com o rótulo de outra moeda num
    // formulário cujas escadas alguém tenha deixado iguais.
    const moeda = b.moeda_de ? moedaDaRegiao(answers[b.moeda_de]) : null
    const lista = moeda ? opcoesDeFaturamento(moeda) : undefined
    const piso = pisoDaResposta(resposta, lista) ?? pisoDaResposta(resposta)
    if (piso === null) continue

    out.answers[refDoPiso(b.ref)] = piso
    out.fields.push({
      id: refDoPiso(b.ref),
      label: `${b.label || "Faturamento"} — equivalente em R$`,
    })

    // Só grava no deal quando o campo já tem destino: inventar chave em
    // `custom_fields` criaria coluna fantasma que ninguém lê.
    const destino = b.map_to_lead_field ?? ""
    if (destino.startsWith("custom_deal:")) {
      const key = destino.slice("custom_deal:".length)
      if (key) out.custom_deal[`${key}_piso_brl`] = piso
    }
  }

  return out
}

/* ------------------------------------------------------------------ *
 * O lado da AUDITORIA
 * ------------------------------------------------------------------ */

/**
 * A auditoria responde "quais respostas disparam o evento" antes de
 * subir verba. Com a régua movida para o piso, ela precisa saber duas
 * coisas que o schema sozinho não conta:
 *
 * 1. **Todas as opções que a pergunta pode mostrar.** O bloco guarda a
 *    escada declarada (real); quem responde da Europa vê a de euro. A
 *    auditoria que olhasse só as declaradas diria "ninguém pode
 *    responder US$50k – US$100k" sobre a faixa que o lead americano vê
 *    na tela.
 * 2. **O valor derivado de cada opção.** Sem isso, a condição
 *    `piso >= 200000` aponta para um campo que a lista não tem e sai
 *    como `campo_ausente` — um alarme falso sobre o mecanismo que está
 *    funcionando, que é a forma mais rápida de ensinar alguém a ignorar
 *    a tela.
 *
 * O que viaja é a DERIVAÇÃO, não o resultado: a auditoria simula cada
 * opção e recalcula, com a mesma lista que o submit usa.
 */
export interface CampoAuditavel {
  id: string
  label?: string | null
  options: string[]
  /**
   * Valores que o SERVIDOR calcula a partir da resposta deste campo.
   * `porOpcao` é indexado pelo `value` exato da opção.
   */
  derivados?: Array<{ ref: string; label: string; porOpcao: Record<string, number> }>
  /**
   * Este campo é ele próprio um derivado — ninguém o responde. A
   * auditoria não o simula sozinho (não existe opção para escolher),
   * mas precisa dele na lista para a regra ter um rótulo legível.
   */
  derivado?: boolean
}

/**
 * Monta a lista que a auditoria varre, a partir do schema publicado.
 *
 * Pergunta com `opcoes_por_moeda` entra com a UNIÃO das escadas — é o
 * conjunto do que alguém pode ver — e ganha o campo derivado ao lado.
 */
export function camposParaAuditoria(schema: FormSchema | null | undefined): CampoAuditavel[] {
  if (!schema || schema.blocks.length === 0) return []
  const out: CampoAuditavel[] = []

  for (const b of schema.blocks) {
    if (!b.opcoes_por_moeda) {
      out.push({
        id: b.ref,
        label: b.label,
        options: (b.options ?? []).map((o) => o.value),
      })
      continue
    }

    const todas = todasAsOpcoesDeFaturamento()
    const porOpcao: Record<string, number> = {}
    for (const o of todas) if (typeof o.piso === "number") porOpcao[o.value] = o.piso

    const ref = refDoPiso(b.ref)
    const rotulo = `${b.label || "Faturamento"} — equivalente em R$`
    out.push({
      id: b.ref,
      label: b.label,
      options: todas.map((o) => o.value),
      derivados: [{ ref, label: rotulo, porOpcao }],
    })
    // O derivado entra na lista para a regra que o cita ter rótulo, e
    // sem opções: ele não é uma pergunta.
    out.push({ id: ref, label: rotulo, options: [], derivado: true })
  }

  return out
}
