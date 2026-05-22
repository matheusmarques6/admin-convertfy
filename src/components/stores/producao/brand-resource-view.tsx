"use client"

import { useEffect, useRef, useState } from "react"
import {
  Award,
  Check,
  CreditCard,
  Download,
  ExternalLink,
  Gift,
  Heart,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Truck,
  Upload,
  X,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  BrandColor,
  TrustIcon,
  TopProduct,
} from "@/types/email-workspace"

export interface TopProductSyncItem {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  image_url: string | null
  captured_at?: string | null
}

export interface TopProductsSync {
  captured_at: string | null
  items: TopProductSyncItem[]
}

export interface StoreSummary {
  id: string
  store_name: string
  store_url: string | null
  platform: string | null
  niche: string | null
}

// ── Drafts pra modo edit ──────────────────────────────────────────────
// Snapshot dos campos editaveis. Init copia do upstream; salvar emite
// PATCH so com os campos que mudaram (diff).

interface EditableBrand {
  colors_primary: BrandColor[]
  colors_secondary: BrandColor[]
  font_heading: string | null
  font_heading_weight: string | null
  font_body: string | null
  font_body_weight: string | null
  voice: string[]
  trust_icons: TrustIcon[]
}

interface EditableBriefing {
  slogan: string | null
  nicho: string | null
  posicionamento: string | null
}

interface EditableStore {
  niche: string | null
}

function initBrandDraft(b: StoreBrandIdentity | null): EditableBrand {
  return {
    colors_primary: b?.colors_primary ?? [],
    colors_secondary: b?.colors_secondary ?? [],
    font_heading: b?.font_heading ?? null,
    font_heading_weight: b?.font_heading_weight ?? null,
    font_body: b?.font_body ?? null,
    font_body_weight: b?.font_body_weight ?? null,
    voice: b?.voice ?? [],
    trust_icons: b?.trust_icons ?? [],
  }
}

function initBriefingDraft(b: StoreBriefing | null | undefined): EditableBriefing {
  return {
    slogan: b?.marca?.slogan ?? null,
    nicho: b?.marca?.nicho ?? null,
    posicionamento: b?.marca?.posicionamento ?? null,
  }
}

function initStoreDraft(s: StoreSummary | null | undefined): EditableStore {
  return { niche: s?.niche ?? null }
}

// Retorna patch ou null se nada mudou. Compara JSON pra arrays/strings.
function diffBrand(
  original: StoreBrandIdentity | null,
  draft: EditableBrand,
): Record<string, unknown> | null {
  if (!original) return null
  const orig = initBrandDraft(original)
  const patch: Record<string, unknown> = {}
  for (const k of Object.keys(draft) as (keyof EditableBrand)[]) {
    if (JSON.stringify(orig[k]) !== JSON.stringify(draft[k])) {
      patch[k] = draft[k]
    }
  }
  return Object.keys(patch).length ? patch : null
}

function diffBriefing(
  original: StoreBriefing | null | undefined,
  draft: EditableBriefing,
): { marca: Record<string, unknown> } | null {
  const orig = initBriefingDraft(original)
  const marcaPatch: Record<string, unknown> = {}
  for (const k of Object.keys(draft) as (keyof EditableBriefing)[]) {
    if ((orig[k] ?? null) !== (draft[k] ?? null)) {
      marcaPatch[k] = draft[k]
    }
  }
  return Object.keys(marcaPatch).length ? { marca: marcaPatch } : null
}

function diffStore(
  original: StoreSummary | null | undefined,
  draft: EditableStore,
): Record<string, unknown> | null {
  if ((original?.niche ?? null) === (draft.niche ?? null)) return null
  return { niche: draft.niche }
}

const TRUST_ICON_MAP: Record<TrustIcon["icon_type"], typeof Truck> = {
  truck: Truck,
  seal: Award,
  shield: ShieldCheck,
  star: Star,
  card: CreditCard,
  refresh: RefreshCw,
  trophy: Trophy,
  heart: Heart,
  lock: Lock,
  gift: Gift,
}

interface BrandResourceViewProps {
  storeId: string
  storeName: string
  brand: StoreBrandIdentity | null
  briefing?: StoreBriefing | null
  store?: StoreSummary | null
  topProductsSync?: TopProductsSync | null
  onChanged: () => void
}

