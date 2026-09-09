"use client"

/**
 * Referências do Estúdio — os carrosséis que a ConvertIA lê antes de
 * escrever. Seção na home (cards), diálogo de adicionar (do Instagram, com
 * os posts reais mais salvos primeiro, ou enviando os slides) e ficha
 * editável (copy por slide, por que funciona, pilar/molde/peso, ativa).
 *
 * O que a tela não esconde: uma referência `pendente` ou com `erro` NÃO
 * está sendo usada — o selo diz isso e o botão "Ler de novo" resolve. O
 * contador do editor mostra só as utilizáveis.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Instagram, Layers, Plus, RefreshCw, Sparkles, Trash2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { SectionTitle } from "@/components/dashboard/ops/primitives"
import { useToast } from "@/lib/hooks/use-toast"
import { PILARES } from "@/lib/conteudo/config"
import { uploadImagem } from "@/lib/conteudo/data"
import { utilizavel } from "@/lib/conteudo/referencias"
import { FRAME_TIPO_LABEL, ST_MOLDE_KEY } from "@/lib/conteudo/templates"
import type { FrameTipo, MoldeKey, Perfil, Referencia, ReferenciaCandidata } from "@/lib/conteudo/types"
import { CtAvatar, CtBadge, CtBtn, CtEmpty, CtLabel, CtSeg, CtSkel, TNUM, inputCls, selectCls, textareaCls } from "../ui"
import { perfilPorId, useCandidatosReferencia, useReferencias } from "./use-estudio-data"

const MOLDES = Object.values(ST_MOLDE_KEY) as MoldeKey[]
const TIPOS = Object.keys(FRAME_TIPO_LABEL) as FrameTipo[]

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("pt-BR")
}

function selo(r: Referencia): [string, string] {
  if (!r.ativa) return ["Desativada", "#6B7280"]
  if (r.transcricao === "erro") return ["Falhou na leitura", "#DC2626"]
  if (r.transcricao === "pendente") return ["Lendo…", "#D97706"]
  return utilizavel(r) ? ["Em uso pela IA", "#047857"] : ["Sem copy", "#D97706"]
}

// ── Seção da home ───────────────────────────────────────────────────────

export function ReferenciasSecao({ perfis, onUsarComoModelo }: { perfis: Perfil[] | null; onUsarComoModelo?: (ref: Referencia) => Promise<void> }) {
  const { referencias, utilizaveis, error, isLoading, importar, criarDeUpload, atualizar, excluir } = useReferencias()
  const [adicionando, setAdicionando] = useState(false)
  const [aberta, setAberta] = useState<Referencia | null>(null)
  const [excluindo, setExcluindo] = useState<Referencia | null>(null)
  const [usando, setUsando] = useState<string | null>(null)
  const { toast } = useToast()

  const usar = async (r: Referencia) => {
    if (!onUsarComoModelo) return
    setUsando(r.id)
    try {
      await onUsarComoModelo(r)
    } catch (e) {
      toast({ title: "Não foi possível criar o carrossel", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    } finally {
      setUsando(null)
    }
  }

  // A ficha aberta acompanha a lista (a transcrição chega depois do clique).
  const abertaAtual = useMemo(() => (aberta ? (referencias ?? []).find((r) => r.id === aberta.id) ?? aberta : null), [aberta, referencias])

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <SectionTitle title="Referências" hint={referencias ? `${utilizaveis} em uso pela ConvertIA${referencias.length !== utilizaveis ? ` · ${referencias.length} no total` : ""}` : undefined} />
        <button type="button" onClick={() => setAdicionando(true)} className="ml-auto text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
          Adicionar referência
        </button>
      </div>
      {error && <div className="rounded-lg border border-[var(--ops-neg-br)] bg-[var(--ops-neg-bg)] px-3 py-2 text-[11.5px] text-[var(--ops-neg)]">{error.message}</div>}
      {isLoading && !referencias ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3.5">
          {[0, 1, 2].map((i) => (
            <CtSkel key={i} h={230} r={10} />
          ))}
        </div>
      ) : referencias && referencias.length === 0 ? (
        <CtEmpty
          icon={BookOpen}
          title="A ConvertIA ainda escreve só pela regra"
          desc="Adicione os carrosséis que você considera bons — os seus do Instagram ou qualquer um por upload. Ela lê a copy, entende o ritmo e passa a escrever no mesmo padrão."
          action={
            <CtBtn kind="primary" icon={Plus} onClick={() => setAdicionando(true)} className="mt-2">
              Adicionar referência
            </CtBtn>
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3.5">
          {(referencias ?? []).map((r) => {
            const [sl, sc] = selo(r)
            const capa = r.slides[0]?.imagemUrl
            return (
              <div key={r.id} className={cn("group relative rounded-[10px] border bg-[var(--ops-card)] p-2.5 transition-colors hover:border-[var(--ops-mut)]", r.ativa ? "border-[var(--ops-border)]" : "border-dashed border-[var(--ops-border)] opacity-70")}>
                <button type="button" onClick={() => setAberta(r)} className="block w-full text-left">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[7px] bg-[var(--ops-tile)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {capa && <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    <span className="absolute left-1.5 top-1.5 inline-flex h-5 items-center gap-1 rounded-md bg-black/55 px-1.5 text-[10px] font-semibold text-white">
                      <Icon icon={r.origem === "instagram" ? Instagram : Upload} customSize={10} />
                      {r.slides.length} slides
                    </span>
                  </div>
                  <div className="mt-[9px] line-clamp-2 text-[12px] font-medium leading-[1.35] text-[var(--ops-title)]">{r.nome}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-1 text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
                    <CtBadge txt={sl} cor={sc} />
                    {r.metricas?.saved != null && <span title="salvamentos">{fmt(r.metricas.saved)} salv.</span>}
                  </div>
                </button>
                <button type="button" aria-label="Remover referência" onClick={() => setExcluindo(r)} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ops-card)]/90 text-[var(--ops-mut)] opacity-0 transition-opacity hover:text-[var(--ops-neg)] group-hover:opacity-100">
                  <Icon icon={Trash2} customSize={12} />
                </button>
                {onUsarComoModelo && (
                  <button
                    type="button"
                    onClick={() => usar(r)}
                    disabled={usando === r.id}
                    className="absolute inset-x-2.5 bottom-2.5 inline-flex h-[26px] items-center justify-center gap-1.5 rounded-lg bg-[var(--ops-accent)] text-[11px] font-semibold text-[var(--ops-on-accent)] opacity-0 transition-opacity hover:opacity-95 disabled:opacity-60 group-hover:opacity-100"
                  >
                    <Icon icon={Layers} customSize={11} />
                    {usando === r.id ? "Criando…" : "Usar como modelo"}
                  </button>
                )}
              </div>
            )
          })}
          <button type="button" onClick={() => setAdicionando(true)} className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--ops-border)] text-[12px] font-medium text-[var(--ops-sec)] transition-colors hover:bg-[var(--ops-hover)]">
            <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--ops-hover)] text-[var(--ops-mut)]">
              <Icon icon={Plus} customSize={15} />
            </span>
            Adicionar referência
            <span className="px-[18px] text-center text-[10.5px] font-normal leading-relaxed text-[var(--ops-mut)]">Do seu Instagram ou enviando os slides</span>
          </button>
        </div>
      )}

      {adicionando && (
        <AdicionarReferenciaDialog
          perfis={perfis}
          onClose={() => setAdicionando(false)}
          onImportar={async (c) => {
            const ref = await importar(c.igMediaId)
            toast({ title: ref.transcricao === "lida" ? "Referência lida pela ConvertIA" : "Referência importada", description: ref.transcricao === "erro" ? `A leitura falhou: ${ref.transcricaoErro ?? "tente de novo"}` : ref.nome })
            setAdicionando(false)
            setAberta(ref)
          }}
          onUpload={async (e) => {
            const ref = await criarDeUpload(e)
            toast({ title: ref.transcricao === "lida" ? "Referência lida pela ConvertIA" : "Referência criada", description: ref.transcricao === "erro" ? `A leitura falhou: ${ref.transcricaoErro ?? "tente de novo"}` : ref.nome })
            setAdicionando(false)
            setAberta(ref)
          }}
        />
      )}
      {abertaAtual && (
        <ReferenciaFicha
          ref_={abertaAtual}
          onClose={() => setAberta(null)}
          onUsarComoModelo={onUsarComoModelo ? () => usar(abertaAtual) : undefined}
          usando={usando === abertaAtual.id}
          onSalvar={async (patch) => {
            try {
              await atualizar(abertaAtual.id, patch)
              toast({ title: patch.retranscrever ? "Leitura refeita" : "Referência salva" })
            } catch (e) {
              toast({ title: "Não foi possível salvar", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
            }
          }}
        />
      )}
      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover referência?</AlertDialogTitle>
            <AlertDialogDescription>&ldquo;{excluindo?.nome}&rdquo; deixa de ser lida pela ConvertIA. Os slides guardados também são apagados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!excluindo) return
                try {
                  await excluir(excluindo.id)
                  toast({ title: "Referência removida" })
                } catch (e) {
                  toast({ title: "Não foi possível remover", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
                }
                setExcluindo(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Adicionar ───────────────────────────────────────────────────────────

function AdicionarReferenciaDialog({ perfis, onClose, onImportar, onUpload }: { perfis: Perfil[] | null; onClose: () => void; onImportar: (c: ReferenciaCandidata) => Promise<void>; onUpload: (e: { nome?: string; slidesUrls: string[]; legenda?: string | null }) => Promise<void> }) {
  const [aba, setAba] = useState<"instagram" | "upload">("instagram")
  const { candidatos, error, isLoading } = useCandidatosReferencia(aba === "instagram")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [nome, setNome] = useState("")
  const [legenda, setLegenda] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => arquivos.map((f) => URL.createObjectURL(f)), [arquivos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const importar = async (c: ReferenciaCandidata) => {
    setOcupado(c.igMediaId)
    setErro(null)
    try {
      await onImportar(c)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível importar.")
    } finally {
      setOcupado(null)
    }
  }

  const enviar = async () => {
    if (!arquivos.length) return
    setOcupado("upload")
    setErro(null)
    try {
      // Os slides sobem um a um (kind=referencia); a rota guarda cópia
      // normalizada e pede a leitura. A ordem dos arquivos é a ordem dos slides.
      const urls: string[] = []
      for (const f of arquivos) urls.push((await uploadImagem(f, "referencia")).url)
      await onUpload({ nome: nome.trim() || undefined, slidesUrls: urls, legenda: legenda.trim() || null })
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar a referência.")
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar referência</DialogTitle>
          <DialogDescription>A ConvertIA lê a copy de cada slide, entende o ritmo e passa a escrever no mesmo padrão. Leva até um minuto por carrossel.</DialogDescription>
        </DialogHeader>
        <CtSeg<"instagram" | "upload"> val={aba} onChange={setAba} opts={[["instagram", "Do seu Instagram"], ["upload", "Enviar slides"]]} />
        {erro && <div className="rounded-lg border border-[var(--ops-neg-br)] bg-[var(--ops-neg-bg)] px-3 py-2 text-[11.5px] text-[var(--ops-neg)]">{erro}</div>}

        {aba === "instagram" && (
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading && !candidatos ? (
              <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <CtSkel key={i} h={64} r={8} />)}</div>
            ) : error ? (
              <div className="text-[11.5px] text-[var(--ops-neg)]">{error.message}</div>
            ) : !candidatos?.length ? (
              <CtEmpty icon={Instagram} title="Nenhum carrossel para importar" desc="Todos os carrosséis sincronizados já viraram referência, ou o Instagram ainda não foi sincronizado no Dashboard." />
            ) : (
              <div className="flex flex-col gap-1.5">
                {candidatos.map((c) => {
                  const p = perfilPorId(perfis, c.perfil)
                  return (
                    <div key={c.igMediaId} className="flex items-center gap-3 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] p-2">
                      <div className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--ops-tile)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[12px] font-medium leading-[1.35] text-[var(--ops-title)]">{c.headline}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
                          <span className="inline-flex items-center gap-1">
                            <CtAvatar perfil={p} size={14} />
                            {p?.handle ?? p?.nome ?? "perfil"}
                          </span>
                          <span>{c.slides ?? "?"} slides</span>
                          <span>{fmt(c.metricas.saved)} salv.</span>
                          <span>{fmt(c.metricas.shares)} compart.</span>
                          <span>alc. {fmt(c.metricas.reach)}</span>
                          <span>{c.publicadoEm ? new Date(c.publicadoEm).toLocaleDateString("pt-BR") : ""}</span>
                        </div>
                      </div>
                      <CtBtn kind="primary" size="sm" icon={Sparkles} disabled={Boolean(ocupado)} onClick={() => void importar(c)}>
                        {ocupado === c.igMediaId ? "Lendo…" : "Importar"}
                      </CtBtn>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {aba === "upload" && (
          <div className="flex flex-col gap-3">
            <div>
              <CtLabel>Slides (na ordem)</CtLabel>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {previews.map((u, i) => (
                  <span key={u} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="block h-[70px] w-14 rounded-md object-cover" />
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{i + 1}</span>
                    <button type="button" aria-label="Remover slide" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ops-title)] text-[var(--ops-card)]">
                      <Icon icon={X} customSize={8} />
                    </button>
                  </span>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} className="flex h-[70px] w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-[var(--ops-border)] text-[10px] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
                  <Icon icon={Plus} customSize={12} />
                  {arquivos.length ? "mais" : "slides"}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const lista = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"))
                  setArquivos((a) => [...a, ...lista].slice(0, 12))
                  e.target.value = ""
                }}
              />
            </div>
            <div>
              <CtLabel>Nome (opcional — a IA usa a headline da capa)</CtLabel>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={cn(inputCls, "mt-1 h-8 w-full")} placeholder="Ex.: 8% dos clientes fazem 41% do faturamento" />
            </div>
            <div>
              <CtLabel>Legenda publicada (opcional, ajuda a ler o fechamento)</CtLabel>
              <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={3} className={cn(textareaCls, "mt-1 w-full")} />
            </div>
          </div>
        )}

        <DialogFooter>
          <CtBtn onClick={onClose} disabled={Boolean(ocupado)}>
            {aba === "instagram" ? "Fechar" : "Cancelar"}
          </CtBtn>
          {aba === "upload" && (
            <CtBtn kind="primary" icon={Sparkles} disabled={!arquivos.length || Boolean(ocupado)} onClick={() => void enviar()}>
              {ocupado === "upload" ? "Enviando e lendo…" : `Criar com ${arquivos.length} slide${arquivos.length === 1 ? "" : "s"}`}
            </CtBtn>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Ficha ───────────────────────────────────────────────────────────────

function ReferenciaFicha({
  ref_,
  onClose,
  onSalvar,
  onUsarComoModelo,
  usando,
}: {
  ref_: Referencia
  onClose: () => void
  onSalvar: (patch: import("@/lib/conteudo/data").PatchReferenciaEntrada) => Promise<void>
  onUsarComoModelo?: () => void
  usando?: boolean
}) {
  const [nome, setNome] = useState(ref_.nome)
  const [slides, setSlides] = useState(ref_.slides.map((s) => ({ ordem: s.ordem, tipo: s.tipo, titulo: s.titulo ?? "", corpo: s.corpo ?? "", imagemUrl: s.imagemUrl })))
  const [porque, setPorque] = useState(ref_.porQueFunciona.join("\n"))
  const [pilar, setPilar] = useState(ref_.pilar ?? "")
  const [molde, setMolde] = useState(ref_.molde ?? "")
  const [peso, setPeso] = useState<"1" | "2" | "3">(String(ref_.peso) as "1" | "2" | "3")
  const [ativa, setAtiva] = useState(ref_.ativa)
  const [kw, setKw] = useState(ref_.palavraChave ?? "")
  const [salvando, setSalvando] = useState<null | "salvar" | "reler">(null)

  // Transcrição que chega depois de aberta (importação em andamento).
  useEffect(() => {
    setSlides(ref_.slides.map((s) => ({ ordem: s.ordem, tipo: s.tipo, titulo: s.titulo ?? "", corpo: s.corpo ?? "", imagemUrl: s.imagemUrl })))
    setPorque(ref_.porQueFunciona.join("\n"))
    setNome(ref_.nome)
    if (!pilar && ref_.pilar) setPilar(ref_.pilar)
    if (!molde && ref_.molde) setMolde(ref_.molde)
    if (!kw && ref_.palavraChave) setKw(ref_.palavraChave)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref_.transcricao, ref_.atualizadoEm])

  const [sl, sc] = selo(ref_)
  const imagens = useMemo(() => new Map(slides.map((s) => [s.ordem, s.imagemUrl])), [slides])
  const [enviandoImagem, setEnviandoImagem] = useState<number | null>(null)
  const { toast } = useToast()

  // Referência cadastrada sem imagem (copy escrita à mão): a imagem entra
  // slide a slide e é gravada junto com o Salvar — o servidor só aceita
  // onde ainda não há imagem.
  const enviarImagem = async (ordem: number, file: File) => {
    setEnviandoImagem(ordem)
    try {
      const { url } = await uploadImagem(file, "referencia")
      setSlides((a) => a.map((x) => (x.ordem === ordem ? { ...x, imagemUrl: url } : x)))
    } catch (e) {
      toast({ title: "Não foi possível enviar a imagem", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    } finally {
      setEnviandoImagem(null)
    }
  }

  const salvar = async (retranscrever = false) => {
    setSalvando(retranscrever ? "reler" : "salvar")
    try {
      await onSalvar({
        retranscrever,
        nome: nome.trim() || ref_.nome,
        slides: slides.map((s) => ({ ordem: s.ordem, tipo: s.tipo, titulo: s.titulo, corpo: s.corpo, imagemUrl: s.imagemUrl || undefined })),
        porQueFunciona: porque.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean),
        pilar: pilar || null,
        molde: molde || null,
        palavraChave: kw.trim() || null,
        peso: Number(peso) as 1 | 2 | 3,
        ativa,
      })
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{ref_.nome}</span>
            <CtBadge txt={sl} cor={sc} />
          </DialogTitle>
          <DialogDescription>
            {ref_.origem === "instagram" ? "Importada do Instagram" : "Enviada por upload"}
            {ref_.metricas && ` · alcance ${fmt(ref_.metricas.reach)} · ${fmt(ref_.metricas.saved)} salvamentos · ${fmt(ref_.metricas.shares)} compartilhamentos${ref_.metricas.follows ? ` · ${fmt(ref_.metricas.follows)} seguidores` : ""}`}
            {ref_.permalink && (
              <>
                {" · "}
                <a href={ref_.permalink} target="_blank" rel="noreferrer" className="underline">
                  abrir no Instagram
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {ref_.transcricao === "erro" && (
          <div className="rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-3 py-2 text-[11.5px] text-[var(--ops-warn)]">
            A ConvertIA não conseguiu ler os slides{ref_.transcricaoErro ? `: ${ref_.transcricaoErro}` : "."} Você pode escrever a copy à mão abaixo (ela passa a ser usada assim que salvar) ou pedir para ler de novo.
          </div>
        )}

        <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-2">
            {slides.map((s, i) => (
              <div key={s.ordem} className="flex gap-2.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] p-2">
                <div className="group/img relative h-[90px] w-[72px] shrink-0 overflow-hidden rounded-md bg-[var(--ops-tile)]">
                  {imagens.get(s.ordem) ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagens.get(s.ordem)} alt="" className="h-full w-full object-cover" />
                      {/* Trocar é permitido: quem enviou a imagem errada
                          precisa poder corrigir sem recriar a referência. */}
                      <label className={cn("absolute inset-x-0 bottom-0 flex cursor-pointer items-center justify-center gap-1 bg-black/60 py-[3px] text-[9.5px] font-semibold text-white opacity-0 transition-opacity group-hover/img:opacity-100", enviandoImagem === s.ordem && "pointer-events-none opacity-100")}>
                        <Icon icon={Upload} customSize={9} />
                        {enviandoImagem === s.ordem ? "Enviando…" : "Trocar"}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarImagem(s.ordem, f); e.target.value = "" }} />
                      </label>
                    </>
                  ) : (
                    <label className={cn("flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-center text-[9.5px] leading-tight text-[var(--ops-mut)] hover:text-[var(--ops-title)]", enviandoImagem === s.ordem && "pointer-events-none opacity-60")}>
                      <Icon icon={Upload} customSize={12} />
                      {enviandoImagem === s.ordem ? "Enviando…" : "Enviar imagem"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarImagem(s.ordem, f); e.target.value = "" }} />
                    </label>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[var(--ops-mut)]" style={TNUM}>
                      {String(s.ordem).padStart(2, "0")}
                    </span>
                    <select value={s.tipo ?? ""} onChange={(e) => setSlides((a) => a.map((x, j) => (j === i ? { ...x, tipo: (e.target.value || undefined) as FrameTipo | undefined } : x)))} className={cn(selectCls, "h-6 text-[10.5px]")} aria-label="Tipo do slide">
                      <option value="">tipo</option>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {FRAME_TIPO_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input value={s.titulo} onChange={(e) => setSlides((a) => a.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} placeholder="Título do slide" className={cn(inputCls, "h-7 w-full font-medium")} />
                  <textarea value={s.corpo} onChange={(e) => setSlides((a) => a.map((x, j) => (j === i ? { ...x, corpo: e.target.value } : x)))} placeholder="Texto de apoio" rows={2} className={cn(textareaCls, "w-full")} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <CtLabel>Nome</CtLabel>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={cn(inputCls, "mt-1 h-8 w-full")} />
            </div>
            <div>
              <CtLabel>Por que funciona (um por linha)</CtLabel>
              <textarea value={porque} onChange={(e) => setPorque(e.target.value)} rows={5} className={cn(textareaCls, "mt-1 w-full")} placeholder="Capa com número e contraste&#10;Um dado por slide&#10;Fecha no comment gate" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <CtLabel>Pilar</CtLabel>
                <select value={pilar} onChange={(e) => setPilar(e.target.value)} className={cn(selectCls, "mt-1 h-8 w-full")}>
                  <option value="">—</option>
                  {PILARES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <CtLabel>Molde</CtLabel>
                <select value={molde} onChange={(e) => setMolde(e.target.value)} className={cn(selectCls, "mt-1 h-8 w-full")}>
                  <option value="">—</option>
                  {MOLDES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <CtLabel>Palavra-chave do comment gate</CtLabel>
              <input value={kw} onChange={(e) => setKw(e.target.value.toUpperCase())} className={cn(inputCls, "mt-1 h-8 w-full uppercase")} placeholder="Ex.: 41" />
            </div>
            <div>
              <CtLabel>Peso (entra primeiro quando há muitas)</CtLabel>
              <CtSeg<"1" | "2" | "3"> val={peso} onChange={setPeso} opts={[["1", "Normal"], ["2", "Alto"], ["3", "Máximo"]]} size="sm" className="mt-1" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ops-title)]">
              <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="accent-[var(--ops-accent)]" />
              Em uso pela ConvertIA
            </label>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <CtBtn icon={RefreshCw} disabled={Boolean(salvando)} onClick={() => void salvar(true)} title="Pede à ConvertIA para ler os slides de novo (substitui a copy)">
            {salvando === "reler" ? "Lendo…" : "Ler de novo"}
          </CtBtn>
          {onUsarComoModelo && (
            <CtBtn icon={Layers} onClick={onUsarComoModelo} disabled={Boolean(salvando) || usando}>
              {usando ? "Criando…" : "Usar como modelo"}
            </CtBtn>
          )}
          <span className="flex-1" />
          <CtBtn onClick={onClose} disabled={Boolean(salvando)}>
            Fechar
          </CtBtn>
          <CtBtn kind="primary" disabled={Boolean(salvando)} onClick={() => void salvar(false)}>
            {salvando === "salvar" ? "Salvando…" : "Salvar"}
          </CtBtn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
