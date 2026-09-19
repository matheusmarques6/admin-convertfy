"use client"

/**
 * A lista de formulários (handoff Design System 5, tela 1): KPIs da
 * janela em cima, a tabela em card embaixo.
 *
 * O que ela NÃO faz é inventar número. Visita por período só existe no
 * conversacional (o clássico tem o contador de vida inteira), então a
 * coluna e o KPI dizem "—" com o motivo em vez de 0 — a régua vive em
 * `lib/forms/lista.ts`, com teste. Delta sem mês anterior também é "—".
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR, { mutate as globalMutate } from "swr"
import { AlertTriangle, FileText, MessagesSquare, MoreHorizontal, Plus, Search } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { ROUTES } from "@/lib/routes"
import { buildCrmFormUrl } from "@/lib/utils/form-url"
import {
  filtrarLista,
  kpisDaLista,
  statusDaLinha,
  visitasMedidas,
  conversao,
  type FiltroDaLista,
  type LinhaDaLista,
} from "@/lib/forms/lista"
import { NovoFormularioDialog } from "./novo-formulario-dialog"

interface ListaResposta {
  forms: LinhaDaLista[]
  resumo_disponivel: boolean
  dias: number
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.error) throw new Error(json?.error?.message ?? "Falha ao carregar os formulários.")
  return json as ListaResposta
}

const fmt = (n: number) => n.toLocaleString("pt-BR")
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")}%`)

export function FormsLista() {
  const [novoAberto, setNovoAberto] = useState(false)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<FiltroDaLista>("todos")
  const { data, isLoading, error, mutate } = useSWR<ListaResposta>("/api/crm/forms?scope=sales", fetcher)

  const linhas = useMemo(() => (data?.forms ?? []) as LinhaDaLista[], [data])
  const visiveis = useMemo(() => filtrarLista(linhas, busca, filtro), [linhas, busca, filtro])
  const kpis = useMemo(() => kpisDaLista(linhas), [linhas])
  const dias = data?.dias ?? 30

  return (
    <CrmPageShell
      title="Formulários"
      subtitle="Páginas e formulários embedáveis que criam leads e deals direto no pipeline."
      actions={
        <button
          type="button"
          onClick={() => setNovoAberto(true)}
          className="crm-button-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 13px", borderRadius: 8 }}
        >
          <Plus className="h-[15px] w-[15px]" />
          Novo formulário
        </button>
      }
    >
      <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-5 md:px-8 md:pt-[26px]">
        {isLoading ? (
          <PageSkeleton variant="list" showHeader={false} className="px-0 py-0" />
        ) : error ? (
          <div
            className="rounded-[10px] border px-4 py-3 text-[12.5px]"
            style={{ borderColor: "var(--crm-neg-border)", background: "var(--crm-neg-bg)", color: "var(--crm-neg)" }}
          >
            {error instanceof Error ? error.message : "Falha ao carregar os formulários."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                titulo={`Visitas · ${dias} dias`}
                valor={kpis.visitas === null ? "—" : fmt(kpis.visitas)}
                sub={
                  kpis.visitas === null
                    ? "só o formato conversacional registra visita por período"
                    : deltaTexto(kpis.visitasDelta, `em ${kpis.formsComVisita} ${kpis.formsComVisita === 1 ? "formulário" : "formulários"} que medem`)
                }
                tom={tomDoDelta(kpis.visitasDelta)}
              />
              <Kpi
                titulo={`Envios · ${dias} dias`}
                valor={fmt(kpis.envios)}
                sub={deltaTexto(kpis.enviosDelta, "sem base no período anterior")}
                tom={tomDoDelta(kpis.enviosDelta)}
              />
              <Kpi
                titulo="Conversão média"
                valor={pct(kpis.conversao)}
                sub={kpis.conversao === null ? "precisa de visita medida" : "envios ÷ visitas de quem mede"}
                tom="neut"
              />
              <Kpi
                titulo="Deals criados"
                valor={fmt(kpis.deals)}
                sub={
                  kpis.semPipeline > 0
                    ? `${kpis.semPipeline} ${kpis.semPipeline === 1 ? "formulário no ar sem pipeline" : "formulários no ar sem pipeline"}`
                    : deltaTexto(kpis.dealsDelta, "sem base no período anterior")
                }
                tom={kpis.semPipeline > 0 ? "warn" : tomDoDelta(kpis.dealsDelta)}
              />
            </div>

            {data && !data.resumo_disponivel && (
              <div
                className="mt-3 flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[12px]"
                style={{ borderColor: "var(--crm-warn-border)", background: "var(--crm-warn-bg)", color: "var(--crm-warn)" }}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                O resumo do período não respondeu — os números da janela estão indisponíveis, não zerados.
              </div>
            )}

            <div
              className="mt-[18px] overflow-hidden rounded-[12px] border"
              style={{ background: "var(--crm-gray-0)", borderColor: "var(--crm-border)" }}
            >
              <div className="flex flex-wrap items-center gap-[10px] px-[18px] py-3">
                <label
                  className="flex h-8 w-full items-center gap-2 rounded-[8px] border px-[10px] sm:w-[260px]"
                  style={{ borderColor: "var(--crm-border)", background: "var(--crm-gray-0)" }}
                >
                  <Search className="h-[14px] w-[14px] shrink-0" style={{ color: "var(--crm-gray-400)" }} />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar formulário"
                    aria-label="Buscar formulário"
                    className="w-full bg-transparent text-[12.5px] outline-none"
                    style={{ color: "var(--crm-gray-900)" }}
                  />
                </label>
                <Segmento
                  valor={filtro}
                  onChange={setFiltro}
                  opcoes={[
                    { v: "todos", l: "Todos" },
                    { v: "ar", l: "No ar" },
                    { v: "rascunhos", l: "Rascunhos" },
                  ]}
                />
                <span className="ml-auto text-[11.5px]" style={{ color: "var(--crm-gray-400)" }}>
                  {visiveis.length} de {linhas.filter((l) => l.status !== "archived").length}
                </span>
              </div>

              <div
                className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_110px_110px_90px_170px_36px] gap-[14px] px-[18px] pb-2 pt-[6px] text-[10.5px] font-bold uppercase tracking-[0.06em] md:grid"
                style={{ color: "var(--crm-gray-400)" }}
              >
                <span>Formulário</span>
                <span>Destino no CRM</span>
                <span>Visitas</span>
                <span>Envios</span>
                <span>Conv.</span>
                <span>Status</span>
                <span />
              </div>

              {visiveis.map((f) => (
                <Linha key={f.id} f={f} dias={dias} onChange={() => void mutate()} />
              ))}

              {visiveis.length === 0 && (
                <div
                  className="border-t px-[18px] py-8 text-center text-[12.5px]"
                  style={{ borderColor: "var(--crm-border)", color: "var(--crm-gray-400)" }}
                >
                  {linhas.length === 0 ? (
                    <>
                      Nenhum formulário ainda.{" "}
                      <button type="button" className="font-semibold underline" style={{ color: "var(--crm-brand)" }} onClick={() => setNovoAberto(true)}>
                        Criar o primeiro
                      </button>
                    </>
                  ) : (
                    "Nenhum formulário com esse filtro."
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <NovoFormularioDialog
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        onCreated={(id) => {
          void globalMutate("/api/crm/forms?scope=sales")
          window.location.href = ROUTES.ADMIN.COMERCIAL.FORM_DETAIL(id)
        }}
      />
    </CrmPageShell>
  )
}

function deltaTexto(delta: number | null, semBase: string): string {
  if (delta === null) return semBase
  return `${delta > 0 ? "+" : ""}${delta}% vs período anterior`
}

function tomDoDelta(delta: number | null): "pos" | "neg" | "neut" | "warn" {
  if (delta === null) return "neut"
  return delta > 0 ? "pos" : delta < 0 ? "neg" : "neut"
}

function Kpi({ titulo, valor, sub, tom }: { titulo: string; valor: string; sub: string; tom: "pos" | "neg" | "neut" | "warn" }) {
  const cor =
    tom === "pos" ? "var(--crm-pos)" : tom === "neg" ? "var(--crm-neg)" : tom === "warn" ? "var(--crm-warn)" : "var(--crm-gray-400)"
  return (
    <div className="rounded-[10px] border px-4 py-[14px]" style={{ background: "var(--crm-gray-0)", borderColor: "var(--crm-border)" }}>
      <div className="text-[11px] font-semibold" style={{ color: "var(--crm-gray-500)" }}>
        {titulo}
      </div>
      <div className="crm-tnum mt-[6px] text-[24px] font-semibold tracking-[-0.02em]" style={{ color: "var(--crm-gray-900)" }}>
        {valor}
      </div>
      <div className="mt-[3px] truncate text-[11px]" style={{ color: cor }} title={sub}>
        {sub}
      </div>
    </div>
  )
}

function Segmento<T extends string>({ valor, onChange, opcoes }: { valor: T; onChange: (v: T) => void; opcoes: Array<{ v: T; l: string }> }) {
  return (
    <div className="inline-flex gap-[2px] rounded-[8px] p-[2px]" style={{ background: "var(--crm-gray-100)" }} role="tablist">
      {opcoes.map((o) => {
        const on = o.v === valor
        return (
          <button
            key={o.v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.v)}
            className="h-7 rounded-[6px] px-[11px] text-[12px]"
            style={{
              fontWeight: on ? 600 : 500,
              background: on ? "var(--crm-gray-0)" : "transparent",
              color: on ? "var(--crm-gray-900)" : "var(--crm-gray-500)",
              boxShadow: on ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

function Linha({ f, dias, onChange }: { f: LinhaDaLista; dias: number; onChange: () => void }) {
  const st = statusDaLinha(f)
  const visitas = visitasMedidas(f.resumo)
  const envios = f.resumo?.envios ?? null
  const conv = envios === null ? null : conversao(envios, visitas)
  const conversacional = f.display_mode === "conversational"
  const telas = f.telas
  const href = ROUTES.ADMIN.COMERCIAL.FORM_DETAIL(f.id)

  const tomCor = {
    pos: { c: "var(--crm-pos)", bg: "var(--crm-pos-bg)", br: "var(--crm-pos-border)" },
    warn: { c: "var(--crm-warn)", bg: "var(--crm-warn-bg)", br: "var(--crm-warn-border)" },
    neut: { c: "var(--crm-gray-500)", bg: "var(--crm-gray-50)", br: "var(--crm-border)" },
  }[st.tom]

  return (
    <div
      className="group grid grid-cols-[minmax(0,1fr)_36px] items-center gap-x-[14px] gap-y-2 border-t px-[18px] py-[13px] transition-colors hover:bg-[var(--crm-gray-50)] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_110px_110px_90px_170px_36px]"
      style={{ borderColor: "var(--crm-border)" }}
    >
      <Link href={href} className="flex min-w-0 items-center gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{
            background: conversacional ? "rgba(78,98,216,0.12)" : "var(--crm-gray-100)",
            color: conversacional ? "var(--crm-brand)" : "var(--crm-gray-500)",
          }}
          aria-hidden
        >
          {conversacional ? <MessagesSquare className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--crm-gray-900)" }}>
            {f.name}
          </span>
          <span className="mt-[2px] flex flex-wrap items-center gap-[6px] text-[11px]" style={{ color: "var(--crm-gray-400)" }}>
            <span style={{ fontFamily: "var(--crm-font-mono)" }}>/forms/{f.slug}</span>
            <span>·</span>
            <span>{conversacional ? "Conversacional" : "Página única"}</span>
            <span>·</span>
            <span className="crm-tnum">
              {telas.n} {telas.unidade === "campo" ? (telas.n === 1 ? "campo" : "campos") : telas.n === 1 ? "tela" : "telas"}
            </span>
            {f.versao !== null && f.status === "published" && (
              <>
                <span>·</span>
                <span className="crm-tnum" title="Versão no ar">
                  v{f.versao}
                </span>
              </>
            )}
          </span>
        </span>
      </Link>

      <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-auto">
        {f.pipeline ? (
          <span className="flex items-center gap-[6px] text-[12px]" style={{ color: "var(--crm-gray-700)" }}>
            <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: f.pipeline.color ?? "var(--crm-brand)" }} aria-hidden />
            <span className="truncate">
              {f.pipeline.name}
              {f.stage && <span style={{ color: "var(--crm-gray-400)" }}> → {f.stage.name}</span>}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-[5px] text-[11.5px]" style={{ color: "var(--crm-warn)" }}>
            <AlertTriangle className="h-3 w-3" /> Sem destino — leads não viram deals
          </span>
        )}
      </div>

      {/* No celular os quatro viram uma linha só; em md+ o `contents`
          dissolve o wrapper e cada um ocupa a sua coluna da tabela. */}
      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
        <Numero
          valor={visitas === null ? null : fmt(visitas)}
          rotulo="visitas"
          title={
            visitas === null
              ? `Este formato não registra visita por período. Total de vida inteira: ${fmt(f.views_count)}.`
              : `Sessões nos últimos ${dias} dias`
          }
        />
        <Numero valor={envios === null ? null : fmt(envios)} rotulo="envios" title={`Envios nos últimos ${dias} dias · ${fmt(f.submissions_count)} no total`} />
        <div
          className="crm-tnum text-[13px] font-semibold"
          style={{ color: conv !== null && conv >= 12 ? "var(--crm-pos)" : conv === null ? "var(--crm-gray-400)" : "var(--crm-gray-900)" }}
          title={conv === null ? "Sem visita medida não há conversão" : "Envios ÷ visitas"}
        >
          {pct(conv)}
          <span className="ml-[5px] text-[10.5px] font-medium md:hidden" style={{ color: "var(--crm-gray-400)" }}>
            conv.
          </span>
        </div>
        <div>
          <span
            className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-[9px] text-[11px] font-semibold"
            style={{ color: tomCor.c, background: tomCor.bg, borderColor: tomCor.br }}
          >
            {st.label}
          </span>
        </div>
      </div>
      <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
        <MenuDaLinha f={f} onChange={onChange} />
      </div>
    </div>
  )
}