export function BrandResourceView({
  storeId,
  storeName,
  brand,
  briefing,
  store,
  topProductsSync,
  onChanged,
}: BrandResourceViewProps) {
  const wordmark = storeName.toUpperCase()
  const monogramLetter = storeName.charAt(0).toUpperCase() || "?"
  const toast = useToast()
  const [generating, setGenerating] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [mode, setMode] = useState<"view" | "edit">("view")
  const [savingEdits, setSavingEdits] = useState(false)
  // Drafts: snapshots editaveis dos 3 stores (brand, briefing.marca, store).
  // Inicializados ao entrar em modo edit; descartados ao cancelar/salvar.
  const [brandDraft, setBrandDraft] = useState<EditableBrand>(() =>
    initBrandDraft(brand),
  )
  const [briefingDraft, setBriefingDraft] = useState<EditableBriefing>(() =>
    initBriefingDraft(briefing),
  )
  const [storeDraft, setStoreDraft] = useState<EditableStore>(() =>
    initStoreDraft(store),
  )

  // Re-inicializa drafts quando os dados upstream mudam (refetch apos save).
  // Importante usar uma key estavel — created_at do brand mais a versao
  // do briefing — pra resincronizar sem loop.
  useEffect(() => {
    if (mode === "view") {
      setBrandDraft(initBrandDraft(brand))
      setBriefingDraft(initBriefingDraft(briefing))
      setStoreDraft(initStoreDraft(store))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    brand?.id,
    brand?.created_at,
    briefing?.id,
    briefing?.created_at,
    store?.id,
  ])

  const enterEditMode = () => {
    setBrandDraft(initBrandDraft(brand))
    setBriefingDraft(initBriefingDraft(briefing))
    setStoreDraft(initStoreDraft(store))
    setMode("edit")
  }

  const hasUnsavedChanges =
    !!diffBrand(brand, brandDraft) ||
    !!diffBriefing(briefing, briefingDraft) ||
    !!diffStore(store, storeDraft)

  // ESC sai do modo edit (com confirmacao se ha mudancas).
  useEffect(() => {
    if (mode !== "edit") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelEditMode()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasUnsavedChanges])

  // Avisa antes de sair do app com mudancas nao salvas
  useEffect(() => {
    if (mode !== "edit" || !hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [mode, hasUnsavedChanges])

  // Upload de logo: envia direto pro endpoint /brand-identity/upload (que
  // armazena no Supabase Storage e devolve a URL assinada). NÃO mexe no
  // draft — o /upload já cria uma nova versão de store_brand_identity
  // setando o slot, então só refetchamos no fim.
  const uploadingRef = useRef<string | null>(null)
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)

  const uploadLogo = async (slot: string, file: File) => {
    if (uploadingRef.current) return
    uploadingRef.current = slot
    setUploadingSlot(slot)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("slot", slot)
      const r = await fetch(
        `/api/admin/stores/${storeId}/brand-identity/upload`,
        { method: "POST", body: fd },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message || "Falha no upload")
      }
      toast.toast({
        title: "Logo atualizado",
        description: "A nova versao ja esta disponivel.",
      })
      onChanged()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao enviar logo",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      uploadingRef.current = null
      setUploadingSlot(null)
    }
  }

  const cancelEditMode = () => {
    if (
      hasUnsavedChanges &&
      typeof window !== "undefined" &&
      !window.confirm("Descartar alteracoes nao salvas?")
    ) {
      return
    }
    setBrandDraft(initBrandDraft(brand))
    setBriefingDraft(initBriefingDraft(briefing))
    setStoreDraft(initStoreDraft(store))
    setMode("view")
  }

  const saveEdits = async () => {
    if (!brand) return
    setSavingEdits(true)
    try {
      const calls: Promise<Response>[] = []

      // PATCH brand-identity
      const brandPatch = diffBrand(brand, brandDraft)
      if (brandPatch) {
        calls.push(
          fetch(`/api/admin/stores/${storeId}/brand-identity`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(brandPatch),
          }),
        )
      }

      // PATCH briefing
      const briefingPatch = diffBriefing(briefing, briefingDraft)
      if (briefingPatch) {
        calls.push(
          fetch(`/api/admin/stores/${storeId}/briefing`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(briefingPatch),
          }),
        )
      }

      // PATCH store (niche)
      const storePatch = diffStore(store, storeDraft)
      if (storePatch) {
        calls.push(
          fetch(`/api/admin/stores/${storeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(storePatch),
          }),
        )
      }

      if (calls.length === 0) {
        toast.toast({
          title: "Sem alteracoes",
          description: "Nada novo pra salvar.",
        })
        setMode("view")
        return
      }

      const results = await Promise.all(calls)
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        throw new Error(`${failed.length} requisicao(oes) falharam`)
      }

      toast.toast({
        title: "Alteracoes salvas",
        description: "Identidade visual atualizada.",
      })
      setMode("view")
      onChanged()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setSavingEdits(false)
    }
  }

  const handleAiCapture = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/capture-brand`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || "Falha ao capturar identidade")
      }
      toast.toast({
        title: "Identidade capturada",
        description: "Versão nova criada via IA",
      })
      onChanged()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setGenerating(false)
    }
  }

  const lastUpdate = brand
    ? formatRelativeTime(brand.created_at)
    : null

  const handleDownloadZip = async () => {
    if (!brand) return
    setDownloadingZip(true)
    try {
      const res = await fetch(
        `/api/admin/stores/${storeId}/brand-identity/download-zip`,
      )
      if (!res.ok) {
        throw new Error(`Falha ao baixar (HTTP ${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      a.download = match?.[1] ?? "brand-assets.zip"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao baixar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setDownloadingZip(false)
    }
  }

  // Resolvers de campos do bloco "Sobre a loja" — combinam briefing (que
  // tende a ser a fonte de verdade pos-briefing) com client_stores como
  // fallback.
  const slogan =
    briefing?.marca?.slogan ?? null
  const niche = store?.niche ?? briefing?.marca?.nicho ?? null
  const platform = store?.platform ?? null
  const storeUrl = store?.store_url ?? null
  const posicionamentoRaw = briefing?.marca?.posicionamento ?? null
  const posicionamento =
    posicionamentoRaw === "popular"
      ? "Popular"
      : posicionamentoRaw === "medio"
        ? "Médio"
        : posicionamentoRaw === "premium"
          ? "Premium"
          : posicionamentoRaw
            ? String(posicionamentoRaw).charAt(0).toUpperCase() +
              String(posicionamentoRaw).slice(1)
            : null

  // Top products: prioriza sync de store_top_products; fallback pro snapshot
  // em brand.top_products quando o webhook ainda nao rodou.
  const syncedTopProducts =
    topProductsSync?.items && topProductsSync.items.length > 0
      ? topProductsSync.items
      : null
  const fallbackTopProducts =
    !syncedTopProducts && brand?.top_products && brand.top_products.length > 0
      ? brand.top_products
      : null
  const topProductsCapturedAt = topProductsSync?.captured_at ?? null

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--crm-gray-50)" }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between sticky top-0 z-10"
        style={{
          padding: "20px 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-[8px]"
            style={{
              width: 32,
              height: 32,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            <Heart className="h-4 w-4" />
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                letterSpacing: "-0.015em",
              }}
            >
              Identidade visual
            </h2>
            {lastUpdate && (
              <span style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
                · revisado pela última vez {lastUpdate}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadZip}
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
              color: "var(--crm-gray-700)",
              fontSize: 12,
              fontWeight: 500,
              cursor: !brand || downloadingZip ? "default" : "pointer",
              opacity: !brand || downloadingZip ? 0.55 : 1,
            }}
            disabled={!brand || downloadingZip}
            title="Baixa todos os logos como ZIP"
            aria-label="Baixar todos os logos da identidade visual como ZIP"
          >
            <Download className="h-3 w-3" />
            {downloadingZip ? "Preparando..." : "Baixar tudo"}
          </button>
          {mode === "view" && (
            <button
              onClick={handleAiCapture}
              disabled={generating}
              className="cf-focusable inline-flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                background: "var(--crm-gray-0)",
                color: "var(--crm-brand)",
                border: "1px solid var(--crm-border)",
                borderRadius: 6,
                cursor: generating ? "default" : "pointer",
                opacity: generating ? 0.6 : 1,
              }}
              title={generating ? "Capturando..." : brand ? "Recapturar com IA" : "Capturar com IA"}
              aria-label={generating ? "Capturando identidade com IA" : brand ? "Recapturar identidade visual com IA" : "Capturar identidade visual com IA"}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          )}
          {mode === "view" && (
            <button
              onClick={enterEditMode}
              disabled={!brand}
              className="cf-focusable inline-flex items-center gap-1.5"
              style={{
                height: 32,
                padding: "0 14px",
                background: "var(--crm-brand)",
                color: "var(--crm-brand-fg)",
                border: 0,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: !brand ? "default" : "pointer",
                opacity: !brand ? 0.55 : 1,
              }}
            >
              <Pencil className="h-3 w-3" />
              Editar
            </button>
          )}
          {mode === "edit" && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--crm-brand)",
                padding: "6px 10px",
                background: "var(--crm-blue-50)",
                border: "1px solid var(--crm-blue-100)",
                borderRadius: 6,
              }}
            >
              Editando · alteracoes pendentes
            </span>
          )}
        </div>
      </div>

      {/* Bloco "Sobre a loja" */}
      <div
        style={{
          padding: "24px 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--crm-gray-900)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {storeName}
        </div>
        {mode === "view" && slogan && (
          <div
            style={{
              marginTop: 4,
              fontSize: 13.5,
              color: "var(--crm-gray-600)",
              fontStyle: "italic",
            }}
          >
            {slogan}
          </div>
        )}
        {mode === "edit" && (
          <input
            value={briefingDraft.slogan ?? ""}
            onChange={(e) =>
              setBriefingDraft((d) => ({ ...d, slogan: e.target.value }))
            }
            placeholder="Slogan da marca (ex: Viva o esporte com a Vivazz)"
            style={{
              marginTop: 8,
              width: "100%",
              maxWidth: 540,
              padding: "8px 12px",
              fontSize: 13.5,
              fontStyle: briefingDraft.slogan ? "italic" : "normal",
              color: "var(--crm-gray-900)",
              background: "var(--crm-gray-50)",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
            }}
          />
        )}
        <div
          className="grid"
          style={{
            marginTop: 16,
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {mode === "view" ? (
            <>
              <StoreField label="Segmento" value={niche} />
              <StoreField label="Plataforma" value={platform} />
              <StoreField
                label="URL"
                value={storeUrl}
                href={storeUrl ? normalizeUrl(storeUrl) : null}
              />
              <StoreField label="Posicionamento" value={posicionamento} />
            </>
          ) : (
            <>
              <StoreFieldEdit
                label="Segmento"
                value={storeDraft.niche}
                onChange={(v) => setStoreDraft((d) => ({ ...d, niche: v }))}
                placeholder="Ex: Calçados esportivos · vôlei e basquete"
              />
              <StoreField label="Plataforma" value={platform} />
              <StoreField
                label="URL"
                value={storeUrl}
                href={storeUrl ? normalizeUrl(storeUrl) : null}
              />
              <StoreFieldSelectEdit
                label="Posicionamento"
                value={briefingDraft.posicionamento}
                onChange={(v) =>
                  setBriefingDraft((d) => ({ ...d, posicionamento: v }))
                }
                options={[
                  { value: "popular", label: "Popular" },
                  { value: "medio", label: "Médio" },
                  { value: "premium", label: "Premium" },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "32px 32px 48px" }}>
        {!brand ? (
          <EmptyState onCapture={handleAiCapture} generating={generating} />
        ) : (
          <>
            {/* Logos */}
            <SectionTitle title="Logo" subtitle="Versões oficiais da marca · clique em baixar para o SVG" />
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                marginTop: 16,
              }}
            >
              <LogoCard
                title="Wordmark"
                subtitle="Versão principal"
                svg={brand.logo_main_svg}
                png={brand.logo_main_png}
                bg="#FFFFFF"
                editing={mode === "edit"}
                uploadingSvg={uploadingSlot === "logo_main_svg"}
                uploadingPng={uploadingSlot === "logo_main_png"}
                onUploadSvg={(file) => uploadLogo("logo_main_svg", file)}
                onUploadPng={(file) => uploadLogo("logo_main_png", file)}
                preview={
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: "#0F0F0F",
                      textTransform: "uppercase",
                    }}
                  >
                    {wordmark}
                  </div>
                }
              />
              <LogoCard
                title="Wordmark · azul"
                subtitle="Versão em destaque"
                svg={brand.logo_alt_svg}
                png={brand.logo_alt_png}
                bg="#FFFFFF"
                editing={mode === "edit"}
                uploadingSvg={uploadingSlot === "logo_alt_svg"}
                uploadingPng={uploadingSlot === "logo_alt_png"}
                onUploadSvg={(file) => uploadLogo("logo_alt_svg", file)}
                onUploadPng={(file) => uploadLogo("logo_alt_png", file)}
                preview={
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: brand.colors_primary?.[0]?.hex ?? "var(--crm-brand)",
                      textTransform: "uppercase",
                    }}
                  >
                    {wordmark}
                  </div>
                }
              />
              <LogoCard
                title={`Monograma · ${monogramLetter}`}
                subtitle="Avatar · favicon · selo"
                svg={brand.logo_monogram_svg}
                png={brand.logo_monogram_png}
                bg="#FFFFFF"
                editing={mode === "edit"}
                uploadingSvg={uploadingSlot === "logo_monogram_svg"}
                uploadingPng={uploadingSlot === "logo_monogram_png"}
                onUploadSvg={(file) => uploadLogo("logo_monogram_svg", file)}
                onUploadPng={(file) => uploadLogo("logo_monogram_png", file)}
                preview={
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      background:
                        brand.colors_primary?.[0]?.hex ?? "var(--crm-brand)",
                      color: "#fff",
                      fontSize: 36,
                      fontWeight: 900,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                    }}
                  >
                    {monogramLetter}
                  </div>
                }
              />
              <LogoCard
                title="Versão reversa"
                subtitle="Pra fundos escuros"
                svg={brand.logo_reverse_svg}
                png={brand.logo_reverse_png}
                bg="#0F0F0F"
                editing={mode === "edit"}
                uploadingSvg={uploadingSlot === "logo_reverse_svg"}
                uploadingPng={uploadingSlot === "logo_reverse_png"}
                onUploadSvg={(file) => uploadLogo("logo_reverse_svg", file)}
                onUploadPng={(file) => uploadLogo("logo_reverse_png", file)}
                preview={
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: "#fff",
                      textTransform: "uppercase",
                    }}
                  >
                    {wordmark}
                  </div>
                }
              />
            </div>

            {/* Cores principais */}
            <SectionTitle title="Cores principais" style={{ marginTop: 40 }} />
            <ColorGrid
              colors={mode === "edit" ? brandDraft.colors_primary : (brand.colors_primary ?? [])}
              editing={mode === "edit"}
              variant="large"
              onChange={(next) =>
                setBrandDraft((d) => ({ ...d, colors_primary: next }))
              }
              defaultRole="Principal"
            />

            {/* Cores secundárias */}
            {(mode === "edit" || (brand.colors_secondary && brand.colors_secondary.length > 0)) && (
              <>
                <SectionTitle
                  title="Cores secundárias"
                  subtitle="Paleta de apoio · use em backgrounds e detalhes"
                  style={{ marginTop: 32 }}
                />
                <ColorGrid
                  colors={
                    mode === "edit"
                      ? brandDraft.colors_secondary
                      : (brand.colors_secondary ?? [])
                  }
                  editing={mode === "edit"}
                  variant="small"
                  onChange={(next) =>
                    setBrandDraft((d) => ({ ...d, colors_secondary: next }))
                  }
                  defaultRole="Secundário"
                />
              </>
            )}

            {/* Tipografia */}
            {(mode === "edit" || brand.font_heading || brand.font_body) && (
              <>
                <SectionTitle title="Tipografia" style={{ marginTop: 40 }} />
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
                  {mode === "edit" ? (
                    <FontPreviewEdit
                      label="Display · headlines"
                      family={brandDraft.font_heading}
                      weight={brandDraft.font_heading_weight}
                      onChange={(family, weight) =>
                        setBrandDraft((d) => ({
                          ...d,
                          font_heading: family,
                          font_heading_weight: weight,
                        }))
                      }
                      big
                    />
                  ) : (
                    brand.font_heading && (
                      <FontPreview
                        label="Display · headlines"
                        family={brand.font_heading}
                        weight={brand.font_heading_weight}
                        sample="Aa"
                        big
                      />
                    )
                  )}
                  {mode === "edit" ? (
                    <FontPreviewEdit
                      label="Corpo · body"
                      family={brandDraft.font_body}
                      weight={brandDraft.font_body_weight}
                      onChange={(family, weight) =>
                        setBrandDraft((d) => ({
                          ...d,
                          font_body: family,
                          font_body_weight: weight,
                        }))
                      }
                    />
                  ) : (
                    brand.font_body && (
                      <FontPreview
                        label="Corpo · body"
                        family={brand.font_body}
                        weight={brand.font_body_weight}
                        sample="Aa"
                      />
                    )
                  )}
                </div>
              </>
            )}

            {/* Tom de voz */}
            {(mode === "edit" || (brand.voice && brand.voice.length > 0)) && (
              <>
                <SectionTitle
                  title="Tom de voz"
                  subtitle="Atributos que orientam a copy"
                  style={{ marginTop: 40 }}
                />
                {mode === "edit" ? (
                  <VoiceEditor
                    voice={brandDraft.voice}
                    onChange={(next) =>
                      setBrandDraft((d) => ({ ...d, voice: next }))
                    }
                  />
                ) : (
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 16 }}>
                    {brand.voice.map((v) => (
                      <span
                        key={v}
                        style={{
                          padding: "6px 14px",
                          background: "var(--crm-blue-50)",
                          border: "1px solid var(--crm-blue-100)",
                          color: "var(--crm-brand)",
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Top 5 produtos mais vendidos */}
            {(syncedTopProducts || fallbackTopProducts) && (
              <>
                <SectionTitle
                  title="Top 5 produtos mais vendidos"
                  subtitle={
                    syncedTopProducts
                      ? `Últimos 90 dias · sincronizado do ${platform ?? "Shopify"}${
                          topProductsCapturedAt
                            ? ` ${formatRelativeTime(topProductsCapturedAt)}`
                            : ""
                        }`
                      : "Top produtos captados da loja"
                  }
                  style={{ marginTop: 40 }}
                />
                <div
                  className="grid"
                  style={{
                    marginTop: 16,
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 14,
                  }}
                >
                  {syncedTopProducts
                    ? syncedTopProducts.map((p) => (
                        <TopProductSyncCard
                          key={p.rank}
                          item={p}
                          fallbackCurrency={null}
                        />
                      ))
                    : fallbackTopProducts!.map((p, i) => (
                        <TopProductCard key={p.id ?? i} product={p} />
                      ))}
                </div>
              </>
            )}

            {/* Selos de confiança */}
            {(mode === "edit" ||
              (brand.trust_icons && brand.trust_icons.length > 0)) && (
              <>
                <SectionTitle
                  title="Selos de confiança"
                  subtitle="Bloco visual pronto pra usar nos emails"
                  style={{ marginTop: 40 }}
                />
                <div
                  className="grid"
                  style={{
                    marginTop: 16,
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  {(mode === "edit" ? brandDraft.trust_icons : brand.trust_icons).map(
                    (ic, i) =>
                      mode === "edit" ? (
                        <TrustIconCardEdit
                          key={i}
                          icon={ic}
                          onChange={(next) =>
                            setBrandDraft((d) => ({
                              ...d,
                              trust_icons: d.trust_icons.map((x, idx) =>
                                idx === i ? next : x,
                              ),
                            }))
                          }
                          onRemove={() =>
                            setBrandDraft((d) => ({
                              ...d,
                              trust_icons: d.trust_icons.filter(
                                (_, idx) => idx !== i,
                              ),
                            }))
                          }
                        />
                      ) : (
                        <TrustIconCard key={i} icon={ic} />
                      ),
                  )}
                  {mode === "edit" && (
                    <button
                      onClick={() =>
                        setBrandDraft((d) => ({
                          ...d,
                          trust_icons: [
                            ...d.trust_icons,
                            {
                              icon_type: "shield",
                              title: "Novo selo",
                              subtitle: "",
                              is_existing: true,
                            },
                          ],
                        }))
                      }
                      className="cf-focusable"
                      style={{
                        background: "var(--crm-gray-50)",
                        border: "1px dashed var(--crm-border)",
                        borderRadius: 8,
                        color: "var(--crm-gray-500)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        minHeight: 70,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar selo
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {mode === "edit" && (
        <div
          className="flex items-center justify-end gap-2"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 20,
            padding: "12px 32px",
            background: "var(--crm-gray-0)",
            borderTop: "1px solid var(--crm-border)",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.04)",
          }}
        >
          <button
            onClick={cancelEditMode}
            disabled={savingEdits}
            className="cf-focusable"
            style={{
              height: 32,
              padding: "0 14px",
              background: "var(--crm-gray-0)",
              border: "1px solid var(--crm-border)",
              borderRadius: 6,
              color: "var(--crm-gray-700)",
              fontSize: 12,
              fontWeight: 500,
              cursor: savingEdits ? "default" : "pointer",
              opacity: savingEdits ? 0.55 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={saveEdits}
            disabled={savingEdits}
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 14px",
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: savingEdits ? "default" : "pointer",
              opacity: savingEdits ? 0.7 : 1,
            }}
          >
            <Check className="h-3 w-3" />
            {savingEdits ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      )}
    </div>
  )
}

function StoreField({
  label,
  value,
  href,
}: {
  label: string
  value: string | null
  href?: string | null
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 13,
            color: "var(--crm-brand)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          {value ?? "—"}
        </a>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: value ? "var(--crm-gray-900)" : "var(--crm-gray-400)",
            fontWeight: 500,
          }}
        >
          {value ?? "—"}
        </div>
      )}
    </div>
  )
}

function StoreFieldEdit({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "6px 10px",
          fontSize: 13,
          color: "var(--crm-gray-900)",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
        }}
      />
    </div>
  )
}

function StoreFieldSelectEdit({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%",
          padding: "6px 10px",
          fontSize: 13,
          color: "var(--crm-gray-900)",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
        }}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return "#"
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function VoiceEditor({
  voice,
  onChange,
}: {
  voice: string[]
  onChange: (next: string[]) => void
}) {
  const [pending, setPending] = useState("")
  const addPending = () => {
    const v = pending.trim()
    if (!v) return
    if (voice.includes(v)) {
      setPending("")
      return
    }
    onChange([...voice, v])
    setPending("")
  }
  return (
    <div className="flex flex-wrap gap-2" style={{ marginTop: 16 }}>
      {voice.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "6px 8px 6px 14px",
            background: "var(--crm-blue-50)",
            border: "1px solid var(--crm-blue-100)",
            color: "var(--crm-brand)",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {v}
          <button
            onClick={() => onChange(voice.filter((_, idx) => idx !== i))}
            title="Remover"
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: "transparent",
              border: 0,
              color: "var(--crm-brand)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.7,
            }}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            addPending()
          }
        }}
        onBlur={addPending}
        placeholder="+ Adicionar atributo"
        style={{
          padding: "6px 12px",
          fontSize: 13,
          background: "var(--crm-gray-50)",
          border: "1px dashed var(--crm-border)",
          borderRadius: 999,
          color: "var(--crm-gray-700)",
          minWidth: 160,
        }}
      />
    </div>
  )
}

function TrustIconCardEdit({
  icon,
  onChange,
  onRemove,
}: {
  icon: TrustIcon
  onChange: (next: TrustIcon) => void
  onRemove: () => void
}) {
  const Icon = TRUST_ICON_MAP[icon.icon_type] ?? Award
  const iconOptions: TrustIcon["icon_type"][] = [
    "truck",
    "seal",
    "shield",
    "star",
    "card",
    "refresh",
    "trophy",
    "heart",
    "lock",
    "gift",
  ]
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
      }}
    >
      <button
        onClick={onRemove}
        title="Remover selo"
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 20,
          height: 20,
          borderRadius: 4,
          background: "transparent",
          color: "var(--crm-gray-400)",
          border: 0,
          cursor: "pointer",
        }}
      >
        <X className="h-3 w-3" />
      </button>
      <div className="flex items-center gap-2">
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--crm-blue-50)",
            color: "var(--crm-brand)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <select
          value={icon.icon_type}
          onChange={(e) =>
            onChange({ ...icon, icon_type: e.target.value as TrustIcon["icon_type"] })
          }
          style={{
            flex: 1,
            padding: "4px 6px",
            fontSize: 11,
            color: "var(--crm-gray-700)",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 4,
          }}
        >
          {iconOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      <input
        value={icon.title}
        onChange={(e) => onChange({ ...icon, title: e.target.value })}
        placeholder="Título (ex: ENVIO GRATUITO)"
        style={{
          padding: "4px 8px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
        }}
      />
      <input
        value={icon.subtitle ?? ""}
        onChange={(e) => onChange({ ...icon, subtitle: e.target.value })}
        placeholder="Subtítulo"
        style={{
          padding: "4px 8px",
          fontSize: 11,
          color: "var(--crm-gray-500)",
          background: "var(--crm-gray-50)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
        }}
      />
    </div>
  )
}

function TrustIconCard({ icon }: { icon: TrustIcon }) {
  const Icon = TRUST_ICON_MAP[icon.icon_type] ?? Award
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: icon.is_existing
            ? "var(--crm-pos-bg)"
            : "var(--crm-blue-50)",
          color: icon.is_existing ? "var(--crm-pos)" : "var(--crm-brand)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
          }}
        >
          {icon.title}
        </div>
        {icon.subtitle && (
          <div
            className="truncate"
            style={{
              fontSize: 11,
              color: "var(--crm-gray-500)",
              marginTop: 1,
            }}
          >
            {icon.subtitle}
          </div>
        )}
        {!icon.is_existing && (
          <div
            style={{
              fontSize: 10,
              color: "var(--crm-warn)",
              marginTop: 3,
              fontWeight: 500,
            }}
          >
            Sugerido (não confirmado)
          </div>
        )}
      </div>
    </div>
  )
}

function TopProductSyncCard({
  item,
  fallbackCurrency,
}: {
  item: TopProductSyncItem
  fallbackCurrency: string | null
}) {
  const currency = item.currency || fallbackCurrency || "BRL"
  const priceText =
    typeof item.price === "number"
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency,
        }).format(item.price)
      : null
  const handleUrl = item.handle
    ? item.handle.startsWith("http")
      ? item.handle
      : null
    : null
  const Wrapper = handleUrl ? "a" : "div"
  return (
    <Wrapper
      {...(handleUrl
        ? { href: handleUrl, target: "_blank", rel: "noreferrer" }
        : {})}
      style={{
        display: "block",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        overflow: "hidden",
        color: "inherit",
        textDecoration: "none",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          width: 24,
          height: 24,
          borderRadius: 999,
          background: "rgba(15,15,15,0.8)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          zIndex: 1,
        }}
      >
        #{item.rank}
      </div>
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "var(--crm-gray-100)",
          backgroundImage: item.image_url ? `url(${item.image_url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div style={{ padding: "10px 12px" }}>
        <div
          className="truncate"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            lineHeight: 1.25,
          }}
          title={item.title}
        >
          {item.title}
        </div>
        {priceText && (
          <div
            className="crm-tnum"
            style={{
              marginTop: 4,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--crm-brand)",
            }}
          >
            {priceText}
          </div>
        )}
      </div>
    </Wrapper>
  )
}

function TopProductCard({ product }: { product: TopProduct }) {
  const priceText =
    typeof product.price === "number"
      ? `R$ ${product.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : product.price
        ? String(product.price)
        : ""
  return (
    <a
      href={product.url || undefined}
      target={product.url ? "_blank" : undefined}
      rel={product.url ? "noreferrer" : undefined}
      style={{
        display: "block",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        overflow: "hidden",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "var(--crm-gray-100)",
          backgroundImage: product.image_url
            ? `url(${product.image_url})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div style={{ padding: "8px 10px" }}>
        <div
          className="truncate"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
          }}
        >
          {product.name}
        </div>
        {priceText && (
          <div
            className="crm-tnum"
            style={{
              marginTop: 2,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--crm-brand)",
            }}
          >
            {priceText}
          </div>
        )}
      </div>
    </a>
  )
}

