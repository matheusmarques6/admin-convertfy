import { FileQuestion, Home, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
      <FileQuestion className="h-16 w-16 text-muted-foreground mb-6" />
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <h2 className="text-xl font-semibold mb-2">Página não encontrada</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        A página que você está procurando não existe ou foi movida.
      </p>
      <div className="flex gap-3">
        <Button variant="default" asChild>
          <a href="/dashboard">
            <Home className="h-4 w-4 mr-2" />
            Ir para o Dashboard
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="javascript:history.back()">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </a>
        </Button>
      </div>
    </div>
  )
}
