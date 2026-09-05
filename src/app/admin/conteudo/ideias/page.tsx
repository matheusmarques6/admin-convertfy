import { Lightbulb } from "lucide-react"
import { ConteudoEmBreve } from "@/components/conteudo/em-breve"

export const dynamic = "force-dynamic"

export default function ConteudoIdeiasPage() {
  return (
    <ConteudoEmBreve
      icon={Lightbulb}
      titulo="Ideias"
      descricao="Banco de pautas, provas e benchmarks para virar carrossel com um clique"
      itens={[
        "Banco de provas com fonte e data (Smile.io, Sephora, Who Gives A Crap, dados internos)",
        "Pautas sugeridas pela ConvertIA a partir do que está performando por pilar e molde",
        "Um clique leva a ideia para o Estúdio já com o molde certo",
      ]}
    />
  )
}