function EmptyState({
  onCapture,
  generating,
}: {
  onCapture: () => void
  generating: boolean
}) {
  return (
    <div
      className="text-center mx-auto"
      style={{
        maxWidth: 480,
        padding: "60px 40px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 14,
      }}
    >
      <div
        className="mx-auto flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          marginBottom: 16,
          borderRadius: 14,
          background: "var(--crm-blue-50)",
          color: "var(--crm-brand)",
        }}
      >
        <Sparkles className="h-6 w-6" />
      </div>
      <h2
        style={{
          margin: "0 0 6px",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
        }}
      >
        Identidade visual ainda não capturada
      </h2>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 13,
          color: "var(--crm-gray-500)",
          lineHeight: 1.5,
        }}
      >
        Use a IA pra extrair logo, paleta de cores e tipografia diretamente do
        site da loja em poucos segundos. Depois você refina manualmente.
      </p>
      <button
        onClick={onCapture}
        disabled={generating}
        className="inline-flex items-center gap-1.5"
        style={{
          height: 36,
          padding: "0 16px",
          background: "var(--crm-brand)",
          color: "var(--crm-brand-fg)",
          border: 0,
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: generating ? "default" : "pointer",
          opacity: generating ? 0.6 : 1,
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {generating ? "Capturando..." : "Capturar identidade visual com IA agora"}
      </button>
    </div>
  )
}

