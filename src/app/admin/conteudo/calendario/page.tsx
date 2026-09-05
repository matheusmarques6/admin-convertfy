import { CalendarDays } from "lucide-react"
import { ConteudoEmBreve } from "@/components/conteudo/em-breve"

export const dynamic = "force-dynamic"

export default function ConteudoCalendarioPage() {
  return (
    <ConteudoEmBreve
      icon={CalendarDays}
      titulo="Calendário"
      descricao="Cadência semanal por perfil, slots vazios e o que já foi enviado do Estúdio"
      itens={[
        "Visão semanal e mensal com os carrosséis agendados pelo Estúdio (Enviar para o calendário)",
        "Meta de cadência por perfil (3 posts do Bruno, 3 da Convertfy, 1 vídeo) com os furos destacados",
        "Melhor horário por perfil segundo os últimos 30 dias",
      ]}
    />
  )
}
