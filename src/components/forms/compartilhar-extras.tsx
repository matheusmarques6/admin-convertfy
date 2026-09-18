"use client"

/**
 * O que o handoff §8 acrescenta à aba Compartilhar: link com UTMs, QR
 * code e as duas formas de embed que o script não tinha (pop-up e painel
 * lateral). O inline com rastreamento continua no `InstallTab`.
 *
 * O QR é gerado no NAVEGADOR (`qrcode`, sem rede): mandar a URL do
 * formulário para um serviço externo de QR seria vazar o endereço da
 * campanha para um terceiro por conveniência.
 */

import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { Check, Copy, Download } from "lucide-react"

export function CompartilharExtras({ publicUrl, slug }: { publicUrl: string; slug: string }) {
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" })
  const [copiado, setCopiado] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [embed, setEmbed] = useState<"inline" | "popup" | "slider">("inline")

  const linkComUtm = useMemo(() => {
    try {
      const u = new URL(publicUrl)
      if (utm.source.trim()) u.searchParams.set("utm_source", utm.source.trim())
      if (utm.medium.trim()) u.searchParams.set("utm_medium", utm.medium.trim())
      if (utm.campaign.trim()) u.searchParams.set("utm_campaign", utm.campaign.trim())
      return u.toString()
    } catch {
      return publicUrl
    }
  }, [publicUrl, utm])

  useEffect(() => {
    let vivo = true
    QRCode.toDataURL(linkComUtm, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then((d) => {
        if (vivo) setQr(d)
      })
      .catch(() => {
        if (vivo) setQr(null)
      })
    return () => {
      vivo = false
    }
  }, [linkComUtm])

  const copiar = (chave: string, texto: string) => {
    void navigator.clipboard.writeText(texto)
    setCopiado(chave)
    window.setTimeout(() => setCopiado((c) => (c === chave ? null : c)), 1600)
  }

  let origem = ""
  try {
    origem = new URL(publicUrl).origin
  } catch {
    origem = ""
  }
  const script = `<script src="${origem}/api/script/form-embed.js" defer></script>`
  const snippets: Record<typeof embed, { titulo: string; apoio: string; codigo: string }> = {
    inline: {
      titulo: "Na página",
      apoio: "O formulário aparece onde a div estiver, com a altura do conteúdo.",
      codigo: `<div data-convertfy-form="${publicUrl}" data-convertfy-height="700"></div>\n${script}`,
    },
    popup: {
      titulo: "Pop-up",
      apoio: "Qualquer botão com o atributo abre o formulário num modal. Esc ou ✕ fecham.",
      codigo: `<button data-convertfy-popup="${publicUrl}">Quero um diagnóstico</button>\n${script}`,
    },
    slider: {
      titulo: "Painel lateral",
      apoio: "Uma aba fixa na lateral abre um painel com o formulário. Só carrega no clique.",
      codigo: `<script src="${origem}/api/script/form-embed.js" data-convertfy-slider="${publicUrl}" data-convertfy-side="right" data-convertfy-label="Fale com a gente" defer></script>`,
    },
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-5">
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900 dark:text-white/90">
            Link com origem (UTM)
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/45">
            Cada lead chega ao CRM sabendo de onde veio. Deixe vazio o que não usa.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                { k: "source", rotulo: "utm_source", ph: "instagram" },
                { k: "medium", rotulo: "utm_medium", ph: "bio" },
                { k: "campaign", rotulo: "utm_campaign", ph: "setembro" },
              ] as const
            ).map((c) => (
              <label key={c.k} className="block">
                <span className="block font-mono text-[10.5px] text-slate-500 dark:text-white/45">{c.rotulo}</span>
                <input
                  type="text"
                  value={utm[c.k]}
                  onChange={(e) => setUtm((u) => ({ ...u, [c.k]: e.target.value }))}
                  placeholder={c.ph}
                  className="crm-input mt-1 w-full text-[11.5px]"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <code className="block min-w-0 flex-1 truncate rounded-[6px] bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-800 dark:bg-white/[0.04] dark:text-white/85">
              {linkComUtm}
            </code>
            <BotaoCopiar ativo={copiado === "utm"} onClick={() => copiar("utm", linkComUtm)} />
          </div>
        </section>

        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900 dark:text-white/90">
            Embedar no site
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(snippets) as Array<typeof embed>).map((k) => {
              const ativo = embed === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEmbed(k)}
                  aria-pressed={ativo}
                  className={
                    "rounded-[8px] border p-2 text-left transition-colors " +
                    (ativo
                      ? "border-[#4E62D8] bg-[#4E62D8]/[0.05]"
                      : "border-black/[0.08] hover:bg-slate-50 dark:border-white/[0.10] dark:hover:bg-white/[0.04]")
                  }
                >
                  <Miniatura tipo={k} />
                  <span className="mt-1.5 block text-[11.5px] font-medium text-slate-800 dark:text-white/85">
                    {snippets[k].titulo}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-white/45">{snippets[embed].apoio}</p>
          <div className="relative mt-1.5">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[8px] bg-[#0F1117] px-3 py-2.5 pr-12 font-mono text-[11px] leading-relaxed text-white/85">
              {snippets[embed].codigo}
            </pre>
            <div className="absolute right-2 top-2">
              <BotaoCopiar escuro ativo={copiado === embed} onClick={() => copiar(embed, snippets[embed].codigo)} />
            </div>
          </div>
        </section>
      </div>

      <aside>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900 dark:text-white/90">
          QR code
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/45">
          Já com a origem acima. Para material impresso, evento ou balcão.
        </p>
        <div className="mt-2 flex flex-col items-center gap-2 rounded-[10px] border border-black/[0.08] bg-white p-3 dark:border-white/[0.10]">
          {qr ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qr} alt={`QR code de ${publicUrl}`} width={200} height={200} className="h-[200px] w-[200px]" />
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center text-[11px] text-slate-400">
              Gerando…
            </div>
          )}
          <a
            href={qr ?? "#"}
            download={`qr-${slug}.png`}
            aria-disabled={!qr}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-black/[0.10] px-2.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar PNG
          </a>
        </div>
      </aside>
    </div>
  )
}

function BotaoCopiar({ ativo, onClick, escuro }: { ativo: boolean; onClick: () => void; escuro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copiar"
      className={
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-[6px] border px-2 text-[11px] font-medium transition-colors " +
        (escuro
          ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
          : "border-black/[0.10] text-slate-700 hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]")
      }
    >
      {ativo ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {ativo ? "Copiado" : "Copiar"}
    </button>
  )
}

/** A miniatura de cada modo de embed — a página é o retângulo, o formulário o bloco azul. */
function Miniatura({ tipo }: { tipo: "inline" | "popup" | "slider" }) {
  return (
    <span className="relative block h-12 w-full overflow-hidden rounded-[5px] border border-black/[0.08] bg-slate-100 dark:border-white/[0.10] dark:bg-white/[0.06]">
      <span className="absolute left-1.5 top-1.5 h-1 w-1/2 rounded bg-slate-300 dark:bg-white/20" />
      {tipo === "inline" && <span className="absolute inset-x-1.5 bottom-1.5 top-4 rounded-[3px] bg-[#4E62D8]/80" />}
      {tipo === "popup" && (
        <>
          <span className="absolute inset-0 bg-black/30" />
          <span className="absolute left-1/2 top-1/2 h-7 w-9 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[#4E62D8]" />
        </>
      )}
      {tipo === "slider" && <span className="absolute bottom-0 right-0 top-0 w-2/5 bg-[#4E62D8]" />}
    </span>
  )
}
