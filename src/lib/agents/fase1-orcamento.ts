/**
 * O relógio da fase 1 — o que faltava para o 504 parar de comer o trabalho.
 *
 * A fase 1 (Seletor → Estruturador → Curador → Montador → Blueprint →
 * Subject) roda SÍNCRONA dentro de uma request. A fase 2 tem orçamento
 * (`PHASE2_CHAIN_BUDGET_MS`, 760s) e o cron de dispatch tem
 * (`DISPATCH_TICK_BUDGET_MS`); a fase 1 não tinha nenhum. Medido em 14
 * dias, 49 fases 1: média 225s, 2 passaram de 500s e 6 ficaram entre 400 e
 * 500 — 16% na zona de perigo já com o Fable e com o sonnet-4.6. O Sonnet 5
 * não criou o problema, tornou frequente o que era exceção.
 *
 * Quando estoura, o gateway mata a função no meio: o run fica `running`
 * órfão até o watchdog fechá-lo 20 min depois, e os ~$0,60 já pagos são
 * jogados fora. Pior que perder é perder sem saber o que sobreviveu.
 *
 * ── Por que o relógio por chamada não podia ser uma constante ────────
 *
 * `ARCHITECT_INVOKE_TIMEOUT_MS` é 240s FIXO e não sabe nada da janela: uma
 * chamada iniciada aos 700s de uma janela de 800 pede 240s que não existem,
 * e quem paga é o gateway. Pior com teto de token alto — a 90 tokens/s
 * (medido, ver TAXA_TOKENS_POR_S), o teto de 48.000 do Estruturador pede
 * 533s numa chamada só. Subir o teto sem mexer no relógio troca
 * truncamento por timeout, que é a mesma perda com outro nome.
 *
 * Aqui o relógio de CADA chamada é o menor entre o teto absoluto e o que
 * ainda resta da janela. Nenhuma chamada pode prometer tempo que a request
 * não tem.
 *
 * A parte de decisão é PURA e testada. A propagação usa `AsyncLocalStorage`
 * de propósito: o deadline atravessa `ensureObjectionTargets` →
 * `generateBlueprintAndReference` → serviços → `invokeAgent` sem mudar sete
 * assinaturas no caminho, e **sem escopo aberto o comportamento é o de
 * antes** (o teto absoluto sozinho), então nada que chama esses serviços
 * por fora muda.
 */

import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Tokens de saída por segundo do modelo, medido em produção.
 *
 * Três runs do `anthropic/claude-sonnet-5` em 10/09, incluindo o raciocínio
 * (que sai do mesmo orçamento da resposta): 6.972 tok em 75s = 93/s;
 * 15.027 em 168s / 2 chamadas = 90/s; 30.750 em 343s / 2 chamadas = 90/s.
 *
 * Serve para ESTIMAR se uma etapa cabe no que resta — não é promessa. Um
 * modelo mais rápido termina antes e sobra orçamento; um mais lento é
 * cortado pelo relógio, que é o desfecho que este módulo existe para
 * garantir. Trocar de modelo pede remedir isto.
 */
export const TAXA_TOKENS_POR_S = 90

/** Piso de relógio: abaixo disto não vale a pena começar uma chamada. */
export const PISO_DE_RELOGIO_MS = 30_000

/** Quanto tempo uma chamada leva, no pior caso, para gastar o teto todo. */
export function msParaGerar(tetoTokens: number): number {
  if (!Number.isFinite(tetoTokens) || tetoTokens <= 0) return 0
  return Math.ceil((tetoTokens / TAXA_TOKENS_POR_S) * 1000)
}

export interface RelogioDaChamada {
  /** Timeout a usar nesta chamada, em ms. Zero = não comece. */
  ms: number
  /** De onde saiu o número — vai para log e telemetria. */
  origem: "teto" | "janela" | "sem_orcamento"
}

/**
 * O relógio de uma chamada: o menor entre o teto absoluto e o que resta.
 *
 * `restanteMs` nulo (sem orçamento aberto) devolve o teto — é o
 * comportamento de antes deste módulo, preservado de propósito.
 */
export function relogioDaChamada(input: {
  tetoMs: number
  restanteMs: number | null
  pisoMs?: number
}): RelogioDaChamada {
  const piso = input.pisoMs ?? PISO_DE_RELOGIO_MS
  if (input.restanteMs == null) return { ms: input.tetoMs, origem: "teto" }
  if (input.restanteMs < piso) return { ms: 0, origem: "sem_orcamento" }
  return input.restanteMs < input.tetoMs
    ? { ms: input.restanteMs, origem: "janela" }
    : { ms: input.tetoMs, origem: "teto" }
}

export interface CabeNaJanela {
  cabe: boolean
  /** Texto de gente para a telemetria — nunca um código cru na tela. */
  motivo?: string
}

