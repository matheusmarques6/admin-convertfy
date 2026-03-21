import { FileQuestion, Home, ArrowLeft } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
      <Icon icon={FileQuestion} customSize={64} className="text-muted-foreground mb-6" />
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <h2 className="text-xl font-semibold mb-2">Página não encontrada</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        A página que você está procurando não existe ou foi movida.
      </p>
      <div className="flex gap-3">
        <Button variant="primary" asChild>
          <a href="/admin/dashboard">
            <Icon icon={Home} size={16} className="mr-2" />
            Ir para o Dashboard
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="javascript:history.back()">
            <Icon icon={ArrowLeft} size={16} className="mr-2" />
            Voltar
          </a>
        </Button>
      </div>
    </div>
  )
}
