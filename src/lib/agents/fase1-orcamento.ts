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
 * Custo TÍPICO de cada agente da fase 1, em ms — medido, não derivado.
 *
 * ── Por que não dá para usar o teto de tokens aqui ───────────────────
 *
 * `relogioParaTeto(maxTokens)` responde "quanto tempo esta chamada pode
 * levar no pior caso", e é a resposta certa para o RELÓGIO: o provedor
 * reserva `prompt + max_tokens` em crédito enquanto a chamada está em voo,
 * então o relógio tem de cobrir o teto. Mas `cabeNaJanela` faz outra
 * pergunta — "vale a pena começar?" — e responder com o teto é ser
 * pessimista por um fator de três: o Curador tem teto de 32.000 tokens
 * (371s pela conta) e escreve ~12.000 (210s medidos).
 *
 * A diferença não é acadêmica. Foi ela que desligou o Estruturador em
 * 11/09: a reserva subiu, o custo estimado continuou sendo o teto, e a
 * conta passou a nunca fechar. Estimar pelo teto e reservar pelo teto é
 * pedir duas vezes o mesmo tempo.
 *
 * ── Os números (produção, 7 dias até 15/09) ──────────────────────────
 *
 * Modelo vigente `~anthropic/claude-fable-latest` nos três que decidem:
 *
 * | agente             | p50  | p90  | max  | n |
 * |--------------------|------|------|------|---|
 * | seletor            |  61s |  65s |  66s | 8 |
 * | estruturador       | 150s | 210s | 267s | 7 |
 * | assembler_chooser  | 210s | 336s | 376s | 7 |
 * | blueprint (código) |   8s |  20s |  22s |17 |
 * | subject (4.6)      |   6s |   7s |   7s | 8 |
 *
 * Usamos o MAX medido, não o p90: errar para baixo aqui faz começar uma
 * etapa que não termina, e quem paga é o gateway. O relógio continua
 * sendo a defesa real — se a etapa passar disto, `relogioDaChamada` a
 * corta.
 *
 * **Trocar o modelo de um destes agentes OBRIGA a remedir a linha dele.**
 * A query está em `supabase/migrations/DIAGNOSTICO_fase1_relogio.sql`.
 */
export const CUSTO_TIPICO_MS: Record<string, number> = {
  seletor: 70_000,
  estruturador: 270_000,
  assembler_chooser: 340_000,
}

/**
 * O custo estimado desta etapa para decidir se vale começar.
 *
 * Agente sem medição cai no teto de tokens — o comportamento de antes
 * deste mapa, preservado de propósito para que nada fora da fase 1 mude.
 */
export function custoTipicoDoAgente(agente: string | null | undefined, maxTokens: number): number {
  const medido = agente ? CUSTO_TIPICO_MS[agente] : undefined
  return medido ?? relogioParaTeto(maxTokens)
}

/**
 * Reserva para o que vem DEPOIS do Estruturador. O Curador NÃO é pulável —
 * sem variante nenhuma, `coberturaSuficiente` recusa a montagem e a fase 2
 * morre em `hero_failed`, que é pior que um 504 porque parece sucesso.
 *
 * ── O número é do MODELO vigente, e já quebrou duas vezes ────────────
 *
 * 490s vieram do Curador levando 442s no `anthropic/claude-sonnet-5`
 * (11/09, batch 1ea00ba9). Os agentes voltaram para o `sonnet-4.6` no
 * mesmo dia e ninguém remediu; o efeito não foi "o Estruturador cede às
 * vezes", foi ele nunca mais rodar — 742s de janela menos 490s de reserva
 * deixam 252s contra os 371s que ele pedia. Toda geração desde 05:21
 * reusou a decisão das 04:39 e a tela dizia só "pulado".
 *
 * A correção da época baixou a reserva para 150s com o Curador medido em
 * 97s. Esse 97s tinha n=3 e não sobreviveu: em 7 dias até 15/09 o Curador
 * está em 210s de mediana, 336s no p90 e 376s no máximo. A reserva ficou
 * menor que a mediana da etapa que ela existe para proteger.
 *
 * 400s = 340s do Curador (máximo medido, arredondado) + 22s de Blueprint +
 * 7s de Subject + ~31s de folga.
 *
 * A conta fecha porque o custo estimado do Estruturador passou a ser
 * MEDIDO (270s) e não mais o teto de tokens (371s): dos 742s que restam
 * quando ele é consultado, 400 são reserva e sobram 342 — 72s acima do
 * pior caso dele. Com o teto antigo a mesma reserva o teria desligado de
 * novo, que é a armadilha de 11/09 repetida.
 *
 * A saída definitiva é não ter reserva nenhuma: com cada agente num passo
 * durável, ninguém divide janela com ninguém.
 */
