"use client"

/**
 * A camada rápida do Design (handoff §6): temas prontos, cor de
 * destaque e texto em swatches, presets de gradiente, formato dos
 * botões e a fonte. Fica no TOPO da aba; os controles finos que já
 * existiam (card, inputs, tamanhos) continuam embaixo — é o mesmo
 * `theme`, escrito por dois níveis de zoom.
 *
 * A régua mora em `lib/forms/temas.ts`; aqui só se desenha.
 */

import { Check } from "lucide-react"
import type { FormTheme } from "./form-theme"
import {
  ACENTOS,
  aplicarFormato,
  aplicarGradiente,
  aplicarTema,
  FONTES,
  formatoDoBotao,
  GRADIENTES,
  temaAtual,
  TEMAS,
  type FormatoDoBotao,
} from "@/lib/forms/temas"

export function DesignRapido({
  theme,
  setTheme,
  modo,
}: {
  theme: FormTheme
  setTheme: (fn: FormTheme | ((t: FormTheme) => FormTheme)) => void
  modo: "classic" | "conversational"
}) {
  const atual = temaAtual(theme)
  const formato = formatoDoBotao(theme)
  const escuro = theme.mode === "dark"
  const textoPadrao = escuro ? "#F1F5F9" : "#0F172A"

  return (
    <div className="space-y-4">
      <Secao titulo="Tema" selo={atual ? undefined : "Personalizado"}>
        <div className="grid grid-cols-3 gap-2">
          {TEMAS.map((t) => {
            const ativo = atual === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme((th) => aplicarTema(th, t.id))}
                aria-pressed={ativo}
                className={
                  "overflow-hidden rounded-[8px] border text-left transition-shadow " +
                  (ativo
                    ? "border-[#4E62D8] shadow-[0_0_0_2px_rgba(78,98,216,0.25)]"
                    : "border-black/[0.10] hover:border-black/25 dark:border-white/[0.12] dark:hover:border-white/30")
                }
              >
                <span className="block h-[46px] p-2" style={{ background: t.bg, fontFamily: t.fonte }}>
                  <span className="block h-[5px] w-3/4 rounded" style={{ background: t.texto }} />
                  <span className="mt-1 block h-[4px] w-1/2 rounded opacity-60" style={{ background: t.texto }} />
                  <span className="mt-2 block h-[7px] w-[38%] rounded-[3px]" style={{ background: t.destaque }} />
                </span>
                <span className="block px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-white/75">
                  {t.nome}
                </span>
              </button>
            )
          })}
        </div>
      </Secao>

      <Secao titulo="Cor de destaque">
        <Swatches
          cores={ACENTOS}
          valor={theme.primaryColor ?? "#2563EB"}
          onChange={(c) => setTheme((t) => ({ ...t, primaryColor: c }))}
        />
      </Secao>

      <Secao titulo="Cor do texto">
        <Swatches
          cores={["#0F172A", "#111827", "#1F2937", "#374151", "#2B241B", "#F3F6FC", "#F1F5F9", "#EAF4EE", "#FFFFFF"]}
          valor={theme.textColor ?? textoPadrao}
          onChange={(c) => setTheme((t) => ({ ...t, textColor: c }))}
        />
      </Secao>

      <Secao titulo="Fundo em gradiente" apoio="Um clique aplica; a direção e as cores ficam editáveis abaixo, em Fundo.">
        <div className="flex flex-wrap gap-1.5">
          {GRADIENTES.map(([a, b]) => {
            const ativo =
              theme.bgGradient?.from?.toLowerCase() === a.toLowerCase() &&
              theme.bgGradient?.to?.toLowerCase() === b.toLowerCase()
            return (
              <button
                key={a + b}
                type="button"
                onClick={() => setTheme((t) => aplicarGradiente(t, [a, b]))}
                aria-pressed={ativo}
                aria-label={`Gradiente ${a} para ${b}`}
                className={
                  "h-7 w-10 rounded-[6px] border transition-shadow " +
                  (ativo
                    ? "border-[#4E62D8] shadow-[0_0_0_2px_rgba(78,98,216,0.25)]"
                    : "border-black/[0.10] dark:border-white/[0.14]")
                }
                style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
              />
            )
          })}
          {theme.bgGradient && (
            <button
              type="button"
              onClick={() => setTheme((t) => ({ ...t, bgGradient: null }))}
              className="h-7 rounded-[6px] border border-black/[0.10] px-2 text-[10.5px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/[0.14] dark:text-white/65 dark:hover:bg-white/[0.06]"
            >
              Cor sólida
            </button>
          )}
        </div>
      </Secao>

      <Secao titulo="Botões e campos">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-0.5 rounded-[6px] bg-slate-100 p-0.5 dark:bg-white/[0.04]">
            {(
              [
                { key: "reto", label: "Reto" },
                { key: "arredondado", label: "Arredondado" },
                { key: "pill", label: "Pill" },
              ] as Array<{ key: FormatoDoBotao; label: string }>
            ).map((o) => {
              const ativo = formato === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setTheme((t) => aplicarFormato(t, o.key))}
                  aria-pressed={ativo}
                  className={
                    "h-7 px-3 text-[11px] font-medium transition-colors " +
                    (o.key === "reto" ? "rounded-[3px] " : o.key === "pill" ? "rounded-full " : "rounded-[6px] ") +
                    (ativo
                      ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1A1D27] dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
                  }
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {modo === "classic" && (
            <div className="inline-flex gap-0.5 rounded-[6px] bg-slate-100 p-0.5 dark:bg-white/[0.04]">
              {(
                [
                  { key: "card", label: "Card" },
                  { key: "sem", label: "Sem card" },
                ] as const
              ).map((o) => {
                const semCard = theme.cardBgColor === "transparent"
                const ativo = o.key === "sem" ? semCard : !semCard
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() =>
                      setTheme((t) =>
                        o.key === "sem"
                          ? { ...t, cardBgColor: "transparent", cardGradient: null, cardBorderColor: "transparent", cardShadow: "none" }
                          : { ...t, cardBgColor: undefined, cardBorderColor: undefined, cardShadow: undefined },
                      )
                    }
                    aria-pressed={ativo}
                    className={
                      "h-7 rounded-[4px] px-3 text-[11px] font-medium transition-colors " +
                      (ativo
                        ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1A1D27] dark:text-white"
                        : "text-slate-600 hover:text-slate-900 dark:text-white/55 dark:hover:text-white")
                    }
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {formato === null && (
          <p className="mt-1 text-[10px] text-slate-500 dark:text-white/45">
            Raio próprio ({theme.buttonRadius ?? theme.borderRadius ?? 8}px) — ajustado em Botão, abaixo.
          </p>
        )}
      </Secao>

      <Secao titulo="Tipografia">
        <select
          value={FONTES.some((f) => f.valor === theme.fontFamily) ? theme.fontFamily : theme.fontFamily ? "__outra" : "Inter"}
          onChange={(e) => {
            if (e.target.value === "__outra") return
            setTheme((t) => ({ ...t, fontFamily: e.target.value }))
          }}
          className="crm-input w-full text-[12px]"
        >
          {FONTES.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
          {theme.fontFamily && !FONTES.some((f) => f.valor === theme.fontFamily) && (
            <option value="__outra">{theme.fontFamily} (própria)</option>
          )}
        </select>
        <div
          className="mt-2 rounded-[6px] px-3 py-2"
          style={{
            background: theme.backgroundColor ?? (escuro ? "#0B0B14" : "#F8FAFC"),
            color: theme.textColor ?? textoPadrao,
            fontFamily: theme.fontFamily ?? "Inter",
          }}
        >
          <span className="block text-[16px] font-semibold leading-tight">Qual o faturamento da loja?</span>
          <span className="block text-[11.5px] opacity-70">Escolha a faixa mais próxima.</span>
        </div>
      </Secao>

      <Secao titulo="Rodapé">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[11.5px] text-slate-700 dark:text-white/75">
          Mostrar &ldquo;Feito com Convertfy&rdquo;
          <button
            type="button"
            role="switch"
            aria-checked={!theme.hidePoweredBy}
            onClick={() => setTheme((t) => ({ ...t, hidePoweredBy: !t.hidePoweredBy }))}
            className={
              "relative h-[18px] w-[30px] shrink-0 rounded-full p-0 transition-colors " +
              (!theme.hidePoweredBy ? "bg-[#4E62D8]" : "bg-slate-300 dark:bg-white/20")
            }
          >
            <span
              className={
                "absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform " +
                (!theme.hidePoweredBy ? "translate-x-[14px]" : "translate-x-[2px]")
              }
            />
          </button>
        </label>
      </Secao>
    </div>
  )
}

function Secao({
  titulo,
  selo,
  apoio,
  children,
}: {
  titulo: string
  selo?: string
  apoio?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-white/45">
          {titulo}
        </span>
        {selo && (
          <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
            {selo}
          </span>
        )}
      </div>
      {children}
      {apoio && <p className="mt-1 text-[10px] text-slate-500 dark:text-white/45">{apoio}</p>}
    </div>
  )
}

function Swatches({
  cores,
  valor,
  onChange,
}: {
  cores: readonly string[]
  valor: string
  onChange: (c: string) => void
}) {
  const v = valor.toLowerCase()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cores.map((c) => {
        const ativo = c.toLowerCase() === v
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={ativo}
            aria-label={c}
            title={c}
            className={
              "flex h-[22px] w-[22px] items-center justify-center rounded-full border transition-shadow " +
              (ativo
                ? "border-[#4E62D8] shadow-[0_0_0_2px_rgba(78,98,216,0.35)]"
                : "border-black/[0.12] dark:border-white/[0.16]")
            }
            style={{ background: c }}
          >
            {ativo && (
              <Check
                className="h-3 w-3"
                strokeWidth={3}
                style={{ color: c.toLowerCase() === "#ffffff" || c.toLowerCase() === "#f3f6fc" || c.toLowerCase() === "#f1f5f9" || c.toLowerCase() === "#eaf4ee" ? "#111827" : "#fff" }}
              />
            )}
          </button>
        )
      })}
      <label className="relative ml-1 inline-flex h-[22px] items-center gap-1 rounded-[5px] border border-black/[0.10] px-1.5 font-mono text-[10.5px] text-slate-600 dark:border-white/[0.14] dark:text-white/65">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Escolher cor"
          className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Cor em hexadecimal"
          className="w-[62px] border-0 bg-transparent p-0 font-mono text-[10.5px] outline-none"
        />
      </label>
    </div>
  )
}