function SectionTitle({
  title,
  subtitle,
  style,
}: {
  title: string
  subtitle?: string
  style?: React.CSSProperties
}) {
  return (
    <div style={style}>
      <h3
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: "var(--crm-gray-500)",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}

function LogoCard({
  title,
  subtitle,
  preview,
  bg,
  svg,
  png,
  editing,
  uploadingSvg,
  uploadingPng,
  onUploadSvg,
  onUploadPng,
}: {
  title: string
  subtitle: string
  preview: React.ReactNode
  bg: string
  svg: string | null
  png: string | null
  editing?: boolean
  uploadingSvg?: boolean
  uploadingPng?: boolean
  onUploadSvg?: (file: File) => void
  onUploadPng?: (file: File) => void
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          height: 160,
          background: bg,
          backgroundImage: svg ? `url(${svg})` : undefined,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        {svg ? null : preview}
      </div>
      <div
        className="flex items-center justify-between"
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--crm-gray-100)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          {editing && onUploadSvg ? (
            <UploadBtn
              label="SVG"
              accept=".svg,image/svg+xml"
              loading={uploadingSvg}
              onFile={onUploadSvg}
            />
          ) : (
            <DownloadBtn url={svg} label="SVG" />
          )}
          {editing && onUploadPng ? (
            <UploadBtn
              label="PNG"
              accept=".png,image/png"
              loading={uploadingPng}
              onFile={onUploadPng}
            />
          ) : (
            <DownloadBtn url={png} label="PNG" />
          )}
        </div>
      </div>
    </div>
  )
}

