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
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Info,
  Loader2,
  Star,
} from "lucide-react"
import type { FormAnswers, FormBlock, FormOption, FormSchema } from "@/types/forms-conversational"
import { TIPOS_DE_ESCOLHA, TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import type { MidiaDaTela } from "@/lib/forms/midia"
import {
  calcular,
  moedaDeclarada,
  moedaDoFormulario,
  variaveisDasRespostas,
} from "@/lib/forms/calculo"
import {
  acharBloco,
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
import { textosDoSistema } from "@/lib/forms/pontuacao"
import { aplicarRecall } from "@/lib/forms/recall"
import { ESPERA_DO_DESTINO_MS, montarDestino, type DestinoPronto } from "@/lib/forms/destino"
import {
  fireConversionPixels,
  fireFormStep,
  fireLeadParcial,
  matchingDoBrowser,
  useFormPixels,
  type FormTracking,
  type SubmitTracking,
} from "./form-pixels"
import { contatoCapturado } from "@/lib/forms/contato-capturado"
import { AgendaDoFinal, type CredenciaisDaSessao } from "./agenda-do-final"
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
  /**
   * Em que tela a PRÉVIA abre — o `ref` da pergunta escolhida na espinha
   * do editor.
   *
   * Existe só para o editor e só afeta o estado INICIAL: com o `key` do
   * componente mudando junto, selecionar uma pergunta remonta a prévia
   * já naquela tela. No formulário público a prop não é passada e o
   * começo continua sendo a abertura ou a primeira pergunta — o
   * comportamento de quem responde não muda em nada.
   */
  comecarEm?: string | null
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
  comecarEm = null,
  onSubmitFake,
}: ConversationalFormProps) {
  const t = defaults(form.theme ?? {})
  const bgFill = gradientCss(form.theme?.bgGradient) ?? t.bg
  const buttonFill = gradientCss(form.theme?.buttonGradient) ?? t.primary
  const escopo = `cfy-${useId().replace(/:/g, "")}`
  const erroCor = corDeErro(t.mode)

  const [answers, setAnswers] = useState<FormAnswers>({})
  const [variables, setVariables] = useState<Record<string, string | number>>({})
  const [tela, setTela] = useState<Tela>(() => {
    // A tela pedida pelo editor tem de EXISTIR no schema de agora: o
    // `ref` pode ter sido apagado entre a seleção e o render, e abrir a
    // prévia numa tela inexistente a deixaria em branco.
    if (comecarEm && acharBloco(schema, comecarEm)) return { tipo: "bloco", ref: comecarEm }
    return schema.settings?.welcome ? { tipo: "welcome" } : telaDoDestino(primeiroBloco(schema))
  })
  // Um erro por CAMPO. Com quatro perguntas na mesma tela, "campo
  // obrigatório" solto no rodapé não diz qual delas — e a pessoa fica
  // conferindo as quatro.
  const [erros, setErros] = useState<Record<string, string>>({})
  /** Os textos do sistema (aba Configurar), com os padrões preenchidos. */
  const textos = useMemo(() => textosDoSistema(schema.settings), [schema.settings])
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
   * O número da tela ("3 →" acima do título) e a mídia de FUNDO.
   *
   * O número é da TELA, não do bloco — uma tela agrupada conta uma. A
   * mídia com `layout: "fundo"` é da tela inteira (imagem cover + véu),
   * então sai do bloco e vai para o container.
   */
  const numeroDaTela = useMemo(() => {
    if (tela.tipo !== "bloco") return null
    let n = 0
    for (const b of schema.blocks) {
      if (b.hidden) continue
      if (n === 0 || !b.mesma_tela) n += 1
      if (b.ref === tela.ref) return n
    }
    return null
  }, [tela, schema.blocks])
  const midiaDeFundo = daTela[0]?.midia?.layout === "fundo" ? daTela[0].midia : null

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
  /**
   * A contagem de telas — `indice` e `total`, não só a fração.
   *
   * A barra usa a fração; o `FormStep` do pixel precisa dos dois
   * números, e recalculá-los num segundo lugar faria a tela e o evento
   * discordarem sobre onde a pessoa está.
   */
  const passoAtual = useMemo(() => {
    if (tela.tipo !== "bloco") return null
    return calcularProgresso(schema, tela.ref, ctx)
  }, [tela, schema, ctx])

  const progresso = useMemo(() => {
    if (tela.tipo === "fim") return 1
    if (tela.tipo === "welcome") return 0
    return passoAtual?.fracao ?? 0
  }, [tela.tipo, passoAtual])

  useEffect(() => {
    setProgressoVisto((p) => progressoMonotonico(p, progresso))
  }, [progresso])

  /**
   * `FormStep` — uma vez por tela, nunca a cada visita a ela.
   *
   * Voltar e avançar de novo não é um passo novo: contá-lo inflaria o
   * público de "chegou até a tela 9" com quem só corrigiu a resposta
   * anterior. O `Set` guarda os refs já disparados nesta visita.
   *
   * A função é opt-in por formulário e não faz nada no preview.
   */
  const passosDisparados = useRef(new Set<string>())
  useEffect(() => {
    if (preview || tela.tipo !== "bloco" || !passoAtual) return
    if (passosDisparados.current.has(tela.ref)) return
    passosDisparados.current.add(tela.ref)
    fireFormStep(form.tracking, {
      numero: passoAtual.indice,
      total: passoAtual.total,
      ref: tela.ref,
    })
  }, [tela, passoAtual, preview, form.tracking])

  /**
   * O `Lead` parcial — na hora em que o contato é capturado, não no fim.
   *
   * Quem deixou WhatsApp ou e-mail já é lead: o cron de abandono o
   * manda ao CRM assim. Sem este disparo a Meta só vê quem chega ao
   * fim de um formulário longo, e a campanha otimiza para terminar o
   * questionário em vez de para deixar contato.
   *
   * Espera o id da SESSÃO existir (ele chega assíncrono) e só então
   * marca como disparado — marcar antes faria o evento nunca sair, e o
   * `event_id` é justamente o que impede o parcial e o completo
   * virarem duas conversões.
   */
  const parcialDisparado = useRef(false)
  useEffect(() => {
    if (preview || parcialDisparado.current) return
    if (!sessao.sessionId) return
    if (!contatoCapturado(schema, answers)) return
    parcialDisparado.current = true
    fireLeadParcial(form.tracking, sessao.sessionId)
  }, [preview, sessao.sessionId, schema, answers, form.tracking])

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
            // O que a lógica acumulou — score, trilha. Vai como REGISTRO
            // para o card: é aqui que a engine roda, então o servidor não
            // tem como recalcular sozinho. Nada que valha dinheiro decide
            // por ele; quem decide é o schema publicado.
            variables,
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

        // O `destino` vence o `redirect_url`: quem configurou WhatsApp ou
        // Calendly quer a tela final (com o botão de reserva e o texto
        // pronto), não um salto cego para um endereço fixo. O tipo diz
        // isso; sem esta guarda o código diria o contrário.
        if (ending?.redirect_url && !ending.destino) {
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
        const v = validarResposta(b, answersEfetivas[b.ref], textos)
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

  /**
   * As variáveis que o texto enxerga: as da lógica de salto MAIS a conta.
   *
   * A conta é refeita a cada resposta, e não guardada: ela é derivada, e
   * derivado guardado é derivado que envelhece — voltar uma tela e trocar
   * o ticket deixaria a receita do parágrafo seguinte falando do ticket
   * anterior.
   *
   * A moeda é a que a lógica declarou (a regra da pergunta de mercado
   * grava `moeda`), senão a da região respondida numa pergunta de faixa
   * por moeda, senão o real — que é a moeda das faixas que o formulário
   * mostra por padrão, então a conta sai na mesma unidade que a pessoa
   * acabou de ler.
   */
  const variaveisComConta = useMemo(() => {
    const calculos = schema.settings?.calculos
    if (!calculos || calculos.length === 0) return variables
    const base: Record<string, number> = {}
    for (const [k, v] of Object.entries(variables)) {
      const n = typeof v === "number" ? v : Number(v)
      if (Number.isFinite(n)) base[k] = n
    }
    const numeros = { ...base, ...variaveisDasRespostas(schema.blocks, answers) }
    const moeda =
      moedaDeclarada(variables) ?? moedaDoFormulario(schema.blocks, answers) ?? "BRL"
    const { textos } = calcular(calculos, numeros, moeda)
    return { ...variables, ...textos }
  }, [schema, answers, variables])

  const recall = useCallback(
    (txt: string | null | undefined) =>
      aplicarRecall(txt, {
        answers,
        hidden: ocultos,
        variables: variaveisComConta,
        blocks: schema.blocks,
      }),
    [answers, ocultos, variaveisComConta, schema.blocks],
  )

  /**
   * O destino do final que está aberto — montado aqui porque só aqui
   * existem as respostas desta pessoa: é delas que saem o `{{nome}}` da
   * mensagem do WhatsApp e o pré-preenchimento do Calendly.
   *
   * `null` quando o final não tem destino, ou quando ele está
   * configurado pela metade. Nesse caso a tela final aparece como sempre
   * apareceu — configuração incompleta não pode custar o lead.
   */
  const destinoDoFim = useMemo<DestinoPronto | null>(() => {
    if (tela.tipo !== "fim") return null
    const ending = acharEnding(schema, tela.ending)
    return montarDestino(ending?.destino, {
      answers,
      hidden: ocultos,
      variables,
      blocks: schema.blocks,
      utm: contextoDaVisita,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, schema, answers, ocultos, variables, contextoDaVisita])

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
  return (
    <div
      className={escopo}
      lang={schema.locale || undefined}
      style={{
        minHeight: moldura ? "100%" : "100dvh",
        height: moldura ? "100%" : undefined,
        // Dentro da moldura do editor quem rola é ESTE elemento (o admin
        // não rola por causa do preview). Sem isto, tela alta é cortada e
        // não há como chegar ao botão.
        overflowY: moldura ? "auto" : undefined,
        // Mídia de fundo: a imagem cover, com o véu por cima para o
        // texto continuar legível — escuro no tema escuro, claro no claro.
        background: midiaDeFundo
          ? `linear-gradient(${t.mode === "dark" ? "rgba(5,8,16,.72), rgba(5,8,16,.72)" : "rgba(255,255,255,.78), rgba(255,255,255,.78)"}), url("${midiaDeFundo.url}") center / cover no-repeat, ${bgFill}`
          : bgFill,
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
              midia={schema.settings.welcome.midia}
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
              rotuloAvancar={textos.rotulo_avancar}
              dicaTeclado={textos.dica_teclado}
              enviando={enviando}
              registrar={registrar}
              onResponder={responder}
              onAvancar={() => avancar()}
            />
          )}

          {tela.tipo === "fim" && (
            <TelaFinal
              ending={acharEnding(schema, tela.ending)}
              destino={destinoDoFim}
              preview={preview}
              fallback={form.success_message}
              recall={recall}
              t={t}
              buttonFill={buttonFill}
              slug={slug}
              credenciais={sessao.credenciais}
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
      {/*
        O rodapé da casa, como no formato de página única — e pelo mesmo
        interruptor (`hidePoweredBy`). Antes só o clássico o tinha, então o
        toggle "Feito com Convertfy" da aba Design não mexia em nada aqui.
      */}
      {!form.theme?.hidePoweredBy && (
        <p
          style={{
            margin: 0,
            padding: "10px 20px 14px",
            fontSize: 10.5,
            opacity: 0.45,
            flex: "0 0 auto",
          }}
        >
          Feito com Convertfy
        </p>
      )}
    </div>
  )
}

// ───────────────────────────── telas ────────────────────────────────────

/**
 * A imagem ou o vídeo acima do título.
 *
 * Fica ACIMA porque é o que sustenta a frase que vem embaixo — o print
 * do dashboard antes da conta, o rosto antes do convite. Embaixo, ela
 * viraria ilustração de algo que a pessoa já leu e decidiu.
 *
 * Três decisões que só aparecem com mídia de verdade na tela:
 *
 * - **Altura máxima em `vh`**, não em pixels. Um print 3:4 num celular
 *   baixo empurraria a pergunta para fora da tela, e o formulário
 *   centraliza o bloco: a pessoa não teria como rolar até ela.
 * - **Vídeo com `playsInline`**: sem isso o iOS abre em tela cheia ao
 *   dar play, e quem volta perde o lugar no formulário.
 * - **`autoplay` implica `muted`**. O navegador recusa o play automático
 *   com som, e o vídeo ficaria parado no primeiro quadro — que é pior
 *   que não ter autoplay, porque parece defeito.
 */
function MidiaDaTela({
  midia,
  t,
  lateral,
  flutuante,
}: {
  midia: MidiaDaTela
  t: ReturnType<typeof defaults>
  /** Ao lado do texto (4:5, cantos 14, sombra). */
  lateral?: boolean
  /** Miniatura 160×120 acima do título. */
  flutuante?: boolean
}) {
  const moldura: React.CSSProperties = lateral
    ? {
        display: "block",
        width: "100%",
        aspectRatio: "4 / 5",
        objectFit: "cover",
        borderRadius: 14,
        boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
      }
    : flutuante
      ? {
          display: "block",
          width: 160,
          height: 120,
          objectFit: "cover",
          borderRadius: 12,
          marginBottom: 18,
        }
      : {
          display: "block",
          width: "100%",
          maxHeight: "34vh",
          objectFit: "contain",
          objectPosition: "left center",
          borderRadius: Math.min(t.inputRadius ?? 8, 12),
          marginBottom: 22,
        }

  if (midia.tipo === "video") {
    return (
      <video
        src={midia.url}
        poster={midia.poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        autoPlay={midia.autoplay === true}
        muted={midia.autoplay === true}
        style={moldura}
      />
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={midia.url} alt={midia.alt ?? ""} style={moldura} loading="lazy" />
}

function TelaDeAbertura({
  titulo,
  descricao,
  rotulo,
  midia,
  onComecar,
  t,
  buttonFill,
}: {
  titulo: string
  descricao: string
  rotulo: string
  midia?: MidiaDaTela | null
  onComecar: () => void
  t: ReturnType<typeof defaults>
  buttonFill: string
}) {
  return (
    <div>
      {midia && <MidiaDaTela midia={midia} t={t} />}
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
  destino,
  preview,
  fallback,
  recall,
  t,
  buttonFill,
  slug,
  credenciais,
}: {
  ending: ReturnType<typeof acharEnding>
  destino: DestinoPronto | null
  preview: boolean
  fallback: string | null
  recall: (s: string | null | undefined) => string
  t: ReturnType<typeof defaults>
  buttonFill: string
  slug: string
  credenciais: () => CredenciaisDaSessao
}) {
  const titulo = recall(ending?.title) || fallback || "Recebemos sua resposta."
  const descricao = recall(ending?.description)
  // O ✓ é o sinal de "deu certo". Num final que diz "ainda não é para
  // você", ele contradiz a própria frase — quem lê vê sucesso e texto de
  // recusa na mesma tela.
  const fora = Boolean(ending?.disqualified)

  // O automático espera um instante (ver `ESPERA_DO_DESTINO_MS`) e o
  // botão fica na tela nos dois casos — é o que salva quem foi bloqueado.
  //
  // Na PRÉVIA ele não navega: o formulário é renderizado dentro do
  // editor, na mesma janela, então mandar o operador para o WhatsApp
  // levaria junto o rascunho que ele ainda não salvou. O botão continua
  // clicável, que é o que se quer conferir ali.
  useEffect(() => {
    if (preview || !destino?.automatico) return
    const id = window.setTimeout(() => {
      window.location.href = destino.url
    }, ESPERA_DO_DESTINO_MS)
    return () => window.clearTimeout(id)
  }, [destino, preview])

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
      {/*
        A agenda é o próprio desfecho, não um link para ele. Ela vem
        DEPOIS do texto porque a frase de aprovação é o que faz a pessoa
        querer escolher o horário; antes dele, o seletor seria um
        calendário sem motivo.
      */}
      {ending?.destino?.tipo === "agenda" && (
        <AgendaDoFinal
          slug={slug}
          credenciais={credenciais}
          preview={preview}
          t={t}
          buttonFill={buttonFill}
        />
      )}

      {(() => {
        // O destino VENCE o botão legado: ele carrega o dado de quem
        // respondeu (o texto do WhatsApp, o pré-preenchimento do
        // Calendly), enquanto o `button_url` é um endereço fixo. Dois
        // botões na mesma tela dividiriam o clique que a tela existe
        // para produzir.
        const href = destino?.url ?? ending?.button_url ?? null
        const texto = destino?.rotulo ?? ending?.button_label ?? null
        if (!href || !texto) return null
        return (
          <>
            <a
              href={href}
              // O WhatsApp abre no app; sair da aba do formulário no
              // celular é o comportamento certo — voltar não tem para
              // onde, a resposta já foi enviada.
              rel="noopener noreferrer"
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
              {texto}
            </a>
            {destino?.automatico && (
              <p style={{ marginTop: 12, fontSize: t.fontSize - 1, opacity: 0.6, color: t.subtitleColor }}>
                {preview
                  ? "No ar, esta tela leva sozinha em ~1s. Na prévia, não."
                  : destino.tipo === "whatsapp"
                    ? "Abrindo o WhatsApp… se não abrir sozinho, toque no botão."
                    : "Levando para a agenda… se não abrir sozinho, toque no botão."}
              </p>
            )}
          </>
        )
      })()}
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
  dicaTeclado,
  enviando,
  registrar,
  onResponder,
  onAvancar,
}: {
  blocos: FormBlock[]
  /** O número da tela — o "3 →" acima do título. */
  numero: number | null
  answers: FormAnswers
  erros: Record<string, string>
  recall: (s: string | null | undefined) => string
  t: ReturnType<typeof defaults>
  buttonFill: string
  erroCor: string
  rotuloAvancar?: string
  dicaTeclado?: string
  enviando: boolean
  registrar: (ref: string, el: HTMLElement | null) => void
  onResponder: (ref: string, v: FormAnswers[string], avancarJa?: boolean) => void
  onAvancar: () => void
}) {
  const agrupada = blocos.length > 1
  const cabeca = blocos[0]
  const titulo = agrupada ? recall(cabeca?.titulo_da_tela) : ""
  // A mídia é da TELA, e a tela é a cabeça: numa tela agrupada, uma
  // imagem por campo empilharia quatro prints acima de quatro perguntas.
  // `fundo` é desenhado pelo container, não aqui.
  const midia = cabeca?.midia && cabeca.midia.layout !== "fundo" ? cabeca.midia : null
  const layout = midia?.layout ?? "acima"

  const conteudo = (
    <div>
      {numero !== null && (
        <p
          aria-hidden
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            fontWeight: 600,
            color: t.primary,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {numero} <span style={{ opacity: 0.7 }}>→</span>
        </p>
      )}
      {midia && layout === "flutuante" && <MidiaDaTela midia={midia} t={t} flutuante />}
      {midia && layout === "acima" && <MidiaDaTela midia={midia} t={t} />}
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
        <DicaEnter t={t} agrupada={agrupada} texto={dicaTeclado} />
      </div>
    </div>
  )

  if (midia && layout === "direita") {
    // Grid `1fr | 38%`, como no handoff; empilha no celular (a classe
    // `cfy-lado` vira coluna única abaixo de 640px, via CSS do escopo).
    return (
      <div className="cfy-lado" style={{ display: "grid", gridTemplateColumns: "1fr 38%", gap: 28, alignItems: "center" }}>
        {conteudo}
        <MidiaDaTela midia={midia} t={t} lateral />
      </div>
    )
  }
  return conteudo
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
            onChange={(v, avancarJa) => onResponder(v, avancarJa)}
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
  /**
   * `embaralhar`: a ordem muda por PESSOA, não por render — a semente
   * nasce com o componente e a lista só é rebaralhada quando as opções
   * mudam. Sem isso as opções trocariam de lugar a cada tecla.
   */
  const semente = useRef(Math.random())
  const lista = useMemo(
    () => (bloco.embaralhar ? embaralhar(opcoes, semente.current) : opcoes),
    [opcoes, bloco.embaralhar],
  )
  /** "Outro": a resposta é o TEXTO digitado, não a palavra "Outro". */
  const valoresDeclarados = useMemo(() => new Set(opcoes.map((o) => o.value)), [opcoes])
  const outroAtivo =
    Boolean(bloco.outro) &&
    !multipla &&
    typeof valor === "string" &&
    valor !== "" &&
    !valoresDeclarados.has(valor)
  const textoDoOutro = outroAtivo ? (valor === OUTRO_VAZIO ? "" : (valor as string)) : ""

  return (
    <div
      role={multipla ? "group" : "radiogroup"}
      aria-labelledby={`campo-${bloco.ref}`}
      aria-describedby={descrito}
      style={{ display: "grid", gap: 9 }}
    >
      {lista.map((o, i) => {
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
      {bloco.outro && !multipla && (
        <OpcaoOutro
          ativo={outroAtivo}
          texto={textoDoOutro}
          letra={atalhoDaOpcao(lista.length, undefined)}
          t={t}
          onAtivar={() => onEscolher(OUTRO_VAZIO)}
          onTexto={(txt) => onEscolher(txt === "" ? OUTRO_VAZIO : txt)}
          onConfirmar={() => {
            if (textoDoOutro.trim()) onEscolher(textoDoOutro, true)
          }}
        />
      )}
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
  onChange: (v: FormAnswers[string], avancarJa?: boolean) => void
  descrito?: string
}) {
  if (bloco.type === "yes_no") {
    return <SimNao bloco={bloco} valor={valor} t={t} registrar={registrar} onEscolher={onChange} descrito={descrito} />
  }
  if (bloco.type === "nps") {
    return <Escala010 bloco={bloco} valor={valor} t={t} registrar={registrar} onEscolher={onChange} descrito={descrito} />
  }
  if (bloco.type === "rating") {
    return <Estrelas bloco={bloco} valor={valor} t={t} registrar={registrar} onEscolher={onChange} descrito={descrito} />
  }
  if (bloco.type === "schedule") {
    return <Agendamento bloco={bloco} valor={valor} t={t} erro={erro} erroCor={erroCor} registrar={registrar} onChange={onChange} descrito={descrito} />
  }

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
      maxLength={bloco.validation?.maxLength}
      onChange={(e) => onChange(e.target.value)}
      aria-describedby={descrito}
      inputMode={tipoHtml === "tel" ? "tel" : tipoHtml === "number" ? "numeric" : undefined}
      autoComplete={autoCompletePara(bloco)}
      className="cfy-campo"
      style={estilo}
    />
  )
}

// ───────────────────────── os tipos do handoff ──────────────────────────

/** A opção "Outro" escolhida e ainda sem texto — não é resposta válida. */
const OUTRO_VAZIO = "\u200b"

/** Embaralha com semente fixa (Fisher–Yates sobre um LCG) — determinístico por sessão. */
function embaralhar<T>(lista: readonly T[], semente: number): T[] {
  const out = [...lista]
  let x = Math.floor(semente * 2147483647) || 1
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 48271) % 2147483647
    const j = x % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function OpcaoOutro({
  ativo,
  texto,
  letra,
  t,
  onAtivar,
  onTexto,
  onConfirmar,
}: {
  ativo: boolean
  texto: string
  letra: string | null
  t: ReturnType<typeof defaults>
  onAtivar: () => void
  onTexto: (v: string) => void
  onConfirmar: () => void
}) {
  return (
    <div
      role="radio"
      aria-checked={ativo}
      tabIndex={0}
      onClick={onAtivar}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          onAtivar()
        }
      }}
      className="cfy-opcao"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 15px",
        borderRadius: t.inputRadius,
        border: `1.5px solid ${ativo ? t.primary : t.inputBorder}`,
        background: ativo ? tintar(t.primary) : t.inputBg,
        color: t.inputText,
        fontSize: t.fontSize + 2,
        cursor: "pointer",
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
      {ativo ? (
        <input
          autoFocus
          type="text"
          value={texto}
          placeholder="Escreva aqui"
          aria-label="Outro — escreva sua resposta"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onConfirmar()
            }
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            borderBottom: `1.5px solid ${t.primary}`,
            color: t.inputText,
            fontSize: "inherit",
            fontFamily: "inherit",
            outline: "none",
            padding: "2px 0",
          }}
        />
      ) : (
        <span style={{ flex: 1 }}>Outro</span>
      )}
    </div>
  )
}

/** Sim / Não: dois cartões, teclas S e N. */
function SimNao({
  bloco,
  valor,
  t,
  registrar,
  onEscolher,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  registrar: (ref: string, el: HTMLElement | null) => void
  onEscolher: (v: FormAnswers[string], avancarJa?: boolean) => void
  descrito?: string
}) {
  const opcoes = [
    { value: "sim", label: "Sim", tecla: "S" },
    { value: "nao", label: "Não", tecla: "N" },
  ]
  return (
    <div
      role="radiogroup"
      aria-labelledby={`campo-${bloco.ref}`}
      aria-describedby={descrito}
      style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
      onKeyDown={(e) => {
        const k = e.key.toLowerCase()
        if (k === "s") onEscolher("sim", true)
        if (k === "n") onEscolher("nao", true)
      }}
    >
      {opcoes.map((o, i) => {
        const ativo = valor === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            id={i === 0 ? `campo-${bloco.ref}` : undefined}
            ref={i === 0 ? (el) => registrar(bloco.ref, el) : undefined}
            onClick={() => onEscolher(o.value, true)}
            className="cfy-opcao"
            style={{
              flex: "1 1 160px",
              maxWidth: 220,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 16px",
              borderRadius: t.inputRadius,
              border: `1.5px solid ${ativo ? t.primary : t.inputBorder}`,
              background: ativo ? tintar(t.primary) : t.inputBg,
              color: t.inputText,
              fontSize: t.fontSize + 3,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
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
              {o.tecla}
            </span>
            <span style={{ flex: 1, textAlign: "left" }}>{o.label}</span>
            {ativo && <Check size={16} color={t.primary} />}
          </button>
        )
      })}
    </div>
  )
}

/** Escala 0–10: onze células e os rótulos das pontas. */
function Escala010({
  bloco,
  valor,
  t,
  registrar,
  onEscolher,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  registrar: (ref: string, el: HTMLElement | null) => void
  onEscolher: (v: FormAnswers[string], avancarJa?: boolean) => void
  descrito?: string
}) {
  const atual = typeof valor === "string" ? valor : ""
  return (
    <div aria-describedby={descrito}>
      <div
        role="radiogroup"
        aria-labelledby={`campo-${bloco.ref}`}
        style={{ display: "grid", gridTemplateColumns: "repeat(11, minmax(0, 1fr))", gap: 6 }}
      >
        {Array.from({ length: 11 }, (_, n) => {
          const v = String(n)
          const ativo = atual === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={ativo}
              id={n === 0 ? `campo-${bloco.ref}` : undefined}
              ref={n === 0 ? (el) => registrar(bloco.ref, el) : undefined}
              onClick={() => onEscolher(v, true)}
              className="cfy-opcao"
              style={{
                height: 44,
                minWidth: 0,
                borderRadius: Math.min(t.inputRadius, 10),
                border: `1.5px solid ${ativo ? t.primary : t.inputBorder}`,
                background: ativo ? t.primary : t.inputBg,
                color: ativo ? "#fff" : t.inputText,
                fontSize: t.fontSize + 1,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "background 120ms, border-color 120ms",
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
      {(bloco.escala?.min_label || bloco.escala?.max_label) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontSize: t.fontSize - 2,
            opacity: 0.6,
          }}
        >
          <span>{bloco.escala?.min_label ?? ""}</span>
          <span>{bloco.escala?.max_label ?? ""}</span>
        </div>
      )}
    </div>
  )
}

/** Cinco estrelas; a resposta é "1"…"5". */
function Estrelas({
  bloco,
  valor,
  t,
  registrar,
  onEscolher,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  registrar: (ref: string, el: HTMLElement | null) => void
  onEscolher: (v: FormAnswers[string], avancarJa?: boolean) => void
  descrito?: string
}) {
  const [sobre, setSobre] = useState(0)
  const atual = typeof valor === "string" ? Number(valor) || 0 : 0
  const acesa = sobre || atual
  return (
    <div
      role="radiogroup"
      aria-labelledby={`campo-${bloco.ref}`}
      aria-describedby={descrito}
      style={{ display: "flex", gap: 6 }}
      onMouseLeave={() => setSobre(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={atual === n}
          aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
          id={n === 1 ? `campo-${bloco.ref}` : undefined}
          ref={n === 1 ? (el) => registrar(bloco.ref, el) : undefined}
          onMouseEnter={() => setSobre(n)}
          onClick={() => onEscolher(String(n), true)}
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: n <= acesa ? t.primary : t.inputBorder,
            cursor: "pointer",
            transition: "color 100ms, transform 100ms",
            transform: n <= sobre ? "scale(1.08)" : "none",
          }}
        >
          <Star size={36} fill={n <= acesa ? t.primary : "none"} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  )
}

const HORARIOS_DA_AGENDA = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"]

/**
 * Agendar reunião: dia + horário, resposta em ISO local.
 *
 * Os horários são uma grade fixa de horário comercial, não a agenda de
 * ninguém — a disponibilidade real fica com a `AgendaDoFinal`, que fala
 * com o Google Calendar. Este campo só colhe a PREFERÊNCIA; a tela diz
 * isso para a pessoa não sair achando que a reunião está marcada.
 */
function Agendamento({
  bloco,
  valor,
  t,
  erro,
  erroCor,
  registrar,
  onChange,
  descrito,
}: {
  bloco: FormBlock
  valor: FormAnswers[string]
  t: ReturnType<typeof defaults>
  erro?: boolean
  erroCor: string
  registrar: (ref: string, el: HTMLElement | null) => void
  onChange: (v: FormAnswers[string]) => void
  descrito?: string
}) {
  const atual = typeof valor === "string" ? valor : ""
  const [dia, hora] = atual.includes("T") ? [atual.slice(0, 10), atual.slice(11, 16)] : [atual, ""]
  const hoje = new Date().toISOString().slice(0, 10)
  const compor = (d: string, h: string) => (d && h ? `${d}T${h}:00` : d)
  return (
    <div aria-describedby={descrito}>
      <input
        id={`campo-${bloco.ref}`}
        ref={(el) => registrar(bloco.ref, el)}
        type="date"
        min={hoje}
        value={dia}
        onChange={(e) => onChange(compor(e.target.value, hora))}
        className="cfy-campo"
        style={{
          width: "100%",
          padding: "12px 2px",
          background: "transparent",
          border: "none",
          borderBottom: `2px solid ${erro ? erroCor : t.inputBorder}`,
          color: t.inputText,
          fontSize: Math.max(t.fontSize + 6, 18),
          fontFamily: "inherit",
          outline: "none",
          colorScheme: "light dark",
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {HORARIOS_DA_AGENDA.map((h) => {
          const ativo = hora === h
          return (
            <button
              key={h}
              type="button"
              aria-pressed={ativo}
              disabled={!dia}
              onClick={() => onChange(compor(dia, h))}
              className="cfy-opcao"
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: Math.min(t.inputRadius, 10),
                border: `1.5px solid ${ativo ? t.primary : t.inputBorder}`,
                background: ativo ? tintar(t.primary) : t.inputBg,
                color: t.inputText,
                fontSize: t.fontSize,
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
                cursor: dia ? "pointer" : "not-allowed",
                opacity: dia ? 1 : 0.5,
              }}
            >
              {h}
            </button>
          )
        })}
      </div>
      <p style={{ marginTop: 10, fontSize: t.fontSize - 2, opacity: 0.55 }}>
        É a sua preferência de horário — a confirmação vem pelo time.
      </p>
    </div>
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
function DicaEnter({
  t,
  agrupada,
  texto,
}: {
  t: ReturnType<typeof defaults>
  agrupada?: boolean
  /** O texto da aba Configurar; o padrão "pressione Enter" vira o desenho com o ícone. */
  texto?: string
}) {
  const proprio = texto && texto !== "pressione Enter" ? texto : null
  return (
    <span
      className="cfy-dica"
      style={{ fontSize: t.fontSize - 2, opacity: 0.45, display: "inline-flex", alignItems: "center", gap: 5 }}
    >
      {proprio ? (
        <>
          <CornerDownLeft size={12} /> {proprio}
        </>
      ) : agrupada ? (
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
@media (max-width: 640px) { .${escopo} .cfy-lado { grid-template-columns: 1fr !important; } }
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
