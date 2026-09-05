import { Columns3 } from "lucide-react"
import { ConteudoEmBreve } from "@/components/conteudo/em-breve"

export const dynamic = "force-dynamic"

export default function ConteudoEstudioPage() {
  return (
    <ConteudoEmBreve
      icon={Columns3}
      titulo="Estúdio"
      descricao="Carrosséis que não quebram: template, IA ou inspiração, sempre dentro da marca"
      itens={["Em construção nesta etapa."]}
    />
  )
}
