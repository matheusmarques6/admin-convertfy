"use client"

import { useState } from "react"
import {
  Award,
  CreditCard,
  Download,
  ExternalLink,
  Gift,
  Heart,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Truck,
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
          >
            <Download className="h-3 w-3" />
            {downloadingZip ? "Preparando..." : "Baixar tudo"}
          </button>
          <button
            onClick={handleAiCapture}
            disabled={generating}
            className="cf-focusable inline-flex items-center gap-1.5"
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: generating ? "default" : "pointer",
              opacity: generating ? 0.6 : 1,
            }}
          >
            <Sparkles className="h-3 w-3" />
            {generating ? "Capturando..." : brand ? "Recapturar com IA" : "Capturar com IA"}
          </button>
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
        {slogan && (
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
        <div
          className="grid"
          style={{
            marginTop: 16,
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <StoreField label="Segmento" value={niche} />
          <StoreField label="Plataforma" value={platform} />
          <StoreField
            label="URL"
            value={storeUrl}
            href={storeUrl ? normalizeUrl(storeUrl) : null}
          />
          <StoreField label="Posicionamento" value={posicionamento} />
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
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                marginTop: 16,
              }}
            >
              {(brand.colors_primary ?? []).map((c, i) => (
                <ColorSwatch key={i} color={c} />
              ))}
            </div>

            {/* Cores secundárias */}
            {brand.colors_secondary && brand.colors_secondary.length > 0 && (
              <>
                <SectionTitle title="Cores secundárias" style={{ marginTop: 32 }} />
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    marginTop: 16,
                  }}
                >
                  {brand.colors_secondary.map((c, i) => (
                    <ColorSwatch key={i} color={c} small />
                  ))}
                </div>
              </>
            )}

            {/* Tipografia */}
            {(brand.font_heading || brand.font_body) && (
              <>
                <SectionTitle title="Tipografia" style={{ marginTop: 40 }} />
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
                  {brand.font_heading && (
                    <FontPreview
                      label="Display · headlines"
                      family={brand.font_heading}
                      weight={brand.font_heading_weight}
                      sample="Aa"
                      big
                    />
                  )}
                  {brand.font_body && (
                    <FontPreview
                      label="Corpo · body"
                      family={brand.font_body}
                      weight={brand.font_body_weight}
                      sample="Aa"
                    />
                  )}
                </div>
              </>
            )}

            {/* Tom de voz */}
            {brand.voice && brand.voice.length > 0 && (
              <>
                <SectionTitle
                  title="Tom de voz"
                  subtitle="Atributos que orientam a copy"
                  style={{ marginTop: 40 }}
                />
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
            {brand.trust_icons && brand.trust_icons.length > 0 && (
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
                  {brand.trust_icons.map((ic, i) => (
                    <TrustIconCard key={i} icon={ic} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
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

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return "#"
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
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
}: {
  title: string
  subtitle: string
  preview: React.ReactNode
  bg: string
  svg: string | null
  png: string | null
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
        }}
      >
        {preview}
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
          <DownloadBtn url={svg} label="SVG" />
          <DownloadBtn url={png} label="PNG" />
        </div>
      </div>
    </div>
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
