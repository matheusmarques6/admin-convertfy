import { Clapperboard } from "lucide-react"
import { ConteudoEmBreve } from "@/components/conteudo/em-breve"

export const dynamic = "force-dynamic"

export default function ConteudoReelsPage() {
  return (
    <ConteudoEmBreve
      icon={Clapperboard}
      titulo="Reels"
      descricao="Roteiros, ganchos e cortes para vídeo curto, com a mesma base de moldes do Estúdio"
      itens={[
        "Roteiro em blocos (gancho, contexto, virada, prova, CTA) com tempo estimado por bloco",
        "Ganchos gerados pela ConvertIA a partir dos carrosséis que mais geraram leads",
        "Teleprompter e checklist de gravação para o Bruno e para a Convertfy",
      ]}
    />
  )
}