export const RESERVA_POS_ESTRUTURADOR_MS = 400_000

/**
 * NÃO existe reserva pós-Seletor, e isso é decisão medida — não esquecimento.
 *
 * Havia uma constante aqui (380s, depois 490s) que nenhum caller lia: a
 * mesma armadilha de `cabeNaJanela`, escrita e testada sem estar ligada ao
 * fluxo. Ligá-la seria PIOR que deixá-la morta. A conta, com os números de
 * 11/09: o teto do Seletor é 24.000 tokens, que a 90 tok/s mais a latência
 * base pedem 282s; reservar 490s dos 770 da janela deixa 280s disponíveis.
 * O Seletor seria pulado em TODA geração por 2 segundos de margem — e sem
 * ele a peça vai sem alvo do toque, que é o pior desfecho dos três.
 *
 * O Seletor custa 65s medidos (6.129 tokens de saída), não é ele que aperta
 * a janela. Quem cede é o Estruturador, e por `reuso-da-decisao.ts`: a
 * decisão dele já está gravada e o Curador não tem substituto.
 */

/**
 * Teto de relógio por agente da fase 1, em ms.
 *
 * O global (`ARCHITECT_INVOKE_TIMEOUT_MS`, 240s) é compartilhado com o
 * Montador e o catalogador. Subi-lo mexe em quem não pediu.
 *
 * ── A conta que estava escrita aqui era FALSA ────────────────────────
 *
 * Dizia que o `DISPATCH_TICK_BUDGET_MS` do cron fora dimensionado sobre os
 * 240s globais: `45s + 240s <= maxDuration 300s`. Mas o Curador tem teto
 * PRÓPRIO de 360s e faz até duas chamadas, e a fase 1 de um e-mail leva
 * 363s de mediana (p90 681s, máximo 1213s — 43 e-mails, 14 dias). Nunca
 * coube em 300s. O cron sobrevivia morrendo no meio e recomeçando o e-mail
 * no tick seguinte, pagando o Curador de novo.
 *
 * Quem faz a conta fechar agora é `email-dispatch-queue.service.ts`: a
 * função do cron tem 800s (o teto da Vercel, o mesmo das rotas de fase 2)
 * e a janela da fase 1 é aberta dentro dela. Os números e a invariante
 * estão lá, com teste.
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

/**
 * Latência que não é geração: handshake, fila do provedor e o tempo até o
 * primeiro token. `msParaGerar` mede só a saída, e uma chamada cujo relógio
 * seja exatamente a conta da saída é cortada antes de escrever a última
 * linha.
 */
export const LATENCIA_BASE_MS = 15_000

/**
 * O relógio de um agente cujo teto de tokens mora no BANCO.
 *
 * `TETO_DE_RELOGIO_MS` resolve os agentes cujo teto é constante no código.
 * Não serve para o Catalogador: o `max_tokens` dele vem de
 * `email_agent_configs` e muda sem deploy — foi assim que ele passou de
 * 8.192 para 12.288 em 04/09 e deixou de caber no `maxDuration` da rota,
 * sem que uma linha do repositório mudasse. Constante aqui envelheceria na
 * primeira troca pela tela.
 *
 * Derivar o relógio do teto mantém os dois números andando juntos por
 * construção, que é a regra que `AgentInvokeConfig.timeoutMs` documenta:
 * teto de token que o relógio nunca deixa atingir não é generosidade — o
 * OpenRouter RESERVA `prompt + max_tokens` em crédito enquanto a chamada
 * está em voo.
 *
 * Continua sendo só o TETO desta chamada: quem corta de verdade é
 * `relogioDaChamada`, pelo que resta da janela.
 */
export function relogioParaTeto(maxTokens: number): number {
  return Math.max(PISO_DE_RELOGIO_MS, msParaGerar(maxTokens) + LATENCIA_BASE_MS)
}
