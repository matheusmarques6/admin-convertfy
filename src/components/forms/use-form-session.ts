"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { FormAnswers } from "@/types/forms-conversational"

/**
 * A sessão do lado do browser: abre, guarda o token e manda o autosave.
 *
 * ## Por que existe uma FILA e não um `fetch` por resposta
 *
 * Quem responde rápido gera um save por tecla de atalho. Sem fila, são
 * dez requisições em voo, chegando fora de ordem, e a última a chegar
 * não é a última a sair — o servidor mescla respostas, então isso não
 * corrompe dado, mas queima o rate limit e a bateria do celular. A fila
 * junta o que mudou e manda de tempos em tempos.
 *
 * ## O save que importa é o da aba fechando
 *
 * `visibilitychange` → `hidden` é o único evento confiável no iOS
 * (`beforeunload` não dispara ao trocar de app), e `sendBeacon` é a
 * única forma de a requisição sobreviver ao fechamento. Os dois estão
 * ligados aqui. Perder este save é perder exatamente o abandono, que é
 * o produto.
 *
 * ## Falhar é silencioso, de propósito
 *
 * A sessão é telemetria e captura de abandono; o formulário é o produto.
 * Rede caída, sessão recusada, migration atrasada — nada disso pode
 * mostrar erro a quem está respondendo nem impedir o envio.
 */

export interface EventoParaEnviar {
  type: string
  field_ref?: string | null
  step_index?: number | null
  payload?: Record<string, unknown>
  event_key?: string | null
}

interface Pendente {
  answers: FormAnswers
  variables: Record<string, string | number>
  current_field_ref?: string | null
  status?: string
  time_on_last_step_ms?: number | null
  ending_ref?: string | null
  events: EventoParaEnviar[]
}

const INTERVALO_MS = 1200

/** Junta dois pendentes. O `novo` vence no que os dois têm. */
function mesclar(antigo: Pendente, novo: Pendente | null): Pendente {
  if (!novo) return antigo
  return {
    ...novo,
    answers: { ...antigo.answers, ...novo.answers },
    variables: { ...antigo.variables, ...novo.variables },
    events: [...antigo.events, ...novo.events].slice(-200),
  }
}

/** O que veio de uma sessão retomada, para a tela repor. */
export interface SessaoRetomada {
  answers: FormAnswers
  variables: Record<string, string | number>
  hidden: Record<string, string>
  currentRef: string | null
}

export interface SessaoDoFormulario {
  sessionId: string | null
  /** Preenchido só quando o link de retomada abriu uma sessão de verdade. */
  retomada: SessaoRetomada | null
  /** Enfileira o avanço. Nada é enviado de imediato. */
  salvar: (p: Partial<Pendente>) => void
  /** Manda agora o que estiver pendente (usado no submit). */
  descarregar: () => Promise<void>
  /** Para anexar ao submit e fechar a sessão. */
  credenciais: () => { session_id: string | null; session_token: string | null }
}