function Numero({ valor, rotulo, title }: { valor: string | null; rotulo: string; title: string }) {
  return (
    <div className="crm-tnum text-[13px] font-semibold" style={{ color: valor === null ? "var(--crm-gray-400)" : "var(--crm-gray-900)" }} title={title}>
      {valor ?? "—"}
      {valor !== null && (
        <span className="ml-[5px] text-[10.5px] font-medium" style={{ color: "var(--crm-gray-400)" }}>
          {rotulo}
        </span>
      )}
    </div>
  )
}

function MenuDaLinha({ f, onChange }: { f: LinhaDaLista; onChange: () => void }) {
  const publicUrl = buildCrmFormUrl(f.slug)

  const patch = async (body: Record<string, unknown>) => {
    await fetch(`/api/crm/forms/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    onChange()
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Mais ações de ${f.name}`}
          className="cf-focusable inline-flex h-7 w-7 items-center justify-center rounded-[7px] opacity-50 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          style={{ color: "var(--crm-gray-400)" }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[200px] rounded-[8px] border p-1"
          style={{ background: "var(--crm-gray-0)", borderColor: "var(--crm-border)", boxShadow: "0 14px 36px rgba(0,0,0,0.18)" }}
        >
          <Item onSelect={() => window.open(publicUrl, "_blank", "noopener,noreferrer")} disabled={f.status !== "published"}>
            Abrir no ar ↗
          </Item>
          <Item onSelect={() => void navigator.clipboard.writeText(publicUrl)}>Copiar link</Item>
          <Item onSelect={() => void patch({ status: f.status === "published" ? "draft" : "published" })}>
            {f.status === "published" ? "Tirar do ar" : "Publicar"}
          </Item>
          <DropdownMenu.Separator className="my-1 h-px" style={{ background: "var(--crm-gray-100)" }} />
          <Item
            danger
            onSelect={() => {
              if (window.confirm(`Arquivar "${f.name}"? Ele sai da lista e do ar; as respostas ficam.`)) {
                void fetch(`/api/crm/forms/${f.id}`, { method: "DELETE" }).then(onChange)
              }
            }}
          >
            Arquivar
          </Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Item({ children, onSelect, danger, disabled }: { children: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className="flex h-8 cursor-pointer items-center rounded-[6px] px-[10px] text-[12.5px] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--crm-gray-50)]"
      style={{ color: danger ? "var(--crm-neg)" : "var(--crm-gray-700)" }}
    >
      {children}
    </DropdownMenu.Item>
  )
}
