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
 *
 * **Uma TELA pode ter várias perguntas.** É o primeiro passo pedindo
 * nome, email e telefone de uma vez. Três consequências que a tela é
 * obrigada a respeitar: o erro é POR CAMPO (um erro só, no rodapé,
 * não diz qual dos quatro está errado), o Enter anda de campo em campo
 * e só avança no último (avançar do primeiro faria o OK reprovar os
 * outros três que a pessoa ainda ia preencher), e a escolha única NÃO
 * avança sozinha — ela é uma pergunta entre outras, não a tela inteira.
 *
 * **A logo fica em todas as telas.** Ela ficava só na abertura e no
 * fim, ou seja, em nenhuma das telas onde a pessoa realmente está. Marca
 * ausente na hora de pedir telefone é onde ela mais faz falta.
 *
 * **A navegação mora no canto, e é `sticky`, nunca `fixed`.** Fixa, ela
 * flutuaria sobre o teclado virtual — o mesmo motivo que mantém o botão
 * de avançar dentro do fluxo.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Info,
  Loader2,
} from "lucide-react"
import type { FormAnswers, FormBlock, FormOption, FormSchema } from "@/types/forms-conversational"
import { TIPOS_DE_ESCOLHA, TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import {
  acharEnding,
  atalhoDaOpcao,
  blocosDaTela,
  calcularProgresso,
  inicioDaTela,
  opcoesDoBloco,
  podarRespostasDependentes,
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
import {
  mascaraDeTelefone,
  paisSugeridoPeloNavegador,
  partesDoTelefone,
  telefoneCanonico,
  PAISES_DE_TELEFONE,
  PLACEHOLDERS_DE_TELEFONE,
} from "@/lib/forms/telefone"
import { alturaDaLogo, logoDoFormulario } from "@/lib/forms/logo"
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
  /**
   * O palco não é a janela.
   *
   * No formulário público a tela É a viewport, e `100dvh` é o que faz a
   * pergunta ficar centrada. Dentro da moldura do editor a mesma medida
   * se refere à janela do admin, não ao retângulo do preview: a pergunta
   * sairia empurrada para fora do quadro e o preview mostraria outra
   * coisa que não o formulário.
   */
  moldura?: boolean
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
  moldura = false,
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
  // Um erro por CAMPO. Com quatro perguntas na mesma tela, "campo
  // obrigatório" solto no rodapé não diz qual delas — e a pessoa fica
  // conferindo as quatro.
  const [erros, setErros] = useState<Record<string, string>>({})
  const [direcao, setDirecao] = useState<"frente" | "tras">("frente")
  const [enviando, setEnviando] = useState(false)
  const [falhaEnvio, setFalhaEnvio] = useState<string | null>(null)
  const [progressoVisto, setProgressoVisto] = useState(0)

  const entradaEm = useRef<number>(Date.now())

  /**
   * Os campos desenhados agora, por `ref`.
   *
   * Um `ref` só não serve mais: a tela pode ter quatro campos, e é este
   * registro que permite focar o PRIMEIRO ao entrar, focar o primeiro
   * INVÁLIDO ao reprovar, e andar de um para o outro com Enter.
   */
  const campos = useRef(new Map<string, HTMLElement>())
  const registrar = useCallback((ref: string, el: HTMLElement | null) => {
    if (el) campos.current.set(ref, el)
    else campos.current.delete(ref)
  }, [])

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
    // O autosave grava a TELA, mas uma sessão aberta antes de alguém
    // agrupar as perguntas guarda o ref de um campo do meio: reabrir ali
    // mostraria o grupo pela metade. `inicioDaTela` devolve a cabeça.
    const existe = r.currentRef && schema.blocks.some((b) => b.ref === r.currentRef && !b.hidden)
    setTela(
      existe
        ? { tipo: "bloco", ref: inicioDaTela(schema, r.currentRef as string) }
        : telaDoDestino(primeiroBloco(schema)),
    )
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
  // A cor do placeholder é a do TEMA quando alguém a escolheu. Sem
  // isto, o controle existia na aba Estilo e não mexia em nada aqui —
  // o operador ajusta e nada muda, sem erro nenhum.
  const css = useMemo(
    () => cssDoEscopo(escopo, t.primary, form.theme?.inputPlaceholderColor),
    [escopo, t.primary, form.theme?.inputPlaceholderColor],
  )

  const blocoAtual: FormBlock | null = useMemo(() => {
    if (tela.tipo !== "bloco") return null
    return schema.blocks.find((b) => b.ref === tela.ref) ?? null
  }, [tela, schema.blocks])

  /**
   * As perguntas desta tela, na ordem. Quase sempre uma; várias quando
   * alguém agrupou (`mesma_tela`). Tudo o que decide comportamento —
   * validar, avançar, Enter, atalho de letra — lê DAQUI, e não de
   * `blocoAtual`: ler da cabeça faria os outros campos existirem só
   * visualmente.
   */
  const daTela: FormBlock[] = useMemo(() => {
    if (tela.tipo !== "bloco" || !blocoAtual) return []
    return blocosDaTela(schema, tela.ref)
  }, [tela, blocoAtual, schema])

  const agrupada = daTela.length > 1

  /**
   * A pergunta que está na tela sumiu do schema.
   *
   * No ar isso não acontece — a versão publicada é imutável e quem está
   * respondendo continua na que abriu. No preview do editor acontece o
   * tempo todo: basta apagar a pergunta que se está visualizando. Sem
   * este desvio a tela fica EM BRANCO, sem nada dizendo por quê.
   */
  useEffect(() => {
    if (tela.tipo !== "bloco" || blocoAtual) return
    setTela(telaDoDestino(primeiroBloco(schema)))
    setErros({})
  }, [tela.tipo, blocoAtual, schema])

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
      setErros({})
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
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          // A mensagem do servidor é a que diz o que fazer (campo que
          // faltou, muitos envios seguidos). Ela NÃO passa pelo `catch`:
          // lá o texto é "confira a conexão", que é o conselho errado
          // para os dois casos — e a conexão está funcionando, tanto que
          // a resposta chegou.
          const doServidor = typeof json?.error === "string" ? json.error : null
          setFalhaEnvio(doServidor || "Não conseguimos enviar agora. Tente de novo em instantes.")
          return
        }

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
        // Aqui só chega falha de REDE (o `fetch` nem respondeu). A
        // resposta NÃO é perdida: o estado continua na tela e o botão
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

      // Valida a TELA inteira e mostra TODOS os erros de uma vez. Parar
      // no primeiro faria a pessoa corrigir, apertar OK, descobrir o
      // segundo, corrigir, apertar OK — o formulário contando os erros
      // um por um em vez de dizer o que falta.
      const encontrados: Record<string, string> = {}
      for (const b of daTela) {
        const v = validarResposta(b, answersEfetivas[b.ref])
        if (!v.valido && v.erro) encontrados[b.ref] = v.erro
      }
      if (Object.keys(encontrados).length > 0) {
        setErros(encontrados)
        const primeiro = daTela.find((b) => encontrados[b.ref])
        if (primeiro) campos.current.get(primeiro.ref)?.focus()
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
    [tela, blocoAtual, daTela, answers, ocultos, variables, schema, sessao, irPara],
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
      setAnswers((a) => {
        // Trocar a região invalida o faturamento escolhido na moeda
        // anterior: sem podar, sobra uma resposta que a tela não mostra
        // como marcada e que o submit leria com o piso da moeda errada.
        const { answers: podado } = podarRespostasDependentes(schema, { ...a, [ref]: valor })
        return podado
      })
      // Some o erro DAQUELE campo. Limpar o mapa inteiro apagaria o aviso
      // dos outros três da tela, que continuam errados.
      setErros((e) => {
        if (!e[ref]) return e
        const novo = { ...e }
        delete novo[ref]
        return novo
      })
      // Escolha única avança sozinha só quando ela é a tela inteira. Numa
      // tela agrupada, clicar num rádio pularia por cima dos campos que a
      // pessoa ainda ia preencher.
      if (avancarJa && !agrupada) {
        // O respiro de 300ms existe para a seleção ficar visível. Sem
        // ele, a tela troca antes de o olho registrar o clique.
        window.setTimeout(() => avancar({ ref, valor }), 300)
      }
    },
    [avancar, agrupada, schema],
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
        // Numa tela agrupada o Enter é TAB: vai para o campo seguinte e
        // só avança no último. Avançar do primeiro faria o OK reprovar
        // os três campos que a pessoa ainda ia preencher — o formulário
        // brigando com quem preenche no teclado, que é justamente quem
        // usa Enter.
        if (agrupada && alvo) {
          const i = daTela.findIndex((b) => campos.current.get(b.ref) === alvo)
          const seguinte = i >= 0 ? daTela.slice(i + 1).find((b) => campos.current.has(b.ref)) : undefined
          if (seguinte) {
            campos.current.get(seguinte.ref)?.focus()
            return
          }
        }
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
      // Letra escolhe a opção — só quando a escolha é a tela inteira e o
      // foco está fora de um input. Numa tela agrupada, "e" digitado
      // fora do campo marcaria a opção E da única pergunta de escolha.
      if (
        !digitando &&
        !agrupada &&
        blocoAtual &&
        TIPOS_DE_ESCOLHA.has(blocoAtual.type) &&
        /^[a-z]$/i.test(e.key)
      ) {
        const opcoes = opcoesDoBloco(blocoAtual, { answers })
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
  }, [avancar, voltar, blocoAtual, daTela, agrupada, answers, responder, enviando])

  // Foco no PRIMEIRO campo ao trocar de tela — sem isso quem usa teclado
  // precisa dar Tab a cada pergunta. No celular NÃO focamos: abrir o
  // teclado virtual sozinho cobre a pergunta que a pessoa ainda não leu.
  useEffect(() => {
    if (tela.tipo !== "bloco") return
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return
    const id = window.setTimeout(() => {
      const primeiro = daTela.find((b) => campos.current.has(b.ref))
      if (primeiro) campos.current.get(primeiro.ref)?.focus()
    }, 120)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const logo = logoDoFormulario({
    logoUrl: form.logo_url,
    ocultar: form.theme?.hideLogo,
    modo: t.mode,
  })
  const podeVoltar =
    tela.tipo === "bloco" &&
    Boolean(blocoAtual) &&
    (Boolean(passoAnterior(schema, tela.ref, ctx)) || Boolean(schema.settings?.welcome))
  // O número da tela, não o da pergunta: um grupo de quatro campos é o
  // passo 1, e numerá-lo 1..4 diria que o formulário é quatro vezes mais
  // longo do que é.
  const numeroDaTela = tela.tipo === "bloco" ? calcularProgresso(schema, tela.ref, ctx).indice : 0

  return (
    <div
      className={escopo}
      style={{
        minHeight: moldura ? "100%" : "100dvh",
        height: moldura ? "100%" : undefined,
        // Dentro da moldura do editor quem rola é ESTE elemento (o admin
        // não rola por causa do preview). Sem isto, tela alta é cortada e
        // não há como chegar ao botão.
        overflowY: moldura ? "auto" : undefined,
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
          style={{ position: "sticky", top: 0, height: 4, background: "rgba(127,127,127,0.15)", zIndex: 3 }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressoVisto * 100)}
          aria-label="Progresso do formulário"
        >
          {/*
            Cresce por `scaleX`, não por `width`: animar largura força o
            navegador a refazer o layout a cada quadro, e a barra fica no
            topo de uma tela que acabou de trocar de conteúdo — é o pior
            momento possível para disputar o mesmo quadro.
          */}
          <div
            style={{
              height: "100%",
              width: "100%",
              transformOrigin: "left",
              transform: `scaleX(${progressoVisto})`,
              background: buttonFill,
              transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
      )}

      {/*
        A logo fica FORA da tela que troca: ela é da peça, não da
        pergunta. Dentro, ela entraria na animação e piscaria a cada
        avanço — e o olho lê isso como a página recarregando.
      */}
      {logo.url && (
        <header
          style={{
            padding: "18px 20px 0",
            flex: "0 0 auto",
            display: "flex",
            justifyContent: form.theme?.logoAlign === "center" ? "center" : "flex-start",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.url}
            alt={logo.daCasa ? "Convertfy" : form.name}
            style={{
              height: alturaDaLogo(form.theme?.logoHeight, "conversational"),
              width: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </header>
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
          padding: logo.url ? "28px 20px 24px" : "48px 20px 24px",
        }}
      >
        <div
          key={tela.tipo === "bloco" ? tela.ref : tela.tipo}
          className={`cfy-tela cfy-${direcao}`}
          style={{ width: "100%", maxWidth: Math.max(t.containerWidth, 560), margin: "auto 0" }}
        >
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
            <TelaDePerguntas
              blocos={daTela}
              numero={numeroDaTela}
              answers={answers}
              erros={erros}
              recall={recall}
              t={t}
              buttonFill={buttonFill}
              erroCor={erroCor}
              rotuloAvancar={schema.settings?.rotulo_avancar}
              enviando={enviando}
              registrar={registrar}
              onResponder={responder}
              onAvancar={() => avancar()}
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

      {/*
        `sticky`, nunca `fixed`: no iOS o teclado virtual não redimensiona
        a viewport, e um par de botões fixo ficaria flutuando por cima
        dele. Aqui eles fazem parte do fluxo — ficam colados no rodapé
        enquanto a tela cabe e rolam junto quando ela não cabe.
      */}
      {tela.tipo === "bloco" && (
        <NavegacaoDeCanto
          t={t}
          buttonFill={buttonFill}
          podeVoltar={podeVoltar}
          desabilitado={enviando}
          onVoltar={voltar}
          onAvancar={() => avancar()}
        />
      )}
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
        <p
          style={{
            marginTop: 14,
            fontSize: t.fontSize + 3,
            opacity: 0.72,
            lineHeight: 1.6,
            color: t.subtitleColor,
          }}
        >
          {descricao}
        </p>
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
        <p
          style={{
            marginTop: 14,
            fontSize: t.fontSize + 3,
            opacity: 0.72,
            lineHeight: 1.6,
            color: t.subtitleColor,
          }}
        >
          {descricao}
        </p>
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

// ──────────────────────────── a tela ────────────────────────────────────

/**
 * A tela: uma pergunta, ou várias que o operador agrupou.
 *
 * Com UMA, o rótulo é o título grande — a pergunta É a tela. Com várias,
 * o título da tela sobe (quando existe) e cada rótulo vira etiqueta de
 * campo: quatro títulos de 24px empilhados não são uma tela, são quatro
 * telas espremidas numa.
 */
function TelaDePerguntas({
  blocos,
  numero,
  answers,
  erros,
  recall,
  t,
  buttonFill,
  erroCor,
  rotuloAvancar,
  enviando,
  registrar,
  onResponder,
  onAvancar,
}: {
  blocos: FormBlock[]
  numero: number
  answers: FormAnswers
  erros: Record<string, string>
  recall: (s: string | null | undefined) => string
  t: ReturnType<typeof defaults>
  buttonFill: string
  erroCor: string
  rotuloAvancar?: string
  enviando: boolean
  registrar: (ref: string, el: HTMLElement | null) => void
  onResponder: (ref: string, v: FormAnswers[string], avancarJa?: boolean) => void
  onAvancar: () => void
}) {
  const agrupada = blocos.length > 1
  const cabeca = blocos[0]
  const titulo = agrupada ? recall(cabeca?.titulo_da_tela) : ""

  return (
    <div>
      {/*
        O número da tela, com a seta. Ele orienta ("estou na 2") e é o
        que dá à peça a cara de conversa em vez de página de cadastro —
        mas é discreto de propósito: o protagonista é a pergunta.
      */}
      {numero > 0 && (
        <div
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 14,
            fontSize: t.fontSize - 1,
            fontWeight: 600,
            color: t.primary,
            opacity: 0.9,
          }}
        >
          {numero}
          <ArrowRight size={12} strokeWidth={2.5} />
        </div>
      )}

      {agrupada && titulo && (
        <h2
          style={{
            margin: "0 0 26px",
            fontSize: Math.max(t.headingSize - 4, 22),
            lineHeight: 1.3,
            fontWeight: 500,
          }}
        >
          {titulo}
        </h2>
      )}

      {/*
        O respiro entre os campos da tela agrupada é o `fieldGap` do
        tema. Fixo em 22, o controle "Espaço entre campos" existia na aba
        Estilo e não mexia em nada aqui — o operador ajusta e nada muda,
        sem erro nenhum. O piso de 16 existe porque, colados, quatro
        campos com label viram um bloco só.
      */}
      <div style={{ display: "grid", gap: agrupada ? Math.max(16, t.fieldGap + 8) : 0 }}>
        {blocos.map((b) => (
          <UmaPergunta
            key={b.ref}
            bloco={b}
            opcoes={opcoesDoBloco(b, { answers })}
            agrupada={agrupada}
            valor={answers[b.ref]}
            erro={erros[b.ref] ?? null}
            recall={recall}
            t={t}
            erroCor={erroCor}
            registrar={registrar}
            onResponder={(v, avancarJa) => onResponder(b.ref, v, avancarJa)}
          />
        ))}
      </div>

      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <BotaoPrincipal onClick={onAvancar} t={t} fill={buttonFill} carregando={enviando}>
          {rotuloAvancar ?? "OK"}
        </BotaoPrincipal>
        <DicaEnter t={t} agrupada={agrupada} />
      </div>
    </div>
  )
}

function UmaPergunta({
  bloco,
  opcoes,
  agrupada,
  valor,
  erro,
  recall,
  t,
  erroCor,
  registrar,
  onResponder,
}: {
  bloco: FormBlock
  /** Já resolvidas: a pergunta de faturamento muda de moeda em tempo de
   * resposta, e derivar aqui faria o teclado e a tela discordarem. */
  opcoes: FormOption[]
  agrupada: boolean
  valor: FormAnswers[string]
  erro: string | null
  recall: (s: string | null | undefined) => string
  t: ReturnType<typeof defaults>
  erroCor: string
  registrar: (ref: string, el: HTMLElement | null) => void
  onResponder: (v: FormAnswers[string], avancarJa?: boolean) => void
}) {
  const escolha = TIPOS_DE_ESCOLHA.has(bloco.type)
  const semResposta = TIPOS_SEM_RESPOSTA.has(bloco.type)
  const idErro = `erro-${bloco.ref}`

  return (
    <div>
      <label
        htmlFor={`campo-${bloco.ref}`}
        style={{
          display: "block",
          fontSize: agrupada ? t.fontSize + 1 : Math.max(t.headingSize - 4, 22),
          lineHeight: agrupada ? 1.4 : 1.3,
          fontWeight: agrupada ? 500 : 500,
          opacity: agrupada ? 0.75 : 1,
        }}
      >
        {recall(bloco.label)}
        {/*
          Sem asterisco de obrigatório: num conversacional quase toda
          pergunta é obrigatória, então o `*` em todas não informa nada e
          cola no ponto de interrogação ("diagnóstico?*"). O que a pessoa
          precisa saber é o contrário — qual ela pode pular.
        */}
        {!bloco.required && !semResposta && (
          <span style={{ marginLeft: 8, fontSize: t.fontSize - 1, opacity: 0.6, fontWeight: 400 }}>
            (opcional)
          </span>
        )}
      </label>

      {bloco.description && (
        <p
          style={{
            marginTop: 8,
            fontSize: t.fontSize + (agrupada ? -1 : 1),
            opacity: 0.6,
            lineHeight: 1.55,
            color: t.subtitleColor,
          }}
        >
          {recall(bloco.description)}
        </p>
      )}

      <div style={{ marginTop: agrupada ? 8 : 26 }}>
        {escolha ? (
          <Opcoes
            bloco={bloco}
            opcoes={opcoes}
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
            registrar={registrar}
            erro={Boolean(erro)}
            erroCor={erroCor}
            onChange={(v) => onResponder(v)}
            descrito={erro ? idErro : undefined}
          />
        )}
      </div>

      <div id={idErro} role="alert" aria-live="polite">
        {erro && (
          <p style={{ marginTop: 8, color: erroCor, fontSize: t.fontSize, display: "flex", gap: 6, alignItems: "center" }}>
            <AlertCircle size={15} /> {erro}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Voltar e avançar no canto — o par de setas do Typeform.
 *
 * Existe porque a pessoa PERGUNTA como volta: o "Voltar" discreto ao
 * lado do OK era descoberto por quem já sabia que existia. Aqui o par
 * fica sempre no mesmo lugar, e o estado desabilitado diz onde ela está
 * (sem volta = começo do formulário).
 *
 * Não substitui o OK: o botão continua sendo o caminho principal e a
 * seta de baixo é o atalho de quem já entendeu o padrão.
 */
function NavegacaoDeCanto({
  t,
  buttonFill,
  podeVoltar,
  desabilitado,
  onVoltar,
  onAvancar,
}: {
  t: ReturnType<typeof defaults>
  buttonFill: string
  podeVoltar: boolean
  desabilitado: boolean
  onVoltar: () => void
  onAvancar: () => void
}) {
  const base: React.CSSProperties = {
    width: 34,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    color: t.buttonTextColor,
    background: buttonFill,
    cursor: "pointer",
    transition: "opacity 140ms",
  }
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        marginTop: "auto",
        alignSelf: "flex-end",
        display: "flex",
        gap: 2,
        padding: "0 16px 16px",
        zIndex: 2,
      }}
      className="cfy-nav"
    >
      <button
        type="button"
        onClick={onVoltar}
        disabled={!podeVoltar || desabilitado}
        aria-label="Voltar para a pergunta anterior"
        title="Voltar"
        style={{
          ...base,
          borderRadius: `${t.buttonRadius}px 0 0 ${t.buttonRadius}px`,
          opacity: podeVoltar && !desabilitado ? 0.9 : 0.35,
          cursor: podeVoltar && !desabilitado ? "pointer" : "not-allowed",
        }}
      >
        <ChevronUp size={16} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={onAvancar}
        disabled={desabilitado}
        aria-label="Ir para a próxima pergunta"
        title="Avançar"
        style={{
          ...base,
          borderRadius: `0 ${t.buttonRadius}px ${t.buttonRadius}px 0`,
          opacity: desabilitado ? 0.35 : 1,
        }}
      >
        <ChevronDown size={16} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function Opcoes({
  bloco,
  opcoes,
  valor,
  t,
  onEscolher,
  descrito,
}: {
  bloco: FormBlock
  opcoes: FormOption[]
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
      {opcoes.map((o, i) => {
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
  registrar,
  erro,
  erroCor,
  onChange,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  registrar: (ref: string, el: HTMLElement | null) => void
  erro?: boolean
  erroCor: string
  onChange: (v: FormAnswers[string]) => void
  descrito?: string
}) {
  const estilo: React.CSSProperties = {
    width: "100%",
    padding: "12px 2px",
    background: "transparent",
    border: "none",
    // A borda vermelha é o que aponta QUAL campo da tela reprovou. Só a
    // mensagem embaixo não basta quando há quatro mensagens possíveis.
    borderBottom: `2px solid ${erro ? erroCor : t.inputBorder}`,
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
          ref={(el) => registrar(bloco.ref, el)}
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
        ref={(el) => registrar(bloco.ref, el)}
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

  if (bloco.type === "phone") {
    return (
      <TelefoneComDDI
        bloco={bloco}
        valor={valor}
        t={t}
        estilo={estilo}
        registrar={registrar}
        onChange={onChange}
        descrito={descrito}
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
            : bloco.type === "cpf" || bloco.type === "cnpj" || bloco.type === "cep"
              ? "tel"
              : "text"

  return (
    <input
      id={`campo-${bloco.ref}`}
      ref={(el) => registrar(bloco.ref, el)}
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

/**
 * Telefone com DDI — a MESMA forma canônica do formato de página única.
 *
 * Sem o seletor, este campo mandava ao CRM o que a pessoa digitasse:
 * "11 99999-8888", sem país. O `ph` da CAPI é hasheado sobre o texto, e
 * telefone sem DDI não casa com ninguém — o mesmo formulário, no outro
 * formato, entregava um lead pior. A régua (máscara, DDI, canônico) vive
 * em `lib/forms/telefone`, e os dois renderizadores só desenham.
 */
function TelefoneComDDI({
  bloco,
  valor,
  t,
  estilo,
  registrar,
  onChange,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  estilo: React.CSSProperties
  registrar: (ref: string, el: HTMLElement | null) => void
  onChange: (v: FormAnswers[string]) => void
  descrito?: string
}) {
  // A resposta já gravada manda no estado inicial: é o que faz o link de
  // retomada reabrir o campo com o número separado do DDI, em vez de
  // "+5511…" dentro da caixa e o prefixo duplicado no segundo envio.
  const gravado = typeof valor === "string" ? valor : ""
  const inicial = useRef(
    gravado ? partesDoTelefone(gravado) : { country: paisSugeridoPeloNavegador(), numero: "" },
  )
  const [pais, setPais] = useState(inicial.current.country)
  const [numero, setNumero] = useState(inicial.current.numero)

  // O pai reseta o valor ao trocar de pergunta e ao voltar.
  useEffect(() => {
    if (gravado === "") setNumero("")
  }, [gravado])

  const aplicar = (p: string, n: string) => {
    setPais(p)
    setNumero(n)
    onChange(telefoneCanonico(p, n))
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
      <select
        aria-label="País"
        value={pais}
        onChange={(e) => aplicar(e.target.value, mascaraDeTelefone(e.target.value, numero))}
        className="cfy-campo"
        style={{ ...estilo, width: "auto", flex: "0 0 auto", cursor: "pointer" }}
      >
        {PAISES_DE_TELEFONE.map((c) => (
          <option key={c.code} value={c.code} style={{ background: t.bg, color: t.inputText }}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <input
        id={`campo-${bloco.ref}`}
        ref={(el) => registrar(bloco.ref, el)}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={numero}
        // A máscara do PAÍS vence a do cadastro. Com o seletor de DDI
        // ao lado, um placeholder fixo contradiz o que está selecionado:
        // "+1" com "(11) 99999-9999" manda digitar no formato de outro
        // país, e quem segue a máscara escreve um número que não existe.
        // O do cadastro fica como reserva para país fora da tabela.
        placeholder={PLACEHOLDERS_DE_TELEFONE[pais] || bloco.placeholder || "Telefone"}
        onChange={(e) => aplicar(pais, mascaraDeTelefone(pais, e.target.value))}
        aria-describedby={descrito}
        className="cfy-campo"
        style={{ ...estilo, flex: 1, minWidth: 0 }}
      />
    </div>
  )
}

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

/**
 * A dica some no celular: lá não há tecla Enter física para prometer.
 *
 * Numa tela agrupada ela muda de texto porque MUDA DE FUNÇÃO: ali o
 * Enter anda para o campo seguinte. Prometer "Enter avança" e ver o
 * cursor pular para a caixa de baixo é a dica mentindo.
 */
function DicaEnter({ t, agrupada }: { t: ReturnType<typeof defaults>; agrupada?: boolean }) {
  return (
    <span
      className="cfy-dica"
      style={{ fontSize: t.fontSize - 2, opacity: 0.45, display: "inline-flex", alignItems: "center", gap: 5 }}
    >
      {agrupada ? (
        <>
          <CornerDownLeft size={12} /> Enter passa ao campo seguinte
        </>
      ) : (
        <>
          pressione <CornerDownLeft size={12} /> Enter
        </>
      )}
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
  // Nome e sobrenome separados têm token PRÓPRIO no autofill. Com
  // "name" nos dois, o browser preenche o nome inteiro nas duas caixas —
  // ou não preenche nenhuma; e numa tela com quatro campos de contato é
  // aí que a pessoa desiste.
  if (b.map_to_lead_field === "first_name") return "given-name"
  if (b.map_to_lead_field === "last_name") return "family-name"
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

function cssDoEscopo(escopo: string, primaria: string, placeholder?: string): string {
  return `
.${escopo} * { box-sizing: border-box; }
.${escopo} .cfy-tela { animation: cfy-entra 340ms cubic-bezier(0.22, 1, 0.36, 1); }
.${escopo} .cfy-tras .cfy-tela, .${escopo}.cfy-tras .cfy-tela { animation-name: cfy-entra-tras; }
@keyframes cfy-entra { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes cfy-entra-tras { from { opacity: 0; transform: translateY(-18px); } to { opacity: 1; transform: none; } }
.${escopo} .cfy-campo:focus { border-bottom-color: ${primaria}; }
.${escopo} .cfy-campo::placeholder { ${
    placeholder ? `color: ${placeholder}; opacity: 1;` : "opacity: 0.35;"
  } }
.${escopo} .cfy-opcao:hover { border-color: ${primaria}; }
.${escopo} .cfy-opcao:focus-visible, .${escopo} button:focus-visible { outline: 2px solid ${primaria}; outline-offset: 2px; }
.${escopo} .cfy-girando { animation: cfy-gira 900ms linear infinite; }
@keyframes cfy-gira { to { transform: rotate(360deg); } }
@media (pointer: coarse) { .${escopo} .cfy-dica { display: none; } }
.${escopo} .cfy-nav button:hover:not(:disabled) { filter: brightness(1.08); }
@media (prefers-reduced-motion: reduce) {
  .${escopo} .cfy-tela { animation: none; }
  .${escopo} .cfy-girando { animation-duration: 2s; }
}
`
}
