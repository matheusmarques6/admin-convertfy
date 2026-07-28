/**
 * /admin/imagens — Estúdio de Geração de Imagens.
 *
 * Página standalone (item próprio na sidebar): lotes livres de geração de
 * imagem por loja × variação, sem ligação com campanhas/tasks.
 */

import { ImageStudioView } from "@/components/image-studio/image-studio-view"

export const dynamic = "force-dynamic"

export default function ImagensPage() {
  return <ImageStudioView />
}
