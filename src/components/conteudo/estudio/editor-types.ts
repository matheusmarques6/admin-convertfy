import type { BrandKit, DocFrame, Documento, Perfil, PerfilEditavel } from "@/lib/conteudo/types"
import type { SelImagem, SelTexto } from "./frame"
import type { Patch } from "./use-editor"

export type ModalEditor = "preview" | "exportar" | "agendar" | "brandkit"

/** Tudo que os painéis, o chat e o painel de frames precisam do editor. */
export interface EditorApi {
  doc: Documento
  set: (patch: Patch, label?: string | null) => void
  preview: (patch: Patch) => void
  setFrame: (i: number, patch: Partial<DocFrame>) => void
  ativo: number
  setAtivo: (i: number) => void
  sel: SelTexto | null
  setSel: (s: SelTexto | null) => void
  imgSel: SelImagem | null
  setImgSel: (s: SelImagem | null) => void
  setModal: (m: ModalEditor | null) => void
  avisar: (msg: string) => void
  brandKits: Record<PerfilEditavel, BrandKit> | null
  /** Perfis (canais Instagram) da org. */
  perfis: Perfil[]
  /** Perfil do documento (resolvido em `perfis`; undefined se o canal saiu). */
  perfil: Perfil | undefined
  modoTemplate: boolean
  /** Abre Ajustes → Mídia (usado pela ação "imagens" do chat). */
  abrirMidia: () => void
  /** Restaura o documento ao estado logo após o item do histórico (só itens desta sessão). */
  restaurar: (historicoId: string) => boolean
  temSnapshot: (historicoId: string) => boolean
}
