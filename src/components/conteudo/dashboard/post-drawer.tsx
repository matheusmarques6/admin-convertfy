"use client"

/**
 * Drawer do post: perfil, headline, mídia real, métricas da Graph API,
 * classificação da casa (pilar · molde · palavra-chave — é o que alimenta
 * mix e desempenho por molde), legenda publicada e leads atribuídos pelo
 * comment gate com o estágio no CRM. Lateral fixa no desktop, Sheet no mobile.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Briefcase, ExternalLink, Inbox, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CT_MOLDE_COR, CT_PILAR_COR } from "@/lib/conteudo/brand"
import { PILARES } from "@/lib/conteudo/config"
import { classificarPost, getLeadsDoPost } from "@/lib/conteudo/data"
import type { LeadDoPost, MoldeKey, Perfil, Pilar, Post } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatar, CtAvatarComCanal, CtBadge, CtFmt, CtSkel, CtThumbPost, TNUM, fmtNum, inputCls, selectCls } from "../ui"

const MOLDES: MoldeKey[] = ["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]

const ESTAGIO_COR: Record<string, string> = {
  "Cliente fechado": "#047857",
  Cliente: "#047857",
  "Negócio perdido": "#B91C1C",
  "Lead no CRM": "#2563EB",
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })

function DrawerBody({ post, perfil, onClose, onClassificado }: { post: Post; perfil: Perfil | undefined; onClose: () => void; onClassificado: () => void }) {
  const [legendaAberta, setLegendaAberta] = useState(false)
  const [leads, setLeads] = useState<{ leads: LeadDoPost[]; total: number } | null>(null)
  const [erroLeads, setErroLeads] = useState<string | null>(null)
  const [cls, setCls] = useState({ pilar: post.pilar ?? "", molde: post.molde ?? "", kw: post.kw ?? "" })
  const [salvando, setSalvando] = useState(false)
  const [erroCls, setErroCls] = useState<string | null>(null)

  useEffect(() => {
    setLegendaAberta(false)
    setLeads(null)
    setErroLeads(null)
    setCls({ pilar: post.pilar ?? "", molde: post.molde ?? "", kw: post.kw ?? "" })
    let vivo = true
    getLeadsDoPost(post.id)
      .then((l) => vivo && setLeads(l))
      .catch((e: Error) => vivo && setErroLeads(e.message))
    return () => {
      vivo = false
    }
  }, [post.id, post.pilar, post.molde, post.kw])

  const mudou = (cls.pilar || null) !== post.pilar || (cls.molde || null) !== post.molde || (cls.kw.trim() || null) !== post.kw
  const salvar = async () => {
    setSalvando(true)
    setErroCls(null)
    try {
      await classificarPost(post.id, { pilar: cls.pilar || null, molde: cls.molde || null, palavraChave: cls.kw.trim() || null })
      onClassificado()
    } catch (e) {
      setErroCls(e instanceof Error ? e.message : "Não foi possível salvar")
    } finally {
      setSalvando(false)
    }
  }

  const legenda = post.legenda ?? ""
  const stats: Array<[string, string, boolean]> = [
    ["Alcance", post.alc == null ? "—" : fmtNum(post.alc), false],
    ["Seguidores", post.seg == null ? "—" : `+${fmtNum(post.seg)}`, false],
    ["Leads", String(post.leads), true],
    ["Salvam.", post.sav == null ? "—" : fmtNum(post.sav), false],
    ["Compart.", post.sh == null ? "—" : fmtNum(post.sh), false],
    ["Coment.", fmtNum(post.com), false],
  ]

  return (
    <div className="relative px-[22px] pb-7 pt-[22px]">
      <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--ops-hover)] text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
        <Icon icon={X} customSize={13} />
      </button>

      <div className="mb-3 flex items-center gap-2.5">
        <CtAvatarComCanal perfil={perfil} size={34} />
        <span>
          <span className="block text-[12.5px] font-semibold text-[var(--ops-title)]">{perfil?.nome ?? "Perfil"}</span>
          <span className="block text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
            {perfil?.handle ?? ""} · {post.data}
          </span>
        </span>
      </div>
      <div className="pr-6 text-[14.5px] font-semibold leading-[1.35] text-[var(--ops-title)]">{post.head}</div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <CtFmt fmt={post.fmt} />
        {post.pilar && <CtBadge txt={post.pilar} cor={CT_PILAR_COR[post.pilar]} />}
        {post.molde && <CtBadge txt={post.molde} cor={CT_MOLDE_COR[post.molde]} />}
        {post.slides != null && <CtBadge txt={`${post.slides} slides`} cor="#6B7280" />}
      </div>

      <div className="mt-4 overflow-hidden rounded-[10px] bg-[var(--ops-track)]">
        <div className="relative aspect-[4/5]">
          <CtThumbPost src={post.thumb} className="absolute inset-0 h-full w-full" />
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-3 gap-2">
        {stats.map(([l, v, pos]) => (
          <div key={l} className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{l}</div>
            <div className={cn("mt-[3px] text-[15px] font-semibold", pos ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")} style={TNUM}>
              {v}
            </div>
          </div>
        ))}
      </div>
      {post.alc == null && <div className="mt-1.5 text-[10.5px] text-[var(--ops-mut)]">Insights desta mídia ainda não foram lidos (ou a Meta não os expõe para este tipo de post).</div>}

      <div className="mt-[18px] text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Classificação da casa</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <select value={cls.pilar} onChange={(e) => setCls((c) => ({ ...c, pilar: e.target.value as Pilar | "" }))} className={cn(selectCls, "h-8")} aria-label="Pilar">
          <option value="">Pilar…</option>
          {PILARES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={cls.molde} onChange={(e) => setCls((c) => ({ ...c, molde: e.target.value as MoldeKey | "" }))} className={cn(selectCls, "h-8")} aria-label="Molde">
          <option value="">Molde…</option>
          {MOLDES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex text-[var(--ops-mut)]">
          <Icon icon={Inbox} customSize={12} />
        </span>
        <input value={cls.kw} onChange={(e) => setCls((c) => ({ ...c, kw: e.target.value.toUpperCase() }))} placeholder="Palavra-chave do comment gate" className={cn(inputCls, "h-8 font-semibold")} aria-label="Palavra-chave" />
        <button type="button" disabled={!mudou || salvando} onClick={() => void salvar()} className="h-8 shrink-0 rounded-lg bg-[var(--ops-accent)] px-3 text-[11.5px] font-semibold text-[var(--ops-on-accent)] disabled:opacity-40">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {erroCls && <div className="mt-1 text-[10.5px] text-[var(--ops-neg)]">{erroCls}</div>}
      <div className="mt-1 text-[10.5px] text-[var(--ops-mut)]">Pilar e molde alimentam o mix e o desempenho por molde. A palavra-chave conta os comentários do comment gate.</div>

      <div className="mt-[18px] text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Legenda publicada</div>
      {legenda ? (
        <>
          <div className={cn("relative mt-1.5 whitespace-pre-wrap text-[12px] leading-[1.6] text-[var(--ops-text)]", !legendaAberta && "max-h-[120px] overflow-hidden")}>
            {legendaAberta ? legenda : legenda.slice(0, 380)}
            {!legendaAberta && legenda.length > 380 && <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-b from-transparent to-[var(--ops-card)]" />}
          </div>
          {legenda.length > 380 && (
            <button type="button" onClick={() => setLegendaAberta((v) => !v)} className="mt-1 text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
              {legendaAberta ? "Recolher legenda" : "Ver legenda completa"}
            </button>
          )}
        </>
      ) : (
        <div className="mt-1.5 text-[11.5px] text-[var(--ops-mut)]">Post sem legenda.</div>
      )}

      <div className="mt-[18px] flex items-baseline gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Leads gerados</span>
        <span className="text-[11px] text-[var(--ops-sec)]" style={TNUM}>
          {leads ? leads.total : post.leads}
        </span>
      </div>
      <div className="mt-2 overflow-hidden rounded-[9px] border border-[var(--ops-border)]">
        {erroLeads ? (
          <div className="px-3 py-4 text-center text-[11.5px] text-[var(--ops-neg)]">{erroLeads}</div>
        ) : leads === null ? (
          <div className="flex flex-col gap-2 p-3">
            {[1, 2, 3].map((i) => (
              <CtSkel key={i} h={26} />
            ))}
          </div>
        ) : leads.leads.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11.5px] text-[var(--ops-mut)]">Nenhum contato comentou neste post e depois abriu conversa no direct.</div>
        ) : (
          leads.leads.slice(0, 8).map((l, i) => (
            <Link key={l.threadId} href={`${ROUTES.ADMIN.INBOX}?thread=${l.threadId}`} className={cn("flex items-center gap-2.5 px-3 py-[9px] hover:bg-[var(--ops-hover)]", i > 0 && "border-t border-[var(--ops-border)]")}>
              <CtAvatar perfil={{ id: l.threadId, nome: l.nome, handle: l.handle, cor: "#6B7280", avatar: l.avatar, canal: "instagram", ativo: true, metaSemanal: 0, seguidores: null, erro: null }} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--ops-title)]">{l.nome}</span>
                <span className="block text-[10.5px] text-[var(--ops-mut)]">
                  {l.handle ?? "direct"} · {fmtData(l.data)}
                </span>
              </span>
              <CtBadge txt={l.estagio} cor={ESTAGIO_COR[l.estagio] ?? (l.estagio.startsWith("Negócio") ? "#7C3AED" : "#6B7280")} />
            </Link>
          ))
        )}
      </div>

      <div className="mt-[18px] flex flex-wrap gap-2">
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
            <Icon icon={ExternalLink} customSize={13} />
            Abrir no Instagram
          </a>
        )}
        <Link href={ROUTES.ADMIN.INBOX} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
          <Icon icon={Briefcase} customSize={13} />
          Abrir o inbox
        </Link>
      </div>
    </div>
  )
}

export function PostDrawer({ post, perfil, onClose, onClassificado }: { post: Post | null; perfil: Perfil | undefined; onClose: () => void; onClassificado: () => void }) {
  const desktop = useMediaQuery("(min-width: 1024px)")
  if (!post) return null
  if (desktop) {
    return (
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[var(--ops-border)] bg-[var(--ops-card)]" aria-label="Detalhe do post">
        <DrawerBody post={post} perfil={perfil} onClose={onClose} onClassificado={onClassificado} />
      </aside>
    )
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[360px] max-w-full overflow-y-auto border-[var(--ops-border)] bg-[var(--ops-card)] p-0">
        <SheetTitle className="sr-only">Detalhe do post</SheetTitle>
        <DrawerBody post={post} perfil={perfil} onClose={onClose} onClassificado={onClassificado} />
      </SheetContent>
    </Sheet>
  )
}
