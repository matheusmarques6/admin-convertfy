"use client"

/**
 * Drawer do post: perfil, headline, slide navegável, 3 mini-stats, comment
 * gate, legenda (expansível) e leads com estágio. Lateral fixa no desktop,
 * Sheet no mobile.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Briefcase, ChevronLeft, ChevronRight, ExternalLink, Inbox, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CT_MOLDE_COR, CT_PERFIS, CT_PILAR_COR, FONTE_APOIO, FONTE_TITULO, SLIDE } from "@/lib/conteudo/brand"
import { getEstruturaTurbo, getLeadsDoPost, getLegendaExemplo } from "@/lib/conteudo/data"
import type { LeadDoPost, Post } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtAvatarComCanal, CtBadge, CtFmt, CtSkel, TNUM, ctThumb, fmtNum } from "../ui"

const ESTAGIO_COR: Record<string, string> = {
  "Cliente fechado": "#047857",
  "Reunião agendada": "#7C3AED",
  "Proposta enviada": "#D97706",
}

function instagramUrl(p: Post): string {
  const handle = CT_PERFIS[p.perfil].handle ?? ""
  if (p.perfil === "youtube") return "https://www.youtube.com/@convertfy"
  return `https://www.instagram.com/${handle.replace("@", "")}/`
}

function DrawerBody({ post, onClose }: { post: Post; onClose: () => void }) {
  const [slideIx, setSlideIx] = useState(0)
  const [legendaAberta, setLegendaAberta] = useState(false)
  const [leads, setLeads] = useState<LeadDoPost[] | null>(null)
  const estrutura = getEstruturaTurbo()
  const legenda = getLegendaExemplo()

  useEffect(() => {
    setSlideIx(0)
    setLegendaAberta(false)
    setLeads(null)
    let vivo = true
    getLeadsDoPost(post.id).then((l) => vivo && setLeads(l))
    return () => {
      vivo = false
    }
  }, [post.id])

  const P = CT_PERFIS[post.perfil]
  const capa = slideIx === 0
  const slide = estrutura[Math.min(slideIx, estrutura.length - 1)]

  return (
    <div className="relative px-[22px] pb-7 pt-[22px]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-4 top-4 flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--ops-hover)] text-[var(--ops-sec)] hover:text-[var(--ops-title)]"
      >
        <Icon icon={X} customSize={13} />
      </button>

      <div className="mb-3 flex items-center gap-2.5">
        <CtAvatarComCanal perfil={post.perfil} size={34} />
        <span>
          <span className="block text-[12.5px] font-semibold text-[var(--ops-title)]">{P.nome}</span>
          <span className="block text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
            {P.handle} · {post.data}
          </span>
        </span>
      </div>
      <div className="pr-6 text-[14.5px] font-semibold leading-[1.35] text-[var(--ops-title)]">{post.head}</div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <CtFmt fmt={post.fmt} />
        <CtBadge txt={post.pilar} cor={CT_PILAR_COR[post.pilar]} />
        <CtBadge txt={post.molde} cor={CT_MOLDE_COR[post.molde]} />
      </div>

      {/* slide (identidade dos slides = exceção consciente aos tokens) */}
      <div className="mt-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[10px]" style={{ background: SLIDE.escuro }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ctThumb(post.thumbSeed ?? post.id, 320, 400)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: capa ? 0.55 : 0.12 }} />
          <div
            className="absolute inset-0 flex flex-col justify-between p-[22px]"
            style={{
              background: capa ? "linear-gradient(180deg, rgba(4,19,102,0.2) 0%, rgba(4,19,102,0.9) 100%)" : SLIDE.fundoClaro,
              color: capa ? "#fff" : SLIDE.escuro,
            }}
          >
            <span className="text-[9px] font-bold tracking-[0.22em] opacity-85">CONVERTFY</span>
            <div className="uppercase leading-[1.02] tracking-[-0.01em]" style={{ fontFamily: FONTE_TITULO, fontWeight: 800, fontSize: capa ? 24 : 20 }}>
              {capa ? post.head : slide?.t}
              <span className="mt-2 block normal-case tracking-normal opacity-85" style={{ fontFamily: FONTE_APOIO, fontStyle: "italic", fontWeight: 400, fontSize: 12, lineHeight: 1.35 }}>
                {capa ? "e a maioria das lojas trata todo mundo igual" : slide?.b}
              </span>
            </div>
            <span className="text-[9.5px] opacity-70" style={TNUM}>
              {slideIx + 1} / {post.slides}
            </span>
          </div>
        </div>
        {post.slides > 1 && (
          <div className="mt-2.5 flex items-center justify-center gap-2.5">
            <button
              type="button"
              aria-label="Slide anterior"
              disabled={slideIx === 0}
              onClick={() => setSlideIx((i) => Math.max(0, i - 1))}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] disabled:opacity-40"
            >
              <Icon icon={ChevronLeft} customSize={13} />
            </button>
            <span className="text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
              {slideIx + 1} de {post.slides}
            </span>
            <button
              type="button"
              aria-label="Próximo slide"
              disabled={slideIx >= post.slides - 1}
              onClick={() => setSlideIx((i) => Math.min(post.slides - 1, i + 1))}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] disabled:opacity-40"
            >
              <Icon icon={ChevronRight} customSize={13} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-[18px] grid grid-cols-3 gap-2">
        {(
          [
            ["Alcance", fmtNum(post.alc), false],
            ["Seguidores", `+${post.seg}`, false],
            ["Leads", String(post.leads), true],
          ] as Array<[string, string, boolean]>
        ).map(([l, v, pos]) => (
          <div key={l} className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{l}</div>
            <div className={cn("mt-[3px] text-[15px] font-semibold", pos ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")} style={TNUM}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[18px] text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Comment gate</div>
      <div className="mt-1.5 inline-flex h-[30px] items-center gap-2 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] px-[11px] text-[12px] font-semibold text-[var(--ops-title)]">
        <Icon icon={Inbox} customSize={12} />
        <span className="text-[var(--ops-accent)]">{post.kw}</span>
        <span className="text-[10.5px] font-normal text-[var(--ops-mut)]" style={TNUM}>
          · {post.com} comentários
        </span>
      </div>

      <div className="mt-[18px] text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Legenda publicada</div>
      <div className={cn("relative mt-1.5 whitespace-pre-wrap text-[12px] leading-[1.6] text-[var(--ops-text)]", !legendaAberta && "max-h-[120px] overflow-hidden")}>
        {legendaAberta ? legenda : legenda.slice(0, 380)}
        {!legendaAberta && <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-b from-transparent to-[var(--ops-card)]" />}
      </div>
      <button type="button" onClick={() => setLegendaAberta((v) => !v)} className="mt-1 text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
        {legendaAberta ? "Recolher legenda" : "Ver legenda completa"}
      </button>

      <div className="mt-[18px] flex items-baseline gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">Leads gerados</span>
        <span className="text-[11px] text-[var(--ops-sec)]" style={TNUM}>
          {post.leads}
        </span>
      </div>
      <div className="mt-2 overflow-hidden rounded-[9px] border border-[var(--ops-border)]">
        {leads === null ? (
          <div className="flex flex-col gap-2 p-3">
            {[1, 2, 3].map((i) => (
              <CtSkel key={i} h={26} />
            ))}
          </div>
        ) : post.leads === 0 ? (
          <div className="px-3 py-4 text-center text-[11.5px] text-[var(--ops-mut)]">Nenhum lead atribuído a este post.</div>
        ) : (
          leads.slice(0, Math.min(5, post.leads)).map((l, i) => (
            <div key={l.nome} className={cn("flex items-center gap-2.5 px-3 py-[9px]", i > 0 && "border-t border-[var(--ops-border)]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.pravatar.cc/48?img=${20 + i * 7}`} alt="" className="h-[26px] w-[26px] rounded-full object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-[var(--ops-title)]">{l.nome}</span>
                <span className="block text-[10.5px] text-[var(--ops-mut)]">
                  {l.handle} · {l.data}
                </span>
              </span>
              <CtBadge txt={l.estagio} cor={ESTAGIO_COR[l.estagio] ?? "#6B7280"} />
            </div>
          ))
        )}
      </div>

      <div className="mt-[18px] flex flex-wrap gap-2">
        <a href={instagramUrl(post)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
          <Icon icon={ExternalLink} customSize={13} />
          {post.perfil === "youtube" ? "Abrir no YouTube" : "Abrir no Instagram"}
        </a>
        <Link href={`${ROUTES.ADMIN.COMERCIAL.LEADS}?q=${encodeURIComponent(post.kw)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-[13px] text-[12px] font-semibold text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
          <Icon icon={Briefcase} customSize={13} />
          Ver leads no CRM
        </Link>
      </div>
    </div>
  )
}

export function PostDrawer({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const desktop = useMediaQuery("(min-width: 1024px)")
  if (!post) return null
  if (desktop) {
    return (
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[var(--ops-border)] bg-[var(--ops-card)]" aria-label="Detalhe do post">
        <DrawerBody post={post} onClose={onClose} />
      </aside>
    )
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[360px] max-w-full overflow-y-auto border-[var(--ops-border)] bg-[var(--ops-card)] p-0">
        <SheetTitle className="sr-only">Detalhe do post</SheetTitle>
        <DrawerBody post={post} onClose={onClose} />
      </SheetContent>
    </Sheet>
  )
}