function UploadBtn({
  label,
  accept,
  loading,
  onFile,
}: {
  label: string
  accept: string
  loading?: boolean
  onFile: (file: File) => void
}) {
  return (
    <label
      style={{
        height: 26,
        padding: "0 10px",
        background: loading ? "var(--crm-gray-100)" : "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 4,
        color: "var(--crm-gray-700)",
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      <Upload className="h-2.5 w-2.5" />
      {loading ? "..." : label}
      <input
        type="file"
        accept={accept}
        style={{ display: "none" }}
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.currentTarget.value = ""
        }}
      />
    </label>
  )
}

function DownloadBtn({ url, label }: { url: string | null; label: string }) {
  return (
    <a
      href={url ?? "#"}
      download
      onClick={(e) => {
        if (!url) {
          e.preventDefault()
        }
      }}
      style={{
        height: 26,
        padding: "0 10px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 4,
        color: url ? "var(--crm-gray-700)" : "var(--crm-gray-300)",
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        textDecoration: "none",
        cursor: url ? "pointer" : "default",
      }}
    >
      <Download className="h-2.5 w-2.5" />
      {label}
    </a>
  )
}

function ColorGrid({
  colors,
  editing,
  variant,
  onChange,
  defaultRole,
}: {
  colors: BrandColor[]
  editing: boolean
  variant: "large" | "small"
  onChange: (next: BrandColor[]) => void
  defaultRole: string
}) {
  const minWidth = variant === "large" ? 280 : 180
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        marginTop: 16,
      }}
    >
      {colors.map((c, i) =>
        editing ? (
          <ColorSwatchEdit
            key={i}
            color={c}
            small={variant === "small"}
            onChange={(next) =>
              onChange(colors.map((x, idx) => (idx === i ? next : x)))
            }
            onRemove={() => onChange(colors.filter((_, idx) => idx !== i))}
          />
        ) : (
          <ColorSwatch key={i} color={c} small={variant === "small"} />
        ),
      )}
      {editing && (
        <button
          onClick={() =>
            onChange([
              ...colors,
              { hex: "#888888", name: "Nova cor", role: defaultRole },
            ])
          }
          className="cf-focusable"
          style={{
            background: "var(--crm-gray-50)",
            border: "1px dashed var(--crm-border)",
            borderRadius: 10,
            color: "var(--crm-gray-500)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            minHeight: variant === "small" ? 140 : 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Plus className="h-4 w-4" />
          Adicionar cor
        </button>
      )}
    </div>
  )
}

