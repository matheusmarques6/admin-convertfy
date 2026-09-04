"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code as CodeIcon,
  Copy,
  CopyPlus,
  Download,
  Eye,
  FileImage,
  FileText,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Send,
  Square,
  Tag as TagIcon,
  Trash2,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { InlineEditField } from "@/components/crm/inline-edit-field"
import { ScaledEmailFrame } from "@/components/emails/scaled-email-frame"
import { annotateRegionsForEditing } from "@/lib/agents/html/block-regions"
import { annotateFontDeclarations } from "@/lib/agents/typography/annotate"
import { applyTypographyOps } from "@/lib/agents/typography/apply"
import { extractTypographyInventory } from "@/lib/agents/typography/inventory"
import { remapFamilies } from "@/lib/agents/typography/swap-fonts"
import type { OpDescartada } from "@/lib/agents/typography/rules"
import {
  DRAFT_VAZIO,
  EmailTypographyPanel,
  draftTemMudanca,
  type TipografiaDraft,
} from "./email-typography-panel"
import { buildQaBlockViews } from "@/lib/agents/html/qa-views"
import { renderEmailHtml } from "@/lib/email-workspace/render-html"
import { emailExportBasename } from "@/lib/email-workspace/export-naming"
import { blockCopyFields } from "@/lib/email-workspace/block-copy-fields"
import {
  limiteDoCampo,
  resumoDeEstouros,
  type BlocoComContrato,
} from "@/lib/email-workspace/copy-fit"
import type { BlueprintBlockField } from "@/types/email-generation"
import type {
  BlockType,
  EmailBlock,
  EmailFlow,
  EmailFlowEmail,
  EmailQAItem,
  HeroBlockContent,
  CouponBlockContent,
  ProductsBlockContent,
  TextBlockContent,
} from "@/types/email-workspace"
import { BlockImageInstructionField } from "./block-image-instruction-field"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

interface EmailDetailResponse {
  email: EmailFlowEmail & {
    blocks: EmailBlock[]
    qa_items: EmailQAItem[]
    // Email "somente texto" (email_blueprints.text_only): a view abre em
    // Copy e esconde render/HTML — designers veem só o texto.
    text_only?: boolean
  }
}

// Espelha o retorno de GET /api/admin/stores/[id]/generated. A aba "Ref"
// mostra o HTML de ARQUITETURA que o Montador (Component Assembler, agente #3)
// gerou para esta loja×email — só leitura, não altera o flow.
interface GeneratedRefItem {
  flow_type: string
  email_number: number
  reference: {
    html: string
    source: string
    model: string | null
    updated_at: string
  } | null
  // Referência que o HTML agent EFETIVAMENTE consome: loja > global > nenhum.
  consumed?: {
    match: "loja" | "global" | "nenhum"
    html: string | null
  }
}

interface EmailDetailViewProps {
  storeId: string
  flow: EmailFlow
  emailId: string
  onEmailUpdated: () => void
  onNavigate: (emailId: string) => void
  onEmailDeleted?: () => void
  onEmailDuplicated?: (newEmailId: string) => void
}

