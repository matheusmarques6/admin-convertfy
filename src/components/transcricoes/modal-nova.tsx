"use client"

/**
 * Modal "Nova transcrição": cole um link ou envie um arquivo.
 *
 * Os links passam por uma PRÉVIA antes de entrar na fila — título, canal,
 * duração e o aviso de duplicado. Duplicado não é enfileirado: o usuário vê
 * o link para a transcrição que já existe.
 *
 * O arquivo (até 4 GB) sobe DIRETO para o Storage pelo protocolo resumível
 * (TUS), sem passar pela API. O progresso é o do próprio upload; não há
 * estimativa em lugar nenhum.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"
import { createClient } from "@/lib/supabase/client"
import { extrairLinks, linksNaoSuportados } from "@/lib/transcricoes/url"
import { fmtDuracao } from "@/lib/transcricoes/pipeline"
import type { PreviaLink } from "@/lib/transcricoes/types"
import {
  concluirUpload,
  enfileirarLinks,
  getPrevia,
  prepararUpload,
  TranscricoesApiError,
} from "@/lib/transcricoes/data"
import { IconePlataforma, TrAviso, TrBtn, TrDivisor, TrLabel, inputCls, selectCls, textareaCls, TNUM } from "./ui"

const IDIOMAS: Array<[string, string]> = [
  ["pt-BR", "Português (Brasil)"],
  ["en", "Inglês"],
  ["es", "Espanhol"],
]

const ACEITOS = ".mp4,.mov,.mkv,.webm,.mp3,.m4a,.wav,.flac,.ogg"

interface Props {
  colecoes: Array<{ id: string; nome: string; paiId: string | null; reservada: "inbox" | null }>
  colecaoPadrao: string | null
  onFechar: () => void
  onConcluir: () => void
}

export function ModalNova({ colecoes, colecaoPadrao, onFechar, onConcluir }: Props) {
  const [texto, setTexto] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [colecaoId, setColecaoId] = useState<string>(colecaoPadrao ?? "")
  const [idioma, setIdioma] = useState("pt-BR")
  const [tagsTexto, setTagsTexto] = useState("")
  const [previas, setPrevias] = useState<PreviaLink[] | null>(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [duracaoDisponivel, setDuracaoDisponivel] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [progressoUpload, setProgressoUpload] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sobreDrop, setSobreDrop] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)
  const timerPrevia = useRef<ReturnType<typeof setTimeout> | null>(null)

  const links = extrairLinks(texto)
  const naoSuportados = linksNaoSuportados(texto)
  const tags = tagsTexto.split(",").map((t) => t.trim()).filter(Boolean)
  const podeEnviar = (links.length > 0 || arquivo !== null) && !enviando

  // Prévia com debounce: colar 10 links não pode disparar 10 rodadas
  // enquanto o texto ainda está sendo digitado.
  useEffect(() => {
    if (timerPrevia.current) clearTimeout(timerPrevia.current)
    if (!links.length) {
      setPrevias(null)
      return
    }
    const alvo = links.join("\n")
    timerPrevia.current = setTimeout(() => {
      setCarregandoPrevia(true)
      getPrevia(alvo.split("\n"))
        .then((r) => {
          setPrevias(r.itens)
          setDuracaoDisponivel(r.duracaoDisponivel)
        })
        .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível ler os links."))
        .finally(() => setCarregandoPrevia(false))
    }, 600)
    return () => {
      if (timerPrevia.current) clearTimeout(timerPrevia.current)
    }
    // `links` é derivado de `texto`; depender do texto evita re-render em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) onFechar()
    }
    window.addEventListener("keydown", onTecla)
    return () => window.removeEventListener("keydown", onTecla)
  }, [onFechar, enviando])

  const enviarArquivo = useCallback(
    async (file: File) => {
      const destino = await prepararUpload({
        nomeArquivo: file.name,
        tamanhoBytes: file.size,
        tipo: file.type,
        colecaoId: colecaoId || null,
        idioma,
        tags,
      })

      const sb = createClient()
      const { data } = await sb.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("Sessão expirada. Entre de novo e tente outra vez.")

      // Import dinâmico: o cliente TUS só é baixado por quem realmente envia
      // arquivo — quem só cola link não paga o peso.
      const { Upload: TusUpload } = await import("tus-js-client")

      await new Promise<void>((resolve, reject) => {
        const upload = new TusUpload(file, {
          endpoint: destino.enderecoTus,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: destino.bucket,
            objectName: destino.caminho,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          // 6 MB é o pedaço que o Storage do Supabase aceita no resumível.
          chunkSize: 6 * 1024 * 1024,
          onError: reject,
          onProgress: (enviado, total) => setProgressoUpload(Math.round((enviado / total) * 100)),
          onSuccess: () => resolve(),
        })
        // Retoma um envio interrompido do MESMO arquivo em vez de recomeçar.
        upload.findPreviousUploads().then((anteriores) => {
          if (anteriores.length) upload.resumeFromPreviousUpload(anteriores[0])
          upload.start()
        })
      })

      await concluirUpload(destino.id)
    },
    [colecaoId, idioma, tags],
  )

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    try {
      if (arquivo) {
        setProgressoUpload(0)
        await enviarArquivo(arquivo)
      }
      const paraEnfileirar = (previas ?? [])
        .filter((p) => p.ok && !p.duplicadaDe)
        .map((p) => p.url)
      const restantes = paraEnfileirar.length ? paraEnfileirar : links
      if (restantes.length) {
        await enfileirarLinks({ urls: restantes, colecaoId: colecaoId || null, idioma, tags })
      }
      onConcluir()
    } catch (e) {
      setErro(
        e instanceof TranscricoesApiError || e instanceof Error
          ? e.message
          : "Não foi possível enviar. Tente de novo.",
      )
    } finally {
      setEnviando(false)
      setProgressoUpload(null)
    }
  }

  const duplicados = (previas ?? []).filter((p) => p.duplicadaDe).length
  const prontos = (previas ?? []).filter((p) => p.ok && !p.duplicadaDe).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[8vh] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Nova transcrição"
      onClick={(e) => {
        if (e.target === e.currentTarget && !enviando) onFechar()
      }}
    >
      <div className="w-full max-w-[560px] rounded-xl border border-[var(--ops-border)] bg-[var(--ops-card)] shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--ops-title)]">Nova transcrição</h2>
            <p className="mt-0.5 text-[12px] text-[var(--ops-sec)]">
              Cole um link ou envie um arquivo. Vários links, um por linha.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded p-1 text-[var(--ops-mut)] transition-colors hover:text-[var(--ops-title)] disabled:opacity-40"
          >
            <Icon icon={X} customSize={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 pb-4">
          <div>
            <TrLabel className="mb-1.5">Link do vídeo</TrLabel>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              disabled={enviando}
              placeholder={"https://youtube.com/watch?v=...\nhttps://instagram.com/reel/..."}
              aria-label="Links dos vídeos, um por linha"
              className={cn(textareaCls, "resize-y")}
            />
          </div>

          {naoSuportados.length > 0 && (
            <TrAviso>
              {naoSuportados.length === 1 ? "Este link não é suportado" : "Estes links não são suportados"}: só YouTube,
              Instagram e TikTok. Para os outros, baixe o arquivo e envie aqui.
            </TrAviso>
          )}

          {(carregandoPrevia || previas) && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--ops-border)] p-2">
              {carregandoPrevia && (
                <div className="flex items-center gap-2 px-1 py-1.5 text-[11.5px] text-[var(--ops-sec)]">
                  <Icon icon={Loader2} customSize={12} className="animate-spin" />
                  Lendo os links…
                </div>
              )}
              {(previas ?? []).map((p) => (
                <LinhaPrevia key={p.url} p={p} duracaoDisponivel={duracaoDisponivel} />
              ))}
              {previas && previas.length > 1 && (
                <div className="px-1 pt-1 text-[11px] text-[var(--ops-mut)]" style={TNUM}>
                  {prontos} {prontos === 1 ? "link pronto" : "links prontos"}
                  {duplicados > 0 && ` · ${duplicados} já ${duplicados === 1 ? "existe" : "existem"}`}
                </div>
              )}
            </div>
          )}

          <TrDivisor>ou</TrDivisor>

          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setSobreDrop(true)
            }}
            onDragLeave={() => setSobreDrop(false)}
            onDrop={(e) => {
              e.preventDefault()
              setSobreDrop(false)
              const f = e.dataTransfer.files?.[0]
              if (f) setArquivo(f)
            }}
            disabled={enviando}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 transition-colors disabled:opacity-60",
              sobreDrop ? "border-[var(--ops-accent)] bg-[var(--ops-hover)]" : "border-[var(--ops-border)] hover:bg-[var(--ops-hover)]",
            )}
          >
            {arquivo ? (
              <>
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ops-title)]">
                  <Icon icon={CheckCircle2} customSize={13} className="text-[var(--ops-pos)]" />
                  {arquivo.name}
                </span>
                <span className="text-[11px] text-[var(--ops-mut)]" style={TNUM}>
                  {(arquivo.size / 1024 / 1024).toFixed(1)} MB · clique para trocar
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ops-title)]">
                  <Icon icon={Upload} customSize={13} />
                  Arraste o vídeo ou áudio aqui
                </span>
                <span className="text-[11px] text-[var(--ops-mut)]">
                  MP4, MOV, MKV, WEBM, MP3, M4A, WAV ou FLAC até 4 GB · ou clique para escolher
                </span>
              </>
            )}
          </button>
          <input
            ref={inputArquivo}
            type="file"
            accept={ACEITOS}
            hidden
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />

          {progressoUpload != null && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-[var(--ops-sec)]" style={TNUM}>
                <span>Enviando o arquivo</span>
                <span>{progressoUpload}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ops-track)]">
                <span
                  className="block h-full bg-[var(--ops-accent)] transition-[width] duration-300"
                  style={{ width: `${progressoUpload}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <TrLabel className="mb-1.5">Coleção de destino</TrLabel>
              <select
                value={colecaoId}
                onChange={(e) => setColecaoId(e.target.value)}
                disabled={enviando}
                aria-label="Coleção de destino"
                className={selectCls}
              >
                <option value="">Não organizadas</option>
                {colecoes
                  .filter((c) => !c.reservada)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.paiId ? "— " : ""}
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <TrLabel className="mb-1.5">Idioma</TrLabel>
              <select
                value={idioma}
                onChange={(e) => setIdioma(e.target.value)}
                disabled={enviando}
                aria-label="Idioma do áudio"
                className={selectCls}
              >
                {IDIOMAS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <TrLabel className="mb-1.5">Tags</TrLabel>
            <input
              value={tagsTexto}
              onChange={(e) => setTagsTexto(e.target.value)}
              disabled={enviando}
              placeholder="fluxo, boas-vindas, aula"
              aria-label="Tags separadas por vírgula"
              className={inputCls}
            />
          </div>

          {erro && <TrAviso tone="erro">{erro}</TrAviso>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--ops-border)] px-5 py-3">
          <span className="text-[11.5px] text-[var(--ops-mut)]">
            {podeEnviar
              ? `${links.length + (arquivo ? 1 : 0)} ${links.length + (arquivo ? 1 : 0) === 1 ? "item" : "itens"} para transcrever`
              : "Cole um link ou envie um arquivo para continuar"}
          </span>
          <div className="flex gap-2">
            <TrBtn onClick={onFechar} disabled={enviando}>
              Cancelar
            </TrBtn>
            <TrBtn kind="primary" onClick={() => void enviar()} disabled={!podeEnviar}>
              {enviando ? "Enviando…" : "Transcrever"}
            </TrBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinhaPrevia({ p, duracaoDisponivel }: { p: PreviaLink; duracaoDisponivel: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
      {p.plataforma && <IconePlataforma p={p.plataforma} size={13} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">
          {p.titulo ?? p.url}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--ops-mut)]">
          {p.duplicadaDe ? (
            <>
              Já existe na biblioteca —{" "}
              <Link
                href={ROUTES.ADMIN.TRANSCRICOES.DETAIL(p.duplicadaDe.id)}
                className="font-semibold text-[var(--ops-accent)] hover:underline"
              >
                abrir
              </Link>
            </>
          ) : p.erro ? (
            p.erro
          ) : (
            [p.canal, p.duracaoSeg != null ? fmtDuracao(p.duracaoSeg) : duracaoDisponivel ? null : "duração após processar"]
              .filter(Boolean)
              .join(" · ") || "pronto para transcrever"
          )}
        </span>
      </span>
      {p.duplicadaDe ? (
        <span className="shrink-0 text-[10.5px] font-semibold text-[var(--ops-warn)]">duplicado</span>
      ) : p.ok ? (
        <Icon icon={CheckCircle2} customSize={13} className="shrink-0 text-[var(--ops-pos)]" />
      ) : null}
    </div>
  )
}
