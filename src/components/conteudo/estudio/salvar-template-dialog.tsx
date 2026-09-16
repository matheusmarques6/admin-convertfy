"use client"

/**
 * "Salvar como template" — o caminho rápido para cadastrar a FORMA de um
 * carrossel que já está pronto no Estúdio.
 *
 * Até aqui só existia o caminho pela inspiração: exportar os slides em
 * imagem, subir de volta e pagar uma chamada de visão para um modelo
 * adivinhar a sequência que o editor conhece campo a campo. Este diálogo
 * lê o documento (`estruturaDoDocumento`), então não chama IA nenhuma e
 * não sobe arquivo.
 *
 * Duas decisões visíveis na tela:
 *
 * - **O nome é do TEMPLATE, não da peça.** Ele vem preenchido com o nome
 *   do carrossel (que costuma ser a headline) e fica editável, com o
 *   lembrete de que é esse texto que reaparece na hora de escolher uma
 *   sequência. Renomear sozinho seria adivinhar a intenção.
 * - **Nome repetido não vira duplicata silenciosa.** Havendo template com
 *   o mesmo nome, o botão passa a ser "Atualizar o existente" — e quem
 *   quer os dois só precisa mudar o nome, que é o que distingue um do
 *   outro na prateleira.
 */

import { useEffect, useMemo, useState } from "react"
import { Check, LayoutTemplate, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { estruturaDoDocumento, resumoDoTemplate, templateComMesmoNome } from "@/lib/conteudo/estrutura-do-documento"
import { FAMILIAS, familiaDe } from "@/lib/conteudo/familias"
import type { Documento, FamiliaVisual, MeuTemplate } from "@/lib/conteudo/types"
import { CtLabel, TNUM, inputCls } from "../ui"

export interface SalvarTemplateEntrada {
  nome: string
  templateId: string
  /**
   * Identidade visual da peça. Vai junto porque é ela que a prévia do
   * template desenha: sem gravá-la, a prateleira mostraria a forma certa na
   * identidade errada — e o clique entregaria uma terceira coisa.
   */
  familia: FamiliaVisual
  estrutura: ReturnType<typeof estruturaDoDocumento>
  /** Template existente com o mesmo nome — o operador escolheu substituir. */
  substituirId?: string
}

interface Props {
  doc: Documento
  meusTemplates: readonly MeuTemplate[]
  onSalvar: (e: SalvarTemplateEntrada) => Promise<void>
  onClose: () => void
}

export function SalvarTemplateDialog({ doc, meusTemplates, onSalvar, onClose }: Props) {
  const [nome, setNome] = useState(doc.nome)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const estrutura = useMemo(() => estruturaDoDocumento(doc), [doc])
  const resumo = useMemo(() => resumoDoTemplate(doc), [doc])
  const conflito = useMemo(() => templateComMesmoNome(nome, meusTemplates), [nome, meusTemplates])
  const familia = familiaDe(doc)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !salvando && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, salvando])

  const pronto = nome.trim().length > 0 && estrutura.length >= 3

  const salvar = async () => {
    if (!pronto || salvando) return
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar({ nome: nome.trim(), templateId: doc.templateId, familia, estrutura, substituirId: conflito?.id })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o template.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-[rgba(9,10,14,0.5)] p-4" role="dialog" aria-modal="true" aria-label="Salvar como template" onClick={() => !salvando && onClose()}>
      <div className="w-full max-w-[460px] rounded-[13px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#0E7490]/15 text-[#0E7490] dark:text-[#67E8F9]">
            <Icon icon={LayoutTemplate} customSize={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-[var(--ops-title)]">Salvar como template</div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--ops-sec)]">A sequência deste carrossel entra em Meus templates. Copy, imagens e cores ficam na peça — o template guarda a forma.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
            <Icon icon={X} customSize={13} />
          </button>
        </div>

        <div className="mt-4">
          <CtLabel>Nome do template</CtLabel>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void salvar()}
            autoFocus
            placeholder="Ex.: Benchmark com número gigante"
            className={cn(inputCls, "h-[40px] bg-[var(--ops-page)] text-[13.5px] font-medium")}
          />
          <div className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">É este nome que aparece na hora de escolher a sequência — descreva a forma, não a pauta.</div>
        </div>

        <div className="mt-3.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5 text-[11.5px] text-[var(--ops-sec)]" style={TNUM}>
          {resumo.frames} {resumo.frames === 1 ? "slide" : "slides"} · {resumo.comFoto} com foto
          {resumo.ocultos > 0 ? ` · ${resumo.ocultos} slide${resumo.ocultos > 1 ? "s" : ""} oculto${resumo.ocultos > 1 ? "s" : ""} fora` : ""}
          <span className="mt-1 block text-[10.5px] text-[var(--ops-mut)]">Identidade {FAMILIAS[familia].nome} — é ela que a prévia do template mostra.</span>
        </div>

        {estrutura.length < 3 && <div className="mt-2.5 text-[11.5px] text-[var(--ops-warn)]">Um template precisa de pelo menos 3 slides visíveis.</div>}

        {conflito && (
          <div className="mt-2.5 rounded-[9px] border border-[var(--ops-warn)]/40 bg-[var(--ops-card)] px-3 py-2.5 text-[11.5px] text-[var(--ops-warn)]">
            Já existe um template chamado &ldquo;{conflito.nome}&rdquo;. Salvar substitui a forma dele; para manter os dois, mude o nome.
          </div>
        )}

        {erro && <div className="mt-2.5 rounded-[9px] border border-[var(--ops-neg)]/40 px-3 py-2.5 text-[11.5px] text-[var(--ops-neg)]">{erro}</div>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={salvando} className="h-9 rounded-[9px] border border-[var(--ops-border)] px-3.5 text-[12.5px] font-medium text-[var(--ops-sec)] hover:bg-[var(--ops-hover)] disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!pronto || salvando}
            className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[#0E7490] px-4 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {salvando ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon icon={Check} customSize={13} />}
            {conflito ? "Atualizar o existente" : "Salvar template"}
          </button>
        </div>
      </div>
    </div>
  )
}