export function EmailDetailView({
  storeId,
  flow,
  emailId,
  onEmailUpdated,
  onNavigate,
  onEmailDeleted,
  onEmailDuplicated,
}: EmailDetailViewProps) {
  const toast = useToast()
  const { data, mutate } = useSWR<{ data?: EmailDetailResponse } & EmailDetailResponse>(
    `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
    fetcher,
  )

  const email = data?.data?.email ?? data?.email
  const blocks = email?.blocks ?? []
  const qaItems = email?.qa_items ?? []

  const [viewMode, setViewMode] = useState<"render" | "copy" | "html" | "ref">(
    "render",
  )
  const [activeTab, setActiveTab] = useState<"struct" | "qa" | "tipo">("struct")
  const [width, setWidth] = useState<number>(600)

  const isTextOnly = !!email?.text_only

  // Copy acima do limite da caixa. Sai dos PRÓPRIOS blocos (`fields` +
  // `content`, que a rota já devolve), então não há requisição a mais e o
  // número acompanha o que a pessoa acabou de digitar na aba Copy — não é
  // um retrato do run. Até 28/08 o estouro só aparecia no email
  // renderizado, com a frase vazando da caixa.
  const estouros = useMemo(
    () => resumoDeEstouros(blocks as BlocoComContrato[]),
    [blocks],
  )

  // Aba "Ref": busca lazy (só quando a aba abre) da arquitetura gerada pelo
  // Montador para esta loja. Reusa o endpoint de inspeção /generated.
  const { data: generatedData } = useSWR<{
    items?: GeneratedRefItem[]
    data?: { items?: GeneratedRefItem[] }
  }>(
    viewMode === "ref" ? `/api/admin/stores/${storeId}/generated` : null,
    fetcher,
  )
  const refItem = useMemo<GeneratedRefItem | null>(() => {
    const items = generatedData?.data?.items ?? generatedData?.items ?? []
    return (
      items.find(
        (it) =>
          it.flow_type === flow.flow_type &&
          it.email_number === (email?.number ?? -1),
      ) ?? null
    )
  }, [generatedData, flow.flow_type, email?.number])

  // Reset tab quando troca de email. Somente-texto abre direto em Copy —
  // o render mostraria placeholders {{...}} (html null) e confundiria o
  // designer; o entregável desses emails É o texto.
  useEffect(() => {
    setActiveTab("struct")
    setViewMode(isTextOnly ? "copy" : "render")
  }, [emailId, isTextOnly])

  // Navegação prev/next entre emails do flow
  const emails = flow.emails ?? []
  const currentIdx = emails.findIndex((e) => e.id === emailId)
  const prevEmail = currentIdx > 0 ? emails[currentIdx - 1] : null
  const nextEmail =
    currentIdx >= 0 && currentIdx < emails.length - 1
      ? emails[currentIdx + 1]
      : null

  // Atalhos: J = email anterior, K = proximo, [ / ] = tab Struct/QA
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === "j" || ev.key === "J") {
        if (prevEmail) {
          ev.preventDefault()
          onNavigate(prevEmail.id)
        }
      } else if (ev.key === "k" || ev.key === "K") {
        if (nextEmail) {
          ev.preventDefault()
          onNavigate(nextEmail.id)
        }
      } else if (ev.key === "[") {
        ev.preventDefault()
        setActiveTab("struct")
      } else if (ev.key === "]") {
        ev.preventDefault()
        setActiveTab("qa")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prevEmail, nextEmail, onNavigate])

  const blocksTotal = blocks.length
  const blocksApplied = blocks.filter((b) => b.applied).length
  const qaTotal = qaItems.length
  const qaDone = qaItems.filter((q) => q.done).length

  const patchEmail = async (update: Record<string, unknown>) => {
    const res = await fetch(
      `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  const patchBlock = async (
    blockId: string,
    update: Record<string, unknown>,
  ) => {
    const res = await fetch(`/api/admin/email-blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  const patchQA = async (itemId: string, update: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/email-qa/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
    }
    await mutate()
    onEmailUpdated()
  }

  const createBlock = async (blockType: BlockType) => {
    try {
      const res = await fetch(`/api/admin/email-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, block_type: blockType }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao criar bloco")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Bloco adicionado", description: `${blockType} criado` })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao criar bloco",
        description: (e as Error).message,
      })
    }
  }

  const deleteBlock = async (blockId: string) => {
    try {
      const res = await fetch(`/api/admin/email-blocks/${blockId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao remover bloco")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Bloco removido" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: (e as Error).message,
      })
    }
  }

  const reorderBlocks = async (newOrder: EmailBlock[]) => {
    try {
      const res = await fetch(`/api/admin/email-blocks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: emailId,
          order: newOrder.map((b) => b.id),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao reordenar")
      }
      await mutate()
      onEmailUpdated()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao reordenar",
        description: (e as Error).message,
      })
    }
  }

  /**
   * Reordena o RASCUNHO (modo de edição). A ordem só chega ao servidor no
   * salvar, junto da justificativa: a mudança de estrutura sem o porquê é
   * exatamente o que a próxima geração desfaz.
   */
  const moverNoRascunho = (de: number, para: number) => {
    const visiveis = blocosVisiveis.map((b) => b.id)
    if (para < 0 || para >= visiveis.length || de === para) return
    const nova = [...visiveis]
    const [movido] = nova.splice(de, 1)
    nova.splice(para, 0, movido)
    // Os removidos continuam no draftOrder (a rota precisa da partição
    // completa); só não aparecem na tela.
    setDraftOrder([...nova, ...draftRemoved])
  }

  const moveBlock = async (blockId: string, direction: "up" | "down") => {
    const visiveis = blocosVisiveis.map((b) => b.id)
    const idx = visiveis.indexOf(blockId)
    if (idx === -1) return
    if (editing) {
      moverNoRascunho(idx, direction === "up" ? idx - 1 : idx + 1)
      return
    }
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= blocks.length) return
    const newOrder = [...blocks]
    ;[newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]]
    await reorderBlocks(newOrder)
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return
    if (editing) {
      moverNoRascunho(result.source.index, result.destination.index)
      return
    }
    const newOrder = [...blocks]
    const [moved] = newOrder.splice(result.source.index, 1)
    newOrder.splice(result.destination.index, 0, moved)
    await reorderBlocks(newOrder)
  }

  const createQAItem = async (label: string) => {
    try {
      const res = await fetch(`/api/admin/email-qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, label }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao criar item")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Item adicionado ao checklist" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao criar item",
        description: (e as Error).message,
      })
    }
  }

  const deleteQAItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/admin/email-qa/${itemId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao remover")
      }
      await mutate()
      onEmailUpdated()
      toast.toast({ title: "Item removido" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover item",
        description: (e as Error).message,
      })
    }
  }

  const deleteEmail = async () => {
    try {
      const res = await fetch(
        `/api/admin/email-flows/${flow.id}/emails/${emailId}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao remover")
      }
      toast.toast({ title: "E-mail removido" })
      onEmailDeleted?.()
      onEmailUpdated()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover e-mail",
        description: (e as Error).message,
      })
    }
  }

  const duplicateEmail = async () => {
    try {
      const res = await fetch(
        `/api/admin/email-flows/${flow.id}/emails/${emailId}/duplicate`,
        { method: "POST" },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao duplicar")
      }
      const json = await res.json()
      const dup = json?.data?.email ?? json?.email
      toast.toast({
        title: "E-mail duplicado",
        description: dup?.name ?? "Cópia criada",
      })
      onEmailUpdated()
      if (dup?.id) onEmailDuplicated?.(dup.id)
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao duplicar e-mail",
        description: (e as Error).message,
      })
    }
  }

  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [sendTestOpen, setSendTestOpen] = useState(false)
  // ── Modo de edição da ESTRUTURA (27/08) ──────────────────────────────
  // Reordenar e remover viram uma edição LOCAL: nada vai ao servidor antes
  // do salvar, e o salvar exige a justificativa que os agentes vão ler na
  // próxima geração. Fora do modo, a estrutura não se mexe por acidente —
  // antes um arrastar sem querer já reordenava e persistia calado.
  const [editing, setEditing] = useState(false)
  const [draftOrder, setDraftOrder] = useState<string[]>([])
  const [draftRemoved, setDraftRemoved] = useState<string[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  // Tipografia: rascunho local, como o de estrutura — nada é gravado até
  // "Aplicar". `fonteSelecionada` é o índice da declaração no inventário, e
  // é o que liga o clique no preview ao painel.
  const [tipoDraft, setTipoDraft] = useState<TipografiaDraft>(DRAFT_VAZIO)
  const [fonteSelecionada, setFonteSelecionada] = useState<number | null>(null)
  const [tipoAvisos, setTipoAvisos] = useState<OpDescartada[]>([])
  const [salvandoTipo, setSalvandoTipo] = useState(false)

  const entrarNaEdicao = () => {
    setDraftOrder(blocks.map((b) => b.id))
    setDraftRemoved([])
    setEditing(true)
  }
  const sairDaEdicao = () => {
    setEditing(false)
    setDraftOrder([])
    setDraftRemoved([])
    setSaveOpen(false)
    setTipoDraft(DRAFT_VAZIO)
    setFonteSelecionada(null)
    setTipoAvisos([])
    if (activeTab === "tipo") setActiveTab("struct")
  }

  // Os blocos como a tela deve mostrá-los: no modo de edição, a ordem do
  // rascunho (sem os marcados para remoção); fora dele, o que veio da API.
  const blocosVisiveis = useMemo(() => {
    if (!editing) return blocks
    const porId = new Map(blocks.map((b) => [b.id, b]))
    return draftOrder
      .filter((id) => !draftRemoved.includes(id))
      .map((id) => porId.get(id))
      .filter((b): b is EmailBlock => Boolean(b))
  }, [editing, blocks, draftOrder, draftRemoved])

  /**
   * Mapa índice-da-região ↔ id-do-bloco.
   *
   * Reusa `buildQaBlockViews` — o MESMO casamento sequencial por tipo que a
   * rota de revisão e o QA fazem. Um mapeamento próprio aqui seria o
   * caminho para a tela mover um bloco e o servidor mover outro.
   */
  const mapaRegioes = useMemo(() => {
    const marcado = email?.html_marked
    if (!marcado) return null
    const views = buildQaBlockViews(
      marcado,
      blocks.map((b) => ({
        id: b.id,
        position: b.position,
        block_type: b.block_type,
      })),
    )
    const blocoPorRegiao = new Map<number, string>()
    const regiaoPorBloco = new Map<string, number>()
    for (const v of views) {
      if (!v.block_id) continue
      blocoPorRegiao.set(v.indice, v.block_id)
      regiaoPorBloco.set(v.block_id, v.indice)
    }
    return { blocoPorRegiao, regiaoPorBloco }
  }, [email?.html_marked, blocks])

  /** O email é editável no preview? Sem documento marcado, não. */
  const editandoTipografia = editing && activeTab === "tipo"
  const previewEditavel =
    editing &&
    !editandoTipografia &&
    Boolean(email?.html_marked) &&
    Boolean(mapaRegioes)

  /**
   * Documento BASE da tipografia — o mesmo em que a rota vai escrever.
   *
   * `html_marked` quando existe (preserva os marcadores), senão `html`.
   * Tipografia não exige documento marcado, ao contrário da estrutura: o
   * inventário funciona sobre qualquer HTML, e só o rótulo do bloco se
   * perde. Os índices são os mesmos nos dois, porque os marcadores são
   * comentários e não carregam `font-family`.
   */
  const docTipografia = email?.html_marked || email?.html || ""

  /** O inventário do BASE: é ele que dá endereço às ops. */
  const inventarioTipo = useMemo(
    () => (editandoTipografia && docTipografia ? extractTypographyInventory(docTipografia) : []),
    [editandoTipografia, docTipografia],
  )

  /**
   * HTML do preview. Em edição de estrutura vem do documento MARCADO e
   * anotado — é o que dá endereço a cada região. Em edição de tipografia
   * roda as MESMAS funções puras que a rota vai rodar, na mesma ordem, e só
   * então anota: o que se vê é o que se grava.
   */
  const htmlDoPreview = useMemo(() => {
    if (!email) return ""
    if (editandoTipografia && docTipografia) {
      const comFamilias = remapFamilies(docTipografia, tipoDraft.familias).html
      const comOps = applyTypographyOps(
        comFamilias,
        Object.values(tipoDraft.ops),
        null,
      ).html
      return annotateFontDeclarations(comOps)
    }
    if (previewEditavel && email.html_marked) {
      return annotateRegionsForEditing(email.html_marked)
    }
    return email.html || renderEmailHtml(email, blocks)
  }, [email, blocks, previewEditavel, editandoTipografia, docTipografia, tipoDraft])

  /**
   * Grava o rascunho de tipografia. Manda o `esperado` de cada op: entre a
   * tela carregar e este clique, um re-render pode ter reescrito o
   * documento — e aí o índice 14 é outro elemento. A rota confere item a
   * item e devolve o que não bate em vez de acertar o lugar errado.
   */
  const aplicarTipografia = async () => {
    if (!email || !draftTemMudanca(tipoDraft)) return
    setSalvandoTipo(true)
    try {
      const porIndice = new Map(inventarioTipo.map((o) => [o.index, o]))
      const res = await fetch(`/api/admin/emails/${email.id}/typography`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "aplicar",
          familias: Object.entries(tipoDraft.familias).map(([de, para]) => ({ de, para })),
          ops: Object.values(tipoDraft.ops).map((op) => {
            const oc = porIndice.get(op.item)
            return {
              ...op,
              esperado: oc
                ? { family: oc.family, sizePx: oc.sizePx, weight: oc.weight, tag: oc.tag }
                : undefined,
            }
          }),
          base_updated_at: email.updated_at,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean
            motivo?: string
            avisos?: OpDescartada[]
            descartadas?: OpDescartada[]
            desatualizados?: Array<{ item: number }>
            error?: string
          }
        | null
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      if (json?.ok === false && json.motivo === "documento_mudou") {
        toast.toast({
          variant: "destructive",
          title: "O e-mail mudou em outra aba",
          description: "Recarregue antes de aplicar — os ajustes apontam para o documento antigo.",
        })
        await mutate()
        return
      }
      const desatualizados = json?.desatualizados?.length ?? 0
      if (desatualizados > 0) {
        toast.toast({
          variant: "destructive",
          title: "Alguns ajustes não foram aplicados",
          description: `${desatualizados} apontavam para um lugar que não existe mais no e-mail.`,
        })
      }
      setTipoAvisos([...(json?.avisos ?? []), ...(json?.descartadas ?? [])])
      setTipoDraft(DRAFT_VAZIO)
      setFonteSelecionada(null)
      await mutate()
      onEmailUpdated?.()
      if (desatualizados === 0) toast.toast({ title: "Tipografia aplicada" })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao aplicar a tipografia",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setSalvandoTipo(false)
    }
  }

  const estruturaAlterada =
    editing &&
    (draftRemoved.length > 0 ||
      draftOrder.some((id, i) => blocks[i]?.id !== id))

  /** Arrasto no preview → a mesma `draftOrder` que o painel usa. */
  const reordenarPelaRegiao = (novaOrdemDeRegioes: number[]) => {
    if (!mapaRegioes) return
    const ids = novaOrdemDeRegioes
      .map((i) => mapaRegioes.blocoPorRegiao.get(i))
      .filter((id): id is string => Boolean(id))
    // Blocos sem região (slot que o Montador pulou) não aparecem no email e
    // não podem sumir da ordem: entram no fim, preservando a partição que a
    // rota exige.
    const semRegiao = draftOrder.filter((id) => !ids.includes(id))
    setDraftOrder([...ids, ...semRegiao])
  }

  const removerPelaRegiao = (indice: number) => {
    const id = mapaRegioes?.blocoPorRegiao.get(indice)
    if (!id) return
    setDraftRemoved((r) => (r.includes(id) ? r : [...r, id]))
  }

  /** Nome do bloco no chip do preview. */
  const rotuloDaRegiao = (indice: number) => {
    const id = mapaRegioes?.blocoPorRegiao.get(indice)
    const bloco = blocks.find((b) => b.id === id)
    return bloco?.label || bloco?.block_type || `bloco ${indice + 1}`
  }

  const salvarRevisao = async (payload: {
    justificativa: string
    alcance: "este_email" | "todo_email_do_flow"
    leitores: { estruturador: boolean; curador: boolean; montador: boolean }
  }) => {
    setSavingReview(true)
    try {
      const res = await fetch(
        `/api/admin/emails/${emailId}/structure-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ordem: draftOrder.filter((id) => !draftRemoved.includes(id)),
            removidos: draftRemoved,
            ...payload,
          }),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.error || "Falha ao salvar")
      }
      await mutate()
      onEmailUpdated()
      sairDaEdicao()
      // A resposta diz o que REALMENTE aconteceu com o HTML: email gerado
      // antes da 20261087 (ou com HTML colado por fora) não tem documento
      // marcado, e a nova ordem só vale na próxima geração. Dizer "salvo" e
      // deixar o preview igual seria mentir.
      toast.toast({
        title: json?.html_atualizado
          ? "Estrutura salva — o email já está na ordem nova"
          : "Ordem e revisão salvas",
        description: json?.html_atualizado
          ? "A justificativa vai para os agentes na próxima geração deste email."
          : "Este email foi gerado antes da edição de estrutura, então o HTML atual não mudou — a ordem nova vale a partir da próxima geração.",
      })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao salvar a revisão",
        description: (e as Error).message,
      })
    } finally {
      setSavingReview(false)
    }
  }

  const sendTest = async (to: string) => {
    try {
      const res = await fetch(
        `/api/admin/email-flows/${flow.id}/emails/${emailId}/send-test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao enviar")
      }
      toast.toast({
        title: "E-mail de teste enviado",
        description: `Para ${to}`,
      })
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao enviar teste",
        description: (e as Error).message,
      })
    }
  }

  const copyToClipboard = async (text: string, label = "Conteúdo") => {
    try {
      await navigator.clipboard.writeText(text)
      toast.toast({ title: `${label} copiado`, description: "Cole no builder" })
    } catch {
      toast.toast({
        variant: "destructive",
        title: "Falha ao copiar",
        description: "Permita acesso ao clipboard",
      })
    }
  }

  if (!email) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: "var(--crm-gray-500)" }}
      >
        Carregando email...
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <>
      {/* Email title bar (entre topbar e body) */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center rounded-[6px] shrink-0"
            style={{
              width: 28,
              height: 28,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            <FileImage className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-700)",
              }}
            >
              {flow.name}
            </span>
            <ChevronRight
              className="h-3 w-3"
              style={{ color: "var(--crm-gray-300)" }}
            />
            <span
              className="crm-tnum"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                flexShrink: 0,
              }}
            >
              E-mail #{String(email.number).padStart(2, "0")} -
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                minWidth: 80,
              }}
            >
              <InlineEditField
                value={email.name}
                placeholder="Nome do e-mail"
                onSave={(v) => patchEmail({ name: v || "Sem nome" })}
              />
            </span>
            <EmailStatusBadge status={email.status} />
            {isTextOnly && (
              <span
                title="Email somente texto: sem imagem nem HTML gerado — o entregável é o texto"
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "var(--crm-gray-100)",
                  color: "var(--crm-gray-600)",
                  border: "1px solid var(--crm-border)",
                  flexShrink: 0,
                }}
              >
                Somente texto
              </span>
            )}
            {estouros.length > 0 && (
              <span
                title={`Copy acima do limite do slot — a frase vaza da caixa no email:\n${estouros
                  .map((e) => `• ${e.key} (${e.type}): ${e.length}/${e.max_len}`)
                  .join("\n")}`}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "var(--crm-amber-50, #FFFBEB)",
                  color: "#92400E",
                  border: "1px solid var(--crm-amber-100, #FDE68A)",
                  flexShrink: 0,
                }}
              >
                {estouros.length}{" "}
                {estouros.length === 1
                  ? "campo acima do limite"
                  : "campos acima do limite"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mock / Render / HTML toggle. Somente-texto: só Copy — o render
              cairia no renderEmailHtml (html null) com placeholders {{...}}. */}
          <div
            className="inline-flex items-center"
            style={{
              padding: 2,
              background: "var(--crm-gray-100)",
              borderRadius: 6,
            }}
          >
            {!isTextOnly && (
              <ModePillBtn
                icon={<Eye className="h-3 w-3" />}
                label="Render"
                active={viewMode === "render"}
                onClick={() => setViewMode("render")}
              />
            )}
            <ModePillBtn
              icon={<FileText className="h-3 w-3" />}
              label="Copy"
              active={viewMode === "copy"}
              onClick={() => setViewMode("copy")}
            />
            {!isTextOnly && (
              <ModePillBtn
                icon={<CodeIcon className="h-3 w-3" />}
                label="HTML"
                active={viewMode === "html"}
                onClick={() => setViewMode("html")}
              />
            )}
            {!isTextOnly && (
              <ModePillBtn
                icon={<LayoutGrid className="h-3 w-3" />}
                label="Ref"
                active={viewMode === "ref"}
                onClick={() => setViewMode("ref")}
              />
            )}
          </div>
          <button
            onClick={editing ? sairDaEdicao : entrarNaEdicao}
            title={
              editing
                ? "Sair do modo de edição (descarta o que não foi salvo)"
                : "Editar a estrutura: reordenar e remover blocos"
            }
            style={{
              height: 28,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: editing ? "var(--crm-gray-100)" : "var(--crm-gray-900)",
              color: editing ? "var(--crm-gray-700)" : "#fff",
              border: editing ? "1px solid var(--crm-border)" : 0,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {editing ? (
              <ChevronLeft className="h-3 w-3" />
            ) : (
              <LayoutGrid className="h-3 w-3" />
            )}
            {editing ? "Sair da edição" : "Editar"}
          </button>
          <button
            onClick={() => setSendTestOpen(true)}
            title="Enviar e-mail de teste"
            style={{
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "var(--crm-gray-500)",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={async () => {
              if (duplicating) return
              setDuplicating(true)
              try {
                await duplicateEmail()
              } finally {
                setDuplicating(false)
              }
            }}
            disabled={duplicating}
            title="Duplicar e-mail"
            style={{
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "var(--crm-gray-500)",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
              cursor: duplicating ? "default" : "pointer",
              opacity: duplicating ? 0.6 : 1,
            }}
          >
            <CopyPlus className="h-3.5 w-3.5" />
          </button>
          {confirmDeleteEmail ? (
            <div className="inline-flex items-center gap-1">
              <button
                onClick={async () => {
                  setConfirmDeleteEmail(false)
                  await deleteEmail()
                }}
                style={{
                  height: 28,
                  padding: "0 10px",
                  background: "var(--crm-neg)",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Confirmar exclusão
              </button>
              <button
                onClick={() => setConfirmDeleteEmail(false)}
                style={{
                  height: 28,
                  padding: "0 10px",
                  background: "transparent",
                  color: "var(--crm-gray-600)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteEmail(true)}
              title="Excluir e-mail"
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: "var(--crm-gray-500)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body: center + right panel */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Centro: preview */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ background: "var(--crm-gray-50)" }}
        >
          {viewMode === "render" && (
            <EmailRenderPreview
              email={email}
              html={htmlDoPreview}
              width={width}
              editable={previewEditavel}
              selecionavelPorFonte={editandoTipografia}
              fonteSelecionada={fonteSelecionada}
              onSelecionarFonte={setFonteSelecionada}
              avisoSemDocumento={
                editing && !email.html_marked
                  ? "Este email foi gerado antes da edição de estrutura, então não dá para arrastar aqui. Reordene pelo painel à direita: a nova ordem e a justificativa ficam salvas e valem a partir da próxima geração."
                  : null
              }
              rotuloDaRegiao={rotuloDaRegiao}
              onReorder={reordenarPelaRegiao}
              onRemove={removerPelaRegiao}
              onEditSubject={(v) => patchEmail({ subject: v || null })}
              onEditPreheader={(v) => patchEmail({ preheader: v || null })}
              onEditFromName={(v) => patchEmail({ from_name: v || null })}
              onEditFromEmail={(v) => patchEmail({ from_email: v || null })}
              onEditDelay={(v) => {
                const n = v ? Number(v) : null
                return patchEmail({
                  delay_hours: n !== null && !Number.isNaN(n) ? n : null,
                })
              }}
            />
          )}
          {viewMode === "copy" && (
            <EmailCopyView
              email={email}
              blocks={blocks}
              copyToClipboard={copyToClipboard}
            />
          )}
          {viewMode === "html" && (
            <EmailHtmlView
              email={email}
              flowId={flow.id}
              exportBasename={emailExportBasename(flow, email)}
              html={email.html || renderEmailHtml(email, blocks)}
              onCopyAll={(html) => copyToClipboard(html, "HTML completo")}
            />
          )}
          {viewMode === "ref" && (
            <EmailRefView
              item={refItem}
              loading={!generatedData}
              finalHtml={email.html || renderEmailHtml(email, blocks)}
              htmlAgentHtml={email.html_pre_refiner ?? null}
              onCopyAll={(html) => copyToClipboard(html, "HTML de referência")}
            />
          )}
        </div>

        {/* Painel direito: blocos + QA — vira faixa inferior no mobile */}
        <aside
          className="flex flex-col shrink-0 overflow-hidden min-h-0 w-full md:w-[380px] max-h-[50vh] md:max-h-none border-t md:border-t-0 md:border-l"
          style={{
            background: "var(--crm-gray-0)",
            borderColor: "var(--crm-border)",
          }}
        >
          {/* Tabs */}
          <div
            className="flex gap-1 shrink-0"
            style={{
              padding: "10px 16px 0",
              borderBottom: "1px solid var(--crm-gray-100)",
            }}
          >
            <TabBtn
              active={activeTab === "struct"}
              onClick={() => setActiveTab("struct")}
              count={`${blocksApplied}/${blocksTotal}`}
              label="Estrutura & Copy"
            />
            <TabBtn
              active={activeTab === "qa"}
              onClick={() => setActiveTab("qa")}
              count={`${qaDone}/${qaTotal}`}
              label="Checklist QA"
            />
            {/* Tipografia só existe em modo Editar: fora dele não há o que
                rascunhar, e a aba viraria um painel que não salva nada. */}
            {editing && (
              <TabBtn
                active={activeTab === "tipo"}
                onClick={() => setActiveTab("tipo")}
                count={String(
                  Object.keys(tipoDraft.ops).length +
                    Object.keys(tipoDraft.familias).length,
                )}
                label="Tipografia"
              />
            )}
          </div>

          {/* Bulk actions row */}
          {activeTab === "struct" && blocksTotal > 0 && (
            <BulkActionRow
              total={blocksTotal}
              applied={blocksApplied}
              onAll={async () => {
                await Promise.all(
                  blocks
                    .filter((b) => !b.applied)
                    .map((b) => patchBlock(b.id, { applied: true })),
                )
              }}
              onClear={async () => {
                await Promise.all(
                  blocks
                    .filter((b) => b.applied)
                    .map((b) => patchBlock(b.id, { applied: false })),
                )
              }}
              labels={{
                all: "Marcar todos aplicados",
                clear: "Limpar aplicados",
              }}
            />
          )}
          {activeTab === "qa" && qaTotal > 0 && (
            <BulkActionRow
              total={qaTotal}
              applied={qaDone}
              onAll={async () => {
                await Promise.all(
                  qaItems
                    .filter((q) => !q.done)
                    .map((q) => patchQA(q.id, { done: true })),
                )
              }}
              onClear={async () => {
                await Promise.all(
                  qaItems
                    .filter((q) => q.done)
                    .map((q) => patchQA(q.id, { done: false })),
                )
              }}
              labels={{
                all: "Marcar tudo concluído",
                clear: "Limpar concluídos",
              }}
            />
          )}

          {/* Hint banner */}
          <div
            style={{
              padding: "10px 16px",
              background: "var(--crm-blue-50)",
              borderBottom: "1px solid var(--crm-blue-100)",
              fontSize: 11,
              color: "var(--crm-brand-hover)",
              lineHeight: 1.5,
            }}
          >
            {activeTab === "struct" && editing ? (
              <>
                <b>Modo de edição.</b> Arraste para reordenar e use a lixeira
                para remover. Nada é salvo até você confirmar — e no salvar
                você escreve <b>por quê</b>, que é o que os agentes leem na
                próxima geração deste email.
              </>
            ) : activeTab === "struct" ? (
              <>
                Copie cada item pro builder de email, depois marque o bloco como{" "}
                <b>Aplicado</b>. Os conteúdos já estão prontos para uso — só
                montar e revisar.
              </>
            ) : activeTab === "tipo" ? (
              <>
                <b>Tipografia desta peça.</b> Clique num texto do preview para
                escolher onde mexer, ou troque a fonte inteira aqui do lado.
                Nada é salvo até você clicar em Aplicar — e a identidade
                visual da loja não muda.
              </>
            ) : (
              <>
                Revise cada item antes de enviar para aprovação do cliente.
                Marque os concluídos.
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
            {activeTab === "tipo" && (
              <EmailTypographyPanel
                inventario={inventarioTipo}
                draft={tipoDraft}
                onDraft={setTipoDraft}
                selecionado={fonteSelecionada}
                onSelecionar={setFonteSelecionada}
                fonteDaPeca={email.typography_override?.fontes?.heading ?? null}
                temMarcado={Boolean(email.html_marked)}
                avisos={tipoAvisos}
                salvando={salvandoTipo}
                onAplicar={() => void aplicarTipografia()}
                onDescartar={() => {
                  setTipoDraft(DRAFT_VAZIO)
                  setFonteSelecionada(null)
                }}
              />
            )}
            {activeTab === "struct" && (
              <>
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="blocks">
                    {(droppableProvided, droppableSnapshot) => (
                      <div
                        ref={droppableProvided.innerRef}
                        {...droppableProvided.droppableProps}
                        style={{
                          background: droppableSnapshot.isDraggingOver
                            ? "var(--crm-blue-50)"
                            : "transparent",
                          borderRadius: 8,
                          transition: "background 120ms ease",
                        }}
                      >
                        {blocosVisiveis.map((block, idx) => (
                          <Draggable
                            key={block.id}
                            draggableId={block.id}
                            index={idx}
                            isDragDisabled={!editing}
                          >
                            {(draggableProvided, draggableSnapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                style={{
                                  ...draggableProvided.draggableProps.style,
                                  opacity: draggableSnapshot.isDragging ? 0.92 : 1,
                                  boxShadow: draggableSnapshot.isDragging
                                    ? "0 6px 16px rgba(0,0,0,0.10)"
                                    : undefined,
                                }}
                              >
                                <BlockCard
                                  block={block}
                                  isFirst={idx === 0}
                                  isLast={idx === blocosVisiveis.length - 1}
                                  editing={editing}
                                  dragHandleProps={draggableProvided.dragHandleProps}
                                  onToggleApplied={(applied) =>
                                    patchBlock(block.id, { applied })
                                  }
                                  onCopy={copyToClipboard}
                                  onPatch={(update) => patchBlock(block.id, update)}
                                  onDelete={async () => {
                                    if (editing) {
                                      setDraftRemoved((r) => [...r, block.id])
                                      return
                                    }
                                    await deleteBlock(block.id)
                                  }}
                                  onMoveUp={() => moveBlock(block.id, "up")}
                                  onMoveDown={() => moveBlock(block.id, "down")}
                                  onRefresh={async () => {
                                    await mutate()
                                    onEmailUpdated()
                                  }}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {droppableProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                {blocks.length === 0 && (
                  <div
                    style={{
                      padding: "20px 16px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--crm-gray-500)",
                      background: "var(--crm-gray-50)",
                      border: "1px solid var(--crm-border)",
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    Nenhum bloco ainda. Adicione abaixo.
                  </div>
                )}
                <AddBlockPicker onAdd={createBlock} />
              </>
            )}
            {activeTab === "qa" && (
              <>
                {qaItems.map((item) => (
                  <QACard
                    key={item.id}
                    item={item}
                    onToggle={(done) => patchQA(item.id, { done })}
                    onEditNotes={(notes) => patchQA(item.id, { notes: notes || null })}
                    onDelete={() => deleteQAItem(item.id)}
                  />
                ))}
                {qaItems.length === 0 && (
                  <div
                    style={{
                      padding: "20px 16px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--crm-gray-500)",
                      background: "var(--crm-gray-50)",
                      border: "1px solid var(--crm-border)",
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    Nenhum item de QA ainda. Adicione abaixo.
                  </div>
                )}
                <AddQAInput onAdd={createQAItem} />
              </>
            )}
          </div>

          {/* Footer: acoes dependem do status do email */}
          <div
            className="shrink-0 flex flex-col gap-2"
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--crm-gray-100)",
              background: "var(--crm-gray-0)",
            }}
          >
            {editing ? (
              <div className="flex gap-2">
                <SecondaryBtn
                  onClick={async () => sairDaEdicao()}
                  icon={<ChevronLeft className="h-3 w-3" />}
                >
                  Cancelar
                </SecondaryBtn>
                {/* "Salvar alterações" é da ESTRUTURA (pede justificativa e
                    grava a revisão que os agentes leem). Na aba Tipografia o
                    botão que salva é o "Aplicar" do painel — deixar os dois
                    à vista faria parecer que um depende do outro. */}
                {activeTab !== "tipo" && (
                  <PrimaryBtn
                    disabled={!estruturaAlterada}
                    onClick={async () => setSaveOpen(true)}
                    icon={<Check className="h-3 w-3" />}
                  >
                    Salvar alterações
                  </PrimaryBtn>
                )}
              </div>
            ) : (
              <EmailStatusActions
                status={email.status}
                canAdvance={blocksApplied >= blocksTotal && blocksTotal > 0}
                onUpdateStatus={(s) => patchEmail({ status: s })}
              />
            )}
            <span
              className="crm-tnum"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                textAlign: "center",
              }}
            >
              {editing
                ? estruturaAlterada
                  ? `${blocosVisiveis.length} bloco(s) · ${draftRemoved.length} removido(s) — nada salvo ainda`
                  : "Arraste um bloco ou remova um para habilitar o salvar"
                : `${blocksApplied}/${blocksTotal} blocos aplicados · ${
                    qaTotal > 0
                      ? `${Math.round((qaDone / qaTotal) * 100)}% do checklist QA`
                      : "sem QA"
                  }`}
            </span>
          </div>
        </aside>
      </div>

      {/* Bottom nav: prev / position / next + width slider */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 24px",
          background: "var(--crm-gray-0)",
          borderTop: "1px solid var(--crm-border)",
        }}
      >
        <button
          disabled={!prevEmail}
          onClick={() => prevEmail && onNavigate(prevEmail.id)}
          className="cf-focusable inline-flex items-center gap-1.5"
          style={{
            height: 32,
            padding: "0 12px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            color: prevEmail ? "var(--crm-gray-700)" : "var(--crm-gray-300)",
            fontSize: 12,
            fontWeight: 500,
            cursor: prevEmail ? "pointer" : "default",
          }}
        >
          <ChevronLeft className="h-3 w-3" />
          Anterior
          <KbdHint>J</KbdHint>
        </button>
        <div className="flex items-center gap-1">
          {emails.map((e, i) => {
            const active = e.id === emailId
            const done =
              e.status === "ready" ||
              e.status === "approved" ||
              e.status === "live"
            return (
              <span
                key={e.id}
                onClick={() => onNavigate(e.id)}
                role="button"
                aria-label={`Email ${i + 1}`}
                style={{
                  width: active ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: active
                    ? "var(--crm-brand)"
                    : done
                      ? "var(--crm-pos)"
                      : "var(--crm-gray-200)",
                  cursor: "pointer",
                  transition: "width 150ms ease",
                }}
              />
            )
          })}
          <span
            className="crm-tnum"
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "var(--crm-gray-500)",
            }}
          >
            E-mail <b style={{ color: "var(--crm-gray-900)" }}>#{currentIdx + 1}</b> de {emails.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
            }}
          >
            Largura {width}px · padrão de e-mail
          </span>
          <input
            type="range"
            min={320}
            // 600px é o teto: largura padrão de e-mail. Acima disso o preview
            // só mostrava o canvas em volta do container (não é como o email
            // renderiza no cliente de verdade) e confundia a revisão. Se um
            // design usar formato mais largo, o teto deve vir da formatação —
            // não do slider.
            max={600}
            step={20}
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value, 10))}
            style={{ width: 80 }}
          />
          <button
            disabled={!nextEmail}
            onClick={() => nextEmail && onNavigate(nextEmail.id)}
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 12px",
              background: nextEmail ? "var(--crm-brand)" : "var(--crm-gray-100)",
              color: nextEmail ? "var(--crm-brand-fg)" : "var(--crm-gray-400)",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: nextEmail ? "pointer" : "default",
            }}
          >
            <KbdHint inverted={!!nextEmail}>K</KbdHint>
            Próximo
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {sendTestOpen && (
        <SendTestDialog
          defaultTo={email.from_email ?? ""}
          onCancel={() => setSendTestOpen(false)}
          onSend={async (to) => {
            setSendTestOpen(false)
            await sendTest(to)
          }}
        />
      )}

      {saveOpen && (
        <SalvarRevisaoDialog
          antes={blocks.map((b) => b.label || b.block_type)}
          depois={blocosVisiveis.map((b) => b.label || b.block_type)}
          removidos={blocks
            .filter((b) => draftRemoved.includes(b.id))
            .map((b) => b.label || b.block_type)}
          flowType={flow.flow_type}
          emailNumber={email?.number ?? 1}
          saving={savingReview}
          onCancel={() => setSaveOpen(false)}
          onSave={salvarRevisao}
        />
      )}
    </>
  )
}

/**
 * Diálogo de salvar a revisão de estrutura (migration 20261088).
 *
 * A justificativa é obrigatória de propósito: sem ela a correção some na
 * próxima geração, porque o agente refaz a estrutura sem saber que alguém
 * discordou. O diff aparece na tela para o texto ser escrito olhando o que
 * de fato mudou, e não de memória.
 */
function SalvarRevisaoDialog({
  antes,
  depois,
  removidos,
  flowType,
  emailNumber,
  saving,
  onCancel,
  onSave,
}: {
  antes: string[]
  depois: string[]
  removidos: string[]
  flowType: string
  emailNumber: number
  saving: boolean
  onCancel: () => void
  onSave: (p: {
    justificativa: string
    alcance: "este_email" | "todo_email_do_flow"
    leitores: { estruturador: boolean; curador: boolean; montador: boolean }
  }) => Promise<void>
}) {
  const [justificativa, setJustificativa] = useState("")
  const [alcance, setAlcance] = useState<"este_email" | "todo_email_do_flow">(
    "este_email",
  )
  const [curador, setCurador] = useState(false)
  const [montador, setMontador] = useState(true)

  const podeSalvar = justificativa.trim().length > 0 && !saving

  const label = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--crm-gray-700)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 6,
    marginTop: 14,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540,
          maxWidth: "94vw",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            marginBottom: 6,
          }}
        >
          Salvar a nova estrutura
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--crm-gray-500)",
            marginBottom: 4,
            lineHeight: 1.5,
          }}
        >
          A ordem vale agora. A justificativa vai para os agentes na próxima
          geração deste email — é o que impede a correção de ser desfeita.
        </div>

        <div style={label}>O que mudou</div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.7,
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            padding: "10px 12px",
            color: "var(--crm-gray-700)",
          }}
        >
          <div style={{ color: "var(--crm-gray-500)" }}>
            {antes.join(" · ")}
          </div>
          <div style={{ fontWeight: 600 }}>→ {depois.join(" · ")}</div>
          {removidos.length > 0 && (
            <div style={{ marginTop: 4, textDecoration: "line-through", color: "var(--crm-gray-500)" }}>
              removido: {removidos.join(", ")}
            </div>
          )}
        </div>

        <div style={label}>Por que você mudou?</div>
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Ex.: o cético precisa da prova antes da vitrine — reviews sobe para antes da oferta."
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            fontSize: 13,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <div style={label}>Vale para</div>
        {(
          [
            ["este_email", `Só este email desta loja (${flowType} #${emailNumber})`],
            ["todo_email_do_flow", `Todo ${flowType} #${emailNumber}, em qualquer loja`],
          ] as const
        ).map(([v, txt]) => (
          <label
            key={v}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
              color: "var(--crm-gray-700)",
              marginBottom: 4,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              checked={alcance === v}
              onChange={() => setAlcance(v)}
            />
            {txt}
          </label>
        ))}

        <div style={label}>Quem lê</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--crm-gray-500)",
            marginBottom: 6,
            lineHeight: 1.5,
          }}
        >
          O Estruturador sempre recebe — a ordem é o trabalho dele. Marque os
          outros quando o motivo também falar de escolha de bloco.
        </div>
        {(
          [
            ["Curador (escolhe as variantes)", curador, setCurador],
            ["Montador (fecha a composição)", montador, setMontador],
          ] as const
        ).map(([txt, val, set]) => (
          <label
            key={txt}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
              color: "var(--crm-gray-700)",
              marginBottom: 4,
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} />
            {txt}
          </label>
        ))}

        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <SecondaryBtn onClick={async () => onCancel()}>Cancelar</SecondaryBtn>
          <PrimaryBtn
            disabled={!podeSalvar}
            onClick={async () =>
              onSave({
                justificativa: justificativa.trim(),
                alcance,
                leitores: { estruturador: true, curador, montador },
              })
            }
            icon={
              saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )
            }
          >
            {saving ? "Salvando..." : "Salvar revisão"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  )
}

