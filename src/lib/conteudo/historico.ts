/**
 * Reducer ÚNICO do documento no editor: undo/redo + prévia (drag) sem
 * poluir a pilha. O painel "Histórico" lê `doc.historico` (rótulos), a
 * pilha aqui é o estado real de desfazer/refazer.
 *
 * `preview` troca o documento sem gravar na pilha (arrastar alça); o
 * primeiro preview guarda a base, e o `commit` seguinte empilha ESSA base —
 * um arraste inteiro vira um único passo de undo.
 */

import type { Documento } from "./types"

export interface EditorState {
  doc: Documento
  past: Documento[]
  future: Documento[]
  previewBase: Documento | null
}

export type EditorAcao =
  | { type: "commit"; doc: Documento }
  | { type: "preview"; doc: Documento }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; doc: Documento }

export const MAX_UNDO = 100

export function estadoInicial(doc: Documento): EditorState {
  return { doc, past: [], future: [], previewBase: null }
}

export function editorReducer(state: EditorState, acao: EditorAcao): EditorState {
  switch (acao.type) {
    case "commit": {
      if (acao.doc === state.doc && !state.previewBase) return state
      const base = state.previewBase ?? state.doc
      const past = [...state.past, base].slice(-MAX_UNDO)
      return { doc: acao.doc, past, future: [], previewBase: null }
    }
    case "preview":
      return { ...state, doc: acao.doc, previewBase: state.previewBase ?? state.doc }
    case "undo": {
      if (!state.past.length) return state
      const anterior = state.past[state.past.length - 1]
      return {
        doc: anterior,
        past: state.past.slice(0, -1),
        future: [state.previewBase ?? state.doc, ...state.future],
        previewBase: null,
      }
    }
    case "redo": {
      if (!state.future.length) return state
      const [proximo, ...resto] = state.future
      return { doc: proximo, past: [...state.past, state.doc], future: resto, previewBase: null }
    }
    case "replace":
      return { doc: acao.doc, past: [], future: [], previewBase: null }
    default:
      return state
  }
}

export const podeDesfazer = (s: EditorState) => s.past.length > 0
export const podeRefazer = (s: EditorState) => s.future.length > 0
