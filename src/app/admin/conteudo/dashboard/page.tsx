import { LayoutDashboard } from "lucide-react"
import { ConteudoEmBreve } from "@/components/conteudo/em-breve"

export const dynamic = "force-dynamic"

export default function ConteudoDashboardPage() {
  return (
    <ConteudoEmBreve
      icon={LayoutDashboard}
      titulo="Dashboard Social"
      descricao="Seguidores, alcance, leads e receita atribuída por perfil"
      itens={["Em construção nesta etapa."]}
    />
  )
}