function SendTestDialog({
  defaultTo,
  onCancel,
  onSend,
}: {
  defaultTo: string
  onCancel: () => void
  onSend: (to: string) => Promise<void>
}) {
  const [to, setTo] = useState(defaultTo)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const v = to.trim()
    if (!v) return
    setBusy(true)
    try {
      await onSend(v)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "92vw",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            marginBottom: 6,
          }}
        >
          Enviar e-mail de teste
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--crm-gray-500)",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Renderiza o HTML real do e-mail e envia via Resend. Assunto vem prefixado com <b>[TESTE]</b>.
        </div>
        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 4,
          }}
        >
          Destinatário
        </label>
        <input
          autoFocus
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
            if (e.key === "Escape") onCancel()
          }}
          placeholder="seu@email.com"
          style={{
            width: "100%",
            padding: "8px 10px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--crm-gray-900)",
            outline: "none",
          }}
        />
        <div
          className="flex items-center justify-end gap-2"
          style={{ marginTop: 16 }}
        >
          <button
            onClick={onCancel}
            style={{
              height: 32,
              padding: "0 14px",
              background: "transparent",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
              color: "var(--crm-gray-700)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!to.trim() || busy}
            style={{
              height: 32,
              padding: "0 14px",
              background: !to.trim() ? "var(--crm-gray-100)" : "var(--crm-brand)",
              color: !to.trim() ? "var(--crm-gray-400)" : "var(--crm-brand-fg)",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: !to.trim() || busy ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Send className="h-3 w-3" />
            {busy ? "Enviando..." : "Enviar teste"}
          </button>
        </div>
      </div>
    </div>
  )
}

function KbdHint({
  children,
  inverted,
}: {
  children: React.ReactNode
  inverted?: boolean
}) {
  return (
    <span
      className="crm-tnum"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        marginLeft: 4,
        borderRadius: 3,
        background: inverted ? "rgba(255,255,255,0.18)" : "var(--crm-gray-100)",
        color: inverted ? "#fff" : "var(--crm-gray-500)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  )
}

// ─── Mock preview (renderização visual) ────────────────────
// Sem call-sites hoje (preview usa EmailRenderPreview/EmailCopyView);
// prefixo _ marca como intencionalmente não usado pro lint.

function _EmailMockPreview({
  email,
  blocks,
  width,
  onEditSubject,
  onEditPreheader,
  onEditFromName,
  onEditFromEmail,
  onEditDelay,
}: {
  email: EmailFlowEmail
  blocks: EmailBlock[]
  width: number
  onEditSubject: (v: string) => Promise<void>
  onEditPreheader: (v: string) => Promise<void>
  onEditFromName: (v: string) => Promise<void>
  onEditFromEmail: (v: string) => Promise<void>
  onEditDelay: (v: string) => Promise<void>
}) {
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 760, margin: "0 auto" }}>
      {/* Envelope */}
      <SectionLabel>Envelope</SectionLabel>
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: "16px 20px",
          fontSize: 13,
        }}
      >
        <EnvelopeRow label="De">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.from_name}
              placeholder="Nome do remetente"
              onSave={onEditFromName}
            />
          </span>
          <span style={{ color: "var(--crm-gray-500)", marginLeft: 8 }}>
            &lt;
            <InlineEditField
              value={email.from_email}
              placeholder="email@dominio.com"
              onSave={onEditFromEmail}
            />
            &gt;
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Assunto">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.subject}
              placeholder="Assunto do email"
              onSave={onEditSubject}
            />
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Pré-cabeçalho">
          <InlineEditField
            value={email.preheader}
            placeholder="Texto curto que aparece após o assunto"
            onSave={onEditPreheader}
          />
        </EnvelopeRow>
        <EnvelopeRow label="Esperar" last>
          <span style={{ color: "var(--crm-gray-700)" }}>
            <InlineEditField
              type="number"
              value={email.delay_hours}
              placeholder="0"
              onSave={onEditDelay}
            />{" "}
            <span style={{ color: "var(--crm-gray-500)" }}>
              horas após o e-mail anterior
            </span>
          </span>
        </EnvelopeRow>
      </div>

      {/* Corpo */}
      <SectionLabel style={{ marginTop: 24 }}>Corpo do e-mail</SectionLabel>
      <div
        style={{
          width: width,
          maxWidth: "100%",
          margin: "0 auto",
          background: "#fff",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {blocks.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "var(--crm-gray-400)",
              fontSize: 13,
            }}
          >
            Nenhum bloco no email
          </div>
        ) : (
          blocks.map((b) => <RenderedBlock key={b.id} block={b} />)
        )}
      </div>
    </div>
  )
}

