"use client"

/**
 * Varredura "Imagem embutida" da biblioteca — prévia + aplicar.
 *
 * Fala com `/api/admin/components/extract-base64`: o GET diz, item a item,
 * quanto peso sai (nada gravado); o POST sobe os arquivos e troca os
 * `data:` por URL pública.
 *
 * A lista cobre DOIS lados de propósito. A montagem copia o html da
 * variante para `store_email_references`, então limpar só a biblioteca
 * deixaria as referências já montadas carregando o base64 para sempre —
 * e são elas que os e-mails de hoje usam.
 */

import { useCallback, useEffect, useState } from "react"
import { ImageOff, Loader2, X } from "lucide-react"

import { toast } from "@/lib/hooks/use-toast"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import { EGBadge, EGBtn, EGNotice } from "@/components/email-generation/ui/eg-atoms"

interface Item {
  tabela: "email_component_variants" | "store_email_references"
  id: string
  rotulo: string
  html_chars: number
  total: number
  extraiveis: number
  bytesExtraiveis: number
  charsEconomizados: number
  ok: boolean
}

interface Summary {
  varridos: number
  com_base64: number
  arquivos_a_extrair: number
  bytes: number
  chars_economizados: number
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

export function Base64ExtractDialog({
  open,
  onClose,
  onApplied,
}: {
  open: boolean
  onClose: () => void
  onApplied?: () => void | Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch("/api/admin/components/extract-base64")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar a prévia")
      setItems(json.data?.items ?? [])
      setSummary(json.data?.summary ?? null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void carregar()
  }, [open, carregar])

  const aplicar = async () => {
    setApplying(true)
    try {
      const res = await fetch("/api/admin/components/extract-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escopo: "ambos" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Falha ao aplicar")
      const r = json.data?.resumo
      const falhas = json.data?.falhas ?? []
      toast({
        title: `${r?.itens ?? 0} itens limpos · ${kb(r?.chars_economizados ?? 0)} fora do HTML`,
        description:
          falhas.length > 0
            ? `${falhas.length} imagem(ns) não subiram e ficaram embutidas: ${falhas[0]?.erro ?? ""}`
            : `${r?.arquivos ?? 0} arquivo(s) no Storage`,
        variant: falhas.length > 0 ? "destructive" : undefined,
      })
      await carregar()
      await onApplied?.()
    } catch (e) {
      toast({
        title: "Falha ao extrair",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setApplying(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white,
          border: `1px solid ${C.g200}`,
          borderRadius: 6,
          width: "min(860px, 100%)",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: `1px solid ${C.g200}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ImageOff size={16} color={C.g500} />
            <strong style={{ fontFamily: F.sans, fontSize: 14 }}>
              Imagem embutida na biblioteca
            </strong>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer" }}
            aria-label="Fechar"
          >
            <X size={16} color={C.g500} />
          </button>
        </div>

        <div style={{ padding: "12px 16px", overflowY: "auto", flex: 1 }}>
          <p
            style={{
              fontFamily: F.sans,
              fontSize: 12.5,
              color: C.g500,
              margin: "0 0 12px",
              lineHeight: 1.55,
            }}
          >
            Imagem em <code>data:base64</code> dentro do HTML não aparece no
            Outlook (nenhum tamanho) e empurra a mensagem para o corte de
            ~102 KB do Gmail, que esconde tudo depois dele — inclusive o
            rodapé com o descadastro. Aqui os arquivos vão para o Storage e o
            HTML fica com a URL.
          </p>

          {erro && <EGNotice tone="neg">{erro}</EGNotice>}

          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: C.g500,
                fontFamily: F.sans,
                fontSize: 13,
                padding: 20,
              }}
            >
              <Loader2 size={14} className="animate-spin" /> Varrendo a
              biblioteca…
            </div>
          ) : items.length === 0 ? (
            <EGNotice tone="pos">
              Nenhuma imagem embutida acima do piso — biblioteca e referências
              limpas.
            </EGNotice>
          ) : (
            <>
              {summary && (
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    flexWrap: "wrap",
                    marginBottom: 12,
                    fontFamily: F.sans,
                    fontSize: 12.5,
                    color: C.g700,
                  }}
                >
                  <span>
                    <strong>{summary.com_base64}</strong> de {summary.varridos}{" "}
                    itens
                  </span>
                  <span>
                    <strong>{summary.arquivos_a_extrair}</strong> arquivo(s) ·{" "}
                    {kb(summary.bytes)}
                  </span>
                  <span>
                    HTML perde <strong>{kb(summary.chars_economizados)}</strong>
                  </span>
                </div>
              )}

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: F.sans,
                  fontSize: 12.5,
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left", color: C.g500 }}>
                    <th style={{ padding: "6px 8px" }}>Item</th>
                    <th style={{ padding: "6px 8px" }}>Onde</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>
                      Imagens
                    </th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>
                      HTML perde
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr
                      key={`${i.tabela}:${i.id}`}
                      style={{ borderTop: `1px solid ${C.g200}` }}
                    >
                      <td style={{ padding: "6px 8px" }}>{i.rotulo}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <EGBadge
                          tone={
                            i.tabela === "email_component_variants"
                              ? "neut"
                              : "warn"
                          }
                        >
                          {i.tabela === "email_component_variants"
                            ? "biblioteca"
                            : "referência montada"}
                        </EGBadge>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        {i.extraiveis}
                        {i.total > i.extraiveis && (
                          <span style={{ color: C.g500 }}>
                            {" "}
                            (+{i.total - i.extraiveis} miúdas ficam)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        {kb(i.charsEconomizados)}
                        <span style={{ color: C.g500 }}>
                          {" "}
                          de {kb(i.html_chars)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${C.g200}`,
          }}
        >
          <EGBtn onClick={onClose}>Fechar</EGBtn>
          <EGBtn
            onClick={() => void aplicar()}
            disabled={applying || loading || items.length === 0}
            variant="dark"
          >
            {applying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Extraindo…
              </>
            ) : (
              <>Extrair para o Storage</>
            )}
          </EGBtn>
        </div>
      </div>
    </div>
  )
}
