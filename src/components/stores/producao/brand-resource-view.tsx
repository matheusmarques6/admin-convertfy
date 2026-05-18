"use client"

import { useState } from "react"
import { Download, Heart, Sparkles } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type { StoreBrandIdentity, BrandColor } from "@/types/email-workspace"

interface BrandResourceViewProps {
  storeId: string
  storeName: string
  brand: StoreBrandIdentity | null
  onChanged: () => void
}

export function BrandResourceView({
  storeId,
  storeName,
  brand,
  onChanged,
}: BrandResourceViewProps) {
  const wordmark = storeName.toUpperCase()
  const monogramLetter = storeName.charAt(0).toUpperCase() || "?"
  const toast = useToast()
  const [generating, setGenerating] = useState(false)

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
            onClick={() => {
              // Download all assets — simplificado: abre cada SVG em nova aba
              const urls = [
                brand?.logo_main_svg,
                brand?.logo_alt_svg,
                brand?.logo_monogram_svg,
                brand?.logo_reverse_svg,
              ].filter(Boolean) as string[]
              urls.forEach((u) => window.open(u, "_blank"))
            }}
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
              cursor: "pointer",
            }}
            disabled={!brand}
          >
            <Download className="h-3 w-3" />
            Baixar tudo
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

      {/* Hero */}
      {brand && (
        <div
          style={{
            padding: "32px 48px 40px",
            background:
              "linear-gradient(135deg, var(--crm-blue-50) 0%, var(--crm-gray-0) 100%)",
            borderBottom: "1px solid var(--crm-border)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 56,
              fontWeight: 900,
              color: "var(--crm-gray-900)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            {/* Nome da loja em destaque, simulando logo principal */}
            {brand.logo_main_svg ? null : wordmark}
          </h1>
          {brand.voice && brand.voice.length > 0 && (
            <p
              style={{
                marginTop: 12,
                fontSize: 14,
                color: "var(--crm-gray-600)",
              }}
            >
              {brand.voice.join(" · ")}
            </p>
          )}
        </div>
      )}

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
                      label="Heading"
                      family={brand.font_heading}
                      sample="The quick brown fox"
                      big
                    />
                  )}
                  {brand.font_body && (
                    <FontPreview
                      label="Body"
                      family={brand.font_body}
                      sample="The quick brown fox jumps over the lazy dog."
                    />
                  )}
                </div>
              </>
            )}

            {/* Tom de voz */}
            {brand.voice && brand.voice.length > 0 && (
              <>
                <SectionTitle title="Tom de voz" style={{ marginTop: 40 }} />
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
          </>
        )}
      </div>
    </div>
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
  sample,
  big,
}: {
  label: string
  family: string
  sample: string
  big?: boolean
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        padding: "16px 20px",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--crm-gray-500)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--crm-gray-700)",
            fontWeight: 500,
          }}
        >
          {family}
        </span>
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: big ? 36 : 18,
          fontWeight: big ? 700 : 400,
          color: "var(--crm-gray-900)",
          fontFamily: `'${family}', sans-serif`,
          lineHeight: 1.2,
        }}
      >
        {sample}
      </div>
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