function EnvelopeRow({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className="flex items-baseline gap-3"
      style={{
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--crm-gray-100)",
        fontSize: 13,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          width: 110,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Block renderers ──────────────────────────────────────

export function RenderedBlock({ block }: { block: EmailBlock }) {
  switch (block.block_type) {
    case "hero":
      return <RenderHero content={block.content as HeroBlockContent} />
    case "text":
      return <RenderText content={block.content as TextBlockContent} />
    case "coupon":
      return <RenderCoupon content={block.content as CouponBlockContent} />
    case "products":
      return <RenderProducts content={block.content as ProductsBlockContent} />
    case "footer":
      return <RenderFooter content={block.content as Record<string, unknown>} />
    default:
      return (
        <div style={{ padding: 12, color: "var(--crm-gray-500)", fontSize: 11 }}>
          [{block.block_type}] {block.label}
        </div>
      )
  }
}

function RenderHero({ content }: { content: HeroBlockContent }) {
  return (
    <div style={{ background: "#fff" }}>
      {content.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.image_url}
          alt={content.image_alt ?? content.headline ?? ""}
          style={{ width: "100%", display: "block" }}
        />
      ) : (
        <div
          style={{
            background: "var(--crm-brand)",
            height: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          <ImageIcon className="h-12 w-12 opacity-40" />
        </div>
      )}
      <div style={{ padding: "32px 32px 24px", textAlign: "center" }}>
        {content.eyebrow && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#0F0F0F",
              letterSpacing: "0.22em",
              marginBottom: 10,
            }}
          >
            {content.eyebrow}
          </div>
        )}
        {content.headline && (
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 900,
              color: "#0F0F0F",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              textTransform: "uppercase",
            }}
          >
            {content.headline}
          </h1>
        )}
        {content.body && (
          <p
            style={{
              margin: "16px auto 0",
              maxWidth: 440,
              fontSize: 14,
              color: "#2A2A2A",
              lineHeight: 1.65,
            }}
          >
            {content.body}
          </p>
        )}
        {content.cta_text && (
          <a
            href={content.cta_url ?? "#"}
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "15px 32px",
              background: "var(--crm-brand)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.06em",
              textDecoration: "none",
              borderRadius: 999,
            }}
          >
            {content.cta_text}
          </a>
        )}
      </div>
    </div>
  )
}

function RenderText({ content }: { content: TextBlockContent }) {
  return (
    <div
      style={{
        padding: "40px 56px",
        textAlign: "center",
        borderTop: "1px solid #F0F0F0",
      }}
    >
      {content.headline && (
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 900,
            color: "#0F0F0F",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {content.headline}
        </h2>
      )}
      {content.body && (
        <p
          style={{
            margin: "20px auto 0",
            maxWidth: 440,
            fontSize: 14,
            color: "#2A2A2A",
            lineHeight: 1.65,
          }}
        >
          {content.body}
        </p>
      )}
    </div>
  )
}

