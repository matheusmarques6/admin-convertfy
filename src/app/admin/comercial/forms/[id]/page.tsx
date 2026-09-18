"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Copy as CopyIcon,
  CheckCircle2,
  Loader2,
  ExternalLink,
  FileText,
  Palette,
  ListChecks,
  BarChart3,
  Smartphone,
  Monitor,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Settings2,
  RotateCcw,
  MessagesSquare,
  Rows3,
  AlertTriangle,
} from "lucide-react"
import { ROUTES } from "@/lib/routes"
import { PublicFormView } from "@/components/forms/public-form-view"
import { QUALIFIED_OPERATORS, type QualifiedRule } from "@/types/form-tracking"
import { metaEventName, willRenameEvent } from "@/lib/tracking/meta-event-name"
import { ConversionDiagnostics } from "@/components/forms/conversion-diagnostics"
import { FormResults } from "@/components/forms/form-results"
import { FormPublishPanel } from "@/components/forms/form-publish-panel"
import { ConversationalFormView } from "@/components/forms/conversational-form-view"
import { FlowEditor } from "@/components/forms/flow-editor"
import { DestinoEditor } from "@/components/forms/destino-editor"
import { EditorEstrutura, type AlvoDoArrasto } from "@/components/forms/editor-estrutura"
import {
  montarEspinha,
  podarSelecao,
  selecaoDeReserva,
  telaDaPrevia,
  type Espinha,
  type Selecao,
} from "@/lib/forms/estrutura-do-editor"
import { normalizarDestino } from "@/lib/forms/destino"
import type { DestinoDoFinal } from "@/types/forms-conversational"
import { montarVersao } from "@/lib/forms/publicar"
import { remapearRefs } from "@/lib/forms/remapear-refs"
import { normalizarSchema } from "@/lib/forms/schema"
import { contarProblemas, diagnosticarFluxo } from "@/lib/forms/diagnostico-fluxo"
import { moverPergunta, telasDaSequencia, type Alvo } from "@/lib/forms/telas"
import {
  ALTURA_MAXIMA_DA_LOGO,
  ALTURA_MINIMA_DA_LOGO,
  ALTURA_PADRAO_DA_LOGO,
  alturaDaLogo,
  logoDoFormulario,
} from "@/lib/forms/logo"
import { gradientCss, type FormTheme as TemaDoFormulario } from "@/components/forms/form-theme"
import type { FormBlock, FormSchema } from "@/types/forms-conversational"

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineLite {
  id: string
  name: string
  color: string | null
  stages: Array<{ id: string; name: string; stage_type: string | null; position?: number }>
}

interface FormField {
  id?: string
  field_type: string
  label: string
  placeholder?: string | null
  description?: string | null
  required: boolean
  position: number
  options?: Array<string | { label: string; value: string }>
  validation?: Record<string, unknown>
  map_to_lead_field?: string | null
}

/**
 * O tema é o MESMO do renderizador público.
 *
 * Esta interface era uma cópia à mão, e a cópia já divergiu: o campo
 * `hideLogo` nasceu em `form-theme.ts` e o editor não o enxergava. Duas
 * declarações da mesma coisa divergem sempre — a pergunta é só quando.
 */
type FormTheme = TemaDoFormulario

/** Estado local da aba de rastreamento (pixels). */
interface TrackingState {
  meta_enabled: boolean
  meta_browser_pixel: boolean
  facebook_pixel_id: string
  /** Token digitado — so enviado no save quando nao-vazio. */
  meta_capi_token: string
  /** Vem do GET: se ja existe token salvo (nunca retornado em claro). */
  has_meta_capi_token: boolean
  meta_test_event_code: string
  google_enabled: boolean
  google_ads_id: string
  google_ads_conversion_label: string
  qualified_enabled: boolean
  qualified_event_name: string
  qualified_logic: "and" | "or"
  qualified_rules: QualifiedRule[]
}

const EMPTY_TRACKING: TrackingState = {
  meta_enabled: false,
  meta_browser_pixel: true,
  facebook_pixel_id: "",
  meta_capi_token: "",
  has_meta_capi_token: false,
  meta_test_event_code: "",
  google_enabled: false,
  google_ads_id: "",
  google_ads_conversion_label: "",
  qualified_enabled: false,
  qualified_event_name: "Lead qualificado",
  qualified_logic: "and",
  qualified_rules: [],
}

interface FormDetail {
  form: {
    id: string
    name: string
    slug: string
    description: string | null
    status: "draft" | "published" | "archived"
    /** Qual renderizador o público recebe. Muda no SALVAR, não no publicar versão. */
    display_mode?: "classic" | "conversational" | null
    theme: FormTheme
    pipeline_id: string | null
    stage_id: string | null
    success_message: string | null
    redirect_url: string | null
    settings?: Record<string, unknown> | null
    logo_url: string | null
    facebook_pixel_id: string | null
    google_ads_id: string | null
    google_analytics_id: string | null
    meta_test_event_code: string | null
    google_ads_conversion_label: string | null
    has_meta_capi_token: boolean
    tracking_config: {
      meta: { enabled: boolean; browser_pixel: boolean }
      google: { enabled: boolean }
      qualified_lead: {
        enabled: boolean
        event_name: string
        logic: "and" | "or"
        rules: QualifiedRule[]
      }
    }
  }
  fields: FormField[]
  /**
   * A camada que a tabela de campos não guarda: saltos, telas finais e
   * abertura. Vem do rascunho quando há um; da versão publicada quando
   * não há — senão abrir o editor de um formulário com lógica no ar
   * mostraria fluxo vazio, e o primeiro save a apagaria.
   */
  fluxo?: unknown
  fluxo_origem?: "rascunho" | "publicado" | "novo" | "indisponivel"
  versao_publicada?: number
  submissions: Array<{
    id: string
    status: string
    created_at: string
    lead_id: string | null
    deal_id: string | null
  }>
}

const FIELD_TYPES: Array<{ value: string; label: string }> = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone / WhatsApp" },
  { value: "number", label: "Número" },
  { value: "select", label: "Seleção (dropdown)" },
  { value: "radio", label: "Múltipla escolha (radio)" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Data" },
  { value: "url", label: "URL" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "cep", label: "CEP" },
]

const LEAD_FIELD_MAP: Array<{ value: string | ""; label: string }> = [
  { value: "", label: "Não mapear" },
  { value: "name", label: "Nome do lead" },
  { value: "first_name", label: "Nome (só o primeiro)" },
  { value: "last_name", label: "Sobrenome" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "company", label: "Empresa" },
  { value: "source", label: "Origem (source)" },
]


// Tabs
type TabKey = "criar" | "design" | "config" | "resultados"

/**
 * Quatro abas, e o critério é a PERGUNTA que cada uma responde.
 *
 * As oito antigas (Perguntas · Fluxo · Textos · Estilo · Destino ·
 * Anúncios · Resultados · Instalar) tinham todas o mesmo peso: a aba
 * onde se constrói o formulário pesava igual à de instalar, e três delas
 * — Perguntas, Fluxo e Textos — eram a mesma coisa, o que o visitante
 * vê, partida em três lugares que não se falavam.
 *
 * - **Criar**: o que o visitante vê e por onde ele anda. Perguntas,
 *   telas, desvios, abertura, finais e os textos públicos.
 * - **Design**: como ele vê. Tema, cores, logo.
 * - **Configurar**: o que acontece com a resposta e como o formulário
 *   chega até alguém. Pipeline, destino, anúncios, instalação.
 * - **Resultados**: o que aconteceu.
 */
const TABS: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: "criar", label: "Criar", icon: ListChecks },
  { key: "design", label: "Design", icon: Palette },
  { key: "config", label: "Configurar", icon: Settings2 },
  { key: "resultados", label: "Resultados", icon: BarChart3 },
]

// ────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────

