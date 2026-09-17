"use client"

/**
 * O formulário conversacional: uma pergunta por tela.
 *
 * As decisões de interação vieram do que quebra na prática, não de
 * gosto:
 *
 * **Escolha única avança sozinha.** É o que faz a coisa parecer
 * conversa. Com 300 ms de espera, tempo de a seleção ficar visível —
 * avançar instantâneo dá a sensação de que o clique não registrou.
 *
 * **Enter avança, e em texto longo é Shift+Enter que quebra linha.** O
 * contrário (Enter quebrando linha em todo campo) faz quem preenche no
 * teclado ficar preso na primeira pergunta.
 *
 * **Letra seleciona a opção.** A, B, C ao lado de cada uma. É atalho de
 * teclado de verdade, não enfeite: quem responde no notebook não tira a
 * mão do teclado.
 *
 * **O erro não pisca e some.** Ele aparece abaixo do campo, com
 * `aria-live`, e some quando a pessoa corrige — não num timer.
 *
 * **No celular o botão fica ANCORADO no fluxo, nunca `position: fixed`
 * no rodapé.** Teclado virtual no iOS não redimensiona a viewport: um
 * botão fixo fica atrás do teclado, e a pessoa não encontra como
 * avançar. O `Enter` do teclado virtual também avança.
 *
 * **A barra de progresso nunca recua** (`progressoMonotonico`): com
 * ramificação, a estimativa muda a cada resposta, e barra que volta é
 * lida como perda de progresso.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowUp, Check, CornerDownLeft, Info, Loader2 } from "lucide-react"
import type { FormAnswers, FormBlock, FormSchema } from "@/types/forms-conversational"
import { TIPOS_DE_ESCOLHA, TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import {
  acharEnding,
  atalhoDaOpcao,
  calcularProgresso,
  passoAnterior,
  primeiroBloco,
  progressoMonotonico,
  proximoPasso,
} from "@/lib/forms/engine"
import { validarResposta } from "@/lib/forms/validacao"
import { aplicarRecall } from "@/lib/forms/recall"
import {
  fireConversionPixels,
  matchingDoBrowser,
  useFormPixels,
  type FormTracking,
  type SubmitTracking,
} from "./form-pixels"
import { defaults, gradientCss, type FormTheme } from "./form-theme"
import { useFormSession } from "./use-form-session"

export interface ConversationalFormProps {
  slug: string
  schema: FormSchema
  form: {
    id: string
    name: string
    logo_url: string | null
    theme: FormTheme
    success_message: string | null
    redirect_url: string | null
    /** Descritor de pixels do GET público (sem token, sem regras). */
    tracking?: FormTracking
  }
  contexto?: Record<string, string | null>
  /** Click ids da URL do anúncio — viram `_fbc`/`_fbp` no submit. */
  clickIds?: { fbclid: string | null; gclid: string | null }
  hidden?: Record<string, string>
  /** `?retomar=` — abre o formulário onde a pessoa parou. */
  retomarToken?: string | null
  /** Preview do editor: não abre sessão, não envia, não dispara pixel. */
  preview?: boolean
  /** Callback do preview para navegar sem enviar. */
  onSubmitFake?: () => void
}

type Tela =
  | { tipo: "welcome" }
  | { tipo: "bloco"; ref: string }
  | { tipo: "fim"; ending: string | null }

/**
 * Vermelho de erro que se lê nos DOIS fundos. `#DC2626` sobre `#0B0B14`
 * fica abaixo do contraste mínimo — o aviso existe justamente para ser
 * lido por quem errou e está com pressa.
 */
function corDeErro(modo: string): string {
  return modo === "dark" ? "#F87171" : "#DC2626"
}