function RenderCoupon({ content }: { content: CouponBlockContent }) {
  return (
    <div
      style={{
        padding: "32px 56px",
        textAlign: "center",
        background: "#FAFAFA",
        borderTop: "1px solid #F0F0F0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#666",
          letterSpacing: "0.22em",
          marginBottom: 8,
        }}
      >
        CUPOM
      </div>
      <div
        style={{
          display: "inline-block",
          padding: "12px 24px",
          background: "#0F0F0F",
          color: "#fff",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "0.06em",
          borderRadius: 4,
          border: "1.5px dashed #999",
        }}
      >
        {content.code || "SEU_CUPOM"}
      </div>
      {content.hint && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#666",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {content.hint}
        </div>
      )}
      {content.cta_text && (
        <a
          href={content.cta_url ?? "#"}
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "13px 28px",
            background: "var(--crm-brand)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.06em",
            textDecoration: "none",
            borderRadius: 999,
          }}
        >
          {content.cta_text}
        </a>
      )}
    </div>
  )
}

function RenderProducts({ content }: { content: ProductsBlockContent }) {
  const products = content.products ?? []
  return (
    <div style={{ padding: "40px 32px", borderTop: "1px solid #F0F0F0" }}>
      {content.title && (
        <h3
          style={{
            margin: "0 0 24px",
            textAlign: "center",
            fontSize: 22,
            fontWeight: 900,
            color: "#0F0F0F",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {content.title}
        </h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 16,
        }}
      >
        {products.map((p, i) => (
          <div key={i}>
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image_url}
                alt={p.name}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: 6,
                  background: "#F0F0F0",
                }}
              />
            ) : (
              <div
                style={{
                  aspectRatio: "1 / 1",
                  background: "#F0F0F0",
                  borderRadius: 6,
                }}
              />
            )}
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 600,
                color: "#0F0F0F",
                textAlign: "center",
              }}
            >
              {p.name}
            </div>
            <div
              style={{
                marginTop: 4,
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--crm-brand)",
              }}
            >
              {typeof p.price === "number"
                ? p.price.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })
                : p.price}
            </div>
            <a
              href={p.url ?? "#"}
              style={{
                display: "block",
                marginTop: 8,
                padding: "8px 0",
                textAlign: "center",
                background: "#0F0F0F",
                color: "#fff",
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: "0.1em",
                textDecoration: "none",
                borderRadius: 999,
              }}
            >
              {p.cta_text || "BUY NOW"}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function RenderFooter({ content }: { content: Record<string, unknown> }) {
  const columns = (content.columns as Array<{
    title?: string
    links?: Array<{ label: string; url: string }>
  }>) ?? []
  const copyright = (content.copyright as string) ?? ""
  return (
    <div
      style={{
        padding: "32px 24px 24px",
        background: "#0F0F0F",
        color: "#fff",
        textAlign: "center",
      }}
    >
      {columns.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {columns.flatMap((col) =>
            (col.links ?? []).map((l, i) => (
              <a
                key={`${l.label}-${i}`}
                href={l.url}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {l.label}
              </a>
            )),
          )}
        </div>
      )}
      {copyright && (
        <div
          style={{
            fontSize: 11,
            color: "#999",
            letterSpacing: "0.04em",
          }}
        >
          {copyright}
        </div>
      )}
    </div>
  )
}

// ─── HTML view ────────────────────────────────────────────

function EmailRenderPreview({
  email,
  html,
  width,
  editable = false,
  selecionavelPorFonte = false,
  fonteSelecionada = null,
  onSelecionarFonte,
  avisoSemDocumento,
  rotuloDaRegiao,
  onReorder,
  onRemove,
  onEditSubject,
  onEditPreheader,
  onEditFromName,
  onEditFromEmail,
  onEditDelay,
}: {
  email: EmailFlowEmail
  html: string
  width: number
  editable?: boolean
  /** Modo de seleção de tipografia (exclusivo com `editable`). */
  selecionavelPorFonte?: boolean
  fonteSelecionada?: number | null
  onSelecionarFonte?: (indice: number) => void
  /** Por que o email não é arrastável, quando não é. */
  avisoSemDocumento?: string | null
  rotuloDaRegiao?: (indice: number) => string
  onReorder?: (novaOrdem: number[]) => void
  onRemove?: (indice: number) => void
  onEditSubject: (v: string) => Promise<void>
  onEditPreheader: (v: string) => Promise<void>
  onEditFromName: (v: string) => Promise<void>
  onEditFromEmail: (v: string) => Promise<void>
  onEditDelay: (v: string) => Promise<void>
}) {
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 1000, margin: "0 auto" }}>
      <SectionLabel>Envelope</SectionLabel>
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: "16px 20px",
          fontSize: 13,
          marginBottom: 20,
        }}
      >
        <EnvelopeRow label="De">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.from_name}
              placeholder="Nome do remetente"
              onSave={onEditFromName}
            />
          </span>
          <span style={{ color: "var(--crm-gray-500)", marginLeft: 8 }}>
            &lt;
            <InlineEditField
              value={email.from_email}
              placeholder="email@dominio.com"
              onSave={onEditFromEmail}
            />
            &gt;
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Assunto">
          <span style={{ fontWeight: 600, color: "var(--crm-gray-900)" }}>
            <InlineEditField
              value={email.subject}
              placeholder="Assunto do email"
              onSave={onEditSubject}
            />
          </span>
        </EnvelopeRow>
        <EnvelopeRow label="Pré-cabeçalho">
          <InlineEditField
            value={email.preheader}
            placeholder="Texto curto que aparece após o assunto"
            onSave={onEditPreheader}
          />
        </EnvelopeRow>
        <EnvelopeRow label="Esperar" last>
          <span style={{ color: "var(--crm-gray-700)" }}>
            <InlineEditField
              type="number"
              value={email.delay_hours}
              placeholder="0"
              onSave={onEditDelay}
            />{" "}
            <span style={{ color: "var(--crm-gray-500)" }}>
              horas após o e-mail anterior
            </span>
          </span>
        </EnvelopeRow>
      </div>

      <SectionLabel>Corpo do e-mail</SectionLabel>
      {editable && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "var(--crm-blue-50)",
            border: "1px solid var(--crm-blue-100)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--crm-brand-hover)",
            lineHeight: 1.5,
          }}
        >
          <b>Arraste os blocos aqui no email</b> para mudar a ordem — passe o
          mouse para ver o nome de cada um, e use o ✕ do rótulo para tirar um
          do email. Nada é salvo até você confirmar no painel.
        </div>
      )}
      {avisoSemDocumento && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "var(--crm-amber-50, #fffbeb)",
            border: "1px solid var(--crm-amber-100, #fde68a)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--crm-gray-700)",
            lineHeight: 1.5,
          }}
        >
          {avisoSemDocumento}
        </div>
      )}
      <ScaledEmailFrame
        html={html}
        baseWidth={width}
        editable={editable}
        selecionavelPorFonte={selecionavelPorFonte}
        fonteSelecionada={fonteSelecionada}
        onSelecionarFonte={onSelecionarFonte}
        rotuloDaRegiao={rotuloDaRegiao}
        onReorder={onReorder}
        onRemove={onRemove}
      />
    </div>
  )
}

// ─── Copy View ─────────────────────────────────────────────

