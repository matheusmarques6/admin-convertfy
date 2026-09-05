"use client"

/**
 * Rail de coleções: árvore com contagem recursiva, faísca da base da
 * ConvertIA e destino de arrastar.
 *
 * A contagem que aparece é a RECURSIVA (a pasta mais o que está dentro
 * dela) — vem calculada do servidor. Contar no cliente exigiria carregar a
 * biblioteca inteira só para somar.
 */

import { useCallback, useState } from "react"
import { ChevronRight, FolderPlus, Loader2, Sparkles, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import type { Colecao } from "@/lib/transcricoes/types"
import { TNUM, TrBtn, inputCls } from "./ui"

export interface SelecaoColecao {
  /** null = todas · "sem-colecao" = a reservada · uuid = a pasta. */
  id: string | null
}

interface Props {
  raizes: Colecao[]
  totalGeral: number
  semColecao: number
  selecionada: string | null
  onSelecionar: (id: string | null) => void
  onCriar: (nome: string, paiId: string | null) => Promise<void>
  onFaisca: (id: string, ligar: boolean) => Promise<void>
  onExcluir: (id: string) => Promise<void>
  /** Soltar cards numa coleção. */
  onSoltar: (colecaoId: string | null) => void
  arrastando: boolean
  podeSemear: boolean
  onSemear: () => Promise<void>
}

export function ArvoreColecoes({
  raizes,
  totalGeral,
  semColecao,
  selecionada,
  onSelecionar,
  onCriar,
  onFaisca,
  onExcluir,
  onSoltar,
  arrastando,
  podeSemear,
  onSemear,
}: Props) {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(raizes.map((r) => r.id)))
  const [criandoEm, setCriandoEm] = useState<string | null | undefined>(undefined)
  const [nome, setNome] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [sobre, setSobre] = useState<string | null | undefined>(undefined)

  const alternar = useCallback((id: string) => {
    setAbertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const confirmarCriacao = async () => {
    const limpo = nome.trim()
    if (!limpo) return
    setSalvando(true)
    try {
      await onCriar(limpo, criandoEm ?? null)
      setNome("")
      setCriandoEm(undefined)
    } finally {
      setSalvando(false)
    }
  }

  const Linha = ({ c, nivel }: { c: Colecao; nivel: number }) => {
    const temFilhas = c.filhas.length > 0
    const aberta = abertas.has(c.id)
    const ativa = selecionada === c.id
    const alvo = sobre === c.id
    return (
      <>
        <div
          role="treeitem"
          aria-selected={ativa}
          aria-expanded={temFilhas ? aberta : undefined}
          tabIndex={0}
          onClick={() => onSelecionar(c.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelecionar(c.id)
            }
          }}
          onDragOver={(e) => {
            if (!arrastando) return
            e.preventDefault()
            setSobre(c.id)
          }}
          onDragLeave={() => setSobre((s) => (s === c.id ? undefined : s))}
          onDrop={(e) => {
            e.preventDefault()
            setSobre(undefined)
            onSoltar(c.id)
          }}
          className={cn(
            "group flex h-[30px] cursor-pointer items-center gap-1 rounded-md pr-1.5 text-[12.5px] transition-colors",
            ativa ? "font-semibold text-[var(--ops-title)]" : "text-[var(--ops-text)]",
            !ativa && "hover:bg-[var(--ops-hover)]",
            alvo && "ring-1 ring-[var(--ops-accent)] ring-offset-0",
          )}
          style={{ paddingLeft: 8 + nivel * 14 }}
        >
          {temFilhas ? (
            <button
              type="button"
              aria-label={aberta ? "Recolher" : "Expandir"}
              onClick={(e) => {
                e.stopPropagation()
                alternar(c.id)
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ops-mut)]"
            >
              <Icon icon={ChevronRight} customSize={11} className={cn("transition-transform", aberta && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span className="min-w-0 flex-1 truncate" title={c.nome}>
            {c.nome}
          </span>

          {c.indexacaoPendente > 0 ? (
            <span title={`${c.indexacaoPendente} indexando para a ConvertIA`} className="shrink-0 text-[var(--ops-accent)]">
              <Icon icon={Loader2} customSize={11} className="animate-spin" />
            </span>
          ) : (
            <button
              type="button"
              title={
                c.naBaseDeConhecimento
                  ? "Na base da ConvertIA — clique para tirar"
                  : "Fora da base da ConvertIA — clique para incluir"
              }
              aria-label={c.naBaseDeConhecimento ? "Tirar da base da ConvertIA" : "Incluir na base da ConvertIA"}
              aria-pressed={c.naBaseDeConhecimento}
              onClick={(e) => {
                e.stopPropagation()
                void onFaisca(c.id, !c.naBaseDeConhecimento)
              }}
              className={cn(
                "shrink-0 transition-opacity",
                c.naBaseDeConhecimento
                  ? "text-[var(--ops-accent)]"
                  : "text-[var(--ops-mut)] opacity-0 group-hover:opacity-100",
              )}
            >
              <Icon icon={Sparkles} customSize={11} />
            </button>
          )}

          <span className="w-5 shrink-0 text-right text-[11px] text-[var(--ops-mut)]" style={TNUM}>
            {c.totalRecursivo}
          </span>

          <span className="hidden shrink-0 gap-0.5 group-hover:flex">
            <button
              type="button"
              aria-label={`Nova subcoleção em ${c.nome}`}
              title="Nova subcoleção"
              onClick={(e) => {
                e.stopPropagation()
                setCriandoEm(c.id)
                setAbertas((s) => new Set(s).add(c.id))
              }}
              className="text-[var(--ops-mut)] hover:text-[var(--ops-title)]"
            >
              <Icon icon={FolderPlus} customSize={11} />
            </button>
            {!c.reservada && (
              <button
                type="button"
                aria-label={`Excluir ${c.nome}`}
                title="Excluir coleção (o conteúdo vai para Não organizadas)"
                onClick={(e) => {
                  e.stopPropagation()
                  void onExcluir(c.id)
                }}
                className="text-[var(--ops-mut)] hover:text-[var(--ops-neg)]"
              >
                <Icon icon={Trash2} customSize={11} />
              </button>
            )}
          </span>
        </div>

        {criandoEm === c.id && (
          <CampoNovo
            nivel={nivel + 1}
            nome={nome}
            setNome={setNome}
            salvando={salvando}
            onConfirmar={confirmarCriacao}
            onCancelar={() => {
              setCriandoEm(undefined)
              setNome("")
            }}
          />
        )}

        {temFilhas && aberta && c.filhas.map((f) => <Linha key={f.id} c={f} nivel={nivel + 1} />)}
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">Coleções</span>
        <button
          type="button"
          aria-label="Nova coleção"
          title="Nova coleção"
          onClick={() => setCriandoEm(null)}
          className="text-[var(--ops-mut)] transition-colors hover:text-[var(--ops-title)]"
        >
          <Icon icon={FolderPlus} customSize={13} />
        </button>
      </div>

      <div role="tree" aria-label="Coleções" className="min-h-0 flex-1 overflow-y-auto">
        <div
          role="treeitem"
          aria-selected={selecionada === null}
          tabIndex={0}
          onClick={() => onSelecionar(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelecionar(null)
            }
          }}
          className={cn(
            "flex h-[30px] cursor-pointer items-center gap-1 rounded-md pl-3 pr-1.5 text-[12.5px] transition-colors",
            selecionada === null ? "font-semibold text-[var(--ops-title)]" : "text-[var(--ops-text)] hover:bg-[var(--ops-hover)]",
          )}
        >
          <span className="min-w-0 flex-1 truncate">Todas</span>
          <span className="w-5 text-right text-[11px] text-[var(--ops-mut)]" style={TNUM}>
            {totalGeral}
          </span>
        </div>

        <div
          role="treeitem"
          aria-selected={selecionada === "sem-colecao"}
          tabIndex={0}
          onClick={() => onSelecionar("sem-colecao")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelecionar("sem-colecao")
            }
          }}
          onDragOver={(e) => {
            if (!arrastando) return
            e.preventDefault()
            setSobre("sem-colecao")
          }}
          onDragLeave={() => setSobre((s) => (s === "sem-colecao" ? undefined : s))}
          onDrop={(e) => {
            e.preventDefault()
            setSobre(undefined)
            onSoltar(null)
          }}
          className={cn(
            "flex h-[30px] cursor-pointer items-center gap-1 rounded-md pl-[22px] pr-1.5 text-[12.5px] transition-colors",
            selecionada === "sem-colecao"
              ? "font-semibold text-[var(--ops-title)]"
              : "text-[var(--ops-text)] hover:bg-[var(--ops-hover)]",
            sobre === "sem-colecao" && "ring-1 ring-[var(--ops-accent)]",
          )}
        >
          <span className="min-w-0 flex-1 truncate">Não organizadas</span>
          <span className="w-5 text-right text-[11px] text-[var(--ops-mut)]" style={TNUM}>
            {semColecao}
          </span>
        </div>

        {criandoEm === null && (
          <CampoNovo
            nivel={1}
            nome={nome}
            setNome={setNome}
            salvando={salvando}
            onConfirmar={confirmarCriacao}
            onCancelar={() => {
              setCriandoEm(undefined)
              setNome("")
            }}
          />
        )}

        {raizes.filter((r) => !r.reservada).map((c) => (
          <Linha key={c.id} c={c} nivel={0} />
        ))}
      </div>

      <div className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] p-3 text-[11px] leading-relaxed text-[var(--ops-sec)]">
        Arraste um card para uma coleção para reorganizar. O ícone de faísca marca as coleções que a ConvertIA usa como base.
        {podeSemear && (
          <div className="mt-2.5">
            <TrBtn onClick={() => void onSemear()} className="h-7 w-full">
              Usar a estrutura sugerida
            </TrBtn>
          </div>
        )}
      </div>
    </div>
  )
}

function CampoNovo({
  nivel,
  nome,
  setNome,
  salvando,
  onConfirmar,
  onCancelar,
}: {
  nivel: number
  nome: string
  setNome: (v: string) => void
  salvando: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="py-1" style={{ paddingLeft: 8 + nivel * 14, paddingRight: 6 }}>
      <input
        autoFocus
        value={nome}
        disabled={salvando}
        onChange={(e) => setNome(e.target.value)}
        onBlur={onCancelar}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirmar()
          if (e.key === "Escape") onCancelar()
        }}
        placeholder="Nome da coleção"
        aria-label="Nome da nova coleção"
        className={cn(inputCls, "h-7 text-[12px]")}
      />
    </div>
  )
}