/**
 * A etapa cabe no que resta, guardadas as que vêm depois dela?
 *
 * A `reservaMs` é o que as etapas SEGUINTES precisam. Sem ela, o Seletor
 * come a janela inteira e o Curador — que não é pulável — fica sem tempo.
 */
export function cabeNaJanela(input: {
  custoMs: number
  restanteMs: number | null
  reservaMs?: number
}): CabeNaJanela {
  if (input.restanteMs == null) return { cabe: true }
  const reserva = input.reservaMs ?? 0
  const disponivel = input.restanteMs - reserva
  if (disponivel >= input.custoMs) return { cabe: true }
  const seg = (ms: number) => Math.max(0, Math.round(ms / 1000))
  return {
    cabe: false,
    motivo:
      reserva > 0
        ? `precisa de ~${seg(input.custoMs)}s e restam ${seg(input.restanteMs)}s, dos quais ${seg(reserva)}s estão reservados para as etapas seguintes`
        : `precisa de ~${seg(input.custoMs)}s e restam ${seg(input.restanteMs)}s`,
  }
}

/**
 * Reserva para o que vem DEPOIS do Estruturador, medido em produção:
 * Curador 116-164s + Blueprint 11s + Subject ~15s, com folga para o
 * dispatch e a resposta. O Curador NÃO é pulável — sem variante nenhuma,
 * `coberturaSuficiente` recusa a montagem e a fase 2 morre em
 * `hero_failed`, que é pior que um 504 porque parece sucesso.
 */
export const RESERVA_POS_ESTRUTURADOR_MS = 200_000

/** Reserva para tudo que vem depois do Seletor (Estruturador incluído). */
export const RESERVA_POS_SELETOR_MS = 380_000

/**
 * Teto de relógio por agente da fase 1, em ms.
 *
 * O global (`ARCHITECT_INVOKE_TIMEOUT_MS`, 240s) NÃO pode subir: ele é
 * compartilhado com o Curador, o Montador e o catalogador, e o
 * `DISPATCH_TICK_BUDGET_MS` do cron foi dimensionado por escrito sobre ele
 * (`45s + 240s <= maxDuration 300s`). Um número maior lá mata o cron no
 * meio — pior que o 504, porque deixa run órfã e job reclamável.
 *
 * Os valores saem da conta, não do gosto: a 90 tok/s, o teto de tokens de
 * cada agente pede este tempo para ser alcançável. Teto de token que o
 * relógio nunca deixa atingir não é generosidade — o OpenRouter RESERVA
 * `prompt + max_tokens` em crédito enquanto a chamada está em voo, e foi
 * assim que nasceram os `402 in-flight` deste projeto (seção 9 do
 * `TROCAR_modelo_agentes.sql`). Os dois números andam juntos.
 */
export const TETO_DE_RELOGIO_MS: Record<string, number> = {
  // teto 24.000 tokens ≈ 267s
  seletor: 280_000,
  // teto 32.000 tokens ≈ 356s
  estruturador: 360_000,
  // teto 32.000 tokens ≈ 356s. O Curador faz DUAS chamadas (shortlist e
  // escolha) e este relógio vale para cada uma — o que aperta é o orçamento
  // da fase 1, não este teto.
  assembler_chooser: 360_000,
}

/** O teto de relógio deste agente, ou null para usar o global. */
export function tetoDeRelogioDoAgente(agente?: string | null): number | null {
  if (!agente) return null
  return TETO_DE_RELOGIO_MS[agente] ?? null
}

interface EscopoDeOrcamento {
  /** Instante (epoch ms) em que a janela acaba. */
  fimMs: number
}

const escopo = new AsyncLocalStorage<EscopoDeOrcamento>()

/**
 * Abre a janela da fase 1 para tudo que rodar dentro de `fn`.
 *
 * Reentrante: um escopo aninhado NUNCA estende a janela de fora — vale
 * sempre o fim mais próximo, senão uma etapa interna poderia se dar mais
 * tempo do que a request tem.
 */
export function comOrcamentoDeFase1<T>(totalMs: number, fn: () => Promise<T>): Promise<T> {
  const proposto = Date.now() + Math.max(0, totalMs)
  const atual = escopo.getStore()?.fimMs
  const fimMs = atual != null ? Math.min(atual, proposto) : proposto
  return escopo.run({ fimMs }, fn)
}

/** Quanto resta da janela, ou null quando não há janela aberta. */
export function restanteDoOrcamento(agoraMs?: number): number | null {
  const store = escopo.getStore()
  if (!store) return null
  return store.fimMs - (agoraMs ?? Date.now())
}

/** Atalho: o relógio desta chamada, já consultando a janela vigente. */
export function relogioParaChamada(tetoMs: number): RelogioDaChamada {
  return relogioDaChamada({ tetoMs, restanteMs: restanteDoOrcamento() })
}