export function EmailCopyView({
  email,
  blocks,
  copyToClipboard,
}: {
  email: EmailFlowEmail
  blocks: EmailBlock[]
  copyToClipboard: (text: string, label?: string) => void
}) {
  const status = email.status as string

  const blockSections = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => a.position - b.position)
    // Extrai a copy por tipo de bloco (cobre os 18 tipos). Antes só lia chaves
    // fixas (headline/body/cta_text/code/hint/products), ocultando tipos novos
    // como cta/features/testimonials/social_proof/header/comparison/letter.
    return sorted.map((b) => ({ block: b, fields: blockCopyFields(b) }))
  }, [blocks])

  const fullText = useMemo(() => {
    const parts: string[] = []
    if (email.subject) parts.push(`SUBJECT: ${email.subject}`)
    if (email.preheader) parts.push(`PREHEADER: ${email.preheader}`)
    parts.push("")
    for (const sec of blockSections) {
      parts.push(`━━━━ ${sec.block.label.toUpperCase()} ━━━━`)
      for (const f of sec.fields) {
        parts.push(`${f.label}: ${f.value}`)
      }
      parts.push("")
    }
    return parts.join("\n").trim()
  }, [email, blockSections])

  const hasCopy = !!(email.subject || email.preheader || blockSections.some((s) => s.fields.length > 0))

  if (!hasCopy) {
    return (
      <div style={{ padding: "48px 32px", maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
        <FileText
          className="h-12 w-12 mx-auto mb-4"
          style={{ color: "var(--crm-gray-400)" }}
        />
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Copy ainda não foi gerada</h3>
        <p style={{ fontSize: 13, color: "var(--crm-gray-600)", maxWidth: 440, margin: "0 auto" }}>
          Status atual: <strong>{status}</strong>. Dispare a geração via n8n pelo botão
          &ldquo;Gerar copies&rdquo; no sidebar da loja, ou aguarde o briefing ser finalizado.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 800, margin: "0 auto" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Copy do email</h3>
          <p style={{ fontSize: 11, color: "var(--crm-gray-500)", marginTop: 2 }}>
            Texto formatado para o designer. Use os botões para copiar cada parte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => copyToClipboard(fullText, "Copy completa")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] text-white text-[12px] font-semibold hover:bg-black"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar tudo
        </button>
      </div>

      <div className="space-y-3">
        {email.subject && (
          <CopyCard label="Subject" value={email.subject} onCopy={() => copyToClipboard(email.subject!, "Subject")} />
        )}
        {email.preheader && (
          <CopyCard label="Preheader" value={email.preheader} onCopy={() => copyToClipboard(email.preheader!, "Preheader")} />
        )}

        {blockSections.map((sec) =>
          sec.fields.length > 0 ? (
            <div
              key={sec.block.id}
              style={{
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
                padding: 14,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--crm-gray-600)",
                  }}
                >
                  #{sec.block.position} · {sec.block.label}
                </span>
              </div>
              <div className="space-y-2">
                {sec.fields.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-start gap-2"
                    style={{
                      padding: 8,
                      borderRadius: 4,
                      background: "var(--crm-gray-50)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="flex items-center gap-2"
                        style={{
                          fontSize: 10,
                          color: "var(--crm-gray-500)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                          marginBottom: 4,
                        }}
                      >
                        <span>{f.label}</span>
                        {/* Limite do slot no HTML: o cadastro da variante
                            (`fields[].max_len`) é o mesmo número que vai no
                            payload do n8n. Passar dele faz a frase vazar da
                            caixa — e até 28/08 isso só aparecia no email
                            renderizado. */}
                        <CopyFieldCounter
                          max={limiteDoCampo(
                            (sec.block as unknown as { fields?: BlueprintBlockField[] })
                              .fields,
                            f.key,
                          )}
                          length={f.value.trim().length}
                        />
                      </div>
                      <div style={{ fontSize: 13, color: "var(--crm-gray-900)", whiteSpace: "pre-wrap" }}>
                        {f.value}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(f.value, f.label)}
                      className="shrink-0 flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-500 hover:bg-slate-200"
                      title={`Copiar ${f.label}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}

/**
 * `217/130` do lado do rótulo — vermelho quando estoura.
 *
 * Vale também para o que a PESSOA escreve: o limite é a geometria da caixa,
 * não uma regra sobre o n8n.
 */
function CopyFieldCounter({ max, length }: { max: number | null; length: number }) {
  if (max == null || length === 0) return null
  const estourou = length > max
  return (
    <span
      title={
        estourou
          ? `Acima do limite do slot (${max} caracteres) — o texto vaza da caixa no email`
          : `Limite do slot: ${max} caracteres`
      }
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        color: estourou ? "#B91C1C" : "var(--crm-gray-400)",
      }}
    >
      {length}/{max}
    </span>
  )
}

function CopyCard({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 6,
        padding: 14,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 13, color: "var(--crm-gray-900)" }}>{value}</div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[4px] text-slate-500 hover:bg-slate-100"
          title={`Copiar ${label}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function EmailHtmlView({
  email,
  flowId,
  exportBasename,
  html,
  onCopyAll,
}: {
  email: EmailFlowEmail
  flowId: string
  exportBasename: string
  html: string
  onCopyAll: (html: string) => void
}) {
  const toast = useToast()
  const [downloadingPng, setDownloadingPng] = useState(false)
  const lines = html.split("\n")

  async function downloadPng() {
    if (downloadingPng) return
    setDownloadingPng(true)
    try {
      const res = await fetch(
        `/api/admin/email-flows/${flowId}/emails/${email.id}/export-png`,
      )
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${exportBasename}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.toast({
        title: "Erro ao gerar PNG",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      })
    } finally {
      setDownloadingPng(false)
    }
  }
  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          background: "#0F0F0F",
          color: "#fff",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 11,
          }}
        >
          <div
            className="flex items-center gap-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
            {exportBasename}.html
            <span style={{ marginLeft: 8 }}>· {lines.length} linhas</span>
          </div>
          <div className="flex gap-2">
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: downloadingPng ? "default" : "pointer",
                opacity: downloadingPng ? 0.6 : 1,
              }}
              disabled={downloadingPng}
              onClick={downloadPng}
            >
              {downloadingPng ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileImage className="h-3 w-3" />
              )}
              {downloadingPng ? "Gerando..." : "Baixar .png"}
            </button>
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
              onClick={() => {
                const blob = new Blob([html], { type: "text/html" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `${exportBasename}.html`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-3 w-3" />
              Baixar .html
            </button>
            <button
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 28,
                padding: "0 10px",
                background: "#fff",
                color: "#0F0F0F",
                border: 0,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => onCopyAll(html)}
            >
              <Copy className="h-3 w-3" />
              Copiar tudo
            </button>
          </div>
        </div>
        <pre
          style={{
            margin: 0,
            padding: "16px 0",
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: "var(--crm-font-mono, 'Geist Mono', monospace)",
            overflowX: "auto",
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "0 16px",
                background: "transparent",
              }}
            >
              <span
                className="crm-tnum shrink-0"
                style={{
                  width: 40,
                  textAlign: "right",
                  marginRight: 16,
                  color: "rgba(255,255,255,0.30)",
                }}
              >
                {i + 1}
              </span>
              <code
                style={{
                  flex: 1,
                  color: "rgba(255,255,255,0.85)",
                  whiteSpace: "pre",
                }}
              >
                {line || " "}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

// ─── Ref view (arquitetura do Montador) ───────────────────
// Só leitura: mostra o HTML de ARQUITETURA que o Montador (Component
// Assembler, agente #3) gerou para esta loja×email. Não altera o flow —
// espelha a inspeção de /generated (reference da loja + fallback consumido).

function RefMetaChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "ai" | "warn"
}) {
  const palette =
    tone === "ai"
      ? { bg: "var(--crm-blue-50)", fg: "var(--crm-brand)" }
      : tone === "warn"
        ? { bg: "#FEF3C7", fg: "#92400E" }
        : { bg: "var(--crm-gray-100)", fg: "var(--crm-gray-600)" }
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "3px 8px",
        borderRadius: 4,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        fontWeight: 600,
      }}
    >
      <span style={{ opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span className="crm-tnum">{value}</span>
    </span>
  )
}

function EmailRefView({
  item,
  loading,
  finalHtml,
  htmlAgentHtml,
  onCopyAll,
}: {
  item: GeneratedRefItem | null
  loading: boolean
  /** HTML final gerado do email (pós-Refinador) — usado no modo comparar. */
  finalHtml: string | null
  /** HTML do agente HTML ANTES do Refinador — coluna do meio no compare. */
  htmlAgentHtml: string | null
  onCopyAll: (html: string) => void
}) {
  // Modo de exibição: só a referência ou referência × HTML final lado a lado.
  const [compareMode, setCompareMode] = useState<"single" | "compare">("single")

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2"
        style={{ padding: "80px 32px", color: "var(--crm-gray-500)", fontSize: 13 }}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando referência do Montador...
      </div>
    )
  }

  const storeHtml = item?.reference?.html ?? null
  const consumed = item?.consumed
  // HTML a mostrar: prioridade pra reference da loja; senão o fallback global
  // que o HTML agent realmente consome.
  const shownHtml =
    storeHtml ?? (consumed?.match === "global" ? consumed.html : null)

  if (!shownHtml) {
    return (
      <div style={{ padding: "24px 32px 48px", maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            background: "var(--crm-gray-0)",
            border: "1px dashed var(--crm-border)",
            borderRadius: 10,
          }}
        >
          <LayoutGrid
            className="h-8 w-8"
            style={{ margin: "0 auto 12px", color: "var(--crm-gray-300)" }}
          />
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--crm-gray-800)" }}>
            Sem arquitetura gerada para este e-mail
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--crm-gray-500)",
              lineHeight: 1.6,
              maxWidth: 440,
              margin: "8px auto 0",
            }}
          >
            O Montador não gravou uma referência específica desta loja (fallback)
            e não há template global para <b>{item?.flow_type ?? "—"}</b> e-mail{" "}
            <b>#{item?.email_number ?? "—"}</b>. O HTML final usa o template
            padrão embutido.
          </div>
        </div>
      </div>
    )
  }

  const isGlobalFallback = !storeHtml && consumed?.match === "global"
  const ref = item?.reference
  const updated = ref?.updated_at
    ? new Date(ref.updated_at).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Barra de metadados */}
      <div
        className="flex items-center flex-wrap gap-2"
        style={{ marginBottom: 16 }}
      >
        {isGlobalFallback ? (
          <RefMetaChip label="Origem" value="Template global (fallback)" tone="warn" />
        ) : (
          <>
            <RefMetaChip
              label="Origem"
              value={ref?.source === "ai" ? "Montador (IA)" : ref?.source ?? "—"}
              tone={ref?.source === "ai" ? "ai" : "neutral"}
            />
            {ref?.model && <RefMetaChip label="Modelo" value={ref.model} />}
            {updated && <RefMetaChip label="Atualizado" value={updated} />}
          </>
        )}
        {consumed && (
          <RefMetaChip
            label="Consumido"
            value={
              consumed.match === "loja"
                ? "Loja"
                : consumed.match === "global"
                  ? "Global"
                  : "Nenhum"
            }
            tone={consumed.match === "loja" ? "ai" : "warn"}
          />
        )}
        <div style={{ flex: 1 }} />
        {/* Toggle: só referência × comparar com o HTML final */}
        <div
          className="inline-flex items-center"
          style={{ padding: 2, background: "var(--crm-gray-100)", borderRadius: 6 }}
        >
          <RefModePill
            label="Só referência"
            active={compareMode === "single"}
            onClick={() => setCompareMode("single")}
          />
          <RefModePill
            label="Comparar"
            active={compareMode === "compare"}
            onClick={() => setCompareMode("compare")}
          />
        </div>
        <button
          className="cf-focusable inline-flex items-center gap-1.5"
          style={{
            height: 28,
            padding: "0 10px",
            background: "var(--crm-gray-900)",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => onCopyAll(shownHtml)}
        >
          <Copy className="h-3 w-3" />
          Copiar HTML
        </button>
      </div>

      {compareMode === "single" ? (
        /* Preview renderizado da arquitetura — altura completa, sem corte. */
        <>
          <SectionLabel>Preview da arquitetura</SectionLabel>
          <div>
            <ScaledEmailFrame html={shownHtml} baseWidth={600} />
          </div>
        </>
      ) : (
        /* Comparação de 3 vias: Montador × HTML agent × Refinador. */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <RefCompareColumn
            name="Montador (arquitetura)"
            tag="Montador · placeholders"
            swatch="var(--crm-brand)"
            html={shownHtml}
          />
          <RefCompareColumn
            name="HTML agent"
            tag="Gerado · pré-refino"
            swatch="var(--crm-warn)"
            html={htmlAgentHtml && htmlAgentHtml.trim() ? htmlAgentHtml : null}
            emptyLabel="Não capturado (geração anterior ao refino separado)"
          />
          <RefCompareColumn
            name="Refinador (final)"
            tag="Refinado · final"
            swatch="var(--crm-pos)"
            html={finalHtml && finalHtml.trim() ? finalHtml : null}
            emptyLabel="HTML final ainda não gerado"
          />
        </div>
      )}
    </div>
  )
}

// Pill do toggle de modo da aba Ref (mesmo visual do ModePillBtn, sem ícone).
function RefModePill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 26,
        padding: "0 10px",
        background: active ? "var(--crm-gray-0)" : "transparent",
        color: active ? "var(--crm-gray-900)" : "var(--crm-gray-600)",
        border: 0,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
      }}
    >
      {label}
    </button>
  )
}

// Coluna do modo comparação: cabeçalho rotulado + preview (ou vazio).
function RefCompareColumn({
  name,
  tag,
  swatch,
  html,
  emptyLabel,
}: {
  name: string
  tag: string
  swatch: string
  html: string | null
  emptyLabel?: string
}) {
  return (
    <div>
      <div
        className="flex items-center justify-between gap-2"
        style={{
          padding: "8px 12px",
          marginBottom: 8,
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
        }}
      >
        <span
          className="inline-flex items-center gap-2"
          style={{ fontSize: 11.5, fontWeight: 700, color: "var(--crm-gray-800)" }}
        >
          <span
            style={{ width: 8, height: 8, borderRadius: 2, background: swatch }}
          />
          {name}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            color: "var(--crm-gray-400)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {tag}
        </span>
      </div>
      {html ? (
        <ScaledEmailFrame html={html} baseWidth={600} />
      ) : (
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            fontSize: 12,
            color: "var(--crm-gray-400)",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 10,
          }}
        >
          {emptyLabel ?? "Sem conteúdo"}
        </div>
      )}
    </div>
  )
}

// ─── Block card (painel direito) ──────────────────────────

const BLOCK_TYPE_ICON: Record<string, typeof FileImage> = {
  hero: FileImage,
  text: TagIcon,
  coupon: TagIcon,
  products: LayoutGrid,
  footer: Square,
  image: FileImage,
  cta: ChevronRight,
  divider: Square,
  spacer: Square,
  social: Square,
}

