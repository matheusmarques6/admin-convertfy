"use client"

/**
 * O campo de imagem ou vídeo de uma tela.
 *
 * A coluna, o tipo e o renderizador existiam desde a mídia por tela — e
 * não havia nenhuma forma de preencher. Capacidade sem porta de entrada
 * é indistinguível de capacidade que não existe: o print de prova da
 * tela de matemática ficava impossível de pôr, e nada dizia por quê.
 *
 * Dois caminhos, porque os dois casos são reais: **subir** o arquivo (o
 * print que está no computador) e **colar** o endereço (a imagem que já
 * está publicada em algum lugar nosso). O que NÃO entra é endereço que
 * exige sessão ou que expira — `lib/forms/midia` os recusa, e aqui o
 * motivo aparece na hora, em vez de o campo ficar vazio em silêncio.
 */

import { useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
import { normalizarMidia, urlDeMidiaUtil, type MidiaDaTela } from "@/lib/forms/midia"

export function MediaField({
  formId,
  valor,
  onChange,
  rotulo = "Imagem ou vídeo da tela",
  ajuda,
  somenteImagem,
}: {
  /** Necessário para subir arquivo; ausente, só a colagem funciona. */
  formId?: string
  valor: MidiaDaTela | null
  onChange: (m: MidiaDaTela | null) => void
  rotulo?: string
  ajuda?: string
  /** Logo: vídeo não serve, e o seletor de arquivo nem o oferece. */
  somenteImagem?: boolean
}) {
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)
  /**
   * A mídia GRAVADA também passa pela régua.
   *
   * A colagem é validada na entrada, mas o valor que vem do banco não —
   * ele pode ter sido gravado antes da régua existir, ou por SQL. Sem
   * este aviso o editor desenha a miniatura numa tela que o visitante
   * vai receber vazia: o pior caso, porque quem edita fica convencido
   * de que está lá.
   */
  const servePublico = !valor || urlDeMidiaUtil(valor.url)

  async function subir(file: File) {
    if (!formId) {
      setErro("Salve o formulário uma vez antes de subir arquivo.")
      return
    }
    setSubindo(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch(`/api/crm/forms/${formId}/media`, { method: "POST", body: fd })
      const json = await r.json().catch(() => null)
      if (!r.ok) {
        // A mensagem do servidor é a útil ("Arquivo maior que 25 MB",
        // "Use PNG, JPG…"); "falha no upload" mandaria tentar de novo o
        // que vai falhar de novo.
        throw new Error(
          (typeof json?.error === "string" ? json.error : null) ??
            json?.error?.message ??
            `Falha ao subir (HTTP ${r.status}).`,
        )
      }
      const dados = json?.data ?? json
      const m = normalizarMidia({ url: dados?.url, tipo: dados?.tipo, alt: valor?.alt ?? null })
      if (!m) throw new Error("O servidor devolveu um endereço que não dá para exibir.")
      onChange(m)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao subir o arquivo.")
    } finally {
      setSubindo(false)
    }
  }

  function colar(url: string) {
    const limpo = url.trim()
    if (!limpo) {
      onChange(null)
      setErro(null)
      return
    }
    if (!urlDeMidiaUtil(limpo)) {
      setErro(
        "Esse endereço não serve numa página pública: ele exige login ou expira. " +
          "Suba o arquivo aqui ou use um link que abra numa aba anônima.",
      )
      return
    }
    const m = normalizarMidia({ url: limpo, alt: valor?.alt ?? null })
    if (somenteImagem && m?.tipo === "video") {
      setErro("Aqui só entra imagem.")
      return
    }
    setErro(null)
    onChange(m)
  }

  return (
    <div className="space-y-1.5">
      {rotulo && (
        <label className="block text-[11px] font-medium text-slate-500 dark:text-white/50">
          {rotulo}
        </label>
      )}

      {valor ? (
        <div className="space-y-1.5 rounded-[6px] border border-black/[0.10] p-2 dark:border-white/[0.14]">
          <div className="flex items-start gap-2">
            {valor.tipo === "video" ? (
              <video
                src={valor.url}
                muted
                playsInline
                className="h-16 w-24 shrink-0 rounded-[4px] bg-black object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={valor.url}
                alt=""
                className="h-16 w-24 shrink-0 rounded-[4px] bg-slate-100 object-contain dark:bg-white/[0.06]"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-slate-500 dark:text-white/45" title={valor.url}>
                {valor.url}
              </p>
              <input
                type="text"
                value={valor.alt ?? ""}
                onChange={(e) => onChange({ ...valor, alt: e.target.value || null })}
                placeholder="Descrição para leitor de tela (deixe vazio se for decorativa)"
                className="mt-1 w-full rounded-[4px] border border-black/[0.10] bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus-visible:border-blue-500 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-white"
              />
              {valor.tipo === "video" && (
                <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/45">
                  <input
                    type="checkbox"
                    checked={Boolean(valor.autoplay)}
                    onChange={(e) => onChange({ ...valor, autoplay: e.target.checked })}
                  />
                  Começa sozinho, sem som
                </label>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remover mídia"
              className="shrink-0 p-0.5 text-slate-400 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            disabled={subindo}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-black/[0.10] px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/[0.14] dark:text-white/80 dark:hover:bg-white/[0.06]"
          >
            {subindo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {subindo ? "Subindo…" : "Subir arquivo"}
          </button>
          <input
            ref={inputArquivo}
            type="file"
            accept={
              somenteImagem
                ? "image/png,image/jpeg,image/webp,image/gif"
                : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            }
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void subir(f)
              e.target.value = ""
            }}
          />
          <span className="text-[11px] text-slate-400 dark:text-white/35">ou</span>
          <input
            type="url"
            placeholder="colar o endereço"
            onBlur={(e) => colar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                colar((e.target as HTMLInputElement).value)
              }
            }}
            className="min-w-0 flex-1 rounded-[5px] border border-black/[0.10] bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus-visible:border-blue-500 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-white"
          />
        </div>
      )}

      {!servePublico && (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          Quem responde o formulário não vai ver esta imagem: o endereço exige login, expira ou
          não é absoluto. Suba o arquivo aqui.
        </p>
      )}
      {erro && <p className="text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
      {!erro && ajuda && !valor && (
        <p className="flex items-start gap-1 text-[11px] text-slate-400 dark:text-white/35">
          <ImagePlus className="mt-0.5 h-3 w-3 shrink-0" />
          {ajuda}
        </p>
      )}
    </div>
  )
}