function ColorSwatchEdit({
  color,
  small,
  onChange,
  onRemove,
}: {
  color: BrandColor
  small?: boolean
  onChange: (next: BrandColor) => void
  onRemove: () => void
}) {
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(color.hex)
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <label
        style={{
          display: "block",
          height: small ? 80 : 140,
          background: isValidHex ? color.hex : "var(--crm-gray-100)",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <input
          type="color"
          value={isValidHex ? color.hex : "#888888"}
          onChange={(e) => onChange({ ...color, hex: e.target.value })}
          style={{
            opacity: 0,
            position: "absolute",
            inset: 0,
            cursor: "pointer",
          }}
        />
      </label>
      <button
        onClick={onRemove}
        title="Remover cor"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 22,
          height: 22,
          borderRadius: 6,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          border: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X className="h-3 w-3" />
      </button>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          value={color.name}
          onChange={(e) => onChange({ ...color, name: e.target.value })}
          placeholder="Nome (ex: Vivazz Blue)"
          style={{
            width: "100%",
            padding: "4px 8px",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 4,
          }}
        />
        <input
          value={color.hex}
          onChange={(e) => onChange({ ...color, hex: e.target.value })}
          placeholder="#RRGGBB"
          className="crm-tnum"
          style={{
            width: "100%",
            padding: "4px 8px",
            fontSize: 11,
            color: isValidHex ? "var(--crm-gray-700)" : "var(--crm-danger, #DC2626)",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 4,
            fontFamily: "var(--crm-font-mono, monospace)",
          }}
        />
        <input
          value={color.role}
          onChange={(e) => onChange({ ...color, role: e.target.value })}
          placeholder="Papel (ex: Principal / Fundo)"
          style={{
            width: "100%",
            padding: "4px 8px",
            fontSize: 10.5,
            color: "var(--crm-gray-500)",
            background: "var(--crm-gray-50)",
            border: "1px solid var(--crm-border)",
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  )
}

function ColorSwatch({
  color,
  small,
}: {
  color: BrandColor
  small?: boolean
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: small ? 80 : 140,
          background: color.hex,
        }}
      />
      <div style={{ padding: "10px 14px" }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 2 }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {color.name}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(color.hex)
            }}
            className="crm-tnum"
            style={{
              fontSize: 11,
              color: "var(--crm-gray-500)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              fontFamily: "var(--crm-font-mono, monospace)",
            }}
            title="Copiar hex"
          >
            {color.hex.toUpperCase()}
          </button>
        </div>
        <div style={{ fontSize: 10, color: "var(--crm-gray-500)" }}>
          {color.role}
        </div>
      </div>
    </div>
  )
}

