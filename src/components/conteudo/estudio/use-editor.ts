"use client"

/**
 * Estado do editor: reducer único (undo/redo + prévia) + autosave com
 * debounce em `lib/conteudo/data.ts` ("Salvo automaticamente" é real) +
 * atalhos ⌘Z / ⌘⇧Z.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { QuotaExcedidaError, saveDocumento } from "@/lib/conteudo/data"
import { comHistorico } from "@/lib/conteudo/documento"
import { editorReducer, estadoInicial, podeDesfazer, podeRefazer } from "@/lib/conteudo/historico"
import type { Documento } from "@/lib/conteudo/types"

export type Patch = Partial<Documento> | ((d: Documento) => Documento)
export type SalvoStatus = "salvo" | "salvando" | "erro" | "pendente"

export function useEditor(inicial: Documento, onSalvo?: (doc: Documento) => void) {
  const [state, dispatch] = useReducer(editorReducer, inicial, estadoInicial)
  const [salvo, setSalvo] = useState<SalvoStatus>("salvo")
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoSalvo = useRef<Documento>(inicial)
  const onSalvoRef = useRef(onSalvo)
  onSalvoRef.current = onSalvo

  const doc = state.doc

  // Autosave: 600 ms depois da última mudança confirmada.
  useEffect(() => {
    if (doc === ultimoSalvo.current) return
    if (state.previewBase) return // arrastando: espera o commit
    setSalvo("pendente")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSalvo("salvando")
      try {
        await saveDocumento(doc)
        ultimoSalvo.current = doc
        setSalvo("salvo")
        setErroSalvar(null)
        onSalvoRef.current?.(doc)
      } catch (e) {
        setSalvo("erro")
        setErroSalvar(e instanceof QuotaExcedidaError ? e.message : "Não foi possível salvar localmente.")
      }
    }, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [doc, state.previewBase])

  // Snapshots por item do histórico (só desta sessão) — é o que torna o
  // "Restaurar" do painel Histórico real, não um corte na lista.
  const snapshots = useRef(new Map<string, Documento>())

  /** Mudança confirmada (entra no undo). `label` grava no Histórico. */
  const set = useCallback(
    (patch: Patch, label?: string | null) => {
      const atual = stateRef.current.doc
      const n = typeof patch === "function" ? patch(atual) : { ...atual, ...patch }
      const final = label ? comHistorico(n, label) : n
      if (label && final.historico[0]) snapshots.current.set(final.historico[0].id, final)
      dispatch({ type: "commit", doc: final })
    },
    [],
  )

  const temSnapshot = useCallback((id: string) => snapshots.current.has(id), [])
  const restaurar = useCallback((id: string) => {
    const snap = snapshots.current.get(id)
    if (!snap) return false
    const item = snap.historico.find((h) => h.id === id)
    const atual = stateRef.current.doc
    const restaurado = comHistorico({ ...snap, historico: atual.historico }, `Restaurado: ${item?.label ?? "versão anterior"}`)
    dispatch({ type: "commit", doc: restaurado })
    return true
  }, [])

  /** Mudança sem histórico (drag em andamento). */
  const preview = useCallback((patch: Patch) => {
    const atual = stateRef.current.doc
    const n = typeof patch === "function" ? patch(atual) : { ...atual, ...patch }
    dispatch({ type: "preview", doc: n })
  }, [])

  const undo = useCallback(() => dispatch({ type: "undo" }), [])
  const redo = useCallback(() => dispatch({ type: "redo" }), [])
  const replace = useCallback((d: Documento) => dispatch({ type: "replace", doc: d }), [])

  // ref sempre atual para `set`/`preview` não fecharem sobre doc velho
  const stateRef = useRef(state)
  stateRef.current = state

  // ⌘Z / ⌘⇧Z (fora de campos de texto)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = ((ev.target as HTMLElement)?.tagName || "").toLowerCase()
      if ((ev.target as HTMLElement)?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") return
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault()
        if (ev.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo])

  return {
    doc,
    set,
    preview,
    undo,
    redo,
    replace,
    podeDesfazer: podeDesfazer(state),
    podeRefazer: podeRefazer(state),
    salvo,
    erroSalvar,
    restaurar,
    temSnapshot,
  }
}