export function ConversationalFormView({
  slug,
  schema,
  form,
  contexto = {},
  clickIds,
  hidden = {},
  retomarToken = null,
  preview = false,
  onSubmitFake,
}: ConversationalFormProps) {
  const t = defaults(form.theme ?? {})
  const bgFill = gradientCss(form.theme?.bgGradient) ?? t.bg
  const buttonFill = gradientCss(form.theme?.buttonGradient) ?? t.primary
  const escopo = `cfy-${useId().replace(/:/g, "")}`
  const erroCor = corDeErro(t.mode)

  const [answers, setAnswers] = useState<FormAnswers>({})
  const [variables, setVariables] = useState<Record<string, string | number>>({})
  const [tela, setTela] = useState<Tela>(() =>
    schema.settings?.welcome ? { tipo: "welcome" } : telaDoDestino(primeiroBloco(schema)),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [direcao, setDirecao] = useState<"frente" | "tras">("frente")
  const [enviando, setEnviando] = useState(false)
  const [falhaEnvio, setFalhaEnvio] = useState<string | null>(null)
  const [progressoVisto, setProgressoVisto] = useState(0)

  const entradaEm = useRef<number>(Date.now())

  /**
   * `document.referrer` e a URL de verdade só existem no browser: o
   * servidor renderiza esta página e manda `null`. Sem isto a CAPI cai no
   * fallback de `event_source_url` e a origem do cadastro se perde.
   */
  const contextoDaVisita = useMemo(() => {
    if (typeof window === "undefined") return contexto
    return {
      ...contexto,
      referrer: document.referrer || contexto.referrer || null,
      landing_url: window.location.href,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pixels de browser no mount — mesmo hook do clássico.
  useFormPixels(form.tracking, preview)

  const sessao = useFormSession({ slug, ativo: !preview, contexto: contextoDaVisita, hidden, retomarToken })

  /**
   * Repõe a sessão retomada. Uma vez só (`repostoRef`): rodar de novo
   * jogaria a pessoa de volta para onde ela parou ANTES, apagando o que
   * ela acabou de responder nesta visita.
   *
   * Se o bloco gravado não existe mais (o formulário foi editado desde
   * o abandono), ela recomeça do primeiro — melhor que uma tela em
   * branco apontando para uma pergunta que não existe.
   */
  const repostoRef = useRef(false)
  useEffect(() => {
    const r = sessao.retomada
    if (!r || repostoRef.current) return
    repostoRef.current = true
    setAnswers((a) => ({ ...r.answers, ...a }))
    setVariables((v) => ({ ...r.variables, ...v }))
    const existe = r.currentRef && schema.blocks.some((b) => b.ref === r.currentRef && !b.hidden)
    setTela(existe ? { tipo: "bloco", ref: r.currentRef as string } : telaDoDestino(primeiroBloco(schema)))
    entradaEm.current = Date.now()
  }, [sessao.retomada, schema])

  /**
   * Os ocultos da sessão retomada entram por BAIXO dos da URL atual: o
   * link de retomada não carrega os `?utm_*` da visita original, e sem
   * isto a lógica que depende deles passaria a não casar justamente para
   * quem voltou — o oposto do que o link existe para fazer. A URL de
   * agora vence porque é a informação mais recente.
   */
  const ocultos = useMemo(
    () => ({ ...(sessao.retomada?.hidden ?? {}), ...hidden }),
    [sessao.retomada, hidden],
  )
  const ctx = useMemo(() => ({ answers, hidden: ocultos, variables }), [answers, ocultos, variables])
  const css = useMemo(() => cssDoEscopo(escopo, t.primary), [escopo, t.primary])

  const blocoAtual: FormBlock | null = useMemo(() => {
    if (tela.tipo !== "bloco") return null
    return schema.blocks.find((b) => b.ref === tela.ref) ?? null
  }, [tela, schema.blocks])

  // ── progresso ──
  const progresso = useMemo(() => {
    if (tela.tipo === "fim") return 1
    if (tela.tipo === "welcome") return 0
    return calcularProgresso(schema, tela.ref, ctx).fracao
  }, [tela, schema, ctx])

  useEffect(() => {
    setProgressoVisto((p) => progressoMonotonico(p, progresso))
  }, [progresso])

  // ── navegação ──
  const irPara = useCallback(
    (nova: Tela, dir: "frente" | "tras") => {
      setDirecao(dir)
      setErro(null)
      setTela(nova)
      entradaEm.current = Date.now()
    },
    [],
  )

  // ── envio ──
  const finalizar = useCallback(
    async (endingRef: string | null, answersFinais: FormAnswers, varsFinais: Record<string, string | number>) => {
      const ending = acharEnding(schema, endingRef)
      if (preview) {
        onSubmitFake?.()
        irPara({ tipo: "fim", ending: endingRef }, "frente")
        return
      }

      setEnviando(true)
      setFalhaEnvio(null)
      try {
        // Descarrega a sessão ANTES do submit: se o submit falhar, o que
        // a pessoa respondeu já está gravado e o abandono é acionável.
        await sessao.descarregar()

        const cred = sessao.credenciais()
        // `_fbc` deriva do `fbclid` do anúncio e `_fbp` é gerado quando o
        // ad-blocker impediu o fbevents — é o que dá à CAPI a chave de
        // correspondência do clique pago.
        const { fbc, fbp } = matchingDoBrowser(clickIds?.fbclid)
        const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: answersFinais,
            ...contextoDaVisita,
            ...cred,
            fbc,
            fbp,
            fbclid: clickIds?.fbclid ?? contextoDaVisita.fbclid ?? null,
            gclid: clickIds?.gclid ?? contextoDaVisita.gclid ?? null,
            ending_ref: endingRef,
            disqualified: Boolean(ending?.disqualified),
            event_source_url: typeof window !== "undefined" ? window.location.href : null,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        // ANTES de qualquer redirecionamento: o `Lead` do browser leva o
        // MESMO `event_id` da CAPI, a Meta deduplica e conta uma conversão.
        // Disparar depois do `location.href` seria não disparar.
        fireConversionPixels(form.tracking, json?.tracking as SubmitTracking | undefined)

        if (ending?.redirect_url) {
          window.location.href = ending.redirect_url
          return
        }
        if (!ending && json?.redirect_url) {
          window.location.href = json.redirect_url
          return
        }
        irPara({ tipo: "fim", ending: endingRef }, "frente")
      } catch {
        // A resposta NÃO é perdida: o estado continua na tela e o botão
        // volta. Mandar para a tela final sem ter enviado seria mentir
        // para quem preencheu.
        setFalhaEnvio("Não conseguimos enviar agora. Confira a conexão e tente de novo.")
      } finally {
        setEnviando(false)
      }
      void varsFinais
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, preview, onSubmitFake, sessao, slug, contextoDaVisita, clickIds, form.tracking, irPara],
  )

  const avancar = useCallback(
    (respostaAgora?: { ref: string; valor: FormAnswers[string] }) => {
      if (tela.tipo === "welcome") {
        irPara(telaDoDestino(primeiroBloco(schema)), "frente")
        return
      }
      if (tela.tipo !== "bloco" || !blocoAtual) return

      const answersEfetivas = respostaAgora
        ? { ...answers, [respostaAgora.ref]: respostaAgora.valor }
        : answers

      const v = validarResposta(blocoAtual, answersEfetivas[blocoAtual.ref])
      if (!v.valido) {
        setErro(v.erro)
        return
      }

      const ctxEfetivo = { answers: answersEfetivas, hidden: ocultos, variables }
      const r = proximoPasso(schema, blocoAtual.ref, ctxEfetivo)
      const tempo = Date.now() - entradaEm.current

      if (!mesmasVariaveis(variables, r.variables)) setVariables(r.variables)

      // O save carrega a resposta, onde a pessoa ESTAVA e quanto tempo
      // levou — é o que vira "parou na pergunta 4, depois de 40s nela".
      sessao.salvar({
        answers: answersEfetivas,
        variables: r.variables,
        current_field_ref: r.destino.tipo === "bloco" ? r.destino.ref : blocoAtual.ref,
        time_on_last_step_ms: tempo,
        status: "in_progress",
        events: [
          {
            type: "answered",
            field_ref: blocoAtual.ref,
            payload: { ms: tempo },
            event_key: `answered:${blocoAtual.ref}:${Object.keys(answersEfetivas).length}`,
          },
        ],
      })

      if (r.destino.tipo === "erro") {
        // Lógica quebrada no CADASTRO. Quem responde não pode ficar preso
        // numa tela morta: seguimos para o fim, e o erro vai no log do
        // editor (evento `logic_error`) em vez de na cara do visitante.
        sessao.salvar({
          events: [{ type: "logic_error", field_ref: r.destino.ref, payload: { motivo: r.destino.motivo } }],
        })
        void finalizar(null, answersEfetivas, r.variables)
        return
      }
      if (r.destino.tipo === "fim") {
        void finalizar(r.destino.ending, answersEfetivas, r.variables)
        return
      }
      irPara({ tipo: "bloco", ref: r.destino.ref }, "frente")
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tela, blocoAtual, answers, ocultos, variables, schema, sessao, irPara],
  )

  const voltar = useCallback(() => {
    if (tela.tipo !== "bloco") return
    const anterior = passoAnterior(schema, tela.ref, ctx)
    if (!anterior) {
      if (schema.settings?.welcome) irPara({ tipo: "welcome" }, "tras")
      return
    }
    irPara({ tipo: "bloco", ref: anterior }, "tras")
  }, [tela, schema, ctx, irPara])

  const responder = useCallback(
    (ref: string, valor: FormAnswers[string], avancarJa = false) => {
      setAnswers((a) => ({ ...a, [ref]: valor }))
      setErro(null)
      if (avancarJa) {
        // O respiro de 300ms existe para a seleção ficar visível. Sem
        // ele, a tela troca antes de o olho registrar o clique.
        window.setTimeout(() => avancar({ ref, valor }), 300)
      }
    },
    [avancar],
  )

  // ── teclado global ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enviando) return
      const alvo = e.target as HTMLElement | null
      const digitando =
        alvo?.tagName === "INPUT" || alvo?.tagName === "TEXTAREA" || alvo?.isContentEditable

      if (e.key === "Enter" && !e.shiftKey) {
        if (alvo?.tagName === "TEXTAREA") return // Enter quebra linha
        e.preventDefault()
        avancar()
        return
      }
      if (!digitando && (e.key === "ArrowDown" || e.key === "PageDown")) {
        e.preventDefault()
        avancar()
        return
      }
      if (!digitando && (e.key === "ArrowUp" || e.key === "PageUp")) {
        e.preventDefault()
        voltar()
        return
      }
      // Letra escolhe a opção — só em bloco de escolha e fora de input.
      if (!digitando && blocoAtual && TIPOS_DE_ESCOLHA.has(blocoAtual.type) && /^[a-z]$/i.test(e.key)) {
        const opcoes = blocoAtual.options ?? []
        const i = opcoes.findIndex((o, idx) => atalhoDaOpcao(idx, o.atalho) === e.key.toUpperCase())
        if (i >= 0) {
          e.preventDefault()
          const o = opcoes[i]
          if (blocoAtual.type === "multi_select") {
            const atual = Array.isArray(answers[blocoAtual.ref]) ? (answers[blocoAtual.ref] as string[]) : []
            const nova = atual.includes(o.value) ? atual.filter((x) => x !== o.value) : [...atual, o.value]
            responder(blocoAtual.ref, nova)
          } else {
            responder(blocoAtual.ref, o.value, true)
          }
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [avancar, voltar, blocoAtual, answers, responder, enviando])

  // Foco no campo ao trocar de tela — sem isso quem usa teclado precisa
  // dar Tab a cada pergunta. No celular NÃO focamos: abrir o teclado
  // virtual sozinho cobre a pergunta que a pessoa ainda não leu.
  const campoRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (tela.tipo !== "bloco") return
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return
    const id = window.setTimeout(() => campoRef.current?.focus(), 120)
    return () => window.clearTimeout(id)
  }, [tela])

  // Registra a visualização de cada pergunta — é o que permite dizer
  // "40% chegaram na 5 e só 12% responderam".
  useEffect(() => {
    if (tela.tipo !== "bloco" || preview) return
    sessao.salvar({
      current_field_ref: tela.ref,
      status: "started",
      events: [{ type: "viewed_field", field_ref: tela.ref, event_key: `viewed:${tela.ref}` }],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela.tipo === "bloco" ? tela.ref : null, preview])

  const recall = useCallback(
    (txt: string | null | undefined) => aplicarRecall(txt, { answers, hidden: ocultos, variables, blocks: schema.blocks }),
    [answers, ocultos, variables, schema.blocks],
  )

  // ── render ──
  const mostrarProgresso = schema.settings?.mostrar_progresso !== false && tela.tipo !== "fim"

  return (
    <div
      className={escopo}
      style={{
        minHeight: "100dvh",
        background: bgFill,
        color: t.text,
        fontFamily: t.fontFamily,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{css}</style>

      {mostrarProgresso && (
        <div
          style={{ position: "sticky", top: 0, height: 4, background: "rgba(127,127,127,0.15)", zIndex: 2 }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressoVisto * 100)}
          aria-label="Progresso do formulário"
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(progressoVisto * 100)}%`,
              background: buttonFill,
              transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          // `margin: auto` no FILHO em vez de `align-items: center`: com
          // conteúdo mais alto que a tela (a pergunta de 6 opções em
          // celular baixo), o centro corta o topo e não há como rolar
          // até ele. Com margin auto, centraliza quando cabe e rola
          // quando não cabe.
          padding: "48px 20px 32px",
        }}
      >
        <div
          key={tela.tipo === "bloco" ? tela.ref : tela.tipo}
          className={`cfy-tela cfy-${direcao}`}
          style={{ width: "100%", maxWidth: Math.max(t.containerWidth, 560), margin: "auto 0" }}
        >
          {form.logo_url && tela.tipo !== "bloco" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={form.logo_url} alt="" style={{ height: 32, marginBottom: 28, objectFit: "contain" }} />
          )}

          {tela.tipo === "welcome" && schema.settings?.welcome && (
            <TelaDeAbertura
              titulo={recall(schema.settings.welcome.title)}
              descricao={recall(schema.settings.welcome.description)}
              rotulo={schema.settings.welcome.button_label ?? "Começar"}
              onComecar={() => avancar()}
              t={t}
              buttonFill={buttonFill}
            />
          )}

          {tela.tipo === "bloco" && blocoAtual && (
            <Pergunta
              bloco={blocoAtual}
              valor={answers[blocoAtual.ref]}
              erro={erro}
              recall={recall}
              t={t}
              buttonFill={buttonFill}
              erroCor={erroCor}
              rotuloAvancar={schema.settings?.rotulo_avancar}
              enviando={enviando}
              campoRef={campoRef}
              onResponder={(v, avancarJa) => responder(blocoAtual.ref, v, avancarJa)}
              onAvancar={() => avancar()}
              podeVoltar={Boolean(passoAnterior(schema, blocoAtual.ref, ctx)) || Boolean(schema.settings?.welcome)}
              onVoltar={voltar}
            />
          )}

          {tela.tipo === "fim" && (
            <TelaFinal
              ending={acharEnding(schema, tela.ending)}
              fallback={form.success_message}
              recall={recall}
              t={t}
              buttonFill={buttonFill}
            />
          )}

          {falhaEnvio && (
            <p
              role="alert"
              style={{ marginTop: 16, color: erroCor, fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}
            >
              <AlertCircle size={15} /> {falhaEnvio}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── telas ────────────────────────────────────

function TelaDeAbertura({
  titulo,
  descricao,
  rotulo,
  onComecar,
  t,
  buttonFill,
}: {
  titulo: string
  descricao: string
  rotulo: string
  onComecar: () => void
  t: ReturnType<typeof defaults>
  buttonFill: string
}) {
  return (
    <div>
      <h1 style={{ fontSize: Math.max(t.headingSize, 30), lineHeight: 1.2, fontWeight: 600, margin: 0 }}>{titulo}</h1>
      {descricao && (
        <p style={{ marginTop: 14, fontSize: t.fontSize + 3, opacity: 0.72, lineHeight: 1.6 }}>{descricao}</p>
      )}
      <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <BotaoPrincipal onClick={onComecar} t={t} fill={buttonFill}>
          {rotulo}
        </BotaoPrincipal>
        <DicaEnter t={t} />
      </div>
    </div>
  )
}

function TelaFinal({
  ending,
  fallback,
  recall,
  t,
  buttonFill,
}: {
  ending: ReturnType<typeof acharEnding>
  fallback: string | null
  recall: (s: string | null | undefined) => string
  t: ReturnType<typeof defaults>
  buttonFill: string
}) {
  const titulo = recall(ending?.title) || fallback || "Recebemos sua resposta."
  const descricao = recall(ending?.description)
  // O ✓ é o sinal de "deu certo". Num final que diz "ainda não é para
  // você", ele contradiz a própria frase — quem lê vê sucesso e texto de
  // recusa na mesma tela.
  const fora = Boolean(ending?.disqualified)
  return (
    <div>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: fora ? "rgba(127,127,127,0.18)" : buttonFill,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 22,
        }}
      >
        {fora ? (
          <Info size={21} color={t.text} strokeWidth={2} opacity={0.75} />
        ) : (
          <Check size={22} color={t.buttonTextColor} strokeWidth={2.5} />
        )}
      </div>
      <h1 style={{ fontSize: Math.max(t.headingSize, 28), lineHeight: 1.25, fontWeight: 600, margin: 0 }}>{titulo}</h1>
      {descricao && (
        <p style={{ marginTop: 14, fontSize: t.fontSize + 3, opacity: 0.72, lineHeight: 1.6 }}>{descricao}</p>
      )}
      {ending?.button_label && ending.button_url && (
        <a
          href={ending.button_url}
          style={{
            display: "inline-block",
            marginTop: 28,
            padding: "13px 26px",
            borderRadius: t.buttonRadius,
            background: buttonFill,
            color: t.buttonTextColor,
            fontWeight: 600,
            fontSize: t.fontSize + 1,
            textDecoration: "none",
          }}
        >
          {ending.button_label}
        </a>
      )}
    </div>
  )
}

// ──────────────────────────── a pergunta ────────────────────────────────

function Pergunta({
  bloco,
  valor,
  erro,
  recall,
  t,
  buttonFill,
  erroCor,
  rotuloAvancar,
  enviando,
  campoRef,
  onResponder,
  onAvancar,
  podeVoltar,
  onVoltar,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  erro: string | null
  recall: (s: string | null | undefined) => string
  t: ReturnType<typeof defaults>
  buttonFill: string
  erroCor: string
  rotuloAvancar?: string
  enviando: boolean
  campoRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onResponder: (v: FormAnswers[string], avancarJa?: boolean) => void
  onAvancar: () => void
  podeVoltar: boolean
  onVoltar: () => void
}) {
  const escolha = TIPOS_DE_ESCOLHA.has(bloco.type)
  const semResposta = TIPOS_SEM_RESPOSTA.has(bloco.type)
  const idErro = `erro-${bloco.ref}`

  return (
    <div>
      <label
        htmlFor={`campo-${bloco.ref}`}
        style={{ display: "block", fontSize: Math.max(t.headingSize - 4, 22), lineHeight: 1.3, fontWeight: 500 }}
      >
        {recall(bloco.label)}
        {/*
          Sem asterisco de obrigatório: num conversacional quase toda
          pergunta é obrigatória, então o `*` em todas não informa nada e
          cola no ponto de interrogação ("diagnóstico?*"). O que a pessoa
          precisa saber é o contrário — qual ela pode pular.
        */}
        {!bloco.required && !semResposta && (
          <span style={{ marginLeft: 8, fontSize: t.fontSize, opacity: 0.45, fontWeight: 400 }}>
            (opcional)
          </span>
        )}
      </label>

      {bloco.description && (
        <p style={{ marginTop: 10, fontSize: t.fontSize + 1, opacity: 0.6, lineHeight: 1.55 }}>
          {recall(bloco.description)}
        </p>
      )}

      <div style={{ marginTop: 26 }}>
        {escolha ? (
          <Opcoes
            bloco={bloco}
            valor={valor}
            t={t}
            onEscolher={onResponder}
            descrito={erro ? idErro : undefined}
          />
        ) : semResposta ? null : (
          <CampoLivre
            bloco={bloco}
            valor={valor}
            t={t}
            campoRef={campoRef}
            onChange={(v) => onResponder(v)}
            descrito={erro ? idErro : undefined}
          />
        )}
      </div>

      <div id={idErro} role="alert" aria-live="polite" style={{ minHeight: erro ? undefined : 0 }}>
        {erro && (
          <p style={{ marginTop: 12, color: erroCor, fontSize: t.fontSize, display: "flex", gap: 6, alignItems: "center" }}>
            <AlertCircle size={15} /> {erro}
          </p>
        )}
      </div>

      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <BotaoPrincipal onClick={onAvancar} t={t} fill={buttonFill} carregando={enviando}>
          {rotuloAvancar ?? "OK"}
        </BotaoPrincipal>
        <DicaEnter t={t} />
        {podeVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            aria-label="Voltar para a pergunta anterior"
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              color: t.text,
              opacity: 0.5,
              fontSize: t.fontSize - 1,
              cursor: "pointer",
              padding: 6,
            }}
          >
            <ArrowUp size={13} />
            <span className="cfy-voltar-texto">Voltar</span>
          </button>
        )}
      </div>
    </div>
  )
}

function Opcoes({
  bloco,
  valor,
  t,
  onEscolher,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  onEscolher: (v: FormAnswers[string], avancarJa?: boolean) => void
  descrito?: string
}) {
  const multipla = bloco.type === "multi_select"
  const selecionados: string[] = multipla
    ? Array.isArray(valor)
      ? (valor as string[])
      : []
    : typeof valor === "string" && valor
      ? [valor]
      : []

  return (
    <div
      role={multipla ? "group" : "radiogroup"}
      aria-labelledby={`campo-${bloco.ref}`}
      aria-describedby={descrito}
      style={{ display: "grid", gap: 9 }}
    >
      {(bloco.options ?? []).map((o, i) => {
        const ativo = selecionados.includes(o.value)
        const letra = atalhoDaOpcao(i, o.atalho)
        return (
          <button
            key={o.value + i}
            type="button"
            role={multipla ? "checkbox" : "radio"}
            aria-checked={ativo}
            onClick={() => {
              if (multipla) {
                onEscolher(ativo ? selecionados.filter((x) => x !== o.value) : [...selecionados, o.value])
              } else {
                onEscolher(o.value, true)
              }
            }}
            className="cfy-opcao"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "left",
              padding: "13px 15px",
              borderRadius: t.inputRadius,
              border: `1.5px solid ${ativo ? t.primary : t.inputBorder}`,
              background: ativo ? tintar(t.primary) : t.inputBg,
              color: t.inputText,
              fontSize: t.fontSize + 2,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "border-color 140ms, background 140ms",
            }}
          >
            {letra && (
              <span
                aria-hidden
                style={{
                  flex: "0 0 auto",
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: `1px solid ${ativo ? t.primary : t.inputBorder}`,
                  color: ativo ? t.primary : "currentColor",
                  opacity: ativo ? 1 : 0.55,
                  fontSize: 11,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {letra}
              </span>
            )}
            <span style={{ flex: 1 }}>{o.label}</span>
            {ativo && <Check size={16} color={t.primary} />}
          </button>
        )
      })}
    </div>
  )
}

function CampoLivre({
  bloco,
  valor,
  t,
  campoRef,
  onChange,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  campoRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onChange: (v: FormAnswers[string]) => void
  descrito?: string
}) {
  const estilo: React.CSSProperties = {
    width: "100%",
    padding: "12px 2px",
    background: "transparent",
    border: "none",
    borderBottom: `2px solid ${t.inputBorder}`,
    color: t.inputText,
    // 16px é o piso: abaixo disso o Safari do iPhone DÁ ZOOM ao focar, e
    // a página some de vista no meio do preenchimento.
    fontSize: Math.max(t.fontSize + 6, 18),
    fontFamily: "inherit",
    outline: "none",
  }

  if (bloco.type === "checkbox") {
    return (
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: t.fontSize + 2 }}>
        <input
          id={`campo-${bloco.ref}`}
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={descrito}
          style={{ accentColor: t.primary, marginTop: 4, width: 18, height: 18 }}
        />
        <span>{bloco.placeholder || "Concordo"}</span>
      </label>
    )
  }

  if (bloco.type === "textarea") {
    return (
      <textarea
        id={`campo-${bloco.ref}`}
        ref={(el) => {
          campoRef.current = el
        }}
        rows={3}
        value={String(valor ?? "")}
        placeholder={bloco.placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={descrito}
        className="cfy-campo"
        style={{ ...estilo, resize: "vertical", minHeight: 76 }}
      />
    )
  }

  const tipoHtml =
    bloco.type === "email"
      ? "email"
      : bloco.type === "number"
        ? "number"
        : bloco.type === "date"
          ? "date"
          : bloco.type === "url"
            ? "url"
            : bloco.type === "phone" || bloco.type === "cpf" || bloco.type === "cnpj" || bloco.type === "cep"
              ? "tel"
              : "text"

  return (
    <input
      id={`campo-${bloco.ref}`}
      ref={(el) => {
        campoRef.current = el
      }}
      type={tipoHtml}
      value={String(valor ?? "")}
      placeholder={bloco.placeholder ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-describedby={descrito}
      inputMode={tipoHtml === "tel" ? "tel" : tipoHtml === "number" ? "numeric" : undefined}
      autoComplete={autoCompletePara(bloco)}
      className="cfy-campo"
      style={estilo}
    />
  )
}

// ───────────────────────────── pedaços ──────────────────────────────────

function BotaoPrincipal({
  children,
  onClick,
  t,
  fill,
  carregando,
}: {
  children: React.ReactNode
  onClick: () => void
  t: ReturnType<typeof defaults>
  fill: string
  carregando?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 24px",
        borderRadius: t.buttonRadius,
        border: "none",
        background: fill,
        color: t.buttonTextColor,
        fontSize: t.fontSize + 2,
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: carregando ? "progress" : "pointer",
        opacity: carregando ? 0.75 : 1,
      }}
    >
      {carregando && <Loader2 size={15} className="cfy-girando" />}
      {children}
    </button>
  )
}

/** A dica some no celular: lá não há tecla Enter física para prometer. */
function DicaEnter({ t }: { t: ReturnType<typeof defaults> }) {
  return (
    <span
      className="cfy-dica"
      style={{ fontSize: t.fontSize - 2, opacity: 0.45, display: "inline-flex", alignItems: "center", gap: 5 }}
    >
      pressione <CornerDownLeft size={12} /> Enter
    </span>
  )
}

/** Duas tabelas de variáveis com o mesmo conteúdo. */
function mesmasVariaveis(
  a: Record<string, string | number>,
  b: Record<string, string | number>,
): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => a[k] === b[k])
}

function telaDoDestino(d: ReturnType<typeof primeiroBloco>): Tela {
  if (d.tipo === "bloco") return { tipo: "bloco", ref: d.ref }
  if (d.tipo === "fim") return { tipo: "fim", ending: d.ending }
  return { tipo: "fim", ending: null }
}

/**
 * Autofill do browser. Sem isto, o celular não oferece o email e o
 * telefone que a pessoa já tem salvos — e cada campo a mais digitado à
 * mão é gente que desiste.
 */
function autoCompletePara(b: FormBlock): string | undefined {
  if (b.map_to_lead_field === "email" || b.type === "email") return "email"
  if (b.map_to_lead_field === "phone" || b.type === "phone") return "tel"
  if (b.map_to_lead_field === "name") return "name"
  if (b.type === "url") return "url"
  if (b.type === "cep") return "postal-code"
  return undefined
}

/** Fundo suave da opção selecionada, a partir da cor da marca. */
function tintar(cor: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(cor.trim())
  if (!m) return "rgba(127,127,127,0.08)"
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.10)`
}

function cssDoEscopo(escopo: string, primaria: string): string {
  return `
.${escopo} * { box-sizing: border-box; }
.${escopo} .cfy-tela { animation: cfy-entra 340ms cubic-bezier(0.22, 1, 0.36, 1); }
.${escopo} .cfy-tras .cfy-tela, .${escopo}.cfy-tras .cfy-tela { animation-name: cfy-entra-tras; }
@keyframes cfy-entra { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes cfy-entra-tras { from { opacity: 0; transform: translateY(-18px); } to { opacity: 1; transform: none; } }
.${escopo} .cfy-campo:focus { border-bottom-color: ${primaria}; }
.${escopo} .cfy-campo::placeholder { opacity: 0.35; }
.${escopo} .cfy-opcao:hover { border-color: ${primaria}; }
.${escopo} .cfy-opcao:focus-visible, .${escopo} button:focus-visible { outline: 2px solid ${primaria}; outline-offset: 2px; }
.${escopo} .cfy-girando { animation: cfy-gira 900ms linear infinite; }
@keyframes cfy-gira { to { transform: rotate(360deg); } }
@media (pointer: coarse) { .${escopo} .cfy-dica { display: none; } }
.${escopo} .cfy-voltar-texto { font-size: inherit; }
@media (max-width: 420px) { .${escopo} .cfy-voltar-texto { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .${escopo} .cfy-tela { animation: none; }
  .${escopo} .cfy-girando { animation-duration: 2s; }
}
`
}