function FontPreviewEdit({
  label,
  family,
  weight,
  onChange,
  big,
}: {
  label: string
  family: string | null
  weight: string | null
  onChange: (family: string | null, weight: string | null) => void
  big?: boolean
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div className="flex items-center gap-3">
        <div
          style={{
            fontSize: big ? 56 : 36,
            fontWeight: big ? 900 : 400,
            color: "var(--crm-gray-900)",
            fontFamily: family ? `'${family}', sans-serif` : "sans-serif",
            lineHeight: 1,
            minWidth: big ? 90 : 60,
          }}
        >
          Aa
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <input
            value={family ?? ""}
            onChange={(e) => onChange(e.target.value || null, weight)}
            placeholder="Nome da fonte (ex: Inter)"
            style={{
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              background: "var(--crm-gray-50)",
              border: "1px solid var(--crm-border)",
              borderRadius: 4,
            }}
          />
          <input
            value={weight ?? ""}
            onChange={(e) => onChange(family, e.target.value || null)}
            placeholder={
              big ? "Peso (ex: Black 900)" : "Peso (ex: Regular 400 / Medium 500)"
            }
            style={{
              padding: "6px 10px",
              fontSize: 11.5,
              color: "var(--crm-gray-500)",
              background: "var(--crm-gray-50)",
              border: "1px solid var(--crm-border)",
              borderRadius: 4,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function FontPreview({
  label,
  family,
  weight,
  sample,
  big,
}: {
  label: string
  family: string
  weight?: string | null
  sample: string
  big?: boolean
}) {
  const googleFontsUrl = `https://fonts.google.com/specimen/${encodeURIComponent(
    family.replace(/\s+/g, "+"),
  )}`
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div
          style={{
            fontSize: big ? 56 : 36,
            fontWeight: big ? 900 : 400,
            color: "var(--crm-gray-900)",
            fontFamily: `'${family}', sans-serif`,
            lineHeight: 1,
          }}
        >
          {sample}
        </div>
        <div className="text-right" style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {family}
          </div>
          {weight && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--crm-gray-500)",
                marginTop: 2,
              }}
            >
              {weight}
            </div>
          )}
        </div>
      </div>
      <a
        href={googleFontsUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5"
        style={{
          alignSelf: "flex-start",
          height: 26,
          padding: "0 10px",
          background: "var(--crm-gray-50, #FCFCFD)",
          border: "1px solid var(--crm-border)",
          borderRadius: 4,
          color: "var(--crm-gray-700)",
          fontSize: 11,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <ExternalLink className="h-2.5 w-2.5" />
        Ver Google Fonts
      </a>
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days}d`
  return new Date(iso).toLocaleDateString("pt-BR")
}