function BlockCard({
  block,
  isFirst,
  isLast,
  editing = false,
  dragHandleProps,
  onToggleApplied,
  onCopy,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
  onRefresh,
}: {
  block: EmailBlock
  isFirst: boolean
  isLast: boolean
  /** Modo de edição da estrutura: alça e lixeira só agem aqui. */
  editing?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null | undefined
  onToggleApplied: (applied: boolean) => Promise<void>
  onCopy: (text: string, label?: string) => void
  onPatch: (update: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
  onMoveUp: () => Promise<void>
  onMoveDown: () => Promise<void>
  /** AE-16 — chamado pelo BlockImageInstructionField apos regen. */
  onRefresh?: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(block.applied === false)
  const Icon = BLOCK_TYPE_ICON[block.block_type] ?? FileImage
  const content = block.content as Record<string, unknown>

  return (
    <div
      style={{
        marginBottom: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        {...(editing && dragHandleProps ? dragHandleProps : {})}
        style={{
          padding: "10px 14px",
          cursor: editing ? "grab" : "pointer",
          ...(editing
            ? { background: "var(--crm-gray-50)", borderBottom: "1px dashed var(--crm-border)" }
            : {}),
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {editing && (
            <span
              title="Arraste pra reordenar"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                color: "var(--crm-gray-500)",
                flexShrink: 0,
              }}
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontWeight: 700,
              width: 12,
              textAlign: "center",
            }}
          >
            {block.position}
          </span>
          <span
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
              flexShrink: 0,
            }}
          >
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
              }}
            >
              {block.label}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                marginTop: 1,
                maxWidth: 220,
              }}
            >
              {summarizeBlockContent(block)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AppliedBadge
            applied={block.applied}
            onToggle={(v) => onToggleApplied(v)}
          />
          <ChevronRight
            className="h-3 w-3 transition-transform"
            style={{
              color: "var(--crm-gray-400)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: "1px solid var(--crm-gray-100)",
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ paddingTop: 8 }}>
            <div className="flex items-center gap-1">
              {/* Mover só no modo de edição, junto da alça: fora dele a
                  estrutura não muda sem justificativa — era o caminho que
                  reordenava e persistia sem ninguém explicar por quê. */}
              {editing && (
                <>
                  <IconBtn
                    title="Mover para cima"
                    onClick={onMoveUp}
                    disabled={isFirst}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    title="Mover para baixo"
                    onClick={onMoveDown}
                    disabled={isLast}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </IconBtn>
                </>
              )}
              {/* No modo de edição a remoção é REVERSÍVEL (some ao salvar,
                  Cancelar desfaz) e o diálogo de salvar mostra o que sai —
                  o confirma-aqui virou redundante. */}
              {editing && (
                <IconBtn
                  title="Tirar do email (some ao salvar; Cancelar desfaz)"
                  onClick={() => void onDelete()}
                >
                  <Trash2 className="h-3 w-3" />
                </IconBtn>
              )}
            </div>
            <button
              onClick={() => onCopy(JSON.stringify(block.content, null, 2), "Bloco")}
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 24,
                padding: "0 8px",
                background: "transparent",
                color: "var(--crm-gray-600)",
                border: "1px solid var(--crm-border)",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Copy className="h-3 w-3" />
              copiar bloco completo
            </button>
          </div>
          <BlockContentEditor
            block={block}
            content={content}
            onCopy={onCopy}
            onPatch={onPatch}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: disabled ? "var(--crm-gray-300)" : "var(--crm-gray-600)",
        border: "1px solid var(--crm-border)",
        borderRadius: 4,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function summarizeBlockContent(block: EmailBlock): string {
  const c = block.content as Record<string, unknown>
  if (block.block_type === "hero")
    return (c.headline as string) ?? ""
  if (block.block_type === "text")
    return (c.headline as string) ?? (c.body as string) ?? ""
  if (block.block_type === "coupon")
    return `Cupom ${c.code ?? ""}`.trim()
  if (block.block_type === "products") {
    const products = (c.products as Array<{ name: string }>) ?? []
    return (c.title as string) ?? `${products.length} produtos`
  }
  if (block.block_type === "footer") {
    const cols = (c.columns as Array<{ links?: unknown[] }>) ?? []
    const totalLinks = cols.reduce(
      (s, col) => s + (col.links?.length ?? 0),
      0,
    )
    if (totalLinks > 0) return `${totalLinks} links de navegação`
  }
  // Tipos novos (cta/features/testimonials/social_proof/header/headline/
  // urgency/comparison/story/letter): resume pelo 1º campo de copy extraído.
  const fields = blockCopyFields(block)
  if (fields.length > 0) return fields[0].value
  return block.label
}

function AppliedBadge({
  applied,
  onToggle,
}: {
  applied: boolean
  onToggle: (v: boolean) => Promise<void>
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle(!applied)
      }}
      style={{
        height: 22,
        padding: "0 8px",
        borderRadius: 4,
        background: applied ? "var(--crm-pos-bg)" : "var(--crm-gray-0)",
        border: applied
          ? "1px solid var(--crm-pos-border)"
          : "1px solid var(--crm-border)",
        color: applied ? "var(--crm-pos)" : "var(--crm-gray-600)",
        fontSize: 10,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      {applied && <Check className="h-2.5 w-2.5" />}
      {applied ? "Aplicado" : "Marcar"}
    </button>
  )
}

// ─── Block content editor (fields editáveis inline) ──────

function BlockContentEditor({
  block,
  content,
  onCopy,
  onPatch,
  onRefresh,
}: {
  block: EmailBlock
  content: Record<string, unknown>
  onCopy: (text: string, label?: string) => void
  onPatch: (update: Record<string, unknown>) => Promise<void>
  /** AE-16 — refetch do email apos regen de imagem. */
  onRefresh?: () => Promise<void>
}) {
  const updateContent = async (key: string, value: unknown) => {
    await onPatch({ content: { ...content, [key]: value } })
  }

  // Renderiza campos específicos pelo block_type
  if (block.block_type === "hero") {
    const c = content as HeroBlockContent
    return (
      <>
        {c.image_url !== undefined && (
          <FieldImage
            label="Imagem"
            url={c.image_url || null}
            alt={c.image_alt}
            onChange={(url) => updateContent("image_url", url)}
          />
        )}
        <FieldText
          label="Eyebrow"
          value={c.eyebrow ?? ""}
          onSave={(v) => updateContent("eyebrow", v)}
          onCopy={() => onCopy(c.eyebrow ?? "", "Eyebrow")}
        />
        <FieldText
          label="Headline"
          value={c.headline ?? ""}
          onSave={(v) => updateContent("headline", v)}
          onCopy={() => onCopy(c.headline ?? "", "Headline")}
          big
        />
        <FieldTextarea
          label="Corpo"
          value={c.body ?? ""}
          onSave={(v) => updateContent("body", v)}
          onCopy={() => onCopy(c.body ?? "", "Corpo")}
        />
        <FieldButton
          label="Texto do botão (CTA)"
          value={c.cta_text ?? ""}
          onSave={(v) => updateContent("cta_text", v)}
          onCopy={() => onCopy(c.cta_text ?? "", "CTA")}
        />
        {/* AE-16: instrucao adicional por bloco + regen */}
        <BlockImageInstructionField
          blockId={block.id}
          blockLabel={block.label}
          currentInstruction={c.image_instruction}
          lastGeneratedAt={c.image_last_generated_at}
          onInstructionSave={(v) => updateContent("image_instruction", v)}
          onRegenerated={onRefresh}
        />
      </>
    )
  }

  if (block.block_type === "text") {
    const c = content as TextBlockContent
    return (
      <>
        <FieldText
          label="Headline"
          value={c.headline ?? ""}
          onSave={(v) => updateContent("headline", v)}
          onCopy={() => onCopy(c.headline ?? "", "Headline")}
        />
        <FieldTextarea
          label="Corpo"
          value={c.body ?? ""}
          onSave={(v) => updateContent("body", v)}
          onCopy={() => onCopy(c.body ?? "", "Corpo")}
        />
      </>
    )
  }

  if (block.block_type === "coupon") {
    const c = content as CouponBlockContent
    return (
      <>
        <FieldLabel>VISUALIZAÇÃO DO CUPOM</FieldLabel>
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 12,
            border: "1.5px dashed #2A2A2A",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--crm-gray-700)",
              letterSpacing: "0.06em",
            }}
          >
            CUPOM:
          </div>
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#0F0F0F",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textAlign: "center",
            }}
          >
            {c.code || "SEU_CUPOM"}
          </div>
        </div>
        <FieldText
          label="Código (clipboard)"
          value={c.code ?? ""}
          onSave={(v) => updateContent("code", v.toUpperCase())}
          onCopy={() => onCopy(c.code ?? "", "Cupom")}
          mono
        />
        <FieldText
          label="Hint / Urgência"
          value={c.hint ?? ""}
          onSave={(v) => updateContent("hint", v)}
          onCopy={() => onCopy(c.hint ?? "", "Hint")}
        />
        <FieldButton
          label="Texto do botão (CTA)"
          value={c.cta_text ?? ""}
          onSave={(v) => updateContent("cta_text", v)}
          onCopy={() => onCopy(c.cta_text ?? "", "CTA")}
        />
      </>
    )
  }

  if (block.block_type === "products") {
    const c = content as ProductsBlockContent
    const products = c.products ?? []
    const updateProduct = (i: number, patch: Record<string, unknown>) => {
      const next = [...products]
      next[i] = { ...next[i], ...patch }
      return updateContent("products", next)
    }
    const removeProduct = (i: number) => {
      const next = [...products]
      next.splice(i, 1)
      return updateContent("products", next)
    }
    const addProduct = () => {
      return updateContent("products", [
        ...products,
        { name: "Novo produto", price: "0,00", image_url: "", cta_text: "BUY NOW" },
      ])
    }
    return (
      <>
        <FieldText
          label="Título da seção"
          value={c.title ?? ""}
          onSave={(v) => updateContent("title", v)}
          onCopy={() => onCopy(c.title ?? "", "Título")}
        />
        <FieldLabel>Produtos ({products.length})</FieldLabel>
        <div className="flex flex-col gap-2">
          {products.map((p, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span
                  className="crm-tnum"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--crm-gray-500)",
                  }}
                >
                  #{i + 1}
                </span>
                <button
                  onClick={() => removeProduct(i)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--crm-neg)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                  aria-label="Remover produto"
                >
                  Remover
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2" style={{ fontSize: 12 }}>
                <div>
                  <FieldLabel>Nome</FieldLabel>
                  <InlineEditField
                    value={p.name}
                    placeholder="Nome do produto"
                    onSave={(v) => updateProduct(i, { name: v })}
                    rootStyle={{ width: "100%" }}
                  />
                </div>
                <div>
                  <FieldLabel>Preço</FieldLabel>
                  <InlineEditField
                    value={String(p.price ?? "")}
                    placeholder="0,00"
                    onSave={(v) => updateProduct(i, { price: v })}
                    rootStyle={{ width: "100%" }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <FieldLabel>URL da imagem</FieldLabel>
                <InlineEditField
                  value={p.image_url}
                  placeholder="https://..."
                  onSave={(v) => updateProduct(i, { image_url: v })}
                  rootStyle={{ width: "100%" }}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <FieldLabel>Texto do botão</FieldLabel>
                <InlineEditField
                  value={p.cta_text ?? "BUY NOW"}
                  placeholder="BUY NOW"
                  onSave={(v) => updateProduct(i, { cta_text: v.toUpperCase() })}
                  rootStyle={{ width: "100%" }}
                />
              </div>
            </div>
          ))}
          <button
            onClick={addProduct}
            style={{
              padding: "8px 12px",
              background: "transparent",
              border: "1px dashed var(--crm-gray-300)",
              borderRadius: 6,
              color: "var(--crm-gray-600)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Adicionar produto
          </button>
        </div>
      </>
    )
  }

  if (block.block_type === "footer") {
    const c = content as { columns?: Array<{ links?: Array<{ label: string; url: string }> }>; copyright?: string }
    const links = c.columns?.[0]?.links ?? []
    const updateLink = (i: number, patch: { label?: string; url?: string }) => {
      const next = [...links]
      next[i] = { ...next[i], ...patch }
      return updateContent("columns", [{ links: next }])
    }
    const removeLink = (i: number) => {
      const next = [...links]
      next.splice(i, 1)
      return updateContent("columns", [{ links: next }])
    }
    const addLink = () => {
      return updateContent("columns", [
        { links: [...links, { label: "NOVO LINK", url: "#" }] },
      ])
    }
    return (
      <>
        <FieldLabel>Links de navegação ({links.length})</FieldLabel>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{
                padding: "6px 10px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
              }}
            >
              <div className="flex-1 min-w-0">
                <InlineEditField
                  value={l.label}
                  placeholder="LABEL"
                  onSave={(v) => updateLink(i, { label: v.toUpperCase() })}
                  rootStyle={{ width: "100%" }}
                  displayStyle={{ fontSize: 12, fontWeight: 600 }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <InlineEditField
                  value={l.url}
                  placeholder="https://..."
                  onSave={(v) => updateLink(i, { url: v })}
                  rootStyle={{ width: "100%" }}
                  displayStyle={{
                    fontSize: 11,
                    color: "var(--crm-gray-500)",
                    fontFamily: "var(--crm-font-mono, monospace)",
                  }}
                />
              </div>
              <button
                onClick={() => removeLink(i)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--crm-neg)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                }}
                aria-label="Remover link"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addLink}
            style={{
              padding: "8px 12px",
              background: "transparent",
              border: "1px dashed var(--crm-gray-300)",
              borderRadius: 6,
              color: "var(--crm-gray-600)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Adicionar link
          </button>
        </div>
        <FieldText
          label="Copyright"
          value={c.copyright ?? ""}
          onSave={(v) => updateContent("copyright", v)}
          onCopy={() => onCopy(c.copyright ?? "", "Copyright")}
        />
      </>
    )
  }

  if (block.block_type === "image") {
    const c = content as {
      image_url?: string
      image_alt?: string
      link_url?: string
      image_instruction?: string
      image_last_generated_at?: string
    }
    return (
      <>
        <FieldImage
          label="Imagem"
          url={c.image_url ?? null}
          alt={c.image_alt}
          onChange={(url) => updateContent("image_url", url)}
        />
        <FieldText
          label="Alt text"
          value={c.image_alt ?? ""}
          onSave={(v) => updateContent("image_alt", v)}
        />
        <FieldText
          label="Link ao clicar (opcional)"
          value={c.link_url ?? ""}
          onSave={(v) => updateContent("link_url", v)}
        />
        {/* AE-16: instrucao adicional por bloco + regen */}
        <BlockImageInstructionField
          blockId={block.id}
          blockLabel={block.label}
          currentInstruction={c.image_instruction}
          lastGeneratedAt={c.image_last_generated_at}
          onInstructionSave={(v) => updateContent("image_instruction", v)}
          onRegenerated={onRefresh}
        />
      </>
    )
  }

  if (block.block_type === "cta") {
    const c = content as { text?: string; url?: string; style?: string }
    return (
      <>
        <FieldButton
          label="Texto do botão"
          value={c.text ?? ""}
          onSave={(v) => updateContent("text", v.toUpperCase())}
          onCopy={() => onCopy(c.text ?? "", "CTA")}
        />
        <FieldText
          label="URL"
          value={c.url ?? ""}
          onSave={(v) => updateContent("url", v)}
        />
      </>
    )
  }

  // Tipos sem editor visual ainda (divider, spacer, social) — só JSON
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--crm-gray-500)",
        padding: "8px 0",
      }}
    >
      Bloco do tipo <b>{block.block_type}</b> — sem campos editáveis (visual fixo).
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginTop: 12,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

function FieldText({
  label,
  value,
  onSave,
  onCopy,
  big,
  mono,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
  big?: boolean
  mono?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
          fontSize: big ? 14 : 12.5,
          fontWeight: big ? 700 : 500,
          color: "var(--crm-gray-900)",
          fontVariantNumeric: mono ? "tabular-nums lining-nums" : undefined,
          fontFamily: mono
            ? "var(--crm-font-mono, 'Geist Mono', monospace)"
            : undefined,
        }}
      >
        <InlineEditField
          value={value}
          placeholder={`${label}...`}
          onSave={onSave}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: big ? 14 : 12.5,
            fontWeight: big ? 700 : 500,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
          }}
        />
      </div>
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onSave,
  onCopy,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "10px 12px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
          fontSize: 12.5,
          color: "var(--crm-gray-800)",
          lineHeight: 1.5,
        }}
      >
        <InlineEditField
          type="textarea"
          value={value}
          placeholder={`${label}...`}
          onSave={onSave}
          rows={4}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 12.5,
            color: value ? "var(--crm-gray-800)" : "var(--crm-gray-400)",
            display: "block",
            width: "100%",
            whiteSpace: "pre-wrap",
          }}
        />
      </div>
    </div>
  )
}

function FieldButton({
  label,
  value,
  onSave,
  onCopy,
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  onCopy?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Copy className="h-2.5 w-2.5" />
            copiar
          </button>
        )}
      </div>
      <div
        style={{
          padding: "12px 16px",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-gray-900)",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          color: "var(--crm-gray-900)",
          textAlign: "center",
          letterSpacing: "0.06em",
        }}
      >
        <InlineEditField
          value={value}
          placeholder="TEXTO DO BOTÃO"
          onSave={(v) => onSave(v.toUpperCase())}
          rootStyle={{ width: "100%" }}
          displayStyle={{
            fontSize: 12,
            fontWeight: 700,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
            letterSpacing: "0.06em",
          }}
        />
      </div>
    </div>
  )
}

