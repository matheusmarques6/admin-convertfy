"use client"

/**
 * Estado do editor: reducer único (undo/redo + prévia) + autosave com
 * debounce no servidor (`PUT /api/conteudo/documentos/[id]`) + atalhos
 * ⌘Z / ⌘⇧Z.
 *
 * Conflito: o PUT leva o carimbo `atualizadoEm` da última versão que este
 * editor salvou/carregou. Se outro navegador salvou antes, a API devolve
 * 409 com a versão atual e o estado vira "conflito" — a UI decide entre
 * recarregar (perde o local) e sobrescrever (`force`).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { ConteudoApiError, saveDocumento } from "@/lib/conteudo/data"
import { comHistorico } from "@/lib/conteudo/documento"
import { editorReducer, estadoInicial, podeDesfazer, podeRefazer } from "@/lib/conteudo/historico"
import type { Documento } from "@/lib/conteudo/types"

export type Patch = Partial<Documento> | ((d: Documento) => Documento)
export type SalvoStatus = "salvo" | "salvando" | "erro" | "pendente" | "conflito"

export function useEditor(inicial: Documento, onSalvo?: (doc: Documento) => void) {
  const [state, dispatch] = useReducer(editorReducer, inicial, estadoInicial)
  const [salvo, setSalvo] = useState<SalvoStatus>("salvo")
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [conflito, setConflito] = useState<Documento | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoSalvo = useRef<Documento>(inicial)
  /** Carimbo da versão no servidor que este editor conhece. */
  const baseRef = useRef<string | null>(inicial.atualizadoEm)
  const forceRef = useRef(false)
  const onSalvoRef = useRef(onSalvo)
  onSalvoRef.current = onSalvo

  const doc = state.doc

  // Autosave: 600 ms depois da última mudança confirmada.
  useEffect(() => {
    if (doc === ultimoSalvo.current) return
    if (state.previewBase) return // arrastando: espera o commit
    if (salvo === "conflito" && !forceRef.current) return // espera decisão
    setSalvo("pendente")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSalvo("salvando")
      try {
        const r = await saveDocumento(doc, { baseAtualizadoEm: baseRef.current, force: forceRef.current })
        forceRef.current = false
        baseRef.current = r.atualizadoEm
        ultimoSalvo.current = doc
        setSalvo("salvo")
        setErroSalvar(null)
        setConflito(null)
        onSalvoRef.current?.({ ...doc, atualizadoEm: r.atualizadoEm })
      } catch (e) {
        if (e instanceof ConteudoApiError && e.status === 409 && e.documentoAtual) {
          setConflito(e.documentoAtual)
          setSalvo("conflito")
          setErroSalvar(e.message)
          return
        }
        setSalvo("erro")
        setErroSalvar(e instanceof Error ? e.message : "Não foi possível salvar.")
      }
    }, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, state.previewBase])

  // Snapshots por item do histórico (só desta sessão) — é o que torna o
  // "Restaurar" do painel Histórico real, não um corte na lista.
  const snapshots = useRef(new Map<string, Documento>())

  /** Mudança confirmada (entra no undo). `label` grava no Histórico. */
  const set = useCallback((patch: Patch, label?: string | null) => {
    const atual = stateRef.current.doc
    const n = typeof patch === "function" ? patch(atual) : { ...atual, ...patch }
    const final = label ? comHistorico(n, label) : n
    if (label && final.historico[0]) snapshots.current.set(final.historico[0].id, final)
    dispatch({ type: "commit", doc: final })
  }, [])

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

  /** Conflito: "recarregar" adota a versão do servidor; "sobrescrever" força o salvamento local. */
  const resolverConflito = useCallback((modo: "recarregar" | "sobrescrever") => {
    const atual = conflito
    if (modo === "recarregar" && atual) {
      baseRef.current = atual.atualizadoEm
      ultimoSalvo.current = atual
      dispatch({ type: "replace", doc: atual })
      setConflito(null)
      setSalvo("salvo")
      setErroSalvar(null)
      return
    }
    forceRef.current = true
    setConflito(null)
    setSalvo("pendente")
    // re-dispara o autosave com o doc atual
    dispatch({ type: "commit", doc: { ...stateRef.current.doc } })
  }, [conflito])

  /** Salva agora (sem esperar o debounce). */
  const salvarAgora = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const d = stateRef.current.doc
    setSalvo("salvando")
    try {
      const r = await saveDocumento(d, { baseAtualizadoEm: baseRef.current, force: forceRef.current })
      forceRef.current = false
      baseRef.current = r.atualizadoEm
      ultimoSalvo.current = d
      setSalvo("salvo")
      setErroSalvar(null)
      onSalvoRef.current?.({ ...d, atualizadoEm: r.atualizadoEm })
      return true
    } catch (e) {
      if (e instanceof ConteudoApiError && e.status === 409 && e.documentoAtual) {
        setConflito(e.documentoAtual)
        setSalvo("conflito")
      } else setSalvo("erro")
      setErroSalvar(e instanceof Error ? e.message : "Não foi possível salvar.")
      return false
    }
  }, [])

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
    conflito,
    resolverConflito,
    salvarAgora,
    restaurar,
    temSnapshot,
  }
}
