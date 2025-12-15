import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, User } from "lucide-react"
import Link from "next/link"

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Perfil</h1>
          <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações da Conta
          </CardTitle>
          <CardDescription>Seus dados de acesso ao sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{user?.email || "Não disponível"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ID do Usuário</p>
            <p className="font-medium text-xs font-mono">{user?.id || "Não disponível"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Último login</p>
            <p className="font-medium">
              {user?.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString("pt-BR")
                : "Não disponível"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