export default function FormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  // Detecta se acessou via /admin/operacional ou /admin/comercial pra
  // que o link "Voltar" aponte pra listagem certa.
  const pathname = usePathname()
  const isCsArea = pathname?.startsWith("/admin/operacional") ?? false
  const formsListHref = isCsArea
    ? ROUTES.ADMIN.OPERACIONAL.FORMS
    : ROUTES.ADMIN.COMERCIAL.FORMS
  // revalidateOnFocus: false evita que SWR sobrescreva edicoes do user
  // quando ele troca de aba e volta. Idem dedupe alto pra nao refazer
  // requests enquanto digita.
  const { data, isLoading, mutate } = useSWR<FormDetail>(
    `/api/crm/forms/${id}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  )
  const { data: pipelinesData } = useSWR<{ pipelines: PipelineLite[] }>(
    "/api/crm/pipelines?scope=sales",
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const pipelines = pipelinesData?.pipelines ?? []

  // Custom fields da org — busca AMBOS lead e deal pra que o usuario
  // possa mapear formularios pra qualquer um. Forms criam leads
  // automaticamente, e se tiverem pipeline_id, criam deals tambem.
  // Mapear pra custom de lead grava em crm_leads.custom_fields[key];
  // mapear pra custom de deal grava em deals.custom_fields[key].
  const { data: leadCustomData } = useSWR<{
    fields: Array<{
      id: string
      key: string
      label: string
      field_type: string
    }>
  }>("/api/crm/custom-fields?entity=lead", fetcher)
  const { data: dealCustomData } = useSWR<{
    fields: Array<{
      id: string
      key: string
      label: string
      field_type: string
    }>
  }>("/api/crm/custom-fields?entity=deal", fetcher)
  const leadCustomFields = useMemo(
    () => leadCustomData?.fields ?? [],
    [leadCustomData],
  )
  const dealCustomFields = useMemo(
    () => dealCustomData?.fields ?? [],
    [dealCustomData],
  )

  // Estado dos campos editaveis
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [pipelineId, setPipelineId] = useState("")
  const [stageId, setStageId] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [displayMode, setDisplayMode] = useState<"classic" | "conversational">("classic")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [destinoQualificado, setDestinoQualificado] = useState<DestinoDoFinal | null>(null)
  const [theme, setTheme] = useState<FormTheme>({})
  /**
   * A logo do formulário. Vazia = a da Convertfy (é o padrão, e o que
   * as três linhas em produção têm hoje); `theme.hideLogo` = nenhuma.
   */
  const [logoUrl, setLogoUrl] = useState("")
  const [fields, setFields] = useState<FormField[]>([])
  const [tracking, setTracking] = useState<TrackingState>(EMPTY_TRACKING)

  /**
   * O rascunho do fluxo. Guarda só o que a tabela de campos não guarda
   * (saltos, finais, abertura); as perguntas continuam vindo de `fields`,
   * e é `montarVersao` que junta os dois — a MESMA função da publicação,
   * para que o preview não possa discordar do que vai ao ar.
   */
  const [rascunho, setRascunho] = useState<FormSchema | null>(null)

  const [activeTab, setActiveTab] = useState<TabKey>("criar")
  const [selecao, setSelecao] = useState<Selecao>(null)
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")
  // No mobile os 2 painéis (config + preview) não cabem lado a lado —
  // alterna entre eles com um segmented control. Ignorado no desktop (md+).
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor")
  // Fundo simulado do preview (pra testar como o form ficara em diferentes
  // P.V.s antes de embedar). 'auto' adapta ao mode do tema.
  const [previewBg, setPreviewBg] = useState<"auto" | "white" | "gray" | "dark" | "checker">("auto")
  /**
   * Remonta o preview conversacional do começo.
   *
   * Uma vez na tela final não existe "voltar" — é assim no ar, e tem de
   * ser assim aqui. Sem este botão, testar o segundo caminho do desvio
   * exigiria recarregar a página do editor e perder o que não foi salvo.
   */
  const [previewReset, setPreviewReset] = useState(0)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Hidrata o estado local SO UMA VEZ quando o data chega. Sem essa guard,
  // qualquer re-fetch SWR (foco, mutate, etc) sobrescreveria as edicoes do
  // user e ele perderia tudo que estava digitando.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!data || hydratedRef.current) return
    hydratedRef.current = true
    setName(data.form.name)
    setSlug(data.form.slug)
    setDescription(data.form.description ?? "")
    setPipelineId(data.form.pipeline_id ?? "")
    setStageId(data.form.stage_id ?? "")
    setSuccessMessage(data.form.success_message ?? "")
    setDisplayMode(
      data.form.display_mode === "conversational"
        ? "conversational"
        : "classic",
    )
    setRedirectUrl(data.form.redirect_url ?? "")
    setDestinoQualificado(
      normalizarDestino((data.form.settings as Record<string, unknown> | null)?.destino_qualificado),
    )
    setTheme(data.form.theme ?? {})
    setLogoUrl(data.form.logo_url ?? "")
    setFields(data.fields)
    // `indisponivel` = existe versão publicada e a leitura dela falhou.
    // Hidratar com schema vazio ali faria o save seguinte apagar os
    // saltos que estão no ar.
    setRascunho(
      data.fluxo_origem === "indisponivel" ? null : normalizarSchema(data.fluxo ?? null),
    )
    const tc = data.form.tracking_config
    setTracking({
      meta_enabled: tc?.meta?.enabled ?? false,
      meta_browser_pixel: tc?.meta?.browser_pixel ?? true,
      facebook_pixel_id: data.form.facebook_pixel_id ?? "",
      meta_capi_token: "",
      has_meta_capi_token: data.form.has_meta_capi_token ?? false,
      meta_test_event_code: data.form.meta_test_event_code ?? "",
      google_enabled: tc?.google?.enabled ?? false,
      google_ads_id: data.form.google_ads_id ?? "",
      google_ads_conversion_label: data.form.google_ads_conversion_label ?? "",
      qualified_enabled: tc?.qualified_lead?.enabled ?? false,
      qualified_event_name: tc?.qualified_lead?.event_name ?? "Lead qualificado",
      qualified_logic: tc?.qualified_lead?.logic ?? "and",
      qualified_rules: tc?.qualified_lead?.rules ?? [],
    })
  }, [data])

  const stagesForPipeline =
    pipelines.find((p) => p.id === pipelineId)?.stages ?? []

  /**
   * Cria a pergunta e a SELECIONA.
   *
   * Sem a seleção, clicar em "Pergunta" acrescentava uma linha no fim de
   * uma lista rolada e o painel continuava mostrando outra coisa — quem
   * acabou de pedir uma pergunta quer escrevê-la, não procurá-la.
   *
   * O endereço é `novo-<i>`, o mesmo provisório que `montarVersao` usa
   * para a pergunta ainda não salva.
   */
  const addField = () => {
    setFields((arr) => {
      const proximo = arr.length
      setSelecao({ tipo: "pergunta", ref: `novo-${proximo}` })
      return [
        ...arr,
        {
          field_type: "text",
          label: "",
          placeholder: "",
          required: false,
          position: proximo,
          map_to_lead_field: null,
        },
      ]
    })
  }
  const updateField = (idx: number, patch: Partial<FormField>) =>
    setFields((arr) => arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  const removeField = (idx: number) =>
    setFields((arr) =>
      arr.filter((_, i) => i !== idx).map((f, i) => ({ ...f, position: i })),
    )

  /**
   * O fluxo de hoje: as perguntas do editor mais a lógica do rascunho,
   * juntadas por `montarVersao` — a MESMA função que a publicação chama.
   *
   * Não é economia de código: é o que impede o preview de mostrar um
   * formulário e a publicação produzir outro. Uma segunda junção só para
   * a tela divergiria da primeira e a divergência apareceria como "no
   * preview a regra funciona e no ar não".
   *
   * Pergunta ainda sem `id` (criada e não salva) ganha um endereço
   * provisório `novo-<i>`; é o `temp_ref` que o PATCH troca pelo id real
   * depois de inserir a linha.
   */
  const montagem = useMemo(() => {
    const campos = fields.map((f, i) => ({
      id: f.id ?? `novo-${i}`,
      field_type: f.field_type,
      label: f.label,
      placeholder: f.placeholder ?? null,
      description: f.description ?? null,
      required: f.required,
      position: i,
      options: f.options ?? [],
      validation: f.validation ?? {},
      map_to_lead_field: f.map_to_lead_field ?? null,
    }))
    return montarVersao(campos, rascunho, {
      display_mode: displayMode,
      version: 0,
    })
  }, [fields, rascunho, displayMode])

  const fluxo = montagem.schema

  /**
   * A leitura da versão publicada falhou.
   *
   * Sem isto, o primeiro clique no construtor de fluxo tiraria `rascunho`
   * de `null` e o save seguinte gravaria por cima dos saltos que estão no
   * AR — exatamente o que o aviso vermelho promete que não acontece.
   */
  const fluxoIndisponivel = data?.fluxo_origem === "indisponivel"

  /**
   * Em que tela cada pergunta cai, e quantas dividem essa tela.
   *
   * O agrupamento mora no SCHEMA (`mesma_tela`), não em
   * `crm_form_fields` — a tabela não tem coluna para ele. Por isso a
   * lista de Perguntas lê daqui e escreve no rascunho, como a aba Fluxo.
   */
  const telaPorRef = useMemo(
    () =>
      telasDaSequencia(
        fluxo.blocks
          .filter((b) => !b.hidden)
          .map((b) => ({
            ref: b.ref,
            mesma_tela: b.mesma_tela,
            titulo_da_tela: b.titulo_da_tela,
          })),
      ),
    [fluxo],
  )

  /**
   * A espinha: a lista que a coluna da esquerda desenha, derivada do
   * FORMATO. Ela é a fonte de tudo o que a aba Criar mostra — o que o
   * formato não desenha não nasce aqui, então não há campo fantasma a
   * esconder com um `if` na UI.
   */
  const espinha = useMemo(
    () =>
      montarEspinha(
        fields.map((f, i) => ({
          ref: f.id ?? `novo-${i}`,
          label: f.label,
          field_type: f.field_type,
          required: f.required,
        })),
        fluxo,
        displayMode,
      ),
    [fields, fluxo, displayMode],
  )

  // A seleção pode ter deixado de existir (pergunta apagada, formato
  // trocado). Podar aqui, e não no clique, é o que impede o inspetor de
  // mostrar um item que já não está na lista.
  const selecaoAtiva = useMemo(
    () => podarSelecao(selecao, espinha, displayMode),
    [selecao, espinha, displayMode],
  )
  const refDaPrevia = useMemo(() => telaDaPrevia(selecaoAtiva, espinha), [selecaoAtiva, espinha])

  /**
   * Abre na primeira pergunta.
   *
   * O inspetor vazio dizendo "escolha um item" é um passo a mais antes
   * de qualquer trabalho, e quem abre o editor quase sempre vai mexer no
   * começo do formulário. Só roda uma vez, quando a espinha existe: um
   * `useState` inicial não serve porque os campos chegam por fetch.
   */
  const semeou = useRef(false)
  useEffect(() => {
    if (semeou.current || selecao !== null) return
    const reserva = selecaoDeReserva(espinha)
    if (!reserva) return
    semeou.current = true
    setSelecao(reserva)
  }, [espinha, selecao])

  /**
   * O arrasto: solta a pergunta sobre outra (entra na tela dela) ou na
   * faixa entre telas (vira cabeça de tela nova).
   *
   * Escreve nos DOIS lados porque o estado é partido: a ORDEM está em
   * `fields` (vira `position` no banco) e a FLAG está no rascunho do
   * schema. Aplicar num só deixaria a pergunta num lugar e o
   * agrupamento em outro — exatamente a divergência que o módulo puro
   * existe para impedir.
   */
  const arrastarPergunta = useCallback(
    (refArrastada: string, alvo: Alvo) => {
      if (fluxoIndisponivel) return
      const visiveis = fluxo.blocks.filter((b) => !b.hidden)
      const atual = visiveis.map((b) => ({
        ref: b.ref,
        mesma_tela: b.mesma_tela,
        titulo_da_tela: b.titulo_da_tela,
      }))
      const nova = moverPergunta(atual, refArrastada, alvo)
      // Mesma referência = o arrasto não moveu nada (soltou em si
      // mesma). Não grava rascunho nem marca o formulário como alterado.
      if (nova === atual) return

      const ordem = new Map(nova.map((p, i) => [p.ref, i]))
      setFields((arr) =>
        // O `ref` sai do ÍNDICE ORIGINAL (`novo-<i>` é posicional), então
        // é calculado antes de ordenar — reler depois daria o endereço
        // da posição nova e a pergunta ainda não salva se perderia.
        arr
          .map((f, i) => ({ f, pos: ordem.get(f.id ?? `novo-${i}`) ?? Number.MAX_SAFE_INTEGER }))
          .sort((a, b) => a.pos - b.pos)
          .map(({ f }, i) => ({ ...f, position: i })),
      )
      // Pergunta ainda não salva é endereçada por POSIÇÃO (`novo-2`), e
      // reordenar troca esse endereço. Sem o de/para, a flag e os saltos
      // ficariam apontando para o lugar onde ela ESTAVA — e a
      // publicação os descartaria em silêncio.
      const mapa: Record<string, string> = {}
      nova.forEach((p, i) => {
        if (p.ref.startsWith("novo-")) {
          const destino = `novo-${i}`
          if (destino !== p.ref) mapa[p.ref] = destino
        }
      })
      const refFinal = (ref: string) => mapa[ref] ?? ref

      setRascunho((atualRascunho) => {
        const rbase = remapearRefs(atualRascunho ?? fluxo, mapa)
        const porRef = new Map(nova.map((p) => [refFinal(p.ref), p]))
        return {
          ...rbase,
          blocks: rbase.blocks.map((b) => {
            const p = porRef.get(b.ref)
            if (!p) return b
            return {
              ...b,
              mesma_tela: p.mesma_tela ? true : undefined,
              titulo_da_tela: p.titulo_da_tela || undefined,
            }
          }),
        }
      })
    },
    [fluxo, fluxoIndisponivel],
  )

  /**
   * Liga ou desliga as faixas por moeda numa pergunta.
   *
   * Mora no rascunho pelo mesmo motivo do `mesma_tela`: é decisão de
   * SCHEMA e a tabela de campos não tem coluna para ela.
   */
  const faixasPorMoeda = useCallback(
    (ref: string, v: { ligado: boolean; moeda_de: string | null }) => {
      if (fluxoIndisponivel) return
      setRascunho((atual) => {
        const base = atual ?? fluxo
        return {
          ...base,
          blocks: base.blocks.map((b) =>
            b.ref === ref
              ? {
                  ...b,
                  opcoes_por_moeda: v.ligado ? true : undefined,
                  moeda_de: v.ligado ? (v.moeda_de ?? undefined) : undefined,
                }
              : b,
          ),
        }
      })
    },
    [fluxo, fluxoIndisponivel],
  )

  /**
   * Agrupa (ou desagrupa) uma pergunta, e nomeia a tela.
   *
   * Escreve no rascunho pelo `ref` — nunca por posição: reordenar a lista
   * deve levar o agrupamento junto com a pergunta, e não deixá-lo no
   * lugar onde ela estava.
   */
  const agruparPergunta = useCallback(
    (ref: string, patch: { mesma_tela?: boolean; titulo_da_tela?: string | null }) => {
      if (fluxoIndisponivel) return
      setRascunho((atual) => {
        const base = atual ?? fluxo
        return {
          ...base,
          blocks: base.blocks.map((b) =>
            b.ref === ref
              ? {
                  ...b,
                  ...(patch.mesma_tela === undefined
                    ? {}
                    : patch.mesma_tela
                      ? { mesma_tela: true }
                      : { mesma_tela: undefined }),
                  ...(patch.titulo_da_tela === undefined
                    ? {}
                    : { titulo_da_tela: patch.titulo_da_tela || undefined }),
                }
              : b,
          ),
        }
      })
    },
    [fluxo, fluxoIndisponivel],
  )

  /** Quantos desvios cada pergunta tem — o selo na lista de Perguntas. */
  const regrasPorRef = useMemo(() => {
    const out: Record<string, number> = {}
    for (const b of fluxo.blocks) out[b.ref] = (b.logic ?? []).length
    return out
  }, [fluxo])
  const problemasDoFluxo = useMemo(() => diagnosticarFluxo(fluxo), [fluxo])
  const contagemDoFluxo = contarProblemas(problemasDoFluxo)

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description: description || null,
          pipeline_id: pipelineId || null,
          stage_id: stageId || null,
          theme,
          logo_url: logoUrl.trim() || null,
          success_message: successMessage || null,
          redirect_url: redirectUrl || null,
          destino_qualificado: destinoQualificado,
          display_mode: displayMode,
          fields: fields.map((f, i) => ({
            ...f,
            position: i,
            // Só a pergunta nova precisa do endereço provisório — a que
            // já tem id já é endereçável.
            ...(f.id ? {} : { temp_ref: `novo-${i}` }),
          })),
          // Rascunho desconhecido (leitura da versão publicada falhou)
          // não vai ao banco: gravar um vazio apagaria o fluxo do ar.
          ...(rascunho === null || fluxoIndisponivel ? {} : { draft_schema: fluxo }),
          // Rastreamento (pixels). meta_capi_token so vai quando digitado.
          facebook_pixel_id: tracking.facebook_pixel_id || null,
          meta_test_event_code: tracking.meta_test_event_code || null,
          google_ads_id: tracking.google_ads_id || null,
          google_ads_conversion_label: tracking.google_ads_conversion_label || null,
          tracking_config: {
            meta: {
              enabled: tracking.meta_enabled,
              browser_pixel: tracking.meta_browser_pixel,
            },
            google: { enabled: tracking.google_enabled },
            qualified_lead: {
              enabled: tracking.qualified_enabled,
              event_name: tracking.qualified_event_name || "Lead qualificado",
              logic: tracking.qualified_logic,
              rules: tracking.qualified_rules,
            },
          },
          ...(tracking.meta_capi_token.trim()
            ? { meta_capi_token: tracking.meta_capi_token.trim() }
            : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao salvar")
        return
      }
      setSavedAt(new Date())
      /**
       * Adotar os ids devolvidos é o que impede a pergunta nova de trocar
       * de identidade a cada save: sem `id` no estado local, o save
       * seguinte a trataria como nova outra vez, ela seria apagada e
       * reinserida com OUTRO id, e a regra de rastreamento que aponta
       * para o id antigo pararia de casar sem nada acusar.
       */
      const ids: unknown = json.field_ids
      if (Array.isArray(ids) && ids.length === fields.length) {
        setFields((arr) =>
          arr.map((f, i) => (f.id ? f : { ...f, id: ids[i] as string })),
        )
      }
      if (rascunho !== null) {
        const mapa = (json.refs_remapeados ?? {}) as Record<string, string>
        setRascunho(Object.keys(mapa).length > 0 ? remapearRefs(fluxo, mapa) : fluxo)
      }
      // Reflete o token salvo sem revela-lo: limpa o input e marca "configurado".
      if (tracking.meta_capi_token.trim()) {
        setTracking((t) => ({ ...t, meta_capi_token: "", has_meta_capi_token: true }))
      }
      mutate()
    } finally {
      setSaving(false)
    }
  }, [id, name, slug, description, pipelineId, stageId, theme, logoUrl, successMessage, redirectUrl, destinoQualificado, displayMode, fields, fluxo, rascunho, fluxoIndisponivel, tracking, mutate])

  /**
   * Põe o formulário no ar ou tira.
   *
   * Tirar do ar é instantâneo e o endereço público passa a devolver 404
   * — com anúncio ligado, é verba caindo em página que não existe. Daí a
   * confirmação, que nomeia o endereço.
   */
  const togglePublish = async () => {
    if (!data) return
    const next = data.form.status === "published" ? "draft" : "published"
    if (
      next === "draft" &&
      !window.confirm(
        `Tirar "${data.form.name}" do ar? O endereço /forms/${data.form.slug} passa a devolver "não encontrado" na hora — se houver anúncio apontando para ele, a verba cai numa página inexistente.`,
      )
    ) {
      return
    }
    await fetch(`/api/crm/forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    mutate()
  }

  // Atalho Cmd/Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  // Payload do preview live (calculado do estado atual sem salvar).
  const previewPayload = useMemo(() => {
    return {
      form: {
        id: id,
        name,
        slug: slug || "preview",
        description: description || null,
        theme,
        logo_url: logoUrl || null,
        success_message: successMessage || null,
        redirect_url: redirectUrl || null,
        destino_qualificado: destinoQualificado,
      },
      fields: fields.map((f, i) => ({
        id: f.id ?? `temp-${i}`,
        field_type: f.field_type,
        label: f.label,
        placeholder: f.placeholder ?? null,
        description: f.description ?? null,
        required: f.required,
        position: i,
        options: f.options ?? [],
        validation: f.validation ?? {},
        map_to_lead_field: f.map_to_lead_field ?? null,
      })),
    }
  }, [id, name, slug, description, theme, logoUrl, successMessage, redirectUrl, destinoQualificado, fields])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Formulário não encontrado.
      </div>
    )
  }

  const status = data.form.status
  const modoSalvo: "classic" | "conversational" =
    data.form.display_mode === "conversational" ? "conversational" : "classic"
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/forms/${slug}`
      : `/forms/${slug}`

  /**
   * O vocabulário do arrasto da espinha traduzido para o do módulo puro.
   *
   * São dois nomes para a mesma coisa porque a espinha fala do que o
   * operador VÊ ("a faixa entre telas") e `moverPergunta` fala do que
   * acontece ("vira cabeça de tela nova"). A tradução mora aqui, num
   * lugar só.
   */
  const soltarPergunta = (ref: string, alvo: AlvoDoArrasto) =>
    arrastarPergunta(
      ref,
      alvo.tipo === "pergunta"
        ? { tipo: "pergunta", ref: alvo.ref }
        : { tipo: "nova_tela", antesDe: alvo.antesDe },
    )

  /** Cria um final e o seleciona — mesma razão do `addField`. */
  const adicionarFinal = () => {
    if (fluxoIndisponivel) return
    const existentes = fluxo.endings ?? []
    const usados = new Set(existentes.map((e) => e.ref))
    let ref = "final"
    for (let i = 2; usados.has(ref); i++) ref = `final-${i}`
    setRascunho({
      ...fluxo,
      endings: [
        ...existentes,
        {
          ref,
          title: existentes.length === 0 ? "Recebemos sua resposta." : "Obrigado!",
          description: null,
        },
      ],
    })
    setSelecao({ tipo: "final", ref })
  }

  // ────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────

  /**
   * A prévia é a MESMA peça em todas as abas que a mostram — montada uma
   * vez e posicionada pelo layout de cada uma. Dois blocos de preview
   * divergiriam no primeiro ajuste, e o sintoma seria o operador ver uma
   * coisa em Criar e outra em Design.
   */
  const palco = (
    <div
      className="h-full overflow-auto transition-colors"
      style={{
        background:
          previewBg === "auto"
            ? theme.mode === "dark"
              ? "#0B0F19"
              : "#F8FAFC"
            : previewBg === "white"
              ? "#FFFFFF"
              : previewBg === "gray"
                ? "#E5E7EB"
                : previewBg === "dark"
                  ? "#0B0F19"
                  : "repeating-conic-gradient(#D1D5DB 0% 25%, transparent 0% 50%) 0 0/16px 16px",
      }}
    >
      {displayMode === "conversational" ? (
        /**
         * O palco do conversacional é uma TELA, não um card: ele ocupa a
         * janela inteira no ar, e mostrá-lo encaixotado faria o preview
         * parecer outro produto.
         *
         * O schema é o `fluxo` — a saída da MESMA `montarVersao` que a
         * publicação chama —, então o que se navega aqui é o que vai ao
         * ar, incluindo os saltos. `comecarEm` entra no `key` porque é
         * estado INICIAL: sem remontar, escolher outra pergunta na
         * espinha não moveria a prévia.
         */
        <div className="flex min-h-full items-start justify-center p-4 md:p-6">
          <div
            className={
              "overflow-hidden transition-all duration-200 " +
              (previewMode === "mobile"
                ? "h-[700px] max-h-[calc(100dvh-11rem)] w-[380px] max-w-full rounded-[24px] border border-slate-300/40 shadow-[0_24px_48px_rgba(0,0,0,0.18)] dark:border-white/10"
                : "h-[calc(100dvh-11rem)] min-h-[480px] w-full max-w-[860px] rounded-[10px] shadow-[0_24px_48px_rgba(0,0,0,0.10)]")
            }
          >
            <ConversationalFormView
              key={`${previewMode}-${previewReset}-${refDaPrevia ?? ""}`}
              slug={slug || "preview"}
              schema={fluxo}
              comecarEm={refDaPrevia}
              form={{
                id,
                name,
                logo_url: logoUrl || null,
                theme,
                success_message: successMessage || null,
                redirect_url: redirectUrl || null,
              }}
              preview
              moldura
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-full items-start justify-center p-4 md:p-8">
          <div
            className={
              "transition-all duration-200 " +
              (previewMode === "mobile"
                ? "w-[380px] max-w-full overflow-hidden rounded-[24px] border border-slate-300/40 shadow-[0_24px_48px_rgba(0,0,0,0.18)] dark:border-white/10"
                : "w-full max-w-[680px] overflow-hidden rounded-[8px] shadow-[0_24px_48px_rgba(0,0,0,0.10)]")
            }
          >
            {/* Modo EMBED: é a forma que o formulário assume em qualquer
                landing, então é o que o operador precisa conferir. */}
            <PublicFormView
              slug={slug || "preview"}
              payload={previewPayload}
              utm={{
                utm_source: null,
                utm_medium: null,
                utm_campaign: null,
                utm_term: null,
                utm_content: null,
                gclid: null,
                fbclid: null,
              }}
              preview
              embed
            />
          </div>
        </div>
      )}
    </div>
  )

  const barraDoPalco = (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] bg-white px-3 dark:border-white/[0.08] dark:bg-[#0F1117]">
      <div className="flex min-w-0 items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-[6px] bg-slate-100 p-0.5 dark:bg-white/[0.05]">
          {(
            [
              { key: "desktop", label: "Computador", icon: Monitor },
              { key: "mobile", label: "Celular", icon: Smartphone },
            ] as const
          ).map((m) => {
            const active = previewMode === m.key
            const Icon = m.icon
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setPreviewMode(m.key)}
                title={m.label}
                className={
                  "inline-flex h-6 w-7 items-center justify-center rounded-[4px] transition-colors " +
                  (active
                    ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1A1D27] dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
                }
                aria-label={m.label}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>
        {displayMode === "conversational" && (
          <button
            type="button"
            onClick={() => setPreviewReset((n) => n + 1)}
            className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/[0.05] dark:hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Recomeçar
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/55 lg:inline">
          Fundo
        </span>
        <div className="inline-flex items-center gap-0.5 rounded-[6px] bg-slate-100 p-0.5 dark:bg-white/[0.05]">
          {(
            [
              { key: "auto", label: "Automático", swatch: null },
              { key: "white", label: "Claro", swatch: "#FFFFFF" },
              { key: "gray", label: "Cinza", swatch: "#E5E7EB" },
              { key: "dark", label: "Escuro", swatch: "#0B0F19" },
              { key: "checker", label: "Transparente", swatch: "checker" },
            ] as const
          ).map((b) => {
            const active = previewBg === b.key
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setPreviewBg(b.key)}
                title={b.label}
                aria-label={`Fundo ${b.label}`}
                aria-pressed={active}
                className={
                  "inline-flex h-6 items-center justify-center gap-1 rounded-[4px] px-1.5 transition-colors " +
                  (active
                    ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1A1D27] dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
                }
              >
                {b.swatch === "checker" ? (
                  <span
                    className="h-3 w-3 rounded-[2px] border border-slate-300 dark:border-white/15"
                    style={{
                      background:
                        "repeating-conic-gradient(#D1D5DB 0% 25%, transparent 0% 50%) 0 0/6px 6px",
                    }}
                    aria-hidden
                  />
                ) : b.swatch ? (
                  <span
                    className="h-3 w-3 rounded-[2px] border border-slate-300 dark:border-white/15"
                    style={{ background: b.swatch }}
                    aria-hidden
                  />
                ) : (
                  <span className="text-[10px] font-medium">Auto</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="relative -m-4 flex h-[calc(100dvh-1rem)] flex-col overflow-hidden bg-white md:-m-6 md:h-[calc(100dvh-1.5rem)] lg:-m-8 lg:h-[calc(100dvh-2rem)] dark:bg-[#0F1117]">
      {/* ─── TOPO: identidade, abas e ações ─── */}
      <header className="shrink-0 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link
            href={formsListHref}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white"
            aria-label="Voltar para a lista de formulários"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do formulário"
              aria-label="Nome do formulário"
              className="w-full truncate border-0 bg-transparent px-0 text-[15px] font-semibold leading-tight text-slate-900 outline-none focus:ring-0 dark:text-white"
            />
            <p className="truncate font-mono text-[10.5px] text-slate-500 dark:text-white/45">
              /forms/{slug || "..."}
            </p>
          </div>

          <FormatoDoFormulario
            modo={displayMode}
            modoSalvo={modoSalvo}
            noAr={status === "published"}
            onChange={setDisplayMode}
          />

          <div className="hidden h-5 w-px bg-black/[0.08] dark:bg-white/[0.10] lg:block" />

          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={status} />
            {status === "published" && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              onClick={togglePublish}
              className="h-7 rounded-[5px] border border-black/[0.10] px-2.5 text-[11.5px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]"
            >
              {status === "published" ? "Tirar do ar" : "Colocar no ar"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-7 items-center gap-1.5 rounded-[5px] bg-[#1F1F1F] px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Salvar
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4">
          <nav className="flex gap-0.5" aria-label="Seções do editor">
            {TABS.map((t) => {
              const active = activeTab === t.key
              const Icon = t.icon
              const alerta = t.key === "criar" && contagemDoFluxo.erros > 0
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12.5px] font-medium transition-colors " +
                    (active
                      ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                      : "border-transparent text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {alerta && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-red-500"
                      aria-label={`${contagemDoFluxo.erros} problemas no fluxo`}
                    />
                  )}
                </button>
              )
            })}
          </nav>
          <div className="hidden min-w-0 items-center gap-2 pb-1.5 text-[10.5px] text-slate-500 dark:text-white/45 md:flex">
            {error ? (
              <span className="truncate text-red-600 dark:text-red-400">{error}</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Salvo {savedAt.toLocaleTimeString("pt-BR")}
              </span>
            ) : (
              <span>Cmd/Ctrl + S salva</span>
            )}
          </div>
        </div>
      </header>

      {/* ─── CORPO ─── */}
      <div className="flex min-h-0 flex-1">
        {activeTab === "criar" && (
          <>
            {/* Coluna 1 — a espinha */}
            <div
              className={
                "min-h-0 w-full shrink-0 border-r border-black/[0.06] dark:border-white/[0.08] lg:w-[264px] " +
                (mobilePane === "editor" ? "block" : "hidden lg:block")
              }
            >
              <EditorEstrutura
                espinha={espinha}
                selecao={selecaoAtiva}
                modo={displayMode}
                problemas={contagemDoFluxo.erros}
                onSelecionar={setSelecao}
                onAdicionarPergunta={addField}
                onAdicionarFinal={adicionarFinal}
                onArrastar={soltarPergunta}
              />
            </div>

            {/* Coluna 2 — a prévia. Some antes das outras duas em tela
                estreita: é onde se CONFERE, e as outras são onde se
                trabalha. */}
            <div className="hidden min-w-0 flex-1 flex-col bg-slate-100 dark:bg-[#0A0B12] xl:flex">
              {barraDoPalco}
              {/* A publicação encostada no palco: a pergunta que ela
                  responde é sobre o que este preview mostra. */}
              <div className="shrink-0 border-b border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#0F1117]">
                <FormPublishPanel formId={id} modo={displayMode} />
              </div>
              <div className="min-h-0 flex-1">{palco}</div>
            </div>

            {/* Coluna 3 — o inspetor */}
            <div
              className={
                "min-h-0 w-full shrink-0 overflow-y-auto border-l border-black/[0.06] dark:border-white/[0.08] lg:w-[340px] " +
                (mobilePane === "preview" ? "block" : "hidden lg:block")
              }
            >
              <Inspetor
                selecao={selecaoAtiva}
                espinha={espinha}
                modo={displayMode}
                fluxo={fluxo}
                onFluxo={setRascunho}
                fields={fields}
                updateField={updateField}
                removeField={removeField}
                leadCustomFields={leadCustomFields}
                dealCustomFields={dealCustomFields}
                telaPorRef={telaPorRef}
                regrasPorRef={regrasPorRef}
                agruparPergunta={agruparPergunta}
                faixasPorMoeda={faixasPorMoeda}
                blocosDoFluxo={fluxo.blocks}
                theme={theme}
                setTheme={setTheme}
                onSelecionar={setSelecao}
              />
            </div>
          </>
        )}

        {activeTab === "design" && (
          <>
            <div className="min-h-0 w-full shrink-0 overflow-y-auto border-r border-black/[0.06] dark:border-white/[0.08] lg:w-[380px]">
              <StyleTab
                theme={theme}
                setTheme={setTheme}
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
                modo={displayMode}
              />
            </div>
            <div className="hidden min-w-0 flex-1 flex-col bg-slate-100 dark:bg-[#0A0B12] lg:flex">
              {barraDoPalco}
              <div className="min-h-0 flex-1">{palco}</div>
            </div>
          </>
        )}

        {activeTab === "config" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[760px] px-4 py-5">
              <ConfigurarTab
                name={name}
                slug={slug}
                setSlug={setSlug}
                description={description}
                setDescription={setDescription}
                pipelines={pipelines}
                stagesForPipeline={stagesForPipeline}
                pipelineId={pipelineId}
                setPipelineId={(v) => {
                  setPipelineId(v)
                  setStageId("")
                }}
                stageId={stageId}
                setStageId={setStageId}
                successMessage={successMessage}
                setSuccessMessage={setSuccessMessage}
                redirectUrl={redirectUrl}
                setRedirectUrl={setRedirectUrl}
                destinoQualificado={destinoQualificado}
                setDestinoQualificado={setDestinoQualificado}
                tracking={tracking}
                setTracking={setTracking}
                fields={fields}
                formId={id}
                publicUrl={publicUrl}
                status={status}
                copied={copied}
                setCopied={setCopied}
              />
            </div>
          </div>
        )}

        {activeTab === "resultados" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FormResults formId={id} />
          </div>
        )}
      </div>

      {/* Alternador Estrutura/Detalhes — só onde as três colunas não cabem */}
      {activeTab === "criar" && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full border border-black/[0.08] bg-white p-1 shadow-lg lg:hidden dark:border-white/[0.10] dark:bg-[#1A1D27]">
          {(
            [
              { key: "editor", label: "Estrutura" },
              { key: "preview", label: "Detalhes" },
            ] as const
          ).map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setMobilePane(b.key)}
              className={
                "h-8 rounded-full px-4 text-[12px] font-medium transition-colors " +
                (mobilePane === b.key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-white/70")
              }
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
/**
 * Configurar: tudo o que não é o que o visitante vê nem como ele vê.
 *
 * Junta as quatro abas antigas que respondiam à MESMA pergunta — o que
 * acontece com a resposta e como o formulário chega até alguém —, em
 * seções que se leem na ordem em que o trabalho acontece: identificação,
 * para onde o lead vai, o que ele vê depois de enviar, os anúncios que o
 * trazem, e como instalar.
 *
 * A identificação (slug, descrição interna) estava em "Textos", ao lado
 * do título público. São coisas de mundos diferentes: uma é como o time
 * acha o formulário no admin, a outra é o que o visitante lê.
 */
function ConfigurarTab({
  name,
  slug,
  setSlug,
  description,
  setDescription,
  pipelines,
  stagesForPipeline,
  pipelineId,
  setPipelineId,
  stageId,
  setStageId,
  successMessage,
  setSuccessMessage,
  redirectUrl,
  setRedirectUrl,
  destinoQualificado,
  setDestinoQualificado,
  tracking,
  setTracking,
  fields,
  formId,
  publicUrl,
  status,
  copied,
  setCopied,
}: {
  name: string
  slug: string
  setSlug: (v: string) => void
  description: string
  setDescription: (v: string) => void
  pipelines: PipelineLite[]
  stagesForPipeline: Array<{ id: string; name: string }>
  pipelineId: string
  setPipelineId: (v: string) => void
  stageId: string
  setStageId: (v: string) => void
  successMessage: string
  setSuccessMessage: (v: string) => void
  redirectUrl: string
  setRedirectUrl: (v: string) => void
  destinoQualificado: DestinoDoFinal | null
  setDestinoQualificado: (d: DestinoDoFinal | null) => void
  tracking: TrackingState
  setTracking: React.Dispatch<React.SetStateAction<TrackingState>>
  fields: FormField[]
  formId: string
  publicUrl: string
  status: "draft" | "published" | "archived"
  copied: string | null
  setCopied: (v: string | null) => void
}) {
  const [secao, setSecao] = useState<"destino" | "anuncios" | "instalar">("destino")
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-[6px] bg-slate-100 p-0.5 dark:bg-white/[0.05]" aria-label="Configurações">
        {(
          [
            { key: "destino", label: "Lead e destino" },
            { key: "anuncios", label: "Anúncios" },
            { key: "instalar", label: "Instalar" },
          ] as const
        ).map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setSecao(x.key)}
            aria-current={secao === x.key ? "page" : undefined}
            className={
              "flex-1 rounded-[5px] px-3 py-1.5 text-[12px] font-medium transition-colors " +
              (secao === x.key
                ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1A1D27] dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white")
            }
          >
            {x.label}
          </button>
        ))}
      </nav>

      {secao === "destino" && (
        <Stack>
          <SectionTitle title="Identificação" hint="Como o time acha este formulário — não aparece para quem responde." />
          <Field label="Endereço público" hint="Só letras minúsculas, números e hífen.">
            <div className="flex items-center gap-1">
              <span className="shrink-0 font-mono text-[12px] text-slate-500 dark:text-white/45">/forms/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
          </Field>
          <Field label="Descrição interna" hint="Notas para o time.">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="crm-input w-full"
              placeholder={`Notas sobre "${name}".`}
            />
          </Field>

          <Divider />

          <AfterTab
            pipelines={pipelines}
            stagesForPipeline={stagesForPipeline}
            pipelineId={pipelineId}
            setPipelineId={setPipelineId}
            stageId={stageId}
            setStageId={setStageId}
            successMessage={successMessage}
            setSuccessMessage={setSuccessMessage}
            redirectUrl={redirectUrl}
            setRedirectUrl={setRedirectUrl}
            destinoQualificado={destinoQualificado}
            setDestinoQualificado={setDestinoQualificado}
          />
        </Stack>
      )}

      {secao === "anuncios" && (
        <TrackingTab tracking={tracking} setTracking={setTracking} fields={fields} formId={formId} />
      )}

      {secao === "instalar" && (
        <InstallTab
          publicUrl={publicUrl}
          status={status}
          copied={copied}
          setCopied={setCopied}
          name={name}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Inspetor — a coluna da direita
// ────────────────────────────────────────────────────────────────────

/**
 * O painel do item escolhido na espinha.
 *
 * Um despachante, não um acúmulo: cada tipo de item tem UM painel, e o
 * que ele mostra é só o que aquele item tem. É o que desfaz a aba
 * "Textos" antiga, que juntava identificação interna com conteúdo
 * público e precisava de um parágrafo explicando que metade dos campos
 * não valia no formato escolhido.
 */
function Inspetor({
  selecao,
  espinha,
  modo,
  fluxo,
  onFluxo,
  fields,
  updateField,
  removeField,
  leadCustomFields,
  dealCustomFields,
  telaPorRef,
  regrasPorRef,
  agruparPergunta,
  faixasPorMoeda,
  blocosDoFluxo,
  theme,
  setTheme,
  onSelecionar,
}: {
  selecao: Selecao
  espinha: Espinha
  modo: "classic" | "conversational"
  fluxo: FormSchema
  onFluxo: (f: FormSchema) => void
  fields: FormField[]
  updateField: (idx: number, patch: Partial<FormField>) => void
  removeField: (idx: number) => void
  leadCustomFields: Array<{ id: string; key: string; label: string; field_type: string }>
  dealCustomFields: Array<{ id: string; key: string; label: string; field_type: string }>
  telaPorRef: Record<string, { numero: number; tamanho: number; cabeca: boolean; titulo: string }>
  regrasPorRef: Record<string, number>
  agruparPergunta: (ref: string, patch: { mesma_tela?: boolean; titulo_da_tela?: string | null }) => void
  faixasPorMoeda: (ref: string, v: { ligado: boolean; moeda_de: string | null }) => void
  blocosDoFluxo: FormBlock[]
  theme: FormTheme
  setTheme: (t: FormTheme) => void
  onSelecionar: (s: Selecao) => void
}) {
  const candidatasDeRegiao = useMemo(
    () =>
      fields
        .map((f, i) => ({ ref: f.id ?? `novo-${i}`, label: f.label, tipo: f.field_type }))
        .filter((f) => f.tipo === "select" || f.tipo === "radio"),
    [fields],
  )
  const blocoPorRef = useMemo(() => new Map(blocosDoFluxo.map((b) => [b.ref, b])), [blocosDoFluxo])

  if (!selecao) {
    return (
      <PainelVazio
        titulo="Escolha um item à esquerda"
        apoio="Cada pergunta, tela e final tem as suas opções aqui."
      />
    )
  }

  if (selecao.tipo === "pergunta") {
    const idx = fields.findIndex((f, i) => (f.id ?? `novo-${i}`) === selecao.ref)
    if (idx < 0) return <PainelVazio titulo="Pergunta não encontrada" apoio="Ela pode ter sido removida." />
    const field = fields[idx]
    const ref = field.id ?? `novo-${idx}`
    const tela = telaPorRef[ref]
    const bloco = blocoPorRef.get(ref)
    const numero = espinha.telas.findIndex((t) => t.perguntas.some((p) => p.ref === ref)) + 1
    return (
      <div className="flex h-full flex-col">
        <CabecalhoDoInspetor
          titulo={field.label || "Nova pergunta"}
          apoio={modo === "conversational" && numero > 0 ? `Tela ${numero}` : "Pergunta"}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <FieldEditor
            field={field}
            desvios={regrasPorRef[ref] ?? 0}
            tela={tela}
            podeJuntar={modo === "conversational" && idx > 0}
            onAgrupar={(patch) => agruparPergunta(ref, patch)}
            faixasPorMoeda={{
              ligado: Boolean(bloco?.opcoes_por_moeda),
              moeda_de: bloco?.moeda_de ?? null,
            }}
            onFaixasPorMoeda={(v) => faixasPorMoeda(ref, v)}
            candidatasDeRegiao={candidatasDeRegiao.filter((c) => c.ref !== ref)}
            leadCustomFields={leadCustomFields}
            dealCustomFields={dealCustomFields}
            onChange={(patch) => updateField(idx, patch)}
            onRemove={() => removeField(idx)}
            semMoldura
          />
          {modo === "conversational" && tela && (
            <button
              type="button"
              onClick={() => onSelecionar({ tipo: "tela", ref: tela.cabeca ? ref : espinha.telas.find((t) => t.perguntas.some((p) => p.ref === ref))?.ref ?? ref })}
              className="mt-3 flex w-full items-center justify-between gap-2 rounded-[6px] border border-black/[0.08] px-2.5 py-2 text-left transition-colors hover:bg-slate-50 dark:border-white/[0.12] dark:hover:bg-white/[0.04]"
            >
              <span className="min-w-0">
                <span className="block text-[11.5px] font-medium text-slate-800 dark:text-white/85">
                  Desvios e destino da tela
                </span>
                <span className="block text-[10.5px] text-slate-500 dark:text-white/45">
                  Para onde a pessoa vai depois de responder
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" />
            </button>
          )}
        </div>
      </div>
    )
  }

  if (selecao.tipo === "tela") {
    const tela = espinha.telas.find((t) => t.ref === selecao.ref)
    return (
      <div className="flex h-full flex-col">
        <CabecalhoDoInspetor
          titulo={tela?.titulo || `Tela ${tela?.numero ?? ""}`.trim()}
          apoio={
            tela && tela.perguntas.length > 1
              ? `${tela.perguntas.length} perguntas juntas`
              : "Uma pergunta"
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FlowEditor
            fluxo={fluxo}
            onChange={onFluxo}
            temAbertura={modo === "conversational"}
            foco={{ tipo: "tela", ref: selecao.ref }}
          />
        </div>
      </div>
    )
  }

  if (selecao.tipo === "final") {
    const fim = espinha.finais.find((f) => f.ref === selecao.ref)
    return (
      <div className="flex h-full flex-col">
        <CabecalhoDoInspetor titulo={fim?.titulo || "Tela final"} apoio="Tela final" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FlowEditor
            fluxo={fluxo}
            onChange={onFluxo}
            temAbertura={modo === "conversational"}
            foco={{ tipo: "final", ref: selecao.ref }}
          />
        </div>
      </div>
    )
  }

  if (selecao.tipo === "abertura") {
    return (
      <div className="flex h-full flex-col">
        <CabecalhoDoInspetor titulo="Tela de abertura" apoio="Antes da primeira pergunta" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FlowEditor
            fluxo={fluxo}
            onChange={onFluxo}
            temAbertura
            foco={{ tipo: "abertura" }}
          />
        </div>
      </div>
    )
  }

  // Cabeçalho e botão de envio: só existem no formato de página única, e
  // é por isso que eles moram na espinha DELE. Escritos numa aba comum
  // aos dois formatos, eram campo que ninguém desenhava.
  if (selecao.tipo === "cabecalho") {
    return (
      <div className="flex h-full flex-col">
        <CabecalhoDoInspetor titulo="Cabeçalho" apoio="O topo da página" />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <Field label="Badge" hint="Opcional. O chip pequeno acima do título.">
            <input
              type="text"
              value={theme.badge ?? ""}
              onChange={(e) => setTheme({ ...theme, badge: e.target.value })}
              className="crm-input w-full"
              placeholder="Aceleradora #1"
            />
          </Field>
          <Field label="Título">
            <input
              type="text"
              value={theme.headline ?? ""}
              onChange={(e) => setTheme({ ...theme, headline: e.target.value })}
              className="crm-input w-full"
              placeholder="Diagnóstico gratuito"
            />
          </Field>
          <Field label="Subtítulo">
            <textarea
              rows={2}
              value={theme.subheadline ?? ""}
              onChange={(e) => setTheme({ ...theme, subheadline: e.target.value })}
              className="crm-input w-full"
              placeholder="Em uma linha, por que vale preencher."
            />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <CabecalhoDoInspetor titulo="Botão de envio" apoio="O fecho da página" />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Field label="Texto do botão">
          <input
            type="text"
            value={theme.buttonText ?? ""}
            onChange={(e) => setTheme({ ...theme, buttonText: e.target.value })}
            className="crm-input w-full"
            placeholder="Enviar"
          />
        </Field>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-white/45">
          O que acontece depois do envio — mensagem, redirecionamento e o destino do lead
          qualificado — fica em <span className="font-medium text-slate-700 dark:text-white/70">Configurar</span>.
        </p>
      </div>
    </div>
  )
}

function CabecalhoDoInspetor({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <div className="shrink-0 border-b border-slate-200/70 px-3 py-2 dark:border-white/[0.07]">
      <p className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">{titulo}</p>
      <p className="truncate text-[10.5px] text-slate-500 dark:text-white/45">{apoio}</p>
    </div>
  )
}

function PainelVazio({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div>
        <p className="text-[12.5px] font-medium text-slate-700 dark:text-white/75">{titulo}</p>
        <p className="mx-auto mt-1 max-w-[28ch] text-[11px] leading-relaxed text-slate-500 dark:text-white/45">
          {apoio}
        </p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tabs
// ────────────────────────────────────────────────────────────────────

/**
 * O formato fica no cabeçalho, não numa aba.
 *
 * Ele decide o que todo o resto significa — quais abas existem, o que o
 * palco desenha, se a lógica de salto tem para onde desviar. Guardado
 * dentro de uma aba de configuração, ele vira uma escolha que só quem já
 * sabe da existência encontra, e o editor passa a parecer um formulário
 * de página única com peças estranhas sobrando.
 */
function FormatoDoFormulario({
  modo,
  modoSalvo,
  noAr,
  onChange,
}: {
  modo: "classic" | "conversational"
  /** O que está GRAVADO. A troca só vale quando a página é salva. */
  modoSalvo: "classic" | "conversational"
  noAr: boolean
  onChange: (m: "classic" | "conversational") => void
}) {
  const opcoes = [
    { key: "classic" as const, label: "Página única", icon: Rows3 },
    { key: "conversational" as const, label: "Conversacional", icon: MessagesSquare },
  ]
  return (
    <div className="mt-3">
      <div
        role="radiogroup"
        aria-label="Formato do formulário"
        className="inline-flex rounded-[7px] bg-slate-100 p-0.5 dark:bg-white/[0.05]"
      >
        {opcoes.map((o) => {
          const ativo = modo === o.key
          const Icon = o.icon
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onChange(o.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[11.5px] font-medium transition-colors " +
                (ativo
                  ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.07)] dark:bg-[#1A1D27] dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          )
        })}
      </div>
      {modo !== modoSalvo && (
        <p
          className={
            "mt-1.5 flex items-start gap-1 text-[10.5px] leading-relaxed " +
            (noAr ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-white/45")
          }
        >
          {noAr && <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />}
          {noAr
            ? "Ao salvar, quem abrir o endereço público já vê neste formato — a troca não espera a publicação da versão."
            : "A troca vale quando você salvar a página."}
        </p>
      )}
    </div>
  )
}

function StyleTab({
  theme,
  setTheme,
  logoUrl,
  setLogoUrl,
  modo,
}: {
  theme: FormTheme
  setTheme: (fn: FormTheme | ((t: FormTheme) => FormTheme)) => void
  logoUrl: string
  setLogoUrl: (v: string) => void
  /**
   * O formato muda o que cada controle SIGNIFICA: no conversacional a
   * tela é a página (não existe card), e chamar o fundo de "página
   * standalone (avançado)" esconde o único fundo que ele tem.
   */
  modo: "classic" | "conversational"
}) {
  const conversa = modo === "conversational"
  const dark = theme.mode === "dark"
  const defaultText = dark ? "#F1F5F9" : "#0F172A"
  const escolha = logoDoFormulario({ logoUrl, ocultar: theme.hideLogo, modo: theme.mode })
  return (
    <Stack>
      {/* ── Logo ── */}
      <SectionTitle
        title="Logo"
        hint="Aparece no alto de todas as telas, inclusive nas perguntas."
      />
      <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.10] p-2.5 space-y-2">
        <div
          className="flex h-14 items-center justify-center rounded-[5px] border border-dashed border-slate-200 dark:border-white/[0.10]"
          style={{ background: theme.mode === "dark" ? "#0B0B14" : "#FFFFFF" }}
        >
          {escolha.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={escolha.url} alt="" className="h-6 w-auto object-contain" />
          ) : (
            <span className="text-[10px] text-slate-400 dark:text-white/35">Sem logo</span>
          )}
        </div>
        <Field
          label="URL da logo"
          hint={
            theme.hideLogo
              ? "Ignorada enquanto «Sem logo» estiver ligado."
              : escolha.daCasa
                ? "Em branco, o formulário usa a logo da Convertfy."
                : "Logo própria — substitui a da Convertfy."
          }
        >
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://… (em branco = logo da Convertfy)"
            className="crm-input w-full"
            disabled={Boolean(theme.hideLogo)}
          />
        </Field>
        {!theme.hideLogo && (
          <>
            <Field
              label="Altura da logo"
              hint={`Padrão deste formato: ${ALTURA_PADRAO_DA_LOGO[modo]}px. A largura acompanha.`}
            >
              <NumberRow
                value={alturaDaLogo(theme.logoHeight, modo)}
                onChange={(v) => setTheme((t) => ({ ...t, logoHeight: v }))}
                min={ALTURA_MINIMA_DA_LOGO}
                max={ALTURA_MAXIMA_DA_LOGO}
                suffix="px"
              />
            </Field>
            <Field label="Alinhamento">
              <ToggleGroup
                value={theme.logoAlign ?? "left"}
                onChange={(v) =>
                  setTheme((t) => ({ ...t, logoAlign: v === "center" ? "center" : undefined }))
                }
                options={[
                  { value: "left", label: "À esquerda" },
                  { value: "center", label: "Centralizada" },
                ]}
              />
            </Field>
          </>
        )}
        <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-white/75">
          <input
            type="checkbox"
            checked={Boolean(theme.hideLogo)}
            onChange={(e) => setTheme((t) => ({ ...t, hideLogo: e.target.checked || undefined }))}
            className="h-3.5 w-3.5"
          />
          Sem logo nenhuma
        </label>
      </div>

      <Divider />

      {/* ── Modo + Cor primaria ── */}
      <SectionTitle
        title="Base"
        hint="Modo claro ou escuro. A cor primária controla botão, foco e detalhes."
      />
      <Field label="Modo">
        <ToggleGroup
          value={theme.mode ?? "light"}
          onChange={(v) => setTheme((t) => ({ ...t, mode: v }))}
          options={[
            { value: "light", label: "Claro" },
            { value: "dark", label: "Escuro" },
          ]}
        />
      </Field>
      <Field label="Cor primária">
        <ColorRow
          value={theme.primaryColor ?? "#2563EB"}
          onChange={(v) => setTheme((t) => ({ ...t, primaryColor: v }))}
        />
      </Field>

      <Divider />

      {/* ── Card do formulario ── */}
      <SectionTitle
        title={conversa ? "Conteúdo" : "Card do formulário"}
        hint={
          conversa
            ? "No conversacional não existe card: a tela inteira é a pergunta. Aqui ficam a largura e o respiro do conteúdo."
            : "A caixa do form é o que aparece embedado. Tudo é configurável."
        }
      />
      {!conversa && (
        <Field label="Fundo do card">
          <ToggleGroup
            value={
              theme.cardGradient
                ? "gradient"
                : theme.cardBgColor === "transparent"
                  ? "transparent"
                  : "solid"
            }
            onChange={(v) =>
              setTheme((t) => {
                if (v === "gradient") {
                  return {
                    ...t,
                    cardGradient: t.cardGradient ?? {
                      from:
                        t.cardBgColor && t.cardBgColor !== "transparent"
                          ? t.cardBgColor
                          : t.mode === "dark"
                            ? "#0F172A"
                            : "#FFFFFF",
                      to: t.primaryColor ?? "#2563EB",
                      angle: 135,
                    },
                  }
                }
                return {
                  ...t,
                  cardGradient: null,
                  cardBgColor:
                    v === "transparent"
                      ? "transparent"
                      : t.cardBgColor && t.cardBgColor !== "transparent"
                        ? t.cardBgColor
                        : t.mode === "dark"
                          ? "#0F172A"
                          : "#FFFFFF",
                }
              })
            }
            options={[
              { value: "solid", label: "Sólido" },
              { value: "gradient", label: "Gradiente" },
              { value: "transparent", label: "Sem fundo" },
            ]}
          />
          {theme.cardGradient ? (
            <div className="mt-2 space-y-1.5">
              <GradienteRows
                valor={theme.cardGradient}
                onChange={(g) => setTheme((t) => ({ ...t, cardGradient: g }))}
              />
            </div>
          ) : (
            theme.cardBgColor !== "transparent" && (
              <div className="mt-2">
                <ColorRow
                  value={theme.cardBgColor ?? (theme.mode === "dark" ? "#0F172A" : "#FFFFFF")}
                  onChange={(v) => setTheme((t) => ({ ...t, cardBgColor: v }))}
                />
              </div>
            )
          )}
        </Field>
      )}
      {!conversa && (
        <>
      <Field label="Borda do card">
        <ToggleGroup
          value={
            theme.cardBorderColor === "transparent" ? "none" : "visible"
          }
          onChange={(v) =>
            setTheme((t) => ({
              ...t,
              cardBorderColor:
                v === "none"
                  ? "transparent"
                  : t.cardBorderColor && t.cardBorderColor !== "transparent"
                    ? t.cardBorderColor
                    : t.mode === "dark"
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(15,23,42,0.10)",
            }))
          }
          options={[
            { value: "visible", label: "Visível" },
            { value: "none", label: "Sem borda" },
          ]}
        />
        {theme.cardBorderColor !== "transparent" && (
          <div className="mt-2">
            <ColorRow
              value={
                theme.cardBorderColor ??
                (theme.mode === "dark"
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(15,23,42,0.10)")
              }
              onChange={(v) => setTheme((t) => ({ ...t, cardBorderColor: v }))}
            />
          </div>
        )}
      </Field>
      <Field label="Sombra do card">
        <ToggleGroup
          value={theme.cardShadow ?? "sm"}
          onChange={(v) => setTheme((t) => ({ ...t, cardShadow: v }))}
          options={[
            { value: "none", label: "Nenhuma" },
            { value: "sm", label: "Leve" },
            { value: "md", label: "Média" },
            { value: "lg", label: "Forte" },
          ]}
        />
      </Field>
        </>
      )}
      {!conversa && (
        <Field label="Padding interno (px)">
          <NumberRow
            value={theme.cardPadding ?? 28}
            onChange={(v) => setTheme((t) => ({ ...t, cardPadding: v }))}
            min={0}
            max={64}
            suffix="px"
          />
        </Field>
      )}
      <Field label={conversa ? "Largura do conteúdo (px)" : "Largura máxima do card (px)"}>
        <NumberRow
          value={theme.containerWidth ?? 480}
          onChange={(v) => setTheme((t) => ({ ...t, containerWidth: v }))}
          min={320}
          max={720}
          suffix="px"
        />
      </Field>
      <Field label="Cantos arredondados">
        <NumberRow
          value={theme.borderRadius ?? 8}
          onChange={(v) => setTheme((t) => ({ ...t, borderRadius: v }))}
          min={0}
          max={24}
          suffix="px"
        />
      </Field>
      <Field
        label="Espaço entre campos (px)"
        hint={conversa ? "Vale nas telas com várias perguntas juntas." : undefined}
      >
        <NumberRow
          value={theme.fieldGap ?? 14}
          onChange={(v) => setTheme((t) => ({ ...t, fieldGap: v }))}
          min={4}
          max={32}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Texto e cores ── */}
      <SectionTitle
        title="Texto e cores"
        hint="Controle individual de cada peça de texto do form."
      />
      <Field label="Cor do texto (geral)">
        <ColorRow
          value={theme.textColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, textColor: v }))}
        />
      </Field>
      <Field label="Cor do subtítulo">
        <ColorRow
          value={theme.subtitleColor ?? theme.textColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, subtitleColor: v }))}
        />
      </Field>
      <Field label="Cor das labels">
        <ColorRow
          value={theme.labelColor ?? theme.textColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, labelColor: v }))}
        />
      </Field>
      <Field label="Tamanho do título grande">
        <NumberRow
          value={theme.headingSize ?? 28}
          onChange={(v) => setTheme((t) => ({ ...t, headingSize: v }))}
          min={16}
          max={56}
          suffix="px"
        />
      </Field>
      <Field label="Tamanho do subtítulo">
        <NumberRow
          value={theme.subheadingSize ?? 14}
          onChange={(v) => setTheme((t) => ({ ...t, subheadingSize: v }))}
          min={10}
          max={20}
          suffix="px"
        />
      </Field>
      <Field label="Tamanho da label">
        <NumberRow
          value={theme.labelSize ?? 12}
          onChange={(v) => setTheme((t) => ({ ...t, labelSize: v }))}
          min={10}
          max={18}
          suffix="px"
        />
      </Field>
      <Field label="Tamanho de texto base (inputs)">
        <NumberRow
          value={theme.fontSize ?? 14}
          onChange={(v) => setTheme((t) => ({ ...t, fontSize: v }))}
          min={11}
          max={18}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Inputs ── */}
      <SectionTitle
        title="Inputs"
        hint="Aparência dos campos preenchíveis."
      />
      <Field label="Fundo do input">
        <ColorRow
          value={
            theme.inputBgColor ??
            (dark ? "rgba(255,255,255,0.04)" : "#F8FAFC")
          }
          onChange={(v) => setTheme((t) => ({ ...t, inputBgColor: v }))}
        />
      </Field>
      <Field label="Borda do input">
        <ColorRow
          value={
            theme.inputBorderColor ??
            (dark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)")
          }
          onChange={(v) => setTheme((t) => ({ ...t, inputBorderColor: v }))}
        />
      </Field>
      <Field label="Cor do texto digitado">
        <ColorRow
          value={theme.inputTextColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, inputTextColor: v }))}
        />
      </Field>
      <Field label="Cor do placeholder">
        <ColorRow
          value={
            theme.inputPlaceholderColor ??
            (dark ? "rgba(241,245,249,0.40)" : "rgba(15,23,42,0.40)")
          }
          onChange={(v) =>
            setTheme((t) => ({ ...t, inputPlaceholderColor: v }))
          }
        />
      </Field>
      <Field label="Cantos do input">
        <NumberRow
          value={
            theme.inputRadius ??
            Math.max(4, Math.round((theme.borderRadius ?? 8) * 0.75))
          }
          onChange={(v) => setTheme((t) => ({ ...t, inputRadius: v }))}
          min={0}
          max={20}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Botão ── */}
      <SectionTitle title="Botão" />
      <Field label="Estilo">
        <ToggleGroup
          value={theme.buttonGradient ? "gradient" : "solid"}
          onChange={(v) =>
            setTheme((t) =>
              v === "gradient"
                ? {
                    ...t,
                    buttonGradient: t.buttonGradient ?? {
                      from: t.primaryColor ?? "#6366F1",
                      to: "#A78BFA",
                      angle: 90,
                    },
                  }
                : { ...t, buttonGradient: null },
            )
          }
          options={[
            { value: "solid", label: "Sólido (cor primária)" },
            { value: "gradient", label: "Gradiente" },
          ]}
        />
        {theme.buttonGradient && (
          <div className="mt-2 space-y-1.5">
            <GradienteRows
              valor={theme.buttonGradient}
              onChange={(g) => setTheme((t) => ({ ...t, buttonGradient: g }))}
            />
          </div>
        )}
      </Field>
      <Field label="Cor do texto do botão">
        <ColorRow
          value={theme.buttonTextColor ?? "#FFFFFF"}
          onChange={(v) => setTheme((t) => ({ ...t, buttonTextColor: v }))}
        />
      </Field>
      <Field label="Cantos do botão">
        <NumberRow
          value={theme.buttonRadius ?? theme.borderRadius ?? 8}
          onChange={(v) => setTheme((t) => ({ ...t, buttonRadius: v }))}
          min={0}
          max={32}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Opções ── */}
      <SectionTitle title="Opções" />
      <CheckRow
        label="Esconder título e subtítulo"
        checked={!!theme.hideTitle}
        onChange={(v) => setTheme((t) => ({ ...t, hideTitle: v }))}
      />
      {!conversa && (
        <CheckRow
          label="Esconder labels dos campos (apenas placeholders)"
          checked={!!theme.hideLabels}
          onChange={(v) => setTheme((t) => ({ ...t, hideLabels: v }))}
        />
      )}
      <CheckRow
        label='Esconder "Powered by Convertfy"'
        checked={!!theme.hidePoweredBy}
        onChange={(v) => setTheme((t) => ({ ...t, hidePoweredBy: v }))}
      />

      <Divider />

      {/* ── Fundo ── */}
      <SectionTitle
        title={conversa ? "Fundo da tela" : "Página standalone (avançado)"}
        hint={
          conversa
            ? "No conversacional a tela é a página: este é o fundo que o visitante vê o tempo todo."
            : "Só afeta a URL pública direta /forms/[slug]. Quando o form é embedado em outra página, o fundo é da página host."
        }
      />
      <Field label={conversa ? "Fundo" : "Fundo da página standalone"}>
        <ToggleGroup
          value={theme.bgGradient ? "gradient" : "solid"}
          onChange={(v) =>
            setTheme((t) =>
              v === "gradient"
                ? {
                    ...t,
                    bgGradient: t.bgGradient ?? {
                      from: t.backgroundColor ?? "#0B0B14",
                      to: "#1E1B4B",
                      angle: 135,
                    },
                  }
                : { ...t, bgGradient: null },
            )
          }
          options={[
            { value: "solid", label: "Cor sólida" },
            { value: "gradient", label: "Gradiente" },
          ]}
        />
        <div className="mt-2 space-y-1.5">
          {theme.bgGradient ? (
            <GradienteRows
              valor={theme.bgGradient}
              onChange={(g) => setTheme((t) => ({ ...t, bgGradient: g }))}
            />
          ) : (
            <ColorRow
              value={theme.backgroundColor ?? (dark ? "#0B0F19" : "#FFFFFF")}
              onChange={(v) => setTheme((t) => ({ ...t, backgroundColor: v }))}
            />
          )}
        </div>
      </Field>

      <Divider />

      <button
        type="button"
        onClick={() => setTheme({})}
        className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline self-start"
      >
        Resetar tema (volta ao padrão)
      </button>
    </Stack>
  )
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
        (checked ? "bg-slate-900 dark:bg-white" : "bg-slate-300 dark:bg-white/20")
      }
    >
      <span
        className={
          "inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-[#1A1D27] shadow-sm transition-transform " +
          (checked ? "translate-x-4" : "translate-x-1")
        }
      />
    </button>
  )
}

function TrackingTab({
  tracking,
  setTracking,
  fields,
  formId,
}: {
  tracking: TrackingState
  setTracking: React.Dispatch<React.SetStateAction<TrackingState>>
  fields: FormField[]
  formId: string
}) {
  const patch = (p: Partial<TrackingState>) => setTracking((t) => ({ ...t, ...p }))

  // Só campos já salvos (com id) podem ser referenciados por uma regra.
  const savedFields = fields.filter(
    (f): f is FormField & { id: string } => !!f.id,
  )

  const addRule = () =>
    patch({
      qualified_rules: [
        ...tracking.qualified_rules,
        {
          field_id: savedFields[0]?.id ?? "",
          field_label: savedFields[0]?.label,
          operator: "in",
          value: [],
        },
      ],
    })
  const updateRule = (idx: number, up: Partial<QualifiedRule>) =>
    patch({
      qualified_rules: tracking.qualified_rules.map((r, i) =>
        i === idx ? { ...r, ...up } : r,
      ),
    })
  const removeRule = (idx: number) =>
    patch({
      qualified_rules: tracking.qualified_rules.filter((_, i) => i !== idx),
    })

  return (
    <Stack>
      {/* ── Meta Ads ── */}
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Meta Ads (Facebook / Instagram)"
          hint="Envia o evento Lead via Conversions API (server-side) quando alguém se cadastra, com o máximo de parâmetros pra otimização."
        />
        <Switch
          checked={tracking.meta_enabled}
          onChange={(v) => patch({ meta_enabled: v })}
        />
      </div>
      {tracking.meta_enabled && (
        <>
          <Field label="ID do Pixel" hint="Encontrado no Gerenciador de Eventos do Meta.">
            <input
              className="crm-input w-full font-mono text-[12px]"
              placeholder="1234567890123456"
              value={tracking.facebook_pixel_id}
              onChange={(e) => patch({ facebook_pixel_id: e.target.value })}
            />
          </Field>
          <Field
            label="Token da Conversions API"
            hint={
              tracking.has_meta_capi_token
                ? "Já configurado. Preencha só para substituir. Fica criptografado."
                : "Access token gerado no Gerenciador de Eventos. Fica criptografado e nunca é exibido."
            }
          >
            <input
              type="password"
              autoComplete="new-password"
              className="crm-input w-full font-mono text-[12px]"
              placeholder={
                tracking.has_meta_capi_token ? "•••••••••• configurado" : "EAAB..."
              }
              value={tracking.meta_capi_token}
              onChange={(e) => patch({ meta_capi_token: e.target.value })}
            />
          </Field>
          <Field
            label="Código de teste (opcional)"
            hint="Test Event Code pra validar no Gerenciador de Eventos antes de ir pra produção."
          >
            <input
              className="crm-input w-full font-mono text-[12px]"
              placeholder="TEST12345"
              value={tracking.meta_test_event_code}
              onChange={(e) => patch({ meta_test_event_code: e.target.value })}
            />
          </Field>
          <label className="flex items-start gap-2 text-[12px] text-slate-700 dark:text-white/75">
            <input
              type="checkbox"
              checked={tracking.meta_browser_pixel}
              onChange={(e) => patch({ meta_browser_pixel: e.target.checked })}
              className="mt-0.5 accent-slate-900 dark:accent-white"
            />
            <span>
              Também disparar o pixel no navegador (PageView + Lead), deduplicado com a
              API pelo mesmo event_id.
            </span>
          </label>
        </>
      )}

      <Divider />

      {/* ── Google Ads ── */}
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Google Ads"
          hint="Dispara a conversão via gtag no navegador quando o lead envia o formulário."
        />
        <Switch
          checked={tracking.google_enabled}
          onChange={(v) => patch({ google_enabled: v })}
        />
      </div>
      {tracking.google_enabled && (
        <>
          <Field label="ID de conversão" hint='Formato "AW-XXXXXXXXX".'>
            <input
              className="crm-input w-full font-mono text-[12px]"
              placeholder="AW-123456789"
              value={tracking.google_ads_id}
              onChange={(e) => patch({ google_ads_id: e.target.value })}
            />
          </Field>
          <Field
            label="Rótulo da conversão"
            hint="A label do evento (send_to = ID/label)."
          >
            <input
              className="crm-input w-full font-mono text-[12px]"
              placeholder="AbC-D_efG-hIjK"
              value={tracking.google_ads_conversion_label}
              onChange={(e) => patch({ google_ads_conversion_label: e.target.value })}
            />
          </Field>
        </>
      )}

      <Divider />

      {/* ── Lead qualificado ── */}
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Evento “Lead qualificado”"
          hint="Evento custom enviado ao Meta só quando as condições abaixo forem satisfeitas (ex.: faturamento acima de 500k)."
        />
        <Switch
          checked={tracking.qualified_enabled}
          onChange={(v) => patch({ qualified_enabled: v })}
        />
      </div>
      {tracking.qualified_enabled && (
        <>
          <Field label="Nome do evento">
            <input
              className="crm-input w-full"
              placeholder="Lead qualificado"
              value={tracking.qualified_event_name}
              onChange={(e) => patch({ qualified_event_name: e.target.value })}
            />
            {/* O pixel do navegador manda o nome na URL: com espaço, a
                Meta registra "Lead%20qualificado" separado do que a API
                envia. O nome é ajustado no envio, e a tela mostra o
                resultado para não haver surpresa no Gerenciador. */}
            <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
              Chega na Meta como{" "}
              <strong className="font-mono">
                {metaEventName(tracking.qualified_event_name)}
              </strong>
              {willRenameEvent(tracking.qualified_event_name) && (
                <>
                  {" "}
                  — espaços e acentos são removidos porque o pixel do navegador
                  manda o nome na URL: com espaço ele chega como{" "}
                  <span className="font-mono">
                    {tracking.qualified_event_name.replace(/ /g, "%20")}
                  </span>{" "}
                  e vira um evento separado do que a API envia. Com o mesmo
                  nome, os dois canais se complementam (se um falhar, o outro
                  registra) e a Meta conta uma conversão só.
                  <br />
                  <strong>
                    Se você já tem uma conversão personalizada apontando para o
                    nome antigo, edite-a para usar{" "}
                    <span className="font-mono">
                      {metaEventName(tracking.qualified_event_name)}
                    </span>
                    :
                  </strong>{" "}
                  Gerenciador de Eventos → Conversões personalizadas → sua
                  conversão → Editar → troque o evento na regra.
                </>
              )}
            </p>
          </Field>
          <Field label="Combinação das condições">
            <ToggleGroup
              value={tracking.qualified_logic}
              onChange={(v) => patch({ qualified_logic: v })}
              options={[
                { value: "and", label: "Todas (E)" },
                { value: "or", label: "Qualquer (OU)" },
              ]}
            />
          </Field>

          {savedFields.length === 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
              Crie e salve os campos do formulário primeiro para poder montar condições.
            </p>
          ) : (
            <div className="space-y-2">
              {tracking.qualified_rules.length === 0 && (
                <p className="text-[11px] text-slate-500 dark:text-white/45">
                  Sem condições, o evento não é disparado. Adicione ao menos uma.
                </p>
              )}
              {tracking.qualified_rules.map((rule, idx) => (
                <RuleRow
                  key={idx}
                  rule={rule}
                  fields={savedFields}
                  onChange={(up) => updateRule(idx, up)}
                  onRemove={() => removeRule(idx)}
                />
              ))}
              <button
                type="button"
                onClick={addRule}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-white/75 hover:text-slate-900 dark:hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar condição
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Diagnóstico do envio ──
          Quando o evento não aparece no Gerenciador da Meta, é aqui que
          se descobre o motivo — sem precisar abrir a Meta nem o banco. */}
      <div className="pt-2">
        <SectionTitle
          title="Está chegando na Meta?"
          hint="Conferência do que saiu daqui: quantos eventos foram enviados, quais falharam e se as condições do lead qualificado batem com quem se cadastrou."
        />
        <div className="mt-3">
          <ConversionDiagnostics formId={formId} />
        </div>
      </div>
    </Stack>
  )
}

function RuleRow({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: QualifiedRule
  fields: Array<FormField & { id: string }>
  onChange: (up: Partial<QualifiedRule>) => void
  onRemove: () => void
}) {
  const selField = fields.find((f) => f.id === rule.field_id)
  const opts = (selField?.options ?? []).map((o) =>
    typeof o === "string" ? { label: o, value: o } : o,
  )
  const hasOptions = opts.length > 0
  const needsValue = rule.operator !== "is_set"
  const selectedValues = Array.isArray(rule.value)
    ? rule.value.map(String)
    : rule.value != null && rule.value !== ""
      ? [String(rule.value)]
      : []

  const toggleOption = (v: string) => {
    const set = new Set(selectedValues)
    if (set.has(v)) set.delete(v)
    else set.add(v)
    onChange({ value: Array.from(set) })
  }

  return (
    <div className="rounded-[6px] border border-black/[0.06] dark:border-white/[0.08] p-2.5 space-y-2 bg-slate-50/50 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <select
            value={rule.field_id}
            onChange={(e) => {
              const f = fields.find((x) => x.id === e.target.value)
              onChange({ field_id: e.target.value, field_label: f?.label })
            }}
            className="crm-input w-full appearance-none pr-8 text-[12px]"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>
        <div className="relative w-36 shrink-0">
          <select
            value={rule.operator}
            onChange={(e) =>
              onChange({ operator: e.target.value as QualifiedRule["operator"] })
            }
            className="crm-input w-full appearance-none pr-8 text-[12px]"
          >
            {QUALIFIED_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-slate-400 hover:text-red-500"
          aria-label="Remover condição"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {needsValue &&
        (hasOptions ? (
          <div className="flex flex-wrap gap-1.5">
            {opts.map((o) => {
              const active = selectedValues.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleOption(o.value)}
                  className={
                    "px-2 py-1 rounded-[4px] text-[11px] border transition-colors " +
                    (active
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                      : "border-black/[0.10] dark:border-white/[0.12] text-slate-600 dark:text-white/60 hover:border-slate-400")
                  }
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        ) : (
          <input
            className="crm-input w-full text-[12px]"
            placeholder="Valor"
            value={typeof rule.value === "string" ? rule.value : (selectedValues[0] ?? "")}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        ))}
    </div>
  )
}

function AfterTab({
  pipelines,
  stagesForPipeline,
  pipelineId,
  setPipelineId,
  stageId,
  setStageId,
  successMessage,
  setSuccessMessage,
  redirectUrl,
  setRedirectUrl,
  destinoQualificado,
  setDestinoQualificado,
}: {
  pipelines: PipelineLite[]
  stagesForPipeline: Array<{ id: string; name: string }>
  pipelineId: string
  setPipelineId: (v: string) => void
  stageId: string
  setStageId: (v: string) => void
  successMessage: string
  setSuccessMessage: (v: string) => void
  redirectUrl: string
  setRedirectUrl: (v: string) => void
  destinoQualificado: DestinoDoFinal | null
  setDestinoQualificado: (d: DestinoDoFinal | null) => void
}) {
  return (
    <Stack>
      <SectionTitle
        title="Pipeline e automação"
        hint="Cada submissão cria um lead automaticamente. Se selecionar pipeline, também cria um deal nesta etapa."
      />
      <Field label="Pipeline (opcional)">
        <div className="relative">
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="crm-input w-full appearance-none pr-8"
          >
            <option value="">Apenas criar lead (sem deal)</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>
      </Field>
      {pipelineId && (
        <Field label="Etapa inicial">
          <div className="relative">
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="crm-input w-full appearance-none pr-8"
            >
              <option value="">Primeira etapa do pipeline</option>
              {stagesForPipeline.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
        </Field>
      )}

      <Divider />

      <SectionTitle title="O que mostrar após o envio" />
      <Field
        label="Mensagem de sucesso"
        hint="Aparece dentro do card depois do envio."
      >
        <textarea
          rows={2}
          value={successMessage}
          onChange={(e) => setSuccessMessage(e.target.value)}
          className="crm-input w-full"
          placeholder="Recebemos sua resposta! Entraremos em contato."
        />
      </Field>
      <Field
        label="Ou redirecionar pra URL"
        hint="Se preenchido, ignora a mensagem acima."
      >
        <input
          type="url"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          className="crm-input w-full font-mono text-[12px]"
          placeholder="https://"
        />
      </Field>

      <Divider />

      <SectionTitle
        title="Lead qualificado"
        hint="Vale só para quem a régua de qualificação aprovou — a mesma do evento LeadQualificado. Quem não qualifica segue na mensagem acima."
      />
      <DestinoEditor
        destino={destinoQualificado}
        onChange={setDestinoQualificado}
        titulo="Para onde o lead qualificado vai"
        apoio="Vence o redirecionamento acima, que é o mesmo endereço para todo mundo."
      />
    </Stack>
  )
}

function InstallTab({
  publicUrl,
  status,
  copied,
  setCopied,
  name,
}: {
  publicUrl: string
  status: "draft" | "published" | "archived"
  copied: string | null
  setCopied: (v: string | null) => void
  name: string
}) {
  // ?embed=1 faz o /forms/[slug] renderizar SO o card (sem min-h-screen,
  // sem padding de pagina). Ideal pra iframe — herda altura/largura natural
  // do conteudo e o background do iframe pai.
  const embedUrl = `${publicUrl}?embed=1`
  const iframe = `<iframe src="${embedUrl}" style="border:0;background:transparent;width:100%;min-height:600px" title="${name}" allowtransparency="true"></iframe>`
  const buttonLink = `<a href="${publicUrl}" target="_blank" rel="noopener noreferrer">Abrir formulário</a>`

  // Snippet com rastreamento de origem: o script roda NA pagina host, le
  // utm_*/gclid/fbclid da URL dela (o iframe estatico nunca enxerga isso),
  // persiste first touch e monta o iframe repassando os parametros. Tambem
  // decora links pra /forms/ no clique.
  let appOrigin = ""
  try {
    appOrigin = new URL(publicUrl).origin
  } catch {
    appOrigin = ""
  }
  const trackedEmbed = [
    `<div data-convertfy-form="${publicUrl}"></div>`,
    `<script src="${appOrigin}/api/script/form-embed.js" defer></script>`,
  ].join("\n")

  const copy = (label: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1600)
  }

  return (
    <Stack>
      {status !== "published" && (
        <div className="rounded-[6px] border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed">
          ⚠️ Este formulário ainda está em <b>rascunho</b>. Visitantes ainda não conseguem acessar.
          Clique em <b>Publicar</b> no rodapé pra liberar.
        </div>
      )}

      <SectionTitle title="Passo 1 — Compartilhar link direto" hint="A forma mais simples." />
      <CopyBox
        label="URL pública"
        value={publicUrl}
        copied={copied === "url"}
        onCopy={() => copy("url", publicUrl)}
      />
      <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
        Cole esse link em emails, redes sociais ou em qualquer botão da sua página de vendas.
        Exemplo de uso em HTML:
      </p>
      <CopyBox
        value={buttonLink}
        copied={copied === "button"}
        onCopy={() => copy("button", buttonLink)}
        mono
      />

      <Divider />

      <SectionTitle
        title="Passo 2 — Embedar no seu site (com rastreamento de origem)"
        hint="Cole esse código onde quiser que o form apareça."
      />
      <CopyBox
        label="Código recomendado"
        value={trackedEmbed}
        copied={copied === "tracked"}
        onCopy={() => copy("tracked", trackedEmbed)}
        mono
      />
      <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
        Esse código captura automaticamente <code className="font-mono">utm_source</code>,{" "}
        <code className="font-mono">utm_medium</code>, <code className="font-mono">utm_campaign</code>,{" "}
        <code className="font-mono">gclid</code> e <code className="font-mono">fbclid</code> da URL
        da página onde for colado e repassa pro formulário — assim cada lead chega com a origem da
        campanha preenchida. Também guarda a origem por 90 dias (first touch) e completa links/botões
        que apontem pro formulário. <b>Se você já embedou com o iframe antigo, troque pelo código
        acima</b> — o iframe puro não repassa nada.
      </p>
      <div className="rounded-[6px] border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed">
        ⚠️ <b>Importante:</b> se o anúncio manda o visitante pra OUTRA página (ex.: a home com{" "}
        <code className="font-mono">?utm_source=...</code>) e o formulário fica em uma página
        diferente, instale a linha do <code className="font-mono">&lt;script&gt;</code> no{" "}
        <b>site inteiro</b> (no <code className="font-mono">&lt;head&gt;</code> global / código
        personalizado do site). É ela que captura a origem na página de ENTRADA e guarda pra quando
        o visitante chegar no formulário. A <code className="font-mono">&lt;div&gt;</code> fica só
        onde o form aparece.
      </div>
      <CopyBox
        label="Script pro site inteiro (head global)"
        value={`<script src="${appOrigin}/api/script/form-embed.js" defer></script>`}
        copied={copied === "sitewide"}
        onCopy={() => copy("sitewide", `<script src="${appOrigin}/api/script/form-embed.js" defer></script>`)}
        mono
      />
      <CopyBox
        label="Alternativa: iframe puro (sem rastreamento de origem)"
        value={iframe}
        copied={copied === "iframe"}
        onCopy={() => copy("iframe", iframe)}
        mono
      />
      <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
        O form se ajusta à largura do container. Pra fixar uma altura, edite{" "}
        <code className="font-mono">min-height</code> no estilo (no código recomendado, use o
        atributo <code className="font-mono">data-convertfy-height=&quot;600&quot;</code> na div).
      </p>

      <Divider />

      <SectionTitle
        title="Passo 3 — Como instalar na sua página de vendas"
        hint="Guia rápido por plataforma."
      />
      <PlatformGuide
        platforms={[
          {
            name: "WordPress",
            steps: [
              "Edite a página onde quer o form",
              'Adicione um bloco "HTML personalizado" (Custom HTML)',
              "Cole o código do iframe acima",
              "Salvar / atualizar",
            ],
          },
          {
            name: "Shopify",
            steps: [
              "Online Store → Pages → escolha a página",
              'Clique no ícone "Mostrar HTML" (<>)',
              "Cole o iframe onde quiser",
              "Salvar",
            ],
          },
          {
            name: "Webflow / Wix / Squarespace",
            steps: [
              "Adicione um elemento Custom Code / Embed",
              "Cole o iframe",
              "Publique a página",
            ],
          },
          {
            name: "Site customizado (HTML/Next.js)",
            steps: [
              "Cole o iframe diretamente no JSX/HTML",
              'Em Next.js, considere usar dangerouslySetInnerHTML ou um <iframe /> nativo',
            ],
          },
        ]}
      />
    </Stack>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sub-componentes / helpers
// ────────────────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status: "draft" | "published" | "archived"
}) {
  const map = {
    published: {
      label: "Publicado",
      cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    draft: {
      label: "Rascunho",
      cls: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/65",
    },
    archived: {
      label: "Arquivado",
      cls: "bg-slate-100 text-slate-500 dark:bg-white/[0.04] dark:text-white/45",
    },
  } as const
  const m = map[status]
  return (
    <span
      className={
        "inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] " + m.cls
      }
    >
      {m.label}
    </span>
  )
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4 space-y-4">{children}</div>
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900 dark:text-white/90">
        {title}
      </h3>
      {hint && (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] -mx-5" />
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-slate-700 dark:text-white/75">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-white/45 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[6px] bg-slate-100 dark:bg-white/[0.04] p-0.5">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              "h-7 px-3 rounded-[4px] text-[11px] font-medium transition-colors " +
              (active
                ? "bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white")
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * As três cores de um gradiente, com PRÉVIA.
 *
 * Um só componente para o fundo da página, o card e o botão: escritos
 * três vezes, o ângulo aparece num e falta nos outros — que era o caso
 * antes disto (o `buttonGradient` já tinha `angle` no tipo e nenhum
 * controle na tela, então o ângulo do botão era sempre o default).
 *
 * A faixa de prévia existe porque gradiente é a única decisão de cor
 * que dois quadradinhos não descrevem: o que se julga é a transição.
 */
function GradienteRows({
  valor,
  onChange,
}: {
  valor: { from: string; to: string; angle?: number }
  onChange: (g: { from: string; to: string; angle?: number }) => void
}) {
  return (
    <>
      <div
        className="h-8 rounded-[5px] border border-black/[0.08] dark:border-white/[0.10]"
        style={{ background: gradientCss(valor) ?? undefined }}
      />
      <ColorRow label="De" value={valor.from} onChange={(v) => onChange({ ...valor, from: v })} />
      <ColorRow label="Para" value={valor.to} onChange={(v) => onChange({ ...valor, to: v })} />
      <NumberRow
        label="Ângulo"
        value={valor.angle ?? 135}
        onChange={(v) => onChange({ ...valor, angle: v })}
        min={0}
        max={360}
        suffix="°"
      />
    </>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[10px] text-slate-500 dark:text-white/45 w-10 shrink-0">
          {label}
        </span>
      )}
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded-[4px] border border-slate-200 dark:border-white/[0.10] cursor-pointer p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="crm-input flex-1 font-mono text-[11px]"
        style={{ height: 28 }}
      />
    </div>
  )
}

function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[10px] text-slate-500 dark:text-white/45 shrink-0 w-12">
          {label}
        </span>
      )}
      {min != null && max != null && (
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (Number.isFinite(n)) onChange(n)
          }}
          className="flex-1"
        />
      )}
      <div className="relative w-[68px] shrink-0">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (Number.isFinite(n)) onChange(n)
          }}
          className="crm-input w-full font-mono text-[11px]"
          style={{ height: 28, paddingRight: suffix ? 22 : undefined }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-white/40">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 text-[12px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer mt-0.5"
      />
      <span className="text-slate-700 dark:text-white/75">{label}</span>
    </label>
  )
}

function CopyBox({
  label,
  value,
  copied,
  onCopy,
  mono = false,
}: {
  label?: string
  value: string
  copied: boolean
  onCopy: () => void
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-[11px] font-medium text-slate-700 dark:text-white/75">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <code
          className={
            "flex-1 block px-2.5 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.04] text-slate-800 dark:text-white/85 break-all text-[11px] " +
            (mono ? "font-mono" : "")
          }
        >
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-[4px] bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-white/80 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors"
          title={copied ? "Copiado!" : "Copiar"}
        >
          {copied ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

function PlatformGuide({
  platforms,
}: {
  platforms: Array<{ name: string; steps: string[] }>
}) {
  const [open, setOpen] = useState<string | null>(platforms[0]?.name ?? null)
  return (
    <div className="space-y-1">
      {platforms.map((p) => {
        const expanded = open === p.name
        return (
          <div
            key={p.name}
            className="rounded-[6px] border border-black/[0.08] dark:border-white/[0.10] overflow-hidden bg-white dark:bg-white/[0.02]"
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : p.name)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-slate-800 dark:text-white/85 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            >
              <span>{p.name}</span>
              <ChevronDown
                className={
                  "h-3.5 w-3.5 text-slate-400 transition-transform " +
                  (expanded ? "rotate-180" : "")
                }
              />
            </button>
            {expanded && (
              <ol className="px-3 pb-3 pt-0 list-decimal list-inside space-y-1 text-[11px] text-slate-700 dark:text-white/70 leading-relaxed">
                {p.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}


// ────────────────────────────────────────────────────────────────────
// Field editor
// ────────────────────────────────────────────────────────────────────

function FieldEditor({
  field,
  desvios,
  irParaFluxo,
  tela,
  podeJuntar,
  onAgrupar,
  arrastavel,
  onArrastarInicio,
  onArrastarFim,
  faixasPorMoeda,
  onFaixasPorMoeda,
  candidatasDeRegiao = [],
  leadCustomFields,
  dealCustomFields,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  semMoldura,
}: {
  field: FormField
  desvios: number
  irParaFluxo?: () => void
  /** A tela desta pergunta. Ausente no formato de página única. */
  tela?: { numero: number; tamanho: number; cabeca: boolean; titulo: string }
  podeJuntar?: boolean
  onAgrupar?: (patch: { mesma_tela?: boolean; titulo_da_tela?: string | null }) => void
  arrastavel?: boolean
  onArrastarInicio?: () => void
  onArrastarFim?: () => void
  /** `opcoes_por_moeda`/`moeda_de` — vivem no schema, não no campo. */
  faixasPorMoeda?: { ligado: boolean; moeda_de: string | null }
  onFaixasPorMoeda?: (v: { ligado: boolean; moeda_de: string | null }) => void
  /** Perguntas que podem decidir a moeda (as de escolha, antes desta). */
  candidatasDeRegiao?: Array<{ ref: string; label: string }>
  leadCustomFields: Array<{ id: string; key: string; label: string; field_type: string }>
  dealCustomFields: Array<{ id: string; key: string; label: string; field_type: string }>
  onChange: (patch: Partial<FormField>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  /**
   * No inspetor não há acordeão nem moldura: a pergunta já foi escolhida
   * na espinha, e um cartão dentro de um painel de 340px é o cartão
   * aninhado que a régua de craft recusa.
   */
  semMoldura?: boolean
}) {
  const totalCustomFields = leadCustomFields.length + dealCustomFields.length
  const [open, setOpen] = useState(false)
  const aberto = semMoldura || open
  /**
   * `draggable` só liga enquanto a ALÇA está pressionada.
   *
   * Sempre ligado, arrastar a partir do campo de texto do rótulo moveria
   * a pergunta em vez de selecionar o texto — o navegador dá o arrasto
   * do elemento a quem começa nele, e o usuário perderia a seleção sem
   * entender por quê.
   */
  const [pelaAlca, setPelaAlca] = useState(false)

  const showOptions =
    field.field_type === "select" ||
    field.field_type === "radio" ||
    field.field_type === "multi_select"

  const optionsText = (field.options ?? [])
    .map((o) => (typeof o === "string" ? o : o.label))
    .join("\n")

  return (
    <div
      className={
        semMoldura
          ? ""
          : "rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] overflow-hidden"
      }
      draggable={Boolean(arrastavel) && pelaAlca}
      onDragStart={(e) => {
        // `setData` é obrigatório no Firefox: sem ele o arrasto nem
        // começa, e o defeito só aparece num navegador.
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", field.id ?? field.label)
        onArrastarInicio?.()
      }}
      onDragEnd={() => {
        setPelaAlca(false)
        onArrastarFim?.()
      }}
    >
      <div
        className={
          semMoldura ? "flex items-center gap-2 pb-2" : "flex items-center gap-2 px-2.5 py-2"
        }
      >
        {!semMoldura && (
        <span
          onMouseDown={() => {
            if (arrastavel) setPelaAlca(true)
          }}
          onMouseUp={() => setPelaAlca(false)}
          title={arrastavel ? "Arraste para juntar com outra pergunta ou separar em tela própria" : undefined}
          className={`shrink-0 ${arrastavel ? "cursor-grab" : "cursor-default"}`}
        >
          <GripVertical
            className={`h-3.5 w-3.5 ${
              arrastavel
                ? "text-slate-400 hover:text-slate-600 dark:text-white/35 dark:hover:text-white/60"
                : "text-slate-300 dark:text-white/25"
            }`}
          />
        </span>
        )}
        <input
          type="text"
          placeholder={semMoldura ? "O que você quer perguntar?" : "Label do campo"}
          aria-label="Pergunta"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className={
            semMoldura
              ? "min-w-0 flex-1 rounded-[5px] border border-black/[0.10] bg-white px-2 py-1.5 text-[13px] font-medium text-slate-900 outline-none focus-visible:border-blue-500 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-white"
              : "flex-1 min-w-0 bg-transparent text-[13px] font-medium text-slate-900 dark:text-white outline-none"
          }
        />
        {podeJuntar && onAgrupar && (
          <button
            type="button"
            onClick={() => onAgrupar({ mesma_tela: Boolean(tela?.cabeca) })}
            title={
              tela?.cabeca
                ? "Juntar: esta pergunta passa a dividir a tela com a de cima"
                : "Separar: esta pergunta volta a ter tela própria"
            }
            aria-pressed={!tela?.cabeca}
            className={
              // Rótulo curto nos DOIS estados: com a lista cheia, um
              // "Junta com a de cima" por linha come o título da
              // pergunta, que é o que o operador está lendo.
              "shrink-0 inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium " +
              (tela?.cabeca
                ? "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-white/35 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
                : "bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-white/80")
            }
          >
            <CornerDownRight className="h-3 w-3" />
            Junta
          </button>
        )}
        {desvios > 0 && irParaFluxo && (
          <button
            type="button"
            onClick={irParaFluxo}
            title="Ver no fluxo"
            className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-400/10 dark:text-blue-300 dark:hover:bg-blue-400/20"
          >
            {desvios} {desvios === 1 ? "desvio" : "desvios"}
          </button>
        )}
        {!semMoldura && (
          <>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-white/40 font-mono">
              {field.field_type}
            </span>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="shrink-0 text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/85 p-0.5"
              aria-label={open ? "Fechar" : "Editar"}
            >
              <ChevronDown
                className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")}
              />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-slate-400 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 p-0.5"
          aria-label="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {aberto && (
        <div
          className={
            semMoldura
              ? "space-y-2"
              : "px-2.5 pb-2.5 space-y-2 border-t border-slate-100 dark:border-white/[0.06] pt-2.5"
          }
        >
          {/*
            O título só aparece na CABEÇA de uma tela com mais de uma
            pergunta. Numa tela de pergunta única ele seria um segundo
            título competindo com o primeiro — ali o rótulo já é a
            pergunta, e oferecer o campo convidaria a escrever os dois.
          */}
          {tela && tela.cabeca && tela.tamanho > 1 && onAgrupar && (
            <Field
              label={`Título da tela ${tela.numero}`}
              hint={`Aparece acima das ${tela.tamanho} perguntas desta tela. Sem ele, elas aparecem soltas, cada uma com o próprio rótulo.`}
            >
              <input
                type="text"
                value={tela.titulo}
                onChange={(e) => onAgrupar({ titulo_da_tela: e.target.value })}
                placeholder="Ex.: Antes de tudo, seus dados de contato"
                className="crm-input text-[11px]"
              />
            </Field>
          )}
          <div className="space-y-2">
            <Field label="Tipo de resposta">
            <select
              value={field.field_type}
              onChange={(e) => {
                const newType = e.target.value
                const patch: Partial<FormField> = { field_type: newType }
                // Telefone/WhatsApp: ativa seletor de pais + mascara por
                // default. Quase todo phone field e BR/WhatsApp e usuario
                // espera ja vir formatado.
                if (
                  newType === "phone" &&
                  (field.validation as { countryCode?: boolean } | undefined)?.countryCode === undefined
                ) {
                  patch.validation = {
                    ...(field.validation ?? {}),
                    countryCode: true,
                  }
                }
                onChange(patch)
              }}
              className="crm-input text-[11px]"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            </Field>
            <Field label="Guarda no CRM como">
            <select
              value={field.map_to_lead_field ?? ""}
              onChange={(e) => onChange({ map_to_lead_field: e.target.value || null })}
              className="crm-input text-[11px]"
            >
              <optgroup label="Padrão">
                {LEAD_FIELD_MAP.map((m) => (
                  <option key={m.value || "_none"} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              {leadCustomFields.length > 0 && (
                <optgroup label="Personalizados (Lead)">
                  {leadCustomFields.map((c) => (
                    /* Mantem prefixo "custom:" sem entity pra retro-
                       compatibilidade com forms antigos. */
                    <option key={c.id} value={`custom:${c.key}`}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {dealCustomFields.length > 0 && (
                <optgroup label="Personalizados (Deal)">
                  {dealCustomFields.map((c) => (
                    <option key={c.id} value={`custom_deal:${c.key}`}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            </Field>
          </div>
          {totalCustomFields === 0 ? (
            <p className="text-[10px] text-slate-500 dark:text-white/45 leading-relaxed">
              Pra adicionar mais campos (ex: URL da loja, faturamento),{" "}
              <a
                href="/admin/settings/custom-fields"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                crie campos personalizados
              </a>
              .
            </p>
          ) : (
            <p className="text-[10px] text-slate-500 dark:text-white/45 leading-relaxed">
              <a
                href="/admin/settings/custom-fields"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Gerenciar campos personalizados ↗
              </a>
            </p>
          )}
          <Field label="Texto de exemplo" hint="Fica apagado dentro do campo, até a pessoa digitar.">
            <input
              type="text"
              placeholder="Ex.: voce@sualoja.com"
              value={field.placeholder ?? ""}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              className="crm-input w-full text-[12px]"
            />
          </Field>

          {showOptions && (
            <Field label="Opções" hint="Uma por linha. É o que a pessoa escolhe.">
            <textarea
              rows={3}
              value={optionsText}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder={"Sim\nNão\nTalvez"}
              className="crm-input w-full text-[11px]"
            />
            </Field>
          )}

          {/*
            Faixas por moeda: a lista acima deixa de valer e as opções
            passam a ser a escada da moeda da região respondida. Fica
            aqui, ao lado das opções, porque é o que as SUBSTITUI — num
            painel separado o operador editaria a lista de cima sem
            entender por que ela não aparece no formulário.
          */}
          {showOptions && onFaixasPorMoeda && (
            <div className="rounded-[5px] border border-slate-200 p-2 dark:border-white/[0.10]">
              <label className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-white/75">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(faixasPorMoeda?.ligado)}
                  onChange={(e) =>
                    onFaixasPorMoeda(
                      e.target.checked
                        ? { ligado: true, moeda_de: faixasPorMoeda?.moeda_de ?? candidatasDeRegiao[0]?.ref ?? null }
                        : { ligado: false, moeda_de: null },
                    )
                  }
                  disabled={candidatasDeRegiao.length === 0 && !faixasPorMoeda?.ligado}
                />
                <span>
                  Faixas na moeda de quem responde
                  <span className="block text-[10px] text-slate-500 dark:text-white/45">
                    {candidatasDeRegiao.length === 0 && !faixasPorMoeda?.ligado
                      ? "Crie antes uma pergunta de região (Brasil, Estados Unidos, Europa…) — é ela que decide a moeda."
                      : "A lista acima é ignorada: as faixas passam a ser a escada em real, dólar ou euro, conforme a região respondida."}
                  </span>
                </span>
              </label>
              {faixasPorMoeda?.ligado && (
                <select
                  value={faixasPorMoeda.moeda_de ?? ""}
                  onChange={(e) =>
                    onFaixasPorMoeda({ ligado: true, moeda_de: e.target.value || null })
                  }
                  className="crm-input mt-2 w-full text-[11px]"
                >
                  <option value="">Pergunta que decide a moeda…</option>
                  {candidatasDeRegiao.map((c) => (
                    <option key={c.ref} value={c.ref}>
                      {c.label || c.ref}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-white/75">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
              />
              Obrigatório
            </label>

            {field.field_type === "phone" && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-white/75">
                <input
                  type="checkbox"
                  checked={(field.validation as { countryCode?: boolean } | undefined)?.countryCode === true}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...(field.validation ?? {}),
                        countryCode: e.target.checked,
                      },
                    })
                  }
                />
                Com seletor de país (+55, +1...)
              </label>
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {onMoveUp && (
                <button
                  type="button"
                  onClick={onMoveUp}
                  className="text-[10px] px-1 text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white"
                  aria-label="Mover pra cima"
                >
                  ▲
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  onClick={onMoveDown}
                  className="text-[10px] px-1 text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white"
                  aria-label="Mover pra baixo"
                >
                  ▼
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