export function useFormSession(params: {
  slug: string
  /** Preview do editor nunca abre sessão real. */
  ativo: boolean
  contexto: Record<string, string | null>
  hidden: Record<string, string>
  /** `?retomar=` do link que o vendedor mandou. */
  retomarToken?: string | null
}): SessaoDoFormulario {
  const { slug, ativo, retomarToken } = params
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [retomada, setRetomada] = useState<SessaoRetomada | null>(null)
  const tokenRef = useRef<string | null>(null)
  const pendenteRef = useRef<Pendente | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enviandoRef = useRef(false)

  // O contexto e os ocultos são lidos UMA vez, na abertura. Congelá-los
  // numa ref evita que uma mudança de identidade do objeto (todo render
  // cria um novo) reabra a sessão a cada tecla digitada.
  const inicioRef = useRef({ contexto: params.contexto, hidden: params.hidden })

  useEffect(() => {
    if (!ativo) return
    let cancelado = false
    ;(async () => {
      try {
        // Retomada primeiro: abrir uma sessão NOVA para quem clicou no
        // link de continuar perderia o que ele já respondeu — que é a
        // única razão de o link existir.
        if (retomarToken) {
          const r = await fetch(
            `/api/public/forms/${encodeURIComponent(slug)}/session/resume?token=${encodeURIComponent(retomarToken)}`,
          )
          if (r.ok) {
            const j = await r.json()
            if (!cancelado && j?.retomavel && j?.session_id) {
              tokenRef.current = j.token ?? null
              setSessionId(j.session_id)
              setRetomada({
                answers: j.answers ?? {},
                variables: j.variables ?? {},
                hidden: j.hidden ?? {},
                currentRef: j.current_field_ref ?? null,
              })
              return
            }
          }
          // Link vencido ou inválido: segue para a sessão nova, em
          // silêncio. Barrar a pessoa por um link velho seria trocar um
          // formulário do zero por uma tela de erro.
        }

        const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...inicioRef.current.contexto,
            hidden: inicioRef.current.hidden,
          }),
        })
        if (!res.ok) return
        const json = await res.json()
        if (cancelado || !json?.session_id) return
        tokenRef.current = json.token ?? null
        setSessionId(json.session_id)
      } catch {
        // Silencioso: ver o cabeçalho.
      }
    })()
    return () => {
      cancelado = true
    }
  }, [slug, ativo, retomarToken])

  const montarCorpo = useCallback((p: Pendente, id: string) => {
    return JSON.stringify({
      session_id: id,
      token: tokenRef.current,
      answers: p.answers,
      variables: p.variables,
      current_field_ref: p.current_field_ref,
      status: p.status,
      time_on_last_step_ms: p.time_on_last_step_ms,
      ending_ref: p.ending_ref,
      events: p.events,
    })
  }, [])

  const enviar = useCallback(
    async (viaBeacon: boolean) => {
      const id = sessionId
      const p = pendenteRef.current
      if (!id || !tokenRef.current || !p) return
      pendenteRef.current = null

      const url = `/api/public/forms/${encodeURIComponent(slug)}/session/save`
      const corpo = montarCorpo(p, id)

      if (viaBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        // `text/plain` evita o preflight CORS, que o beacon não espera.
        navigator.sendBeacon(url, new Blob([corpo], { type: "text/plain" }))
        return
      }

      enviandoRef.current = true
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: corpo,
          keepalive: true,
        })
      } catch {
        // Devolve o pendente à fila: a próxima tentativa leva junto o que
        // não foi. Mescla em vez de sobrescrever porque pode ter chegado
        // resposta nova enquanto esta requisição estava em voo — e a que
        // chegou depois é a mais recente, então ela vence.
        pendenteRef.current = mesclar(p, pendenteRef.current)
      } finally {
        enviandoRef.current = false
      }
    },
    [sessionId, slug, montarCorpo],
  )

  const salvar = useCallback(
    (patch: Partial<Pendente>) => {
      const atual: Pendente = pendenteRef.current ?? {
        answers: {},
        variables: {},
        events: [],
      }
      pendenteRef.current = {
        ...atual,
        ...patch,
        answers: { ...atual.answers, ...(patch.answers ?? {}) },
        variables: { ...atual.variables, ...(patch.variables ?? {}) },
        events: [...atual.events, ...(patch.events ?? [])].slice(-200),
      }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void enviar(false), INTERVALO_MS)
    },
    [enviar],
  )

  const descarregar = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    await enviar(false)
  }, [enviar])

  // A saída. `visibilitychange` cobre o iOS (onde `beforeunload` não
  // dispara ao trocar de app) e `pagehide` cobre o bfcache.
  useEffect(() => {
    if (!ativo) return
    const aoSair = () => {
      if (!pendenteRef.current) return
      void enviar(true)
    }
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") aoSair()
    }
    document.addEventListener("visibilitychange", aoEsconder)
    window.addEventListener("pagehide", aoSair)
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder)
      window.removeEventListener("pagehide", aoSair)
    }
  }, [ativo, enviar])

  /**
   * A sessão abre depois do primeiro render, e quem responde rápido pode
   * enfileirar antes disso. `enviar` sai sem id e o pendente fica parado
   * até o próximo `salvar` — se a pessoa responder a primeira pergunta e
   * sair, esse save nunca acontece. Assim que o id chega, descarrega.
   */
  useEffect(() => {
    if (!sessionId || !pendenteRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void enviar(false), 200)
  }, [sessionId, enviar])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const credenciais = useCallback(
    () => ({ session_id: sessionId, session_token: tokenRef.current }),
    [sessionId],
  )

  return { sessionId, retomada, salvar, descarregar, credenciais }
}