function FieldImage({
  label,
  url,
  alt,
  onChange,
}: {
  label: string
  url: string | null
  alt?: string
  onChange: (url: string) => Promise<void>
}) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <FieldLabel>{label}</FieldLabel>
      </div>
      <div
        className="flex items-center gap-3"
        style={{
          padding: "8px 10px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "var(--crm-gray-200)",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--crm-gray-500)",
          }}
        >
          <ImageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--crm-gray-900)",
            }}
          >
            {alt ?? "Imagem do bloco"}
          </div>
          <div
            className="truncate"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontFamily: "var(--crm-font-mono, monospace)",
            }}
          >
            {url || "Sem URL definida"}
          </div>
        </div>
        <button
          onClick={() => {
            const next = window.prompt(
              "URL da imagem (ex: https://...)",
              url ?? "",
            )
            if (next != null) onChange(next)
          }}
          className="cf-focusable inline-flex items-center gap-1"
          style={{
            height: 28,
            padding: "0 10px",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 6,
            color: "var(--crm-gray-700)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Eye className="h-3 w-3" />
          Trocar
        </button>
      </div>
    </div>
  )
}

// ─── QA card ──────────────────────────────────────────────

function QACard({
  item,
  onToggle,
  onEditNotes,
  onDelete,
}: {
  item: EmailQAItem
  onToggle: (done: boolean) => Promise<void>
  onEditNotes: (notes: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div
      className="flex items-start gap-2.5 group"
      style={{
        padding: "10px 12px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        marginBottom: 8,
        position: "relative",
      }}
    >
      <button
        onClick={() => onToggle(!item.done)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: item.done ? "var(--crm-pos)" : "transparent",
          border: `1.5px solid ${item.done ? "var(--crm-pos)" : "var(--crm-gray-300)"}`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {item.done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: item.done ? "var(--crm-gray-500)" : "var(--crm-gray-900)",
              textDecoration: item.done ? "line-through" : "none",
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            {item.label}
          </div>
          {confirmDelete ? (
            <div className="inline-flex items-center gap-1 shrink-0">
              <button
                onClick={async () => {
                  setConfirmDelete(false)
                  await onDelete()
                }}
                title="Confirmar"
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--crm-neg)",
                  color: "#fff",
                  border: 0,
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                title="Cancelar"
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  color: "var(--crm-gray-500)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Remover item"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: "var(--crm-gray-400)",
                border: "1px solid var(--crm-border)",
                borderRadius: 4,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {item.category && (
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              padding: "1px 6px",
              borderRadius: 3,
              background: "var(--crm-gray-100)",
              color: "var(--crm-gray-600)",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.category}
          </span>
        )}
        <div style={{ marginTop: 6, fontSize: 11 }}>
          <InlineEditField
            type="textarea"
            value={item.notes}
            placeholder="+ adicionar nota"
            onSave={onEditNotes}
            rows={2}
            rootStyle={{ width: "100%" }}
            displayStyle={{
              fontSize: 11,
              color: item.notes ? "var(--crm-gray-600)" : "var(--crm-gray-400)",
              whiteSpace: "pre-wrap",
              display: "block",
              width: "100%",
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────

function ModePillBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        height: 26,
        padding: "0 10px",
        background: active ? "var(--crm-gray-0)" : "transparent",
        color: active ? "var(--crm-gray-900)" : "var(--crm-gray-600)",
        border: 0,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2"
      style={{
        padding: "10px 4px",
        background: "transparent",
        color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
        border: 0,
        borderBottom: active ? "2px solid var(--crm-brand)" : "2px solid transparent",
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {label}
      <span
        className="crm-tnum"
        style={{
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 999,
          background: active ? "var(--crm-blue-50)" : "var(--crm-gray-100)",
          color: active ? "var(--crm-brand)" : "var(--crm-gray-500)",
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  )
}

function EmailStatusBadge({ status }: { status: EmailFlowEmail["status"] }) {
  const map: Record<
    EmailFlowEmail["status"],
    { bg: string; fg: string; label: string }
  > = {
    draft: {
      bg: "var(--crm-gray-100)",
      fg: "var(--crm-gray-600)",
      label: "Rascunho",
    },
    in_progress: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Em progresso",
    },
    copy_ready: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      label: "Copy pronta",
    },
    ready: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      label: "Pronto pra revisão",
    },
    approved: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      label: "Aprovado",
    },
    live: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      label: "Ao vivo",
    },
    // ── Epic AE: novos status de geracao ───────────────────
    pending: {
      bg: "var(--crm-gray-100)",
      fg: "var(--crm-gray-600)",
      label: "Aguardando",
    },
    copy_generating: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Gerando copy",
    },
    copy_generating_recovery: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Gerando copy (recovery)",
    },
    rendering: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Renderizando",
    },
    image_done: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "Imagem pronta",
    },
    qa_running: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      label: "QA",
    },
    failed: {
      bg: "var(--crm-neg-bg)",
      fg: "var(--crm-neg)",
      label: "Falhou",
    },
  }
  const v = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 4,
        background: v.bg,
        color: v.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: v.fg,
        }}
      />
      {v.label}
    </span>
  )
}

// ─── BulkActionRow ────────────────────────────────────────

function BulkActionRow({
  total,
  applied,
  onAll,
  onClear,
  labels,
}: {
  total: number
  applied: number
  onAll: () => Promise<void>
  onClear: () => Promise<void>
  labels: { all: string; clear: string }
}) {
  const [busy, setBusy] = useState<"all" | "clear" | null>(null)
  const allDone = applied >= total
  const noneDone = applied === 0

  const run = async (which: "all" | "clear") => {
    setBusy(which)
    try {
      if (which === "all") await onAll()
      else await onClear()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "6px 16px",
        background: "var(--crm-gray-50)",
        borderBottom: "1px solid var(--crm-gray-100)",
      }}
    >
      <span
        className="crm-tnum"
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {applied} de {total}
      </span>
      <div className="inline-flex items-center gap-1">
        <button
          onClick={() => run("all")}
          disabled={busy !== null || allDone}
          style={{
            height: 22,
            padding: "0 8px",
            background: "transparent",
            color: allDone ? "var(--crm-gray-300)" : "var(--crm-brand)",
            border: 0,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: busy !== null || allDone ? "default" : "pointer",
          }}
        >
          {busy === "all" ? "..." : labels.all}
        </button>
        <span style={{ color: "var(--crm-gray-300)", fontSize: 10 }}>·</span>
        <button
          onClick={() => run("clear")}
          disabled={busy !== null || noneDone}
          style={{
            height: 22,
            padding: "0 8px",
            background: "transparent",
            color: noneDone ? "var(--crm-gray-300)" : "var(--crm-gray-600)",
            border: 0,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
            cursor: busy !== null || noneDone ? "default" : "pointer",
          }}
        >
          {busy === "clear" ? "..." : labels.clear}
        </button>
      </div>
    </div>
  )
}

// ─── EmailStatusActions ───────────────────────────────────

function EmailStatusActions({
  status,
  canAdvance,
  onUpdateStatus,
}: {
  status: EmailFlowEmail["status"]
  canAdvance: boolean
  onUpdateStatus: (s: EmailFlowEmail["status"]) => Promise<void>
}) {
  // Estados por status atual (left = recuar/salvar, right = avancar)
  if (status === "draft" || status === "in_progress") {
    return (
      <div className="flex gap-2">
        <SecondaryBtn
          onClick={() => onUpdateStatus("draft")}
          icon={<Download className="h-3 w-3" />}
        >
          Salvar rascunho
        </SecondaryBtn>
        <PrimaryBtn
          disabled={!canAdvance}
          onClick={() => onUpdateStatus("ready")}
          icon={<ChevronRight className="h-3 w-3" />}
          iconRight
        >
          Enviar pra aprovação
        </PrimaryBtn>
      </div>
    )
  }
  if (status === "ready") {
    return (
      <div className="flex gap-2">
        <SecondaryBtn
          onClick={() => onUpdateStatus("draft")}
          icon={<ChevronLeft className="h-3 w-3" />}
        >
          Voltar pra rascunho
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => onUpdateStatus("approved")}
          icon={<Check className="h-3 w-3" />}
        >
          Aprovar
        </PrimaryBtn>
      </div>
    )
  }
  if (status === "approved") {
    return (
      <div className="flex gap-2">
        <SecondaryBtn
          onClick={() => onUpdateStatus("draft")}
          icon={<ChevronLeft className="h-3 w-3" />}
        >
          Reabrir
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => onUpdateStatus("live")}
          icon={<ChevronRight className="h-3 w-3" />}
          iconRight
        >
          Marcar como ao vivo
        </PrimaryBtn>
      </div>
    )
  }
  // status === "live"
  return (
    <div className="flex gap-2">
      <SecondaryBtn
        onClick={() => onUpdateStatus("draft")}
        icon={<ChevronLeft className="h-3 w-3" />}
      >
        Reabrir e revisar
      </SecondaryBtn>
      <div
        className="flex-1 inline-flex items-center justify-center"
        style={{
          height: 32,
          borderRadius: 6,
          background: "var(--crm-pos-bg)",
          color: "var(--crm-pos)",
          fontSize: 12,
          fontWeight: 600,
          gap: 6,
        }}
      >
        <Check className="h-3 w-3" />
        Ao vivo
      </div>
    </div>
  )
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
  icon,
  iconRight,
}: {
  children: React.ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  icon?: React.ReactNode
  iconRight?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="cf-focusable flex-1"
      style={{
        height: 32,
        background: disabled ? "var(--crm-gray-100)" : "var(--crm-brand)",
        color: disabled ? "var(--crm-gray-400)" : "var(--crm-brand-fg)",
        border: 0,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {!iconRight && icon}
      {children}
      {iconRight && icon}
    </button>
  )
}

function SecondaryBtn({
  children,
  onClick,
  icon,
}: {
  children: React.ReactNode
  onClick: () => void | Promise<void>
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="cf-focusable flex-1"
      style={{
        height: 32,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 6,
        color: "var(--crm-gray-700)",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

// ─── AddBlockPicker / AddQAInput ──────────────────────────

const BLOCK_TYPE_OPTIONS: Array<{ value: BlockType; label: string }> = [
  { value: "hero", label: "Hero" },
  { value: "text", label: "Texto" },
  { value: "coupon", label: "Cupom" },
  { value: "products", label: "Produtos" },
  { value: "image", label: "Imagem" },
  { value: "cta", label: "Botão (CTA)" },
  { value: "footer", label: "Rodapé" },
  { value: "divider", label: "Divisor" },
  { value: "spacer", label: "Espaçador" },
  { value: "social", label: "Redes sociais" },
]

function AddBlockPicker({
  onAdd,
}: {
  onAdd: (blockType: BlockType) => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cf-focusable"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-border)",
          borderRadius: 8,
          color: "var(--crm-gray-600)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Plus className="h-3 w-3" />
        Adicionar bloco
      </button>
    )
  }

  return (
    <div
      style={{
        padding: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-brand)",
        borderRadius: 8,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 8 }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Escolha o tipo
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--crm-gray-500)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        {BLOCK_TYPE_OPTIONS.map((opt) => {
          const Icon = BLOCK_TYPE_ICON[opt.value] ?? FileImage
          return (
            <button
              key={opt.value}
              onClick={async () => {
                setOpen(false)
                await onAdd(opt.value)
              }}
              style={{
                padding: "8px 10px",
                background: "var(--crm-gray-50)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
                color: "var(--crm-gray-800)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: "var(--crm-blue-50)",
                  color: "var(--crm-brand)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon className="h-3 w-3" />
              </span>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AddQAInput({
  onAdd,
}: {
  onAdd: (label: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const v = value.trim()
    if (!v) return
    setSubmitting(true)
    try {
      await onAdd(v)
      setValue("")
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cf-focusable"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "var(--crm-gray-0)",
          border: "1px dashed var(--crm-border)",
          borderRadius: 8,
          color: "var(--crm-gray-600)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Plus className="h-3 w-3" />
        Adicionar item de checklist
      </button>
    )
  }

  return (
    <div
      style={{
        padding: 10,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-brand)",
        borderRadius: 8,
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            submit()
          } else if (e.key === "Escape") {
            setOpen(false)
            setValue("")
          }
        }}
        placeholder="Ex.: verificar links UTM"
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
          fontSize: 12,
          color: "var(--crm-gray-900)",
          outline: "none",
          marginBottom: 6,
        }}
      />
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => {
            setOpen(false)
            setValue("")
          }}
          style={{
            height: 24,
            padding: "0 10px",
            background: "transparent",
            border: "1px solid var(--crm-border)",
            borderRadius: 4,
            color: "var(--crm-gray-600)",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={!value.trim() || submitting}
          style={{
            height: 24,
            padding: "0 10px",
            background: !value.trim() ? "var(--crm-gray-200)" : "var(--crm-brand)",
            border: 0,
            borderRadius: 4,
            color: !value.trim() ? "var(--crm-gray-500)" : "var(--crm-brand-fg)",
            fontSize: 11,
            fontWeight: 600,
            cursor: !value.trim() || submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "..." : "Adicionar"}
        </button>
      </div>
    </div>
  )
}
